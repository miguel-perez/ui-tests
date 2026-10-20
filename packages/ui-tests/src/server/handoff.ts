import { HANDOFF_PARAM } from './credentials.ts'

/**
 * Where the person continues on the app: `start` resolved against the app's address, with `ui-tests=<run>.<code>` added to the
 * fragment. A fragment is never sent to the app's server; an app's own fragment (a hash route) is kept before it.
 */
export function handoffUrl(start: string, appUrl: string, run: string, code: string): string {
  const url = new URL(start, appUrl)
  const own = url.hash.slice(1)
  url.hash = `${own ? `${own}&` : ''}${HANDOFF_PARAM}=${run}.${code}`
  return url.href
}
