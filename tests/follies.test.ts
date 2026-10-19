import { describe, expect, it } from 'vitest'
import {
  stages, heroStages, exitOf, exits, keepOut, liveSurface, rules, scaleFor, cursorBox, bodyOf, overlaps, blocked, findSpot, nextWave, waveSize, gate, frozen, cast, atIndex,
  type Exit, type Rect,
} from '../apps/web/lib/follies'

/** A deterministic stand-in for Math.random, so the spot finder's choices repeat. */
function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 } }
const none: Record<Exit, number> = { confusion: 0, frustration: 0, hook: 0, spinner: 0 }

/** Issue #75: the cursor follies' pure parts. What the canvas does with them on the landing is in tests/e2e/follies.spec.ts. */
describe('the cursor follies', () => {
  it('casts on the issue\'s fifteen stages, and the hero alone has one of each fate, so every exit can be seen without scrolling', () => {
    expect(stages).toHaveLength(15)
    expect(new Set(stages.map(stage => stage.sel)).size).toBe(15)
    expect(heroStages).toEqual(['.hero-copy', '.site-header .nav-links', '.hero-artefact .terminal-body', '.hero-artefact .window-chrome'])
    const heroExits = stages.filter(stage => heroStages.includes(stage.sel)).map(stage => exitOf[stage.fate])
    expect(new Set(heroExits)).toEqual(new Set(exits))
    // Each fate names the parts it plays on.
    for (const stage of stages) {
      const roles = Object.keys(stage.parts).sort()
      expect(roles, stage.sel).toEqual({ hesitation: ['a', 'b'], 'rage click': ['btn'], 'went back': ['back', 'btn'], 'long pause': ['btn'] }[stage.fate])
    }
    expect(stages.find(stage => stage.sel === '.hero-artefact .terminal-body')!.parts).toEqual({ back: { sel: '.terminal-rank', at: 0 }, btn: { sel: '.terminal-rank', at: -1 } })
    expect(stages.find(stage => stage.sel === '.hero-artefact .window-chrome')!.parts).toEqual({ btn: { sel: '.window-title' } })
    expect(atIndex([1, 2, 3], -1)).toBe(3)
    expect(atIndex([1, 2, 3], 1)).toBe(2)
  })

  it('runs waves of one, two and three, repeating a wave that loses a cursor, then one happy cursor that stays', () => {
    expect([1, 2, 3, 'happy'].map(wave => waveSize(wave as 1))).toEqual([1, 2, 3, 1])
    expect(nextWave(1, ['saved'])).toBe(2)
    expect(nextWave(1, ['lost'])).toBe(1)
    expect(nextWave(2, ['saved', 'lost'])).toBe(2)
    expect(nextWave(2, ['saved', 'saved'])).toBe(3)
    expect(nextWave(3, ['saved', 'saved', 'saved'])).toBe('happy')
    expect(nextWave(3, ['saved', 'saved', 'lost'])).toBe(3)
    // A wave still under way, or not yet all on stage, stays.
    expect(nextWave(2, ['saved', null])).toBe(2)
    expect(nextWave(3, ['saved', 'saved'])).toBe(3)
    expect(nextWave('happy', ['saved'])).toBe('happy')
  })

  it('keeps a resting cursor\'s box, plus a 10px margin, off every keep-out rect, at 3 units or 2.5 under 700px', () => {
    expect(scaleFor(1440)).toBe(3); expect(scaleFor(700)).toBe(3); expect(scaleFor(699)).toBe(2.5); expect(scaleFor(390)).toBe(2.5)
    expect(cursorBox(100, 200, 3)).toEqual({ x: 94, y: 194, w: 50, h: 74 })
    expect(bodyOf(100, 200, 3)).toEqual({ x: 115, y: 230 })
    const keep: Rect = { x: 200, y: 200, w: 100, h: 40 }
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 })).toBe(false)
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }, 11)).toBe(true)
    // Its box ends at x + 30; 10px short of the rect is still too close, 11px clear is not.
    expect(blocked(200 - 50 + 6 - 9, 200, 3, [keep])).toBe(true)
    expect(blocked(200 - 50 + 6 - 11, 200, 3, [keep])).toBe(false)
    expect(blocked(0, 0, 3, [])).toBe(false)
    expect(rules.margin).toBe(10)
    // The keep-outs are the issue's: text, controls, pictures, figures, the commands, the source rows, tab lists, header and footer.
    for (const selector of ['h1', 'h2', 'h3', 'p', 'li', 'pre', 'a', 'button', 'table', 'figure', 'blockquote', 'img', '[data-figure]', '.compile-command', '.src-row', '[role="tablist"]']) expect(keepOut).toContain(`main ${selector}`)
    expect(keepOut).toContain('.site-header'); expect(keepOut).toContain('.site-footer')
    expect(liveSurface).toBe('[data-research-taskbar]:not(.uit-contained), .uit-invite:not(.uit-contained)')
  })

  it('finds a free spot in view, half the time in the side margins, never on content, the pointer or another cursor, and none when the view is full', () => {
    const view = { x: 0, y: 1000, w: 1440, h: 900 }, random = seeded(7)
    const keeps: Rect[] = [{ x: 96, y: 1000, w: 1248, h: 900 }]
    const spots = Array.from({ length: 200 }, () => findSpot(view, 3, keeps, { random }))
    for (const spot of spots) {
      expect(spot).not.toBeNull()
      expect(blocked(spot!.x, spot!.y, 3, keeps)).toBe(false)
      expect(spot!.y).toBeGreaterThanOrEqual(view.y); expect(spot!.y + 80).toBeLessThanOrEqual(view.y + view.h)
      expect(spot!.x).toBeGreaterThanOrEqual(0); expect(spot!.x + 56).toBeLessThanOrEqual(view.w)
    }
    // With nothing to avoid, about half the tries land in the side margins.
    const open = Array.from({ length: 400 }, (_, i) => findSpot(view, 3, [], { random: seeded(3 + i * 7919) })!)
    expect(open.filter(spot => spot.x < view.w * rules.sides || spot.x > view.w * (1 - rules.sides) - 56).length).toBeGreaterThan(80)
    // Not under the pointer, not on another cursor.
    const pointer = { x: 50, y: 1400 }, others = [{ x: 1380, y: 1500 }]
    for (let i = 0; i < 100; i++) {
      const spot = findSpot(view, 3, keeps, { random, pointer, others })!
      const body = bodyOf(spot.x, spot.y, 3)
      expect(Math.hypot(body.x - pointer.x, body.y - pointer.y)).toBeGreaterThanOrEqual(rules.pointerClear)
      expect(Math.hypot(spot.x - others[0].x, spot.y - others[0].y)).toBeGreaterThanOrEqual(rules.spacing)
    }
    // A view with no room: the cursor waits offstage.
    expect(findSpot(view, 3, [{ x: -20, y: 980, w: 1480, h: 940 }], { random })).toBeNull()
  })

  it('starts a stage only once it has been wholly in view for 0.6s, without fast scrolling or a clash, and again only after it has left the view', () => {
    const view = { fraction: 1, whole: true, fastScroll: false, clash: false }
    let state = { seen: 0, left: true, busy: false }
    for (let t = 0; t < 0.6; t += 0.1) { const next = gate(state, view, 0.1); state = next; expect(next.ready, `at ${t}`).toBe(t >= 0.55) }
    expect(gate(state, view, 0.1).ready).toBe(true)
    // Fast scrolling, part of it out of view, a clashing scene or one already running restart the clock.
    for (const change of [{ fastScroll: true }, { whole: false, fraction: 0.9 }, { clash: true }]) expect(gate({ seen: 0.59, left: true, busy: false }, { ...view, ...change }, 0.1)).toMatchObject({ seen: 0, ready: false })
    expect(gate({ seen: 0.59, left: true, busy: true }, view, 0.1).ready).toBe(false)
    // Once played, a stage stays put until it has left the view, and then may play again.
    const played = { seen: 0, left: false, busy: false }
    expect(gate(played, view, 1).ready).toBe(false)
    const gone = gate(played, { ...view, fraction: 0, whole: false }, 0.1)
    expect(gone.left).toBe(true)
    expect(gate({ ...gone, seen: 0.6 }, view, 0.1).ready).toBe(true)
    // A scene freezes below three quarters in view.
    expect(frozen(0.74)).toBe(true); expect(frozen(0.75)).toBe(false)
    expect(rules.maxScenes).toBe(2); expect(rules.fastScroll).toBe(900)
  })

  it('casts the ready stage whose exit has been used least, the first in page order on a tie', () => {
    const hero = stages.filter(stage => heroStages.includes(stage.sel))
    expect(cast(hero, none)!.sel).toBe('.hero-copy')
    expect(cast(hero, { ...none, confusion: 1 })!.fate).toBe('rage click')
    expect(cast(hero, { ...none, confusion: 1, frustration: 1 })!.fate).toBe('went back')
    expect(cast(hero, { confusion: 1, frustration: 1, hook: 1, spinner: 0 })!.fate).toBe('long pause')
    expect(cast(hero, { confusion: 2, frustration: 1, hook: 2, spinner: 1 })!.fate).toBe('rage click')
    expect(cast([], none)).toBeUndefined()
    // Over four scenes at the top of the page, with no stage played twice, every exit is used once.
    const used = { ...none }, left = [...hero]
    for (let scene = 0; scene < 4; scene++) { const stage = cast(left, used)!; used[exitOf[stage.fate]]++; left.splice(left.indexOf(stage), 1) }
    expect(used).toEqual({ confusion: 1, frustration: 1, hook: 1, spinner: 1 })
  })
})
