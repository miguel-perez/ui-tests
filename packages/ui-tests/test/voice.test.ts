import { describe, expect, it } from 'vitest'
import { MAX_RECORDING_BYTES, MAX_RECORDING_MS, fitsTheCollector } from '../src/player/voice.tsx'

describe('voice limits', () => {
  it('stops at 90 seconds and keeps what it sends under what the collector takes', () => {
    expect(MAX_RECORDING_MS).toBe(90_000)
    expect(fitsTheCollector(MAX_RECORDING_BYTES)).toBe(true)
    expect(fitsTheCollector(MAX_RECORDING_BYTES + 1)).toBe(false)
    // base64 grows by a third; the collector takes 1,900,000 characters.
    expect(Math.ceil((MAX_RECORDING_BYTES * 4) / 3)).toBeLessThanOrEqual(1_900_000)
  })
})
