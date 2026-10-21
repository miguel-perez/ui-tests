import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, it } from 'vitest'

/**
 * Every tracked document states what the product, the page or the research is; git holds how it got there. The factory's
 * documents are not this product's.
 */
const narration = [
  /\bsuperseded\b/i,
  /kept for the record/i,
  /\bfirst draft\b/i,
  /\bused to (?:carry|be|say|show)\b/i,
  /\bno longer\b/i,
  /\bsince issue #\d+/i,
  /\bwas a mistake\b/i,
  /^#+ .*\b(?:version|v)\s?\d+\b/i,
  /\bredrawn\b/i,
]
const kept = /^factory\//

const documents = () => execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n').filter(file => file && !kept.test(file))

it('describes the present in every tracked document', async () => {
  const found: string[] = []
  for (const file of documents()) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => { if (narration.some(pattern => pattern.test(line))) found.push(`${file}:${i + 1}`) })
  }
  expect(found).toEqual([])
})

it('links only to files that exist', async () => {
  const broken: string[] = []
  for (const file of documents()) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      for (const [, target] of line.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        // Site routes, other schemes and in-page anchors are not files in the repository.
        if (/^(?:[a-z][a-z+.-]*:|\/|#)/i.test(target)) continue
        const path = decodeURI(target.split('#')[0])
        if (!existsSync(join(dirname(file), path))) broken.push(`${file}:${i + 1} ${target}`)
      }
    })
  }
  expect(broken).toEqual([])
})
