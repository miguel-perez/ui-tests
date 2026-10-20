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
  useEffect(() => { setActive(ACTIVE.test(document.cookie)) }, [])
  const client = useMemo(() => cookieClient(endpoint), [endpoint])
  return active ? createPortal(<Bar client={client} />, document.body) : null
}
