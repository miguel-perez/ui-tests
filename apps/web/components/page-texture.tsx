'use client'
import { useEffect, useRef, useState } from 'react'
import { texture, rowAt, lineY, stretchAt, stops } from '../lib/texture'

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

/** A token's colour as the canvas reads it: resolved through a one-pixel probe, so `color-mix()` arrives as channels. */
function channels(element: HTMLElement, token: string) {
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  element.style.color = `var(${token})`
  probe.fillStyle = getComputedStyle(element).color
  element.style.color = ''
  probe.fillRect(0, 0, 1, 1)
  return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)]
}

type Colours = { line: number[]; accent: number[]; ground: number[] }
/** `colour` at `alpha` over the ground, as one opaque colour. */
const mixed = (colour: number[], ground: number[], alpha: number) => `rgb(${colour.map((value, i) => Math.round(ground[i] + (value - ground[i]) * alpha)).join(', ')})`

/**
 * Paints one tile, `top` to `top + height` in the layer's px, at `seconds`, at the device pixel ratio. The tile is first filled with the
 * canvas colour, so it is opaque, and each line is stroked opaque in its colours already mixed over the canvas at its row's alpha,
 * with `darken`: where lines cross the darker one shows, so no pixel is ever stronger than the strongest line.
 */
function paint(tile: HTMLCanvasElement, width: number, top: number, height: number, seconds: number, colours: Colours) {
  const ratio = devicePixelRatio || 1
  const w = Math.round(width * ratio), h = Math.round(height * ratio)
  if (tile.width !== w || tile.height !== h) { tile.width = w; tile.height = h }
  const ctx = tile.getContext('2d')!
  ctx.setTransform(ratio, 0, 0, ratio, 0, -top * ratio)
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
  ctx.fillStyle = mixed(colours.ground, colours.ground, 1); ctx.fillRect(0, top, width, height)
  ctx.globalCompositeOperation = 'darken'; ctx.lineWidth = texture.lineWidth
  const reach = texture.amplitude[0] + texture.amplitude[1] + texture.spacing
  const first = Math.max(0, Math.floor((top - reach) / texture.spacing)), last = Math.ceil((top + height + reach) / texture.spacing)
  for (let index = first; index <= last; index++) {
    const stretch = stretchAt(index, width, seconds)
    const from = Math.max(-texture.step, stretch.from), to = Math.min(width + texture.step, stretch.to)
    if (to <= from) continue
    const { alpha } = rowAt(index), gradient = ctx.createLinearGradient(stretch.from, 0, stretch.to, 0)
    const colour = { none: colours.ground, line: colours.line, accent: colours.accent }
    for (const stop of stops) gradient.addColorStop(stop.at, mixed(colour[stop.colour], colours.ground, alpha))
    ctx.strokeStyle = gradient
    ctx.beginPath(); ctx.moveTo(from, lineY(index, from, seconds))
    for (let x = from + texture.step; ; x += texture.step) { const at = Math.min(x, to); ctx.lineTo(at, lineY(index, at, seconds)); if (at === to) break }
    ctx.stroke()
  }
}

/**
 * Behind the whole page (issue #51): a layer at the top of the document, below the content, as wide as the page and as tall as it,
 * so the lines scroll with the page behind every section and the footer. It is drawn in canvas tiles at the device pixel ratio: the
 * tiles near the window are painted, the ones in view move, and the ones far away are released, so a tall page costs neither frames
 * nor memory. Redrawn when the page's height or width changes; under reduced motion the page is one still frame. The layer keeps its
 * clock in a `clock` property for the motion test, never in the markup: the recorder reads a click that changed the markup as one
 * that did something; its tiles sit in its shadow root for the same reason.
 */
export function PageTexture() {
  const layer = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const root = layer.current!, textured = root as HTMLDivElement & { clock?: number }
    // The tiles live in the layer's shadow root, out of the page's markup: allocating and releasing them as the page scrolls never
    // reads as a change the visitor's click made.
    const shadow = root.shadowRoot ?? root.attachShadow({ mode: 'open' })
    const colours = { line: channels(root, texture.token), accent: channels(root, texture.accentToken), ground: channels(root, texture.groundToken) }
    const tiles: HTMLCanvasElement[] = [], drawn = new WeakSet<HTMLCanvasElement>()
    let width = 0, height = 0, frame = 0, last = 0, clock = 0
    /** The span of the layer, in its own px, from `margin` window heights above the window to `margin` below it. */
    const range = (margin: number) => { const top = -root.getBoundingClientRect().top; return [top - innerHeight * margin, top + innerHeight * (1 + margin)] }
    const box = (i: number) => [i * texture.tile, Math.min(texture.tile, height - i * texture.tile)] as const
    const draw = (tile: HTMLCanvasElement, i: number) => { const [top, h] = box(i); paint(tile, width, top, h, clock / 1000, colours); drawn.add(tile) }
    const release = (tile: HTMLCanvasElement) => { tile.width = 0; tile.height = 0; drawn.delete(tile) }
    /** Paints the tiles near the window that are not painted yet, and releases the ones far from it. */
    const settle = () => {
      const [near, far] = range(0.5)
      tiles.forEach((tile, i) => {
        const [top, h] = box(i), close = top < far && top + h > near
        if (close && !drawn.has(tile)) draw(tile, i)
        if (!close && drawn.has(tile)) release(tile)
      })
    }
    const layout = () => {
      width = root.clientWidth; height = root.clientHeight
      const count = Math.max(1, Math.ceil(height / texture.tile))
      while (tiles.length < count) { const tile = document.createElement('canvas'); tile.className = 'page-texture-tile'; tile.style.cssText = 'position: absolute; left: 0; display: block; width: 100%'; release(tile); shadow.append(tile); tiles.push(tile) }
      while (tiles.length > count) tiles.pop()!.remove()
      // Every tile starts again from nothing; the ones near the window are painted again straight away, in the same task.
      tiles.forEach((tile, i) => { const [top, h] = box(i); tile.style.top = `${top}px`; tile.style.height = `${h}px`; release(tile) })
      settle()
    }
    const tick = (time: number) => {
      if (time - last >= texture.frameMs) {
        clock += Math.min(time - last, 100); last = time
        textured.clock = clock
        const [top, bottom] = range(0)
        tiles.forEach((tile, i) => { const [y, h] = box(i); if (y < bottom && y + h > top) draw(tile, i) })
        settle()
      }
      frame = requestAnimationFrame(tick)
    }
    textured.clock = 0
    // Paint now; animate only after the page has settled, so motion never competes with the first paint.
    layout()
    const start = reduced ? undefined : setTimeout(() => { last = performance.now(); frame = requestAnimationFrame(tick) }, 600)
    const resize = new ResizeObserver(layout)
    resize.observe(root)
    addEventListener('scroll', settle, { passive: true })
    return () => { clearTimeout(start); cancelAnimationFrame(frame); resize.disconnect(); removeEventListener('scroll', settle); for (const tile of tiles) tile.remove() }
  }, [reduced])
  return <div ref={layer} className="page-texture" aria-hidden="true" data-motion={reduced ? 'still' : 'running'} />
}
