/**
 * The "Was" words of issue #22, item 2, as they would read to a developer. Each is matched where it carries that meaning, so
 * `video.pause()`, an animation's `duration` option or a `setTimeout` are not mistaken for the attempt vocabulary.
 */
export const was: [string, RegExp][] = [
  ['P3 as a person', /\bP[1-5]\b/],
  ['panel without paid', /(?<!paid[ -])\bpanel\b/i],
  ['SEQ', /\bSEQ\b/],
  ['UX-Lite', /\bUX-?Lite\b/i],
  ['confident failure', /confident failure/i],
  ['gave up', /gave[ -]up/i],
  ['timeout', /timed out|\btimeout\b/i],
  ['disconnected', /disconnected/i],
  ['deviation', /deviation/i],
  ['backtrack', /backtrack/i],
  ['dead click', /dead[ -]click/i],
  ['outcome incorrect', /\bincorrect\b|\boutcome:? (correct|unknown)\b/i],
  ['confidence n of 7', /\bconfidence:? \d (of|\/) 7/i],
  // Issue #25, item 2: the bar says "Done" and "I couldn't do this".
  ["Can't do it / I can't do this", /can(?:['’]|&#39;|&apos;|\\u2019)?t do (?:it|this)/i],
  ["I'm done", /\bI(?:['’]|&#39;|&apos;)m done\b/i],
]
/** On a rendered surface every word of the table is out, including the ones code may still use for something else. */
export const shown: [string, RegExp][] = [
  ...was,
  ['pause', /\bpaused?\b/i],
  ['duration', /\bduration\b/i],
  ['confidence', /\bconfidence\b/i],
  ['correct / unknown', /\b(correct|unknown)\b/i],
  ['viewport', /\bviewport\b/i],
]
/** The names of the old words a text still uses. */
export const offences = (text: string, words: [string, RegExp][]) => words.filter(([, pattern]) => pattern.test(text)).map(([name]) => name)
