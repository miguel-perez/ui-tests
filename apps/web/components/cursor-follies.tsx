'use client'
import { useEffect, useRef } from 'react'
import { useReducedMotion } from './page-texture'
import {
  stages as stageList, keepOut, liveSurface, rules, scaleFor, cursorBox, bodyOf, blocked, findSpot as freeSpot, nextWave, waveSize, gate, frozen,
  cast as choose, exitOf, atIndex, type Fate, type Exit, type Rect, type Stage, type Wave, type Result,
} from '../lib/follies'

/** What the tests read from the canvas's `follies` property: never markup, like the texture's `clock`. */
export type FolliesState = {
  wave: Wave
  actors: { mode: Mode; stage: string | null; fate: Fate | null; trouble: boolean; x: number; y: number }[]
  exits: Record<Exit, number>
}
type Mode = 'idle' | 'moving' | 'performing' | 'leaving' | 'backstage' | 'gone'
type Point = { x: number; y: number }
type Eye = 'normal' | 'happy' | 'spiral' | 'x'
type Mouth = 'none' | 'smile' | 'o' | 'grit' | 'wave' | 'pant'
/** One beat of a script: how long it lasts, whether the cursor is in trouble during it, and what it does on entry and on each frame. */
type Step = { d: number; trouble?: boolean; enter?: (c: Actor) => void; tick?: (c: Actor, p: number, elapsed: number, dt: number) => void }
type Live = { stage: Stage; busy: boolean; left: boolean; seen: number; el: Element | null; part: (role: string) => Element | null }
type Actor = {
  mode: Mode; script: Step[] | null; si: number; t: number; onEnd: ((c: Actor) => void) | null; stage: Live | null
  x: number; y: number; oy: number; jx: number; jy: number; lag: number; lagV: number; rot: number; s: number; sx: number; sy: number
  alpha: number; dim: number; tint: number; lx: number; ly: number; lid: number; blink: number; blinkT: number; eye: Eye; wide: number
  brow: number; mouth: Mouth; mo: number; sweat: number; orbit: number; steam: number; steamT: number; trail: Point[] | null; knot: number
  hook: Point | null; spinner: (Point & { r: number }) | null; frame: number; frameFade: boolean; trouble: boolean; caught: boolean
  breath: number; wanderT: number; offT: number; fleeCD: number; tx?: number; ty?: number; performed: boolean; result: Result
  chill: boolean; chillT: number; frozen: boolean; px: number; py: number; flag: boolean; timer: number; hx0: number; cx0: number; r0: number; a0: number
}
type Effect = { type: 'ring' | 'smoke' | 'glyph' | 'confetti' | 'shard' | 'spark'; x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; rot: number; vr: number; size: number; color: string; text?: string }

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const ease = {
  inOut: (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2) },
  inBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t },
}
/** The arrow, in units: the classic pointer the troupe is drawn as. */
const ARROW = [[0, 0], [0, 17], [4, 13], [7, 20], [9.6, 19], [6.6, 12], [12, 12]]
const glyphFont = (size: number) => `600 ${size}px "Fira Code", ui-monospace, Menlo, monospace`

