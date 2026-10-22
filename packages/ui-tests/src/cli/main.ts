import type { LocalPackage } from '../agents/pack.ts'
import type { GitHubClient } from '../github/types.ts'
import type { TextModel } from '../model.ts'
import type { Tunnel } from '../tunnel/types.ts'
import { check } from './check.ts'
import { dev } from './dev.ts'
import { host } from './host.ts'
import { estimate } from './estimate.ts'
import { init } from './init.ts'
import { lintCommand } from './lint.ts'
import { mcp } from './mcp.ts'
import { recruit } from './recruit.ts'
import { report } from './report.ts'
import { serve } from './serve.ts'
import { status } from './status.ts'
import { trace } from './trace.ts'
import { verify } from './verify.ts'

/** Things a command reaches outside the process for, replaced in tests: opening a browser, taking a screenshot, stopping, polling. */
export type CliDeps = {
  openUrl?: (url: string) => void | Promise<void>
  /** Takes a screenshot of a page; the default drives Chromium, tests pass a stub. */
  screenshot?: (url: string) => Promise<Uint8Array | undefined>
  /** The model `lint -u` drafts the screener with; the default is the author's own, from `ANTHROPIC_API_KEY`. */
  model?: TextModel
  /** Ends a command that otherwise runs until Ctrl-C. */
  signal?: AbortSignal
  pollMs?: number
  /** The clock `recruit --wait` reads for the deadline. */
  now?: () => Date
  fetch?: typeof fetch
  /** What `recruit --tunnel` opens; the default is cloudflared, or the fake when `UI_TESTS_TUNNEL=fake`. */
  tunnel?: Tunnel
  /** How long `recruit --tunnel` waits for the tunnel's address to answer; the default is two minutes. */
  tunnelWaitMs?: number
  /** The GitHub `check` talks to; the default is the REST API with `GITHUB_TOKEN`. */
  github?: GitHubClient
  /** Packs the local package for agent cli trials; the default runs `npm pack` once per run, tests pass a stub. */
  packLocal?: () => Promise<LocalPackage | undefined>
  /** The first wait before the webhook is retried; it doubles each time. */
  webhookBackoffMs?: number
}
export type Io = { stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown }; cwd: string; env: Record<string, string | undefined>; deps?: CliDeps }
export type Args = { positionals: string[]; flags: Map<string, string | true> }
export type Command = (args: Args, io: Io) => Promise<number>

/** Commands by name; `''` is dev mode (no command given). Later tasks replace the placeholders and add `report`. */
export const commands: Record<string, Command> = {
  init,
  lint: lintCommand,
  '': dev,
  verify,
  status,
  report,
  trace,
  host,
  recruit,
  check,
  estimate,
  mcp,
  serve,
}

export const usage = () => `Usage: ui-tests <command> [options]

Commands:
  (none)            rehearse a study on yourself: open the player on the ui-tests server (started for you on this
                    machine when none answers), verify, show the trace
  --actor agent     run the study's tasks as agent trials: a capability test, not usability
  verify <run>      run the hooks against the stored snapshots
  recruit           make a run and print the invite links to the player on the ui-tests server (--wait for the result,
                    --tunnel to serve a local build, --host <name> for links inside your network, --local for this machine only;
                    --tunnel and --host serve the app and the ui-tests server through one front door on this machine)
  status <run>      show the four states of a run
  check             post the pull request check for a preview (--reconcile updates the open ones)
  report <run>      the report in words, the run record (--json), or a signed link to share (--share)
  trace <run>       serve the trace of a run on this machine
  init              write ui-tests.config.ts, an example study and the Vitest exclude, and print the script tag for your app
  estimate          how many people and how many minutes each, before anything is spent (--out <file> also writes the JSON)
  mcp               serve lint, estimate, run, status, verify, report and trace as MCP tools over stdio
  lint [files...]   check studies against the rules and show what a run would do (-u drafts or updates each study's
                    screener snapshot, <study file>.screener.snap; --out <file> also writes the JSON)
  host              deploy the collector, the player and the store to your own account
  serve             serve the collector, the player, the report and the tag's script while a study is open
                    (--port <n>, --bind <addr>; UI_TESTS_PUBLIC_URL is the address people reach it at)

Options:
  --json            write JSON to stdout; diagnostics go to stderr
  --help            show this text
`

const commandUsage: Record<string, string> = {
  lint: 'Usage: ui-tests lint [files...] [-u] [--json] [--out <file>]\n\nChecks each study against the rules, prints what a run would do, and exits 1 on an error finding or 2 when a file cannot load. -u drafts or updates each study\'s screener snapshot (<study file>.screener.snap) with your model (ANTHROPIC_API_KEY) and names what it could not draft. --out writes the JSON to a file as well.\n',
}

const defaultIo = (): Io => ({ stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(), env: process.env })

/** The flags each command reads a value for (`--actor agent` or `--actor=agent`); every other flag is a boolean. */
export const valueFlags: Record<string, string[]> = {
  '': ['actor', 'port', 'project', 'study', 'task', 'key', 'commit'], trace: ['port'], host: ['panel'], recruit: ['actor', 'key', 'deadline', 'study', 'pr', 'commit', 'host'], check: ['actor', 'key', 'study'], estimate: ['actor', 'study', 'out'], lint: ['out'], serve: ['port', 'bind'],
}

/** Splits `--flag`, `--flag=value` and, for flags the command declares, `--flag value`. */
export function parseArgs(argv: string[]): Args {
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  const command = argv[0] === undefined || argv[0].startsWith('--') ? '' : argv[0]
  const valued = valueFlags[command] ?? []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-u') { flags.set('update', true); continue }
    if (!arg.startsWith('--')) { positionals.push(arg); continue }
    const [name, ...value] = arg.slice(2).split('=')
    if (value.length) flags.set(name, value.join('='))
    else if (valued.includes(name) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) flags.set(name, argv[++i])
    else flags.set(name, true)
  }
  return { positionals, flags }
}

/** Runs one CLI invocation and returns its exit code: 0 ok, 1 findings, 2 error. */
export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  const args = parseArgs(argv)
  const [name, ...rest] = args.positionals
  if (args.flags.has('help') || name === 'help') { io.stdout.write(name && name !== 'help' && commandUsage[name] ? commandUsage[name] : usage()); return 0 }
  const command = Object.hasOwn(commands, name ?? '') ? commands[name ?? ''] : undefined
  if (!command || (name !== undefined && name === '')) {
    io.stderr.write(`Unknown command: ${name}\n\n${usage()}`)
    return 2
  }
  try { return await command({ positionals: rest, flags: args.flags }, io) } catch (error) {
    io.stderr.write(`${name}: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}
