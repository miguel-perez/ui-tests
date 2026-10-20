import { userInfo } from 'node:os'
import { loadConfig } from '../config.ts'
import { lint, type LintFinding } from '../lint.ts'
import { openStore } from '../store/open.ts'
import type { RunRow } from '../store/types.ts'
import { serveTrace } from '../trace/serve.ts'
import { reporterFor } from './outward.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command, Io } from './main.ts'

/** An abort signal that fires on Ctrl-C. */
export function interrupt(): AbortSignal {
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort())
  return controller.signal
}

/** The lint findings of the studies under cwd, looked up by a run's study name; empty when the studies cannot be loaded. */
export async function lintFor(io: Io): Promise<(run: RunRow) => LintFinding[]> {
  try {
    const config = withProduct((await loadConfig(io.cwd)).config)
    const found = new Map<string, LintFinding[]>()
    for (const { study, compiled, sourceText } of await loadStudies(io.cwd, [], config)) found.set(compiled.name, lint({ study, compiled, sourceText, config }))
    return run => found.get(run.compiled.name) ?? []
  } catch { return () => [] }
}

/** Who revisions made in the viewer are attributed to: the config's `author`, else the person running this command. */
async function authorOf(io: Io): Promise<string> {
  try { const { author } = (await loadConfig(io.cwd)).config; if (typeof author === 'string' && author.trim()) return author.trim() } catch { /* fall through */ }
  return io.env.USER || userInfo().username
}

const pause = (signal: AbortSignal) => new Promise<void>(resolve => (signal.aborted ? resolve() : signal.addEventListener('abort', () => resolve(), { once: true })))

/** `ui-tests trace <run>`: serves the trace on this machine, opens it and runs until Ctrl-C. */
export const trace: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests trace <run> [--port <port>] [--no-open]\n'); return 2 }
  const store = await openStore(io.env)
  try {
    if (!(await store.getRun(id))) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    const port = args.flags.get('port')
    const author = await authorOf(io)
    const server = await serveTrace({ store, lint: await lintFor(io), author, onResult: reporterFor(io), ...(typeof port === 'string' && { port: Number(port) }) })
    const url = `${server.url}/runs/${encodeURIComponent(id)}/`
    io.stdout.write(`Trace: ${url}\n`)
    if (!args.flags.has('no-open')) await (io.deps?.openUrl ?? openUrl)(url)
    await pause(io.deps?.signal ?? interrupt())
    await server.close()
    return 0
  } finally { await store.close() }
}

export { pause }

/** Opens a URL with the platform's opener. */
export async function openUrl(url: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  const [command, ...rest] = process.platform === 'darwin' ? ['open', url] : process.platform === 'win32' ? ['cmd', '/c', 'start', '""', url] : ['xdg-open', url]
  spawn(command, rest, { stdio: 'ignore', detached: true }).on('error', () => {}).unref()
}
