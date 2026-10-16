'use client'
import { useState } from 'react'
import { ui } from '../../lib/copy'
import { Copy } from 'lucide-react'
export function CopyControl({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState('')
  return <><button className="copy-control" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(text); setStatus(ui.copied) } catch { setStatus(ui.copyError) } }}><Copy size={14} aria-hidden="true" />{ui.copy}</button><span role="status" className="sr-only">{status}</span></>
}
