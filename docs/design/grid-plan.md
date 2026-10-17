# Grid plan: both pages at 1440 and 375

16 October 2026. Written before the round-three layout code (issue #18, item 9), from [`site-schema.md`](site-schema.md). Every block on both pages is built to these maps; the PR puts each map beside its capture with the ui-harness layout readings.

**Themes.** This plan places content; it does not set colours. The theme rules are written once in [`../../design/artefacts/README.md`](../../design/artefacts/README.md#theme-rules-in-one-place): product surfaces dark on the dark page, the demo app light, terminals and code dark, the participant chrome the inverse of its host with the author's accent.

## The grid

- Container 1248 px centred at 1440 (96 px margins), 12 columns of 82 px with 24 px gutters. One column 82, two 188, three 294, four 400, five 506, six 612, seven 718, eight 824, twelve 1248.
- Vertical scale 24 / 48 / 96. A Section head has 96 above and 48 below. Artefacts in a block are 48 apart; a caption is 24 under its artefact.
- At 375 the container is 327 px (24 px margins) and everything stacks in source order in one column.

## The rules that decide every cell

1. A side caption may only sit beside an artefact that spans 8 columns or fewer, and then takes the remaining columns, starting one gutter after the artefact, with no gap wider than one gutter.
2. An artefact wider than 8 columns takes its caption underneath, left-aligned to its edge, in one or two lines.
3. No column narrower than 3 of 12 ever carries text.
4. Empty area in any block never exceeds the area of its artefact.
5. At 375 everything stacks in source order.
6. Tables (terminal and page): fixed-width fields first, the one free-text field last, numbers right-aligned in their column.

## How to read a map

Each map shows the 12 columns at 1440 with a ruler; a bracket spans the columns a content type occupies; the right margin gives the row and its height in px (heights are planned values; the PR reports the measured ones). The 375 map lists the stacked order in the single 327 px column.

## Landing page

### L1 · Claim

**Rule.** Headline and standfirst take columns 1-7; the hero artefact (the Ink report in its terminal) takes columns 8-12. The artefact is 5 columns, so its caption could sit beside it, but no columns remain; it goes under the terminal, left-aligned to its edge, in two lines. The faded recording of Person 3 and the texture sit behind the whole hero and occupy no columns. Empty area: the copy column is full height; under the terminal the caption fills the second row, so the empty area is the band below the caption (about 506 × 120), far smaller than the terminal (506 × 300).

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Claim: h1 (3 lines), standfirst                      ] [TerminalWindow: report               ]  row 1 · 440
[actions, fine print                                  ] [Caption under, 1-2 lines             ]  row 2 · 120
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| h1, standfirst                                     |
| actions, fine print                                |
| TerminalWindow: report                             |
| Caption                                            |
```

### L2 · Section + Attempt

**Rule.** Section: heading 5, lead 7, one row, 96 above and 48 below; it never takes a side caption. `AttemptView` spans 12, so its caption goes underneath. Inside (issue #22, item 4): 12 columns; the flow runs down the page; a moment card is 7 columns clip, 5 columns text; nothing sticky. The result sentence takes 7 and its four facts 5. The flow is one vertical line 60 px in from the window's content edge: routine moments are one row each (time, what happened, the page right-aligned), and each moment card is set into the line at its own time with its numbered mark on the line, the card inset 84 px so its own 7 / 5 split sits right of the line. "How it felt" takes 5 and "What they said" 7. The two folds and the footer span 12. Empty area: the result row's facts column is as tall as the sentence; nothing else leaves a column empty.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head · 96 above, 48 below
[chrome: Run k2m9 / Goal invite a colleague / Person 3 of 5                       Example run ]  crumb · 40
[headline sentence, check line                        ] [facts: reached, ended, sure, time    ]  result · 140
[What got in the way · index: 1 Wrong end state · 2 Slowed 16 s · 3 Confused 13 s             ]  index · 40
[|  00:00 Started · scenario card dismissed                                            /board ]  row · 36
[|  [2] [clip 16:10, plays in place, scrub line       ] [impact, problem, where, steps, said ]  card · 420
[|  [3] [clip                                         ] [text, smallest change              ]  card · 420
[|  00:41, 00:46 rows                                                       /settings/members ]  2 × 36
[|  [1] [clip                                         ] [text                               ]  card · 400
[|  01:03 Pressed Done · the check ran and failed                           /settings/members ]  row · 36
[How it felt: easy, sure, time        ] [What they said: the full quote, where it was given   ]  felt · 170
[+ Their path and yours (closed)                                                              ]  fold · 48
[+ What the check saw (closed)                                                                ]  fold · 48
[footer: Person 3 of 5 · paid panel · uses · device, browser, window · date · recorded       ]  foot · 40
[Caption under, left-aligned                                                                  ]  caption · 32
```

Inside a card, the clip is 7 of 12 of the card and the text 5 of 12; the rail and its 24 px gap sit to the left of the card, so the card's two parts are 7 and 5 of what remains.

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading                                    |
| lead                                               |
| chrome: Run / Goal / Person 3 of 5 (wraps)         |
| headline sentence, check line                      |
| facts, 2 × 2                                       |
| What got in the way, index (wraps)                 |
| rows: time · what happened · page, the line at 20px|
| card: clip, scrub line                             |
| card: impact, problem, where, steps, said, change  |
| (three cards in time order, rows between them)     |
| last row: Pressed Done                             |
| How it felt                                        |
| What they said                                     |
| + Their path and yours                             |
| + What the check saw                               |
| footer (wraps)                                     |
| Caption                                            |
```

### L3 · Compilation: what you write, what they see

**Rule.** One 800 px reading column on the grid: columns 3-10 at 1440 are 8 columns, 824 px, and the reading column is 800 px centred inside them (12 px each side), so it sits on the page's centre line. Everything in the block is in that one column; nothing sits beside anything, so there are no side captions and no empty columns inside the block. In order: the heading and lead (the lead under the heading, not beside it, inside 800); the three commands as three cards in one row, equal height; the note under them; the whole file as a code window with the site's highlighter; then six pieces in participant order (Consent; Who gets in, and how many; First impression; Scenario card; Your page, with the bar, then the check; After the task). Each piece: the order number and name, the note (max 64ch), a code window with only its lines (original line numbers kept, skipped lines as a dots row; After the task has no lines and no window), the screen in a constant light frame with the chrome drawn at real size (16:10 over the Weekboard page; on a blank page, as for consent and the stepped pieces, the frame fits its tallest sheet), the stepper under the frame for the screener (6 screens) and after-the-task (5 screens) pieces, the dashed on-your-side box for the sample (piece 2) and the check (piece 5), and the "Comes back" line. A stepped frame keeps one height: every step sits in the same grid cell and hidden steps are invisible, not removed. Planned heights of the lines windows: Consent 1 line (80), screener 9 lines and a dots row (296), impression 2 lines and a dots row (128), card 4 lines and two dots rows (200), bar 6 lines and two dots rows (248). Columns 1-2 and 11-12 are page margin for this block; the empty area is the two side bands, each 2 columns, against an 8-column artefact column, so empty < artefact.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
                [SectionHead: heading, then lead under it                      ]                 head · 96 above, 120
                [cmd: npm install   ] [cmd: npx … init   ] [cmd: npx … run     ]                 cards · 84, equal height
                [note under the commands (one line)                            ]                 note · 24, then 36
                [CodeWindow: ui-tests/invite.ui.test.ts, 23 lines              ]                 file · 600
                [piece n: number and name, the note (one or two paragraphs)    ]                 intro · 120-260
                [CodeWindow: only its lines, numbers kept, ⋯ for skipped       ]                 lines · 80-300
                [frame, constant light, chrome at real size (16:10 or fitted)  ]                 frame · 400-500
                [(stepper: ‹ n of N › and dots; pieces 2 and 6)                ]                 stepper · 32
                [(on-your-side box, dashed; pieces 2 and 5)                    ]                 box · 120-150
                [Comes back: one line                                          ]                 back · 24, then 56 to the next piece
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading                                    |
| lead                                               |
| cmd: npm install -D ui-tests                       |
| cmd: npx ui-tests init                             |
| cmd: npx ui-tests run                              |
| note under the commands                            |
| CodeWindow: the whole file (the code wraps)        |
| per piece, six times in participant order:         |
|   number and name, the note                        |
|   CodeWindow: its lines (the code wraps)           |
|   frame 16:10, chrome at real size                 |
|   (stepper)                                        |
|   (on-your-side box)                               |
|   Comes back                                       |
```

The code windows wrap at 375 rather than scroll sideways; the line numbers stay in their gutter.

### L4 · Section + OptionsRow

**Rule.** Three OptionCards of 4 columns each, equal height (the row stretches), no table. Each card: name with icon, the who sentence, the mini UI, then cost and timing as a two-item footer. No caption, no empty columns.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[OptionCard: Your link        ] [OptionCard: A panel          ] [OptionCard: Your visitors    ]  cards · 380, equal height
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| OptionCard: Your link                              |
| OptionCard: A panel                                |
| OptionCard: Your visitors                          |
```

### L5 · Section + ChecksBox + FindingsList

**Rule.** Both 12 columns, so any caption goes underneath. The findings list follows rule 12: rank, count (right-aligned), the impact, the Person 1-5 evidence cells, then the problem as the one free-text field; rows are ranked by impact, then by count. The expanded row splits 4 (reel thumbnail) and 8 (quote, moments, change). The result line is the footer.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[ChecksBox: three CheckRows in GitHub chrome                                                  ]  checks · 176
[FindingsList head: rank · count · impact · Person 1-5 · problem                              ]  32
[ReelFrame (expanded row)     ] [quote, evidence moments, what to change                      ]  expanded · 300
[FindingRow × 3 collapsed, result line footer                                                 ]  3 × 56 + 48
[Caption under                                                                                ]  32
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| ChecksBox                                          |
| FindingRow 1 expanded: rank · count · cells, proble|
| ReelFrame                                          |
| quote, moments, change                             |
| FindingRow 2-4                                     |
| result line                                        |
| Caption                                            |
```

### L6 · Section + AgentRun

**Rule.** The terminal is 8 columns (≤ 8), so its caption sits beside it in the remaining 4 columns, one gutter away, vertically centred: the file line (highlighted) and the closing sentence. Caption column 4 ≥ 3. Empty area: about 400 × 160 beside the caption against an 824 × 300 terminal.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[TerminalWindow: npx ui-tests run --actor agent               ] [Caption: file line + closing ]  row · 300
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| TerminalWindow (scrolls sideways inside its body)  |
| Caption                                            |
```

### L7 · Section + Snippet + Dashboard

**Rule.** Snippet 12, Dashboard 12, caption underneath. The dashboard is a table: fixed fields first (date 2, participants 2, status 2, headline result 2), the run name last (4) as the free text, per item 12, which overrides the schema's name-first order. Numbers right-aligned in their column.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[Snippet in CodeWindow                                                                        ]  snippet · 96
[date         ] [people       ] [status       ] [result       ] [name (free text last)        ]  Dashboard: header 40 + 5 × 56
[Caption under                                                                                ]  32
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| Snippet                                            |
| RunRow × 5: date · people · status · result, then n|
| Caption                                            |
```

L8 (Section + TerminalOutput + CodeFile + Terms, the commands block) was folded into L3 in round six (issue #28): the commands are the Compilation's cards, and the landing no longer shows this page's own test file.

## Getting-started page

### G0 · Guide header

**Rule.** Title and requirement in 7 columns; the step index runs across 12 as one wrapping row of links (it replaces the round-two sidebar so every StepPair can use the full 12).

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[h1 Getting started, requirement                      ]                                          head · 140
[step index: 01 … 06, Without a repository (wraps)                                            ]  nav · 48
```

At 375 (all guide blocks):

```text
|----------------------------------------------------| 327 px, one column
| h1, requirement                                    |
| step index (wraps)                                 |
| per step: number and title, what you type, what you|
```

### G1-G6 · Step × 6

**Rule.** Number and title span both halves above; what you type 6, what you see 6, one row per step, top-aligned. When a "see" is a sentence rather than a surface it is a Caption in its 6 columns. Empty area: each half is at least the height of the shorter artefact; a one-line command beside a taller surface is the only case where the left half has white space, bounded by the surface height.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[number and title, one sentence of context                                                    ]  head · 72
[what you type: TerminalWindow / CodeWindow   ] [what you see: TerminalWindow / Caption      ]  pair · 120-420
```

### G7-G8 · Without a repository: Step × 2

**Rule.** Same StepPair rule. Step 1: the snippet (type) and the markup sentence (see). Step 2: the hosted form with the screener fields (type) and the dashboard row of the run it starts (see).

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[number and title                                                                             ]  72
[type: Snippet CodeWindow                     ] [see: Caption (markup)                        ]  pair · 120
[number and title                                                                             ]  72
[type: HostedForm (with screen fields)       ] [see: Dashboard with the new run              ]  pair · 560
```

## What is measured

For each block the capture script records the leaf boxes inside the block and passes them to the ui-harness register's layout rows (`harness.layout.layout_metrics`: grid quality, balance, density, white space, regularity), with the block as the region. The readings are feedback, not a gate, except one rule from the issue: a block whose white space exceeds its content area is redesigned before the PR is published.
