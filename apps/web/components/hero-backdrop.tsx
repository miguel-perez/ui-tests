'use client'
import { useEffect, useRef, useState } from 'react'
import { texture } from '../lib/texture'
import { session, kinds, type Moment } from '../lib/sessions'

const p3 = session('p3')
/** The moments the system detects: problems, pauses, deviations, backtracks and dead clicks, each where the cursor was. */
const sensed = (p3.moments as Moment[]).filter(moment => moment.at && (moment.issue || ['pause', 'deviation', 'dead'].includes(kinds[moment.kind]?.signal ?? '')))
/** The poster frame is 00:05, the pause in the Share menu: under reduced motion its sensor is the still. */
const still = sensed.filter(moment => moment.seconds === 5)
const PULSE = 1.6
/** One pulse: the ring grows from the cursor and fades. */
const pulse: Keyframe[] = [{ transform: 'scale(.4)', opacity: 0 }, { opacity: 1, offset: .15 }, { transform: 'scale(1.4)', opacity: 0 }]

function useReducedMotion() {
  const [reduced, setReduced] = useState(true)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

let pointer: Path2D | undefined
/**
 * Ambient decoration inside the texture: now and then, one small unlabelled gesture on a trace line (a hesitation, a burst of
 * clicks, a step back). Drawn in the texture's own ink at no more than its alpha, so the text-contrast check still holds.
 */
function gesture(ctx: CanvasRenderingContext2D, t: number, width: number, line: (row: number, x: number) => number) {
  const period = 9, life = 3.2, index = Math.floor(t / period), phase = (t % period) / life
  if (phase >= 1) return
  const row = 3 + (index * 7) % 18, x = width * (0.08 + ((index * 0.618) % 1) * 0.84), y = line(row, x)
  const fade = Math.sin(Math.PI * phase)
  ctx.save(); ctx.globalAlpha = texture.maxAlpha * fade; ctx.translate(x, y)
  const kind = index % 3
  if (kind === 0) for (let ring = 0; ring < 3; ring++) { const r = 4 + ((phase * 3 + ring / 3) % 1) * 14; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke() }
  if (kind === 1) { ctx.beginPath(); ctx.arc(0, 0, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * phase); ctx.stroke(); ctx.translate(Math.sin(phase * 18) * 3, 0) }
  if (kind === 2) { ctx.beginPath(); ctx.moveTo(18, 6); ctx.quadraticCurveTo(0, 18, -18, 6); ctx.stroke(); ctx.translate(18 - 36 * Math.min(1, phase * 1.4), 6) }
  ctx.fill(pointer ??= new Path2D('M0 0v13l3.3-3.2 2.3 5 2.2-.9-2.3-4.9H10Z'))
  ctx.restore()
}

/** Fine lines drifting like cursor traces: strongest behind the hero, masked out by the second block. */
function drawTexture(canvas: HTMLCanvasElement, time: number, decorate: boolean) {
  const ratio = Math.min(devicePixelRatio || 1, 1.5), width = canvas.clientWidth, height = canvas.clientHeight
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = texture.stroke; ctx.fillStyle = texture.stroke; ctx.lineWidth = 0.75
  const t = time / 1000
  const line = (row: number, x: number) => { const base = (row + 0.5) * height / texture.rows, phase = row * 1.7; return base + Math.sin(x / 210 + phase + t * 0.11) * 22 + Math.sin(x / 67 - phase * 0.6 - t * 0.07) * 6 }
  for (let row = 0; row < texture.rows; row++) {
    ctx.globalAlpha = texture.maxAlpha * (0.35 + 0.65 * (1 - row / texture.rows))
    ctx.beginPath()
    for (let x = -8; x <= width + 8; x += 12) x < 0 ? ctx.moveTo(x, line(row, x)) : ctx.lineTo(x, line(row, x))
    ctx.stroke()
  }
  if (decorate) gesture(ctx, t, width, line)
  ctx.globalAlpha = 1
}

/**
 * Behind the hero: the texture, and the real P3 session playing small, dim and slow, with the behaviours happening in context and
 * unnamed. Where the system detects a moment, only a small pulse at the cursor in the moment hue appears; nothing is written.
 * Under reduced motion the session is its poster with that frame's sensor, and the texture is one still frame.
 */
export function HeroBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  const sensors = useRef<(HTMLSpanElement | null)[]>([])
  useEffect(() => {
    const element = canvas.current!
    let frame = 0, last = 0, clock = 0, visible = true
    const tick = (time: number) => {
      if (visible && time - last >= texture.frameMs) { clock += Math.min(time - last, 100); last = time; drawTexture(element, clock, true) }
      frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    observer.observe(element)
    // Paint once now; animate only after the page has settled, so motion never competes with the first paint.
    drawTexture(element, clock, false)
    const start = reduced ? undefined : setTimeout(() => { last = performance.now(); frame = requestAnimationFrame(tick) }, 600)
    const resize = new ResizeObserver(() => drawTexture(element, clock, !reduced))
    resize.observe(element)
    return () => { clearTimeout(start); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect() }
  }, [reduced])
  useEffect(() => {
    const element = video.current!
    if (reduced) { element.pause(); return }
    let frame = 0, previous = 0
    // Every sensor is always in the DOM and pulses through the Web Animations API, so the page's markup never changes on its own
    // and a recorder comparing it before and after a visitor's click still sees a dead click as dead.
    const sense = () => {
      const t = element.currentTime
      sensed.forEach((moment, index) => {
        const crossed = t < previous ? moment.seconds <= t : moment.seconds > previous && moment.seconds <= t
        if (crossed) sensors.current[index]?.animate(pulse, { duration: PULSE * 1000, easing: 'ease-out' })
      })
      previous = t
      frame = requestAnimationFrame(sense)
    }
    // The session starts after the page has settled, so the poster is the first paint and the video never delays it.
    const start = setTimeout(() => { element.playbackRate = 0.6; void element.play().catch(() => {}); frame = requestAnimationFrame(sense) }, 1200)
    return () => { clearTimeout(start); cancelAnimationFrame(frame); element.pause() }
  }, [reduced])
  return <div className="hero-backdrop" aria-hidden="true" data-motion={reduced ? 'still' : 'running'}>
    <canvas ref={canvas} className="trace-texture" data-motion={reduced ? 'still' : 'running'} />
    <div className="hero-session">
      <video ref={video} src={p3.video} poster={p3.poster} muted loop playsInline preload="none" tabIndex={-1} />
      {sensed.map((moment, index) => <span key={moment.seconds} ref={node => { sensors.current[index] = node }} className={still.includes(moment) ? 'sensor poster' : 'sensor'} style={{ left: `${moment.at![0] * 100}%`, top: `${moment.at![1] * 100}%` }} />)}
    </div>
  </div>
}
