import { checkSentence, buildLine, ranked, legend, caveat, problemsLine, type CheckRun, type Impact } from 'ui-tests/check'
import { run, attempt, short, typical, endedLabel, type Attempt } from './attempts'
import { problems, worked, runFacts } from './copy'

/**
 * WhatComesBack (docs/design/site-schema.md): the check, its page and the report, all from the run's data. The report's rows come
 * from the problems' moments (who hit it, x of n) and are ranked by impact, then by how many people hit them; the check is built
 * by `ui-tests/check` from the same rows, so the landing's check page and the one GitHub shows say the same thing.
 */
export type Moment = { person: number; seconds: number }
export type Finding = {
  id: string; rank: number | null; title: string; impact: Impact | 'worked'; page: string; locator: string; playwright: string
  people: number[]; moments: Moment[]; quote?: { text: string; who: string }; change?: string
}

export const total = run.attempts.length
const hits = (moments: readonly (readonly [number, number])[]) => [...new Set(moments.map(([person]) => person))].sort((a, b) => a - b)
const toMoments = (moments: readonly (readonly [number, number])[]) => moments.map(([person, seconds]) => ({ person, seconds }))
const order = ranked(problems.map((problem, index) => ({ title: problem.title, people: hits(problem.moments).length, impact: problem.impact as Impact, index })))
/** The problems in the run's rank, each with its anchor on the report. */
export const findings: Finding[] = order.map(({ index }, i) => {
  const problem = problems[index]
  return { id: `problem-${i + 1}`, rank: i + 1, title: problem.title, impact: problem.impact, page: problem.page, locator: problem.locator, playwright: problem.playwright, people: hits(problem.moments), moments: toMoments(problem.moments), quote: problem.quote, change: problem.change }
})
/** What worked: the last row, without an impact or a change. */
export const workedRow: Finding = { id: 'worked', rank: null, title: worked.title, impact: 'worked', page: worked.page, locator: worked.locator, playwright: worked.playwright, people: hits(worked.moments), moments: toMoments(worked.moments) }
export const rows = [...findings, workedRow]

export const reached = run.attempts.filter(entry => entry.reached === 'yes').length
/** On a goal with a check: pressed Done, but the check failed (the checked-goal form of wrong and sure). */
export const pressedDoneFailed = run.attempts.filter(entry => entry.reached === 'no' && entry.ended === 'done').length
/** How many people hit at least one problem. */
export const seenBy = new Set(findings.flatMap(finding => finding.people)).size
export const panelOf = (entry: Attempt) => runFacts.panels[entry.number]
const panels = [...new Set(run.attempts.map(panelOf))]
/** "paid panel (Prolific, CloudResearch Connect)": the source with its panels named, on first use. */
export const source = `paid panel (${panels.join(', ')})`

export const reportPath = `/r/${run.run}`
export const reportUrl = `${runFacts.host}${reportPath}`
export const attemptPath = (person: number) => `${reportPath}/p${person}`
/** A moment on the report: the problem's anchor and the second to play from, as the check's links carry it. */
export const momentHash = (finding: Finding, moment: Moment) => `#${finding.id}&t=${moment.seconds}`

/** The run as the check reports it. */
export const exampleCheck: CheckRun = {
  goal: run.goal, people: total, attempted: total, reached, pressedDoneFailed,
  problems: findings.map(finding => ({ title: finding.title, page: finding.page, locator: finding.locator, people: finding.people.length, impact: finding.impact as Impact, moment: { ...finding.moments[0], url: `${reportUrl}${momentHash(finding, finding.moments[0])}` } })),
  reportUrl,
  footer: { people: `${total} people · ${source}`, preview: runFacts.preview, commit: runFacts.commit, date: run.date },
}
/** The check page's first paragraph: the sentence, and that the check never fails the build. */
export const checkLead = `${checkSentence(exampleCheck)} ${buildLine()}`

/** The report's one line for the result. */
export const result = {
  reached: `Reached the goal: ${reached} of ${total}`,
  problems: problemsLine({ people: total, seenBy, problems: findings }).replace(/\.$/, ''),
  failed: pressedDoneFailed ? `Pressed Done, but your check failed: ${pressedDoneFailed} of ${total}` : '',
}
export { legend, caveat }

/** One person in the people strip: reached or not, time, ease and how it ended, linking to their attempt. */
export const people = run.attempts.map(entry => ({ number: entry.number, person: entry.person, reached: entry.reached === 'yes', time: short(entry.time), ease: entry.ease, ended: endedLabel[entry.ended], href: attemptPath(entry.number) }))

const environment = [...new Set(run.attempts.map(entry => `${entry.device.toLowerCase()} ${entry.browser}, ${entry.window}`))].join('; ')
/** The closing line: the study-wide answers, the first look, who took part, the environment and the caveat. */
export const closing = {
  afterGoal: [['would it help them', typical(run.attempts.map(entry => entry.afterGoals.help))], ['easy to use', typical(run.attempts.map(entry => entry.afterGoals.easy))]] as const,
  firstLook: [['named the purpose', runFacts.firstLook.named], ['first click on your path', runFacts.firstLook.firstClick]] as const,
  whoTookPart: `${total} people from a ${source}, ${runFacts.screened}`,
  environment,
}

/** The clip a moment plays: the person's whole recording from that second, for nine seconds or to the end of the attempt. */
export function clip(moment: Moment) {
  const entry = attempt(`p${moment.person}`)
  return { video: entry.video, from: moment.seconds, to: Math.min(entry.time + 1, moment.seconds + 9) }
}
