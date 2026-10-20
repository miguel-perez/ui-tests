/** @jsxRuntime automatic @jsxImportSource react */
'use client'

import { useEffect } from 'react'
import { Replay, type ReplayProps } from '../trace/replay.tsx'

/** The recording on a person's page inside a Next app: the player's stylesheet is added when it mounts, never with the page. */
export function AttemptReplay(props: ReplayProps) {
  useEffect(() => {
    // @ts-ignore a stylesheet has types in a Next app and none outside one; Next adds it to the page.
    void import('rrweb-player/dist/style.css')
  }, [])
  return <Replay {...props} />
}
