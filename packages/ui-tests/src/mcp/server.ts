import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { main, type Io } from '../cli/main.ts'
import { canRead, readableRecord } from '../consumers.ts'
import { runRecordSchema, type RunRecord } from '../record/schema.ts'
import { openStore } from '../store/open.ts'
import { buildTrace } from '../trace/build.ts'

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
  let parsed: unknown
  try { parsed = JSON.parse(out) } catch { return failure(err || out || `ui-tests ${argv[0]} exited ${code}`) }
  // Exit 1 (findings, problems found, a failed trial) and 3 (pending) carry a result; exit 2, or an error object, is an error.
  const errored = code === 2 || (typeof parsed === 'object' && parsed !== null && 'error' in parsed)
  return text(out.trim(), errored)
}

const flag = (name: string, value: string | number | undefined) => value === undefined ? [] : [`--${name}`, String(value)]
const run = z.string().min(1).describe('The run id, r_ followed by a ULID')

/**
 * The CLI as MCP tools: `lint`, `estimate`, `run`, `status`, `verify`, `report` and `trace`. Each tool runs the command of the same name in this
 * process and returns the JSON the command prints with `--json`, so the server adds no capability the CLI lacks and bypasses no guard.
 * It returns no hooks, expected answers or participant identity (the commands print none), starts no server, and as an automated-workflow
 * consumer gives the words and recordings of people who agreed to share the record with a workflow and no others.
 */
export function createMcpServer(io: Io): McpServer {
  const server = new McpServer({ name: 'ui-tests', version: '0.0.0' })

  server.registerTool('lint', {
    description: 'Check the study files against the rules and show what a run would do. Same JSON as `ui-tests lint --json`. With `update`, first draft or update each study\'s screener snapshot (`ui-tests lint -u`) for the author to review and commit; what could not be drafted is named.',
    inputSchema: {
      files: z.array(z.string()).optional().describe('Study files relative to the project; default every *.ui.test.ts'),
      update: z.boolean().optional().describe('Draft or update the <study file>.screener.snap of each study first'),
    },
  }, ({ files, update }) => tool(io, ['lint', ...(files ?? []), ...(update ? ['-u'] : []), '--json']))

  server.registerTool('estimate', {
    description: 'How many people (n) and how many minutes each, before anything is spent. Same JSON as `ui-tests estimate --json`.',
    inputSchema: { study: z.string().optional().describe('The study name when the project has several'), actor: z.enum(['human', 'agent']).optional() },
  }, ({ study, actor }) => tool(io, ['estimate', '--json', ...flag('study', study), ...flag('actor', actor)]))

  server.registerTool('run', {
    description: 'Make a run and return its handle (idempotent on the key). A human run returns the invite links; an agent run executes its trials before it answers (this call blocks until they finish; it can take minutes) and returns the capability-test report. `actor` is required; a run has one actor.',
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

  /** The record as an automated workflow may read it: words and recordings only of people who agreed to share the record with one. */
  const gatedRecord = async (run: string): Promise<{ error: string } | { record: RunRecord; withheld: number }> => {
    const { code, out, err } = await cli(io, ['report', run, '--json'])
    if (code !== 0) return { error: err || out }
    const record = runRecordSchema.parse(JSON.parse(out))
    const withheld = record.attempts.filter(a => a.status !== 'created' && !canRead(a, 'workflow')).length
    return { record: readableRecord(record, 'workflow'), withheld }
  }

  server.registerTool('report', {
    description: 'The run record. This server is an automated-workflow consumer: the words and recordings of an attempt are returned only when that person agreed to share the record with an automated workflow; `withheld` counts the attempts left out.',
    inputSchema: { run },
  }, async ({ run }) => {
    const gated = await gatedRecord(run)
    return 'error' in gated ? failure(gated.error) : text(JSON.stringify({ ...gated.record, withheld: gated.withheld }, null, 2))
  })

  server.registerTool('trace', {
    description: 'The trace of a run as data, under the same purposes gate as `report`: the record, with each readable attempt\'s signals. It starts no server and returns no link to the full viewer; open that yourself with `ui-tests trace <run>`.',
    inputSchema: { run },
  }, async ({ run }) => {
    const gated = await gatedRecord(run)
    if ('error' in gated) return failure(gated.error)
    const store = await openStore(io.env)
    try {
      const { attempts } = await buildTrace(store, run)
      const open = new Set(gated.record.attempts.filter(a => canRead(a, 'workflow')).map(a => a.id))
      const signals = attempts.filter(t => open.has(t.attempt.id)).map(t => ({ attempt: t.attempt.id, path: t.path, signals: t.signals }))
      return text(JSON.stringify({ run, record: gated.record, withheld: gated.withheld, attempts: signals }, null, 2))
    } finally { await store.close() }
  })

  return server
}
