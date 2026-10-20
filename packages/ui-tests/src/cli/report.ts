import { loadConfig } from '../config.ts'
import { buildRecord } from '../record/build.ts'
import type { RunRecord } from '../record/schema.ts'
import { signPath } from '../report/sign.ts'
import { refreshRun } from '../runner/progress.ts'
import { openStore } from '../store/open.ts'
import type { Command } from './main.ts'

/** The record in words: the result line, the problems ranked, and what worked. */
export function reportText(record: RunRecord): string {
  const lines = [record.sentence, record.compiled.sample.sentence, record.fit.summary]
  if (record.issues.length) {
    lines.push('', 'Problems, most serious first:')
    record.issues.forEach((issue, i) => lines.push(`${i + 1}. ${issue.title} (${issue.count}, ${issue.impact}) at ${issue.where.page}${issue.where.element ? `, ${issue.where.element}` : ''}`, `   ${issue.suggestedChange}`))
  }
  const reached = Object.entries(record.measures.byGoal).filter(([, m]) => m.effectiveness.reached > 0)
  if (reached.length) {
    lines.push('', 'What worked:')
    for (const [index, m] of reached) lines.push(`- ${m.effectiveness.reached} of ${m.effectiveness.n} reached the outcome of "${record.compiled.goals[Number(index)]?.name ?? 'the task'}"`)
  }
  return lines.join('\n')
}

/**
 * `ui-tests report <run>`: with `--json`, the run record on stdout and nothing else there; without it, the report in words.
 * With `--share`, the link to the report page, signed under `UI_TESTS_SHARE_SECRET`; without the secret there are no share links.
 */
export const report: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests report <run> [--json] [--share]\n'); return 2 }
  const secret = io.env.UI_TESTS_SHARE_SECRET
  if (args.flags.has('share') && !secret) { io.stderr.write('set UI_TESTS_SHARE_SECRET to create share links\n'); return 2 }
  const store = await openStore(io.env)
  try {
    const run = await store.getRun(id)
    if (!run) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    if (args.flags.has('share')) {
      const url = `${run.target.replace(/\/+$/, '')}/r/${run.run}?sig=${signPath(`/r/${run.run}`, secret!)}`
      io.stdout.write(args.flags.has('json') ? `${JSON.stringify({ url })}\n` : `${url}\n`)
      return 0
    }
    await refreshRun(store, id, io.deps?.now?.())
    const currency = await loadConfig(io.cwd).then(c => c.config.participants?.budget?.currency, () => undefined)
    const record = await buildRecord(store, id, { ...(currency && { currency }) })
    io.stdout.write(args.flags.has('json') ? `${JSON.stringify(record, null, 2)}\n` : `${reportText(record)}\n`)
    return 0
  } finally { await store.close() }
}
