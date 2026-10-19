/**
 * Cursor Follies (issue #75): cartoon cursors on the landing act out the four problems ui-tests finds, each ending in its own exit,
 * and a visitor who clicks one in trouble catches the problem. This is the troupe's pure part: the waves, the stages as data, the
 * keep-out test, the spot finder, the stage gating and the casting rule. Nothing here touches the DOM, so vitest covers it without a
 * browser (tests/follies.test.ts); `components/cursor-follies.tsx` draws and directs from it.
 */

/**
 * The four problems the report finds, as the troupe acts them out. Issue #75 names the third with the old word for it; here it is
 * "went back", issue #22's word, as everywhere on the site (tests/vocabulary.ts).
 */
export type Fate = 'hesitation' | 'rage click' | 'went back' | 'long pause'
export type Exit = 'confusion' | 'frustration' | 'hook' | 'spinner'
export type Rect = { x: number; y: number; w: number; h: number }

/** Each fate's cartoon exit: a cloud of `?`, a pop into shards, the vaudeville cane, the spinner's vortex. */
export const exitOf: Record<Fate, Exit> = { hesitation: 'confusion', 'rage click': 'frustration', 'went back': 'hook', 'long pause': 'spinner' }
export const exits: readonly Exit[] = ['confusion', 'frustration', 'hook', 'spinner']

/**
 * A part of a stage: the first element inside it that matches `sel`, or the one `at` an index (a negative index counts from the end).
 * With no `sel` the part is the stage's own children, so `{ at: -1 }` is its last child.
 */
export type Part = { sel?: string; at?: number }
/**
 * A stage: a real element already on the page and the parts the cursor plays on. Hesitation swings between `a` and `b`, a rage click
 * presses `btn`, going back runs between `back` and `btn`, a long pause clicks the end of `btn` and waits.
 */
export type Stage = { fate: Fate; sel: string; parts: Record<string, Part> }

/** The stages, in the issue's order. The hero has one of each fate, so a visitor who never scrolls sees every exit. */
export const stages: readonly Stage[] = [
  { fate: 'hesitation', sel: '.hero-copy', parts: { a: { sel: '.button.primary' }, b: { sel: '.fineprint' } } },
  { fate: 'rage click', sel: '.site-header .nav-links', parts: { btn: { sel: 'a' } } },
  { fate: 'went back', sel: '.hero-artefact .terminal-body', parts: { back: { sel: '.terminal-rank', at: 0 }, btn: { sel: '.terminal-rank', at: -1 } } },
  { fate: 'long pause', sel: '.hero-artefact .window-chrome', parts: { btn: { sel: '.window-title' } } },
  { fate: 'hesitation', sel: '.compilation [role="tablist"]', parts: { a: { sel: '[role="tab"]', at: 1 }, b: { sel: '[role="tab"]', at: 2 } } },
  { fate: 'rage click', sel: '.replay-clip', parts: { btn: { sel: '.replay-play' } } },
  { fate: 'went back', sel: '.replay-rail', parts: { back: { sel: 'li[data-at="0"] i' }, btn: { sel: 'li[data-at="63"] i' } } },
  { fate: 'long pause', sel: '.host-window', parts: { btn: { sel: '.host-term .k' } } },
  { fate: 'rage click', sel: '.pr-chk', parts: { btn: { sel: 'a' } } },
  { fate: 'hesitation', sel: '.pr-links', parts: { a: { sel: '.pr-link', at: 0 }, b: { sel: '.pr-link', at: -1 } } },
  { fate: 'hesitation', sel: '.ch-actions', parts: { a: { sel: '.quiet' }, b: { sel: '.pri' } } },
  { fate: 'rage click', sel: '.lines-window .window-chrome', parts: { btn: { sel: '.copy-control' } } },
  { fate: 'rage click', sel: '#link-row', parts: { btn: { at: -1 } } },
  { fate: 'went back', sel: '.agents-tiles', parts: { back: { sel: '.agents-icon', at: 0 }, btn: { sel: '.agents-icon', at: -1 } } },
  { fate: 'long pause', sel: '.host-snip', parts: { btn: { sel: 'code' } } },
]
/** The hero's stages: the ones a visitor who stays at the top of the page sees. */
export const heroStages = stages.filter(stage => /^\.(hero|site-header)\b/.test(stage.sel)).map(stage => stage.sel)

/** What a resting cursor keeps clear of: text, controls, pictures and the page's own figures, the header and the footer. */
export const keepOut = '.site-header, main h1, main h2, main h3, main h4, main h5, main h6, main p, main li, main pre, main a, main button, main table, main figure, main blockquote, main img, main [data-figure], main .compile-command, main .src-row, main [role="tablist"], .site-footer'
/** A live ui-tests surface: while one shows, the troupe stands down. A surface inside a figure is a picture of one, not the real thing. */
export const liveSurface = '[data-research-taskbar]:not(.uit-contained), .uit-invite:not(.uit-contained)'

/** The rules the troupe keeps, in px and seconds. */
export const rules = {
  margin: 10, sides: 0.09, attempts: 160, spacing: 90, pointerClear: 170,
  /** How near the pointer may come before a cursor moves: one waiting for its scene, one that has performed, the happy one. */
  personal: { waiting: 30, performed: 110, happy: 80 },
  /** A stage starts after it has been wholly in view this long, and freezes below this share of it in view. */
  settle: 0.6, freezeBelow: 0.75, fastScroll: 900, maxScenes: 2, leftBehind: 0.8, selectionDim: 0.18,
} as const

