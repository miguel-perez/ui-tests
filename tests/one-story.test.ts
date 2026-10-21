import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

/**
 * One story everywhere: an app carries the script tag, and the author runs a ui-tests server while a study is open. No tracked doc,
 * page, test or source names a component, a route or a page to mount in the app. The dated records under `docs/plans/`,
 * `docs/superpowers/` and `docs/issues/` keep the words of their day, and the factory is not this product's.
 */
const mounted = [
  /ui-tests\/next\b/,
  /['"`]ui-tests\/server['"`]/,
  /\bUI_TESTS_SERVER\b/,
  /<UiTests\b/,
  /\bPlayerPage\b/,
  /\[\[\.\.\.path\]\]/,
  /\b(?:page|route)\.server\.tsx?\b/,
  /lines to mount/i,
  /Mount it in your app/,
]
const kept = /^(?:factory\/|docs\/plans\/|docs\/superpowers\/|docs\/issues\/)|^package-lock\.json$|^tests\/one-story\.test\.ts$/

it('tells the tag-and-server story in every tracked file, and never the mount', async () => {
  const files = execFileSync('git', ['ls-files', '*.md', '*.ts', '*.tsx', '*.mjs', '*.json', '*.yml', '*.html'], { encoding: 'utf8' })
    .split('\n').filter(file => file && !kept.test(file))
  const found: string[] = []
  for (const file of files) {
    const lines = (await readFile(file, 'utf8').catch(() => '')).split('\n')
    lines.forEach((line, i) => { if (mounted.some(pattern => pattern.test(line))) found.push(`${file}:${i + 1}`) })
  }
  expect(found).toEqual([])
})
