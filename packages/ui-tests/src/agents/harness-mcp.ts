import { mkdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { absolutePath, splitWords, trialEnv, which } from './harness-cli.ts'
import type { Harness, ToolSpec } from './model.ts'
import { diffFiles, fingerprintFiles, makeTempWorkspace, removeWorkspace, workspaceAt } from './workspace.ts'

/** How long one tool call may take. */
export const MCP_TIMEOUT_MS = 60_000
/** How much of a tool's answer the agent is shown. */
export const MCP_OUTPUT_CAP = 64 * 1024

export type McpHarnessOptions = {
  /** Where relative paths in the configured command (`./server.mjs`) point; the project directory. Default: the process's. */
  cwd?: string
  timeoutMs?: number
  outputCap?: number
  /** The environment the allowed names are taken from. Default: the process's. */
  env?: Record<string, string | undefined>
}

/** Names the loop uses to end a trial; a server tool called one of these is offered as `mcp__<name>`. */
const RESERVED = new Set(['done', 'give_up', 'cannot'])
/** The last of the server's stderr kept to explain a start that failed. */
const STDERR_TAIL = 2000

const message = (error: unknown) => error instanceof Error ? error.message : String(error)

type Content = { type: string; text?: string; mimeType?: string; resource?: { text?: string; uri?: string } }

/** A tool answer as text: its text blocks, with a note for anything that is not text. */
function textOf(content: unknown, structured: unknown): string {
  const parts = (Array.isArray(content) ? content as Content[] : []).map(block => {
    if (block.type === 'text') return block.text ?? ''
    if (block.type === 'resource') return block.resource?.text ?? `[resource ${block.resource?.uri ?? ''}]`
    return `[${block.type}${block.mimeType ? ` ${block.mimeType}` : ''} not shown]`
  })
  if (!parts.length && structured !== undefined) parts.push(JSON.stringify(structured))
  return parts.join('\n')
}

/**
 * The mcp harness: it starts the configured server (`target.mcp`, a command) as a child process over stdio in a fresh directory
 * per trial, and the server's own tools become the agent's tools. Nothing else is offered and any other name is refused. The
 * server's environment is the cli harness's: PATH, locale and terminal, with HOME, TMPDIR and the XDG directories inside the
 * trial, and nothing of the operator's credentials. The trial directory is the end state a hook reads as `workspace`.
 */
export function mcpHarness(command: string, options: McpHarnessOptions = {}): Harness {
  const base = options.cwd ?? process.cwd()
  const configured = splitWords(command)
  if (!configured.length) throw new Error('The mcp target has no command')
  const env = options.env ?? process.env
  const path = absolutePath(env.PATH)
  const timeoutMs = options.timeoutMs ?? MCP_TIMEOUT_MS
  const cap = options.outputCap ?? MCP_OUTPUT_CAP
  const program = which(configured[0], path, base) ?? configured[0]
  const args = configured.slice(1).map(word => /^\.\.?\//.test(word) ? resolve(base, word) : word)
  let trial: { root: string; work: string; client: Client; transport: StdioClientTransport } | undefined
  let offered: ToolSpec[] = []
  let readOnly = new Set<string>()
  /** Offered name -> the server's own name, for the tools renamed because the loop uses their name. */
  let renamed = new Map<string, string>()
  let effects: string[] = []
  let before = new Map<string, string>()

  async function stop() {
    const current = trial
    trial = undefined
    offered = []
    readOnly = new Set()
    renamed = new Map()
    if (!current) return
    await current.client.close().catch(() => {})
    removeWorkspace(current.root)
  }

  async function start() {
    const root = realpathSync(makeTempWorkspace())
    const dirs = { work: join(root, 'work'), home: join(root, 'home'), tmp: join(root, 'tmp') }
    for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
    // The transport adds HOME, SHELL, USER and LOGNAME from the operator's environment under what it is given: the last three are blanked.
    const childEnv = { ...trialEnv(env, dirs), SHELL: '', USER: '', LOGNAME: '' }
    const transport = new StdioClientTransport({ command: program, args, cwd: dirs.work, env: childEnv, stderr: 'pipe' })
    let stderr = ''
    transport.stderr?.on('data', (chunk: Buffer) => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-STDERR_TAIL) })
    const listedNames = new Map<string, string>()
    const client = new Client({ name: 'ui-tests', version: '0.0.0' })
    try {
      await client.connect(transport, { timeout: timeoutMs })
      const listed: ToolSpec[] = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, { timeout: timeoutMs })
        for (const tool of page.tools) {
          const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] }
          const offeredAs = RESERVED.has(tool.name) ? `mcp__${tool.name}` : tool.name
          if (offeredAs !== tool.name) listedNames.set(offeredAs, tool.name)
          listed.push({ name: offeredAs, description: tool.description ?? '', input: { type: 'object', properties: schema.properties ?? {}, ...(schema.required && { required: schema.required }) } })
          if (tool.annotations?.readOnlyHint) readOnly.add(offeredAs)
        }
        cursor = page.nextCursor
      } while (cursor)
      offered = listed
      renamed = listedNames
    } catch (error) {
      await client.close().catch(() => {})
      removeWorkspace(root)
      readOnly = new Set()
      const said = stderr.trim()
      throw new Error(`The mcp server \`${command}\` did not start: ${message(error)}${said ? `\nIts stderr ended: ${said}` : ''}`)
    }
    trial = { root, work: dirs.work, client, transport }
    before = fingerprintFiles(dirs.work)
    effects = []
  }

  return {
    tools: () => offered,
    async call(name, input) {
      const current = trial
      if (!current || !offered.some(tool => tool.name === name)) return { output: '', error: `called ${name}, which is not a tool of this server` }
      const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
      try {
        const result = await current.client.callTool({ name: renamed.get(name) ?? name, arguments: args }, undefined, { timeout: timeoutMs })
        const text = textOf(result.content, result.structuredContent)
        const output = text.length > cap ? `${text.slice(0, cap)}\n[output cut at ${cap} characters]` : text
        if (result.isError) return { output, error: `called ${name}, which failed${text.trim() ? `: ${text.trim().split('\n')[0]!.slice(0, 160)}` : ''}` }
        if (!readOnly.has(name)) effects.push(`called ${name}`)
        return { output }
      } catch (error) {
        const timedOut = /timed out/i.test(message(error))
        return { output: '', error: timedOut ? `called ${name}, which took longer than ${Math.round(timeoutMs / 1000)} s` : `called ${name}, which failed: ${message(error)}` }
      }
    },
    async endState() {
      if (!trial) return { sideEffects: [] }
      return { workspace: workspaceAt(trial.work), sideEffects: [...effects, ...diffFiles(before, fingerprintFiles(trial.work))] }
    },
    async reset() {
      await stop()
      await start()
    },
    async dispose() { await stop() },
  }
}
