'use client'
import { useId, useState } from 'react'
import { hosted } from '../../lib/copy'
import { Icon } from '../icon'

/** Interactive example, intentionally local: it never starts a paid run. */
export function HostedForm() {
  const id = useId()
  const [started, setStarted] = useState(false)
  const [method, setMethod] = useState('Page reached')
  return <div className="window hosted-form" data-artefact="hosted-form">
    <div className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span className="window-title">ui-tests.com/new</span><span className="example-label">Example run</span></div>
    <form onSubmit={event => { event.preventDefault(); setStarted(true) }}>
      <div className="hosted-field wide"><label htmlFor={`${id}-users`}>Users</label><textarea id={`${id}-users`} required defaultValue={hosted.users} rows={2} /></div>
      <div className="hosted-field wide"><label htmlFor={`${id}-purpose`}>Trying to</label><textarea id={`${id}-purpose`} required defaultValue={hosted.purpose} rows={2} /></div>
      <div className="hosted-field wide"><label htmlFor={`${id}-goal`}>Goal</label><input id={`${id}-goal`} required defaultValue={hosted.goal} /></div>
      <div className="hosted-field"><label htmlFor={`${id}-method`}>How you can tell</label><select id={`${id}-method`} value={method} onChange={event => setMethod(event.target.value)}><option>Page reached</option><option>Element seen</option><option>Question answered</option></select></div>
      <div className="hosted-field"><label htmlFor={`${id}-evidence`}>{method === 'Page reached' ? 'Page path' : method === 'Element seen' ? 'Element' : 'Expected answer'}</label><input id={`${id}-evidence`} key={method} required defaultValue={method === 'Page reached' ? '/settings/members' : ''} /></div>
      <fieldset className="hosted-sources wide"><legend>Where people come from</legend>
        <label className="source-toggle"><input type="checkbox" role="switch" defaultChecked /><Icon name="link" size={16} />Your link</label>
        <div className="source-toggle"><label><input type="checkbox" role="switch" /><Icon name="users" size={16} />A panel</label><label className="source-cap">cap <span aria-hidden="true">$</span><input aria-label="Panel cap in dollars" type="number" min="0" defaultValue="60" /></label></div>
        <label className="source-toggle"><input type="checkbox" role="switch" defaultChecked /><Icon name="cursor" size={16} />Your visitors</label>
      </fieldset>
      <div className="hosted-submit wide"><button type="submit" className="button primary">Start the run<Icon name="arrow" /></button><p role="status" className="hosted-status">{started ? 'Example run ready · ui-tests.com/r/k2m9 · No live run started.' : 'Example form · explore without starting a live run.'}</p></div>
    </form>
  </div>
}
