/**
 * What a run is worth (design/artefacts/roi-section.html; docs/discovery/roi-research.md; issue #53), as a model: the four given
 * numbers as typed, and the arithmetic the section shows from them. Parsing and formatting are the artefact's script's: anything
 * that is not a positive number counts as 0, the share stops at 100, whole dollars, hours to two places, minutes under 90 and
 * hours to one place above. Each step divides by the figure shown before it, so "$60 ÷ $93 = 0.65 h" reads true. Nothing is stored.
 */
export type Given = { pay: string; hours: string; share: string; price: string }

/** A field's value as a number: 0 for anything empty, negative or not a number; the share stops at 100. */
export function parse(raw: string, field?: keyof Given) {
  const text = String(raw).trim()
  if (/^-/.test(text)) return 0
  const value = parseFloat(text.replace(/[^0-9.]/g, ''))
  if (!isFinite(value) || value <= 0) return 0
  return field === 'share' ? Math.min(value, 100) : value
}

export const format = (n: number, digits = 0) => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })

/** The time as the sentence says it, the number and the word joined by a non-breaking space so they never part. */
export const duration = (hours: number) => { const minutes = Math.round(hours * 60); return minutes >= 90 ? `${format(hours, 1)}\u00a0hours` : `${minutes}\u00a0minutes` }

/** The derived numbers: the wage, the loaded rate, the run's price in hours and as the sentence says it. */
export function reckon(given: Given) {
  const pay = parse(given.pay, 'pay'), hours = parse(given.hours, 'hours'), share = parse(given.share, 'share') / 100, price = parse(given.price, 'price')
  const wage = hours ? pay / hours : 0, rate = share ? wage / share : 0
  // The rate as shown, in whole dollars, unless it rounds to nothing.
  const shown = Math.round(rate) || rate, time = shown ? price / shown : 0
  return { price: format(price), wage: format(wage), rate: format(rate), hours: format(time, 2), time: duration(time) }
}

/** On leaving a field, a number is written back in the artefact's format (135980 becomes 135,980); anything else stays as typed. */
export function tidy(raw: string, field: keyof Given) {
  const value = parse(raw, field)
  return value ? format(value, Math.min(2, (String(value).split('.')[1] ?? '').length)) : raw
}
