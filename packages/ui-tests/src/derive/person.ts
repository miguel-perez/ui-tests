/** Swaps whole words, keeping a capital where the word had one. */
function swap(text: string, words: Record<string, string>): string {
  const pattern = new RegExp(`\\b(${Object.keys(words).map(w => w.replace(/'/g, "['’]")).join('|')})\\b`, 'gi')
  return text.replace(pattern, (found) => {
    const to = words[found.toLowerCase().replace('’', "'")] ?? found
    // "I" is written with a capital wherever it stands, so its capital says nothing about the start of a sentence.
    return /^i(?:$|['’])/i.test(found) || found[0] !== found[0]!.toUpperCase() ? to : to.charAt(0).toUpperCase() + to.slice(1)
  })
}

const SECOND: Record<string, string> = { "i'm": "you're", "i've": "you've", "i'll": "you'll", "i'd": "you'd", i: 'you', me: 'you', my: 'your', mine: 'yours', myself: 'yourself' }
const THIRD: Record<string, string> = { "you're": "they're", "you've": "they've", "you'll": "they'll", "you'd": "they'd", yourself: 'themselves', yourselves: 'themselves', yours: 'theirs', your: 'their', you: 'they' }

/** The purpose as said to the participant: the author's "I", "me", "my" and "mine" become "you", "you", "your" and "yours". */
export function toSecondPerson(text: string): string {
  return swap(text, SECOND)
}

/** A behaviour said of other people: "shipped a UI you built yourself" becomes "shipped a UI they built themselves". */
export function toThirdPerson(text: string): string {
  return swap(text, THIRD)
}

/** Who the study is for, from what they did: "people who shipped a UI they built themselves". */
export function areFromDid(did: string): string {
  return `people who ${toThirdPerson(did.trim().replace(/[.!?]+$/, ''))}`
}
