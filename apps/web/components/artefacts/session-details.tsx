import metadata from '../../public/sessions/sessions.json'
import { Icon } from '../icon'

type Session = (typeof metadata.sessions)[number]
const session = (id: string) => metadata.sessions.find(session => session.id === id)!
// PRD 02: UX-Lite items are transformed (response − 1) × 25; usefulness is reported on its own, then averaged.
const uxLite = (s: Session) => ({ ease: (s.uxLite.ease - 1) * 25, usefulness: (s.uxLite.usefulness - 1) * 25 })
// PRD 02: an incorrect outcome with high confidence is a disaster.
const confidentFailure = (s: Session) => s.outcome === 'incorrect' && s.confidence >= 6

function Meter({ value, of }: { value: number; of: number }) {
  return <svg className="meter" viewBox="0 0 48 4" aria-hidden="true"><rect className="meter-track" width="48" height="4" rx="2" /><rect className="meter-fill" width={48 * value / of} height="4" rx="2" /></svg>
}

/** Honest recording indicator: what is captured for this session and the consent behind it. */
export function RecordingStatus({ id = 'p3' }: { id?: string }) {
  const { consent } = session(id)
  return <p className="recording-status" aria-label="Recording and consent">
    <span className="recording-on"><Icon name="screen" size={14} />Screen: recorded · consent given</span>
    <span><Icon name="mic-off" size={14} />Voice: {consent.voice ? 'recorded · consent given' : 'not recorded · no consent'}</span>
    <span><Icon name="camera-off" size={14} />Webcam: {consent.webcam ? 'recorded · consent given' : 'not recorded · no consent'}</span>
  </p>
}

/** The ratings set the PRD defines: SEQ ease and confidence per goal, UX-Lite at the end of the run. */
export function SessionRatings({ id = 'p3', compact = false }: { id?: string; compact?: boolean }) {
  const s = session(id), lite = uxLite(s)
  return <dl className={`session-ratings ${compact ? 'compact' : ''}`}>
    <div><dt>Outcome</dt><dd className={`outcome-${s.outcome}`}>{s.outcome}{confidentFailure(s) && ' · confident failure'}</dd></div>
    <div><dt>{compact ? 'SEQ ease' : `${metadata.goal} · SEQ ease`}</dt><dd>{s.ease} of 7 <Meter value={s.ease} of={7} /></dd></div>
    <div><dt>{compact ? 'Confidence' : `${metadata.goal} · confidence`}</dt><dd>{s.confidence} of 7 <Meter value={s.confidence} of={7} /></dd></div>
    <div><dt>{compact ? 'UX-Lite, end' : 'End of run · UX-Lite'}</dt><dd>usefulness {lite.usefulness}/100 · ease {lite.ease}/100 {!compact && <Meter value={(lite.usefulness + lite.ease) / 2} of={100} />}</dd></div>
  </dl>
}
