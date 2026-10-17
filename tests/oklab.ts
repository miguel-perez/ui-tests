/**
 * `color-mix(in oklab, a p%, b)` of two #rrggbb colours, as the browser resolves it (Björn Ottosson's matrices), so the tests can
 * hold a mixed token such as `--wave-accent` to the same floors as a literal one.
 */
const linear = (value: number) => (value /= 255) <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
const encode = (value: number) => Math.round(255 * Math.min(1, Math.max(0, value <= .0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - .055)))
const channels = (hex: string) => hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16))
export const toHex = (rgb: number[]) => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('')

function toOklab(hex: string) {
  const [r, g, b] = channels(hex).map(linear)
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
  return [.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s]
}
function fromOklab([L, a, b]: number[]) {
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.2914855480 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.7076147010 * s].map(encode)
}

export function mixOklab(a: string, share: number, b: string) {
  const x = toOklab(a), y = toOklab(b)
  return toHex(fromOklab(x.map((value, i) => value * share + y[i] * (1 - share))))
}

/** A stroke of `stroke` at `alpha` over `ground`, as the canvas composites it. */
export function over(ground: string, stroke: string, alpha: number) {
  const under = channels(ground), top = channels(stroke)
  return toHex(under.map((value, i) => Math.round(value + (top[i] - value) * alpha)))
}

/** The `darken` composite of two colours: the darker of each channel, which is how crossing lines meet on the texture. */
export const darken = (a: string, b: string) => toHex(channels(a).map((value, i) => Math.min(value, channels(b)[i])))
