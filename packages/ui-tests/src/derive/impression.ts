import { parseHTML } from 'linkedom'
import type { AuthoredStudy } from '../authoring.ts'
import type { CompiledGoal, CompiledImpression } from '../schema/compiled.ts'

import { TOUR_PARTS, TOUR_PROMPT } from './tour.ts'

export { PART_LABELS, TOUR_PARTS, TOUR_PROMPT, type TourPart } from './tour.ts'

/** Where `says` came from: the page's meta description, its og:description, its first heading, or the author. */
export type SaysSource = 'meta description' | 'og:description' | 'h1' | 'author'

/** What the start page says about itself: its meta description, else its og:description, else its first heading. Undefined when it says none. */
export function pageSays(html: string): { says: string; source: SaysSource } | undefined {
  const { document } = parseHTML(html)
  const clean = (text: string | null | undefined) => text?.replace(/\s+/g, ' ').trim() || undefined
  const meta = clean(document.querySelector('meta[name="description" i]')?.getAttribute('content'))
  if (meta) return { says: meta, source: 'meta description' }
  const og = clean(document.querySelector('meta[property="og:description" i]')?.getAttribute('content'))
  if (og) return { says: og, source: 'og:description' }
  const h1 = clean(document.querySelector('h1')?.textContent)
  return h1 ? { says: h1, source: 'h1' } : undefined
}

/** The language the start page says it is in, from `<html lang>`, as a language code; undefined when it says none. */
export function pageLanguage(html: string): string | undefined {
  const lang = parseHTML(html).document.documentElement?.getAttribute('lang')?.trim()
  return lang && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang) ? lang : undefined
}

/**
 * The first look: on at the primary start page unless the start comes from `setup` (without `firstLook: { page }`) or `firstLook: false`.
 * `says` is what the answers are coded against: written by the author, else read from the page into the snapshot; never the purpose.
 */
export function deriveImpression(study: Pick<AuthoredStudy, 'options' | 'setup' | 'tasks'>, goals: CompiledGoal[], says: { value: string; source: SaysSource } | undefined): CompiledImpression {
  const firstLook = study.options.firstLook
  const base = { prompt: TOUR_PROMPT, parts: [...TOUR_PARTS], says: says?.value ?? null, source: says?.source ?? null }
  if (firstLook === false) return { on: false, ...base, reason: 'off: firstLook is false' }
  if (firstLook?.page) return { on: true, page: firstLook.page, ...base, reason: `on: firstLook page ${firstLook.page}` }
  if (study.setup) return { on: false, ...base, reason: 'off: the start comes from setup, so there is no public page to tour before it; add firstLook: { page } to turn it on' }
  const page = goals.find(g => g.primary)?.start ?? '/'
  return { on: true, page, ...base, reason: `on: the primary start page ${page}` }
}
