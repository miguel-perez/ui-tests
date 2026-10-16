export function CapControl() {
  return <div className="cap-control" data-artefact="cap-control"><div className="control-heading"><label htmlFor="panel-cap">Cap</label><small><i className="issue-dot" /> panel live</small></div><div className="currency-input"><span aria-hidden="true">$</span><input id="panel-cap" aria-label="Panel spending cap in dollars" type="number" min="0" defaultValue="60" /></div><p>About $54 for a short task, under a cap you set · within 48 hours</p></div>
}
