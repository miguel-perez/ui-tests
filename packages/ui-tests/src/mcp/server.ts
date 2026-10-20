import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { main, type Io } from '../cli/main.ts'
import { startTrace } from '../cli/trace.ts'
import { readableRecord } from '../consumers.ts'
import { runRecordSchema } from '../record/schema.ts'
import { openStore } from '../store/open.ts'

type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }
const text = (body: string, isError = false): Result => ({ content: [{ type: 'text', text: body }], ...(isError && { isError }) })
const failure = (message: string) => text(JSON.stringify({ error: { message: message.trim() } }), true)

/** Runs one CLI command in-process with its output captured, so a tool and the command it names run the same code. */
async function cli(io: Io, argv: string[]) {
  let out = ''
  let err = ''
  const code = await main(argv, { ...io, stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) } })
  return { code, out, err }
}

/** A command's JSON on stdout becomes the tool's result unchanged; exit 2, or output that is not JSON, is an error carrying the command's diagnostics. */
async function tool(io: Io, argv: string[]): Promise<Result> {
  const { code, out, err } = await cli(io, argv)
  try {
    JSON.parse(out)
  } catch { return failure(err || out || `ui-tests ${argv[0]} exited ${code}`) }
  return text(out.trim(), code === 2)
}

const flag = (name: string, value: string | number | undefined) => value === undefined ? [] : [`--${name}`, String(value)]
const run = z.string().min(1).describe('The run id, r_ followed by a ULID')

/**
 * The CLI as MCP tools: `lint`, `estimate`, `run`, `status`, `verify`, `report` and `trace`. Each tool runs the command of the same name in this
 * process and returns the JSON the command prints with `--json`, so the server adds no capability the CLI lacks and bypasses no guard.
 * It returns no hooks, expected answers or participant identity (the commands print none), serves the trace on the loopback address only,
 * and gives a consumer the words and recordings of people who agreed to that use and no others.
 */
export function createMcpServer(io: Io): McpServer {
  const server = new McpServer({ name: 'ui-tests', version: '0.0.0' })
  const traces = new Map<string, { url: string; close(): Promise<void> }>()
  let traceStore: Awaited<ReturnType<typeof openStore>> | undefined

  server.registerTool('lint', {
    description: 'Check the study files against the rules and show what a run would do. Same JSON as `ui-tests lint --json`.',
    inputSchema: { files: z.array(z.string()).optional().describe('Study files relative to the project; default every *.ui.test.ts') },
  }, ({ files }) => tool(io, ['lint', ...(files ?? []), '--json']))

  server.registerTool('estimate', {
    description: 'How many people (n) and how many minutes each, before anything is spent. Same JSON as `ui-tests estimate --json`.',
    inputSchema: { study: z.string().optional().describe('The study name when the project has several'), actor: z.enum(['human', 'agent']).optional() },
  }, ({ study, actor }) => tool(io, ['estimate', '--json', ...flag('study', study), ...flag('actor', actor)]))

  server.registerTool('run', {
    description: 'Make a run and return its handle (idempotent on the key). A human run returns the invite links; an agent run executes its trials and returns the capability-test report. `actor` is required; a run has one actor.',
    inputSchema: {
      actor: z.enum(['human', 'agent']).describe('Who the run is for; there is no "both"'),
      key: z.string().optional().describe('The idempotency key; a repeated key returns the existing run'),
      study: z.string().optional().describe('The study name when the project has several'),
      deadlineHours: z.number().positive().optional().describe('Hours until the deadline; default 48'),
    },
  }, ({ actor, key, study, deadlineHours }) => tool(io, actor === 'agent'
    ? ['--actor', 'agent', '--json', ...flag('key', key), ...flag('study', study)]
    : ['recruit', '--actor', 'human', '--json', ...flag('key', key), ...flag('study', study), ...flag('deadline', deadlineHours)]))

  server.registerTool('status', {
    description: 'The run handle with its four states and result. Same JSON as `ui-tests status <run> --json`.',
    inputSchema: { run },
  }, ({ run }) => tool(io, ['status', run, '--json']))

  server.registerTool('verify', {
    description: 'Run the hooks against the stored snapshots and return each attempt\'s verdict. Same JSON as `ui-tests verify <run> --json`.',
    inputSchema: { run },
  }, ({ run }) => tool(io, ['verify', run, '--json']))

  server.registerTool('report', {
    description: 'The run record. People\'s words and recordings are left out for anyone who did not agree to the requested `use`.',
    inputSchema: {
      run,
      use: z.enum(['words', 'recordings', 'workflow']).describe('What the consumer will do with it: read the words, watch the recordings, or hand the record to an automated workflow'),
    },
  }, async ({ run, use }) => {
    const { code, out, err } = await cli(io, ['report', run, '--json'])
    if (code !== 0) return failure(err || out)
    return text(JSON.stringify(readableRecord(runRecordSchema.parse(JSON.parse(out)), use), null, 2))
  })

  server.registerTool('trace', {
    description: 'Serve the trace of a run on this machine and return its loopback URL. The viewer never listens on another address.',
    inputSchema: { run },
  }, async ({ run }) => {
    let started = traces.get(run)
    if (!started) {
      traceStore ??= await openStore(io.env)
      started = await startTrace(io, traceStore, run)
      if (!started) return failure(`No such run: ${run}`)
      traces.set(run, started)
    }
    return text(JSON.stringify({ run, url: started.url }))
  })

  const close = server.server.onclose
  server.server.onclose = () => {
    close?.()
    void Promise.all([...traces.values()].map(t => t.close())).then(() => traceStore?.close())
    traces.clear()
  }
  return server
}
