import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { CompiledScreenerQuestion } from '../schema/compiled.ts'
import type { SaysSource } from './impression.ts'
import { isWrongAnswer } from './distractors.ts'

/**
 * One thing ui-tests drafted rather than the author wrote: the input it was drafted `from`, its `value` (null until drafted; the author
 * may write or edit it) and where the value came from. It stays while its input is unchanged.
 */
export type Drafted<T> = { from: unknown; value: T | null; source: string }

/**
 * Everything about one study's screener, first look and task questions that was drafted for the author to review, and the screens it
 * renders to. `distractors` holds the wrong answers of each task question by its words, drafted from its expected answer.
 */
export type StudySnapshot = {
  are?: Drafted<string>
  purpose?: Drafted<string>
  says?: Drafted<string>
  language?: Drafted<string>
  often?: Drafted<boolean>
  decoys: { role?: Drafted<string[]>; uses?: Drafted<string[]>; not?: Drafted<string[]> }
  groups: { name: string; quota: number; source: string }[]
  screens: CompiledScreenerQuestion[]
  distractors?: Record<string, Drafted<string[]>>
}
export type SnapshotFile = { version: 1; studies: Record<string, StudySnapshot> }

/**
 * What each drafted item must have been drafted from for the snapshot to be current; absent when the study needs no such item.
 * `distractors` maps each task question whose distractors the author did not write to its expected answer.
 */
export type DraftNeeds = {
  are?: string
  purpose?: string
  says?: string
  language?: string
  often?: string
  decoys: { role?: string[]; uses?: string[]; not?: string[] }
  distractors: Record<string, string>
}

/** How lint names the distractors of a task question. */
export const distractorsOf = (question: string) => `distractors of ${JSON.stringify(question)}`

/**
 * A task question's drafted distractors as the snapshot holds them. A value an author's edit left with no wrong answer in it (an empty
 * list), or with a blank or the expected answer again among them, would show participants one choice or a choice that is not one, so it
 * is not drafted: lint names it, recruit and check refuse, and lint -u drafts it again.
 */
export function distractorEntry(entry: StudySnapshot | undefined, question: string, expected: string): Drafted<string[]> | undefined {
  const item = entry?.distractors?.[question]
  if (!item || item.value === null || item.value === undefined) return item
  const valid = Array.isArray(item.value) && item.value.length > 0 && item.value.every(d => isWrongAnswer(d, expected))
  return valid ? item : { ...item, value: null }
}

/** The snapshot file of a study file: next to it, like a Vitest snapshot. */
export const snapshotFileOf = (studyFile: string) => `${studyFile}.screener.snap`

/** Reads a snapshot file: undefined when there is none. A file that is not a snapshot is an error naming it. */
export async function readSnapshotFile(file: string): Promise<SnapshotFile | undefined> {
  if (!existsSync(file)) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(await readFile(file, 'utf8')) } catch (error) {
    throw new Error(`${basename(file)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const snapshot = parsed as Partial<SnapshotFile>
  if (snapshot?.version !== 1 || typeof snapshot.studies !== 'object' || snapshot.studies === null) throw new Error(`${basename(file)} is not a ui-tests screener snapshot (version 1)`)
  return snapshot as SnapshotFile
}

/** JSON for review: a list of plain values, and an object of plain values, on one line; everything else one entry per line. */
function format(value: unknown, indent = ''): string {
  const flat = (v: unknown) => v === null || typeof v !== 'object' || (Array.isArray(v) ? v.every(x => x === null || typeof x !== 'object') : Object.values(v as object).every(x => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every(y => typeof y !== 'object'))))
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every(x => x === null || typeof x !== 'object')) return JSON.stringify(value).replace(/","/g, '", "')
    return `[\n${value.map(v => `${inner}${format(v, inner)}`).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined)
  if (!entries.length) return '{}'
  if (flat(value)) return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${format(v, inner)}`).join(', ')} }`
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${format(v, inner)}`).join(',\n')}\n${indent}}`
}

export async function writeSnapshotFile(file: string, snapshot: SnapshotFile): Promise<void> {
  await writeFile(file, `${format(snapshot)}\n`)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** A drafted value that still holds: drafted from this input, and present. */
export function current<T>(item: Drafted<T> | undefined, from: unknown): T | undefined {
  return item && same(item.from, from) && item.value !== null && item.value !== undefined ? item.value : undefined
}

/** The drafted items a study needs, by name, with the input each must come from. */
function needed(needs: DraftNeeds): [string, unknown, (s: StudySnapshot) => Drafted<unknown> | undefined][] {
  const items: [string, unknown, (s: StudySnapshot) => Drafted<unknown> | undefined][] = []
  if (needs.are !== undefined) items.push(['are', needs.are, s => s.are])
  if (needs.purpose !== undefined) items.push(['purpose', needs.purpose, s => s.purpose])
  if (needs.says !== undefined) items.push(['firstLook.says', needs.says, s => s.says])
  if (needs.language !== undefined) items.push(['users.language', needs.language, s => s.language])
  if (needs.often !== undefined) items.push(['often', needs.often, s => s.often])
  for (const kind of ['role', 'uses', 'not'] as const) if (needs.decoys[kind]) items.push([`decoys.${kind}`, needs.decoys[kind], s => s.decoys?.[kind]])
  for (const [question, expected] of Object.entries(needs.distractors)) items.push([distractorsOf(question), expected, s => distractorEntry(s, question, expected)])
  return items
}

export type SnapshotState = { state: 'current' | 'missing' | 'out of date'; reasons: string[] }

/**
 * Whether a study's snapshot is current: present, every drafted item drafted from what the study now says and filled in, and the
 * groups and screens the same as the study now derives. The reasons say what is missing or out of date.
 */
export function snapshotState(entry: StudySnapshot | undefined, needs: DraftNeeds, derived: { groups: StudySnapshot['groups']; screens: CompiledScreenerQuestion[] }): SnapshotState {
  if (!entry) return { state: 'missing', reasons: ['there is no snapshot for this study'] }
  const reasons: string[] = []
  for (const [name, from, read] of needed(needs)) {
    const item = read(entry)
    if (!item || !same(item.from, from)) reasons.push(`${name} was drafted from something the study no longer says`)
    else if (item.value === null || item.value === undefined) reasons.push(`${name} is not drafted yet`)
  }
  if (!same(entry.groups, derived.groups)) reasons.push('the groups and their quotas changed')
  if (!same(entry.screens, derived.screens)) reasons.push('the screens changed')
  return { state: reasons.length ? 'out of date' : 'current', reasons }
}

/** The names of the items a snapshot has left to draft (null values), for lint to name. */
export function undrafted(entry: StudySnapshot, needs: DraftNeeds): string[] {
  return needed(needs).filter(([, from, read]) => { const item = read(entry); return !item || !same(item.from, from) || item.value === null }).map(([name]) => name)
}

export type { SaysSource }
