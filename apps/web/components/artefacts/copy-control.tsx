'use client'
import { useState } from 'react'
import { ui } from '../../lib/copy'
import { Icon } from '../icon'
export function CopyControl({ text, label, action = 'Copy' }: { text: string; label: string; action?: string }) {
  const [status, setStatus] = useState('')
  return <><button className="copy-control" aria-label={`${action} ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(text); setStatus(ui.copied) } catch { setStatus(ui.copyError) } }}><Icon name={action === 'Share' ? 'share' : 'copy'} />{action}</button><span role="status" className="sr-only">{status}</span></>
}
