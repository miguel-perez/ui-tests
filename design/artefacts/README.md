# Design artefacts

Approved markup exported from the design artifacts. Each file is the spec for the surface it names; the site's components are built to match it, and `docs/design/site-schema.md` points here.

## Theme rules, in one place

- **The tokens are `tokens.css`.** Light first: ink #111111, one accent #4b3ff0, line #e2e2e2, canvas #f6f6f6, surface white. The roles (moment #b84d00, stop #8b6100, nothing happened #bd1f44, reached #007852, words #7a41af, and the code roles keyword #7444b4, string #27762f, property #00757c) are derived in OKLCH around the accent at one lightness and chroma, each at 4.5:1 or better on the canvas. The Tokyo Night palette is the dark alternate under `prefers-color-scheme: dark` and `data-theme="dark"`.
- **Colour stays on the data; chrome is neutral.** The accent carries links, buttons, the person marks and off your path. The moment carries the moment to watch, slowed and ranks. Red carries blocked, not reached and a click with no effect. Green-teal carries reached, what worked and the suggested change. Violet carries the person's words. Nothing grey carries meaning; nothing coloured is decoration.
- **The site's own surfaces are light.** The attempt view, the report, the sections, the terminal and code windows are white windows on the canvas with the line colour as their edge. GitHub's chrome is drawn in the site's neutrals.
- **The demo app under test keeps its own cool grey** (`weekboard-light.css`, the `host-*` tokens), so it reads as another product on the light page.
- **The participant chrome is the inverse of the host page, with the author's accent** (`ch-*` tokens): dark on the light Weekboard, with the mint accent. It never shares a panel colour with the host and never carries ui-tests branding. Spec: `docs/discovery/participant-chrome-research.md`.
- **The bar is one small pill.** 40px tall, fully rounded, bottom right by default, draggable, hidden while the person types in the host page; the recording state as its leading segment (dot, time, pause; no microphone during the task), the task summary, Done as a small filled pill and "I couldn't do this" as plain text. The card's last line quotes those two labels.

## Files

| File | Surface |
| --- | --- |
| `tokens.css` | The site's tokens: light first, dark alternate, host and chrome tokens. Every artefact below carries the same block. |
| `attempt-view.html` (+ `attempt-view/`) | One person, one goal: the result, the minute as a flow, clips in place. A white window on the light canvas. |
| `player-chrome.html` | Every participant surface in order: consent, the screener's six screens, first impression (open question), scenario card, the bar, the five screens after the task. |
| `pr-section.html` | The landing section "In the pull request": the neutral check, its page on GitHub, and the report. Supersedes `pull-request-check.html` and `report-rows.html`. Built in round eight (issue #35) as `PullRequest`; where issue #35, item 4 changes a word, the site follows the issue. |
| `run-report.html` | The run report page alone, the viewer shape. Supersedes `trace-viewer.html` for the run level. Built as `RunReport` at `/r/<run>`; the selected row and the pane sit on the canvas rather than the raised grey, where every data role holds 4.5:1. |
| `sources-section.html` | The landing section "Where the people come from": the sources table, its wells and the three pictures. Supersedes `invite-link.html`, `cap-control.html` and `visitor-invitation.html`. |
| `compile-section.html` | The landing section "What you write, what they see": commands, the whole file, six pieces with their lines, screens and what comes back. |
| `scenario-card.html`, `taskbar.html`, `ease-question.html` | The same three surfaces on their own, for the components that render them. |
| `weekboard-light.css` | The demo app's light palette, with player overrides that match `player-chrome.html`. |
| `report-rows.html`, `pull-request-check.html`, `trace-viewer.html`, `code-window.html`, `terminal-quiet-window.html` | The other landing artefacts from rounds two and three, recoloured onto the light tokens; all superseded by the section artefacts above and kept for the mini UIs only. |
| `invite-link.html`, `cap-control.html`, `visitor-invitation.html` | The three source-option mini UIs, superseded by `sources-section.html` in round seven (issue #31) and no longer on the site; the invitation's words are carried over to the one string the PRD, the player and the demo share. |
