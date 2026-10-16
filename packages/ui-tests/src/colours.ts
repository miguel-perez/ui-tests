/** The CLI's colour roles and its line tokenizer, without Ink, so the site can colour inline shell fragments exactly as the terminal does. */
/** Tokyo Night roles, the same hexes as the site's tokens, so the HTML fragment carries the CLI's colours. */
export const colours = {
  ink: '#c0caf5',
  // The comment role. Tokyo Night's comment hue (#565f89) fails AA on the terminal surface, so readable comment-role text uses muted, as the code windows do.
  comment: '#a9b1d6',
  moment: '#ff9e64',
  string: '#9ece6a',
  url: '#7aa2f7',
  flag: '#e0af68',
  dead: '#f7768e',
  done: '#73daca',
} as const
type Colour = (typeof colours)[keyof typeof colours]
export type Segment = { text: string; color: Colour }

/** Subcommands that belong to the command itself rather than being its arguments. */
const subcommands = new Set(['install', 'init', 'run', 'report', 'lint', 'verify', 'status', 'trace', 'estimate', 'dev'])
/** A shell line: the prompt glyph and the launcher (npx, npm) in the comment role, the command in ink, flags in yellow, arguments in green. */
function shell(line: string): Segment[] {
  const segments: Segment[] = [{ text: '$', color: colours.comment }]
  const words = line.slice(2).split(' ')
  let command = true, packageName = words[0] === 'npx'
  words.forEach((word, index) => {
    segments.push({ text: ' ', color: colours.ink })
    if (index === 0) return segments.push({ text: word, color: ['npx', 'npm'].includes(word) ? colours.comment : colours.ink })
    if (word.startsWith('-')) { command = false; return segments.push({ text: word, color: colours.flag }) }
    if (command && (packageName || subcommands.has(word))) { packageName = false; return segments.push({ text: word, color: colours.ink }) }
    command = false
    segments.push({ text: word, color: colours.string })
  })
  return segments
}
/** Colours the parts of a plain output line that carry a role: created files green, URLs blue, counts in the moment hue. */
function output(line: string): Segment[] {
  const created = /^(Created|Updated|Preserved) (.+)$/.exec(line)
  if (created) return [{ text: `${created[1]} `, color: colours.ink }, { text: created[2], color: colours.string }]
  const segments: Segment[] = []
  const pattern = /(https?:\/\/\S+)|(\b\d+ of \d+\b)/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: line.slice(last, match.index), color: colours.ink })
    segments.push({ text: match[0], color: match[1] ? colours.url : colours.moment })
    last = match.index + match[0].length
  }
  if (last < line.length || !segments.length) segments.push({ text: line.slice(last), color: colours.ink })
  return segments
}
/** Splits any line the CLI prints into coloured segments: shell lines start with the prompt glyph. */
export function segments(line: string) { return line.startsWith('$ ') ? shell(line) : output(line) }

