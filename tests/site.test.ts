import { it, expect } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { rehearsal } from '../apps/web/lib/copy'
import { sentence } from '../packages/ui-tests/src/compiler'
import sessions from '../apps/web/public/sessions/sessions.json'

it('refuses to rewrite a README without its contributing section and preserves that section when present', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-tests-readme-'))
  const exec = promisify(execFile)
  const args = ['--import', import.meta.resolve('tsx'), resolve('apps/web/scripts/render-readme.mjs')]
  const options = { cwd: directory, timeout: 10000 }
  try {
    const file = join(directory, 'README.md')
    const original = '# Hand-maintained README\n\nKeep this content.\n'
    await writeFile(file, original)
    await expect(exec(process.execPath, args, options)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('README contributing section not found') })
    expect(await readFile(file, 'utf8')).toBe(original)
    const contributing = '## Contributing and automation\n\nPreserve **exactly**.\n'
    await writeFile(file, original + contributing)
    await exec(process.execPath, args, options)
    const rendered = await readFile(file, 'utf8')
    expect(rendered).toContain('## Terminal output')
    expect(rendered.slice(rendered.indexOf('## Contributing and automation'))).toBe(contributing)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30000)

it('keeps the actual rehearsal sentence and the approved nav mark', async () => {
  expect(rehearsal).toBe(sentence())
  expect(await readFile('design/brand/logomark.svg', 'utf8')).toContain('currentColor')
  const demo = await readFile('apps/web/public/demo/weekboard.html', 'utf8')
  expect(demo).toContain('noindex, nofollow')
})

it('ships all five real sessions and four small playable reels, with the approved Watch moments', async () => {
  expect(sessions.sessions.map(s => s.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  for (const session of sessions.sessions) {
    expect((await stat(`apps/web/public${session.video}`)).size).toBeLessThan(2 * 1024 * 1024)
    expect((await stat(`apps/web/public${session.poster}`)).size).toBeGreaterThan(1000)
  }
  for (let i = 1; i <= 4; i++) {
    const video = await readFile(`apps/web/public/sessions/problem-${i}.webm`)
    expect(video.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
    expect(video.length).toBeLessThan(2 * 1024 * 1024)
  }
  for (const [id, seconds, issue] of [['p1', 4, 1], ['p1', 30, 3], ['p2', 6, 1], ['p2', 49, 4], ['p3', 3, 1], ['p3', 58, 2], ['p3', 23, 3], ['p4', 41, 2], ['p5', 9, 1]] as const) {
    expect(sessions.sessions.find(s => s.id === id)?.moments).toContainEqual(expect.objectContaining({ seconds, issue }))
  }
})
