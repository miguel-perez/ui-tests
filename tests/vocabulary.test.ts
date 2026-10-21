import { it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseHTML } from 'linkedom'
import { was, shown, unsaid, offences, verbatim, hosting } from './vocabulary'


async function files(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', '.ui-tests', 'out'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await files(path))
    else if (/\.(tsx?|mjs|css|html|json|md)$/.test(entry.name)) found.push(path)
  }
  return found
}

it('finds none of the old words in apps/web or the generated fragment', async () => {
  const found: string[] = []
  // Issues #38 and #43: the token block of globals.css names its roles as written, and the item wins over this list; the block's lines
  // are blanked first (tests/contrast.test.ts holds its values), so the line numbers stay true.
  const tokens = /^:root \{[^}]*\}/m.exec(await readFile('apps/web/app/globals.css', 'utf8'))![0]
  for (const file of await files('apps/web')) {
    let text = await readFile(file, 'utf8')
    if (file.endsWith('globals.css')) text = text.replace(tokens, tokens.replace(/[^\n]/g, ''))
    // The sources section's verbatim phrases are taken out first; everything else on the line is still checked.
    text.split('\n').forEach((line, index) => { const rest = verbatim.reduce((left, phrase) => left.replaceAll(phrase, ''), line.replaceAll("\\'", "'")); for (const name of offences(rest, was)) found.push(`${file}:${index + 1} ${name}`) })
  }
  expect(found).toEqual([])
})

it('never weighs a run in the words the ROI research rules out, in apps/web or the README', async () => {
  const found: string[] = []
  for (const file of [...await files('apps/web'), 'README.md']) {
    (await readFile(file, 'utf8')).split('\n').forEach((line, index) => { for (const name of offences(line, unsaid)) found.push(`${file}:${index + 1} ${name}`) })
  }
  expect(found).toEqual([])
  // Each word is caught where it would be said, and the section's own words pass.
  for (const said of ['A 9,900% ROI', 'By the rule of ten', 'Studies show it', 'It doubles conversion', 'This saves money']) expect(offences(said, unsaid), said).not.toEqual([])
  const { worth } = await import('../apps/web/lib/copy')
  expect(offences(`${worth.heading} ${worth.sentence} ${worth.arithmetic}`, unsaid)).toEqual([])
})

it('keeps every verbatim exception in the sources copy, word for word', async () => {
  const copy = (await readFile('apps/web/lib/copy.ts', 'utf8')).replaceAll("\\'", "'")
  for (const phrase of verbatim) expect(copy, phrase).toContain(phrase)
})

it('never calls ui-tests.com a hosted service, in apps/web, the README, docs/design or docs/prd (issue #56)', async () => {
  const found: string[] = []
  const scanned = [...await files('apps/web'), 'README.md', ...await files('docs/design'), ...await files('docs/prd')]
  for (const file of scanned) {
    (await readFile(file, 'utf8')).split('\n').forEach((line, index) => {
      for (const name of offences(line, hosting)) found.push(`${file}:${index + 1} ${name}`)
      // "Hosted" no longer names ui-tests.com on the site or in docs/design; the only hosted thing is the author's deploy.
      if (!file.startsWith('docs/prd') && /\bhosted\b/i.test(line) && /ui-tests\.com/i.test(line)) found.push(`${file}:${index + 1} hosted ui-tests.com`)
    })
  }
  expect(found).toEqual([])
  for (const said of ['On the hosted version: people', 'Recordings go to our servers', 'We store your recordings', 'Paid from our wallet']) expect(offences(said, hosting), said).not.toEqual([])
  const { hosted, sources } = await import('../apps/web/lib/copy')
  expect(offences(Object.values(hosted).flatMap(value => typeof value === 'string' ? [value] : Object.values(value).flat()).join(' '), hosting)).toEqual([])
  expect(sources.rows.find(row => row.id === 'visitors')!.what).toMatch(/^On your deploy: /)
})

it('renders the terminal fragment in the new words only', async () => {
  for (const file of (await readdir('apps/web/generated')).filter(name => name.endsWith('.html'))) {
    const text = parseHTML(`<pre>${await readFile(join('apps/web/generated', file), 'utf8')}</pre>`).document.querySelector('pre')!.textContent!
    expect(offences(text, shown), file).toEqual([])
  }
})

it('shows "Wrong, and sure" only at 7 of 7, the goal not reached and without a check, and ranks problems by impact then by people', async () => {
  const { ranked } = await import('../apps/web/lib/rank')
  expect(ranked([{ title: 'a', people: 4, impact: 'confused' }, { title: 'b', people: 2, impact: 'slowed' }, { title: 'c', people: 1, impact: 'blocked' }, { title: 'd', people: 3, impact: 'slowed' }]).map(p => p.title)).toEqual(['c', 'd', 'b', 'a'])
  const { wrongAndSure } = await import('../apps/web/lib/attempts')
  const p2 = (await import('../apps/web/lib/attempts')).attempt('p2')
  expect(wrongAndSure(p2)).toBe(false)
  expect(wrongAndSure({ ...p2, sure: 7 })).toBe(true)
  expect(wrongAndSure({ ...p2, sure: 7, reached: 'yes' })).toBe(false)
})

it('catches the old labels of issue #35, item 4, and lets the new ones through', () => {
  for (const old of ['<th>Watch</th>', "label: 'Watch'", 'Watch Person 3 at 00:58', '<p>What to change</p>', 'Problems found: 4 across 5 people.', 'P3 · 00:03']) expect(offences(old, was), old).not.toEqual([])
  for (const now of ['Moments', 'Watch the clips.', 'the moment to watch', 'Suggested change', 'Problems found: 4, seen across all 5 people.', 'Person 3 · 00:03']) expect(offences(now, was), now).toEqual([])
})

it('ranks the Share-menu problem second, behind the switched-off Add, on the report rows and the check', async () => {
  const { findings, exampleCheck } = await import('../apps/web/lib/pull-request')
  expect(findings[1]).toMatchObject({ rank: 2, impact: 'slowed', people: [1, 2, 3, 5] })
  expect(findings[1].title).toContain('Share menu')
  expect(findings[2]).toMatchObject({ rank: 3, impact: 'confused', people: [3, 4] })
  expect(exampleCheck.problems[1].title).toContain('Share menu')
})
