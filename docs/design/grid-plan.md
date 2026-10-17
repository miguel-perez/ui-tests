# Grid plan: both pages at 1440 and 375

16 October 2026; redrawn 17 October 2026 for the composition round (issue #46), which puts every section of both pages on one grid ([`../../design/artefacts/README.md`](../../design/artefacts/README.md#the-page-grid-in-one-place)). Written first before the round-three layout code (issue #18, item 9), from [`site-schema.md`](site-schema.md). Every block on both pages is built to these maps; the PR puts the landing's map beside its capture with the grid test's readings.

**Themes.** This plan places content; it does not set colours. The theme rules are written once in [`../../design/artefacts/README.md`](../../design/artefacts/README.md#theme-rules-in-one-place): the site light only, whatever the system setting (ink, one accent, line, canvas and white, the light block of [`tokens.css`](../../design/artefacts/tokens.css); the Tokyo Night block there is the artefact viewer's dark alternate, not the site's), the site's own surfaces and the terminal and code windows white windows on the canvas with the line colour as their edge, the demo app in its own light grey, the participant chrome the inverse of its host with the author's accent. The captures and readings below are taken on the light theme.

## The grid

- Container 1248 px centred at 1440 (96 px margins), 12 columns of 82 px with 24 px gutters. One column 82, two 188, three 294, four 400, five 506, six 612, seven 718, eight 824, twelve 1248.
- **One split for every section: 5 / 7.** A section's heading takes the first five columns and its lead the right seven, as one `5fr 7fr` split with one 24 px gutter: the heading starts at 96 and is 510 wide, the lead starts at 630 and is 714 wide. The same split carries every pair in a section (a compile step, a guide step, the agent's terminal and its caption, the sources well).
- **A figure takes all twelve columns (96, 1248 wide) or the right seven (630, 714 wide).** Nothing is centred in a narrower column: the compilation's 800 px column and the pull-request section's 1036 px column are gone (issue #46).
- Pieces inside a section are numbered with a small mono figure in the moment colour before the heading; each piece's text keeps to 64ch.
- Vertical scale 24 / 48 / 96. A section head has 96 above and 48 below. Artefacts in a block are 48 apart; a caption is 24 under its artefact.
- At 375 the container is 343 px (16 px margins) and everything stacks in source order in one column, with no horizontal scroll; only the compile section's tab strip scrolls sideways, inside itself.
- `tests/e2e/grid.spec.ts` measures it: every `[data-section]`'s heading, lead and outermost figures on the landing and the guide, at 1440 and 375.

## The rules that decide every cell

1. A heading never sits anywhere but the first column's edge, 96 px from the left at 1440.
2. A figure is 12 columns or the right 7; text beside a right-7 figure takes the first 5.
3. A caption under a 12-column figure is left-aligned to its edge, in one or two lines.
4. No column narrower than 5 of 12 ever carries text.
5. Empty area in any block never exceeds the area of its artefacts.
6. At 375 everything stacks in source order.
7. Tables (terminal and page): fixed-width fields first, the one free-text field last, numbers right-aligned in their column.

## How to read a map

Each map shows the 12 columns at 1440 with a ruler; a bracket spans the columns a content type occupies; the right margin gives the row and its height in px (planned; the PR reports the measured ones). The 375 map lists the stacked order in the single 343 px column.

## Landing page

Six sections, in order: L1 the hero, L2 what comes back, L3 what you write, L4 where the people come from, L5 the agent section, L6 the hosted section. At 1440 the page is about 8,250 px tall (15,385 px before issue #46; the limit is 9,000).

### L1 · Claim

**Rule.** Unchanged. Headline and standfirst take columns 1-7; the hero artefact (the Ink report in its terminal) takes columns 8-12 with its caption under it. The texture alone sits behind the whole hero. The hero is the Claim, not a section: it has an h1 and no lead, and the grid test reads the sections after it.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Claim: h1 (3 lines), standfirst                      ] [TerminalWindow: report               ]  row 1 · 440
[actions, fine print                                  ] [Caption under, 1-2 lines             ]  row 2 · 120
```

At 375: h1, standfirst; actions, fine print; the terminal; its caption.

### L2 · WhatComesBack: what comes back

**Rule** (issue #46; `design/artefacts/what-comes-back.html`). The heading in 5, the lead in 7. Then three pieces, hairlines between them, each a numbered intro (64ch, from column 1) over its artefact across all 12 columns: the merge box; the check's page on GitHub (a 220 px side list and the page); the report, the same `RunReport` as `/r/<run>` with an address bar (the result line and the person line across, then the list in 5 of its 12 and the evidence pane in 7, sticky 16 px from the top, the closing line across), its caption under it. Empty area: the intros leave the right of the row free beside 64ch, and the pane is taller than the five rows; both are far smaller than the three artefacts.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ] [lead, 714 wide                                         ]  head · 96 above, 48 below
----------------------------------------------------------------------------------------------    hairline
[1 The check: intro, 64ch                           ]                                            intro · 60
[merge box: heading · ui-tests (neutral) · preview · tests                         Example run]  box · 160
----------------------------------------------------------------------------------------------    hairline
[2 Its details, on GitHub: intro                    ]                                            intro · 80
[side 220 |title · sentence · table of three · legend · links · footer                        ]  page · 380
----------------------------------------------------------------------------------------------    hairline
[3 The report: intro                                ]                                            intro · 150
[address bar                                                                       Example run]  34
[crumb · result line · person line, each person a link to /r/k2m9/p<n>                        ]  130
[legend; rows 1-4, what worked (5/12)   ] [pane, sticky: clip, quote, where, moments, change   ]  viewer · 560
[closing line                                                                                 ]  60
[Caption under: no score and no pass                                                          ]  32
```

At 375:

```text
|----------------------------------------------------| 343 px, one column
| Section heading                                    |
| lead                                               |
| 1 The check: intro; merge box                      |
| 2 Its details: intro; side list above the page;    |
|   title, sentence, table (scrolls sideways), links |
| 3 The report: intro; address bar, result line,     |
|   person line, rows, the pane under them, closing  |
| Caption                                            |
```

### L3 · Compilation: what you write, what they see

**Rule** (issue #46; `design/artefacts/compile-section.html`). The heading in 5, the lead in 7. The three commands as three equal cards across 12, the note under them, the whole file across 12. Then a tab strip across 12, 1 Consent to 6 After the task, and one step visible at a time as a 5/7 pair: on the left, sticky 24 px from the top, the step's number and name, its note (64ch) and only its lines; on the right the screen in its constant light frame (16:10 over the Weekboard page, or fitted to its sheet), the stepper for steps 2 and 6, the dashed worked-out box for steps 2 and 5, and the "Comes back" line. Previous and next under the pair, across 12. Empty area: under the sticky left column, bounded by the screen's height.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ] [lead, 714 wide                                         ]  head
[cmd: npm install         ] [cmd: npx ui-tests init    ] [cmd: npx ui-tests run               ]  cards · 84
[note under the commands                                                                      ]  24
[CodeWindow: ui-tests/invite.ui.test.ts, 23 lines                                             ]  file · 620
[1 Consent · 2 Screener · 3 First look · 4 Scenario card · 5 Your page, with the bar · 6 After]  tabs · 44
[n Name · note, 64ch                ] [frame, constant light, chrome at real size              ]  pair · 400-700
[CodeWindow: only its lines (sticky)] [(stepper) (worked-out box) · Comes back                 ]
[← previous step                                                                  next step →]  nav · 48
```

At 375:

```text
|----------------------------------------------------| 343 px, one column
| Section heading, lead                              |
| three command cards, stacked; the note             |
| the whole file (the code wraps)                    |
| tab strip (scrolls sideways inside itself)         |
| the open step: number, name, note, its lines,      |
|   frame, (stepper), (box), Comes back             |
| previous · next                                    |
```

### L4 · Sources: where the people come from

**Rule.** Round seven's table, unchanged inside; issue #46 moves the head to the 5/7 split. The table runs across all 12 columns on its own track: the icon 28 px, then Source 3fr, Who 3fr, Cost 2fr, Time 2fr, Good for 2fr and the chevron 24 px (icon 28, Source 265, Who 265, Cost 177, Time 177, Good for 177, chevron 24). The open row's well is the 5/7 split with one gutter: how it works and the caveat on the left, under the name column; the picture on the right, at 630 and 714 wide.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ] [lead, 714 wide                                         ]  head
[ic|Source        |Who           |Cost      |Time      |Good for            |v ]               header · 40, sticky
[ic|name + what   |who           |cost+note |time+note |good for            |^ ]               row · 152 (open)
[  |How it works: 3 steps, caveat   ] [picture: join / invitation / fill (right 7)            ]  well · 520
[ic|name + what   |who           |cost+note |time+note |good for            |v ]               row · 152 × 2
```

At 375: heading, lead; each source a card with its cells labelled; the open well in one column.

### L5 · Section + AgentRun

**Rule** (issue #46). The terminal in the right 7, the caption (the file line and the closing sentence) in the first 5 beside it, vertically centred. Empty area: the band above and below the caption, smaller than the terminal.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ] [lead, 714 wide                                         ]  head
[Caption: file line + closing       ] [TerminalWindow: npx ui-tests run --actor agent          ]  row · 300
```

At 375: heading, lead; the terminal (scrolls sideways inside its body); the caption.

### L6 · Section + Snippet + Dashboard

**Rule.** The snippet across 12, the dashboard across 12, the caption under them. The dashboard is a table: fixed fields first (date, participants, status, headline result), the run name last as the free text; numbers right-aligned.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ] [lead, 714 wide                                         ]  head
[Snippet in CodeWindow                                                                        ]  snippet · 96
[date         ] [people       ] [status       ] [result       ] [name (free text last)        ]  Dashboard · 320
[Caption under                                                                                ]  32
```

At 375: heading, lead; the snippet; the dashboard (scrolls sideways inside itself); the caption.

## Getting-started page

### G0 · Guide header

**Rule** (issue #46). The title in 5, the requirement (its lead) in 7; the step index across 12 as one wrapping row of links.

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[h1 Getting started                 ] [requirement, 714 wide                                  ]  head · 60
[step index: 01 … 06, Without a repository (wraps)                                            ]  nav · 48
```

### G1-G6 · Step × 6, and G7-G8 · Without a repository: Step × 2

**Rule** (issue #46). The number and title in the first 5 columns, sticky 24 px from the top; the step's sentence of context (its lead), "You type" and "You see" in the right 7, one under the other, so every terminal, code window, form and dashboard in a step is a right-seven figure at 630, 714 wide. The "Without a repository" track's heading takes the first 5 above its two steps. Empty area: the left column under the title, bounded by the right column's height.

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[01 Title                           ] [sentence of context (lead)                             ]  head
[                                   ] [You type: TerminalWindow / CodeWindow / HostedForm      ]  type · 80-560
[                                   ] [You see: TerminalWindow / Dashboard / Caption           ]  see · 40-420
```

At 375 (all guide blocks):

```text
|----------------------------------------------------| 343 px, one column
| h1, requirement                                    |
| step index (wraps)                                 |
| per step: number and title, the sentence, what you |
| type, what you see                                 |
```

## Report page

### R1 · RunReport at /r/<run>

**Rule** (issue #35; `design/artefacts/run-report.html`). The report pages keep their own 1036 px reading column, centred; they are not landing or guide sections, under the site header; the share line (what the signed link shows, and the Share control) above the report. The report as in L5 without its address bar, its result line the page's h1. Each person links to `/r/<run>/p<n>`, the attempt view in the same column. The signed share link renders the same block without the site header.

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

`tests/e2e/grid.spec.ts` reads every section on the landing and the guide: at 1440 each heading's left edge at 96, each lead's at 630, and each outermost figure at 96 and 1248 wide or at 630 and 714 wide (±2 px), the landing's sections in order and the landing no taller than 9,000 px; at 375 every heading, lead and figure at 16 and 343 wide, and no horizontal scroll. It writes its readings to `test-results/grid-readings.json` for the PR description. The ui-harness layout rows (`harness.layout.layout_metrics`) remain feedback, not a gate.
