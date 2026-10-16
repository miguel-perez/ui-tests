/** Terms: 8 columns of prose with no artefact. */
export function Terms({ lines }: { lines: string[] }) { return <div className="terms">{lines.map(line => <p key={line}>{line}</p>)}</div> }
