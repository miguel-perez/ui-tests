import { loadConfig } from '../config.ts'
import { StudyLoadError } from '../load.ts'
import type { UiTestsConfig } from '../types.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command } from './main.ts'

/** The minutes a participant is asked for: the task time limits added up, to a tenth of a minute (the same figure `lint` shows per task). */
const minutesOf = (seconds: number) => Math.round(seconds / 6) / 10

/** `ui-tests estimate`: how many people (n) and how many minutes each, before anything is spent. Cost per source comes with the sources (R3). */
export const estimate: Command = async (args, io) => {
  const json = args.flags.has('json')
  let loaded: Awaited<ReturnType<typeof loadStudies>>
  let config: UiTestsConfig
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, [], config)
  } catch (error) {
    io.stderr.write(`${error instanceof StudyLoadError ? error.message.replace(error.file, error.file.replace(`${io.cwd}/`, '')) : error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  const wanted = args.flags.get('study')
  const actorFlag = args.flags.get('actor')
  if (actorFlag !== undefined && actorFlag !== 'human' && actorFlag !== 'agent') { io.stderr.write('--actor must be human or agent\n'); return 2 }
  const actor = actorFlag ?? config.actor ?? 'human'
  const candidates = loaded.filter(l => (typeof wanted !== 'string' || l.compiled.name === wanted) && l.compiled.actors.includes(actor))
  if (typeof wanted === 'string' && !candidates.length) { io.stderr.write(`No study named "${wanted}"\n`); return 2 }
  if (!candidates.length) { io.stderr.write('No study found\n'); return 2 }
  if (candidates.length > 1) { io.stderr.write(`${candidates.length} studies; pass --study <name>:\n${candidates.map(l => `  ${l.compiled.name}`).join('\n')}\n`); return 2 }
  const { compiled } = candidates[0]
  const result = { n: compiled.sample.n, minutes: minutesOf(compiled.goals.reduce((sum, g) => sum + g.timeout.seconds, 0)) }
  io.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.n} people, up to ${result.minutes} minutes each. ${compiled.sample.sentence}\n`)
  return 0
}
