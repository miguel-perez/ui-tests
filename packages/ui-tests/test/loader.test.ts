import { IDBFactory } from 'fake-indexeddb'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, readAttempt, writeAttempt, type StoredAttempt } from '../src/browser/attempt.ts'
import { keyClient } from '../src/browser/key-client.ts'
import { start, type LoaderDeps } from '../src/browser/loader.ts'
import { mountBar } from '../src/browser/mount.tsx'
import { createDatabase, databaseNames, memoryStorage } from './browser-fixtures.ts'

const SERVER = 'https://tests.example.com'
const KEY = 'a'.repeat(64)
const LATER = Date.now() + 7_200_000

type Listener = (event: { key: string | null; newValue: string | null }) => void

function fakes(answer: () => Promise<Response>) {
  const listeners: Listener[] = []
  const unmount = vi.fn()
  const mountBar = vi.fn(() => unmount)
  const fetch = vi.fn(answer)
  const deps = {
    fetch,
    storage: memoryStorage(),
    idb: new IDBFactory(),
    location: { assign: vi.fn() },
    addEventListener: (type: string, listener: Listener) => { if (type === 'storage') listeners.push(listener) },
    importBar: vi.fn(async () => ({ mountBar })),
  }
  return { deps: deps as unknown as LoaderDeps & typeof deps, listeners, mountBar, unmount, fetch }
}

const exchanged = (attempt: string) => async () => Response.json({ key: KEY, run: 'r_A', attempt, expiresAt: LATER })
const stored = (attempt: string, run = 'r_A'): StoredAttempt => ({ v: 1, server: SERVER, run, attempt, key: 'b'.repeat(64), expiresAt: LATER })

