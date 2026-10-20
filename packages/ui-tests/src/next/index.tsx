'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BarView } from '../server/view.ts'
import { Bar, type BarClient } from '../browser/bar.tsx'
import { fitsKeepalive } from '../browser/key-client.ts'

export type UiTestsProps = {
  /** Where the collector is mounted. */
  endpoint?: string
}

const ACTIVE = /(?:^|;\s*)ui-tests-active=1(?:;|$)/
/** The module script the tag appends once it has an attempt to show; its bar is then the page's one. */
const TAG_LOADED = 'script[type="module"][src*="/ui-tests.js"]'

/** The bar's client on a page served beside the collector: the participant's HttpOnly cookie is the credential. */
function cookieClient(endpoint: string): BarClient {
  let run: string | undefined
  return {
    async view() {
      const response = await fetch(`${endpoint}?view=bar`, { credentials: 'include', cache: 'no-store' })
      const view = response.ok ? ((await response.json()) as BarView) : undefined
      run = view?.run ?? run
      return view
    },
    post(body, options = {}) {
      const text = JSON.stringify(body)
      return fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: text, keepalive: options.keepalive !== false && fitsKeepalive(text) })
    },
    back(query) {
      if (run) window.location.assign(`/ui-tests/${run}/?${query}`)
    },
  }
}

/**
 * Mount once in the root layout. Without the participant's run cookie it renders nothing and loads nothing; with it, it shows the bar,
 * which records the attempt.
 */
export function UiTests({ endpoint = '/api/ui-tests/' }: UiTestsProps) {
  const [active, setActive] = useState(false)
  // The marker cookie is readable on purpose: it only says that a run is on. The token itself is HttpOnly.
  useEffect(() => {
    // The tag runs before React does, so by now it has appended its script or never will.
    setActive(ACTIVE.test(document.cookie) && !document.querySelector(TAG_LOADED))
    // The player hands off with a code in the fragment for the tag; here the cookie is the credential, so the code only leaves the address.
    const { hash, href } = window.location
    const handoff = /(^#|&)ui-tests=[^&]*/.exec(hash)
    if (handoff) {
      const rest = hash.replace(handoff[0], handoff[1] === '#' ? '#' : '').replace('#&', '#')
      window.history.replaceState(window.history.state, '', href.split('#')[0] + (rest === '#' ? '' : rest))
    }
  }, [])
  const client = useMemo(() => cookieClient(endpoint), [endpoint])
  return active ? createPortal(<Bar client={client} markRoot />, document.body) : null
}
