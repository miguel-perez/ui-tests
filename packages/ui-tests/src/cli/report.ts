import { buildRecord } from '../record/build.ts'
import { refreshRun } from '../runner/progress.ts'
import { openStore } from '../store/open.ts'
import type { Command } from './main.ts'

/** `ui-tests report <run>`: with `--json`, the run record on stdout and nothing else there; without it, the sentence. */
export const report: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests report <run> [--json]\n'); return 2 }
  const store = await openStore(io.env)
  try {
    if (!(await store.getRun(id))) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    await refreshRun(store, id, io.deps?.now?.())
    const record = await buildRecord(store, id)
    io.stdout.write(args.flags.has('json') ? `${JSON.stringify(record, null, 2)}\n` : `${record.sentence}\n`)
    return 0
  } finally { await store.close() }
}