let document: Document
beforeEach(() => {
  document = parseHTML('<!doctype html><html><head><title>App</title></head><body><main><h1>Board</h1></main></body></html>').document as unknown as Document
  vi.stubGlobal('document', document)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('the loader', () => {
  it('trades the code for a key and mounts the bar', async () => {
    const { deps, mountBar, fetch } = fakes(exchanged('a1'))
    await start(`${SERVER}/ui-tests.js#r_A.c0de`, deps)
    expect(readAttempt(deps.storage, SERVER, Date.now())).toEqual({ v: 1, server: SERVER, run: 'r_A', attempt: 'a1', key: KEY, expiresAt: LATER })
    expect(mountBar).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${SERVER}/api/ui-tests/exchange?run=r_A`)
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(new Headers(init.headers).has('authorization')).toBe(false)
    expect(JSON.parse(String(init.body))).toEqual({ code: 'c0de' })
  })

  it('mounts the bar from a stored attempt without a request', async () => {
    const { deps, mountBar, fetch } = fakes(exchanged('a1'))
    writeAttempt(deps.storage, stored('a1'))
    await start(`${SERVER}/ui-tests.js`, deps)
    expect(fetch).not.toHaveBeenCalled()
    expect(mountBar).toHaveBeenCalledTimes(1)
  })

  it('replaces an older attempt', async () => {
    const { deps, mountBar } = fakes(exchanged('a2'))
    writeAttempt(deps.storage, stored('a1', 'r_Old'))
    await start(`${SERVER}/ui-tests.js#r_A.c0de`, deps)
    expect(readAttempt(deps.storage, SERVER, Date.now())?.attempt).toBe('a2')
    expect(mountBar).toHaveBeenCalledTimes(1)
  })

  it('keeps nothing after a failed exchange', async () => {
    const { deps, mountBar } = fakes(async () => new Response('Unauthorized', { status: 401 }))
    writeAttempt(deps.storage, stored('a1'))
    await start(`${SERVER}/ui-tests.js#r_A.c0de`, deps)
    expect(deps.storage.getItem(STORAGE_KEY)).toBeNull()
    expect(mountBar).not.toHaveBeenCalled()
  })

  it('keeps another run\'s attempt after a failed exchange, and mounts nothing', async () => {
    const { deps, mountBar } = fakes(async () => new Response('Unauthorized', { status: 401 }))
    writeAttempt(deps.storage, stored('a1', 'r_Other'))
    await start(`${SERVER}/ui-tests.js#r_A.c0de`, deps)
    expect(readAttempt(deps.storage, SERVER, Date.now())?.attempt).toBe('a1')
    expect(mountBar).not.toHaveBeenCalled()
  })

  it('leaves the page alone when the server is down', async () => {
    const before = document.documentElement.outerHTML
    const down = fakes(() => Promise.reject(new TypeError('Failed to fetch')))
    down.deps.importBar.mockRejectedValue(new TypeError('Failed to fetch dynamically imported module'))
    await expect(start(`${SERVER}/ui-tests.js#r_A.c0de`, down.deps)).resolves.toBeUndefined()
    writeAttempt(down.deps.storage, stored('a1'))
    await expect(start(`${SERVER}/ui-tests.js`, down.deps)).resolves.toBeUndefined()
    expect(down.deps.importBar).toHaveBeenCalled()
    await expect(start('not a url', down.deps)).resolves.toBeUndefined()
    expect(document.documentElement.outerHTML).toBe(before)
  })

  it('unmounts when another tab ends the attempt', async () => {
    const { deps, listeners, unmount } = fakes(exchanged('a1'))
    writeAttempt(deps.storage, stored('a1'))
    await start(`${SERVER}/ui-tests.js`, deps)
    for (const listener of listeners) listener({ key: 'something-else', newValue: null })
    expect(unmount).not.toHaveBeenCalled()
    for (const listener of listeners) listener({ key: STORAGE_KEY, newValue: null })
    for (const listener of listeners) listener({ key: STORAGE_KEY, newValue: null })
    expect(unmount).toHaveBeenCalledTimes(1)
  })

  it('unmounts when another tab starts a different attempt', async () => {
    const { deps, listeners, unmount } = fakes(exchanged('a1'))
    writeAttempt(deps.storage, stored('a1'))
    await start(`${SERVER}/ui-tests.js`, deps)
    for (const listener of listeners) listener({ key: STORAGE_KEY, newValue: JSON.stringify(stored('a1')) })
    expect(unmount).not.toHaveBeenCalled()
    for (const listener of listeners) listener({ key: STORAGE_KEY, newValue: JSON.stringify(stored('a2')) })
    expect(unmount).toHaveBeenCalledTimes(1)
  })
})

describe('the bar\'s client', () => {
  it('sends the attempt key, never cookies, and names the run', async () => {
    const { deps, fetch } = fakes(async () => Response.json({ run: 'r_A' }))
    const client = keyClient(SERVER, stored('a1'), deps)
    await client.view()
    await client.post({ action: 'events', events: [] })
    const [[viewUrl, viewInit], [postUrl, postInit]] = fetch.mock.calls as unknown as [string, RequestInit][]
    expect(viewUrl).toBe(`${SERVER}/api/ui-tests/?run=r_A&view=bar`)
    expect(postUrl).toBe(`${SERVER}/api/ui-tests/?run=r_A`)
    for (const init of [viewInit!, postInit!]) {
      expect(init.credentials).toBe('omit')
      expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${'b'.repeat(64)}`)
    }
  })

  it('a 401 on the bar view forgets the attempt', async () => {
    const { deps } = fakes(async () => new Response('Unauthorized', { status: 401 }))
    writeAttempt(deps.storage, stored('a1'))
    await createDatabase(deps.idb, 'ui-tests-events:a1')
    await createDatabase(deps.idb, 'ui-tests-replay:a1')
    expect(await keyClient(SERVER, stored('a1'), deps).view()).toBeUndefined()
    expect(deps.storage.getItem(STORAGE_KEY)).toBeNull()
    await vi.waitFor(async () => expect(await databaseNames(deps.idb)).toEqual([]))
  })

  it('goes back to the player on the server and forgets the attempt', () => {
    const { deps } = fakes(exchanged('a1'))
    writeAttempt(deps.storage, stored('a1'))
    keyClient(SERVER, stored('a1'), deps).back('after=1')
    expect(deps.storage.getItem(STORAGE_KEY)).toBeNull()
    expect(deps.location.assign).toHaveBeenCalledWith(`${SERVER}/ui-tests/r_A/?after=1`)
  })
})

describe('the bar\'s mount', () => {
  it('puts one marked host with an open shadow root at the end of the body, and takes it away', async () => {
    const page = parseHTML('<!doctype html><html><body><main>App</main></body></html>')
    vi.stubGlobal('window', page.window)
    vi.stubGlobal('document', page.document)
    const doc = page.document as unknown as Document
    const unmount = mountBar({ view: async () => undefined, post: async () => new Response(), back() {} }, doc)
    const host = doc.body.lastElementChild!
    expect(host.hasAttribute('data-ui-tests-root')).toBe(true)
    expect(doc.querySelectorAll('[data-ui-tests-root]')).toHaveLength(1)
    expect(host.shadowRoot?.querySelector('style')?.textContent).toContain(':host')
    await new Promise((resolve) => setTimeout(resolve, 10))
    unmount()
    unmount()
    expect(doc.querySelector('[data-ui-tests-root]')).toBeNull()
    // React finishes its work on a later tick; the stubbed window must still be there.
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
