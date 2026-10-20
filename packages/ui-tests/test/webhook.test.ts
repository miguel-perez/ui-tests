import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { SIGNATURE_HEADER, WEBHOOK_TIMEOUT_MS, sendWebhook, signBody, verifySignature } from '../src/notify/webhook.ts'
import type { RunRecord } from '../src/record/schema.ts'

const recordOf = (run: string, revision: number, result: RunRecord['handle']['result'] = 'problems-found') =>
  ({ revision, handle: { run, result } }) as unknown as RunRecord

type Hit = { body: string; signature: string | undefined }
let server: Server | undefined
afterEach(async () => {
  server?.closeAllConnections()
  await new Promise(resolve => (server ? server.close(resolve) : resolve(undefined)))
  server = undefined
})
async function listen(statuses: number[] = [200]) {
  const hits: Hit[] = []
  server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      hits.push({ body, signature: req.headers[SIGNATURE_HEADER] as string | undefined })
      res.statusCode = statuses[Math.min(hits.length, statuses.length) - 1]!
      res.end()
    })
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  return { hits, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook` }
}

describe('sendWebhook', () => {
  it('posts { run, revision, result } signed with the secret, and the signature verifies', async () => {
    const { hits, url } = await listen()
    await sendWebhook(recordOf('r_sign', 3), { url, secret: 's3cret' })
    expect(hits).toHaveLength(1)
    expect(JSON.parse(hits[0]!.body)).toEqual({ run: 'r_sign', revision: 3, result: 'problems-found' })
    expect(hits[0]!.signature).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(verifySignature(hits[0]!.body, hits[0]!.signature, 's3cret')).toBe(true)
    expect(verifySignature(hits[0]!.body, hits[0]!.signature, 'other')).toBe(false)
    expect(verifySignature(`${hits[0]!.body} `, hits[0]!.signature, 's3cret')).toBe(false)
    expect(verifySignature(hits[0]!.body, undefined, 's3cret')).toBe(false)
    expect(hits[0]!.signature).toBe(signBody(hits[0]!.body, 's3cret'))
  })

  it('does not send a second delivery for the same run and revision, but does for a new revision', async () => {
    const { hits, url } = await listen()
    await sendWebhook(recordOf('r_once', 2), { url, secret: 's' })
    await sendWebhook(recordOf('r_once', 2), { url, secret: 's' })
    expect(hits).toHaveLength(1)
    await sendWebhook(recordOf('r_once', 3), { url, secret: 's' })
    expect(hits).toHaveLength(2)
  })

  it('retries three times with backoff, then delivers once it answers', async () => {
    const { hits, url } = await listen([500, 502, 503, 200])
    const waits: number[] = []
    await sendWebhook(recordOf('r_retry', 1), { url, secret: 's' }, { sleep: async ms => { waits.push(ms) }, backoffMs: 10 })
    expect(hits).toHaveLength(4)
    expect(waits).toEqual([10, 20, 40])
  })

  it('throws after the retries are used, and a later call may try again', async () => {
    const { hits, url } = await listen([500])
    await expect(sendWebhook(recordOf('r_down', 1), { url }, { sleep: async () => {} })).rejects.toThrow('500')
    expect(hits).toHaveLength(4)
    expect(hits[0]!.signature).toBeUndefined()
  })

  it('gives up on a stalled delivery after its timeout and retries it', async () => {
    const signals: (AbortSignal | undefined)[] = []
    const fetchStub: typeof fetch = async (_url, init) => { signals.push(init?.signal ?? undefined); return new Response(null, { status: signals.length < 2 ? 503 : 200 }) }
    await sendWebhook(recordOf('r_t', 1), { url: 'http://hook.test/' }, { fetch: fetchStub, sleep: async () => {} })
    expect(signals).toHaveLength(2)
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal)
    // A real endpoint that never answers: each try is abandoned at the timeout and retried, then the failure is thrown, not a hang.
    let tries = 0
    const stalled = createServer(() => { tries++ })
    await new Promise<void>(resolve => stalled.listen(0, '127.0.0.1', resolve))
    const started = Date.now()
    try {
      await expect(sendWebhook(recordOf('r_s', 1), { url: `http://127.0.0.1:${(stalled.address() as AddressInfo).port}/` }, { sleep: async () => {}, timeoutMs: 200 })).rejects.toThrow()
      expect(Date.now() - started).toBeLessThan(5000)
      expect(tries).toBe(4)
    } finally { stalled.closeAllConnections(); await new Promise(resolve => stalled.close(resolve)) }
    expect(WEBHOOK_TIMEOUT_MS).toBe(10_000)
  })

  it('sends nothing when no webhook is configured', async () => {
    await expect(sendWebhook(recordOf('r_none', 1), undefined)).resolves.toBeUndefined()
  })
})
