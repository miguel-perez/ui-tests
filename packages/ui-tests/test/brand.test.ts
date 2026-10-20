import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy } from '../src/compile.ts'
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
      // Addresses inside attributes are not read by the person; the text and the title are.
      const read = text(page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<title>([\s\S]*?)<\/title>/, ' $1 ')).toLowerCase()
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

  it('carries the brand on the player page', () => {
    const html = playerShell({ runId: 'r_01', brand, script: '/ui-tests/assets/player-abc.js' })
    expect(html).toContain('<title>Acme</title>')
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.test/inter.css">')
    expect(html).toContain('--pl-accent:#0a7d4f')
    expect(html).toContain('--pl-font:Inter')
  })
})
