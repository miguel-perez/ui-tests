'use client'
import { useEffect, useRef, useState } from 'react'
import { texture } from '../lib/texture'

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

/** Fine lines drifting like cursor traces, in the line token: strongest behind the hero, masked out by the second block. */
function drawTexture(canvas: HTMLCanvasElement, time: number) {
  const ratio = Math.min(devicePixelRatio || 1, 1.5), width = canvas.clientWidth, height = canvas.clientHeight
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue(texture.token).trim(); ctx.lineWidth = texture.lineWidth
  const t = time / 1000
  const line = (row: number, x: number) => { const base = (row + 0.5) * height / texture.rows, phase = row * 1.7; return base + Math.sin(x / 210 + phase + t * texture.speed) * 22 + Math.sin(x / 67 - phase * 0.6 - t * texture.speed * 0.64) * 6 }
  for (let row = 0; row < texture.rows; row++) {
    ctx.globalAlpha = texture.maxAlpha * (0.35 + 0.65 * (1 - row / texture.rows))
    ctx.beginPath()
    for (let x = -8; x <= width + 8; x += 12) x < 0 ? ctx.moveTo(x, line(row, x)) : ctx.lineTo(x, line(row, x))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/**
 * Behind the hero: the texture alone. Its waves move slowly and continuously while the hero is in view; under reduced motion
 * they are one still frame. Nothing else sits behind the hero: no recording, no gestures, no sensors.
 */
export function HeroBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const element = canvas.current!
    let frame = 0, last = 0, clock = 0, visible = true
    const tick = (time: number) => {
      if (visible && time - last >= texture.frameMs) { clock += Math.min(time - last, 100); last = time; drawTexture(element, clock) }
      frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    observer.observe(element)
    // Paint once now; animate only after the page has settled, so motion never competes with the first paint.
    drawTexture(element, clock)
    const start = reduced ? undefined : setTimeout(() => { last = performance.now(); frame = requestAnimationFrame(tick) }, 600)
    const resize = new ResizeObserver(() => drawTexture(element, clock))
    resize.observe(element)
    return () => { clearTimeout(start); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect() }
  }, [reduced])
  return <div className="hero-backdrop" aria-hidden="true" data-motion={reduced ? 'still' : 'running'}>
    <canvas ref={canvas} className="trace-texture" data-motion={reduced ? 'still' : 'running'} />
  </div>
}
