# Non-functional requirements

## Privacy

Participant identity never leaves the source adapter's table. Runner ids are opaque. Recordings are opt-in per context, stored in the author's own blob adapter, default retention 90 days, deleted on withdrawal. The player masks password and payment fields in events by default. Fixture data is synthetic; the lint warns when a scenario references a real-looking email or name outside the fixture. The device and IP hash used for duplicate detection is salted per project and never exported. On the hosted track nothing is kept from before a visitor accepts an invitation.

## Security

Panel tokens and the collector secret come from the environment and are never written to the run record, the trace, or the repository. The collector accepts writes only from a valid participant token issued at invite, scoped to one run, or from the CLI secret; this holds behind a tunnel, inside a perimeter and on a public preview alike, so a tunnel URL by itself opens nothing. Tunnels close at the run's deadline or when the process exits, and their URLs are recorded in the trace. The player bundle contains no hooks, no happy paths, no expected answers and no panel credentials. Hooks run in the runner. Trace and report pages are reachable only with the author's session or a signed link the author created.

## Money

Amounts are integers in minor units with a currency. States are estimated, reserved, paid, trued-up. The cap is enforced before every publish and includes the reserve for the raise rule and the true-up. The store's reservation is transactional; a storage adapter that cannot do that is not an adapter. Nothing retries a publish without first reading the source for the outcome of the last one.

## Accessibility

The player passes axe with no violations and is operated end to end with keyboard only and with VoiceOver on Safari. Time limits are generous by default and the participant can request more time once without penalty. A participant's assistive technology is recorded and reported with the issues they hit, never treated as a quality problem.

## White label

Everything a participant or a visitor sees is the author's, not ours. The taskbar, the scenario card, the consent, the questions, the invitation on the hosted track and the shareable report page carry the author's name and, where the host page exposes them, its colours and type through CSS variables, with a neutral default theme when it does not. No ui-tests logo, name or link appears on a participant-facing surface unless the author turns on a "powered by" line, off by default. The taskbar is visually subordinate to the host page: small, fixed, movable, never covering primary content, and styled as part of the site rather than a third-party overlay. The intercept invitation in particular must read as the site asking, because a stranger's badge on a struggling visitor's screen is the surest way to be declined. The author's own review surfaces, the trace viewer and the dashboard, may carry our brand.

## Performance and reliability

Dev mode opens in under five seconds on a fresh clone. The collector stores an attempt's events in bounded batches with an IndexedDB retry buffer so a dropped connection does not lose an attempt. A disconnected attempt is `disconnected`, never `incorrect`.

## Licensing

MIT for the runner, SDK, and player. Instrument wording for SEQ, UX-Lite, the appeal items and the attention item is published and attributed with its version; SUPR-Q is not bundled.
