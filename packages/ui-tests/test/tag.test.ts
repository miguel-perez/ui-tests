import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { TAG_SCRIPT, tagFor } from '../src/browser/tag.ts'

const SERVER = 'https://tests.example.com'

type Page = { href: string; server?: string; stored?: unknown; storageThrows?: boolean; now?: number }

/** Runs the snippet against a fake page and returns what it appended to the head and what it put in the address bar. */
function run({ href, server = SERVER, stored, storageThrows, now = 1_000_000 }: Page) {
  const appended: { type: string; src: string }[] = []
  const replaced: [unknown, string, string][] = []
  const url = new URL(href)
  const document = {
    currentScript: { getAttribute: (name: string) => (name === 'data-ui-tests' ? server : null) },
    createElement: () => ({ type: '', src: '' }),
    head: { appendChild: (element: { type: string; src: string }) => appended.push(element) },
  }
  const context: Record<string, unknown> = {
    document,
    location: { href: url.href, hash: url.hash },
    history: { state: { kept: true }, replaceState: (state: unknown, title: string, next: string) => replaced.push([state, title, next]) },
    Date: { now: () => now },
    URL,
  }
  Object.defineProperty(context, 'localStorage', {
    get() {
      if (storageThrows) throw new Error('blocked')
      return { getItem: (key: string) => (key === 'ui-tests-attempt' && stored !== undefined ? JSON.stringify(stored) : null) }
    },
  })
  runInNewContext(TAG_SCRIPT, context)
  return { appended, replaced }
}

describe('the script tag', () => {
  it('makes no request and changes nothing without an attempt', () => {
    const { appended, replaced } = run({ href: 'https://app.test/start' })
    expect(appended).toHaveLength(0)
    expect(replaced).toHaveLength(0)
  })

  it('loads the loader from data-ui-tests only', () => {
    const { appended } = run({ href: 'https://app.test/start#ui-tests=r_A.c0de' })
    expect(appended).toHaveLength(1)
    expect(appended[0]!.type).toBe('module')
    expect(appended[0]!.src).toBe('https://tests.example.com/ui-tests.js#r_A.c0de')
    for (const hash of ['#ui-tests=r_A.c&server=https://evil.example', '#ui-tests=https://evil.example/x.js']) {
      const crafted = run({ href: `https://app.test/start${hash}` })
      expect(crafted.appended).toHaveLength(1)
      expect(new URL(crafted.appended[0]!.src).origin).toBe('https://tests.example.com')
    }
  })

  it('takes the address without its trailing slash', () => {
    const { appended } = run({ href: 'https://app.test/#ui-tests=r_A.c', server: 'https://tests.example.com/' })
    expect(appended[0]!.src).toBe('https://tests.example.com/ui-tests.js#r_A.c')
  })

  it('compares and loads by the normalised origin', () => {
    const now = 1_000_000
    const { appended } = run({ href: 'https://app.test/next', server: 'https://Tests.Example.com:443/', now, stored: { server: 'https://tests.example.com', expiresAt: now + 1 } })
    expect(appended.map((element) => element.src)).toEqual(['https://tests.example.com/ui-tests.js'])
  })

  it('removes the code from the address', () => {
    expect(run({ href: 'https://app.test/start#ui-tests=r_A.c' }).replaced).toEqual([[{ kept: true }, '', 'https://app.test/start']])
    expect(run({ href: 'https://app.test/#/board&ui-tests=r_A.c' }).replaced[0]![2]).toBe('https://app.test/#/board')
    expect(run({ href: 'https://app.test/#ui-tests=r_A.c&tab=2' }).replaced[0]![2]).toBe('https://app.test/#tab=2')
    expect(run({ href: 'https://app.test/#a&ui-tests=r_A.c&b' }).replaced[0]![2]).toBe('https://app.test/#a&b')
  })

  it('refuses a server that is not an absolute http(s) origin', () => {
    for (const server of ['', 'javascript:alert(1)', '/relative', 'https://x.test/path', 'https://x.test#a', 'https://x.test?a', 'https://x .test']) {
      expect(run({ href: 'https://app.test/#ui-tests=r_A.c', server }).appended, server).toHaveLength(0)
    }
  })

  it('uses only an unexpired attempt for this server', () => {
    const now = 1_000_000
    const loaded = run({ href: 'https://app.test/next', now, stored: { server: SERVER, expiresAt: now + 1 } })
    expect(loaded.appended.map((element) => element.src)).toEqual(['https://tests.example.com/ui-tests.js'])
    expect(loaded.replaced).toHaveLength(0)
    expect(run({ href: 'https://app.test/next', now, stored: { server: SERVER, expiresAt: now } }).appended).toHaveLength(0)
    expect(run({ href: 'https://app.test/next', now, stored: { server: 'https://other.test', expiresAt: now + 1 } }).appended).toHaveLength(0)
    expect(() => run({ href: 'https://app.test/next', storageThrows: true })).not.toThrow()
    expect(run({ href: 'https://app.test/next', storageThrows: true }).appended).toHaveLength(0)
  })

  it('stays small', () => {
    expect(TAG_SCRIPT.length).toBeLessThanOrEqual(700)
    expect(tagFor('https://t.test').startsWith('<script data-ui-tests="https://t.test">')).toBe(true)
    expect(tagFor('https://t.test').endsWith('</script>')).toBe(true)
    expect(tagFor('https://t.test/"><b>')).toContain('data-ui-tests="https://t.test/&quot;&gt;&lt;b&gt;"')
  })
})
