/** @jsxRuntime automatic @jsxImportSource react */
// Rendered in Node under tsx, which takes the JSX mode from the tsconfig of the folder it runs in (a Next app's says `preserve`).
import type { RunRecord } from '../record/schema.ts'

export const AGENT_HEADING = 'capability test, not usability'

const css = `
body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px 16px;color:#1a1a1a;background:#fff}
main{max-width:860px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:4px 8px;border-bottom:1px solid #e3e3e3;vertical-align:top}
.label{display:inline-block;padding:1px 8px;border:1px solid #888;border-radius:10px;font-size:13px}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}td,th{border-color:#333}}
`

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/**
 * An agent run's report, at its own address (`/agent-runs/<run>` in the local viewer). It labels the actor and says what the run is,
 * then gives each task's trials as a table: state, time, what stopped it in one line, and the link to its trace.
 * It is never part of a human report, and nothing in it counts people.
 */
export function AgentReport({ record, base = '' }: { record: RunRecord; base?: string }) {
  const { compiled, handle } = record
  const trials = record.trials ?? []
  return (
    <main>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <p><span className="label">agent</span> · {AGENT_HEADING}</p>
      <h1>{compiled.name}</h1>
      <p>{record.sentence}</p>
      <p>Run <code>{handle.run}</code> · result {handle.result} · {record.passK ? 'pass^k: every trial verified' : 'pass^k: not every trial verified'} · pass@k: {record.passAtK ? 'at least one verified' : 'none verified'}</p>
      {compiled.goals.map(goal => {
        const mine = trials.filter(t => t.goalIndex === goal.index)
        if (!mine.length) return null
        return (
          <section key={goal.index}>
            <h2>{goal.name}</h2>
            <table>
              <thead><tr><th>Trial</th><th>State</th><th>Time</th><th>What stopped it</th><th>Trace</th></tr></thead>
              <tbody>
                {mine.map(t => (
                  <tr key={t.attempt}>
                    <td>{t.index}</td>
                    <td>{t.state}{t.claimedDone && t.state === 'stopped' ? ' (said it was done)' : ''}</td>
                    <td>{seconds(t.wallMs)}</td>
                    <td>{t.stoppedBy ?? t.infrastructure ?? ''}</td>
                    <td><a href={`${base}/runs/${encodeURIComponent(handle.run)}/#${t.attempt}`}>Trace</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
      <p>{record.evidenceStatement}</p>
    </main>
  )
}
