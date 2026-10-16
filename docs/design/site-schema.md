# The site schema: content types, components and layout rules

16 October 2026. The build plan for the landing page and the guide from round three on.

The pages are built from content types, each rendered by one component with one layout rule. A block is a sequence of typed content, not a hand-drawn layout. The grid is 12 columns on a 1248px container with 24px gutters; at 375 everything stacks in source order.

### Content types and their components

| Type | Fields | Component | Layout rule at 1440 |
| --- | --- | --- | --- |
| Claim | headline, standfirst, actions[], fine print | `Hero` | Headline and standfirst span 7 columns left; the hero artefact takes 5 columns right, stacked below on narrow widths. The background session and texture sit behind the whole hero. |
| Section | heading, lead | `SectionHead` | Heading 5 columns, lead 7 columns, one row, 96px above, 48px below. Never a side caption. |
| TerminalOutput | title (the command), fragment (from the Ink renderer), marked rank, label | `TerminalWindow` | The only component with terminal chrome. Width is its content's: 8 columns alone, 5 beside a Claim, 12 in the commands block. |
| CodeFile | filename, language, lines, marked line | `CodeWindow` | Filename tab, copy control, highlighted lines. 8 columns alone, 12 when it is the block's only artefact. |
| InlineCode | fragment | `Code` | Highlighted inline; appears only inside Caption text. |
| Session | person, metadata (source, device, viewport, duration, outcome, ease, confidence, UX-Lite), recording state (screen, voice, webcam with consent), video, poster, moments[], words, audio | `SessionView` | 12 columns. Video 7 columns left, timeline 5 columns right, metadata strip above, words and audio below. Light theme. No terminal chrome. |
| Reel | session, from, to, moment label, words | `ReelFrame` | 16:10 frame with timestamp overlay and progress, the moment label and words inside its chrome as the caption. 5 columns in the hero, 4 as a report thumbnail. |
| Finding | rank, problem, count, quote, moments[], change | `FindingRow` | A row in `FindingsList`; expanded shows the reel thumbnail 4 columns and the quote, moments and change 8 columns. |
| FindingsList | findings[], result line | `FindingsList` | 12 columns, rows separated by hairlines, result line as the footer. Lives in the pull-request example, not on its own. |
| Check | name, summary, state, link | `CheckRow` in `ChecksBox` | 12 columns in the pull-request example; the box draws GitHub's chrome. |
| Run | name, date, participants, status, headline result | `RunRow` in `Dashboard` | 12 columns in the hosted block: a list of runs, each row carrying its fields in fixed columns (name 4, date 2, participants 2, status 2, result 2). Light theme. |
| Snippet | the one line | `CodeWindow` | 12 columns above the Dashboard. |
| PlayerSurface | kind (card, bar, question), content, the file line that produced it | `PlayerFrame` | A browser frame 7 columns with the surface over the demo app; the file line and its one-sentence caption 5 columns beside it, vertically centred, never wider than the text needs. Three frames stack as three rows. Light theme inside the frame. |
| SourceOption | name, who, cost, timing, mini UI (link field, cap control, invitation) | `OptionCard` in `OptionsRow` | Three cards of 4 columns each in one row, equal height; each card: name with icon, the who sentence, the mini UI, then cost and timing as a two-item footer. Not a table. |
| AgentRun | the terminal output, the file line | `TerminalWindow` with a `Caption` | Terminal 8 columns, caption 4 columns beside it. |
| Step | number, title, what you type, what you see | `StepPair` | In the guide: what you type 6 columns, what you see 6 columns, in one row per step, the number and title spanning both above. |
| Caption | text with InlineCode | `Caption` | Only beside artefacts of 8 columns or fewer, in the remaining columns; otherwise under the artefact, left-aligned, one or two lines. |
| Terms | lines[] | `Terms` | 8 columns of prose, no artefact. |

### Page composition

Landing: Claim; Section + Session (what comes back); Section + three PlayerSurface rows (what the person sees); Section + OptionsRow (where the people come from); Section + ChecksBox + FindingsList (in the pull request); Section + AgentRun (the agent); Section + Snippet + Dashboard (the hosted track); Section + TerminalOutput (commands) + CodeFile (this page's test) + Terms. Guide: Step × 6, then the "Without a repository" track as Step × 2.

### Rules that apply to every component

- One component per content type; no block invents its own layout.
- Product surfaces (Session, Reel contents, Dashboard, PlayerSurface, FindingsList, OptionCard mini UIs) are in the inverse light theme; terminals and code windows are dark; the page is dark.
- Empty area in a block never exceeds the area of its artefacts; a side caption never has a column to itself wider than its text needs.
- Hover and focus change paint only.
- Every artefact that shows the example run carries "Example run" once in its chrome.
