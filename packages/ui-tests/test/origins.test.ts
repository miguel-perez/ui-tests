import { describe, expect, it } from 'vitest'
import { appUrlOf, originOf, runOrigins, setRunApp } from '../src/server/origins.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const run = (fields: Partial<RunRow>) => ({ target: 'http://localhost:3000', ...fields }) as RunRow

describe('originOf', () => {
  it('lower-cases scheme and host and drops the path', () => {
    expect(originOf('HTTP://Example.com:443/x')).toBe('http://example.com:443')
    expect(originOf('https://tunnel.example/a?b=1')).toBe('https://tunnel.example')
  })
  it('is undefined for anything but an http(s) URL', () => {
    expect(originOf('not a url')).toBeUndefined()
    expect(originOf('file:///tmp/x')).toBeUndefined()
  })
})

describe('appUrlOf and runOrigins', () => {
  it('opens the app at appUrl, else the target', () => {
    expect(appUrlOf(run({ appUrl: 'https://tunnel.example' }))).toBe('https://tunnel.example')
    expect(appUrlOf(run({}))).toBe('http://localhost:3000')
  })
  it('adds the other loopback spelling to a loopback target', () => {
    expect(runOrigins({ target: 'http://127.0.0.1:3000/' } as RunRow)).toEqual(['http://127.0.0.1:3000', 'http://localhost:3000'])
  })
  it('lists the stored origins and the target, deduplicated', () => {
    expect(runOrigins(run({ target: 'https://app.example/', origins: ['https://tunnel.example', 'https://app.example'] }))).toEqual(['https://tunnel.example', 'https://app.example'])
    expect(runOrigins(run({ target: 'https://app.example', appUrl: 'https://tunnel.example' }))).toEqual(['https://tunnel.example', 'https://app.example'])
  })
})

describe('setRunApp', () => {
  it('keeps every tunnel origin and the latest appUrl', async () => {
    const store = new SqliteStore(':memory:')
    const { run: created } = await store.createRun(newRun('k1', { origins: ['http://localhost:3000'] }))
    await setRunApp(store, created.run, 'https://one.example/')
    const second = await setRunApp(store, created.run, 'https://two.example/')
    expect(second).toMatchObject({ appUrl: 'https://two.example/', origins: ['http://localhost:3000', 'https://one.example', 'https://two.example'] })
    expect(await store.getRun(created.run)).toMatchObject({ appUrl: 'https://two.example/', origins: second.origins, revision: 3 })
    await store.close()
  })
  it('rejects a value that is not a URL and a run that does not exist', async () => {
    const store = new SqliteStore(':memory:')
    const { run: created } = await store.createRun(newRun('k1'))
    await expect(setRunApp(store, created.run, 'tunnel')).rejects.toThrow(/URL/)
    await expect(setRunApp(store, 'r_missing', 'https://x.example')).rejects.toThrow(/No such run/)
    await store.close()
  })
})
