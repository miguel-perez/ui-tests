# Grid plan: both pages at 1440 and 375

16 October 2026. Written before the round-three layout code (issue #18, item 9), from [`site-schema.md`](site-schema.md). Every block on both pages is built to these maps; the PR puts each map beside its capture with the ui-harness layout readings.

**Themes.** This plan places content; it does not set colours. The theme rules are written once in [`../../design/artefacts/README.md`](../../design/artefacts/README.md#theme-rules-in-one-place): the site light only, whatever the system setting (ink, one accent, line, canvas and white, the light block of [`tokens.css`](../../design/artefacts/tokens.css); the Tokyo Night block there is the artefact viewer's dark alternate, not the site's), the site's own surfaces and the terminal and code windows white windows on the canvas with the line colour as their edge, the demo app in its own light grey, the participant chrome the inverse of its host with the author's accent. The captures and readings below are taken on the light theme.

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

**Rule.** Headline and standfirst take columns 1-7; the hero artefact (the Ink report in its terminal) takes columns 8-12. The artefact is 5 columns, so its caption could sit beside it, but no columns remain; it goes under the terminal, left-aligned to its edge, in two lines. The texture alone sits behind the whole hero (its waves in the line colour; no recording since issue #38) and occupies no columns. Empty area: the copy column is full height; under the terminal the caption fills the second row, so the empty area is the band below the caption (about 506 × 120), far smaller than the terminal (506 × 300).

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

### L4 · Sources: where the people come from

**Rule.** Round seven (issue #31), from [`../../design/artefacts/sources-section.html`](../../design/artefacts/sources-section.html). The heading and lead stacked in one column at most 64ch wide (the lead under the heading, not beside it). Then a table across all 12 columns, built on its own track rather than the 12 columns: the icon 28 px, then Source 3fr, Who 3fr, Cost 2fr, Time 2fr, Good for 2fr, and the chevron 24 px, 24 px gutters. At 1440 that gives the icon 28, Source 265, Who 265, Cost 177, Time 177, Good for 177 and the chevron 24 (1248 in all). The header row sticks to the top on the canvas once scrolled past. Each row is at least 152 px tall with its cells centred, rows of equal height; the free-text column is the name's own line (`what`), under the name. One row is open at a time: the row and its well take the surface edge to edge (the full width of the window, drawn as a clipped shadow so nothing overflows), and the underlines next to it are hidden. The well splits 5 / 7 with a 32 px gap: how it works and the caveat on the left, starting under the name column (indented by the icon's 28 and one gutter), the picture on the right. Empty area: the open well's left column is shorter than the picture by up to about 120 px; nothing else in the block is empty, so empty < artefact.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                                    ]                                            head · 96 above
[lead under it, 64ch                                ]                                            lead · 90, then 28
[ic|Source        |Who           |Cost      |Time      |Good for            |v ]               header · 40, sticky
[ic|name + what   |who           |cost+note |time+note |good for            |^ ]               row · 152 (open, surface edge to edge)
[  |How it works: 3 steps, caveat (5/12)  ] [picture: join / invitation / fill (7/12)        ]  well · 40 + 430 + 48
[ic|name + what   |who           |cost+note |time+note |good for            |v ]               row · 152
[ic|name + what   |who           |cost+note |time+note |good for            |v ]               row · 152
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading                                    |
| lead                                               |
| (no header row)                                    |
| per source, a card:                                |
|   ic | name, what                            | v   |
|      | WHO · who                                   |
|      | COST · cost, its note                       |
|      | TIME · time, its note                       |
|      | GOOD FOR · good for                         |
|   open well, one column, surface edge to edge:     |
|   How it works: 3 steps, caveat                    |
|   picture (frame fits its sheet; the fill stacks)  |
```

### L5 · PullRequest: in the pull request

**Rule** (issue #35; `design/artefacts/pr-section.html`). One column on 10 of the 12 columns (columns 2–11, 1036 px, centred), like the compilation's reading column but wide enough for the report's 5 / 7 viewer. The heading and the lead stacked, the lead at most 70ch. Three pieces, each a numbered intro (at most 64ch) over its artefact, hairlines between them, 40 above and 48 below each. The merge box and the check page are GitHub's chrome in the site's neutrals; inside the check page a 220 px side list and the page. The report is the same `RunReport` as `/r/<run>`, with an address bar: the result line and the person line across, then the list in 5 of its 12 and the evidence pane in 7, the pane sticky 16 px from the top while the list scrolls, the closing line across. No caption: the intros carry the words. Empty area: the intros leave the right of the column free (about 400 px beside 64ch), and the pane is taller than the five rows, so the list column has a band under it; both are far smaller than the three artefacts.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12
        [Section heading                    ]                                                  head · 96 above
        [lead, 70ch                                         ]                                  lead · 150, then 36
        ----------------------------------------------------------------------------------    hairline
        [1 The check: intro, 64ch                           ]                                  intro · 60
        [merge box: heading · ui-tests (neutral) · preview · tests             Example run]    box · 160
        ----------------------------------------------------------------------------------    hairline
        [2 Its details, on GitHub: intro                    ]                                  intro · 80
        [side 220 |title · sentence · table of three · legend · links · footer             ]   page · 380
        ----------------------------------------------------------------------------------    hairline
        [3 The report: intro                                ]                                  intro · 170
        [address bar                                                          Example run ]    34
        [crumb · result line (goal · reached · problems, seen across · pressed Done)     ]     80
        [person line: Person 1-5, reached, time, ease, each a link                        ]    50
        [legend; rows 1-4, what worked (5/12)] [pane, sticky: clip 16:10, quote, where,     ]  viewer · 590
        [                                    ] [moments, suggested change, copy (7/12)      ]
        [closing line: after the goal · First look · Who took part · environment · caveat ]    60
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading                                    |
| lead                                               |
| 1 The check: intro                                 |
| merge box (the check line wraps)                   |
| 2 Its details: intro                               |
| side list above the page                           |
| title, sentence, table (scrolls sideways), legend, |
| links, footer                                      |
| 3 The report: intro                                |
| address bar, crumb, result line                    |
| person line (wraps)                                |
| legend, rows 1-4, what worked                      |
| pane, under the list, not sticky                   |
| closing line                                       |
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

## Report page

### R1 · RunReport at /r/<run>

**Rule** (issue #35; `design/artefacts/run-report.html`). The same 1036 px column, centred, under the site header; the share line (what the signed link shows, and the Share control) above the report. The report as in L5 without its address bar, its result line the page's h1. Each person links to `/r/<run>/p<n>`, the attempt view in the same column. The signed share link renders the same block without the site header.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12
        [share line                                                              Share ]       24
        [crumb · result line                                                  Example run ]    80
        [person line                                                                      ]    50
        [legend; rows 1-4, what worked (5/12)] [pane, sticky (7/12)                       ]    viewer · 590
        [closing line                                                                     ]    60
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| share line, Share                                  |
| crumb, result line                                 |
| person line                                        |
| legend, rows                                       |
| pane                                               |
| closing line                                       |
```

## What is measured

For each block the capture script records the leaf boxes inside the block and passes them to the ui-harness register's layout rows (`harness.layout.layout_metrics`: grid quality, balance, density, white space, regularity), with the block as the region. The readings are feedback, not a gate, except one rule from the issue: a block whose white space exceeds its content area is redesigned before the PR is published.
