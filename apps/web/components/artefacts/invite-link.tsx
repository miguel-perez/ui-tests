import { CopyControl } from './copy-control'
export function InviteLink() {
  return <div className="invite-link" data-artefact="invite-link"><div className="control-heading"><span>Your link</span><small>Free · as each person finishes</small></div><div className="invite-field"><code>https://ui-tests.com/t/k2m9</code><CopyControl text="https://ui-tests.com/t/k2m9" label="link" /></div></div>
}
