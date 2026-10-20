import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseHTML } from 'linkedom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy } from '../src/compile.ts'
import { mountBar } from '../src/browser/mount.tsx'
import { FirstClickBar, Taskbar } from '../src/browser/taskbar.tsx'
import { brandedHost, chromeTheme, chromeVars, readHost } from '../src/browser/theme.ts'
import type { Screen } from '../src/player/flow.ts'
import { PlayerScreen } from '../src/player/screens.tsx'
import { reportDocument } from '../src/report/document.ts'
import { buildRecord } from '../src/record/build.ts'
import { playerShell } from '../src/server/shell.ts'
import { barView, participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { UiTestsConfig } from '../src/types.ts'
import { view } from './player-fixtures.ts'
import { newRun } from './store-conformance.ts'

const { getStudies, resetStudies } = api
const brand = { name: 'Acme', logo: 'https://acme.test/l.svg', accent: '#0a7d4f', background: '#ffffff', text: '#111111', font: { family: 'Inter', url: 'https://fonts.test/inter.css' } }
const config: UiTestsConfig = { author: 'Acme Labs', brand }

function compile(cfg: UiTestsConfig) {
  resetStudies()
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', exampleFile.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
  return compileStudy(getStudies()[0]!, cfg)
}
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the brand', () => {
  beforeEach(() => resetStudies())

  it('stores the brand with the run', async () => {
    const compiled = compile(config)
    expect(compiled.brand).toEqual(brand)
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('b', { compiled }))
    const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
    expect(participantView(run, attempt).brand).toEqual(brand)
    expect(barView(run, attempt).brand).toEqual(brand)
  })

  it('defaults the name to the author, then the product, and the consent to the same name', () => {
    expect(compile({ author: 'Acme Labs' }).brand).toEqual({ name: 'Acme Labs' })
    expect(compile({ product: 'Weekboard' }).brand).toEqual({ name: 'Weekboard' })
    expect(compile({ author: 'Acme Labs', brand: { name: 'Acme' } }).consent.text[0]).toMatch(/^Acme will watch/)
  })

  it('refuses unsafe values, naming the field', () => {
    expect(() => compile({ brand: { accent: 'red;}' } })).toThrow(/brand\.accent/)
    expect(() => compile({ brand: { background: 'url(x)' } })).toThrow(/brand\.background/)
    expect(() => compile({ brand: { text: '#12' } })).toThrow(/brand\.text/)
    expect(() => compile({ brand: { logo: 'javascript:x' } })).toThrow(/brand\.logo/)
    expect(() => compile({ brand: { logo: 'http://acme.test/l.png' } })).toThrow(/brand\.logo/)
    expect(() => compile({ brand: { logo: 'data:text/html,<script>' } })).toThrow(/brand\.logo/)
    expect(() => compile({ brand: { font: { family: 'x"><script>' } } })).toThrow(/brand\.font\.family/)
    expect(() => compile({ brand: { font: { family: 'Inter', url: 'http://fonts.test/a.css' } } })).toThrow(/brand\.font\.url/)
    for (const logo of ['http://localhost:3000/l.png', 'http://127.0.0.1/l.png', 'data:image/png;base64,AAAA', 'data:image/svg+xml,%3Csvg%3E']) expect(compile({ brand: { logo } }).brand.logo).toBe(logo)
  })

  it('shows no ui-tests marks anywhere a participant looks', async () => {
    const v = view({ brand, answer: { question: 'Which plan?', choices: ['A', 'B'] } })
    const screens: Screen[] = [{ kind: 'consent' }, { kind: 'card' }, { kind: 'ease' }, { kind: 'difficulty' }, { kind: 'confidence' }, { kind: 'uxlite', item: 1 }, { kind: 'comment' }, { kind: 'thanks' }, { kind: 'withdrawn' }, { kind: 'answer' }]
    const pages = screens.map((screen) => renderToStaticMarkup(createElement(PlayerScreen, { view: v, screen, answers: {}, onAnswer: () => {}, onNext: () => {}, onStart: () => {}, onWithdraw: () => {} })))
    expect(pages[0]).toContain('<img src="https://acme.test/l.svg" alt="Acme"')
    const theme = chromeTheme()
    const bar = renderToStaticMarkup(createElement(Taskbar, { view: { goal: { name: 'Send an invoice', scenario: 'You owe Dana.' }, brand }, theme, offerMoreTime: true, busy: false, onEnd: () => {}, onMoreTime: () => {}, markRoot: true }))
    const first = renderToStaticMarkup(createElement(FirstClickBar, { theme, brand, markRoot: true }))
    expect(bar).toContain('alt="Acme"')
    expect(first).toContain('alt="Acme"')
    const shell = playerShell({ runId: 'r_01', brand, script: '/ui-tests/assets/player-abc.js' })
    const store = new SqliteStore(':memory:')
    const compiled = compile(config)
    const { run } = await store.createRun(newRun('r', { compiled }))
    const record = await buildRecord(store, run.run)
    const report = reportDocument({ record, link: (path) => path, replayScript: '/ui-tests/assets/replay-abc.js' })!
    for (const page of [...pages, bar, first, shell, report]) {
      // What a person or their screen reader meets: the text, the title, and the words in aria-label, title and alt. Addresses are not read.
      const words = [...page.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => m[1]).join(' ')
      const read = `${text(page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<title>([\s\S]*?)<\/title>/, ' $1 '))} ${words}`.toLowerCase()
      expect(read).not.toContain('ui-tests')
      expect(read).not.toContain('powered by')
    }
    expect(report).toContain('alt="Acme"')
  })

  it('takes the bar colours from the brand, else from the host', () => {
    const style = { color: 'rgb(20, 40, 60)', backgroundColor: 'rgb(250, 250, 240)', fontFamily: 'Georgia', getPropertyValue: () => '' }
    const page = { body: {}, documentElement: {}, defaultView: { getComputedStyle: () => style } } as unknown as Document
    const host = readHost(page)
    const branded = chromeVars(chromeTheme(brandedHost(host, { background: '#ffffff', text: '#111111' })))
    expect(branded['--uit-surface']).toBe('#111111')
    expect(branded['--uit-ink']).toBe('#ffffff')
    expect(chromeVars(chromeTheme(brandedHost(host, {})))).toEqual(chromeVars(chromeTheme(host)))
    expect(chromeVars(chromeTheme(brandedHost(host, { font: { family: 'Inter' } })))['--uit-font']).toBe('Inter')
    expect(chromeVars(chromeTheme(brandedHost(host, { accent: '#0a7d4f' })))['--uit-accent']).toBeDefined()
  })

  it('accepts a font name the player page keeps, and refuses one it would drop', () => {
    expect(compile({ brand: { font: { family: 'Inter (x)' } } }).brand.font?.family).toBe('Inter (x)')
    expect(playerShell({ runId: 'r', brand: { name: 'A', font: { family: 'Inter (x)' } }, script: '/s.js' })).toContain('--pl-font:Inter (x)')
    expect(() => compile({ brand: { font: { family: "'Open Sans'" } } })).toThrow(/brand\.font\.family/)
  })

  it('pins the report to a readable pair when the brand sets one colour', async () => {
    const store = new SqliteStore(':memory:')
    const page = async (colours: UiTestsConfig['brand']) => {
      const { run } = await store.createRun(newRun(`k${Math.random()}`, { compiled: compile({ brand: colours }) }))
      return reportDocument({ record: await buildRecord(store, run.run), link: (path) => path, replayScript: '/r.js' })!
    }
    const dark = await page({ background: '#101020' })
    expect(dark).toContain('--uit-ground:#101020')
    expect(dark).toContain('--uit-ink:#ffffff')
    const light = await page({ text: '#202020' })
    expect(light).toContain('--uit-ink:#202020')
    expect(light).toContain('--uit-ground:#ffffff')
    expect(await page({ background: '#fafafa' })).toContain('--uit-ink:#000000')
    expect(await page({ accent: '#0a7d4f' })).toContain('<main class="uit-report" style="--uit-accent:#0a7d4f">')
  })

  it('links the brand font in the page head once while the bar is mounted, and only over https', async () => {
    const dom = parseHTML('<!doctype html><html><head></head><body><main>App</main></body></html>')
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.document)
    const doc = dom.document as unknown as Document
    const send = (url: string) => async () => ({ ...barView(...(await started())), brand: { name: 'Acme', font: { family: 'Inter', url } } })
    const store = new SqliteStore(':memory:')
    const started = async () => {
      const { run } = await store.createRun(newRun(`f${Math.random()}`, { compiled: compile(config) }))
      const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
      return [run, attempt] as const
    }
    const client = (url: string) => ({ view: send(url), post: async () => new Response(), back() {} })
    const unmount = mountBar(client('https://fonts.test/inter.css'), doc)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(doc.querySelectorAll('link[data-ui-tests-font]')).toHaveLength(1)
    expect(doc.querySelector('link[data-ui-tests-font]')?.getAttribute('href')).toBe('https://fonts.test/inter.css')
    unmount()
    expect(doc.querySelectorAll('link[data-ui-tests-font]')).toHaveLength(0)
    const plain = mountBar(client('http://fonts.test/inter.css'), doc)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(doc.querySelectorAll('link[data-ui-tests-font]')).toHaveLength(0)
    plain()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  it('carries the brand on the player page', () => {
    const html = playerShell({ runId: 'r_01', brand, script: '/ui-tests/assets/player-abc.js' })
    expect(html).toContain('<title>Acme</title>')
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.test/inter.css">')
    expect(html).toContain('--pl-accent:#0a7d4f')
    expect(html).toContain('--pl-font:Inter')
  })
})
