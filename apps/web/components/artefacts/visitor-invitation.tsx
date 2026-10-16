'use client'
import { useState } from 'react'
export function VisitorInvitation() {
  const [dismissed, setDismissed] = useState(false)
  return <div className="visitor-invitation" data-artefact="visitor-invitation">{!dismissed && <div className="visitor-prompt"><h3>Looks like this is not going smoothly.</h3><p>Sorry about that. Would you show us where it got stuck? Two minutes, and we pay for your time.</p><div><button onClick={() => { document.querySelector('[data-artefact="scenario-card"]')?.scrollIntoView(); }}>Sure</button><button onClick={() => setDismissed(true)}>No thanks</button></div></div>}<small>shown on your live site, in your style</small></div>
}
