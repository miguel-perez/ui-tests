import type { CSSProperties } from 'react'
import { runs } from '../../lib/copy'

type Run = { date: string; participants: string; status: string; progress: number; result: string; band: string; name: string }
/** Run: one row of the dashboard. Fixed fields first (date, participants, status, headline result), the run's name last. */
function RunRow({ date, participants, status, progress, result, band, name }: Run) {
  return <tr>
    <td className="num">{date}</td>
    <td className="num"><span>{participants}</span>{status === 'running' && <span className="run-progress" style={{ '--progress': progress } as CSSProperties} aria-label={`${Math.round(progress * 100)}% of people in`} role="img" />}</td>
    <td><span className="status-chip" data-status={status}>{status}</span></td>
    <td>{result ? <><span>{result}</span>{band && <span className="band-chip" data-band={band}>{band}</span>}</> : <span className="empty">—</span>}</td>
    <td className="run-name">{name}</td>
  </tr>
}

/**
 * Dashboard: the level above one run, as a plain table and not tiles (results-views audit, rule 4): one row per run with a muted status
 * chip, one headline result with its band colour (Maze's bands), and a thin progress bar only where a run is still collecting.
 */
export function Dashboard({ rows = runs, title = 'ui-tests.com · weekboard' }: { rows?: readonly Run[]; title?: string }) {
  return <section className="window dashboard" data-artefact="dashboard" aria-label="Runs">
    <div className="window-chrome"><span className="window-title">{title}</span><span className="example-label">Example run</span></div>
    <div className="dashboard-scroll" tabIndex={0} role="region" aria-label="Runs table"><table>
      <thead><tr><th scope="col" className="num">Date</th><th scope="col" className="num">People</th><th scope="col">Status</th><th scope="col">Result</th><th scope="col">Run</th></tr></thead>
      <tbody>{rows.map(row => <RunRow key={row.name} {...row} />)}</tbody>
    </table></div>
  </section>
}
