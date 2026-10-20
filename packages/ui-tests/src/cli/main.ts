import type { Screenshotter } from '../runner/screenshot.ts'
import type { Tunnel } from '../tunnel/types.ts'
import { dev } from './dev.ts'
import { host } from './host.ts'
import { init } from './init.ts'
import { lintCommand } from './lint.ts'
import { recruit } from './recruit.ts'
import { status } from './status.ts'
import { trace } from './trace.ts'
import { verify } from './verify.ts'

/** Things a command reaches outside the process for, replaced in tests: opening a browser, taking a screenshot, stopping, polling. */
export type CliDeps = {
  openUrl?: (url: string) => void | Promise<void>
  /** Takes a screenshot of a page; the default drives Chromium, tests pass a stub. */
  screenshot?: (url: string) => Promise<Uint8Array | undefined>
  /** Takes the first-look picture of the start page when a run is made; the default drives Chromium, tests pass a stub. */
  screenshotter?: Screenshotter
  /** Ends a command that otherwise runs until Ctrl-C. */
  signal?: AbortSignal
  pollMs?: number
  /** The clock `recruit --wait` reads for the deadline. */
  now?: () => Date
  fetch?: typeof fetch
  /** What `recruit --tunnel` opens; the default is cloudflared, or the fake when `UI_TESTS_TUNNEL=fake`. */
  tunnel?: Tunnel
}
export type Io = { stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown }; cwd: string; env: Record<string, string | undefined>; deps?: CliDeps }
export type Args = { positionals: string[]; flags: Map<string, string | true> }
export type Command = (args: Args, io: Io) => Promise<number>

const notShipped = (name: string): Command => async (_args, io) => {
  io.stderr.write(`${name}: not shipped yet\n`)
  return 2
}

/** Commands by name; `''` is dev mode (no command given). Later tasks replace the placeholders and add `report`. */
export const commands: Record<string, Command> = {
  init,
  lint: lintCommand,
  '': dev,
  verify,
  status,
  trace,
  host,
  recruit,
  check: notShipped('check'),
  estimate: notShipped('estimate'),
  mcp: notShipped('mcp'),
}

export const usage = () => `Usage: ui-tests <command> [options]

Commands:
  (none)            rehearse a study on yourself: open the player, verify, show the trace
  verify <run>      run the hooks against the stored snapshots
  recruit           make a run and print the invite links (--wait for the result, --tunnel to serve a local build)
  status <run>      show the four states of a run
  trace <run>       serve the trace of a run on this machine
  init              write ui-tests.config.ts, an example study and the Vitest exclude
  lint [files...]   check studies against the rules and show what a run would do
  host              deploy the collector, the player and the store to your own account

Options:
  --json            write JSON to stdout; diagnostics go to stderr
  --help            show this text
`

const commandUsage: Record<string, string> = {
  lint: 'Usage: ui-tests lint [files...] [--json]\n\nChecks each study against the rules, prints what a run would do, and exits 1 on an error finding or 2 when a file cannot load.\n',
}

const defaultIo = (): Io => ({ stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(), env: process.env })

/** The flags each command reads a value for (`--actor agent` or `--actor=agent`); every other flag is a boolean. */
export const valueFlags: Record<string, string[]> = {
  '': ['actor', 'port', 'project', 'study', 'task'], trace: ['port'], host: ['panel'], recruit: ['actor', 'key', 'deadline', 'study'], check: ['actor', 'key'], estimate: ['actor'],
}

/** Splits `--flag`, `--flag=value` and, for flags the command declares, `--flag value`. */
export function parseArgs(argv: string[]): Args {
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  const command = argv[0] === undefined || argv[0].startsWith('--') ? '' : argv[0]
  const valued = valueFlags[command] ?? []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
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
