'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icon'
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

/** Fine lines drifting like cursor traces: strongest behind the hero, masked out by the second block. */
function drawTexture(canvas: HTMLCanvasElement, time: number) {
  const ratio = Math.min(devicePixelRatio || 1, 1.5), width = canvas.clientWidth, height = canvas.clientHeight
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = texture.stroke; ctx.fillStyle = texture.stroke; ctx.lineWidth = 0.75
  const t = time / 1000
  for (let row = 0; row < texture.rows; row++) {
    const base = (row + 0.5) * height / texture.rows, phase = row * 1.7
    const y = (x: number) => base + Math.sin(x / 210 + phase + t * 0.11) * 22 + Math.sin(x / 67 - phase * 0.6 - t * 0.07) * 6
    ctx.globalAlpha = texture.maxAlpha * (0.35 + 0.65 * (1 - row / texture.rows))
    ctx.beginPath()
    for (let x = -8; x <= width + 8; x += 12) x < 0 ? ctx.moveTo(x, y(x)) : ctx.lineTo(x, y(x))
    ctx.stroke()
    // Every fourth line carries a travelling point, like a cursor position on a trace.
    if (row % 4 === 1) {
      const x = ((t * 18 + row * 173) % (width + 120)) - 60
      ctx.beginPath(); ctx.arc(x, y(x), 1.6, 0, Math.PI * 2); ctx.fill()
    }
  }
  ctx.globalAlpha = 1
}

export function HeroMotion() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const [replay, setReplay] = useState(0)
  useEffect(() => {
    const element = canvas.current!
    // The texture keeps its own clock so pausing holds the exact frame and resuming continues from it.
    let frame = 0, last = 0, clock = Number(element.dataset.time ?? 0), visible = true
    const still = reduced || paused
    const tick = (time: number) => {
      if (visible && time - last >= texture.frameMs) { clock += Math.min(time - last, 100); last = time; drawTexture(element, clock) }
      frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    observer.observe(element)
    // Paint once now; animate only after the page has settled, so motion never competes with the first paint.
    drawTexture(element, clock)
    const start = still ? undefined : setTimeout(() => { last = performance.now(); frame = requestAnimationFrame(tick) }, 600)
    const resize = new ResizeObserver(() => drawTexture(element, clock))
    resize.observe(element)
    return () => { clearTimeout(start); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); element.dataset.time = String(clock) }
  }, [paused, reduced])
  return <>
    <canvas ref={canvas} className="trace-texture" aria-hidden="true" data-motion={reduced ? 'still' : paused ? 'paused' : 'running'} />
    <div className="hero-illustration site-width" data-motion={reduced ? 'still' : 'running'}>
      <div key={replay} className={`gesture-scenes ${reduced ? 'still' : ''}`}>
        <figure className="gesture-scene hesitate">
          <svg viewBox="0 0 280 150" aria-hidden="true">
            <rect className="g-panel" x="64" y="14" width="152" height="112" rx="8" />
            <rect className="g-highlight" x="72" y="22" width="136" height="28" rx="5" />
            {[36, 70, 104].map(y => <g key={y}><circle className="g-glyph" cx="90" cy={y} r="5" /><path className="g-text" d={`M104 ${y}h${y === 70 ? 64 : 82}`} /></g>)}
            <circle className="g-timer" cx="186" cy="110" r="15" pathLength="100" />
            <g className="g-move"><g className="g-pointer"><path d="M0 0v18l4.6-4.4 3.2 7 3-1.3-3.2-6.8H14Z" /></g></g>
          </svg>
          <figcaption>Hesitates in a menu</figcaption>
        </figure>
        <figure className="gesture-scene rage">
          <svg viewBox="0 0 280 150" aria-hidden="true">
            <g className="g-button"><rect className="g-panel" x="80" y="56" width="120" height="40" rx="6" /><path className="g-text" d="M120 76h40" /></g>
            {[0, 1, 2].map(ring => <circle key={ring} className={`g-ring ring-${ring}`} cx="150" cy="80" r="22" />)}
            <text className="g-count" x="206" y="52">×4</text>
            <g className="g-move"><g className="g-pointer"><path d="M0 0v18l4.6-4.4 3.2 7 3-1.3-3.2-6.8H14Z" /></g></g>
          </svg>
          <figcaption>Rage-clicks a button</figcaption>
        </figure>
        <figure className="gesture-scene backtrack">
          <svg viewBox="0 0 280 150" aria-hidden="true">
            <g className="g-page-a"><rect className="g-panel" x="18" y="22" width="96" height="88" rx="6" /><path className="g-text" d="M30 40h50M30 56h66M30 72h40" /></g>
            <g className="g-page-b"><rect className="g-panel" x="166" y="22" width="96" height="88" rx="6" /><path className="g-text" d="M178 40h50M178 56h66M178 72h40" /></g>
            <path className="g-trail" d="M206 118C176 142 104 142 74 118" pathLength="100" />
            <path className="g-trail-head" d="m82 112-8 6 9 4" />
            <g className="g-move"><g className="g-pointer"><path d="M0 0v18l4.6-4.4 3.2 7 3-1.3-3.2-6.8H14Z" /></g></g>
          </svg>
          <figcaption>Backtracks a page</figcaption>
        </figure>
        <figure className="gesture-scene submit">
          <svg viewBox="0 0 280 150" aria-hidden="true">
            <rect className="g-panel" x="48" y="10" width="184" height="128" rx="8" />
            <rect className="g-field" x="64" y="28" width="152" height="20" rx="4" />
            <rect className="g-field" x="64" y="58" width="152" height="20" rx="4" />
            <g className="g-button"><rect className="g-panel" x="152" y="96" width="64" height="26" rx="4" /><path className="g-text" d="M170 109h28" /></g>
            <text className="g-question" x="222" y="92">?</text>
            <g className="g-move"><g className="g-pointer"><path d="M0 0v18l4.6-4.4 3.2 7 3-1.3-3.2-6.8H14Z" /></g></g>
          </svg>
          <figcaption>Submits a form that does nothing</figcaption>
        </figure>
      </div>
      <div className="motion-controls">
        <button type="button" onClick={() => setReplay(value => value + 1)}><Icon name="replay" size={16} />Replay frustration gestures</button>
        <button type="button" aria-pressed={paused || reduced} onClick={() => setPaused(value => !value)} disabled={reduced}><Icon name={paused || reduced ? 'play' : 'pause'} size={16} />{reduced ? 'Texture still' : paused ? 'Resume texture' : 'Pause texture'}</button>
      </div>
    </div>
  </>
}
