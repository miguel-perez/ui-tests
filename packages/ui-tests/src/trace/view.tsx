/** @jsxRuntime automatic @jsxImportSource react */
// Rendered in Node under tsx, which takes the JSX mode from the tsconfig of the folder it runs in (a Next app's says `preserve`).
import type { Trace, TraceAttempt } from './build.ts'
import type { RunRow } from '../store/types.ts'
import type { TunnelRecord } from '../tunnel/types.ts'
import type { RunRecord } from '../record/schema.ts'
import { describeRevision, pendingStudyEdits, studyEditSnippet } from '../revisions.ts'
import { momentLabel } from './reel.ts'

const css = `
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;color:#1a1a1a;background:#fff}
main{max-width:860px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}h3{font-size:15px;margin:16px 0 4px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top}
code,pre{font:13px ui-monospace,monospace}pre{background:#f5f5f5;padding:8px;overflow:auto}
.uit-form{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}.uit-form input,.uit-form textarea,.uit-form select{font:inherit}
.label{display:inline-block;padding:1px 8px;border:1px solid #888;border-radius:10px;font-size:13px}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}td,th{border-color:#333}pre{background:#222}}
`

const seconds = (ms?: number) => (ms === undefined ? 'not recorded' : `${(ms / 1000).toFixed(1)} s`)
const json = (value: unknown) => JSON.stringify(value, null, 2)
const actorLabel = (run: RunRow) => `${run.rehearsal ? 'Rehearsal' : 'Study'} · ${run.actor}`

function Shell({ title, actor, children }: { title: string; actor: string; children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <main>
          <p><a href="/">ui-tests</a> · <span className="label">{actor}</span></p>
          {children}
        </main>
      </body>
    </html>
  )
}

const CODES = ['named the purpose', 'did not name it', 'no answer'] as const

/** A form that posts one revision to this viewer. Nothing else on the page writes. */
function Revise({ run, kind, children, label }: { run: string; kind: string; children?: React.ReactNode; label: string }) {
  return (
    <form className="uit-form" method="post" action={`/runs/${encodeURIComponent(run)}/revisions`}>
      <input type="hidden" name="kind" value={kind} />
      {children}
      <button type="submit">{label}</button>
    </form>
  )
}

