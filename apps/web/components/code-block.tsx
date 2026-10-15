'use client'

import { useState } from 'react'
import { ui } from '../lib/copy'
import { Mark } from './mark'

/** Copy feedback is announced without moving keyboard focus. */
export function CodeBlock({ code, label, language = ui.typescript }: { code: string; label: string; language?: string }) {
  const [status, setStatus] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setStatus(ui.copied)
    } catch {
      setStatus(ui.copyError)
    }
  }
  return <div className="code-block">
    <div className="code-header"><span>{label}</span><span className="code-tools"><span>{language}</span><button type="button" onClick={copy} aria-label={`${ui.copy} ${label}`}><Mark name="copy" />{ui.copy}</button></span></div>
    <pre tabIndex={0} aria-label={label}><code>{code}</code></pre>
    <span className="copy-status" role="status">{status}</span>
  </div>
}
