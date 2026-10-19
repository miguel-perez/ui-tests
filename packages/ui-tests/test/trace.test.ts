import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { buildTrace } from '../src/trace/build.ts'
import { serveTrace } from '../src/trace/serve.ts'
import { TraceView } from '../src/trace/view.tsx'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
const closers: (() => Promise<void>)[] = []

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

async function rehearsal() {
  store = new SqliteStore(':memory:')
  const { run } = await store.createRun(newRun('k', { compiled: compileStudy(studies[0], {}), hooksBundle: code, rehearsal: true }))
  const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: true, setupValues: { code: 'abc' } })
  await store.updateAttempt(attempt.id, {
    status: 'finished', reason: 'done', startedAt: new Date(0).toISOString(), endedAt: new Date(12_500).toISOString(),
    verification: { status: 'incorrect', steps: [], diff: { expected: '/docs/getting-started', actual: '/pricing' } },
  })
  await store.appendEvents(attempt.id, [
    { type: 'url', at: 0, url: 'http://t.test/', seq: 1 },
    { type: 'click', at: 1000, url: 'http://t.test/', target: 'a#pricing', changed: false, seq: 2 },
    { type: 'url', at: 2000, url: 'http://t.test/pricing', seq: 3 },
  ])
  await store.putSnapshot(attempt.id, 'end', { url: 'http://t.test/pricing', dom: '<html></html>' })
  return run
}

describe('trace', () => {
  it('renders everything the author needs for an incorrect rehearsal', async () => {
    const run = await rehearsal()
    const trace = await buildTrace(store, run.run)
    expect(trace.actor).toBe('human')
    expect(trace.attempts[0]).toMatchObject({ path: ['/', '/pricing'], happyPath: ['/', '/docs/getting-started'], snapshotUrl: 'http://t.test/pricing', timings: { onGoalMs: 12_500 } })
    expect(trace.attempts[0].signals.map(s => s.kind)).toEqual(expect.arrayContaining(['dead-click', 'deviation', 'false-done']))
    const html = renderToString(createElement(TraceView, { trace }))
    expect(html).toContain('Rehearsal · human')
    for (const d of trace.derivations) { expect(html).toContain(d.field); expect(html).toContain(d.rule.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')) }
    expect(html).toContain(trace.scenario.shown)
    expect(html).toContain('Nothing changed within 300 ms after clicking a#pricing')
    expect(html).toContain('/ → /pricing')
    expect(html).toContain('/ → /docs/getting-started')
    expect(html).toContain('http://t.test/pricing')
    expect(html).toContain('Expected')
    expect(html).toContain('Actual')
    expect(html).toContain('12.5 s')
    expect(html).toContain('Rehearsal: 0 of 5 planned attempts recorded.')
    expect(html).toContain(trace.sampleSentence)
  })

  it('serves the run list, the trace page and the same Trace as JSON, on loopback only', async () => {
    const run = await rehearsal()
    const server = await serveTrace({ store, port: 0 })
    closers.push(server.close)
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const json = await (await fetch(`${server.url}/runs/${run.run}.json`)).json()
    expect(json).toEqual(JSON.parse(JSON.stringify(await buildTrace(store, run.run))))
    expect(await (await fetch(`${server.url}/`)).text()).toContain(run.run)
    const page = await fetch(`${server.url}/runs/${run.run}/`)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Rehearsal · human')
    expect((await fetch(`${server.url}/runs/${run.run}`, { redirect: 'manual' })).status).toBe(308)
    expect((await fetch(`${server.url}/runs/r_missing.json`)).status).toBe(404)
  })

  it('refuses a host that is not this machine, and a rebinding Host header', async () => {
    await rehearsal()
    await expect(serveTrace({ store, port: 0, host: '0.0.0.0' })).rejects.toThrow(/this machine only/)
    const server = await serveTrace({ store, port: 0 })
    closers.push(server.close)
    const { request } = await import('node:http')
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${server.url}/`, { headers: { host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode ?? 0) })
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })
})