/** The cursor's scale: 3 units, or 2.5 on a viewport under 700px. The arrow is 12 by 20 units. */
export const scaleFor = (width: number) => width < 700 ? 2.5 : 3
/** The box a cursor at `x`, `y` (its tip, in page px) takes up at scale `k`, with a little room for its outline and its face. */
export const cursorBox = (x: number, y: number, k: number): Rect => ({ x: x - 6, y: y - 6, w: 12 * k + 14, h: 20 * k + 14 })
/** The middle of the cursor's body, where a click catches it and where it is aimed. */
export const bodyOf = (x: number, y: number, k: number) => ({ x: x + 5 * k, y: y + 10 * k })
/** Whether two rects overlap once `pad` is added around the second. */
export const overlaps = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad
/** Whether a cursor resting at `x`, `y` would sit on any keep-out rect, each grown by `pad`. */
export const blocked = (x: number, y: number, k: number, keeps: readonly Rect[], pad: number = rules.margin) => {
  const box = cursorBox(x, y, k)
  return keeps.some(keep => overlaps(box, keep, pad))
}

/**
 * A free spot to rest in the visible part of the page (`view`, in page px), or null when there is none and the cursor waits offstage.
 * Half the tries go to the side margins, where the page leaves the most room. A spot is never on a keep-out rect, never under the
 * pointer and never on another cursor; among the free ones, `near` prefers about 200px from a point and `away` prefers far from one.
 * `random` is injected so the tests can make it deterministic.
 */
export function findSpot(view: Rect, k: number, keeps: readonly Rect[], options: {
  random?: () => number; pointer?: { x: number; y: number } | null; others?: readonly { x: number; y: number }[]
  near?: { x: number; y: number }; away?: { x: number; y: number }
} = {}) {
  const random = options.random ?? Math.random, between = (a: number, b: number) => a + random() * (b - a)
  const w = 12 * k + 20, h = 20 * k + 20
  let best: { x: number; y: number } | null = null, score = -Infinity
  for (let i = 0; i < rules.attempts; i++) {
    const edge = random() < 0.5
    const x = view.x + (edge ? (random() < 0.5 ? between(8, Math.max(9, view.w * rules.sides)) : between(view.w * (1 - rules.sides) - w, view.w - w)) : between(8, view.w - w))
    const y = view.y + between(10, view.h - h)
    if (x < view.x || x + w > view.x + view.w) continue
    if (blocked(x, y, k, keeps)) continue
    const body = bodyOf(x, y, k)
    if (options.pointer && Math.hypot(options.pointer.x - body.x, options.pointer.y - body.y) < rules.pointerClear) continue
    if (options.others?.some(other => Math.hypot(other.x - x, other.y - y) < rules.spacing)) continue
    let s = random()
    if (options.near) s -= Math.abs(Math.hypot(x - options.near.x, y - options.near.y) - 200) * 0.01
    if (options.away) s += Math.hypot(x - options.away.x, y - options.away.y) * 0.012
    if (s > score) { score = s; best = { x, y } }
  }
  return best
}

/**
 * The waves: one cursor, then two, then three, each only after every cursor in the one before was saved. A wave that loses a cursor
 * repeats at its size. Once the third is caught in full, the happy cursor arrives and stays.
 */
export const waveSizes = [1, 2, 3] as const
export type Wave = 1 | 2 | 3 | 'happy'
export type Result = 'saved' | 'lost' | null
export function nextWave(wave: Wave, results: readonly Result[]): Wave {
  if (wave === 'happy' || results.length < (waveSizes[wave - 1] ?? 0) || results.some(result => result === null)) return wave
  if (!results.every(result => result === 'saved')) return wave
  return wave === 3 ? 'happy' : (wave + 1) as Wave
}
export const waveSize = (wave: Wave) => wave === 'happy' ? 1 : waveSizes[wave - 1]

/** A stage's gating state: how long it has been wholly in view, whether it has left the view since it last played, whether it plays now. */
export type Gate = { seen: number; left: boolean; busy: boolean }
/** What the director knows about a stage this frame: how much of it is in view, whether all of it is, and whether a running scene shares its figure or one contains the other. */
export type View = { fraction: number; whole: boolean; fastScroll: boolean; clash: boolean }
/**
 * One frame of a stage's gate. A stage that has played may play again only once it has left the view. It is ready once it has been
 * wholly in view for `rules.settle`s while the visitor isn't scrolling fast and no clashing scene runs; the clock restarts otherwise.
 */
export function gate(state: Gate, view: View, dt: number): Gate & { ready: boolean } {
  const left = state.left || view.fraction === 0
  if (state.busy || !left || view.clash || !view.whole || view.fastScroll) return { seen: 0, left, busy: state.busy, ready: false }
  const seen = state.seen + dt
  return { seen, left, busy: state.busy, ready: seen > rules.settle }
}
/** Whether a running scene must hold still: its stage is less than three quarters in view. */
export const frozen = (fraction: number) => fraction < rules.freezeBelow

/**
 * Of the stages ready to play, the one to cast: the one whose exit has been used least this visit (counting scenes still running),
 * the first in page order on a tie. Every exit gets its turn.
 */
export function cast<T extends { fate: Fate }>(ready: readonly T[], used: Record<Exit, number>): T | undefined {
  let best: T | undefined
  for (const stage of ready) if (!best || used[exitOf[stage.fate]] < used[exitOf[best.fate]]) best = stage
  return best
}

/** An index into a list where a negative one counts from the end. */
export const atIndex = <T>(list: readonly T[], at = 0) => list[at < 0 ? list.length + at : at]
