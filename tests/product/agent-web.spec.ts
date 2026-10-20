import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { webHarness } from '../../packages/ui-tests/src/agents/harness-web.ts'
import { runTrials } from '../../packages/ui-tests/src/agents/loop.ts'
import type { AgentModel, AgentStep, ToolCall } from '../../packages/ui-tests/src/agents/model.ts'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { PRODUCT_URL } from './helpers'

/**
 * The web harness (Task 30): an agent uses the landing through the same player and collector a person uses, in a run of its own
 * (actor 'agent') that no human run shares. The study lists human and agent actors, so the same task is one a person could be given.
 */

const fixture = join(import.meta.dirname, 'fixtures', 'agent-web.ui.test.ts')
const usage = { inputTokens: 100, outputTokens: 20 }
const step = (...toolCalls: ToolCall[]): AgentStep => ({ toolCalls, usage, stop: 'tool' })

/** A model that reads what the page shows: it looks, clicks the link whose name has `link`, and then ends as `ending`. */
function reader(link: RegExp, ending: ToolCall | undefined): AgentModel {
  return {
    async step({ messages }) {
      const answers = messages.filter(m => m.role === 'tool')
      const last = answers.at(-1)
      if (!last) return step({ name: 'look', input: {} })
      if (last.name === 'look') {
        const ref = new RegExp(`link "[^"]*${link.source}[^"]*"[^\\n]*\\[ref=([a-z0-9]+)\\]`, 'i').exec(last.output)?.[1]
        if (!ref) throw new Error(`no link matching ${link} in:\n${last.output}`)
        return step({ name: 'click', input: { ref } })
      }
      return ending ? step(ending) : { text: 'I looked around and stopped here.', toolCalls: [], usage, stop: 'done' }
    },
  }
}

