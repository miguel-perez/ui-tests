import { createHmac, timingSafeEqual } from 'node:crypto'
import type { RunRecord } from '../record/schema.ts'
import type { UiTestsConfig } from '../types.ts'

export const SIGNATURE_HEADER = 'x-ui-tests-signature'
const RETRIES = 3

/** `sha256=<hex>`: the HMAC-SHA256 of the request body under the secret. */
export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

/** True only when `header` is the signature of `body` under `secret`. Compared in constant time. */
export function verifySignature(body: string, header: string | null | undefined, secret: string): boolean {
  if (!header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(signBody(body, secret))
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The (run, revision) pairs already delivered in this process. */
const sent = new Set<string>()

export type WebhookOptions = { fetch?: typeof fetch; backoffMs?: number; sleep?: (ms: number) => Promise<void> }

/**
 * Tells the configured URL that a run has a result: POST `{ run, revision, result }`, signed with the secret when there is one.
 * Retried 3 times with doubling backoff on a failure or a non-2xx answer; the last failure is thrown.
 * A (run, revision) already delivered is not sent again.
 */
export async function sendWebhook(record: RunRecord, webhook: UiTestsConfig['webhook'], options: WebhookOptions = {}): Promise<void> {
  if (!webhook?.url) return
  const key = `${webhook.url}\n${record.handle.run}:${record.revision}`
  if (sent.has(key)) return
  const body = JSON.stringify({ run: record.handle.run, revision: record.revision, result: record.handle.result })
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const backoff = options.backoffMs ?? 500
  let failure: unknown
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoff * 2 ** (attempt - 1))
    try {
      const response = await doFetch(webhook.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(webhook.secret && { [SIGNATURE_HEADER]: signBody(body, webhook.secret) }) },
        body,
      })
      if (response.ok) { sent.add(key); return }
      failure = new Error(`webhook answered ${response.status}`)
    } catch (error) { failure = error }
  }
  throw failure
}
