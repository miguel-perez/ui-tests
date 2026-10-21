/**
 * The "Was" words of issue #22, item 2, as they would read to a developer. Each is matched where it carries that meaning, so
 * `video.pause()`, an animation's `duration` option or a `setTimeout` are not mistaken for the attempt vocabulary.
 */
export const was: [string, RegExp][] = [
  ['P3 as a person', /\bP[1-5]\b/],
  // `--panel` is the `host` command's flag (issue #56), a literal and not the word.
  ['panel without paid', /(?<!paid[ -]|--)\bpanel\b/i],
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
  // Issue #35, item 4: "Moments" not a "Watch" column, "Suggested change" not "What to change", and the result line says "seen".
  ['Watch as a label', /(?:^|[>|'"`]\s*)Watch(?:\s*[<|'"`:]|\s*$)|\bWatch Person\b/m],
  ['What to change', /What to change/],
  ['across n people without seen', /(?<!seen )\bacross \d+ people/i],
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
/**
 * Issue #31, item 2: the sources section's copy is fixed, every cell, step and caveat as written, and the item wins over this list.
 * These are its phrases that use a word of the list; each must stay in apps/web/lib/copy.ts word for word.
 */
export const verbatim = ['Like the panel, under a daily cap you set', 'your own panel account', "each panel's filters", 'a link or a panel run', 'Panel people answer screeners for money.', 'Each attempt labelled with its panel', 'a dead click']
/**
 * Issue #56, item 5: there is no hosted service. ui-tests.com is never "the hosted version", and nothing says it keeps people's
 * recordings or money: the deploy, the bucket and the panel wallet are the author's.
 */
export const hosting: [string, RegExp][] = [
  ['hosted version', /hosted version/i],
  ['our servers', /\bour servers?\b/i],
  ['we store', /\bwe store\b/i],
  ['our wallet', /\bour wallet\b/i],
]
/**
 * Issue #53, item 3: what a run is worth is said as hours of a developer's time, never in the words docs/discovery/roi-research.md
 * rules out: an ROI figure, the rule of ten as fact, "studies show", "doubles conversion" or "saves money".
 */
export const unsaid: [string, RegExp][] = [
  ['ROI', /\bROI\b/],
  ['rule of ten', /rule of (?:ten|10)\b/i],
  ['studies show', /studies show/i],
  ['doubles conversion', /doubles? (?:the )?conversions?/i],
  ['saves money', /saves? (?:you )?money/i],
]
