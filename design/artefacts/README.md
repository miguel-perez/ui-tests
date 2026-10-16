# Design artefacts

Approved markup exported from the design artifacts. Each file is the spec for the surface it names; the site's components are built to match it, and `docs/design/site-schema.md` points here.

## Theme rules, in one place

- **The site's own surfaces are dark.** The attempt view, the report rows, the findings list, the dashboard, the checks box, the terminal and code windows all use the site's Tokyo Night tokens. There is no light product theme.
- **The demo app under test is light.** Weekboard uses `weekboard-light.css` (Tokyo Night Day): a cool grey canvas, never white.
- **The participant chrome is the inverse of the host page, with the author's accent.** Scenario card, bar, recording chip and question sheets take the host page's text colour as their surface and its background as their text, opaque, with a hairline and a soft shadow, the host's font, and the one accent the author sets in the config (Weekboard: mint). On the light Weekboard the chrome is therefore dark; on a dark site it would be light. It never shares a panel colour with the host and never carries ui-tests branding. Spec: `docs/discovery/participant-chrome-research.md`.
- **The bar is one small pill.** 40px tall, fully rounded, bottom right by default, draggable, hidden while the person types in the host page. Its leading segment is the recording state (dot, time, pause; no microphone during the task), then the task summary, then Done as a small filled pill and "I couldn't do this" as plain text. The card's last line quotes those two labels.

## Files

| File | Surface |
| --- | --- |
| `attempt-view.html` (+ `attempt-view/`) | One person, one goal: the result, the minute as a flow, clips in place. Dark. |
| `player-chrome.html` | Every participant surface in order: consent, screener, first impression (open question), scenario card, the bar with the recording chip, ease question, last words with voice. |
| `scenario-card.html`, `taskbar.html`, `ease-question.html` | The same three surfaces on their own, for the components that render them. |
| `weekboard-light.css` | The demo app's light palette. The player overrides in it are superseded by `player-chrome.html`. |
| `report-rows.html`, `pull-request-check.html`, `trace-viewer.html`, `code-window.html`, `terminal-quiet-window.html` | The other landing artefacts from rounds two and three, recoloured onto the site tokens. `trace-viewer.html` is superseded by `attempt-view.html`. |
| `invite-link.html`, `cap-control.html`, `visitor-invitation.html` | The three source-option mini UIs. |