function Attempt({ item, index, run }: { item: TraceAttempt; index: number; run: string }) {
  const { attempt, events, signals, verification } = item
  const diff = verification?.diff
  const excluded = attempt.flags.includes('excluded')
  return (
    <section id={attempt.id}>
      <h3>Attempt {index + 1}{attempt.rehearsal ? ' (rehearsal)' : ''}: {attempt.reason ?? attempt.status}{excluded ? ' (excluded: not counted, still paid)' : ''}</h3>
      {item.screener && (
        <p>
          Screener: {item.screener.matches ? 'matches the users' : `outside: ${item.screener.outside.join('; ')}`}. Fit {item.screener.fit.total} of 7: recency {item.screener.fit.recency} of 3, already doing something {item.screener.fit.solving} of 1, matters {item.screener.fit.importance} of 3.
          {' '}The screener is a gate people can game.
        </p>
      )}
      <p>Outcome: {verification?.status ?? 'not verified'}{verification?.reason ? ` (${verification.reason})` : ''}</p>
      <p>Time on the task: {seconds(item.timings.onGoalMs)}</p>
      <p>Path taken: <code>{item.path.length ? item.path.join(' → ') : 'none recorded'}</code></p>
      {item.happyPath && <p>Happy path: <code>{item.happyPath.join(' → ')}</code></p>}
      {item.impression && (
        <>
          <p>First look: “{item.impression.text}” coded <strong>{item.impression.code}</strong> by {item.impression.codedBy}.</p>
          <Revise run={run} kind="code-impression" label="Change the code">
            <input type="hidden" name="attempt" value={attempt.id} />
            <select name="code" defaultValue={item.impression.code} aria-label="Code">{CODES.map(c => <option key={c}>{c}</option>)}</select>
          </Revise>
        </>
      )}
      {!attempt.rehearsal && !excluded && attempt.reason !== 'withdrew' && (
        <Revise run={run} kind="exclude" label="Exclude (they stay paid)">
          <input type="hidden" name="attempt" value={attempt.id} />
          <input name="reason" defaultValue="not my audience" aria-label="Reason" required />
        </Revise>
      )}
      {item.path.length > 0 && !attempt.rehearsal && !excluded && verification?.status === 'correct' && (
        <Revise run={run} kind="promote-path" label="Promote this path to the task's path">
          <input type="hidden" name="goalIndex" value={attempt.goalIndex} />
          <input type="hidden" name="path" value={item.path.join('\n')} />
        </Revise>
      )}
      <p>Final URL: {item.snapshotUrl ? <code>{item.snapshotUrl}</code> : 'no end snapshot'}</p>
      {diff && (
        <table>
          <tbody>
            <tr><th>Expected</th><td><pre>{json(diff.expected)}</pre></td></tr>
            <tr><th>Actual</th><td><pre>{json(diff.actual)}</pre></td></tr>
          </tbody>
        </table>
      )}
      {item.replayTruncated && <p>The replay stops early: a page was too large to record.</p>}
      {item.replay && (
        <>
          <h4>Replay</h4>
          <div data-replay={attempt.id}>
            {/* The player is added in the browser; the events are carried as data, with `<` escaped so they cannot close the tag. */}
            <script type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ events: item.replay.map((e) => e.data), moments: item.reel.map((m) => ({ start: m.start, end: m.end, label: momentLabel(m) })) }).replace(/</g, '\\u003c') }} />
            <noscript>The replay needs JavaScript.</noscript>
          </div>
        </>
      )}
      <h4>Events</h4>
      {events.length === 0 ? <p>No events recorded.</p> : (
        <table>
          <thead><tr><th>At (ms)</th><th>Event</th><th>Target or page</th><th>Signal</th></tr></thead>
          <tbody>
            {events.map((event, i) => (
              <tr key={i}>
                <td>{event.at}</td>
                <td>{event.type}</td>
                <td><code>{event.target ?? event.url}</code></td>
                <td>{signals.filter(s => s.at === event.at && (s.url === undefined || s.url === event.url)).map(s => s.detail).join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {signals.length > 0 && (
        <>
          <h4>Signals</h4>
          <ul>{signals.map((s, i) => <li key={i}>{s.kind} at {s.at} ms: {s.detail}</li>)}</ul>
        </>
      )}
    </section>
  )
}

/** The author's trace of one run. Served only on the author's machine; never mounted in their app. */
export function TraceView({ trace, issues = [], exclusions = [], author }: { trace: Trace; issues?: RunRecord['issues']; exclusions?: RunRecord['exclusions']; author?: string }) {
  const { run, compiled } = trace
  const pending = pendingStudyEdits(trace.revisions.map(r => r.revision))
  return (
    <Shell title={`Trace · ${compiled.name}`} actor={actorLabel(run)}>
      <h1>{compiled.name}</h1>
      <p><strong>{actorLabel(run)}</strong> · run <code>{run.run}</code> · {run.result}</p>
      <p>{trace.sentence}</p>
      <p>{trace.sampleSentence}</p>
      <p><a href={`/runs/${encodeURIComponent(run.run)}/report/`}>The report as it is shared</a></p>

      {Array.isArray(run.tunnels) && run.tunnels.length > 0 && (
        <>
          <h2>Tunnels</h2>
          <table>
            <thead><tr><th>URL</th><th>Opened</th><th>Closed</th></tr></thead>
            <tbody>{(run.tunnels as TunnelRecord[]).map((t, i) => <tr key={i}><td><code>{t.url}</code></td><td>{t.openedAt}</td><td>{t.closedAt ?? 'still open, or closed when the command was killed'}</td></tr>)}</tbody>
          </table>
        </>
      )}

      <h2>Compiled from your study</h2>
      <table>
        <thead><tr><th>Field</th><th>Rule</th><th>Source</th></tr></thead>
        <tbody>{trace.derivations.map((d, i) => <tr key={i}><td>{d.field}</td><td>{d.rule}</td><td>{d.source}</td></tr>)}</tbody>
      </table>

      <h2>Scenario shown</h2>
      <p>{trace.scenario.shown || 'No task.'}</p>
      {trace.scenario.edits.length > 0 && <ul>{trace.scenario.edits.map(e => <li key={e.number}>Task {e.goalIndex + 1} wording edited by {e.by} at {e.at}: {e.text}</li>)}</ul>}
      {compiled.goals.map(goal => (
        <Revise key={goal.index} run={run.run} kind="scenario" label={`Pin the wording of “${goal.name}”`}>
          <input type="hidden" name="goalIndex" value={goal.index} />
          <textarea name="text" rows={2} cols={60} defaultValue={goal.scenario.text} aria-label={`Wording of ${goal.name}`} />
        </Revise>
      ))}

      <h2>Attempts</h2>
      {trace.attempts.length === 0 ? <p>No attempts recorded.</p> : trace.attempts.map((item, i) => <Attempt key={item.attempt.id} item={item} index={i} run={run.run} />)}
      {trace.attempts.some((item) => item.replay) && <script src="/replay.js" defer />}

      {issues.length > 0 && (
        <>
          <h2>Issues</h2>
          <p>Found from traces. Edit, merge or split them here; the originals stay in the record.</p>
          <form className="uit-form" method="post" action={`/runs/${encodeURIComponent(run.run)}/revisions`}>
            <input type="hidden" name="kind" value="issue-merge" />
            {issues.map(issue => <label key={issue.id}><input type="checkbox" name="issue" value={issue.id} /> {issue.title} ({issue.count})</label>)}
            <button type="submit">Merge the ticked issues</button>
          </form>
          {issues.map(issue => (
            <div key={issue.id}>
              <h3>{issue.title} <span className="label">{issue.count}</span></h3>
              <Revise run={run.run} kind="issue-edit" label="Edit">
                <input type="hidden" name="issue" value={issue.id} />
                <input name="title" defaultValue={issue.title} aria-label="Title" size={50} />
                <input name="suggestedChange" defaultValue={issue.suggestedChange} aria-label="Suggested change" size={50} />
              </Revise>
              {issue.participants.length > 1 && (
                <Revise run={run.run} kind="issue-split" label="Split">
                  <input type="hidden" name="issue" value={issue.id} />
                  <textarea name="groups" rows={2} cols={30} placeholder={'One line per new issue: attempt numbers, e.g. 1, 3'} aria-label="Attempts for each new issue" />
                </Revise>
              )}
            </div>
          ))}
        </>
      )}

      <h2 id="revisions">Revisions</h2>
      <p>Revision {trace.run.revision} of the run{author ? <>, made as <strong>{author}</strong></> : null}. Each change is added beside the run, with who made it; the run is not edited and any revision can be undone.</p>
      {exclusions.length > 0 && <p>{exclusions.length} {exclusions.length === 1 ? 'person' : 'people'} excluded as not the audience; they stay paid and are not counted.</p>}
      {trace.revisions.length === 0 ? <p>No revisions yet.</p> : (
        <table>
          <thead><tr><th>#</th><th>Revision</th><th>By</th><th>At</th><th /></tr></thead>
          <tbody>
            {trace.revisions.map(({ number, undone, revision }) => (
              <tr key={number}>
                <td>{number}</td>
                <td>{undone ? <s>{describeRevision(revision)}</s> : describeRevision(revision)}{undone ? ' (undone)' : ''}</td>
                <td>{revision.by}</td>
                <td>{revision.at}</td>
                <td>{!undone && revision.kind !== 'undo' && (
                  <Revise run={run.run} kind="undo" label="Undo"><input type="hidden" name="revision" value={number} /></Revise>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Revise run={run.run} kind="incentive" label="Adjust the incentive">
        <input name="minor" inputMode="numeric" placeholder="amount in minor units, e.g. 500" aria-label="Amount in minor units" required />
        <input name="currency" defaultValue="USD" size={4} aria-label="Currency" required />
      </Revise>
      {pending.length > 0 && (
        <>
          <h3>Paste into your study file</h3>
          {pending.map(edit => <div key={edit.goalIndex}><p>Task {edit.goalIndex + 1}: {compiled.goals[edit.goalIndex]?.name}</p><pre>{studyEditSnippet(edit).join('\n')}</pre></div>)}
        </>
      )}

      {trace.lint.length > 0 && (
        <>
          <h2>Lint</h2>
          <ul>{trace.lint.map((f, i) => <li key={i}>{f.severity} {f.rule}: {f.message} ({f.file}:{f.line})</li>)}</ul>
        </>
      )}
    </Shell>
  )
}

/** The list of runs in the store. */
export function RunList({ runs }: { runs: RunRow[] }) {
  return (
    <Shell title="Runs" actor="author">
      <h1>Runs</h1>
      {runs.length === 0 ? <p>No runs yet.</p> : (
        <table>
          <thead><tr><th>Run</th><th>Study</th><th>Actor</th><th>Result</th></tr></thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.run}>
                <td><a href={`/runs/${encodeURIComponent(r.run)}/`}>{r.run}</a></td>
                <td>{r.compiled.name}</td>
                <td>{actorLabel(r)}</td>
                <td>{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  )
}
