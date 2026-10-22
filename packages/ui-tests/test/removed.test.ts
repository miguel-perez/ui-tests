import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..', '..')
const self = relative(root, import.meta.filename)

/** Every source, test, schema and spec file that could keep a removed feature reachable. */
async function files(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { if (!['node_modules', '.next', 'out', 'discovery'].includes(entry.name) && !entry.name.startsWith('.tmp')) found.push(...await files(path)) }
    else if (/\.(ts|tsx|json|md|mjs)$/.test(entry.name) && path !== self) found.push(path)
  }
  return found
}

/**
 * Issue #81 removes these, with their code, types, record fields, report text and tests; nothing keeps them reachable behind a flag
 * or a fallback. Dated research notes in docs/discovery may still describe them as history.
 */
const removed: [string, RegExp][] = [
  ['the fixed option lists', /\b(NEUTRAL|NARROW_ROLES|BROAD_AREAS|OTHER_TOOLS)\b/],
  ['the fit score', /\b(fitScore|FIT_IDS|NEED_BANDS|FIT_OUT_OF)\b|derive\/fit\.ts/],
  ['the fit questions', /screener\.(need|today|matters)\b|How much does it matter to you to get this right/],
  ['the flash', /\bflashMs\b|500 ms flash|flashed for 500/],
  ['the word-overlap coder', /\bbyRule\b|codeImpressionWith|word-overlap rule/],
  ['the old first-look question and codes', /What was that page for\?|named the purpose|did not name it/],
  ['the area, browser and device questions', /screener\.(area|browser|device)\b|Which area do you mostly work in|Which browser do you usually use|Which device do you usually use/],
  ['the unconditional standing exclusion', /\bSTANDING_EXCLUSION\b|Work in UX, design, marketing or market research/],
  ['the first-look picture', /\b(firstLookShot|firstLookSkipped|FIRST_LOOK_SHOT|FIRST_LOOK_SKIPPED|attachFirstLook|Screenshotter)\b|runner\/screenshot\.ts/],
  ['matches and outside as the record of a match', /screenerResult\.(matches|outside)|\bmatches: (true|false), outside:/],
]

describe('what issue #81 removes', () => {
  it('is gone from the source, the types, the record schema, the report, the docs that spec it, and the tests', async () => {
    const scanned = [...await files('packages/ui-tests'), ...await files('apps/web'), ...await files('tests'), ...await files('docs/prd'), ...await files('docs/design')]
    expect(scanned.length).toBeGreaterThan(100)
    const hits: string[] = []
    for (const file of scanned) {
      const text = await readFile(join(root, file), 'utf8')
      for (const [what, pattern] of removed) if (pattern.test(text)) hits.push(`${file}: ${what}`)
    }
    expect(hits).toEqual([])
    for (const gone of ['packages/ui-tests/src/derive/fit.ts', 'packages/ui-tests/src/runner/screenshot.ts']) expect(existsSync(join(root, gone)), gone).toBe(false)
  })

  it('leaves no fit field in the record schema or the compiled study', async () => {
    const schema = await readFile(join(root, 'packages/ui-tests/schemas/run-record.v1.json'), 'utf8')
    expect(schema).not.toMatch(/"fit"|"neverAsked"|"named"|"didNot"|"firstClickOnPath"|"denominator"|"flashMs"|"codes"|"matches"/)
    const sources = await files('packages/ui-tests/src')
    for (const file of sources) expect(await readFile(join(root, file), 'utf8'), file).not.toMatch(/\.fit\b|\bfit: \{|record\.fit|measures\.fit/)
  })
})
