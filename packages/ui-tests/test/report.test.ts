import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { buildRecord } from '../src/record/build.ts'
import type { RunRecord } from '../src/record/schema.ts'
import { normalisePath, signedUrl, signPath, verifyPath } from '../src/report/sign.ts'
import { ReportView } from '../src/report/view.tsx'
import { FIRST_LOOK_SKIPPED } from '../src/runner/screenshot.ts'
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
      impression: { text: 'a tool for invites', code: 'named the purpose', codedBy: 'rule', firstClick: { target: 'a#docs', url: 'http://t.test/docs/getting-started', onPath: true, at: 900 } },
    },
  })
  await store.appendEvents(first.id, [
    { type: 'url', at: 1000, url: 'http://t.test/', seq: 1 },
    { type: 'click', at: 4000, url: 'http://t.test/', target: 'button#invite', changed: false, seq: 2 },
    { type: 'rrweb', at: 1000, url: 'http://t.test/', data: { type: 4, timestamp: 1000, data: { href: 'http://t.test/', width: 800, height: 600 } }, seq: 3 },
    { type: 'rrweb', at: 9000, url: 'http://t.test/', data: { type: 5, timestamp: 9000, data: { tag: 'end', payload: {} } }, seq: 4 },
  ])

  // The second person was never asked the first look: the picture could not be taken.
  const second = (await store.createAttempt({ runId, participant: 'p_private_2', goalIndex: 0, rehearsal: false })).attempt
  await store.updateAttempt(second.id, {
    status: 'finished', reason: 'gave up', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(30_000).toISOString(),
    answers: { [FIRST_LOOK_SKIPPED]: 'the page could not be pictured' },
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

  it('compares in constant time', async () => {
    const source = await (await import('node:fs/promises')).readFile(join(import.meta.dirname, '..', 'src', 'report', 'sign.ts'), 'utf8')
    expect(source).toContain('timingSafeEqual')
  })

  it('makes a link of a path with its slash and its signature', () => {
    expect(signedUrl('/r/r_1/p2', SECRET)).toBe(`/r/r_1/p2/?sig=${signPath('/r/r_1/p2', SECRET)}`)
  })
})

describe('the report', () => {
  it('opens with the result line and names the measures, the fit and the first look', () => {
    const words = text(render())
    expect(words).toContain(record.sentence)
    for (const name of ['Effectiveness', 'Efficiency', 'Satisfaction', 'Fit']) expect(words).toContain(name)
    expect(words).toContain('What was that page for?')
    expect(words).toContain('1 named the purpose')
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
    expect(html.lastIndexOf('What worked')).toBeGreaterThan(html.lastIndexOf('People<'))
    expect(html.indexOf('Problems')).toBeLessThan(html.indexOf('People<'))
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

  it('says a first look that was never asked is not the same as no answer', () => {
    const words = text(render())
    expect(words).toContain('Never asked of 1 person')
    expect(words).toContain('This is not the same as no answer')
    expect(words).toContain('0 gave no answer')
    expect(text(render({ attemptIndex: 1 }))).toContain('never asked: the picture of the page could not be taken')
    const noAnswer = { ...withFirstLook(record), attempts: record.attempts.map((a, i) => (i === 1 ? { ...a, firstLook: 'asked' as const } : a)), impression: { ...record.impression, neverAsked: 0, noAnswer: 1, denominator: 2 } }
    const other = text(renderToStaticMarkup(ReportView({ record: noAnswer, attemptIndex: 1 })))
    expect(other).toContain('asked')
    expect(other).not.toContain('never asked')
    expect(text(renderToStaticMarkup(ReportView({ record: noAnswer })))).not.toContain('Never asked of')
  })

  it('is white-labelled: the author, the host accent, and no ui-tests name unless poweredBy is on', () => {
    const html = render()
    expect(text(html)).toContain('By Acme Labs')
    expect(html).toContain('--uit-accent:#0a7d4f')
    expect(html.toLowerCase()).not.toContain('ui-tests')
    expect(render({ attemptIndex: 0 }).toLowerCase()).not.toContain('ui-tests')
    const branded = { ...record, compiled: { ...record.compiled, brand: { ...record.compiled.brand, poweredBy: true } } }
    expect(text(renderToStaticMarkup(ReportView({ record: branded })))).toContain('Powered by ui-tests')
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

describe('the report page', () => {
  async function page(secret: string | undefined) {
    vi.resetModules()
    vi.doMock('../src/server/store.ts', () => ({ getStore: async () => store }))
    if (secret === undefined) delete process.env.UI_TESTS_SHARE_SECRET
    else process.env.UI_TESTS_SHARE_SECRET = secret
    return import('../src/server/report-page.tsx')
  }
  const props = (path: string[], search: Record<string, string> = {}) => ({ params: Promise.resolve({ path }), searchParams: Promise.resolve(search) })
  const missing = { digest: expect.stringContaining('NEXT_HTTP_ERROR_FALLBACK;404') }

  it('is a 404 without the secret, without a signature, with a wrong one, and for a run that is not there', async () => {
    const sig = signPath(`/r/${runId}`, SECRET)
    const { ReportPage } = await page(undefined)
    await expect(ReportPage(props([runId], { sig }))).rejects.toMatchObject(missing)
    const set = await page(SECRET)
    await expect(set.ReportPage(props([runId]))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props([runId], { sig: `${sig}x` }))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props([runId], { sig: signPath(`/r/${runId}`, 'other') }))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props(['r_nope'], { sig: signPath('/r/r_nope', SECRET) }))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props([runId, 'p1'], { sig }))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props([runId, 'p9'], { sig: signPath(`/r/${runId}/p9`, SECRET) }))).rejects.toMatchObject(missing)
    await expect(set.ReportPage(props([runId, 'p3'], { sig: signPath(`/r/${runId}/p3`, SECRET) }))).rejects.toMatchObject(missing)
    await expect(set.reportMetadata(props([runId]))).rejects.toMatchObject(missing)
  })

  it('renders the whole report and one person for their own signatures, with signed links inside', async () => {
    const { ReportPage, reportMetadata } = await page(SECRET)
    const whole = renderToStaticMarkup(await ReportPage(props([runId], { sig: signPath(`/r/${runId}`, SECRET) })))
    expect(whole).toContain(record.sentence.replace(/&/g, '&amp;'))
    expect(whole).toContain(`/r/${runId}/p1/?sig=${signPath(`/r/${runId}/p1`, SECRET)}`)
    const one = renderToStaticMarkup(await ReportPage(props([runId, 'p1'], { sig: signPath(`/r/${runId}/p1`, SECRET), at: '4000' })))
    expect(text(one)).toContain('Person 1')
    expect(text(one)).toContain('Opened at the moment 0:03')
    expect(await reportMetadata(props([runId], { sig: signPath(`/r/${runId}`, SECRET) }))).toMatchObject({ title: 'Report · verify fixture' })
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
