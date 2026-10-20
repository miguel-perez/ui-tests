/** @jsxRuntime automatic @jsxImportSource react */
// Rendered in Node under tsx as well as inside a Next app, so the JSX mode is stated here.
import { canRead } from '../consumers.ts'
import type { CSSProperties, ReactNode } from 'react'
import { topThree } from '../issues.ts'
import type { RunRecord } from '../record/schema.ts'

type Attempt = RunRecord['attempts'][number]
type Issue = RunRecord['issues'][number]

export type ReportViewProps = {
  /** The privacy-stripped run record; nothing else about the run reaches this view. */
  record: RunRecord
  /** With an index (0-based, the same order as `record.attempts`), the page of that one person instead of the whole report. */
  attemptIndex?: number
  /** Where the report lives, without a trailing slash: `/r/<run>` for a shared link. */
  base?: string
  /** Turns a path into the link to follow: a signed link inside a signed report. The default leaves it as it is. */
  link?: (path: string) => string
  /** The recording of the person's attempt, on their page. */
  replay?: ReactNode
  /** The moment of the recording the page was opened at, in the recording's clock. */
  moment?: number
}

export const reportCss = `
.uit-report{--uit-ink:#1a1a1a;--uit-dim:#4a4a4a;--uit-line:#d6d6d6;--uit-ground:#ffffff;--uit-card:#f6f6f6;--uit-link:#0a4fa3;--uit-accent:#4a4a4a;
max-width:860px;margin:0 auto;padding:24px 16px 64px;font:16px/1.55 system-ui,sans-serif;color:var(--uit-ink);background:var(--uit-ground)}
.uit-report h1{font-size:26px;line-height:1.25;margin:0 0 4px}.uit-report h2{font-size:19px;margin:32px 0 8px}.uit-report h3{font-size:16px;margin:0 0 4px}
.uit-report a{color:var(--uit-link);text-decoration:underline}.uit-report .uit-dim{color:var(--uit-dim)}
.uit-report .uit-result{font-size:18px;border-left:4px solid var(--uit-accent);padding-left:12px;margin:16px 0}
.uit-report ol.uit-list,.uit-report ul.uit-list{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.uit-report .uit-card{background:var(--uit-card);border:1px solid var(--uit-line);border-radius:8px;padding:12px 16px}
.uit-report dl{margin:8px 0 0;display:grid;grid-template-columns:max-content 1fr;gap:2px 12px}.uit-report dt{color:var(--uit-dim)}.uit-report dd{margin:0}
.uit-report blockquote{margin:2px 0;padding-left:10px;border-left:2px solid var(--uit-line)}
.uit-report .uit-chip{display:inline-block;margin:2px 6px 2px 0;padding:2px 10px;border:1px solid var(--uit-link);border-radius:999px}
.uit-report table{border-collapse:collapse;width:100%}.uit-report th,.uit-report td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--uit-line);vertical-align:top}
@media (prefers-color-scheme:dark){.uit-report{--uit-ink:#ececec;--uit-dim:#b4b4b4;--uit-line:#3a3a3a;--uit-ground:#161616;--uit-card:#202020;--uit-link:#8ab8f0;--uit-accent:#b4b4b4}}
`

/**
 * Whether a person's words and recording may be shown: they agreed to analysis by the author, their source puts no restriction on it, and
 * they have not withdrawn. The record carries what each person agreed to so that every reader makes this check.
 */
export const mayShow = (attempt: Attempt): boolean =>
  canRead(attempt, 'recordings') && attempt.reason !== 'withdrew'

const identity = (path: string) => path
const colour = (value: string | undefined) => (value && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value) ? value : undefined)
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`
const seconds = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s` : `${(ms / 1000).toFixed(1)} s`)
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

/** How the attempt ended, in plain words. */
function ending(attempt: Attempt): string {
  if (attempt.reason === 'done') return attempt.verification?.status === 'correct' ? 'reached the outcome' : attempt.verification?.status === 'incorrect' ? 'said they were done; the outcome was not reached' : 'said they were done; the outcome is not checked yet'
  if (attempt.reason === 'gave up') return 'said they could not do it'
  if (attempt.reason === 'timeout') return 'ran out of time'
  if (attempt.reason === 'withdrew') return 'withdrew'
  if (attempt.reason === 'disconnected') return 'lost the connection'
  return attempt.status === 'finished' ? 'finished' : 'had not finished'
}

