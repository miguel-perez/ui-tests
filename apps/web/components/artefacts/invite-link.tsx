import { CopyControl } from './copy-control'
/** The link's mini UI: the run's invite link, ready to copy. */
export function InviteLink() {
  return <div className="invite-link" data-artefact="invite-link"><div className="control-heading"><span>Invite link</span></div><div className="invite-field"><code>https://ui-tests.com/t/k2m9</code><CopyControl text="https://ui-tests.com/t/k2m9" label="link" /></div></div>
}