/** A token's colour as the canvas can mix it: its computed value read through a one-pixel probe, so any CSS colour arrives as channels. */
function tokenColour(token: string) {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return `rgb(${[r, g, b].join(', ')})`
}
const channels = (colour: string) => colour.match(/\d+/g)!.slice(0, 3).map(Number)
const mix = (a: string, b: string, t: number) => { const A = channels(a), B = channels(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(', ')})` }

/**
 * The troupe (issue #75), on the landing only: one fixed, full-viewport canvas over the page with `pointer-events: none`, and one
 * animation loop that stops while the tab is hidden. Cartoon cursors pop in, rest only in empty space and walk up to real parts of the
 * page to act out hesitation, a rage click, going back and a long pause, each ending in its exit; a click on one in trouble catches
 * it. Everything is drawn: the cursors never hover, focus or trigger anything, and the layer never changes the page's markup, because
 * the recorder reads a markup change after a click as that click's effect. Its state is a `follies` property on the canvas for the
 * tests, never an attribute. Under reduced motion, or while a live ui-tests surface is on the page, there are no cursors.
 */
export function CursorFollies() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const cv = canvas.current! as HTMLCanvasElement & { follies?: FolliesState }
    const ctx = cv.getContext('2d')!
    const used: Record<Exit, number> = { confusion: 0, frustration: 0, hook: 0, spinner: 0 }
    const publish = (wave: Wave, actors: Actor[]) => {
      cv.follies = {
        wave, exits: { ...used },
        actors: actors.map(c => ({ mode: c.mode, stage: c.stage?.stage.sel ?? null, fate: c.stage?.stage.fate ?? null, trouble: c.trouble && !c.caught, x: c.x, y: c.y })),
      }
    }
    publish(1, [])
    if (reduced) return

    // ---------- viewport, colour ----------
    let VW = 0, VH = 0, DPR = 1, K = 3
    // Every colour is a site token: the cursors are white with an ink outline, the effects are the accent and the data roles, the cane
    // is the yellow, and smoke and dozing take the demo app's dim ink.
    const C = {
      fill: tokenColour('--surface'), stroke: tokenColour('--ink'), accent: tokenColour('--accent'), red: tokenColour('--red'),
      yellow: tokenColour('--yellow'), green: tokenColour('--green'), teal: tokenColour('--teal'), dim: tokenColour('--host-dim'), cane: tokenColour('--yellow'),
    }
    const resize = () => {
      VW = document.documentElement.clientWidth; VH = innerHeight; DPR = Math.min(2, devicePixelRatio || 1)
      const w = Math.round(VW * DPR), h = Math.round(VH * DPR)
      // The canvas's size is its only markup: it changes with the window, never with a click.
      if (cv.width !== w) cv.width = w
      if (cv.height !== h) cv.height = h
      K = scaleFor(VW)
      collectKeeps()
    }

    // ---------- the page, as the troupe sees it ----------
    let keeps: Rect[] = []
    const docRect = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } }
    function collectKeeps() { keeps = [...document.querySelectorAll(keepOut)].map(docRect).filter(r => r.w > 0 && r.h > 0) }
    const contentBlocked = (x: number, y: number) => blocked(x, y, K, keeps)

    const ptr = { x: 0, y: 0, cx: 0, cy: 0, on: false }
    let selecting = false
    const onPointerMove = (e: PointerEvent) => { ptr.cx = e.clientX; ptr.cy = e.clientY; ptr.x = e.clientX + scrollX; ptr.y = e.clientY + scrollY; ptr.on = e.pointerType === 'mouse' || e.pointerType === 'pen'; hover() }
    const onPointerLeave = () => { ptr.on = false }
    const onSelection = () => { const s = getSelection(); selecting = !!s && !s.isCollapsed }

    // ---------- effects (page coordinates) ----------
    const fx: Effect[] = []
    let now = 0
    const spawn = (o: Partial<Effect> & Pick<Effect, 'type'>) => { fx.push({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, rot: 0, vr: 0, size: 10, color: C.accent, ...o }) }
    const ring = (x: number, y: number, color: string, size = 22) => spawn({ type: 'ring', x, y, color, size, max: .45 })
    const smoke = (x: number, y: number, n = 6, spread = 30) => { for (let i = 0; i < n; i++) spawn({ type: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-spread, spread), vy: rand(-spread, spread * .3) - 20, size: rand(7, 14), max: rand(.6, 1), color: C.dim }) }
    const glyph = (x: number, y: number, text: string, o: Partial<Effect> = {}) => spawn({ type: 'glyph', x, y, text, vy: -30, max: 1.2, size: 16, color: C.accent, ...o })
    const burstGlyphs = (h: Point, text: string, n: number, color: string) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rand(-.2, .2), v = rand(80, 170); glyph(h.x, h.y, text, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 120, max: rand(.9, 1.4), size: rand(13, 22), color, vr: rand(-4, 4) }) } }
    const confetti = (x: number, y: number) => { const cols = [C.accent, C.green, C.yellow, C.red, C.teal]; for (let i = 0; i < 22; i++) spawn({ type: 'confetti', x, y, vx: rand(-200, 200), vy: rand(-320, -130), g: 760, max: rand(1, 1.5), size: rand(5, 8), vr: rand(-10, 10), color: cols[i % cols.length] }) }
    const shards = (h: Point) => { for (let i = 0; i < 14; i++) { const a = rand(0, Math.PI * 2), v = rand(140, 320); spawn({ type: 'shard', x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 900, max: rand(.8, 1.2), size: rand(5, 10), vr: rand(-12, 12), color: i % 3 ? C.fill : C.red }) } }

    // ---------- characters ----------
    const head = (c: Actor) => ({ x: c.x + c.jx + 4 * K, y: c.y + c.oy + c.jy + c.lag + 8 * K })
    const body = (c: Actor) => bodyOf(c.x + c.jx, c.y + c.oy + c.jy + c.lag, K)
    let chars: Actor[] = []
    function makeChar(x: number, y: number, o: Partial<Actor> = {}) {
      const c: Actor = {
        mode: 'idle', script: null, si: -1, t: 0, onEnd: null, stage: null,
        x, y, oy: 0, jx: 0, jy: 0, lag: 0, lagV: 0, rot: 0, s: 0, sx: 1, sy: 1, alpha: 1, dim: 1, tint: 0,
        lx: 0, ly: 0, lid: 0, blink: 0, blinkT: rand(1, 3), eye: 'normal', wide: 1, brow: 0, mouth: 'none', mo: 0,
        sweat: 0, orbit: 0, steam: 0, steamT: 0, trail: null, knot: 0, hook: null, spinner: null, frame: 0, frameFade: false,
        trouble: false, caught: false, breath: rand(0, 6), wanderT: rand(2, 5), offT: 0, fleeCD: 0,
        performed: false, result: null, chill: false, chillT: rand(3, 6), frozen: false, px: x, py: y, flag: false, timer: 0, hx0: 0, cx0: 0, r0: 0, a0: 0,
        ...o,
      }
      chars.push(c)
      return c
    }
    function runScript(c: Actor, steps: Step[], onEnd: (c: Actor) => void) { c.script = steps; c.si = -1; c.onEnd = onEnd; nextStep(c) }
    function nextStep(c: Actor) {
      c.si++; c.t = 0
      const st = c.script?.[c.si]
      if (!st) { const f = c.onEnd; c.script = null; c.trouble = false; f?.(c); return }
      c.trouble = !!st.trouble && !c.caught
      st.enter?.(c)
    }

    // ---------- reusable beats ----------
    const pop = (at: (c: Actor) => Point): Step => ({ d: .55,
      enter: c => { const f = at(c); c.x = f.x; c.y = f.y; c.s = 0; c.alpha = 1; c.lag = 0; c.lagV = 0; smoke(c.x + 5 * K, c.y + 10 * K, 4, 36) },
      tick: (c, p) => { c.s = ease.outBack(p); const w = Math.sin(p * Math.PI) * (1 - p); c.sy = 1 + .5 * w; c.sx = 1 / c.sy; if (p >= 1) { c.s = 1; c.sx = c.sy = 1 } } })
    const lookAround = (): Step => ({ d: .9, tick: (c, p) => { const w = Math.sin(p * Math.PI * 2); c.lx = w; c.rot = -5 * w; if (p >= 1) { c.lx = 0; c.rot = 0 } } })
    type Travel = { dur?: number; lift?: number; trouble?: boolean; tired?: number; ease?: (t: number) => number; stretch?: number; lean?: number }
    function travel(to: (c: Actor) => Point, o: Travel = {}): Step {
      let a: Point, b: Point, ctl: Point
      return { d: o.dur || .75, trouble: o.trouble,
        enter: c => {
          a = { x: c.x, y: c.y }; b = to(c)
          ctl = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - (o.lift ?? 60) }
          c.px = c.x; c.py = c.y
          if (o.tired != null) { c.lid = o.tired * .55; c.mouth = o.tired > .5 ? 'pant' : 'none'; c.brow = -.5 }
        },
        tick: (c, p, e, dt) => {
          const t = (o.ease || ease.inOut)(p), u = 1 - t
          c.x = u * u * a.x + 2 * u * t * ctl.x + t * t * b.x
          c.y = u * u * a.y + 2 * u * t * ctl.y + t * t * b.y
          const v = Math.hypot(c.x - c.px, c.y - c.py) / Math.max(dt, 1e-3)
          c.px = c.x; c.py = c.y
          const k = 1 + Math.min(o.stretch ?? .4, v / 1800); c.sy = k; c.sx = 1 / k
          const dir = Math.sign(b.x - a.x) || 0
          c.rot = lerp(c.rot, dir * (o.lean ?? 12) * Math.sin(p * Math.PI), .25)
          if (!c.chill) c.lx = dir
          c.trail?.push({ x: c.x, y: c.y })
          if (o.tired) c.oy = Math.sin(e * 9) * 2 * o.tired
        } }
    }
    const land = (soft = false): Step => {
      const amt = soft ? .12 : .28
      return { d: soft ? .7 : .5, tick: (c, p) => { const w = Math.exp(-5 * p) * Math.cos(p * 16); c.sy = 1 - amt * w; c.sx = 1 / c.sy; c.rot *= .85; if (!c.chill) { c.lx *= .9; c.ly *= .9 } c.oy = 0; c.wide = lerp(c.wide, 1, .2) } }
    }
    function hop(to: (c: Actor) => Point, o: Travel & { antic?: number; soft?: boolean } = {}): Step[] {
      let a: Point, b: Point
      const sq = o.soft ? .1 : .24
      return [
        { d: o.antic ?? .3, trouble: o.trouble,
          enter: c => { a = { x: c.x, y: c.y }; b = to(c) },
          tick: (c, p) => { const k = ease.out(p), dir = Math.sign(b.x - a.x) || 1; c.sy = 1 - sq * k; c.sx = 1 / c.sy; c.rot = -(o.soft ? 5 : 12) * k * dir; if (!c.chill) { c.lx = dir * .9; c.ly = Math.sign(b.y - a.y) * .4 } } },
        travel(to, o),
        land(o.soft),
      ]
    }
    const startle = (): Step => ({ d: .28, tick: (c, p) => { c.wide = 1 + .4 * Math.sin(p * Math.PI); c.oy = -7 * Math.sin(p * Math.PI); c.lx = 0; c.ly = 0 } })
    function click(o: { d?: number; trouble?: boolean; heat?: number; onHit?: (c: Actor) => void } = {}): Step {
      let hit = false
      return { d: o.d || .42, trouble: o.trouble,
        enter: c => { hit = false; if (o.heat != null) { c.tint = o.heat; c.brow = .3 + o.heat; c.steam = o.heat > .3 ? o.heat : 0 } },
        tick: (c, p) => {
          if (p < .4) { const k = ease.out(p / .4); c.oy = -9 * k; c.sy = 1 + .12 * k }
          else if (p < .55) { const k = (p - .4) / .15; c.oy = lerp(-9, 2, k); c.sy = lerp(1.12, .7, k) }
          else { const k = (p - .55) / .45, w = Math.exp(-5 * k) * Math.cos(k * 14); c.oy = 2 * (1 - k); c.sy = 1 - .3 * w }
          c.sx = 1 / c.sy
          if (!hit && p >= .5) { hit = true; ring(c.x, c.y, o.heat ? C.red : C.accent, o.heat ? 28 : 20); o.onHit?.(c) }
        } }
    }

    // ---------- stages: real parts of the page ----------
    // React replaces the server-rendered elements when it hydrates, so a stage looks its element up again whenever the saved one is
    // no longer in the document, and its parts are found inside whichever element is current.
    const STAGES: Live[] = stageList.map(stage => {
      let el: Element | null = null
      const live: Live = {
        stage, busy: false, left: true, seen: 0,
        get el() { return el?.isConnected ? el : (el = document.querySelector(stage.sel)) },
        part(role) {
          const root = live.el, part = stage.parts[role]
          if (!root || !part) return null
          return atIndex(part.sel ? [...root.querySelectorAll(part.sel)] : [...root.children], part.at ?? 0) ?? null
        },
      }
      return live
    })
    const playable = (st: Live) => !!st.el && Object.keys(st.stage.parts).every(role => st.part(role))
    function anc(st: Live, role: string, fx = .5, fy = .5): Point {
      const el = st.part(role)
      if (!el) return { x: scrollX + VW / 2, y: scrollY + VH / 2 }
      const r = el.getBoundingClientRect()
      return { x: r.left + scrollX + r.width * fx, y: r.top + scrollY + r.height * fy }
    }
    const visFrac = (el: Element | null) => { if (!el) return 0; const r = el.getBoundingClientRect(); const vis = Math.min(r.bottom, VH) - Math.max(r.top, 0); return clamp(vis / Math.max(1, r.height)) }
    const fullyIn = (el: Element | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 4 && r.bottom <= VH - 4 }
    /** Two stages clash when one contains the other or both sit in the same figure: they never run together. */
    const clash = (a: Live, b: Live) => {
      const A = a.el, B = b.el
      if (!A || !B) return false
      const fig = A.closest('[data-figure]')
      return A.contains(B) || B.contains(A) || (!!fig && fig === B.closest('[data-figure]'))
    }

    const FATES: Record<Fate, (c: Actor, st: Live) => Step[]> = {
      hesitation: (c, st) => {
        let base: Point = { x: 0, y: 0 }
        const gap = () => { const a = anc(st, 'a'), b = anc(st, 'b'); return { x: (a.x + b.x) / 2 - 3 * K, y: a.y - 13 * K } }
        return [
          ...hop(gap, { lift: 70, dur: .9 }),
          { d: 2.6, trouble: true,
            enter: c => { base = { x: c.x, y: c.y }; c.brow = -.6 },
            tick: (c, p, e) => {
              const a = anc(st, 'a'), b = anc(st, 'b'), amp = (b.x - a.x) / 2 * .7
              const ph = Math.PI * 2 * (.7 * e + .55 * e * e)
              c.x = base.x + amp * Math.sin(ph); c.y = base.y - Math.abs(Math.cos(ph)) * 7
              c.lx = clamp(Math.cos(ph) * 3, -1, 1); c.rot = Math.cos(ph) * 10
              c.sweat = clamp((p - .3) * 2); c.orbit = p > .6 ? 1 : 0
            } },
          { d: 1.7, trouble: true,
            enter: c => { c.eye = 'spiral'; c.mouth = 'wave' },
            tick: (c, p, e) => { c.orbit = 1 + Math.floor(p * 5); c.rot = Math.sin(e * 5) * 12; c.x += (base.x - c.x) * .08; c.sweat = 1 } },
          { d: 1.3, trouble: true,
            tick: (c, p, e, dt) => { c.rot += dt * (200 + 2600 * p * p); c.sy = 1 + .3 * p; c.sx = 1 - .3 * p; c.oy = -22 * ease.inOut(p); c.orbit = 6 } },
          { d: 1.5, enter: c => { const h = head(c); burstGlyphs(h, '?', 12, C.accent); smoke(h.x, h.y, 7); c.alpha = 0; c.orbit = 0; c.sweat = 0 } },
        ]
      },
      'rage click': (c, st) => [
        ...hop(() => { const p = anc(st, 'btn'); return { x: p.x - 2, y: p.y - 2 } }, { lift: 90, dur: .9 }),
        click(),
        { d: 1.0, trouble: true,
          tick: (c, p) => { c.lx = 0; c.ly = 0; c.wide = 1 + .35 * ease.outBack(clamp(p * 3)); c.brow = -.25; c.blink = (p > .45 && p < .52) || (p > .62 && p < .69) ? .1 : 0; c.rot = -6 * Math.sin(p * Math.PI) } },
        click({ trouble: true, heat: .35 }),
        click({ heat: .55, trouble: true, d: .32 }),
        { d: 1.6, trouble: true,
          enter: c => { c.brow = 1; c.mouth = 'grit'; c.wide = 1; c.timer = -1; c.flag = false; const h = head(c); glyph(h.x + 24, h.y - 30, '#@$%!', { color: C.red, size: 17, vy: -18, max: 1.6 }) },
          tick: (c, p, e) => {
            // Nine clicks a second.
            const f = e * 9, ph = f % 1
            c.oy = ph < .5 ? -6 * ph * 2 : -6 * (1 - (ph - .5) * 2)
            c.sy = ph < .5 ? 1.1 : .78; c.sx = 1 / c.sy
            if (Math.floor(f) !== c.timer) { c.timer = Math.floor(f); ring(c.x, c.y, C.red, 24) }
            c.tint = lerp(.55, 1, p); c.steam = 1.5; c.jx = rand(-1.5, 1.5)
            if (p > .5 && !c.flag) { c.flag = true; const h = head(c); glyph(h.x - 28, h.y - 32, '!!', { color: C.red, size: 19, vy: -22, max: 1.1 }) }
          } },
        { d: 1.0, trouble: true,
          tick: (c, p) => { c.s = 1 + .5 * ease.in(p); c.jx = rand(-3, 3) * p; c.jy = rand(-3, 3) * p; c.wide = 1 + .4 * p; c.oy = 0; c.sy = c.sx = 1; c.steam = 1.5 + 2 * p } },
        { d: 1.6, enter: c => { const h = body(c); shards(h); smoke(h.x, h.y, 10, 60); ring(h.x, h.y, C.red, 60); glyph(h.x, h.y - 10, 'POP', { color: C.red, size: 24, vy: -50, max: .9 }); c.alpha = 0; c.steam = 0 } },
      ],
      'went back': (c, st) => {
        const at = (role: string) => () => { const p = anc(st, role); return { x: p.x - 2, y: p.y - 2 } }
        return [
          ...hop(at('btn'), { lift: 70, dur: .9 }),
          { d: .7, trouble: true, enter: c => { c.trail = [{ x: c.x, y: c.y }] }, tick: c => { c.lx = -1; c.ly = .3; c.brow = -.4 } },
          travel(at('back'), { dur: 1.3, lift: 60, trouble: true }),
          travel(at('btn'), { dur: 1.4, lift: -40, trouble: true }),
          travel(at('back'), { dur: 1.6, lift: 70, trouble: true, tired: .4 }),
          travel(at('btn'), { dur: 1.9, lift: -50, trouble: true, tired: .7 }),
          travel(at('back'), { dur: 2.2, lift: 40, trouble: true, tired: 1 }),
          { d: 1.1, trouble: true,
            tick: (c, p) => { c.knot = ease.inOut(p); c.rot = Math.sin(p * 20) * 8 * p * (1 - p) * 4; c.wide = 1 + .25 * p; c.oy = 0 } },
          { d: .8, enter: c => { c.eye = 'x'; c.wide = 1; c.mouth = 'none'; c.lid = 0 },
            tick: (c, p) => { const k = p < .6 ? ease.in(p / .6) : 1; c.rot = 95 * k - (p > .6 ? 12 * Math.sin((p - .6) / .4 * Math.PI) : 0); c.oy = 14 * k } },
          { d: 1.7,
            enter: c => { const h = head(c); c.hx0 = h.x + 16; c.cx0 = c.x; c.hook = { x: scrollX - 80, y: h.y } },
            tick: (c, p) => {
              // The cane comes in from the left, hooks, and pulls the cursor off with it.
              const { hx0, cx0 } = c
              let hx: number
              if (p < .35) hx = lerp(scrollX - 60, hx0, ease.out(p / .35))
              else if (p < .5) { hx = hx0; c.jx = p < .43 ? Math.sin(p * 140) * 2 : 0 }
              else hx = lerp(hx0, scrollX - 220, ease.inBack((p - .5) / .5))
              c.hook!.x = hx
              if (p >= .5) c.x = cx0 + (hx - hx0)
            } },
        ]
      },
      'long pause': (c, st) => {
        let ctr: Point = { x: 0, y: 0 }
        const end = () => { const p = anc(st, 'btn', 1, .5); return { x: p.x + 6, y: p.y - 2 } }
        return [
          ...hop(end, { lift: 70, dur: .9 }),
          click({ onHit: c => { c.eye = 'happy'; const p = end(); c.spinner = { x: p.x + 14 * K, y: p.y, r: 8 } } }),
          { d: 1.6, trouble: true,
            enter: c => { c.eye = 'normal' },
            tick: (c, p, e) => { c.oy = -Math.abs(Math.sin(e * 7)) * 4; c.lx = .9; c.ly = -.2; c.brow = -.3 } },
          { d: 1.1, trouble: true,
            tick: (c, p) => { const y = Math.sin(p * Math.PI); c.sy = 1 + .18 * y; c.sx = 1 / c.sy; c.mouth = 'o'; c.mo = y; c.lid = y; c.oy = 0; c.lx = 0; c.ly = 0 } },
          { d: 1.8, trouble: true,
            enter: c => { c.mouth = 'none'; c.timer = 0 },
            tick: (c, p, e, dt) => {
              c.lid = 1; c.rot = 22 * ease.inOut(p) + Math.sin(e * 2) * 3
              if (c.spinner) c.spinner.r = lerp(8, 44, ease.in(p))
              c.timer -= dt; if (c.timer <= 0) { c.timer = .5; const h = head(c); glyph(h.x + 22, h.y - 20, 'z', { color: C.dim, vx: 20, vy: -40, size: 13 + p * 8, max: 1.3 }) }
            } },
          { d: .6, trouble: true,
            enter: c => { c.lid = 0; c.wide = 1.45; c.brow = -.8; c.mouth = 'o'; c.mo = .6 },
            tick: (c, p) => { c.rot = lerp(c.rot, 0, .25); c.jx = rand(-1.5, 1.5); c.sy = 1 + .12 * Math.sin(p * Math.PI); c.sx = 1 / c.sy } },
          { d: 1.6,
            enter: c => { const sp = c.spinner ?? { x: c.x, y: c.y }; ctr = { x: sp.x, y: sp.y }; c.r0 = Math.hypot(c.x - ctr.x, c.y - ctr.y); c.a0 = Math.atan2(c.y - ctr.y, c.x - ctr.x); c.eye = 'spiral'; c.wide = 1; c.jx = 0 },
            tick: (c, p, e, dt) => { const k = ease.in(p), ang = c.a0 + k * Math.PI * 5, r = c.r0 * (1 - k); c.x = ctr.x + Math.cos(ang) * r; c.y = ctr.y + Math.sin(ang) * r; c.rot += dt * 720 * p; c.s = 1 - k } },
          { d: 1.0,
            enter: c => { c.alpha = 0; spawn({ type: 'spark', x: ctr.x, y: ctr.y, size: 16, max: .5, color: C.accent }) },
            tick: (c, p) => { if (c.spinner) c.spinner.r = lerp(44, 0, ease.out(p)) } },
        ]
      },
    }

    // ---------- waves ----------
    // 1, then 2, then 3, each only after every cursor in the one before was saved. A loss repeats the wave. Then one cursor with
    // nothing left to fix, and very happy about it.
    let wave = { at: 1 as Wave, toSpawn: 1, spawnT: .8, members: [] as Actor[], doneT: null as number | null }
    const finale = () => wave.at === 'happy'
    function startWave(at: Wave) {
      wave = { at, toSpawn: waveSize(at), spawnT: at === 'happy' ? .6 : 1, members: [], doneT: null }
      if (at === 'happy') for (const c of chars) if (c.mode !== 'performing' && c.mode !== 'leaving') c.mode = 'gone'
    }
    function joyfulEntrance(s: Point): Step[] {
      return [
        pop(() => s),
        { d: 1.1, enter: c => { c.eye = 'happy'; c.mouth = 'smile'; c.flag = false },
          tick: (c, p) => {
            // A backflip, and confetti at the top of it.
            c.oy = -60 * Math.sin(p * Math.PI); c.rot = p < 1 ? 360 * ease.inOut(p) : 0
            const sq = p < .15 ? 1 - .25 * Math.sin(p / .15 * Math.PI) : p > .85 ? 1 - .25 * Math.sin((p - .85) / .15 * Math.PI) : 1.1
            c.sy = sq; c.sx = 1 / sq
            if (p > .5 && !c.flag) { c.flag = true; confetti(head(c).x, head(c).y) }
          } },
        land(),
      ]
    }
    function waveDirector(dt: number) {
      if (wave.toSpawn > 0 && !fastScroll) {
        wave.spawnT -= dt
        if (wave.spawnT <= 0) {
          const s = findSpot(null)
          if (s) {
            const c = makeChar(s.x, s.y, { chill: finale() })
            wave.members.push(c)
            c.mode = 'moving'
            runScript(c, finale() ? joyfulEntrance(s) : [pop(() => s), lookAround()], c => { c.mode = 'idle'; c.eye = 'normal' })
            wave.toSpawn--
            wave.spawnT = 1.4
          } else {
            // No free spot in view: the cursor joins the wave offstage, and pops in when there is room or when a stage calls it.
            const c = makeChar(scrollX - 20 * K, scrollY + VH / 2, { chill: finale(), mode: 'backstage', alpha: 0, s: 1 })
            wave.members.push(c)
            wave.toSpawn--
            wave.spawnT = 1.4
          }
        }
      }
      if (finale() || wave.toSpawn > 0) return
      const results = wave.members.map(c => c.result)
      if (results.length && results.every(Boolean)) {
        if (wave.doneT == null) wave.doneT = 2.5
        wave.doneT -= dt
        if (wave.doneT <= 0) startWave(nextWave(wave.at, results))
      }
    }

    /** The exits used so far this visit, counting the scenes still running: the casting rule gives the least used the next stage. */
    function exitsInPlay() {
      const counts = { ...used }
      for (const c of chars) if (c.mode === 'performing' && c.stage) counts[exitOf[c.stage.stage.fate]]++
      return counts
    }
    function performerFor(st: Live) {
      const pool = wave.members.filter(c => !c.performed && (c.mode === 'idle' || c.mode === 'backstage'))
      if (!pool.length || !st.el) return undefined
      const mr = docRect(st.el), mc = { x: mr.x + mr.w / 2, y: mr.y + mr.h / 2 }
      pool.sort((a, b) => (Number(onScreen(b)) - Number(onScreen(a))) || (Math.hypot(a.x - mc.x, a.y - mc.y) - Math.hypot(b.x - mc.x, b.y - mc.y)))
      return pool[0]
    }
    function cast(st: Live, c: Actor) {
      const mr = docRect(st.el!)
      const steps: Step[] = []
      if (!onScreen(c) || c.mode === 'backstage') {
        const s = findSpot(c, { near: { x: mr.x + mr.w / 2, y: mr.y - 40 } }) || { x: clamp(mr.x - 14 * K, scrollX + 8, scrollX + VW - 50), y: mr.y }
        steps.push(pop(() => s))
      }
      c.mode = 'performing'; c.stage = st; c.performed = true; c.tx = c.ty = undefined
      Object.assign(c, { eye: 'normal', mouth: 'none', brow: 0, lid: 0, wide: 1, tint: 0 })
      st.busy = true; st.left = false; st.seen = 0
      runScript(c, steps.concat(FATES[st.stage.fate](c, st)), c => {
        st.busy = false; c.result = 'lost'; c.mode = 'gone'; used[exitOf[st.stage.fate]]++
      })
    }

    /** Caught: the logomark draws itself around the cursor, it relaxes, smiles, bows with a little wave and hops off the nearest side. */
    function rescue(c: Actor) {
      const st = c.stage
      c.caught = true; c.trouble = false; c.result = 'saved'; c.mode = 'leaving'
      runScript(c, [
        { d: .9,
          enter: c => {
            Object.assign(c, { eye: 'normal', trail: null, knot: 0, orbit: 0, steam: 0, sweat: 0, mouth: 'smile', brow: 0, lid: 0, wide: 1, jx: 0, jy: 0, hook: null, alpha: 1, frameFade: false })
            const b = body(c)
            ring(b.x, b.y, C.accent, 56)
          },
          tick: (c, p) => {
            c.frame = ease.out(clamp(p * 1.6))
            c.tint = lerp(c.tint, 0, .15); c.s = lerp(c.s, 1, .15); c.rot = lerp(c.rot % 360, 0, .15)
            c.sy = lerp(c.sy, 1, .2); c.sx = 1 / c.sy; c.oy = lerp(c.oy, 0, .2)
            if (c.spinner) c.spinner.r = lerp(c.spinner.r, 0, .15)
          } },
        { d: .8, enter: c => { c.eye = 'happy'; c.frameFade = true; if (st) st.busy = false },
          tick: (c, p) => { const b = Math.sin(p * Math.PI); c.rot = -28 * b + Math.sin(p * 18) * 6 * b; c.sy = 1 - .12 * b; c.sx = 1 / c.sy } },
        ...hop(c => ({ x: c.x < scrollX + VW / 2 ? scrollX - 16 * K : scrollX + VW + 10, y: c.y - 30 }), { lift: 80, dur: .8 }),
      ], c => { c.mode = 'gone'; if (st) st.busy = false })
    }

    // ---------- roaming ----------
    function onScreen(c: Actor) { const b = body(c); return b.y > scrollY - 10 && b.y < scrollY + VH + 10 && b.x > scrollX - 10 && b.x < scrollX + VW + 10 }
    function findSpot(self: Actor | null, o: { near?: Point; away?: Point } = {}) {
      return freeSpot({ x: scrollX, y: scrollY, w: VW, h: VH }, K, keeps, {
        pointer: ptr.on ? ptr : null, near: o.near, away: o.away,
        others: chars.filter(q => q !== self && q.mode !== 'gone').map(q => ({ x: q.tx ?? q.x, y: q.ty ?? q.y })),
      })
    }
    function goTo(c: Actor, s: Point, opts: { startle?: boolean; lift?: number; dur?: number } = {}) {
      c.mode = 'moving'; c.tx = s.x; c.ty = s.y
      const chill = c.chill
      const steps = (opts.startle && !chill ? [startle()] : []).concat(hop(() => s, {
        lift: opts.lift ?? (chill ? rand(35, 65) : rand(40, 90)),
        dur: opts.dur ?? (chill ? rand(1, 1.4) : .75),
        antic: chill ? .45 : opts.startle ? .15 : .3,
        soft: chill, ease: chill ? ease.sine : undefined, stretch: chill ? .08 : undefined, lean: chill ? 5 : undefined,
      }))
      runScript(c, steps, c => { c.mode = 'idle'; c.tx = c.ty = undefined })
    }
    // Left behind by the scroll: vanish and pop back in somewhere in view, rather than chase the reader.
    function respawn(c: Actor) {
      const s = findSpot(c)
      if (!s) { c.mode = 'backstage'; c.alpha = 0; return }
      c.mode = 'moving'; c.tx = s.x; c.ty = s.y
      runScript(c, [pop(() => s), lookAround()], c => { c.mode = 'idle'; c.tx = c.ty = undefined })
    }
    function goBackstage(c: Actor) {
      const left = c.x < scrollX + VW / 2
      c.mode = 'moving'
      runScript(c, hop(() => ({ x: left ? scrollX - 16 * K : scrollX + VW + 10, y: c.y }), { lift: 40 }), c => { c.mode = 'backstage'; c.offT = 0; c.alpha = 0 })
    }
    // The last cursor's repertoire: nothing to fix, so it hums, skips, flips, waves and sighs contentedly.
    function happyBeat(c: Actor) {
      c.mode = 'moving'
      const kinds = ['hum', 'skip', 'flip', 'sigh']
      if (ptr.on && Math.hypot(ptr.x - body(c).x, ptr.y - body(c).y) < 400) kinds.push('wave', 'wave')
      const beats: Record<string, Step[]> = {
        hum: [{ d: 2.4, enter: c => { c.eye = 'happy'; c.timer = 0 }, tick: (c, p, e, dt) => { c.rot = Math.sin(e * 4) * 8; c.oy = -Math.abs(Math.sin(e * 4)) * 5; c.timer -= dt; if (c.timer <= 0) { c.timer = .45; const h = head(c); glyph(h.x + 18, h.y - 22, '♪', { color: C.accent, vx: rand(10, 30), vy: -40, size: 16, max: 1.4 }) } } }],
        skip: [{ d: 1.5, enter: c => { c.eye = 'happy' }, tick: (c, p) => { const q = (p * 3) % 1, up = Math.sin(q * Math.PI); c.oy = -18 * up; c.sy = up > .2 ? 1 + .12 * up : 1 - .2 * (1 - up / .2) * (q < .5 ? 0 : 1) - .08; c.sx = 1 / c.sy; c.rot = Math.sin(p * Math.PI * 3) * 6 } }],
        flip: [{ d: .3, tick: (c, p) => { c.sy = 1 - .22 * ease.out(p); c.sx = 1 / c.sy } },
          { d: .95, enter: c => { c.eye = 'happy'; c.flag = false }, tick: (c, p) => { c.oy = -54 * Math.sin(p * Math.PI); c.rot = p < 1 ? 360 * ease.inOut(p) : 0; c.sy = 1.1; c.sx = 1 / 1.1; if (p > .55 && !c.flag) { c.flag = true; spawn({ type: 'spark', x: head(c).x, y: head(c).y - 50, size: 12, max: .5, color: C.accent }) } } },
          land()],
        wave: [{ d: 1.6, enter: c => { c.eye = 'normal' }, tick: (c, p, e) => { const b = body(c); c.lx = clamp((ptr.x - b.x) / 200, -1, 1); c.ly = -.3; c.rot = (ptr.x > b.x ? 1 : -1) * (14 + Math.sin(e * 16) * 10) * Math.sin(p * Math.PI); c.oy = -4 * Math.sin(p * Math.PI) } }],
        sigh: [{ d: 3, enter: c => { c.eye = 'happy' }, tick: (c, p) => { const k = Math.sin(p * Math.PI); c.sy = 1 + .1 * Math.sin(p * Math.PI * 2) * (1 - p); c.sx = 1 / c.sy; c.rot = 10 * k } }],
      }
      runScript(c, beats[pick(kinds)], c => { c.mode = 'idle'; c.eye = 'normal'; c.mouth = 'smile'; c.rot = 0; c.oy = 0; c.lid = 0; c.sy = c.sx = 1 })
    }
    function idleBrain(c: Actor, dt: number) {
      const b = body(c)
      c.breath += dt; c.sy = 1 + (c.chill ? .035 : .025) * Math.sin(c.breath * (c.chill ? 1.6 : 2.4)); c.sx = 1 / c.sy
      if (c.mode === 'backstage') {
        c.offT += dt
        if (c.offT > 1.5 && !fastScroll) { c.offT = 0; respawn(c) }
        return
      }
      if (ptr.on) { const dx = ptr.x - b.x, dy = ptr.y - b.y, d = Math.hypot(dx, dy) || 1; c.lx = lerp(c.lx, dx / d, .15); c.ly = lerp(c.ly, dy / d * .7, .15) }
      if (!onScreen(c)) {
        c.offT += dt
        if (c.offT > rules.leftBehind && !fastScroll) { c.offT = 0; respawn(c) }
        return
      }
      c.offT = 0
      if (fastScroll) return
      c.fleeCD -= dt
      // A cursor still waiting for its scene is curious: it watches you and only steps aside if you land on it.
      const fleeR = c.chill ? rules.personal.happy : c.performed ? rules.personal.performed : rules.personal.waiting
      if (ptr.on && c.fleeCD <= 0 && Math.hypot(ptr.x - b.x, ptr.y - b.y) < fleeR) {
        const s = findSpot(c, { away: ptr, near: c })
        c.fleeCD = c.chill ? 2 : 1
        if (s) { goTo(c, s, c.chill ? { dur: 1.1, lift: 25 } : { startle: true, lift: 50, dur: .55 }); return }
        goBackstage(c); return
      }
      // The page moved under it: rest somewhere free again.
      if (contentBlocked(c.x, c.y)) {
        const s = findSpot(c, { near: c })
        if (s) goTo(c, s); else goBackstage(c)
        return
      }
      if (c.chill) { c.mouth = 'smile'; c.chillT -= dt; if (c.chillT <= 0) { c.chillT = rand(2.5, 5); happyBeat(c); return } }
      c.wanderT -= dt
      if (c.wanderT <= 0) { c.wanderT = c.chill ? rand(5, 9) : rand(4, 9); const s = findSpot(c, { near: c }); if (s) goTo(c, s) }
    }

    function updateChar(c: Actor, dt: number) {
      const acc = -140 * c.lag - 16 * c.lagV; c.lagV += acc * dt; c.lag += c.lagV * dt
      c.dim = lerp(c.dim, selecting && c.mode !== 'performing' ? rules.selectionDim : 1, .12)
      if (c.eye === 'normal') { c.blinkT -= dt; if (c.blinkT < 0) { c.blink = .13; c.blinkT = rand(1.8, 3.8) } }
      if (c.blink > 0) c.blink -= dt
      if (c.steam > 0) { c.steamT -= dt; if (c.steamT <= 0) { c.steamT = .2 / c.steam; const h = head(c); spawn({ type: 'smoke', x: h.x + rand(-10, 10), y: h.y - 26, vx: rand(-20, 20), vy: rand(-90, -60), size: rand(5, 8), max: .7, color: C.dim }) } }
      if (c.frameFade) c.frame = Math.max(0, c.frame - dt * 1.6)
      if (c.script) {
        // No performing to an empty room: a scene holds still while its stage is mostly out of view.
        if (c.mode === 'performing' && c.stage && !c.caught && frozen(visFrac(c.stage.el))) { c.frozen = true; return }
        c.frozen = false
        const st = c.script[c.si]
        c.t += dt
        const p = clamp(c.t / st.d)
        st.tick?.(c, p, c.t, dt)
        if (p >= 1) nextStep(c)
      } else if (c.mode === 'idle' || c.mode === 'backstage') {
        idleBrain(c, dt)
      }
    }

    // ---------- director ----------
    let fastScroll = false, scrollSpeed = 0, lastScroll = scrollY, keepT = 0, liveT = 0, standDown = false
    // The page inside a frame is the participant player's first impression, part of a study: the troupe never plays there.
    const framed = window.top !== window.self
    /**
     * A live ui-tests surface on the page: a task bar or an invitation that is not `.uit-contained`. The join sheet the landing shows
     * in its sources table is a picture of one, inside one of the page's figures, so a surface inside `[data-figure]` doesn't count.
     */
    const studying = () => framed || [...document.querySelectorAll(liveSurface)].some(node => !node.closest('[data-figure]'))
    function director(dt: number) {
      if (!finale()) {
        const ready: Live[] = []
        for (const st of STAGES) {
          const el = st.el
          if (!el || !playable(st)) { st.seen = 0; continue }
          const next = gate(st, { fraction: visFrac(el), whole: fullyIn(el), fastScroll, clash: STAGES.some(o => o !== st && o.busy && clash(o, st)) }, dt)
          st.seen = next.seen; st.left = next.left
          if (next.ready) ready.push(st)
        }
        // At most two scenes at once; of the stages ready, the one whose exit has been used least, so every exit gets its turn.
        if (ready.length && chars.filter(c => c.mode === 'performing').length < rules.maxScenes) {
          const st = choose(ready.map(live => ({ fate: live.stage.fate, live })), exitsInPlay())!.live
          const c = performerFor(st)
          if (c) cast(st, c)
        }
      }
      waveDirector(dt)
      chars = chars.filter(c => c.mode !== 'gone')
    }

    // ---------- drawing ----------
    function drawChar(c: Actor) {
      if (c.alpha <= 0 || c.s <= .01 || c.mode === 'backstage') return
      const b = body(c)
      if (b.y < scrollY - 120 || b.y > scrollY + VH + 120 || b.x < scrollX - 120 || b.x > scrollX + VW + 120) return
      const fill = mix(C.fill, C.red, c.tint * .85), line = C.stroke
      const lagStretch = 1 + Math.min(.3, Math.abs(c.lagV) / 500)
      ctx.save()
      ctx.globalAlpha = c.alpha * c.dim
      ctx.translate(c.x + c.jx, c.y + c.oy + c.jy + c.lag)
      ctx.translate(5 * K, 10 * K)
      ctx.rotate(c.rot * Math.PI / 180)
      ctx.scale(c.s, c.s)
      ctx.translate(0, 8 * K)
      ctx.scale(c.sx / lagStretch, c.sy * lagStretch)
      ctx.translate(-5 * K, -18 * K)

      ctx.beginPath()
      ARROW.forEach(([x, y], i) => i ? ctx.lineTo(x * K, y * K) : ctx.moveTo(x * K, y * K))
      ctx.closePath()
      ctx.fillStyle = fill; ctx.fill()
      ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = line; ctx.stroke()

      const r = 1.22 * K * c.wide
      ctx.lineWidth = 1.3; ctx.lineCap = 'round'
      ;[[2.35, 7.7], [5.25, 8.3]].forEach(([ex, ey], i) => {
        const X = ex * K, Y = ey * K
        if (c.eye === 'happy') { ctx.beginPath(); ctx.arc(X, Y + r * .35, r * .8, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = line; ctx.lineWidth = 1.7; ctx.stroke(); ctx.lineWidth = 1.3; return }
        ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fillStyle = C.fill; ctx.fill(); ctx.strokeStyle = line; ctx.stroke()
        if (c.eye === 'spiral') {
          ctx.beginPath()
          for (let t = 0; t <= Math.PI * 3; t += .3) { const rr = r * .9 * t / (Math.PI * 3), a = t + now * 9 * (i ? 1 : -1); const px = X + Math.cos(a) * rr, py = Y + Math.sin(a) * rr; if (t) ctx.lineTo(px, py); else ctx.moveTo(px, py) }
          ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = 1.3
        } else if (c.eye === 'x') {
          const d = r * .55; ctx.beginPath(); ctx.moveTo(X - d, Y - d); ctx.lineTo(X + d, Y + d); ctx.moveTo(X + d, Y - d); ctx.lineTo(X - d, Y + d); ctx.stroke()
        } else {
          const pr = .55 * K * (c.wide > 1.1 ? .75 : 1)
          ctx.beginPath(); ctx.arc(X + c.lx * .5 * K, Y + c.ly * .5 * K, pr, 0, Math.PI * 2); ctx.fillStyle = line; ctx.fill()
          const lid = Math.max(c.lid, c.blink > 0 ? 1 : 0)
          if (lid > 0) {
            ctx.save(); ctx.beginPath(); ctx.arc(X, Y, r + .4, 0, Math.PI * 2); ctx.clip()
            ctx.fillStyle = fill; ctx.fillRect(X - r - 1, Y - r - 1, 2 * r + 2, (2 * r + 1) * lid + 1)
            ctx.restore()
            ctx.beginPath(); ctx.moveTo(X - r * .95, Y - r + 2 * r * lid); ctx.lineTo(X + r * .95, Y - r + 2 * r * lid); ctx.strokeStyle = line; ctx.stroke()
          }
        }
        if (Math.abs(c.brow) > .05) {
          const y0 = Y - r - .55 * K, inner = i ? X - r * .9 : X + r * .9, outer = i ? X + r : X - r
          ctx.beginPath(); ctx.moveTo(outer, y0 - c.brow * .35 * K); ctx.lineTo(inner, y0 + c.brow * .55 * K); ctx.lineWidth = 1.7; ctx.strokeStyle = line; ctx.stroke(); ctx.lineWidth = 1.3
        }
      })

      const mx = 3.7 * K, my = 11 * K
      ctx.strokeStyle = line; ctx.fillStyle = line
      if (c.mouth === 'smile') { ctx.beginPath(); ctx.arc(mx, my - .6 * K, .95 * K, Math.PI * .2, Math.PI * .8); ctx.stroke() }
      else if (c.mouth === 'o') { ctx.beginPath(); ctx.ellipse(mx, my, .45 * K * (.4 + c.mo), .6 * K * (.4 + c.mo), 0, 0, Math.PI * 2); ctx.fill() }
      else if (c.mouth === 'grit') {
        ctx.beginPath(); ctx.rect(mx - 1.1 * K, my - .4 * K, 2.2 * K, .8 * K); ctx.fillStyle = C.fill; ctx.fill(); ctx.stroke()
        ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(mx - 1.1 * K + k * .55 * K, my - .4 * K); ctx.lineTo(mx - 1.1 * K + k * .55 * K, my + .4 * K) } ctx.lineWidth = 1; ctx.stroke()
      } else if (c.mouth === 'wave') {
        ctx.beginPath(); for (let k = 0; k <= 6; k++) { const px = mx - K + k * K / 3, py = my + (k % 2 ? -.25 : .25) * K; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py) } ctx.stroke()
      } else if (c.mouth === 'pant') {
        ctx.beginPath(); ctx.ellipse(mx, my, .6 * K, .45 * K, 0, 0, Math.PI); ctx.fill()
        ctx.beginPath(); ctx.ellipse(mx + .2 * K, my + .55 * K, .3 * K, .4 * K, 0, 0, Math.PI * 2); ctx.fillStyle = C.red; ctx.fill()
      }
      if (c.sweat > 0) {
        const sx = 9.6 * K, sy = 4.6 * K + Math.sin(now * 6) * 2
        ctx.globalAlpha = c.alpha * c.dim * c.sweat
        ctx.beginPath(); ctx.moveTo(sx, sy - 6); ctx.quadraticCurveTo(sx + 5, sy + 2, sx, sy + 4); ctx.quadraticCurveTo(sx - 5, sy + 2, sx, sy - 6)
        ctx.fillStyle = C.teal; ctx.fill()
      }
      ctx.restore()

      if (c.orbit > 0) {
        const h = head(c)
        ctx.save(); ctx.font = glyphFont(16)
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.accent
        for (let i = 0; i < c.orbit; i++) { const a = now * (3 + c.orbit * .4) + i * Math.PI * 2 / c.orbit; ctx.fillText('?', h.x + Math.cos(a) * 32, h.y - 18 + Math.sin(a) * 11) }
        ctx.restore()
      }
    }
    function drawTrail(c: Actor) {
      if (!c.trail || c.trail.length < 2) return
      const h = head(c)
      ctx.save(); ctx.setLineDash([3, 6]); ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = C.accent; ctx.globalAlpha = .75 * c.dim
      ctx.beginPath()
      c.trail.forEach((pt, i) => {
        let x = pt.x, y = pt.y
        if (c.knot > 0) { const a = i * .37 + now * 2, rr = 20 + 6 * Math.sin(i * .9); x = lerp(x, h.x + Math.cos(a) * rr, c.knot); y = lerp(y, h.y + Math.sin(a) * rr * .8, c.knot) }
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      })
      ctx.stroke(); ctx.restore()
    }
    function drawHook(hk: Point) {
      ctx.save(); ctx.strokeStyle = C.cane; ctx.lineWidth = 6; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(hk.x - 1800, hk.y + 22); ctx.lineTo(hk.x, hk.y + 22); ctx.arc(hk.x, hk.y, 22, Math.PI / 2, -Math.PI / 2, true); ctx.lineTo(hk.x - 9, hk.y - 18); ctx.stroke()
      ctx.restore()
    }
    function drawSpinner(sp: Point & { r: number }) {
      if (sp.r < .8) return
      ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, sp.r * .16); ctx.strokeStyle = C.accent
      for (let i = 0; i < 10; i++) {
        const a = now * 5 + i * Math.PI / 5; ctx.globalAlpha = (i + 1) / 10
        ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(a) * sp.r * .5, sp.y + Math.sin(a) * sp.r * .5); ctx.lineTo(sp.x + Math.cos(a) * sp.r, sp.y + Math.sin(a) * sp.r); ctx.stroke()
      }
      ctx.restore()
    }
    /** The catch: the logomark, a square with its notch, drawn around the cursor. */
    function drawFrame(c: Actor) {
      if (c.frame <= 0) return
      const b = body(c), L = 30 * K, x0 = b.x - L / 2, y0 = b.y - L / 2
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 5; ctx.lineJoin = 'miter'
      const prog = c.frameFade ? 1 : c.frame
      ctx.globalAlpha = c.frameFade ? c.frame : 1
      ctx.setLineDash([4 * L * prog, 4 * L]); ctx.strokeRect(x0, y0, L, L)
      ctx.setLineDash([L * prog, L]); ctx.beginPath(); ctx.moveTo(x0 + L / 2, y0); ctx.lineTo(x0 + L / 2, y0 + L / 2); ctx.lineTo(x0 + L, y0 + L / 2); ctx.stroke()
      ctx.restore()
    }
    function drawFx(f: Effect) {
      const t = f.life / f.max
      ctx.save()
      if (f.type === 'ring') { ctx.globalAlpha = 1 - t; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (.25 + ease.out(t)), 0, Math.PI * 2); ctx.stroke() }
      else if (f.type === 'smoke') { ctx.globalAlpha = .45 * (1 - t); ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (.6 + t), 0, Math.PI * 2); ctx.fill() }
      else if (f.type === 'glyph') {
        ctx.globalAlpha = 1 - t * t; ctx.fillStyle = f.color; ctx.translate(f.x, f.y); ctx.rotate(f.rot)
        const sc = .6 + .4 * ease.outBack(Math.min(1, t * 4)); ctx.scale(sc, sc)
        ctx.font = glyphFont(f.size); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text ?? '', 0, 0)
      } else if (f.type === 'shard') {
        ctx.globalAlpha = 1 - t; ctx.translate(f.x, f.y); ctx.rotate(f.rot)
        ctx.beginPath(); ctx.moveTo(0, -f.size); ctx.lineTo(f.size * .8, f.size * .6); ctx.lineTo(-f.size * .6, f.size * .4); ctx.closePath()
        ctx.fillStyle = f.color; ctx.fill(); ctx.strokeStyle = C.stroke; ctx.lineWidth = 1.5; ctx.stroke()
      } else if (f.type === 'confetti') { ctx.globalAlpha = 1 - t * t; ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = f.color; ctx.fillRect(-f.size / 2, -f.size / 4, f.size, f.size / 2) }
      else if (f.type === 'spark') {
        ctx.globalAlpha = 1 - t; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r1 = f.size * (.3 + t), r2 = f.size * (.7 + t * 1.2); ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1); ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2); ctx.stroke() }
      }
      ctx.restore()
    }
    function draw() {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
      ctx.clearRect(0, 0, VW, VH)
      ctx.translate(-scrollX, -scrollY)
      for (const c of chars) drawTrail(c)
      for (const c of chars) if (c.spinner) drawSpinner(c.spinner)
      for (const c of chars) if (c.hook) drawHook(c.hook)
      for (const c of chars) drawFrame(c)
      for (const c of chars) drawChar(c)
      for (const f of fx) drawFx(f)
    }

    // ---------- loop ----------
    let raf = 0, last = performance.now()
    function frame(ts: number) {
      const dt = Math.min(.05, Math.max(0, ts - last) / 1000); last = ts
      const dy = scrollY - lastScroll; lastScroll = scrollY
      scrollSpeed = lerp(scrollSpeed, Math.abs(dy) / Math.max(dt, 1e-3), .2)
      fastScroll = scrollSpeed > rules.fastScroll
      // Hold still while the visitor reads: idle cursors lag and stretch with the scroll.
      if (dy) { ptr.x = ptr.cx + scrollX; ptr.y = ptr.cy + scrollY; for (const c of chars) if (c.mode !== 'performing' && c.mode !== 'leaving') c.lag = clamp(c.lag + dy * .12, -34, 34) }
      keepT -= dt; if (keepT <= 0) { keepT = .25; collectKeeps() }
      // Stand down during a study: no cursors while a live ui-tests surface shows, and any on screen leave at once.
      liveT -= dt; if (liveT <= 0) {
        liveT = .2
        const was = standDown
        standDown = studying()
        // The wave the study interrupted starts over once it has gone.
        if (was && !standDown) startWave(wave.at)
      }
      if (standDown) {
        chars = []; fx.length = 0
        for (const st of STAGES) { st.busy = false; st.seen = 0 }
      } else {
        now += dt
        director(dt)
        for (const c of chars.slice()) updateChar(c, dt)
      }
      // The pointer the page shows follows the cursors too: one that swings under a still pointer, is caught, or stands down.
      if (ptr.on || pointing) hover()
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]
        f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt; f.rot += f.vr * dt
        if (f.type === 'smoke') { f.vx *= .96; f.vy *= .96 }
        if (f.life >= f.max) fx.splice(i, 1)
      }
      publish(wave.at, chars)
      draw()
      raf = requestAnimationFrame(frame)
    }
    // One loop, and none while the tab is hidden.
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (document.visibilityState === 'visible') { last = performance.now(); raf = requestAnimationFrame(frame) }
    }

    // ---------- input ----------
    // A click on a cursor in trouble catches it, and that click stops there: the pointerdown and everything it would lead to, so a
    // link under the cursor doesn't navigate. Every other click goes straight through to the page.
    const hitTest = (x: number, y: number) => chars.find(c => c.trouble && !c.caught && c.alpha > 0 && Math.hypot(body(c).x - x, body(c).y - y) < 15 * K * Math.max(c.s, .8))
    let swallowing = false, unswallow = 0
    const swallow = (e: Event) => { if (swallowing) { e.preventDefault(); e.stopImmediatePropagation(); if (e.type === 'click') swallowing = false } }
    const onPointerDown = (e: PointerEvent) => {
      if (standDown) return
      const c = hitTest(e.clientX + scrollX, e.clientY + scrollY)
      if (!c) return
      e.preventDefault(); e.stopImmediatePropagation()
      swallowing = true
      clearTimeout(unswallow); unswallow = window.setTimeout(() => { swallowing = false }, 800)
      rescue(c)
    }
    // While the pointer is over a cursor in trouble, the page shows a pointer. The rule lives in an adopted sheet, out of the markup.
    const sheet = new CSSStyleSheet()
    let pointing = false
    function hover() {
      const over = !standDown && !!hitTest(ptr.cx + scrollX, ptr.cy + scrollY)
      if (over === pointing) return
      pointing = over
      sheet.replaceSync(over ? '* { cursor: pointer !important; }' : '')
    }
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]

    addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('selectionchange', onSelection)
    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    for (const type of ['mousedown', 'mouseup', 'pointerup', 'click']) document.addEventListener(type, swallow, { capture: true })
    document.addEventListener('visibilitychange', onVisibility)
    addEventListener('resize', resize)
    addEventListener('load', collectKeeps)
    void document.fonts?.ready.then(collectKeeps)
    resize()
    startWave(1)
    if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf); clearTimeout(unswallow)
      removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('selectionchange', onSelection)
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      for (const type of ['mousedown', 'mouseup', 'pointerup', 'click']) document.removeEventListener(type, swallow, { capture: true })
      document.removeEventListener('visibilitychange', onVisibility)
      removeEventListener('resize', resize)
      removeEventListener('load', collectKeeps)
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet)
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height)
      publish(1, [])
    }
  }, [reduced])
  return <canvas ref={canvas} className="cursor-follies" aria-hidden="true" />
}
