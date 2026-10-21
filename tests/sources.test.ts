import { it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Issue #31: where people who represent users come from. */
it('carries the sources in the order your link, your visitors, a paid panel, with the items the issues name word for word', async () => {
  const { sources } = await import('../apps/web/lib/copy')
  expect(sources.rows.map(row => row.name)).toEqual(['Your link', 'Your visitors', 'A paid panel'])
  // The three items the issue names, word for word.
  expect(sources.rows[0].cost + ' ' + sources.rows[0].costNote).toBe('Free Pay them if you like; the consent says so either way')
  // Issue #54: the cost column reads Free, Paid and Starting at $12 a person.
  expect(sources.rows.map(row => row.cost)).toEqual(['Free', 'Paid', 'Starting at $12 a person'])
  expect(sources.rows[2].cost + '. ' + sources.rows[2].costNote).toBe('Starting at $12 a person. Five from $60; a cap of $70 holds the reserve')
  expect(sources.rows[2].time + '. ' + sources.rows[2].timeNote).toBe('First people within minutes. Usually all five within a few hours; a narrow audience a day or more')
  expect(sources.rows[1].cost + '. ' + sources.rows[1].costNote).toBe('Paid. Like the panel, under a daily cap you set')
  const { fill } = sources
  expect(`Paid ${fill.paid} of the ${fill.cap} cap · ${fill.back} back${fill.labelled}`).toBe('Paid $60 of the $70 cap · $10 back' + 'Each attempt labelled with its panel')
})

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

it('says 48 hours only as the deadline, and has no $60 cap, no $54 and no "visibly struggling" anywhere a visitor or the docs read', async () => {
  const deadlineSentence = 'The run closes at its deadline, 48 hours unless you set one.'
  const found: string[] = []
  for (const file of [...await files('apps/web'), ...await files('docs/design')]) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (/48 hours/.test(line.replaceAll(deadlineSentence, '').replaceAll("'The run closes at its deadline, 48 hours unless you set one.'", ''))) found.push(`${file}:${i + 1} 48 hours`)
      // Issue #53: $60 is the run's price (five people at $12); it is never the cap, which is $70.
      if (/\bcap (of )?\$60\b|\$60 cap\b|max: 60\b/i.test(line)) found.push(`${file}:${i + 1} $60 cap`)
      if (/\$54\b/.test(line)) found.push(`${file}:${i + 1} $54`)
      if (/visibly struggling/i.test(line)) found.push(`${file}:${i + 1} visibly struggling`)
    })
  }
  expect(found).toEqual([])
  // The example cap is $70 in PRD 01.
  expect(await readFile('docs/prd/01-dx-contract.md', 'utf8')).toContain('budget: { max: 70')
})

it('prices the paid panel at $12 a person everywhere: five from $60, the $70 cap with $10 back, and no $55, $54 or $11 a person (issue #54)', async () => {
  const found: string[] = []
  for (const directory of ['apps/web', 'docs/design', 'docs/prd']) for (const file of await files(directory)) {
    (await readFile(file, 'utf8')).split('\n').forEach((line, i) => {
      for (const old of [/\$55\b/, /\$54\b/, /\$11 a person/i, /about \$11\b/i, /\$15 back/]) if (old.test(line)) found.push(`${file}:${i + 1} ${old.source}`)
    })
  }
  expect(found).toEqual([])
  expect(await readFile('docs/design/landing-content.md', 'utf8')).toContain('Paid $60 of the $70 cap · $10 back')
  for (const file of ['apps/web/lib/copy.ts', 'docs/design/landing-content.md']) expect(await readFile(file, 'utf8'), file).toContain('five people cost from $60')
  expect(await readFile('docs/prd/03-participants.md', 'utf8')).toContain('starts at $12 a person, so five people cost from $60')
})

it('keeps the invitation one string in PRD 03 and the landing\'s picture, and the trigger in the PRD\'s words', async () => {
  const { invitationText } = await import('../apps/web/components/player/invitation')
  expect(invitationText).toBe('This page seems to be giving you trouble. Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you.')
  const prd = await readFile('docs/prd/03-participants.md', 'utf8')
  expect(prd).toContain(`"${invitationText}"`)
  expect(prd).not.toContain('Having trouble with this?')
  expect(prd).toContain('invited when a page has given them trouble twice')
  expect(prd).toContain('A no is not asked again that visit')
  expect(prd).toContain('[`../discovery/intercept-recruiting.md`](../discovery/intercept-recruiting.md)')
  for (const old of ['Looks like this is not going smoothly', 'Mind helping us', 'Having trouble with this?']) {
    expect(await readFile('apps/web/components/player/invitation.ts', 'utf8')).not.toContain(old)
  }
})
