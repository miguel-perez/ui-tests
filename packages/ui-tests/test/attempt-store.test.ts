import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEY, forgetAttempt, readAttempt, writeAttempt, type StoredAttempt } from '../src/browser/attempt.ts'
import { createDatabase, databaseNames, memoryStorage } from './browser-fixtures.ts'

const SERVER = 'https://tests.example.com'
const attempt: StoredAttempt = { v: 1, server: SERVER, run: 'r_A', attempt: 'a1', key: 'k'.repeat(64), expiresAt: 2_000 }

describe('the stored attempt', () => {
  it('reads back what was written, for this server and before it expires', () => {
    const storage = memoryStorage()
    writeAttempt(storage, attempt)
    expect(readAttempt(storage, SERVER, 1_000)).toEqual(attempt)
    expect(readAttempt(storage, 'https://other.test', 1_000)).toBeUndefined()
    expect(readAttempt(storage, SERVER, 2_000)).toBeUndefined()
    expect(readAttempt(undefined, SERVER, 1_000)).toBeUndefined()
  })

  it('reads anything else as no attempt', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...attempt, v: 2 }))
    expect(readAttempt(storage, SERVER, 1_000)).toBeUndefined()
    storage.setItem(STORAGE_KEY, '{not json')
    expect(readAttempt(storage, SERVER, 1_000)).toBeUndefined()
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...attempt, key: 7 }))
    expect(readAttempt(storage, SERVER, 1_000)).toBeUndefined()
  })

  it('forgets the attempt and the events kept for it', async () => {
    const storage = memoryStorage()
    const idb = new IDBFactory()
    writeAttempt(storage, attempt)
    await createDatabase(idb, 'ui-tests-events:a1')
    await createDatabase(idb, 'ui-tests-replay:a1')
    await createDatabase(idb, 'ui-tests-events:a0')
    forgetAttempt(storage, idb, 'a1')
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
    await vi.waitFor(async () => expect(await databaseNames(idb)).toEqual(['ui-tests-events:a0']))
  })

  it('leaves another attempt where it is', () => {
    const storage = memoryStorage()
    writeAttempt(storage, { ...attempt, attempt: 'a2' })
    forgetAttempt(storage, undefined, 'a1')
    expect(readAttempt(storage, SERVER, 1_000)?.attempt).toBe('a2')
  })

  it('never throws, even when storage does', () => {
    const throwing = new Proxy(memoryStorage(), { get() { throw new Error('blocked') } })
    expect(() => forgetAttempt(throwing, { deleteDatabase() { throw new Error('blocked') } } as unknown as IDBFactory, 'a1')).not.toThrow()
    expect(() => writeAttempt(throwing, attempt)).not.toThrow()
    expect(readAttempt(throwing, SERVER, 1_000)).toBeUndefined()
  })
})
