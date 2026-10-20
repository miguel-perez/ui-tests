import { randomBytes } from 'node:crypto'

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A ULID: 48 bits of millisecond time then 80 random bits, Crockford base32, 26 characters, sortable by creation. */
function ulid(now = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = alphabet[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = randomBytes(16)
  let random = ''
  for (let i = 0; i < 16; i++) random += alphabet[bytes[i]! % 32]
  return time + random
}

/** A run id: `r_` and a ULID. */
export function newRunId(): string {
  return `r_${ulid()}`
}

/** An id for any other row: the prefix, an underscore and a ULID. */
export function newId(prefix: string): string {
  return `${prefix}_${ulid()}`
}

/** A bearer token: 32 random bytes as hex. Only its hash is ever stored. */
export function newToken(): string {
  return randomBytes(32).toString('hex')
}
