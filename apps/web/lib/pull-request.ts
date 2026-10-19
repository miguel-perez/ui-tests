import { checkSentence, buildLine, ranked, type CheckRun, type Impact } from './check'
import { run, type Attempt } from './attempts'
import { problems, runFacts } from './copy'

/**
 * WhatComesBack (docs/design/site-schema.md): the check and its page, from the run's data. The report's rows come
 * from the problems' moments (who hit it, x of n) and are ranked by impact, then by how many people hit them; the check is built
 * by `lib/check.ts` from the same rows.
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
export const reached = run.attempts.filter(entry => entry.reached === 'yes').length
/** On a goal with a check: pressed Done, but the check failed (the checked-goal form of wrong and sure). */
export const pressedDoneFailed = run.attempts.filter(entry => entry.reached === 'no' && entry.ended === 'done').length
export const panelOf = (entry: Attempt) => runFacts.panels[entry.number]
const panels = [...new Set(run.attempts.map(panelOf))]
/** "paid panel (Prolific, CloudResearch Connect)": the source with its panels named, on first use. */
export const source = `paid panel (${panels.join(', ')})`

export const reportPath = `/r/${run.run}`
export const reportUrl = `${runFacts.host}${reportPath}`
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
