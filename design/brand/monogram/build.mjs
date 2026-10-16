import opentype from 'opentype.js'
import { writeFileSync, mkdirSync } from 'node:fs'
const font = opentype.loadSync('fonts/FiraSans-Bold.ttf')
const upm = font.unitsPerEm, size = 1000
const u = font.charToGlyph('u'), di = font.charToGlyph('ı')
// Tighter spacing than the font's default: pull the i toward the u.
const gap = -0.02 * size
const uAdv = u.advanceWidth / upm * size
const x0 = 0, xi = uAdv + gap
const uPath = u.getPath(x0, 0, size).toPathData(2)
const iPath = di.getPath(xi, 0, size).toPathData(2)
const iBox = di.getPath(xi, 0, size).getBoundingBox()
const stem = iBox.x2 - iBox.x1               // i stem width
const xH = (font.tables.os2.sxHeight / upm) * size
const asc = (font.tables.os2.sTypoAscender / upm) * size
const top = -asc                               // y grows downward in path space; glyphs sit at y=0 baseline, negative up
// Tittle geometry: centred over the stem, sitting where Fira's own dot would be (approx cap height - stem).
const cx = iBox.x1 + stem / 2
const dotR = stem * 0.5
const dotCy = -xH - stem * 1.05
const dot = `<circle cx="${cx.toFixed(1)}" cy="${dotCy.toFixed(1)}" r="${dotR.toFixed(1)}"/>`
// Pointer: a compact arrow pointing up-left, same visual mass as the dot.
const s = stem * 1.55
const px = cx - s * 0.5, py = dotCy - s * 0.32
const pointer = `<path d="M${px.toFixed(1)} ${py.toFixed(1)} l${(s).toFixed(1)} ${(s*0.38).toFixed(1)} l${(-s*0.42).toFixed(1)} ${(s*0.17).toFixed(1)} l${(-s*0.17).toFixed(1)} ${(s*0.45).toFixed(1)} z"/>`
// Stray dot: moved right and down, as if it left its place.
const stray = `<circle cx="${(cx + stem*1.1).toFixed(1)}" cy="${(dotCy + stem*0.35).toFixed(1)}" r="${dotR.toFixed(1)}"/>`
const totalW = iBox.x2 + stem * 1.2
const pad = size * 0.08
const minY = Math.min(dotCy - s, -asc)
function svg(tittle, name) {
  const vb = `${(-pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(totalW + 2*pad).toFixed(0)} ${(-(minY) + pad*2 + 20).toFixed(0)}`
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="currentColor" role="img" aria-label="ui-tests"><path d="${uPath}"/><path d="${iPath}"/>${tittle}</svg>`
  mkdirSync('out', { recursive: true }); writeFileSync(`out/${name}.svg`, out); console.log(name, out.length)
}
svg(dot, '31-ui-dot'); svg(pointer, '32-ui-pointer'); svg(stray, '33-ui-stray')