async function setUp() {
  const { code } = await bundleStudyFile(fixture)
  const [authored] = await loadBundle(code, fixture)
  const compiled = compileStudy(authored!, { agents: { model: { provider: 'scripted', name: 'fixture' } } })
  const store = await openStore()
  const make = (actor: 'human' | 'agent') => store.createRun({
    key: `e2e-agent:${actor}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
    build: { url: PRODUCT_URL, commit: 'e2e' }, actor, compiled, hooksBundle: code, rehearsal: false, target: PRODUCT_URL,
  }).then(made => made.run)
  const [human, agent] = [await make('human'), await make('agent')]
  const trials = (model: AgentModel) => runTrials({ store, run: agent, study: authored!, goal: compiled.goals[0]!, model, harness: webHarness({ target: PRODUCT_URL, playerUrl: `${PRODUCT_URL}/ui-tests/${agent.run}/` }) })
  return { store, human, agent, compiled, trials }
}

test('an agent opens the guide through the player: stored as the agent, verified by the same outcome, and no human run counts it', async () => {
  const { store, human, agent, compiled, trials } = await setUp()
  try {
    const [trial] = await trials(reader(/get started/, { name: 'done', input: { summary: 'opened the guide' } }))
    expect(trial).toMatchObject({ state: 'verified', claimedDone: true, verification: { status: 'correct' } })

    const attempts = await store.listAttempts(agent.run)
    expect(attempts).toHaveLength(1)
    // Consent was given when the attempt was made, as the agent; the player did not ask it.
    expect(attempts[0]).toMatchObject({ participant: 'agent:0:1', status: 'finished', reason: 'done', purposes: compiled.consent.purposes, verification: { status: 'correct' } })
    expect((await store.getRun(agent.run))?.actor).toBe('agent')
    expect(await store.listAttempts(human.run)).toEqual([])

    // The end state is the snapshot the collector took when the bar's Done was pressed, on the guide.
    const end = await store.getSnapshot(attempts[0]!.id, 'end')
    expect(end?.url).toContain('/docs/getting-started')
    expect(end?.dom).not.toContain('data-ui-tests')
    expect((await store.listEvents(attempts[0]!.id)).some(e => e.type === 'click')).toBe(true)
  } finally { await store.close() }
})

test('an agent that cannot do the task presses I couldn\'t do this: the attempt ends as gave up and the trial is stopped', async () => {
  const { store, agent, trials } = await setUp()
  try {
    const [trial] = await trials({
      async step({ messages }) {
        return messages.some(m => m.role === 'tool') ? step({ name: 'cannot', input: { reason: 'the guide is not on this page' } }) : step({ name: 'look', input: {} })
      },
    })
    expect(trial).toMatchObject({ state: 'stopped', claimedDone: false, stoppedBy: 'the guide is not on this page' })
    const [attempt] = await store.listAttempts(agent.run)
    expect(attempt).toMatchObject({ status: 'finished', reason: 'gave up' })
    expect((await store.getSnapshot(attempt!.id, 'end'))?.url).toBe(`${PRODUCT_URL}/`)
  } finally { await store.close() }
})

test('a trial the agent leaves without ending is read from the page it stopped on, without the task bar', async () => {
  const { store, agent, trials } = await setUp()
  try {
    const [trial] = await trials(reader(/github/, undefined))
    expect(trial).toMatchObject({ state: 'stopped', claimedDone: false })
    const [attempt] = await store.listAttempts(agent.run)
    const end = await store.getSnapshot(attempt!.id, 'end')
    expect(end?.dom).toContain('<!doctype html>')
    expect(end?.dom).not.toContain('data-ui-tests')
  } finally { await store.close() }
})

test('the agent opens only paths on the product', async () => {
  const { store, agent } = await setUp()
  const harness = webHarness({ target: PRODUCT_URL, playerUrl: `${PRODUCT_URL}/ui-tests/${agent.run}/` }, { actionTimeoutMs: 2000 })
  try {
    const { attempt, token } = await store.createAttempt({ runId: agent.run, participant: 'agent:0:9', goalIndex: 0, rehearsal: false })
    await store.updateAttempt(attempt.id, { status: 'consented' }, 'created')
    await harness.begin!({ id: attempt.id, token })
    for (const path of ['https://example.com/', '//example.com/x', 'docs']) {
      const answer = await harness.call('goto', { path })
      expect(answer.error, path).toMatch(/^called goto .*, (which is not on|but only paths on) http:\/\/127\.0\.0\.1:3100/)
    }
    expect((await harness.call('goto', { path: '/docs/getting-started' })).output).toContain('url: http://127.0.0.1:3100/docs/getting-started')
    expect((await harness.call('click', { ref: 'e9999' })).error).toMatch(/^called click e9999, which failed/)
  } finally { await harness.dispose(); await store.close() }
})

test('a time-limit end the collector stored stands: the loop neither overwrites its reason nor ends the attempt twice', async () => {
  const { store, agent, trials } = await setUp()
  try {
    let ended: string | undefined
    const [trial] = await trials({
      async step({ messages }) {
        if (!messages.some(m => m.role === 'tool')) return step({ name: 'look', input: {} })
        // The collector ends the attempt as the time limit passes, while the agent is still working (what its `end` action stores).
        if (!ended) {
          const [attempt] = await store.listAttempts(agent.run)
          ended = new Date().toISOString()
          await store.updateAttempt(attempt!.id, { status: 'questions', reason: 'timeout', endedAt: ended }, 'active')
        }
        return messages.some(m => m.role === 'tool' && m.name === 'click') ? step({ name: 'done', input: {} }) : step({ name: 'click', input: { ref: 'e1' } })
      },
    })
    const [attempt] = await store.listAttempts(agent.run)
    expect(attempt).toMatchObject({ status: 'finished', reason: 'timeout', endedAt: ended })
    expect(trial!.verification).toMatchObject({ status: 'incorrect', reason: 'Terminal reason: timeout' })
    expect(trial!.state).toBe('stopped')
  } finally { await store.close() }
})

test('a done that could not press the bar does not end the trial', async () => {
  const { store, agent, trials } = await setUp()
  try {
    const [trial] = await trials({
      async step({ messages }) {
        const answers = messages.filter(m => m.role === 'tool')
        if (!answers.length) return step({ name: 'goto', input: { path: '/docs/getting-started' } })
        // The page is the guide, which has the bar: leave for an origin-less page first so the bar is absent, by pressing done on a blank page.
        if (answers.length === 1) return step({ name: 'goto', input: { path: '/api/ui-tests/' } })
        return answers.length === 2 ? step({ name: 'done', input: {} }) : answers.length === 3 ? step({ name: 'goto', input: { path: '/docs/getting-started' } }) : step({ name: 'done', input: {} })
      },
    })
    const done = trial!.transcript.filter(m => m.role === 'tool' && m.name === 'done')
    expect(done[0]).toMatchObject({ error: expect.stringContaining('could not press the task bar') })
    expect(done[1]).toMatchObject({ output: 'the task has ended' })
    expect(trial).toMatchObject({ state: 'verified', claimedDone: true, recovered: true })
  } finally { await store.close() }
})
