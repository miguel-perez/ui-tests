/** The panel's mini UI: the spending cap as it appears in the config, with the panel's live state. */
export function CapControl() {
  return <div className="cap-control" data-artefact="cap-control"><div className="control-heading"><label htmlFor="panel-cap">Spending cap</label><small><i className="live-dot" aria-hidden="true" />panel live</small></div><div className="currency-input"><span aria-hidden="true">$</span><input id="panel-cap" aria-label="Panel spending cap in dollars" type="number" min="0" defaultValue="60" /></div></div>
}
