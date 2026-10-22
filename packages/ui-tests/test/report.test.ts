import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { buildRecord } from '../src/record/build.ts'
import type { RunRecord } from '../src/record/schema.ts'
import { normalisePath, signedUrl, signPath, verifyPath } from '../src/report/sign.ts'
import { ReportView } from '../src/report/view.tsx'

import { reportResponse } from '../src/server/report.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { serveTrace } from '../src/trace/serve.ts'
import { newRun } from './store-conformance.ts'

const fixture = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const HOOKS = 'SECRET_HOOKS_BUNDLE_MARKER'
const SECRET = 'test'
let data: string
let store: SqliteStore
let runId: string
let record: RunRecord

beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), 'ui-tests-report-'))
  const bundle = await bundleStudyFile(fixture)
  const compiled = compileStudy((await loadBundle(bundle.code, fixture))[0]!, { author: 'Acme Labs', product: 'Acme', brand: { accent: '#0a7d4f' }, participants: {} } as never)
  store = new SqliteStore(join(data, 'dev.sqlite'))
  const { run } = await store.createRun(newRun('report', { compiled, hooksBundle: HOOKS, target: 'http://target.test/' }))
  runId = run.run

  const first = (await store.createAttempt({ runId, participant: 'p_private_1', goalIndex: 0, rehearsal: false })).attempt
  await store.updateAttempt(first.id, {
    status: 'finished', reason: 'done', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(20_000).toISOString(),
    verification: { status: 'correct', steps: [] },
    answers: {
      'goal0.ease': 3, 'goal0.difficulty': 'I could not tell which button to press',
      impression: { looked: true, text: 'a tool for invites', parts: { what: true, who: true, action: false, purpose: true }, codedBy: 'model' },
    },
  })
  await store.appendEvents(first.id, [
    { type: 'url', at: 1000, url: 'http://t.test/', seq: 1 },
    { type: 'click', at: 4000, url: 'http://t.test/', target: 'button#invite', changed: false, seq: 2 },
    { type: 'rrweb', at: 1000, url: 'http://t.test/', data: { type: 4, timestamp: 1000, data: { href: 'http://t.test/', width: 800, height: 600 } }, seq: 3 },
    { type: 'rrweb', at: 9000, url: 'http://t.test/', data: { type: 5, timestamp: 9000, data: { tag: 'end', payload: {} } }, seq: 4 },
  ])

  // The second person's first look was answered with no model to code it.
  const second = (await store.createAttempt({ runId, participant: 'p_private_2', goalIndex: 0, rehearsal: false })).attempt
  await store.updateAttempt(second.id, {
    status: 'finished', reason: 'gave up', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(30_000).toISOString(),
    answers: { impression: { looked: true, text: 'a shop for boards', parts: null, uncoded: 'no model is configured' } },
  })
  await store.createAttempt({ runId, participant: 'p_private_3', goalIndex: 0, rehearsal: false })
  record = await buildRecord(store, runId)
})

afterAll(async () => {
  await store.close()
  await rm(data, { recursive: true, force: true })
})

