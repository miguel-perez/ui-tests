import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let work: string
beforeEach(async () => { work = await mkdtemp(join(tmpdir(), 'ui-tests-serve-store-')) })
afterEach(async () => {
  vi.useRealTimers()
  vi.resetModules()
  vi.doUnmock('../src/store/retention.ts')
  await rm(work, { recursive: true, force: true })
})

/** `openServeStore` with `applyRetention` replaced: each sweep is counted, and `sweep` decides what it does. */
async function withSweeps(sweep: () => Promise<number> = async () => 0) {
  const calls: Date[] = []
  vi.doMock('../src/store/retention.ts', () => ({ applyRetention: (_store: unknown, now: Date) => { calls.push(now); return sweep() } }))
  const { openServeStore } = await import('../src/cli/serve.ts')
  return { openServeStore, calls }
}

const io = (env: Record<string, string | undefined>, cwd = work) => {
  let err = ''
  return { env, cwd, stderr: { write: (text: string) => (err += text) }, err: () => err }
}

describe('the store ui-tests serve opens', () => {
  it('opens without waiting for the retention sweep, which runs in the background', async () => {
    // A sweep that never finishes: the store must not wait for it.
    const { openServeStore, calls } = await withSweeps(() => new Promise(() => {}))
    const opened = await Promise.race([openServeStore(io({ UI_TESTS_DATA_DIR: join(work, 'data') })), new Promise((resolve) => setTimeout(() => resolve('waited'), 5000))])
    expect(opened).not.toBe('waited')
    expect(calls).toHaveLength(1)
    await (opened as { close(): Promise<void> }).close()
  }, 20_000)

  it('sweeps again once a day, says when a sweep fails, and stops sweeping when closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    let fail = false
    const { openServeStore, calls } = await withSweeps(async () => { if (fail) throw new Error('disk full'); return 0 })
    const where = io({ UI_TESTS_DATA_DIR: join(work, 'data') })
    const served = await openServeStore(where)
    expect(calls).toHaveLength(1)
    fail = true
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    expect(calls).toHaveLength(2)
    expect(where.err()).toBe('ui-tests: retention failed: disk full\n')
    await served.close()
    await vi.advanceTimersByTimeAsync(3 * 24 * 60 * 60 * 1000)
    expect(calls).toHaveLength(2)
  })

  it('opens the store each environment names, not the first one opened', async () => {
    const { openServeStore } = await withSweeps()
    const first = await openServeStore(io({ UI_TESTS_DATA_DIR: join(work, 'a') }))
    const second = await openServeStore(io({ UI_TESTS_DATA_DIR: join(work, 'b') }))
    try {
      expect(existsSync(join(work, 'a', 'dev.sqlite'))).toBe(true)
      expect(existsSync(join(work, 'b', 'dev.sqlite'))).toBe(true)
      expect(second.store).not.toBe(first.store)
    } finally { await first.close(); await second.close() }
  })

  it('keeps SQLite next to the project it is run in, not the process\'s own directory', async () => {
    const { openServeStore } = await withSweeps()
    const project = join(work, 'project')
    await mkdir(join(project, 'nested'), { recursive: true })
    await writeFile(join(project, 'package-lock.json'), '{}')
    const served = await openServeStore(io({}, join(project, 'nested')))
    try {
      expect(existsSync(join(project, '.ui-tests', 'dev.sqlite'))).toBe(true)
    } finally { await served.close() }
    // A relative data directory is taken from where the command runs, too.
    const relative = await openServeStore(io({ UI_TESTS_DATA_DIR: 'here' }, project))
    try {
      expect(existsSync(join(project, 'here', 'dev.sqlite'))).toBe(true)
    } finally { await relative.close() }
  })
})
