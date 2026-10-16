# Artefact production for the landing page (D2)

16 October 2026. Companion to [`landing-content-v3.md`](landing-content-v3.md). The copy is approved; what it calls artefacts must be the product's real surfaces, not text in code blocks. Every research platform in the [content audit](content-audit.md) shows the product running, and Lookback and Contentsquare, the strongest of them, show real sessions. This page does the same, with one example run that is invented in content and real in every format, recorded for real on a real page.

## The example app

The run in the copy invites a colleague to a board. That app has to exist so the sessions can be recorded. Build it as a small static app at `apps/web/app/demo/` (noindex, excluded from the sitemap, linked from nowhere but the recordings): a board page with a few cards, a Share menu whose items are link options with no Invite, a board search box, an avatar menu with Settings, and a Settings › Members page with an email field and an Add button that stays grey until the field validates and that does not change on press. Plain, believable, one neutral theme that is not ours, so the recordings read as someone else's product. Name: Weekboard.

## The sessions

Five recordings, P1 to P5, produced by a Playwright script in `apps/web/scripts/record-sessions.mjs` that drives a synthetic cursor over the demo app and records video (Playwright's `recordVideo`, bundled ffmpeg for the webm to mp4 conversion). The script follows a per-person script of moments with exact timings; P3 is the trace in the copy, timestamp for timestamp, including the 7 s pause in the Share menu, the detour to Manage link, the email typed into the board search, the dead Enter, the second Add. P1, P2, P4 and P5 follow the problems table: who hit what, at which timestamp. The cursor is drawn as a real pointer overlay in the page so it appears in the video; clicks flash a small ring. Outputs under `apps/web/public/sessions/`: `p1.mp4` to `p5.mp4` at 1280×800, muted, plus a poster frame each, plus `sessions.json` with the moments and metadata. The script is committed with its inputs; the videos are committed too, under 2 MB each.

Metadata per session, shown wherever a session is: pseudonym (P3), source (panel), device and browser (MacBook, Chrome), viewport (1280×800), duration (1:03), outcome (incorrect), ease (3 of 7), and the person's words. All invented, all labelled once per frame as "Example run".

## The reels

A reel is a 6 to 10 second clip cut from a session at a moment, with the moment's label and the person's words. Cut by the same script (ffmpeg `-ss` and `-t`): one reel per ranked problem, from the person whose moment the copy quotes for it (P3 for problem 1, whose words appear in the hero; otherwise the first person in the problem's Watch column). Autoplay muted, loop, with a play control for reduced motion and a visible timestamp overlay (00:03 → 00:12).

## Block by block

**1. The promise.** Two artefacts side by side. Left: the terminal, and it is the real one. The report renderer in `packages/ui-tests` is built with Ink: the result line, the ranked problems with their counts aligned in a column, a marker on the rank the page opens. `ui-tests report` prints it, and the rehearsal line today comes from the same renderer. A build script renders the example run through that component, captures the frame, converts the ANSI to an HTML fragment under `apps/web/generated/`, and the page embeds the fragment; a unit test re-renders and compares, so the page cannot drift from the CLI. The window around it is chrome only, the approved "quiet window" treatment: three muted dots, the command `npx ui-tests report k2m9` as the title, a hairline, the rank-1 marker as a thin bar in the moment hue, "Example run" at the right. On first view the fragment types in line by line; at rest, and under reduced motion, it is simply there. Right: the reel for problem 1 (P3, 00:03 to 00:12, the Share menu pause) with the label `P3 · 00:03 · looked for Invite in the Share menu` and the words under it. Together they say: this is what you type, this is what you get, this is what it looks like when a person gets stuck.

**2. What comes back.** Artefact A: the test file in a code window with syntax highlighting (Shiki, a dark theme matched to the tokens), line numbers, a copy control. Artefact B: the trace viewer, a real component: the P3 session video on the left, the timeline on the right with every moment as a row, the issue moments marked, the current moment following playback, the metadata strip above, the person's words below. Artefact C: the report component: the four problems as rows, each expandable to its moments, each moment a thumbnail that plays the reel, the quote, what to change. Artefact D: the report's last line rendered as the report renders it.

**3. What the person sees.** Three real player surfaces rendered over the demo app in a browser frame: the scenario card, the bar, the ease question. Use the actual components from `packages/ui-tests` where they exist (the card, the bar and the questions exist) so that the screens are the product and not a mock of it, with the file line beside each. The real flow has a consent screen before the card and asks a confidence question after the ease question; neither is shown on the page, because the visitor's question is whether they must write a script, not what the full flow is. The optional free-text box does not exist in the component yet; D2 adds it to the player (one textarea after the ease question, stored with the attempt), so the page shows a real surface and not a mock.

**4. Where the people come from.** The table as a real table. The link row shows a real-looking invite link; the panel row shows the cap control as it would appear in the config; the visitors row shows the invitation as the visitor would see it on their site (a small, polite prompt), which is the one UI nobody else on the market shows.

**5. In the pull request.** The GitHub checks box, drawn as GitHub draws it, with `ui-tests` among two other checks, the summary line, and the Details link; under it, a screenshot-sized frame of the report page.

**6. Three commands.** A terminal window with the three commands and the init output from the guide, then the page's own test in the same code window style as block 2, with the caption.

**Getting-started page.** Every "you see" is a real surface: terminal windows for terminal output, the browser frame for the player, the trace viewer for the trace, the report for the report, the checks box for the check.

## Motion

One orchestrated moment: the hero terminal types its result while the reel beside it plays. Everything else moves on the visitor's action: expanding a problem plays its reel, scrubbing the trace timeline seeks the video. No scroll-triggered reveals. Reduced motion: the terminal shows its result at rest and the reels show their poster frames with a play control.

## Honesty

Every frame that shows the example run carries "Example run" once, small, in its chrome. The recordings are real recordings of scripted attempts on a demo app; nothing claims they are real people. The page's own test at the end is real and runs.

## The terminal is the CLI

Every terminal window on the site shows output produced by the package's own Ink renderer, captured at build time and checked by a test. The install block's init output and the guide's "you see" terminals follow the same path once those commands print through the renderer; until then they show the renderer's current output and nothing invented.

## Why this and not screenshots

A screenshot of a report says the product has a report. A reel of a person pausing on a menu for seven seconds says what the product is for. The audit found no competitor that shows a single participant's moment with its cause; this is the one artefact that is ours alone, and it has to move.
