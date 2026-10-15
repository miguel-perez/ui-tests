import { it, expect } from 'vitest'
import { readFile, readdir, stat } from 'node:fs/promises'
import { terminal, rehearsal } from '../apps/web/lib/copy'
import { sentence } from '../packages/ui-tests/src/compiler'

it('uses authored currentColor SVG marks and keeps assets within the image budget', async () => {
  const directory = 'apps/web/public/marks'
  const files = await readdir(directory)
  expect(files).toHaveLength(9)
  for (const file of files) {
    expect(file).toMatch(/\.svg$/)
    const svg = await readFile(`${directory}/${file}`, 'utf8')
    expect(svg).toContain('currentColor')
    expect(svg).not.toMatch(/<script|<image|https?:\/\/(?!www\.w3\.org)/)
    expect((await stat(`${directory}/${file}`)).size).toBeLessThan(300_000)
  }
})

it('shows real CLI output shapes with only unmistakable example credentials', () => {
  expect(rehearsal).toBe(sentence())
  const lines = terminal.split('\n')
  expect(lines).toHaveLength(5)
  const player = new URL(lines[0].replace('Player: ', ''))
  const trace = new URL(lines[1].replace('Trace: ', ''))
  const run = lines[2].replace('Run: ', '')
  expect(run).toBe('00000000-0000-4000-8000-000000000000')
  expect(player.pathname).toBe(`/ui-tests/${run}`)
  expect(player.searchParams.get('token')).toBe('0'.repeat(64))
  expect(trace.pathname).toBe(`/${run}/${'0'.repeat(64)}`)
  expect(lines.slice(3)).toEqual(['Outcome: correct', sentence()])
})
