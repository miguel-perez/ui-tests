import { NO_MODEL, type TextModel } from '../model.ts'
import { pageLanguage, pageSays } from './impression.ts'
import { isWrongAnswer, neighbours, sameAnswer } from './distractors.ts'
import { areFromDid, toSecondPerson } from './person.ts'
import { current, distractorEntry, distractorsOf, type DraftNeeds, type Drafted, type StudySnapshot } from './snapshot.ts'

/** Something `lint -u` could not draft, and why; the author writes it into the snapshot. */
export type NotDrafted = { item: string; reason: string }

/** How many decoys each list gets: enough to hide which answer is wanted, few enough to keep the screen short. */
const DECOYS = { role: 4, uses: 3, not: 3 } as const

const PROMPTS: Record<keyof typeof DECOYS, (from: string[], did: string, product: string) => string> = {
  role: (roles, did) =>
    `A screener for a usability study asks "Which of these is closest to your role?". The roles it accepts are: ${JSON.stringify(roles)}. ` +
    `The people it looks for ${did}. Write ${DECOYS.role} other roles from the same field, written in the same style and capitalisation, ` +
    'that a person answering honestly might hold, so the list does not give away which roles are wanted. None may be one of the accepted roles or overlap with them.',
  uses: (tools) =>
    `A screener for a usability study asks "Which of these do you use?". The tools it looks for are: ${JSON.stringify(tools)}. ` +
    `Write ${DECOYS.uses} other real tools from the same category, so the list does not give away which ones are wanted. None may be one of those listed.`,
  not: (exclusions, did, product) =>
    `A screener for a usability study of ${product} asks "Do any of these apply to you?". The statements that exclude a person are: ${JSON.stringify(exclusions)}. ` +
    `The people it looks for ${did}. Write ${DECOYS.not} other first-person statements in the same register and length that would apply to many of those people ` +
    'and exclude nobody, so the exclusions do not stand out. Do not mention the product, testing, research, or what the study is for.',
}

/** How many wrong answers a task question gets: with the right one, four choices. */
const DISTRACTORS = 3

const distractorPrompt = (question: string, expected: string, did: string, product: string) =>
  `After a task in a usability study of ${product}, each person is asked "${question}". The right answer is ${JSON.stringify(expected)}. ` +
  (did ? `The people taking part ${did}. ` : '') +
  `Write ${DISTRACTORS} wrong answers of the same kind, form and length as the right one, each something a person who did not finish the task ` +
  'could believe, so the right answer does not stand out. None may be the right answer or mean the same.'

/** A JSON array of non-empty strings in a model's reply; undefined when there is none. */
function readList(reply: string): string[] | undefined {
  const json = /\[[\s\S]*\]/.exec(reply)?.[0]
  if (!json) return undefined
  try {
    const parsed = JSON.parse(json) as unknown
    return Array.isArray(parsed) && parsed.length && parsed.every(v => typeof v === 'string' && v.trim()) ? parsed.map(v => (v as string).trim()) : undefined
  } catch { return undefined }
}

async function ask(model: TextModel, prompt: string): Promise<{ reply: string } | { error: string }> {
  try { return { reply: await model.complete(prompt) } } catch (error) { return { error: `the model did not answer: ${error instanceof Error ? error.message : String(error)}` } }
}

export type DraftInput = {
  needs: DraftNeeds
  groups: StudySnapshot['groups']
  previous?: StudySnapshot
  product: string
  /** What people did, said of them, for the prompts. */
  did: string
  /** The address of the first look's page, to read what it says and its language; absent when the first look is off or both are written. */
  pageUrl?: string
  model?: TextModel
  /** Why there is no model, said for each item it would have drafted. */
  noModel?: string
  fetch?: typeof fetch
}

/**
 * Drafts what a study's snapshot needs, keeping every item still drafted from what the study says (the author may have edited it):
 * `are` and the "you" form of the purpose by shifting the person, `says` from the start page, the decoys and whether `did` is repeated
 * from the configured model, and each task question's distractors (a count's neighbours, else from the model). What cannot be drafted
 * is written as null and named; nothing generic stands in. `screens` is left to the caller, which renders it from the result.
 */
