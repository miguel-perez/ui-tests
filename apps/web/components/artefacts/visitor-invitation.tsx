'use client'
import { useState } from 'react'
export function VisitorInvitation() {
  const [dismissed, setDismissed] = useState(false)
  return <div className="visitor-invitation" data-artefact="visitor-invitation">{!dismissed && <div className="visitor-prompt"><h3>Mind helping us for two minutes?</h3><p>A short task on this page, paid.</p><div><button onClick={() => { document.querySelector('[data-artefact="scenario-card"]')?.scrollIntoView(); }}>Sure</button><button onClick={() => setDismissed(true)}>No thanks</button></div></div>}<small>shown on your live site, in your style</small></div>
}
