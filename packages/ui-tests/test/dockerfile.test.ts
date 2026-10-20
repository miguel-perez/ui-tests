import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(join(import.meta.dirname, '..', '..', '..', 'Dockerfile'), 'utf8')
const lines = dockerfile.split('\n').map((line) => line.trim())

describe('the Docker image', () => {
  it('runs ui-tests serve on Node 24 with its data on a volume', () => {
    expect(lines).toContain('FROM node:24-slim')
    expect(lines).toContain('EXPOSE 4300')
    expect(lines).toContain('VOLUME /data')
    expect(lines.find((line) => line.startsWith('HEALTHCHECK'))).toContain('/healthz')
    expect(lines.find((line) => line.startsWith('CMD'))).toMatch(/"serve"\]$/)
  })
})
