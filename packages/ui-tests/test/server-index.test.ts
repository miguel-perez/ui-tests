import { afterEach, expect, it, vi } from 'vitest'
import { SqliteStore } from '../src/store/sqlite.ts'

afterEach(() => vi.resetModules())

it('does not cache a failed store open: the next request tries again', async () => {
  const open = vi.fn().mockRejectedValueOnce(new Error('database down')).mockResolvedValue(new SqliteStore(':memory:'))
  vi.doMock('../src/store/open.ts', () => ({ openStore: open }))
  const { GET } = await import('../src/server/index.ts')
  await expect(GET(new Request('http://app.test/api/ui-tests'))).rejects.toThrow('database down')
  expect((await GET(new Request('http://app.test/api/ui-tests'))).status).toBe(401)
  expect(open).toHaveBeenCalledTimes(2)
})
