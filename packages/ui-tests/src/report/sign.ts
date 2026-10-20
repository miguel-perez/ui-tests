import { createHmac, timingSafeEqual } from 'node:crypto'

/** `/r/<run>` and `/r/<run>/` are one path (the site serves a trailing slash): the slash is dropped before signing and before verifying. */
export function normalisePath(path: string): string {
  const bare = path.split(/[?#]/)[0]!.replace(/\/+$/, '')
  return bare.startsWith('/') ? bare : `/${bare}`
}

const mac = (path: string, secret: string) => createHmac('sha256', secret).update(normalisePath(path)).digest()

/** The `?sig=` value of a path: its HMAC-SHA256 under the secret, base64url. */
export function signPath(path: string, secret: string): string {
  return mac(path, secret).toString('base64url')
}

/** True only when `sig` is the signature of this path under the secret. Compared in constant time; false without a secret or a signature. */
export function verifyPath(path: string, sig: string | null | undefined, secret?: string): boolean {
  if (!secret || !sig) return false
  // The text is compared, not the decoded bytes: base64url has spare bits, so two spellings can decode alike.
  const given = Buffer.from(sig)
  const expected = Buffer.from(signPath(path, secret))
  // The length is public (a SHA-256 digest); the bytes are compared without stopping at the first difference.
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** The path as a link with its signature: `/r/<run>/p1/?sig=…`, with the trailing slash the site serves. */
export function signedUrl(path: string, secret: string): string {
  const bare = normalisePath(path)
  return `${bare === '/' ? '' : bare}/?sig=${signPath(bare, secret)}`
}