const withFirstLook = (r: RunRecord): RunRecord => ({ ...r, compiled: { ...r.compiled, impression: { ...r.compiled.impression, on: true } } })
const render = (props: Partial<Parameters<typeof ReportView>[0]> = {}) => renderToStaticMarkup(ReportView({ record: withFirstLook(record), ...props }))
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('signed paths', () => {
  it('verifies the path that was signed, with or without the trailing slash', () => {
    const sig = signPath('/r/r_1', SECRET)
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(verifyPath('/r/r_1', sig, SECRET)).toBe(true)
    expect(verifyPath('/r/r_1/', sig, SECRET)).toBe(true)
    expect(verifyPath('/r/r_1/', signPath('/r/r_1/', SECRET), SECRET)).toBe(true)
    expect(normalisePath('/r/r_1//?x=1')).toBe('/r/r_1')
  })

  it('refuses an altered path, an altered signature, a signature under another secret, and no secret', () => {
    const sig = signPath('/r/r_1', SECRET)
    expect(verifyPath('/r/r_2', sig, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1/p1', sig, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', `${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, SECRET)).toBe(false)
    // Spare bits in the last character decode alike; only the exact text verifies.
    expect(verifyPath('/r/r_1', `${sig.slice(0, -1)}${'ABCDEFGHIJKLMNOP'.replace(sig.at(-1)!, '')[0]}`, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', sig.slice(1), SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', sig, 'other')).toBe(false)
    expect(verifyPath('/r/r_1', sig, undefined)).toBe(false)
    expect(verifyPath('/r/r_1', sig, '')).toBe(false)
    expect(verifyPath('/r/r_1', null, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', '', SECRET)).toBe(false)
  })

  it('rejects a wrong signature of the right length, and ones of other lengths, whatever they share with the right one', () => {
    const sig = signPath('/r/r_1', SECRET)
    const wrong = `${'A'.repeat(sig.length - 1)}${sig.at(-1) === 'A' ? 'B' : 'A'}`
    expect(wrong).toHaveLength(sig.length)
    expect(verifyPath('/r/r_1', wrong, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', `${sig}A`, SECRET)).toBe(false)
    expect(verifyPath('/r/r_1', sig.slice(0, 10), SECRET)).toBe(false)
  })

  it('makes a link of a path with its slash and its signature', () => {
    expect(signedUrl('/r/r_1/p2', SECRET)).toBe(`/r/r_1/p2/?sig=${signPath('/r/r_1/p2', SECRET)}`)
  })
})

describe('the report', () => {
  it('opens with the result line and names the measures and the first look, coded part by part', () => {
    const words = text(render())
    expect(words).toContain(record.sentence)
    for (const name of ['Effectiveness', 'Efficiency', 'Satisfaction']) expect(words).toContain(name)
    expect(words).not.toContain('Fit')
    expect(words).toContain('First look, of 1 coded answer: 1 identified it, 1 identified who it is from, 0 named an action, 1 named its purpose.')
  })

  it('ranks the problems as cards with where, who, words, moments and a suggested change, and puts what worked last', () => {
    const html = render()
    const words = text(html)
    expect(record.issues.length).toBeGreaterThan(0)
    expect(words).toContain('Clicking button#invite on / did nothing')
    expect(words).toContain('Where')
    expect(words).toContain('Their words')
    expect(words).toContain('I could not tell which button to press')
    expect(words).toContain('Suggested change')
    expect(html).toMatch(/class="uit-chip" href="\/r\/[^"]+\/p1\?at=4000"/)
    // What worked is the last card, and the people are under the cards.
    expect(html.indexOf('What worked')).toBeGreaterThan(html.lastIndexOf('Suggested change'))
    expect(html.indexOf('What worked')).toBeLessThan(html.indexOf('People<'))
    expect(html).toMatch(/<li class="uit-card"[^>]*><h3 id="uit-worked">What worked/)
    expect(words).toContain('The three most serious problems for each task are named')
  })

  it('lists each person who began, linking to their own page through the link it is given', () => {
    const link = (path: string) => signedUrl(path, SECRET)
    const html = render({ link })
    expect(html).toContain(`href="/r/${runId}/p1/?sig=${signPath(`/r/${runId}/p1`, SECRET)}"`)
    expect(html).toContain(`href="/r/${runId}/p2/?sig=${signPath(`/r/${runId}/p2`, SECRET)}"`)
    // The invite nobody opened is not a person yet.
    expect(html).not.toContain('/p3/')
    expect(html).toContain(`/p1/?sig=${signPath(`/r/${runId}/p1`, SECRET)}&amp;at=4000`)
  })

  it('lists the first-look answers nobody has coded, beside the issues and never counted in them', () => {
    const words = text(render())
    expect(words).toContain('1 first-look answer is not coded yet (no model is configured); code them in the trace.')
    expect(record.impression.uncoded).toEqual([{ attempt: record.attempts[1]!.id, reason: 'no model is configured' }])
    expect(text(render({ attemptIndex: 1 }))).toContain('First look asked')
  })

  it('is white-labelled: the author, the brand accent, and no ui-tests name', () => {
    const html = render()
    expect(text(html)).toContain('By Acme Labs')
    expect(html).toContain('--uit-accent:#0a7d4f')
    expect(html.toLowerCase()).not.toContain('ui-tests')
    expect(render({ attemptIndex: 0 }).toLowerCase()).not.toContain('ui-tests')
  })

  it('shows nothing the record keeps back: no hooks, expected answer, identity, target or recording references', () => {
    const html = render() + render({ attemptIndex: 0 }) + render({ attemptIndex: 1 })
    for (const hidden of [HOOKS, 'hooksBundle', 'Team', 'p_private', 'target.test', 'verify.ui.test', data, 'blob_']) expect(html, hidden).not.toContain(hidden)
  })

  it('opens one person at a moment of their recording', () => {
    const html = render({ attemptIndex: 0, moment: 3000, replay: createElement('p', null, 'player') })
    expect(text(html)).toContain('Person 1')
    expect(text(html)).toContain('Opened at the moment 0:03')
    expect(html).toContain('<p>player</p>')
    expect(text(render({ attemptIndex: 0 }))).toContain('No recording was kept')
  })
})

describe('the shared report on the server', () => {
  const bundles = { loader: '', assets: new Map<string, string>(), player: 'player-abc.js', replay: 'replay-abc.js' }
  const get = async (path: string, secret: string | null = SECRET) => {
    const response = await reportResponse(new Request(`http://server.test${path}`), { store, bundles, ...(secret !== null && { shareSecret: secret }) })
    return { status: response.status, html: await response.text() }
  }

  it('is a 404 without the secret, without a signature, with a wrong one, and for a run that is not there', async () => {
    const sig = signPath(`/r/${runId}`, SECRET)
    expect((await get(`/r/${runId}?sig=${sig}`, null)).status).toBe(404)
    for (const path of [
      `/r/${runId}`,
      `/r/${runId}?sig=${sig}x`,
      `/r/${runId}?sig=${signPath(`/r/${runId}`, 'other')}`,
      `/r/r_nope?sig=${signPath('/r/r_nope', SECRET)}`,
      `/r/${runId}/p1?sig=${sig}`,
      `/r/${runId}/p9?sig=${signPath(`/r/${runId}/p9`, SECRET)}`,
      `/r/${runId}/p3?sig=${signPath(`/r/${runId}/p3`, SECRET)}`,
    ]) expect((await get(path)).status, path).toBe(404)
  })

  it('renders the whole report and one person for their own signatures, with signed links inside', async () => {
    const whole = await get(`/r/${runId}?sig=${signPath(`/r/${runId}`, SECRET)}`)
    expect(whole.status).toBe(200)
    expect(whole.html).toContain(record.sentence.replace(/&/g, '&amp;'))
    expect(whole.html).toContain(`/r/${runId}/p1/?sig=${signPath(`/r/${runId}/p1`, SECRET)}`)
    expect(whole.html).toContain('<title>Report · verify fixture</title>')
    expect(whole.html).toContain('<meta name="description" content="A usability report."/>')
    const one = await get(`/r/${runId}/p1?sig=${signPath(`/r/${runId}/p1`, SECRET)}&at=4000`)
    expect(text(one.html)).toContain('Person 1')
    expect(text(one.html)).toContain('Opened at the moment 0:03')
  })
})

describe('report in the CLI and the local trace', () => {
  const run = async (argv: string[], env: Record<string, string>) => {
    let out = ''
    let err = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: data, env: { UI_TESTS_DATA_DIR: data, ...env } }
    const code = await main(argv, io)
    return { code, out, err }
  }

  it('--share prints the signed link, and refuses without the secret', async () => {
    const shared = await run(['report', runId, '--share'], { UI_TESTS_SHARE_SECRET: SECRET })
    expect(shared).toMatchObject({ code: 0, err: '' })
    expect(shared.out).toBe(`http://target.test/r/${runId}?sig=${signPath(`/r/${runId}`, SECRET)}\n`)
    expect(verifyPath(`/r/${runId}`, new URL(shared.out.trim()).searchParams.get('sig'), SECRET)).toBe(true)
    const none = await run(['report', runId, '--share'], {})
    expect(none).toEqual({ code: 2, out: '', err: 'set UI_TESTS_SHARE_SECRET to create share links\n' })
    expect((await run(['report', runId, '--share'], { UI_TESTS_SHARE_SECRET: '' })).code).toBe(2)
  })

  it('writes the report in words without --json', async () => {
    const { code, out } = await run(['report', runId], {})
    expect(code).toBe(0)
    expect(out).toContain(record.sentence)
    expect(out).toContain('Problems, most serious first:')
  })

  it('serves the same view to the author, unsigned, on this machine', async () => {
    const server = await serveTrace({ store, port: 0 })
    try {
      const whole = await fetch(`${server.url}/runs/${runId}/report/`)
      const body = await whole.text()
      expect(whole.status).toBe(200)
      expect(body).toContain('Effectiveness')
      expect(body).toContain(`href="/runs/${runId}/report/p1/?at=4000"`)
      expect(body).not.toContain('sig=')
      const one = await (await fetch(`${server.url}/runs/${runId}/report/p1/?at=4000`)).text()
      expect(one).toContain('data-replay=')
      expect(one).toContain('"startAt":4000')
      expect(one).not.toContain(HOOKS)
      expect((await fetch(`${server.url}/runs/r_nope/report/`)).status).toBe(404)
    } finally { await server.close() }
  })
})

describe('consent gates the words and the recording', () => {
  const change = (patch: Partial<RunRecord['attempts'][number]>): RunRecord => ({ ...record, attempts: record.attempts.map((a, i) => (i === 0 ? { ...a, ...patch } : a)) })
  const WORDS = 'I could not tell which button to press'

  it('shows words and a play chip only for a person who agreed to analysis by the author', () => {
    expect(text(render())).toContain(WORDS)
    const declined = renderToStaticMarkup(ReportView({ record: change({ purposes: [] }) }))
    expect(text(declined)).not.toContain(WORDS)
    expect(declined).not.toContain('/p1?at=')
    // The other person's page is untouched.
    expect(declined).toContain('/p2')
    const restricted = renderToStaticMarkup(ReportView({ record: change({ restrictions: ['panel terms: no sharing'] }) }))
    expect(text(restricted)).not.toContain(WORDS)
  })

  it('withholds the person page: no ease, no recording, one line saying why', () => {
    const page = text(renderToStaticMarkup(ReportView({ record: change({ purposes: [] }), attemptIndex: 0, moment: 3000, replay: createElement('p', null, 'player') })))
    expect(page).toContain('did not agree to their words and recording being shown here')
    expect(page).not.toContain('player')
    expect(page).not.toContain('Ease')
    expect(page).not.toContain('Opened at the moment')
  })

  it('shows a withdrawn person as withdrawn, with no answers, and the report says it cannot be reproduced in full', () => {
    const withdrawn = { ...change({ reason: 'withdrew' }), quality: { ...record.quality, withdrawn: 1 } }
    const page = text(renderToStaticMarkup(ReportView({ record: withdrawn, attemptIndex: 0 })))
    expect(page).toContain('This person withdrew. Their recording was deleted, and their answers are withheld.')
    expect(page).not.toContain('Ease')
    expect(text(renderToStaticMarkup(ReportView({ record: withdrawn })))).toContain('cannot be reproduced in full')
  })

  it('numbers people by participant: one person in two attempts is one person', () => {
    const same = { ...record, attempts: record.attempts.map((a, i) => (i === 1 ? { ...a, participant: record.attempts[0]!.participant } : a)) }
    const html = renderToStaticMarkup(ReportView({ record: same }))
    expect(html).not.toContain('Person 2')
    expect(html).toContain('/p2')
  })

  it('does not serve the recording of a person who declined, and the local view gives 404 for an unknown person', async () => {
    const [first] = await store.listAttempts(runId)
    await store.updateAttempt(first!.id, { purposes: [] })
    const server = await serveTrace({ store, port: 0 })
    try {
      const body = await (await fetch(`${server.url}/runs/${runId}/report/p1/?at=4000`)).text()
      expect(body).not.toContain('data-replay=')
      expect(body).toContain('did not agree')
      expect((await fetch(`${server.url}/runs/${runId}/report/p9/`)).status).toBe(404)
    } finally {
      await server.close()
      await store.updateAttempt(first!.id, { purposes: first!.purposes })
    }
    // The shared report holds the recording back too.
    await store.updateAttempt(first!.id, { purposes: [] })
    try {
      const response = await reportResponse(new Request(`http://server.test/r/${runId}/p1?sig=${signPath(`/r/${runId}/p1`, SECRET)}&at=4000`), { store, shareSecret: SECRET, bundles: { loader: '', assets: new Map(), player: 'player-abc.js', replay: 'replay-abc.js' } })
      const html = await response.text()
      expect(html).not.toContain('data-replay=')
      expect(text(html)).toContain('did not agree')
    } finally { await store.updateAttempt(first!.id, { purposes: first!.purposes }) }
  })

  it('serves a person\'s video on this machine only when the report may show it', async () => {
    const [first] = await store.listAttempts(runId)
    const blob = await store.putBlob(first!.id, 'video', new Uint8Array([1, 2, 3]), 'video/webm')
    await store.updateAttempt(first!.id, { answers: { ...first!.answers, video: { chunks: [{ segment: 1000, seq: 0, blob, size: 3 }], pauses: {} } } })
    const server = await serveTrace({ store, port: 0 })
    try {
      expect((await fetch(`${server.url}/runs/${runId}/video/1`)).status).toBe(200)
      await store.updateAttempt(first!.id, { purposes: [] })
      expect((await fetch(`${server.url}/runs/${runId}/video/1`)).status).toBe(404)
    } finally {
      await server.close()
      await store.updateAttempt(first!.id, { purposes: first!.purposes, answers: first!.answers })
      await store.deleteBlob(blob)
    }
  })

  it('--share --json prints the link as JSON', async () => {
    let out = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: () => {} }, cwd: data, env: { UI_TESTS_DATA_DIR: data, UI_TESTS_SHARE_SECRET: SECRET } }
    expect(await main(['report', runId, '--share', '--json'], io)).toBe(0)
    expect(JSON.parse(out).url).toBe(`http://target.test/r/${runId}?sig=${signPath(`/r/${runId}`, SECRET)}`)
  })
})