export async function draftSnapshot(input: DraftInput): Promise<{ entry: StudySnapshot; notDrafted: NotDrafted[] }> {
  const { needs, previous, model } = input
  const notDrafted: NotDrafted[] = []
  const keep = <T>(item: Drafted<T> | undefined, from: unknown): Drafted<T> | undefined => (current(item, from) !== undefined ? item : undefined)
  const entry: StudySnapshot = { decoys: {}, groups: input.groups, screens: [] }

  if (needs.are !== undefined) entry.are = keep(previous?.are, needs.are) ?? { from: needs.are, value: areFromDid(needs.are), source: 'did, person shifted' }
  if (needs.purpose !== undefined) entry.purpose = keep(previous?.purpose, needs.purpose) ?? { from: needs.purpose, value: toSecondPerson(needs.purpose), source: 'purpose, person shifted' }

  // The start page is read once, for what it says and the language it is in.
  let page: Promise<{ html: string } | { error: string }> | undefined
  const read = () => (page ??= fetchPage(input.pageUrl, input.fetch ?? fetch))
  if (needs.says !== undefined) {
    entry.says = keep(previous?.says, needs.says)
    if (!entry.says) {
      const got = await read()
      const said = 'html' in got ? pageSays(got.html) : undefined
      if (said) entry.says = { from: needs.says, value: said.says, source: said.source }
      else {
        entry.says = { from: needs.says, value: null, source: 'not drafted' }
        notDrafted.push({ item: 'firstLook.says', reason: 'error' in got ? got.error : `${input.pageUrl} has no h1, meta description or og:description` })
      }
    }
  }
  if (needs.language !== undefined) {
    entry.language = keep(previous?.language, needs.language)
    if (!entry.language) {
      const got = await read()
      const lang = 'html' in got ? pageLanguage(got.html) : undefined
      entry.language = { from: needs.language, value: lang ?? null, source: lang ? 'html lang' : 'not drafted' }
      if (!lang) notDrafted.push({ item: 'users.language', reason: 'error' in got ? got.error : `${input.pageUrl} has no <html lang>` })
    }
  }

  if (needs.often !== undefined) {
    entry.often = keep(previous?.often, needs.often)
    if (!entry.often) {
      const answer = model ? await ask(model, `Is "${needs.often}" something a person does again and again, so it makes sense to ask how often they do it? Reply with only yes or no.`) : { error: input.noModel ?? NO_MODEL }
      const value = 'reply' in answer ? (/^\s*yes\b/i.test(answer.reply) ? true : /^\s*no\b/i.test(answer.reply) ? false : undefined) : undefined
      entry.often = { from: needs.often, value: value ?? null, source: value === undefined ? 'not drafted' : 'model' }
      if (value === undefined) notDrafted.push({ item: 'often', reason: 'error' in answer ? answer.error : 'the model reply was not yes or no' })
    }
  }

  for (const kind of ['role', 'uses', 'not'] as const) {
    const from = needs.decoys[kind]
    if (!from) continue
    const kept = keep(previous?.decoys?.[kind], from)
    if (kept) { entry.decoys[kind] = kept; continue }
    const answer = model ? await ask(model, `${PROMPTS[kind](from, input.did, input.product)}\nReply with only a JSON array of strings.`) : { error: input.noModel ?? NO_MODEL }
    const list = 'reply' in answer ? readList(answer.reply) : undefined
    const decoys = list?.filter(d => !from.some(f => f.toLowerCase() === d.toLowerCase())).slice(0, DECOYS[kind])
    entry.decoys[kind] = { from, value: decoys?.length ? decoys : null, source: decoys?.length ? 'model' : 'not drafted' }
    if (!decoys?.length) notDrafted.push({ item: `decoys.${kind}`, reason: 'error' in answer ? answer.error : 'the model reply was not a list' })
  }

  // A count's neighbours are drafted by rule, for the author to review; every other answer's by the model.
  const distractors: Record<string, Drafted<string[]>> = {}
  for (const [question, expected] of Object.entries(needs.distractors)) {
    const kept = keep(distractorEntry(previous, question, expected), expected)
    if (kept) { distractors[question] = kept; continue }
    const near = neighbours(expected)
    if (near) { distractors[question] = { from: expected, value: near, source: 'neighbours of a count' }; continue }
    const answer = model ? await ask(model, `${distractorPrompt(question, expected, input.did, input.product)}\nReply with only a JSON array of strings.`) : { error: input.noModel ?? NO_MODEL }
    const list = 'reply' in answer ? readList(answer.reply) : undefined
    const wrong = list?.filter((d, i) => isWrongAnswer(d, expected) && list.findIndex(o => sameAnswer(o, d)) === i).slice(0, DISTRACTORS)
    distractors[question] = { from: expected, value: wrong?.length ? wrong : null, source: wrong?.length ? 'model' : 'not drafted' }
    if (!wrong?.length) notDrafted.push({ item: distractorsOf(question), reason: 'error' in answer ? answer.error : 'the model reply was not a list' })
  }
  // In reading order: who, what for, what the page says, then the screener's drafts, the groups and the screens, then the tasks' distractors.
  const { are, purpose, says, language, often, decoys, groups, screens } = entry
  return { entry: { ...(are && { are }), ...(purpose && { purpose }), ...(says && { says }), ...(language && { language }), ...(often && { often }), decoys, groups, screens, ...(Object.keys(distractors).length > 0 && { distractors }) }, notDrafted }
}

/** The start page's HTML; the reason when it cannot be read. */
async function fetchPage(url: string | undefined, get: typeof fetch): Promise<{ html: string } | { error: string }> {
  if (!url) return { error: 'the first look has no page to read' }
  try {
    const response = await get(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return { error: `${url} answered ${response.status}` }
    return { html: await response.text() }
  } catch (error) {
    return { error: `${url} could not be read: ${error instanceof Error ? error.message : String(error)}` }
  }
}
