/** @jsxRuntime automatic @jsxImportSource react */
// Rendered in Node under tsx, which takes the JSX mode from the tsconfig of the folder it runs in (a Next app's says `preserve`).
import type { Trace, TraceAttempt } from './build.ts'
import type { RunRow } from '../store/types.ts'

const css = `
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;color:#1a1a1a;background:#fff}
main{max-width:860px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}h3{font-size:15px;margin:16px 0 4px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top}
code,pre{font:13px ui-monospace,monospace}pre{background:#f5f5f5;padding:8px;overflow:auto}
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

function Attempt({ item, index }: { item: TraceAttempt; index: number }) {
  const { attempt, events, signals, verification } = item
  const diff = verification?.diff
  return (
    <section>
      <h3>Attempt {index + 1}{attempt.rehearsal ? ' (rehearsal)' : ''}: {attempt.reason ?? attempt.status}</h3>
      <p>Outcome: {verification?.status ?? 'not verified'}{verification?.reason ? ` (${verification.reason})` : ''}</p>
      <p>Time on the task: {seconds(item.timings.onGoalMs)}</p>
      <p>Path taken: <code>{item.path.length ? item.path.join(' → ') : 'none recorded'}</code></p>
      {item.happyPath && <p>Happy path: <code>{item.happyPath.join(' → ')}</code></p>}
      <p>Final URL: {item.snapshotUrl ? <code>{item.snapshotUrl}</code> : 'no end snapshot'}</p>
      {diff && (
        <table>
          <tbody>
            <tr><th>Expected</th><td><pre>{json(diff.expected)}</pre></td></tr>
            <tr><th>Actual</th><td><pre>{json(diff.actual)}</pre></td></tr>
          </tbody>
        </table>
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
export function TraceView({ trace }: { trace: Trace }) {
  const { run, compiled } = trace
  return (
    <Shell title={`Trace · ${compiled.name}`} actor={actorLabel(run)}>
      <h1>{compiled.name}</h1>
      <p><strong>{actorLabel(run)}</strong> · run <code>{run.run}</code> · {run.result}</p>
      <p>{trace.sentence}</p>
      <p>{trace.sampleSentence}</p>

      <h2>Compiled from your study</h2>
      <table>
        <thead><tr><th>Field</th><th>Rule</th><th>Source</th></tr></thead>
        <tbody>{trace.derivations.map((d, i) => <tr key={i}><td>{d.field}</td><td>{d.rule}</td><td>{d.source}</td></tr>)}</tbody>
      </table>

      <h2>Scenario shown</h2>
      <p>{trace.scenario.shown || 'No task.'}</p>
      {trace.scenario.edits.length > 0 && <ul>{trace.scenario.edits.map((e, i) => <li key={i}>{e.at}{e.author ? ` · ${e.author}` : ''}{e.note ? `: ${e.note}` : ''}</li>)}</ul>}

      <h2>Attempts</h2>
      {trace.attempts.length === 0 ? <p>No attempts recorded.</p> : trace.attempts.map((item, i) => <Attempt key={item.attempt.id} item={item} index={i} />)}

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
