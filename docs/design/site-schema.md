# The site schema: content types, components and layout rules

16 October 2026. The build plan for the landing page and the guide from round three on. Round four (issue #22) replaces `Session` with `Attempt` and `SessionView` with `AttemptView`, from [`../discovery/reporting-schema-research.md`](../discovery/reporting-schema-research.md) and [`../../design/artefacts/attempt-view.html`](../../design/artefacts/attempt-view.html), and puts every surface on the research's words. Round five (issue #25) puts the attempt view and every other product surface back on the dark site tokens, states the theme rule once below, and moves the bar's give-up label to "I couldn't do this". Round six (issue #28) replaces `PlayerSurface` and the commands block with `Compilation`, from [`../discovery/contract-to-study-research.md`](../discovery/contract-to-study-research.md) and [`../../design/artefacts/compile-section.html`](../../design/artefacts/compile-section.html).

**Theme rule.** Product surfaces are dark on the dark page; the demo app under test is light; terminal and code windows are dark. The participant chrome (scenario card, bar, recording state, question sheets) is the inverse of its host page with the author's accent, so over the light demo app it is dark with Weekboard's mint. The rules are written once, in [`../../design/artefacts/README.md`](../../design/artefacts/README.md#theme-rules-in-one-place); the rows below do not restate them.

The pages are built from content types, each rendered by one component with one layout rule. A block is a sequence of typed content, not a hand-drawn layout. The grid is 12 columns on a 1248px container with 24px gutters; at 375 everything stacks in source order.

## Content types and their components

| Type | Fields | Component | Layout rule at 1440 |
| --- | --- | --- | --- |
| Claim | headline, standfirst, actions[], fine print | `Hero` | Headline and standfirst span 7 columns left; the hero artefact takes 5 columns right, stacked below on narrow widths. The background session and texture sit behind the whole hero. |
| Section | heading, lead | `SectionHead` | Heading 5 columns, lead 7 columns, one row, 96px above, 48px below. Never a side caption. |
| TerminalOutput | title (the command), fragment (from the Ink renderer), marked rank | `TerminalWindow` | The only component with terminal chrome. Width is its content's: 8 columns alone, 5 beside a Claim. |
| CodeFile | filename, language, lines, marked line | `CodeWindow` | Filename tab, copy control, highlighted lines. 8 columns alone, 12 when it is the block's only artefact. |
| InlineCode | fragment | `Code` | Highlighted inline; appears only inside Caption text. |
| Attempt | headline: reached (Yes / No / Couldn't tell), ended (how it ended), sure (n of 7, "Wrong, and sure" only when No and 7), blockers[] (up to three moments, worst first: impact, what happened, where, time); body: time on this goal, ease (n of 7, typical 5.5), video (plays in place), moments[] (the flow; ends where "How it ended" says), words; folded: path (theirs and yours), check (the assertion diff); footer: person (Person n of N, source, what they use today), setup (device, browser, window, date), consent (screen, voice, camera) | `AttemptView` | 12 columns; the flow runs down the page; a moment card is 7 columns clip, 5 columns text; nothing sticky. The result sentence takes 7 columns and its four facts 5; "How it felt" takes 5 and "What they said" 7. No terminal chrome. |
| Reel | session, from, to, moment label, words | `ReelFrame` | 16:10 frame with timestamp overlay and progress, the moment label and words as its caption inside the frame's chrome (this placement supersedes the earlier artefact plan, which put them under the frame). 5 columns in the hero, 4 as a report thumbnail. |
| Finding | rank, problem, impact (blocked, slowed, confused), count, quote, moments[], change | `FindingRow` | A row in `FindingsList`; expanded shows the reel thumbnail 4 columns and the quote, moments and change 8 columns. |
| FindingsList | findings[] (ranked by impact, then by how many people hit them), result lines ("Reached the goal: x of n"; "Wrong, and sure: x of n" only when at least one; "Would it help them? · Easy to use?" once) | `FindingsList` | 12 columns, rows separated by hairlines, result lines as the footer. Lives in the pull-request example, not on its own. |
| Check | name, summary, state, link | `CheckRow` in `ChecksBox` | 12 columns in the pull-request example; the box draws GitHub's chrome. |
| Run | name, date, participants, status, headline result | `RunRow` in `Dashboard` | 12 columns in the hosted block: a list of runs, each row carrying its fields in fixed columns (name 4, date 2, participants 2, status 2, result 2). |
| Snippet | the one line | `CodeWindow` | 12 columns above the Dashboard. |
| Compilation | file, pieces[] {n, name, fields, lines, surface, note, returns} | `Compilation` | One 800px reading column on the grid (8 of 12 columns, columns 3–10, centred). In order: the heading and lead; the three commands as three cards in one row; the whole file as a code window with the site's highlighter; then six pieces in participant order (Consent; Who gets in, and how many; First impression; Scenario card; Your page, with the bar, then the check; After the task). Each piece: the order number and name, the note, a code window with only its lines (original line numbers kept, skipped lines as a dots row), the screen in a constant light frame with the chrome drawn at real size, and the "Comes back" line. The screener and after-the-task pieces step through their screens with the sheet's own Next button and a small control under the frame; a stepped frame keeps one height (every step in the same grid cell, hidden steps invisible, not removed). At 375 everything stacks in one column and the code wraps. |
| SourceOption | name, who, cost, timing, mini UI (link field, cap control, invitation) | `OptionCard` in `OptionsRow` | Three cards of 4 columns each in one row, equal height; each card: name with icon, the who sentence, the mini UI, then cost and timing as a two-item footer. Not a table. |
| AgentRun | the terminal output, the file line | `TerminalWindow` with a `Caption` | Terminal 8 columns, caption 4 columns beside it. |
| Step | number, title, what you type, what you see | `StepPair` | In the guide: what you type 6 columns, what you see 6 columns, in one row per step, the number and title spanning both above. |
| Caption | text with InlineCode | `Caption` | Only beside artefacts of 8 columns or fewer, in the remaining columns; otherwise under the artefact, left-aligned, one or two lines. |

### Page composition

Landing: Claim; Section + Attempt (what comes back); Compilation (what you write, what they see); Section + OptionsRow (where the people come from); Section + ChecksBox + FindingsList (in the pull request); Section + AgentRun (the agent); Section + Snippet + Dashboard (the hosted track). There is no commands block and no "this page runs this test" code file; the commands are the Compilation's cards. Guide: Step × 6, then the "Without a repository" track as Step × 2.

### Rules that apply to every component

- One component per content type; no block invents its own layout.
- Themes follow the theme rule at the top of this file and nothing else: no component carries a light product theme.
- Empty area in a block never exceeds the area of its artefacts; a side caption never has a column to itself wider than its text needs.
- Hover and focus change paint only.
- Every component that owns chrome (`TerminalWindow`, `CodeWindow`, `AttemptView`, `ReelFrame`, `FindingsList`, `ChecksBox`, `Dashboard`, `OptionCard`) renders the label "Example run" once in that chrome whenever its content is from the example run; the label is a property of the chrome component, set by the page, not a field on the content types, so it is never omitted or duplicated.

### Words

Every surface that shows an attempt's data (the trace data, the Ink renderer, the HTML fragment, the report rows, the pull-request check, the dashboard and the landing copy) uses the words of issue #22: Person 3 (of 5), paid panel, Reached the goal (Yes / No / Couldn't tell), How it ended (pressed Done / pressed I couldn't do this / ran out of time / withdrew / left), "Wrong, and sure" only at 7 of 7 and not reached, How easy was it? (7 = very easy), How sure they'd done it (7 = completely sure), Time on this goal, Off your path, Went back, Stopped n s, "<action>, nothing happened", and "Pressed Done" as the last row of the flow. Impact is blocked, slowed or confused; on an attempt that did not reach the goal, the moment that produced the end state is "wrong end state". The run's after-goal answers appear once, on the run: "Would it help them? 4 of 5 · Easy to use? 2 of 5". `tests/vocabulary.test.ts` holds the list.
