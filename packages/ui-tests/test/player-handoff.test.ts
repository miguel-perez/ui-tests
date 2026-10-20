import { describe, expect, it } from 'vitest'
import { rememberBypass, withBypass } from '../src/player/handoff.ts'

/** The part of `sessionStorage` the player uses. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key) },
    setItem: (key, value) => { items.set(key, String(value)) },
  }
}

describe('the handoff from the player', () => {
  it('puts the protection bypass on the query, before the fragment', () => {
    expect(withBypass('https://p.vercel.app/a#ui-tests=r.c', 's')).toBe('https://p.vercel.app/a?x-vercel-protection-bypass=s&x-vercel-set-bypass-cookie=samesitenone#ui-tests=r.c')
    expect(withBypass('https://p.vercel.app/a?q=1#ui-tests=r.c', 's')).toBe('https://p.vercel.app/a?q=1&x-vercel-protection-bypass=s&x-vercel-set-bypass-cookie=samesitenone#ui-tests=r.c')
  })

  it('leaves the address as it is without a secret', () => {
    expect(withBypass('https://p.vercel.app/a#ui-tests=r.c')).toBe('https://p.vercel.app/a#ui-tests=r.c')
    expect(withBypass('https://p.vercel.app/a#ui-tests=r.c', '')).toBe('https://p.vercel.app/a#ui-tests=r.c')
  })

  it('remembers the bypass of the invite for its run, after the query has left the address bar', () => {
    const storage = memoryStorage()
    expect(rememberBypass('r1', '?t=tok&bypass=s3', storage)).toBe('s3')
    expect(storage.getItem('ui-tests-bypass:r1')).toBe('s3')
    expect(rememberBypass('r1', '', storage)).toBe('s3')
    expect(rememberBypass('r2', '', storage)).toBeUndefined()
  })
})
