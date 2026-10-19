import { host } from './host.ts'
import { init } from './init.ts'
import { lintCommand } from './lint.ts'

export type Io = { stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown }; cwd: string; env: Record<string, string | undefined> }
export type Args = { positionals: string[]; flags: Map<string, string | true> }
export type Command = (args: Args, io: Io) => Promise<number>

const notShipped = (name: string): Command => async (_args, io) => {
  io.stderr.write(`${name}: not shipped yet\n`)
  return 2
}

/** Commands by name; later tasks replace the placeholders and add `''` (dev mode), `verify`, `status`, `trace`, `report`. */
export const commands: Record<string, Command> = {
  init,
  lint: lintCommand,
  host,
  recruit: notShipped('recruit'),
  check: notShipped('check'),
  estimate: notShipped('estimate'),
  mcp: notShipped('mcp'),
}

export const usage = () => `Usage: ui-tests <command> [options]

Commands:
  init              write ui-tests.config.ts, an example study and the Vitest exclude
  lint [files...]   check studies against the rules and show what a run would do
  host              deploy the collector, the player and the store to your own account

Options:
  --json            write JSON to stdout; diagnostics go to stderr
  --help            show this text
`

const defaultIo = (): Io => ({ stdout: process.stdout, stderr: process.stderr, cwd: process.cwd(), env: process.env })

/** Splits `--flag`, `--flag value` is not supported: flags are booleans or `--flag=value`. */
export function parseArgs(argv: string[]): Args {
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [name, ...value] = arg.slice(2).split('=')
      flags.set(name, value.length ? value.join('=') : true)
    } else positionals.push(arg)
  }
  return { positionals, flags }
}

/** Runs one CLI invocation and returns its exit code: 0 ok, 1 findings, 2 error. */
export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  const args = parseArgs(argv)
  const [name, ...rest] = args.positionals
  if (args.flags.has('help') || name === 'help') { io.stdout.write(usage()); return 0 }
  const command = name === undefined ? undefined : Object.hasOwn(commands, name) ? commands[name] : undefined
  if (!command) {
    io.stderr.write(`${name === undefined ? 'No command given' : `Unknown command: ${name}`}\n\n${usage()}`)
    return 2
  }
  try { return await command({ positionals: rest, flags: args.flags }, io) } catch (error) {
    io.stderr.write(`${name}: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
}
