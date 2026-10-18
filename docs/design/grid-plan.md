# Grid plan: both pages at 1440 and 375

16 October 2026; redrawn 17 October 2026 for the composition round (issue #46), which puts every section of both pages on one grid ([`../../design/artefacts/README.md`](../../design/artefacts/README.md#the-page-grid-in-one-place)). Written first before the round-three layout code (issue #18, item 9), from [`site-schema.md`](site-schema.md). Every block on both pages is built to these maps; the PR puts the landing's map beside its capture with the grid test's readings.

**Themes.** This plan places content; it does not set colours. The theme rules are written once in [`../../design/artefacts/README.md`](../../design/artefacts/README.md#theme-rules-in-one-place): the site light only, whatever the system setting (ink, one accent, line, canvas and white, the light block of [`tokens.css`](../../design/artefacts/tokens.css); the Tokyo Night block there is the artefact viewer's dark alternate, not the site's), the site's own surfaces and the terminal and code windows white windows on the canvas with the line colour as their edge, the demo app in its own light grey, the participant chrome the inverse of its host with the author's accent. The captures and readings below are taken on the light theme.

## The grid

- Container 1248 px centred at 1440 (96 px margins), 12 columns of 82 px with 24 px gutters. One column 82, two 188, three 294, four 400, five 506, six 612, seven 718, eight 824, twelve 1248.
- **One split for every section: 5 / 7.** A section's heading takes the first five columns and its lead the right seven, as one `5fr 7fr` split with one 24 px gutter: the heading starts at 96 and is 510 wide; the lead keeps to 64ch inside the right seven and ends flush with the container's right edge, at 1344 (the host section's rule since issue #56, every landing section's since issue #65; a guide step's sentence still starts at 630, over the figures it introduces). The same split carries every pair in a section (a compile step, a guide step, the agent's terminal and its caption, the sources well).
- **A figure takes all twelve columns (96, 1248 wide) or the right seven (630, 714 wide).** Nothing is centred in a narrower column: the compilation's 800 px column and the pull-request section's 1036 px column are gone (issue #46).
- Pieces inside a section are numbered with a small mono figure in the moment colour before the heading; each piece's text keeps to 64ch.
- Vertical rhythm in three steps only (issue #51): `--space-1` 24, `--space-2` 48, `--space-3` 96, which on a phone are 24, 36 and 64. Every section opens with 96 (`padding-block: var(--space-3) 0`) and the last before the footer closes with 96; a head is followed by 48, a figure by 48, a caption or a note by 24, and nothing else spaces a section's top-level children. The hero keeps 96 above and below. No rule or motif separates sections, and since issue #62 no horizontal rule appears anywhere outside a drawn surface: not between the pieces of "How it works.", under the compile tab strip or over its previous and next row, between the sources table's rows or under its last, or around the guide's step index; spacing alone keeps those gaps. Hairlines stay only inside drawn windows (a window's tab bar, the merge box rows, the check page's table, the code windows, the demo frames). `tests/e2e/rules.spec.ts` walks both pages at both widths for any other.
- The footer closes every page: a 5 / 7 row, the wordmark at 96 and the three links in the right seven ending flush at 1344; at 375 one column, the links left-aligned. 48 above and below it (36 on a phone).
- The page's texture runs behind everything (issue #51): fine waves 14 px apart down the whole document, in the line colour with a blue tint at each line's centre.
- At 375 the container is 343 px (16 px margins) and everything stacks in source order in one column, with no horizontal scroll; only the compile section's tab strip scrolls sideways, inside itself.
- `tests/e2e/grid.spec.ts` measures it: every `[data-section]`'s heading, lead and outermost figures on the landing and the guide, at 1440 and 375; each section's top padding and the gap from its head to its first figure; and the footer on the landing, the guide and the report.

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

Seven sections, in order: L1 the hero, L2 how it works ("What comes back." until issue #49), L3 what you write, L4 where the people come from, L5 what a run is worth (issue #53), L6 the agent section, L7 the host section (issue #56: no repo, one command). At 1440 the page is 6,601 px tall with the footer after the replay round (issue #62; 8,016 px after the host round, issue #56; 8,111 px after issue #54, 8,431 px with what a run is worth, issue #53; 8,114 px after issue #51, about 8,350 px after issue #49, 8,253 px after issue #46, 15,385 px before it; the limit is 9,000).

### L1 · Claim

**Rule.** Unchanged. Headline and standfirst take columns 1-7; the hero artefact (the Ink report in its terminal) takes columns 8-12 with its caption under it. The page's texture runs behind it, as behind every section and the footer (issue #51); the hero has none of its own. The hero is the Claim, not a section: it has an h1 and no lead, and the grid test reads the sections after it.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Claim: h1 (3 lines), standfirst                      ] [TerminalWindow: report               ]  row 1 · 440
[actions, fine print                                  ] [Caption under, 1-2 lines             ]  row 2 · 120
```

At 375: h1, standfirst; actions, fine print; the terminal; its caption.

### L2 · WhatComesBack: how it works

**Rule** (issue #46; issue #49; the replay round, issue #62; `design/artefacts/what-comes-back.html`). The heading "How it works." in 5 and no lead, then three numbered pieces, `--space-2` apart with no rule between them, each a numbered intro (64ch, from column 1): the merge box across 12; the check's page on GitHub across 12 (a 220 px side list and the page); and the replay, an illustration with nothing to press: its intro in the first 5 and one compact moment card in the right 7 (Person 3's still at 00:58 in 240 px with "00:58 → 01:04" and a decorative play mark, then who, when and Blocked, what they did, their words and the smallest change), then the rail across 12: a 2 px line in the line colour, a hollow dot at each of the attempt's thirteen events at its second, the three moments as 14 px filled dots ringed in the canvas (slowed at 00:03, confused at 00:23, blocked at 00:58) with their time and word under them, and the two ends. The report as the list is off the landing: it stays at `/r/<run>`, which the check page links to. Empty area: the intros of the first two pieces leave the right of their row free beside 64ch, and the right of the head row where a lead used to be; both far smaller than the artefacts.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[How it works.                      ]                                                            head · 96 above
[1 The check: intro, 64ch                           ]                                            intro · 60 · 48 above
[merge box: heading · ui-tests (neutral) · preview · tests                         Example run]  box · 160
[2 Its details, on GitHub: intro                    ]                                            intro · 80 · 48 above
[side 220 |title · sentence · table of three · legend · links · footer                        ]  page · 380
[3 The replay: intro, 64ch          ] [still 240 | Person 3 · 00:58 · Blocked; did; said; fix ]  row · 180 · 48 above
[o-●-o----o-----o--●--o-----o---o---o------------●--o-o  rail: 13 events, 3 moments           ]  rail · 80 · 44 above
[00:00 Started on /board                                 01:03 Pressed Done · the check failed]
```

At 375:

```text
|----------------------------------------------------| 343 px, one column
| How it works.                                      |
| 1 The check: intro; merge box                      |
| 2 Its details: intro; side list above the page;    |
|   title, sentence, table (scrolls sideways), links |
| 3 The replay: intro; the card: the still, then     |
|   who, did, said, fix; the rail across the column; |
|   the two ends                                     |
```

### L3 · Compilation: what you write, what they see

**Rule** (issue #46; the trim round, issue #54; `design/artefacts/compile-section.html`). The heading in 5, the lead in 7. The three commands as three equal cards across 12, the note under them. Then a tab strip across 12, 1 Consent to 6 After the task, and one step visible at a time as a 5/7 pair: on the left the step's number and name and its note (64ch), and nothing else; on the right the screen in its constant light frame (16:10 over the Weekboard page, or fitted to its sheet), the stepper for steps 2 and 6, and the "Comes back" line (the replay round, issue #62, removes the worked-out box from step 2). Previous and next under the pair, across 12. Then the whole file across 12, `--space-2` below the previous and next row. Nothing is sticky, and the step area takes each step's own height at every width: the closed steps leave the layout (issue #54 removes the shared cell of issue #49). Empty area: under a shorter left column, bounded by the screen's height.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ]          [lead, 64ch, ends flush at 1344                ]  head
[cmd: npm install         ] [cmd: npx ui-tests init    ] [cmd: npx ui-tests run               ]  cards · 84
[note under the commands                                                                      ]  24
[1 Consent · 2 Screener · 3 First look · 4 Scenario card · 5 Your page, with the bar · 6 After]  tabs · 44
[n Name · note, 64ch                ] [frame, constant light, chrome at real size              ]  pair · the step's own height
[                                   ] [(stepper) · Comes back                                  ]
[← previous step                                                                  next step →]  nav · 48
[CodeWindow: ui-tests/invite.ui.test.ts, 23 lines                                             ]  file · 620 · 48 above
```

At 375:

```text
|----------------------------------------------------| 343 px, one column
| Section heading, lead                              |
| three command cards, stacked; the note             |
| tab strip (scrolls sideways inside itself)         |
| the open step: number, name, note,                 |
|   frame, (stepper), Comes back                    |
| previous · next                                    |
| the whole file (the code wraps)                    |
```

### L4 · Sources: where the people come from

**Rule.** Round seven's table, unchanged inside, except that no row is open on arrival (issue #49); issue #46 moves the head to the 5/7 split. The table runs across all 12 columns on its own track: the icon 28 px, then Source 3fr, Who 3fr, Cost 2fr, Time 2fr, Good for 2fr and the chevron 24 px (icon 28, Source 265, Who 265, Cost 177, Time 177, Good for 177, chevron 24). The open row's well is the 5/7 split with one gutter: how it works and the caveat on the left, under the name column; the picture on the right, at 630 and 714 wide.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ]          [lead, 64ch, ends flush at 1344                ]  head
[ic|Source        |Who           |Cost      |Time      |Good for            |v ]               header · 40, sticky
[ic|name + what   |who           |cost+note |time+note |good for            |^ ]               row · 152 (once opened)
[  |How it works: 3 steps, caveat   ] [picture: join / invitation / fill (right 7)            ]  well · 520
[ic|name + what   |who           |cost+note |time+note |good for            |v ]               row · 152 × 2
```

At 375: heading, lead; each source a card with its cells labelled; the open well in one column.

### L5 · Worth: what a run is worth

**Rule** (issue #53; `design/artefacts/roi-section.html`). The smallest section on the page: no figure and no calculator. The heading in 5; in the right 7, stacked, with no lead: the one sentence (23 px, its "$60" in the ink and its "39 minutes" in the moment colour), its arithmetic under it in 13 px, no wider than the sentence (600 px, two lines), its four given numbers editable in place, and the two BLS sources. The right column is the head's second cell, so the section has a head and nothing after it, and the next section's 96 follows. Empty area: the five columns under the heading and the 114 px right of the sentence, smaller than the sentence and its arithmetic.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[What a run is worth.               ] [Five people cost about $60, about 39 minutes of   ]        head · 96 above
[                                   ] [a US developer's time. If one problem … paid for  ]        sentence · 130, 600 wide
[                                   ] [The arithmetic: $[135,980] ÷ [2,080] h = $65 …    ]        arithmetic · 40, two lines
[                                   ] [BLS, software developers · BLS, employer costs    ]        sources · 20
```

At 375: the heading; the sentence (20 px); the arithmetic in three lines; the two sources, one under the other.

### L6 · Agents: agents use some interfaces, too

**Rule** (issue #49; `design/artefacts/agents-section.html`). The heading in 5 with the command under it, the lead in 7. Then three tiles across 12, one per interface (Your API, Your MCP server, Your CLI), each 4 columns (400 px): its icon in the accent, its name and target, one sentence. No terminal, no code block, no result line. Empty area: the inside of the tiles under their sentences, smaller than the tiles' text.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Agents use some interfaces, too.   ]          [lead: three sentences, 64ch, ends at 1344     ]  head
[$ npx ui-tests --actor agent       ]
[icon · Your API · target: { http } ] [icon · Your MCP server        ] [icon · Your CLI           ]  tiles · 230
[  one sentence                     ] [  one sentence                ] [  one sentence            ]
```

At 375: heading, the command, lead; the three tiles stacked, each 343 wide.

### L7 · Host: no repo, one command

**Rule** (issue #56; `design/artefacts/hosted-section.html`). The heading in the first 5; the lead in the right 7, at most 64ch and flush to the container's right edge, so it ends at 1344 at 1440. Then two unnumbered pieces with no hairline above them, each its name and intro (64ch) over a white window across 12: "The command" with the `host` terminal, "The line" with the script tag. The caption under them. No dashboard.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[Section heading                    ]          [lead, 64ch, ends flush at 1344                ]  head
[The command + intro (64ch)                    ]                                                 intro
[Terminal · Example: $ npx ui-tests host, Deploying…, collector, player, store, panel         ]  terminal · 200
[The line + intro (64ch)                       ]                                                 intro
[index.html · or your tag manager: <script src=".../s.js" async></script>                     ]  snippet · 64
[Caption under                                                                                ]  24
                                                                                                  96 to the footer
[ui-tests. wordmark                 ] [   miguel.design · Open source MIT licence · Report a bug ]  Footer · 48 above and below
```

At 375: heading, lead (left-aligned); the command and its terminal (the rows wrap); the line and its script tag; the caption; then the footer, the wordmark over the three links, left-aligned.

## Getting-started page

### G0 · Guide header

**Rule** (issue #46). The title in 5, the requirement (its lead) in 7; the step index across 12 as one wrapping row of links.

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[h1 Getting started                 ] [requirement, 714 wide                                  ]  head · 60
[step index: 01 … 06, Without a repository (wraps)                                            ]  nav · 48
```

### G1-G6 · Step × 6, and G7 · Without a repository

**Rule** (issue #46). The number and title in the first 5 columns, sticky 24 px from the top; the step's sentence of context (its lead), "You type" and "You see" in the right 7, one under the other, so every terminal and code window in a step is a right-seven figure at 630, 714 wide. "Without a repository" (issue #56) puts its heading in the first 5 and, as its lead in the right 7, one paragraph on `ui-tests host` with the CLI's caveat line under it; no form and no dashboard. Empty area: the left column under the title, bounded by the right column's height.

```text
   1       2       3       4       5       6       7       8       9      10      11      12   
[01 Title                           ] [sentence of context (lead)                             ]  head
[                                   ] [You type: TerminalWindow / CodeWindow                    ]  type · 80-560
[                                   ] [You see: TerminalWindow / Caption                        ]  see · 40-420
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

**Rule** (issue #35; issue #49; `design/artefacts/run-report-list.html`). The report pages keep their own 1036 px reading column, centred; they are not landing or guide sections, under the site header; the share line (what the signed link shows, and the Share control) above the report. The report as in L2 without its address bar, its result line the page's h1. Each person links to `/r/<run>/p<n>`, the attempt view in the same column. The signed share link renders the same block without the site header.

At 1440:

```text
   1       2       3       4       5       6       7       8       9      10      11      12
        [share line                                                              Share ]       24
        [crumb · result line                                                  Example run ]    80
        [legend                                                                           ]    20
        [card 1: text                                              ] [clip 300            ]    220
        [cards 2-4, the same; what worked, unfilled                                       ]    740
        [Person 1 ][Person 2 ][Person 3 ][Person 4 ][Person 5 ]                                120
        [closing line                                                                     ]    60
```

At 375:

```text
|----------------------------------------------------| 327 px, one column
| share line, Share                                  |
| crumb, result line, legend                         |
| each card: text, then its clip                     |
| what worked                                        |
| people strip, two columns                          |
| closing line                                       |
```

## What is measured

`tests/e2e/grid.spec.ts` reads every section on the landing and the guide: at 1440 each heading's left edge at 96, each landing lead's right edge at 1344 and each guide lead's left edge at 630, and each outermost figure at 96 and 1248 wide or at 630 and 714 wide (±2 px), the landing's sections in order and the landing no taller than 9,000 px; at 375 every heading, lead and figure at 16 and 343 wide, and no horizontal scroll. It also opens the four section artefacts with a lead and holds their leads to the same rule. It writes its readings to `test-results/grid-readings.json` for the PR description. `tests/e2e/text.spec.ts` (issue #65) walks the landing, the guide and `/r/k2m9` at both widths for a text block that ends on a single word and for a paragraph wider than 72ch. The ui-harness layout rows (`harness.layout.layout_metrics`) remain feedback, not a gate.
