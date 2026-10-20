import { openStore } from '../store/open.ts'
import type { Command } from './main.ts'

/** `ui-tests status <run>`: the four states and the result; `--json` prints the run handle. */
export const status: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests status <run> [--json]\n'); return 2 }
  const store = await openStore(io.env)
  try {
    const run = await store.getRun(id)
    if (!run) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    if (args.flags.has('json')) {
      const { compiled: _compiled, hooksBundle: _hooks, ...handle } = run
      io.stdout.write(`${JSON.stringify(handle, null, 2)}\n`)
      return 0
    }
    const { states } = run
    io.stdout.write([
      `run: ${run.run}`,
      `recruitment: ${states.recruitment}`,
      `collection: ${states.collection}`,
      `verification: ${states.verification}`,
      `payment: ${states.payment}`,
      `result: ${run.result}`,
      '',
    ].join('\n'))
    return 0
  } finally { await store.close() }
}
