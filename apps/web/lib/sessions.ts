import metadata from '../public/sessions/sessions.json'

export type Session = (typeof metadata.sessions)[number]
export type Moment = Session['moments'][number] & { at?: number[]; issue?: number; note?: string }
export const run = metadata
export const session = (id: string) => metadata.sessions.find(entry => entry.id === id)!
/** PRD 02: UX-Lite items are transformed (response − 1) × 25; usefulness is reported on its own. */
export const uxLite = (s: Session) => ({ ease: (s.uxLite.ease - 1) * 25, usefulness: (s.uxLite.usefulness - 1) * 25 })
/** PRD 02: an incorrect outcome with high confidence is a disaster. */
export const confidentFailure = (s: Session) => s.outcome === 'incorrect' && s.confidence >= 6
export const seconds = (timestamp: string) => { const [m, s] = timestamp.split(':').map(Number); return m * 60 + s }
export const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`

/** One kind of moment, one colour (results-views audit, rule 1). The moment hue is reserved for the moments a problem was found at. */
export const kinds: Record<string, { label: string; signal?: 'deviation' | 'dead' | 'pause' | 'done' }> = {
  start: { label: 'start' }, click: { label: 'click' }, type: { label: 'type' }, press: { label: 'press' },
  pause: { label: 'pause', signal: 'pause' }, deviation: { label: 'deviation', signal: 'deviation' }, backtrack: { label: 'backtrack', signal: 'deviation' },
  'dead-click': { label: 'dead click', signal: 'dead' }, 'gave-up': { label: 'gave up', signal: 'dead' }, done: { label: 'done', signal: 'done' },
}
/** How long a moment lasts on the scrubber: a pause carries its length in its detail; every other moment is a short pin. */
export function span(moment: Moment) { const pause = /(\d+) s/.exec(moment.detail); return moment.kind === 'pause' && pause ? Number(pause[1]) : 1.2 }
