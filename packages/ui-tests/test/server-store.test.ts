import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.resetModules(); vi.doUnmock('../src/store/open.ts'); vi.doUnmock('../src/store/retention.ts') })

describe('the server store', () => {
  it('opens without waiting for the retention sweep, which runs in the background', async () => {
    const opened = { close: async () => {} }
    let sweeps = 0
    vi.doMock('../src/store/open.ts', () => ({ openStore: async () => opened }))
    // A sweep that never finishes: the first request must not wait for it.
    vi.doMock('../src/store/retention.ts', () => ({ applyRetention: () => { sweeps++; return new Promise(() => {}) } }))
    const { getStore } = await import('../src/server/store.ts')
    const result = await Promise.race([getStore(), new Promise(resolve => setTimeout(() => resolve('waited'), 1000))])
    expect(result).toBe(opened)
    expect(sweeps).toBe(1)
  })
})
