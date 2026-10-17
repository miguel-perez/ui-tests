import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The shareable report: a signed link that opens the white-labelled page for anyone you send it to. The signature is an HMAC of the
 * path under `UI_TESTS_SHARE_SECRET`; without a secret there are no share links, and an unsigned or altered link is not found.
 */
export function sign(path: string) {
  const secret = process.env.UI_TESTS_SHARE_SECRET
  return secret ? createHmac('sha256', secret).update(path).digest('base64url').slice(0, 22) : undefined
}
export function verify(path: string, signature: string | undefined) {
  const expected = sign(path)
  if (!expected || !signature) return false
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
/** The signed form of a path, or nothing when sharing is off. */
export const shared = (path: string) => { const signature = sign(path); return signature ? `${path}?s=${signature}` : undefined }
