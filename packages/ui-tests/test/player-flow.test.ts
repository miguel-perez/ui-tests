import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { answerKey, entryScreen, messageFor, nextScreen } from '../src/player/flow.ts'
import type { Screen } from '../src/player/flow.ts'
import { createCollector } from '../src/server/collector.ts'
import type { ParticipantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const endpoint = 'http://app.test/api/ui-tests/'
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(() => {
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store, now: () => Date.parse('2026-10-19T10:00:00.000Z') })
})

const read = async (token: string): Promise<ParticipantView> => (await collect(new Request(`${endpoint}?t=${token}`))).json() as Promise<ParticipantView>
const send = (token: string, body: unknown) =>
  collect(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))

/** Plays the player: the same screens, answers and messages it would send, against the real collector. */
async function play(run: RunRow, goalIndex: number, ease: number) {
  const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex, rehearsal: false, setupValues: { start: '/', code: 'abc' } })
  let view = await read(token)
  let screen: Screen = entryScreen(view)
  const answers: Record<string, unknown> = {}
  const seen: string[] = []
  for (let guard = 0; screen.kind !== 'thanks' && guard < 30; guard++) {
    seen.push(screen.kind)
    if (screen.kind === 'screener') {
      // A person who fits: an accepting option where there is one, else one that is free to pick.
      const shown = view.screener[screen.index]!
      const options = run.compiled.screener.find((q) => q.id === shown.id)!.options
      const label = (options.find((o) => o.rule === 'accept') ?? options.find((o) => o.rule === 'may-select'))?.label
      answers[shown.id] = shown.open ? 'by hand' : shown.multi ? [label] : label
    }
    if (screen.kind === 'answer') answers[answerKey(view)] = view.answer!.choices[0]
    if (screen.kind === 'ease') answers[`goal${goalIndex}.ease`] = ease
    if (screen.kind === 'confidence') answers[`goal${goalIndex}.confidence`] = 5
    if (screen.kind === 'uxlite') answers[(['useful', 'easy'] as const)[screen.item]] = 6
    if (['difficulty', 'comment'].includes(screen.kind)) answers[screen.kind === 'comment' ? 'anything' : `goal${goalIndex}.difficulty`] = 'words'
    if (screen.kind === 'card') {
      expect((await send(token, { action: 'begin' })).status).toBe(200)
      expect((await send(token, { action: 'end', reason: 'done', snapshot: { url: 'http://app.test/done', dom: '<html></html>' } })).status).toBe(200)
      view = await read(token)
    } else {
      const message = messageFor(view, screen, answers)
      if (message) {
        const response = await send(token, message)
        expect(response.status, JSON.stringify([screen, message])).toBe(200)
        view = (await response.json()) as ParticipantView
      }
    }
    screen = nextScreen(view, screen, answers)
  }
  return { attempt: (await store.getAttempt(attempt.id))!, seen }
}

describe('the player against the collector', () => {
  it('reaches finished on every goal, with and without the difficulty follow-up', async () => {
    const run = (await store.createRun(newRun('k', { compiled: compileStudy(studies[0], {}), hooksBundle: code }))).run
    for (let goal = 0; goal < run.compiled.goals.length; goal++) {
      for (const ease of [2, 6]) {
        const { attempt, seen } = await play(run, goal, ease)
        expect(attempt.status, `goal ${goal} ease ${ease}: ${seen}`).toBe('finished')
        expect(seen.includes('difficulty')).toBe(ease <= 4)
        expect(attempt.answers[`goal${goal}.ease`]).toBe(ease)
      }
    }
  })

  it('takes a screener before consent and still finishes', async () => {
    const compiled = structuredClone(compileStudy(studies[0], {}))
    compiled.screener = [{ id: 'role', text: 'What is your role?', multi: false, field: 'role', rule: 'accept designers', options: [{ label: 'Designer', rule: 'accept' }, { label: 'Engineer', rule: 'accept' }] }]
    const run = (await store.createRun(newRun('k2', { compiled, hooksBundle: code }))).run
    const { attempt, seen } = await play(run, 0, 6)
    expect(seen.slice(0, 2)).toEqual(['screener', 'consent'])
    expect(attempt.status).toBe('finished')
    expect(attempt.answers.screener).toEqual({ role: 'Designer' })
  })

  it('withdraws from any screen after consent', async () => {
    const run = (await store.createRun(newRun('k3', { compiled: compileStudy(studies[0], {}), hooksBundle: code }))).run
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false, setupValues: { start: '/' } })
    await send(token, { action: 'consent' })
    expect(((await (await send(token, { action: 'withdraw' })).json()) as ParticipantView).status).toBe('finished')
    expect((await store.getAttempt(attempt.id))?.reason).toBe('withdrew')
  })
})
