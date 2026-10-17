/**
 * The page's background texture (issue #51): fine waves behind the whole document, in the line token with a narrow tint of the wave
 * accent at the centre of each line. Every row's variables are smooth functions of its index, with no randomness, so the page looks
 * the same on every load and in every capture. The model here is pure; `components/page-texture.tsx` draws it.
 * Text contrast over its strongest pixel is checked in tests/palette.test.ts and tests/contrast.test.ts; the model in tests/texture.test.ts.
 */
export const texture = {
  token: '--line', accentToken: '--wave-accent', groundToken: '--canvas',
  /** The alpha range per row. The top is the strongest a line is drawn: overlaps never compound past it (the canvas draws with `darken`). */
  minAlpha: 0.35, maxAlpha: 0.66, lineWidth: 1, frameMs: 40,
  /** 52 rows over the hero's height (twice the old 26): 14px between rows at 1440, the same spacing down the whole page. */
  spacing: 14,
  /** The drift in radians a second, twice the hero's old 0.11, and the two amplitudes in px, twice the old 22 and 6. */
  speed: 0.22, amplitude: [44, 12] as const, wavelength: [210, 67] as const,
  /** The visible stretch's drift, as a share of the width a second, and its length, as a share of the page width. */
  drift: [0.003, 0.012] as const, stretch: [0.44, 0.76] as const,
  /** The x step of each line's path in px, and the height of each canvas tile the page is drawn in. */
  step: 12, tile: 512,
}

/** A value between `low` and `high` that varies smoothly with the row: a slow sine of the index, never a random draw. */
const smooth = (index: number, low: number, high: number, rate: number, phase: number) => low + (high - low) * (0.5 + 0.5 * Math.sin(index * rate + phase))

/** Row `index`'s variables: where its stretch starts, how fast it drifts, how long it is and how strong it is drawn. */
export function rowAt(index: number) {
  return {
    start: smooth(index, 0, 1, 0.61, 1.3),
    drift: smooth(index, texture.drift[0], texture.drift[1], 0.23, 0.4),
    stretch: smooth(index, texture.stretch[0], texture.stretch[1], 0.17, 2.1),
    alpha: smooth(index, texture.minAlpha, texture.maxAlpha, 0.29, 4),
  }
}

/** The line's height at `x`, at `seconds`: the row's base and the texture's two sine terms drifting in opposite directions. */
export function lineY(index: number, x: number, seconds: number) {
  const phase = index * 1.7, drift = seconds * texture.speed
  return (index + 0.5) * texture.spacing
    + Math.sin(x / texture.wavelength[0] + phase + drift) * texture.amplitude[0]
    + Math.sin(x / texture.wavelength[1] - phase * 0.6 - drift * 0.64) * texture.amplitude[1]
}

/**
 * The visible stretch at `seconds` on a page `width` wide: its centre drifts across and wraps once the stretch is wholly off the page,
 * so a line comes and goes without a jump. `from` and `to` are its ends.
 */
export function stretchAt(index: number, width: number, seconds: number) {
  const row = rowAt(index), length = row.stretch * width, travel = width + length
  const at = ((row.start * travel + row.drift * width * seconds) % travel + travel) % travel
  const centre = at - length / 2
  return { from: centre - length / 2, to: centre + length / 2, centre, length }
}

/**
 * Each line's gradient along its stretch, as offsets from 0 to 1: nothing at both ends, the line colour for most of it, and the wave
 * accent only at the centre, in the middle third, reached through the line colour on either side.
 */
export const stops = [
  { at: 0, colour: 'none' }, { at: 0.18, colour: 'line' }, { at: 1 / 3, colour: 'line' }, { at: 0.5, colour: 'accent' },
  { at: 2 / 3, colour: 'line' }, { at: 0.82, colour: 'line' }, { at: 1, colour: 'none' },
] as const

/** How far the line point at `x` on row `index` travels between two times, in px: the movement the eye reads. */
export function travel(index: number, x: number, from: number, to: number) {
  return Math.abs(lineY(index, x, to) - lineY(index, x, from))
}
