import { it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import { rehearsal } from '../apps/web/lib/copy'
import { sentence } from '../packages/ui-tests/src/compiler'
import sessions from '../apps/web/public/sessions/sessions.json'

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
