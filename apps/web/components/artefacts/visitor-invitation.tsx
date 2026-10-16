'use client'
import { useState } from 'react'
/** The visitors' mini UI: the invitation as a visitor sees it on the live site: recognition, apology, then the paid incentive. */
export function VisitorInvitation() {
  const [dismissed, setDismissed] = useState(false)
  return <div className="visitor-invitation" data-artefact="visitor-invitation">{dismissed
    ? <p className="visitor-dismissed">Dismissed: not asked again this visit. <button onClick={() => setDismissed(false)}>Show it again</button></p>
    : <div className="visitor-prompt"><h4>Looks like this is not going smoothly.</h4><p>Sorry about that. Would you show us where it got stuck? Two minutes, and we pay for your time.</p><div><button onClick={() => { document.getElementById('person')?.scrollIntoView() }}>Sure</button><button onClick={() => setDismissed(true)}>No thanks</button></div></div>}</div>
}