const FIRST_LOOK: Record<Attempt['firstLook'], string> = {
  asked: 'asked',
  'never asked': 'never asked: the picture of the page could not be taken, so no question was put',
  off: 'not part of this study',
  pending: 'not reached yet',
}

/** The shared report of a run, or with `attemptIndex` the page of one person. White-labelled: it carries the author's name and the host's accent, and no ui-tests name unless the study turned it on. */
export function ReportView({ record, attemptIndex, base, link = identity, replay, moment }: ReportViewProps) {
  const { compiled } = record
  const root = base ?? `/r/${record.handle.run}`
  const accent = colour(compiled.brand.accent)
  // People are numbered by participant, in the order they first appear; the page of an attempt is `p<n>` by attempt.
  const people = [...new Set(record.attempts.map((attempt) => attempt.participant))]
  const who = new Map(people.map((participant, i) => [participant, i + 1]))
  const person = (participant: string) => `Person ${who.get(participant) ?? '?'}`
  const personOf = (attempt: Attempt) => who.get(attempt.participant) ?? 0
  const index = new Map(record.attempts.map((attempt, i) => [attempt.id, i + 1]))
  const shownTo = new Map(people.map((participant) => [participant, record.attempts.filter((a) => a.participant === participant).every(mayShow)]))
  const attemptById = new Map(record.attempts.map((attempt) => [attempt.id, attempt]))
  const attemptLink = (n: number) => link(`${root}/p${n}`)
  // `at` goes after the signature's own parameters, so the signature (of the path alone) is unaffected by it.
  const momentLink = (attemptId: string, at: number) => {
    const n = index.get(attemptId)
    return n === undefined ? undefined : `${attemptLink(n)}${attemptLink(n).includes('?') ? '&' : '?'}at=${at}`
  }

  const header = (
    <header>
      <h1>{compiled.name}</h1>
      <p className="uit-dim">
        {compiled.author ? `By ${compiled.author} · ` : ''}{compiled.product} · {record.actor === 'agent' ? 'capability test, not usability' : plural(compiled.sample.n, 'person', 'people')}
      </p>
    </header>
  )
  const footer = compiled.brand.poweredBy ? <p className="uit-dim">Powered by ui-tests</p> : null
  const style = accent ? ({ '--uit-accent': accent } as CSSProperties) : undefined

  if (attemptIndex !== undefined) {
    const attempt = record.attempts[attemptIndex]!
    const goal = compiled.goals[attempt.goalIndex]
    const ease = attempt.answers[`goal${attempt.goalIndex}.ease`]
    const withheld = !mayShow(attempt)
    return (
      <main className="uit-report" style={style}>
        <style dangerouslySetInnerHTML={{ __html: reportCss }} />
        {header}
        <p><a href={link(root)}>Back to the report</a></p>
        <h2>Person {personOf(attempt)}{goal ? ` · ${goal.name}` : ''}</h2>
        {attempt.reason === 'withdrew' ? <p>This person withdrew. Their recording and answers were deleted.</p> : (<>
        <dl>
          <dt>Ending</dt><dd>{ending(attempt)}</dd>
          {attempt.timings.onGoalMs !== undefined && <><dt>Time on the task</dt><dd>{seconds(attempt.timings.onGoalMs)}</dd></>}
          {typeof ease === 'number' && !withheld && <><dt>Ease</dt><dd>{ease} of 7</dd></>}
          <dt>First look</dt><dd>{FIRST_LOOK[attempt.firstLook]}</dd>
          <dt>Pages visited</dt><dd>{attempt.path.length ? attempt.path.join(' → ') : 'none recorded'}</dd>
          {attempt.rehearsal && <><dt>Kind</dt><dd>rehearsal; not counted</dd></>}
        </dl>
        {withheld && <p>This person did not agree to their words and recording being shown here, so they are not.</p>}
        {!withheld && moment !== undefined && <p role="status">Opened at the moment {clock(moment)} into the recording.</p>}
        {!withheld && (replay ?? <p className="uit-dim">No recording was kept for this person.</p>)}
        </>)}
        {footer}
      </main>
    )
  }

  const { impression, measures } = record
  const reached = Object.values(measures.byGoal)
  const worked = [
    ...compiled.goals.flatMap((goal) => {
      const goalMeasure = measures.byGoal[String(goal.index)]
      return goalMeasure && goalMeasure.effectiveness.reached > 0
        ? [`${goalMeasure.effectiveness.reached} of ${goalMeasure.effectiveness.n} ${goalMeasure.effectiveness.n === 1 ? 'person' : 'people'} reached the outcome of “${goal.name}”.`]
        : []
    }),
    ...(impression.named > 0 ? [`${impression.named} of ${impression.denominator} named the purpose of the first page.`] : []),
    ...(impression.firstClickOnPath.onPath > 0 ? [`${impression.firstClickOnPath.onPath} of ${impression.firstClickOnPath.of} first clicks were on the expected route.`] : []),
    ...record.issues.filter((issue) => issue.recovered.length > 0).map((issue) => `${plural(issue.recovered.length, 'person', 'people')} still reached the outcome after: ${issue.title}`),
  ]
  const top = new Set(compiled.goals.flatMap((goal) => topThree(record.issues, goal.index)))
  const listed = record.issues.filter((issue) => top.has(issue))
  const hidden = record.issues.length - listed.length
  const seen = record.attempts.map((attempt, i) => ({ attempt, n: i + 1 })).filter(({ attempt }) => attempt.status !== 'created')

  return (
    <main className="uit-report" style={style}>
      <style dangerouslySetInnerHTML={{ __html: reportCss }} />
      {header}
      <p className="uit-result">{record.sentence}</p>
      {compiled.sample.sentence !== record.sentence && <p className="uit-dim">{compiled.sample.sentence}</p>}

      <section aria-labelledby="uit-first">
        <h2 id="uit-first">Fit and first look</h2>
        <p>{record.fit.summary}</p>
        {compiled.impression.on || impression.neverAsked > 0 ? (
          <>
            <p>{compiled.impression.question} {impression.denominator > 0
              ? `${impression.named} named the purpose, ${impression.didNot} did not name it, ${impression.noAnswer} gave no answer.`
              : 'Nobody has answered yet.'}</p>
            {impression.neverAsked > 0 && <p>Never asked of {plural(impression.neverAsked, 'person', 'people')}: the picture of the page could not be taken, so no question was put. This is not the same as no answer.</p>}
            <p className="uit-dim">{impression.limits}</p>
          </>
        ) : <p className="uit-dim">The study has no first look.</p>}
      </section>

      <section aria-labelledby="uit-measures">
        <h2 id="uit-measures">Measures</h2>
        <table>
          <caption className="uit-dim">Effectiveness, efficiency and satisfaction for each task, and the fit of the people</caption>
          <thead><tr><th scope="col">Task</th><th scope="col">Effectiveness</th><th scope="col">Efficiency</th><th scope="col">Satisfaction</th></tr></thead>
          <tbody>
            {compiled.goals.map((goal) => {
              const m = measures.byGoal[String(goal.index)]
              if (!m) return null
              const ease = m.satisfaction.ease
              return (
                <tr key={goal.index}>
                  <th scope="row">{goal.name}</th>
                  <td>{m.effectiveness.reached} of {m.effectiveness.n} reached the outcome{m.effectiveness.unknown > 0 ? `; ${m.effectiveness.unknown} not known` : ''}</td>
                  <td>{m.efficiency.medianVerifiedMs !== undefined ? `median ${seconds(m.efficiency.medianVerifiedMs)}` : m.efficiency.medianAllMs !== undefined ? `median ${seconds(m.efficiency.medianAllMs)}` : 'no time yet'}</td>
                  <td>{ease.length ? `ease ${ease.join(', ')} of 7` : 'no ratings yet'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p>
          Satisfaction with {compiled.product}: {measures.satisfaction.uxLite.mean !== undefined ? `${measures.satisfaction.uxLite.mean} of 100 from ${plural(measures.satisfaction.uxLite.n, 'person', 'people')}` : 'no ratings yet'}.
          {' '}Fit: {measures.fit.summary.mean !== undefined ? `${measures.fit.summary.mean} of ${measures.fit.summary.outOf} from ${plural(measures.fit.summary.n, 'person', 'people')}` : 'nobody screened yet'}.
        </p>
        {reached.length === 0 && <p className="uit-dim">No task has been measured yet.</p>}
      </section>

      <section aria-labelledby="uit-issues">
        <h2 id="uit-issues">{record.issues.length === 0 ? 'Problems' : 'Problems, most serious first'}</h2>
        {record.issues.length > 0 && (
          <p className="uit-dim">
            The three most serious problems for each task are named{hidden > 0 ? `; ${plural(hidden, 'more is', 'more are')} in the record` : ''}.
          </p>
        )}
        {record.issues.length === 0 && <p>No problem was seen in the people counted so far.</p>}
        <ol className="uit-list">
          {listed.map((issue: Issue, i) => {
            const words = issue.words.filter((w) => shownTo.get(w.participant) !== false)
            return (
              <li key={issue.id} className="uit-card">
                <h3>{i + 1}. {issue.title}</h3>
                <dl>
                  <dt>Where</dt><dd>{issue.where.page}{issue.where.element ? `, ${issue.where.element}` : ''}{issue.where.step !== undefined ? `, step ${issue.where.step + 1}` : ''}</dd>
                  <dt>Who</dt><dd>{issue.count}: {issue.participants.map(person).join(', ')} ({issue.impact})</dd>
                  {words.length > 0 && <><dt>Their words</dt><dd>{words.map((w) => <blockquote key={w.participant}>“{w.text}” <span className="uit-dim">{person(w.participant)}</span></blockquote>)}</dd></>}
                  {issue.moments.length > 0 && (
                    <><dt>Moments</dt><dd>{issue.moments.map((m, k) => {
                      const owner = attemptById.get(m.attempt)
                      const href = owner && mayShow(owner) ? momentLink(m.attempt, m.at) : undefined
                      return href && owner ? <a key={k} className="uit-chip" href={href}>Play moment {k + 1}, {person(owner.participant)}</a> : null
                    })}</dd></>
                  )}
                  <dt>Suggested change</dt><dd>{issue.suggestedChange}</dd>
                </dl>
              </li>
            )
          })}
          <li className="uit-card" aria-labelledby="uit-worked">
            <h3 id="uit-worked">What worked</h3>
            {worked.length === 0 ? <p>Nothing to report yet.</p> : <ul>{worked.map((line, i) => <li key={i}>{line}</li>)}</ul>}
          </li>
        </ol>
      </section>

      <section aria-labelledby="uit-people">
        <h2 id="uit-people">People</h2>
        {record.exclusions.length > 0 && <p>{plural(record.exclusions.length, 'person', 'people')} excluded by the author as not the audience. They are not counted, and they were still paid.</p>}
        {record.revisionLog.some(r => !r.undone) && <p className="uit-dim">The author has revised this report {plural(record.revisionLog.length, 'time')}; the original attempts are unchanged. Revision {record.handle.revision}.</p>}
        {record.quality.withdrawn > 0 && <p>{plural(record.quality.withdrawn, 'person')} withdrew and their recordings were deleted, so this report cannot be reproduced in full.</p>}
        {seen.length === 0 ? <p>Nobody has started yet.</p> : (
          <ul className="uit-list">
            {seen.map(({ attempt, n }) => (
              <li key={attempt.id}><a href={attemptLink(n)}>Person {personOf(attempt)}</a> <span className="uit-dim">· {compiled.goals[attempt.goalIndex]?.name ?? 'task'} · {ending(attempt)}{attempt.flags.includes('excluded') ? ' · excluded, still paid' : ''}</span></li>
            ))}
          </ul>
        )}
      </section>
      {footer}
    </main>
  )
}
