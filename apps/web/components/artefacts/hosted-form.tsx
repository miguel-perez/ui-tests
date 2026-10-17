'use client'
import { useId, useState } from 'react'
import { hosted } from '../../lib/copy'
import { Icon } from '../icon'

/** Interactive example, intentionally local: it never starts a paid run. */
export function HostedForm() {
  const id = useId()
  const [started, setStarted] = useState(false)
  const [method, setMethod] = useState('Page reached')
  const [evidence, setEvidence] = useState<Record<string, string>>({ 'Page reached': '/settings/members' })
  return <div className="window hosted-form" data-artefact="hosted-form">
    <div className="window-chrome"><span className="window-title">ui-tests.com/new</span><span className="example-label">Example run</span></div>
    <form onSubmit={event => { event.preventDefault(); setStarted(true) }}>
      <div className="hosted-field wide"><label htmlFor={`${id}-users`}>Users</label><textarea id={`${id}-users`} required defaultValue={hosted.users} rows={2} /></div>
      <div className="hosted-field wide"><label htmlFor={`${id}-purpose`}>Trying to</label><textarea id={`${id}-purpose`} required defaultValue={hosted.purpose} rows={2} /></div>
      <fieldset className="hosted-screen wide"><legend>Who to screen for</legend>
        <div className="hosted-field wide"><label htmlFor={`${id}-did`}>Did, recently</label><input id={`${id}-did`} defaultValue={hosted.screen.did} /></div>
        <div className="hosted-field"><label htmlFor={`${id}-within`}>Within</label><input id={`${id}-within`} defaultValue={hosted.screen.within} /></div>
        <div className="hosted-field"><label htmlFor={`${id}-uses`}>Uses any of</label><input id={`${id}-uses`} defaultValue={hosted.screen.uses} /></div>
        <div className="hosted-field wide"><label htmlFor={`${id}-not`}>Not</label><input id={`${id}-not`} defaultValue={hosted.screen.not} /></div>
      </fieldset>
      <div className="hosted-field wide"><label htmlFor={`${id}-goal`}>Goal</label><input id={`${id}-goal`} required defaultValue={hosted.goal} /></div>
      <div className="hosted-field"><label htmlFor={`${id}-method`}>How you can tell</label><select id={`${id}-method`} value={method} onChange={event => setMethod(event.target.value)}><option>Page reached</option><option>Element seen</option><option>Question answered</option></select></div>
      <div className="hosted-field"><label htmlFor={`${id}-evidence`}>{method === 'Page reached' ? 'Page path' : method === 'Element seen' ? 'Element' : 'Expected answer'}</label><input id={`${id}-evidence`} required value={evidence[method] ?? ''} onChange={event => setEvidence({ ...evidence, [method]: event.target.value })} /></div>
      <fieldset className="hosted-sources wide"><legend>Where people come from</legend>
        <label className="source-toggle"><input type="checkbox" role="switch" defaultChecked /><Icon name="link" size={16} />Your link</label>
        <div className="source-toggle"><label><input type="checkbox" role="switch" /><Icon name="users" size={16} />A paid panel</label><label className="source-cap">cap <span aria-hidden="true">$</span><input aria-label="Paid panel cap in dollars" type="number" min="0" defaultValue="70" /></label></div>
        <label className="source-toggle"><input type="checkbox" role="switch" defaultChecked /><Icon name="cursor" size={16} />Your visitors</label>
      </fieldset>
      <div className="hosted-submit wide"><button type="submit" className="button primary">Start the run<Icon name="arrow" /></button><p role="status" className="hosted-status">{started ? 'Example run ready · ui-tests.com/r/k2m9 · No live run started.' : 'Example form · explore without starting a live run.'}</p></div>
    </form>
  </div>
}
