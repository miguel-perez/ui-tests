import { describe, expect, it } from 'vitest'
import { getBundles } from '../src/server/bundles.ts'

describe('the browser bundles', () => {
  it('keeps the loader small and free of React and the recorder, and names assets by their content', async () => {
    const bundles = await getBundles()
    const entry = /from '\.\/ui-tests\/assets\/([^']+)'/.exec(bundles.loader)?.[1]
    expect(bundles.loader).toBe(`import { start } from './ui-tests/assets/${entry}'; start(import.meta.url)`)
    const loader = bundles.assets.get(entry!)!
    expect(Buffer.byteLength(loader)).toBeLessThanOrEqual(8192)
    expect(loader).not.toMatch(/createElement|rrweb/)
    expect(bundles.assets.get(bundles.player)).toBeDefined()
    expect(bundles.assets.get(bundles.replay)).toBeDefined()
    expect(bundles.player).toMatch(/^player-[A-Z0-9]+\.js$/)
    expect(bundles.replay).toMatch(/^replay-[A-Z0-9]+\.js$/)
  }, 60_000)

  it('is built once per process', async () => {
    expect(await getBundles()).toBe(await getBundles())
  }, 60_000)
})
