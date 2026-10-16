# D2: implement the landing page and guide from the approved copy, the approved artefacts and the real session

Supersedes the first design pass (#8, merged in #10), which followed a brief that prescribed the layout and was judged a copied template. This pass is content-first: the copy was written from the visitor's first impression, every inner UI was designed and approved on its own canvas, the example session was recorded for real on a demo app, and the terminal output on the page is produced by the product's own renderer. The job is to build the page from those pieces, faithfully, and to make the page hold at every width.

## Inputs, all on `main`

| Input | Where | Rule |
| --- | --- | --- |
| The copy, final | `docs/design/landing-content-v3.md` | Word for word, in its order. Lines marked as designer's notes are not page copy. No eyebrow above the headline. No other copy is added. |
| The artefact plan | `docs/design/artefacts.md` | What each block shows and how it is made. |
| Approved artefact markup | `design/artefacts/*.html` | One file per inner UI, exported from the design canvas: `terminal-quiet-window`, `report-rows`, `trace-viewer`, `pull-request-check`, `code-window`, `scenario-card`, `taskbar`, `ease-question`, `invite-link`, `cap-control`, `visitor-invitation`. Port each to a React component under `apps/web/components/artefacts/` keeping its structure, spacing, type and chrome; replace Tailwind utilities with the site's tokens and classes. Captures of each are under `design/screens-d2/` for comparison. |
| The hero composition | `apps/web/public/hero-proto/index.html` and `shot-1440.png`, `shot-375.png` | The session plays dim and slow across the hero background, the copy sits left on a darkened band, the terminal floats right as the only sharp object, the moment label and the person's words sit along the bottom edge. Build the hero to this composition with the approved terminal inside it. |
| The demo app | `apps/web/public/demo/weekboard.html` | Static, self-contained, its own dark identity (warm charcoal, mint). Keep it under `public/demo`, add `noindex` and exclude it from the sitemap. Do not restyle it to ours. |
| The session | `apps/web/public/sessions/p3.webm`, `p3.jpg`, `sessions.json`, made by `apps/web/scripts/record-sessions.mjs` | Real recording of a scripted attempt, 64 s, every moment within 0.1 s of the copy. Commit as is. Record P1, P2, P4 and P5 with the same script following the problems table in the copy (who hit what, at which timestamp), and cut one reel per ranked problem per the artefact plan. |
| The mark | `design/brand/logomark.svg` (currentColor), `design/brand/LOGOMARK.md` | In the nav at 20px before the wordmark, in the foreground colour; as the favicon on the canvas colour; nowhere else. |
| Type | Fira Sans 400/500/600 for everything read, Fira Code 400/500 for everything typed, printed, timestamps and counts, via `next/font/google` | Hero headline 72px at 1440 (clamp to 44px at 375), Fira Sans 500, line-height 1.06, letter-spacing -0.04em; section headings 36px; body 16px at 1.6; standfirst 18px muted. Never a third family. |
| Palette | Tokens in `apps/web/app/globals.css` | Replace the current tokens with: `--canvas #141920`, `--surface #1b2129`, `--line #2a3340`, `--ink #eef1f5`, `--muted #a1abb8`, `--moment #e0a458`. The moment hue has one role: the moment someone got stuck (the rank marker, the current timestamp, the issue dots, the played part of a progress bar, the wordmark's period, the live dot, the selected rating, the primary button). Never a fill behind text, never decorative, no gradients beyond one faint glow behind the hero terminal. The hue itself is provisional; it must be the single token so the author can change it in one place. |

## The terminal is the CLI

1. Add a report renderer to `packages/ui-tests` built with Ink: the result line, the ranked problems with counts aligned in a column (never wrapping at 80 columns), and a marker glyph on a chosen rank. `ui-tests report <run>` prints it; the rehearsal line (`Rehearsal: 0 of 5 planned attempts recorded.`) prints through the same renderer so dev mode uses it today.
2. Add `apps/web/scripts/render-terminal.mjs`: renders the example run (the four problems and counts from the copy) through the Ink component, captures the frame, converts the ANSI to an HTML fragment at `apps/web/generated/terminal-report.html`, and commits it. Add a unit test that re-renders and compares, so the page cannot drift from the CLI.
3. The page embeds the fragment inside the approved quiet-window chrome. On first view the lines type in once; at rest and under reduced motion the fragment is simply there.

## Blocks

Build the landing page as the six blocks of the copy, in order, each with its artefact:

1. **The promise.** The hero composition above. The terminal is the Ink fragment in quiet-window chrome. The session is `p3.webm` with its poster, muted, looping, `playbackRate` about 0.6, dim under a vignette; under reduced motion the poster only. The bottom label `P3 · 00:03 · looked for Invite in the Share menu` and the words.
2. **What comes back.** The code window (approved markup) with the invite-colleague file and syntax highlighting (Shiki at build time, dark theme mapped to the tokens, identifiers at muted contrast, never dimmer). The trace viewer (approved markup) with the real `p3.webm`, the timeline from `sessions.json`, scrubbing the timeline seeks the video and playback highlights the current row. The report rows (approved markup), the first expanded, each row's thumbnail playing its reel. The report's last line.
3. **What the person sees.** The scenario card, the taskbar and the ease question are the real player components from `packages/ui-tests`, restyled to the approved markup and rendered over a browser frame showing the demo app. Add the optional free-text box to the player (one textarea after the ease question, stored with the attempt). The file line beside each, as in the copy.
4. **Where the people come from.** The three-row table with the invite-link field, the cap control and the visitor invitation as approved.
5. **In the pull request.** The checks box as approved, the report page framed beneath it.
6. **Three commands.** A terminal window with the three commands and the init output, both printed through the renderer where the command exists today and otherwise as the copy states; then the page's own test, unchanged, in the code window; then the buttons.

The getting-started page keeps its five steps and pairs what you type with what you see at every step using the same components. The README mirrors the copy as the existing parity test requires; update `apps/web/lib/copy.ts` and `README.md` together, keep the contributing section unchanged.

## Motion

One orchestrated moment: the hero terminal types in while the session plays. Everything else moves on the visitor's action: expanding a row plays its reel, scrubbing the trace seeks the video. No scroll-triggered reveals, no hover effects beyond a 2px lift on windows. `prefers-reduced-motion` stops every autoplay and typing.

## Acceptance criteria

- The copy on `/` and `/docs/getting-started` is the approved copy, verified by the README parity test extended to the new strings.
- Every inner UI matches its approved markup in structure, spacing, type and chrome; a capture of each at 1440 is committed under `design/screens/` beside the approved capture.
- `apps/web/generated/terminal-report.html` is produced by the Ink renderer and the parity test passes; the CLI prints the same frame for the same input.
- `p3.webm` plays in the hero and the trace viewer; four more sessions and the reels exist and play from the report rows.
- The player shows the optional box; the existing player tests pass with it.
- `tests/e2e/site.spec.ts` passes at 1440 and 375: no horizontal overflow, zero axe violations, Fira-only text, the hero video present with a poster, every artefact present, reduced motion honoured.
- Lighthouse performance and accessibility at or above 90 on both routes with the video lazy and the poster first.
- `npm run validate` passes. Nothing under `packages/ui-tests` changes except the renderer, the player's textarea and their tests.

## Not in scope

The final moment hue (one token), real multi-person runs, the pull-request check itself, the hosted track, any page beyond the two.
