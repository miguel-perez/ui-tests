# Grid plan: both pages at 1440 and 375

16 October 2026. Written before the round-three layout code (issue #18, item 9), from [`site-schema.md`](site-schema.md). Every block on both pages is built to these maps; the PR puts each map beside its capture with the ui-harness layout readings.

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

**Rule.** Headline and standfirst take columns 1-7; the hero artefact (the Ink report in its terminal) takes columns 8-12. The artefact is 5 columns, so its caption could sit beside it, but no columns remain; it goes under the terminal, left-aligned to its edge, in two lines. The faded P3 session and the texture sit behind the whole hero and occupy no columns. Empty area: the copy column is full height; under the terminal the caption fills the second row, so the empty area is the band below the caption (about 506 × 120), far smaller than the terminal (506 × 300).

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

### L2 · Section + Session

**Rule.** Section: heading 5, lead 7, one row, 96 above and 48 below; it never takes a side caption. Session spans 12, so its caption goes underneath. Inside: metadata strip over all 12, video 7 left, timeline 5 right at the same height (the timeline scrolls inside), words and audio across 12. Empty area inside the block is the caption line only.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head · 96 above, 48 below
[SessionView · metadata strip: person, task, date, device, outcome, ratings, recording        ]  strip · 88
[video 16:10 + scrubber + coloured bands              ] [timeline: time · kind · detail       ]  body · 540
[words feed and audio state (P3 talked the final answer)                                      ]  words · 96
[Caption under, left-aligned                                                                  ]  caption · 32
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading                                    |
| lead                                               |
| metadata strip (2 × 4 fields)                      |
| video + scrubber + bands                           |
| timeline (scrolls, 320 max)                        |
| words feed                                         |
| Caption                                            |
```

### L3 · Section + three PlayerSurface rows

**Rule.** Each frame is 7 columns (≤ 8), so its caption sits beside it in the remaining 5 columns, starting one gutter after the frame, vertically centred, max-width 42ch so the column is never wider than the text needs. The caption column carries text and is 5 ≥ 3 columns wide. Empty area per row: about 506 × 380 beside the caption against a 718 × 490 frame, so empty < artefact. Three rows stack.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[PlayerFrame: scenario card                           ] [Caption: file line + sentence        ]  row · 490
[PlayerFrame: task bar                                ] [Caption: file line + sentence        ]  row · 490
[PlayerFrame: questions                               ] [Caption: sentence                    ]  row · 490
[Caption under (closing line)                                                                 ]  32
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| PlayerFrame: card                                  |
| Caption                                            |
| PlayerFrame: bar                                   |
| Caption                                            |
| PlayerFrame: questions                             |
| Caption                                            |
| closing Caption                                    |
```

### L4 · Section + OptionsRow

**Rule.** Three OptionCards of 4 columns each, equal height (the row stretches), no table. Each card: name with icon, the who sentence, the mini UI (light theme), then cost and timing as a two-item footer. No caption, no empty columns.

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

**Rule.** Both 12 columns, so any caption goes underneath. The findings list follows rule 12: rank, count (right-aligned), the P1-P5 evidence cells, then the problem as the one free-text field. The expanded row splits 4 (reel thumbnail) and 8 (quote, moments, change). The result line is the footer.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[ChecksBox: three CheckRows in GitHub chrome                                                  ]  checks · 176
[FindingsList head: rank · count · P1-P5 · problem                                            ]  32
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

### L8 · Section + TerminalOutput + CodeFile + Terms

**Rule.** The command terminal is 12 (the commands block, per the schema). The code file is not the block's only artefact, so it is 8 columns with its caption beside it in 4. Terms are 8 columns of prose with no artefact. The actions follow the terms.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                      ] [lead                                                 ]  head
[TerminalWindow: the three commands and what init prints                                      ]  terminal · 230
[CodeWindow: landing.ui.test.ts with screen                   ] [Caption: this page runs this ]  row · 420
[Terms: closing prose                                         ]                                  terms · 110
[actions                                                      ]                                  48
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| Section heading, lead                              |
| TerminalWindow                                     |
| CodeWindow                                         |
| Caption                                            |
| Terms                                              |
| actions                                            |
```

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
[what you type: TerminalWindow / CodeWindow   ] [what you see: TerminalWindow / PlayerFrame / ]  pair · 120-420
```

### G7-G8 · Without a repository: Step × 2

**Rule.** Same StepPair rule. Step 1: the snippet (type) and the markup sentence (see). Step 2: the hosted form with the `screen` fields (type, light theme) and the dashboard row of the run it starts (see).

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[number and title                                                                             ]  72
[type: Snippet CodeWindow                     ] [see: Caption (markup)                        ]  pair · 120
[number and title                                                                             ]  72
[type: HostedForm (light, with screen fields) ] [see: Dashboard with the new run              ]  pair · 560
```

## What is measured

For each block the capture script records the leaf boxes inside the block and passes them to the ui-harness register's layout rows (`harness.layout.layout_metrics`: grid quality, balance, density, white space, regularity), with the block as the region. The readings are feedback, not a gate, except one rule from the issue: a block whose white space exceeds its content area is redesigned before the PR is published.
