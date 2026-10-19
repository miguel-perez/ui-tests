/** The smallest n with 1 - (1 - affecting)^n >= confidence (PRD 02, Sample size). */
export function sampleSize(affecting: number, confidence: number): number {
  if (!(affecting > 0 && affecting < 1)) throw new RangeError('sample.affecting must be between 0 and 1')
  if (!(confidence > 0 && confidence < 1)) throw new RangeError('sample.confidence must be between 0 and 1')
  return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - affecting) - 1e-9))
}

/** The chance, 0..1, that n people include at least one who meets a problem hitting `affecting` of users. */
export function detectionChance(affecting: number, n: number): number {
  return 1 - Math.pow(1 - affecting, n)
}

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
/** The number as a word up to twenty, else digits. */
export function numberWord(n: number) { return words[n] ?? String(n) }

/** "an" before a percentage read aloud with a vowel sound (8, 11, 18, 80 to 89). */
export function articleFor(chance: number) { return chance === 8 || chance === 11 || chance === 18 || (chance >= 80 && chance <= 89) ? 'an' : 'a' }

/** The single source of the sample sentence. "Five people give an 87% chance of seeing any problem that hits at least one person in three." */
export function sampleSentence(n: number, affecting: number): string {
  const chance = Math.round(detectionChance(affecting, n) * 100)
  const first = numberWord(n)
  const article = articleFor(chance)
  const k = 1 / affecting
  const hits = Math.abs(k - Math.round(k)) < 1e-9 ? `one person in ${numberWord(Math.round(k))}` : `${Number((affecting * 100).toFixed(1))}% of people`
  return `${first[0].toUpperCase()}${first.slice(1)} ${n === 1 ? 'person gives' : 'people give'} ${article} ${chance}% chance of seeing any problem that hits at least ${hits}.`
}
