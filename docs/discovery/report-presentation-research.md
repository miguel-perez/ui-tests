# In the pull request: how usability reports are presented, and the report page

16 October 2026. Builds on [`reporting-schema-research.md`](reporting-schema-research.md) (the Run table and reading order) and [`pull-request-surfaces-research.md`](pull-request-surfaces-research.md) (what GitHub can carry). Corpus gaps: only Tufte's *Envisioning Information* is in the corpus; Lean UX exists as atoms only.

## 1. How usability reports are presented

| Source | Order | Above the fold | Rule |
|---|---|---|---|
| Hanington, *Universal Methods* #93 "Usability Report" | Executive summary → total problems with frequency, impact, persistence → list to be fixed → positive findings → tasks | The most serious problems | "Describe the most salient and serious usability problems first." "Embedded videos, screenshots… and participant quotations should be included to anchor the problem to actual events." Positive findings "counter-balanced with a similar number" of problems. |
| Krug, *Rocket Surgery* ch. 10, 13 | What you tested → the tasks → the problems you will fix → where to watch the clips | The fix list | "Focus ruthlessly on only the most serious problems." The email takes "no more than two minutes to read… bullet points, not paragraphs." "What's the smallest change we can make right now?" The Big Honkin' Report's fixes did not ship. |
| NIST CIF ([NISTIR 7742](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7742.pdf)) | Executive summary → introduction → method → results (effectiveness, efficiency, satisfaction, major findings, areas for improvement) → appendices | Who, how many, what tasks, major findings | Method sits after the summary, never before it. |
| NN/g, [actionable findings](https://www.nngroup.com/articles/actionable-usability-findings/) | Ranked findings, then positive findings | Highest severity first | "Identify the specific area of the design… that caused the user to have a problem." Findings explain the design, not the user. "Present recommendations as recommendations." No "elaborate wireframes reworking the whole design." |
| NN/g, [formal vs quick reports](https://www.nngroup.com/articles/formal-vs-quick-usability-reports/) | Quick: debrief then email | | "The shorter the email, the greater the probability that it will be read." Only 4% show highlight videos. |
| NN/g, [severity](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/) | | | Severity combines frequency, impact and persistence; 0–4 with 4 "imperative to fix". |
| Sauro & Lewis ch. 2, Table 2.1 | Problems × users matrix | | "Associate them with the users who encountered them." Impact: prevents completion / significant delay / minor / suggestion. |
| MeasuringU, [problem matrix](https://measuringu.com/problem-matrix/), [credible test](https://measuringu.com/credible-test/) | Each issue with a screenshot or clip, then the matrix | | "State a problem's severity separate from frequency." 3 of 5 means "between 23% and 88%" of all users. |
| Tufte, *Envisioning Information* ch. 2, 4, 5 | | | Small multiples "enforce local comparisons within our eyespan"; micro/macro "avoid the disruption of context switching"; on colour, "Above all, do no harm". |
| Cooper, *About Face* ch. 5–6 | | | Developers need "screen renderings with callouts sufficiently detailed for a developer to code from"; prototypes alone are "rarely sufficient to communicate underlying patterns, principles, and rationale". |
| Lean UX atoms | Findings → hypothesis status → next steps | | "Review findings with the entire project team immediately after the last participant." "Documents don't solve customer problems." |
| Maze ([reporting](https://maze.co/guides/maze-101-guide/reporting/)), Lyssna, UserTesting ([sharing](https://help.usertesting.com/hc/articles/11880360193181-Part-7-Analyzing-and-Sharing-Insights)), Dovetail ([web links](https://docs.dovetail.com/help/web-links)) | Overview or score → per task → paths; reels per task; insight = headline, summary, embedded evidence | A score or a completion rate | Our "no score" stance rules out the metric opener; the sentence takes its place. Clips share by direct link. Public links are per project. |
| Bug-report practice ([ybug](https://ybug.io/blog/how-to-write-a-bug-report), [Atlassian](https://www.atlassian.com/en/software/jira/templates/bug-report)) | Summary, steps, expected/actual, environment, attachment | | Point to "the exact element"; "a 10-second video replaces a 200-word description". |

**What the sources agree on.** The worst problems open the report and method follows the results. Severity and frequency are two separate facts, an impact word plus "x of n", with the people × problems matrix carrying frequency without percentages, colour on the data and neutral chrome. Each problem gets a clip, a quote and a time stamp with the jump to the source always visible. One recommendation per problem, beside it, as the smallest change, labelled as a suggestion. Engineers need the specific element, a callout precise enough to code from, steps and environment, the reason the change works, and something that becomes a ticket with one owner.

## 2. The report page

**The page.** The page opens with the sentence and the three worst problems, not the per-person table; fit and the first look move to the footer and lead only when they are the finding. The matrix is the problem list: each row carries five person marks in fixed order 1–5, each linking to that person's attempt. Every problem names a page and an element as a path and a Playwright-style locator, e.g. `/settings/members · button "Add"`, the callout a developer can paste into a test. A problem row expands to the clip card, the quote, where (page, locator, viewport), the moments (Person n · mm:ss, each playing the clip there), "hit it and still reached the goal", the suggested change with its reason, and "Copy as issue" producing Markdown with title, where, steps from the trace, clip link and suggested change. The share link always shows the sentence, the problems with their counts, what worked, who took part in aggregate, and how it was run. Every participant-level field (a person's row, quotes, moments as event replays, recordings) appears only when that person's consented purposes cover sharing with link recipients; otherwise it is omitted or folded into the aggregate, as the PRD requires consumers to check purposes before reading words or recordings. The link never carries the check diff, the trace JSON, money, panel IDs or the CI link. The check's conclusion is `neutral`, never green for a run that found problems.

| # | Section | Shows | Default | Component | Why here |
|---|---|---|---|---|---|
| 0 | Header | context, goal, date, n | shown | page chrome, white label | CIF title; Dovetail headline |
| 1 | Result | the sentence; reached x of n; "Pressed Done, but your check failed: x of n" (the checked-goal form of wrong-and-sure); couldn't tell when > 0 | shown | result lines | Krug; CIF executive summary |
| 2 | Fix first | top three: rank, impact, problem, where, x of n, person marks, suggested change | shown, first row expanded | `FindingRow` with matrix columns | Hanington; Krug; Sauro Table 2.1 |
| 3 | The rest | lower-ranked problems | shown if ≤ 3, else folded | same | Krug "the rest stay in the list" |
| 4 | What worked | observed successes, x of n, one moment | shown | `FindingRow` without impact | Hanington; CIF "things that tested well" |
| 5 | Each person | Person n · source · reached · how it ended · time · ease · problems hit · open | shown | person rows → `AttemptView` | Tufte small multiples; CIF per-task table |
| 6 | Time and the after-goal answers | times on a strip with the typical; UX-Lite raw, once | folded | strip, result line | reporting research detail rows |
| 7 | Who took part | screener answers, source, what they use today | shown; moves to the top when fit is low | footer block | CIF method; Krug |
| 8 | How this was run | scenario shown, n planned and attempted, dates, window and browser, "Found automatically from what people did; it can miss problems. Watch the clips." | shown, one paragraph | footer block | CIF method; PRD "What the numbers may say" |

**The PR-sized summary** (the check's `output.summary`, one screen): the sentence; "Reached the goal: x of n"; the top three with impact, x of n, where and the suggested change; "+n more"; "What worked" in one line; a link to the full report. No quotes, clips or person rows there beyond the one still of the moment the GitHub research allows. The landing lead should read: "a check lands on the pull request; its details are the top problems, and the full report opens for you, or for anyone you send a link to."

**Weekboard report, headline and first ten lines** (ranked by impact then count; the Share-menu problem, 4 of 5 but slowed, ranks third, which the README's Ink frame has right and `report-rows.html` has wrong):

> **Weekboard · invite a colleague: 3 of 5 people did not end with one invitation sent to Sam.**
>
> 1. Problems found: 4, seen across all 5 people.
> 2. Reached the goal: 2 of 5 (Person 1, Person 5). Your check looked for "1 invitation pending".
> 3. Pressed Done, but your check failed: 2 of 5.
> 4. Fix first, by impact, then by how many people hit it:
> 5. 1 · Blocked · 2 of 5 · /settings/members, button "Add": pressed Add, saw nothing change, pressed it again; Sam got two invitations. Suggested change: on press, show "Invited sam@acme.example" and disable the button.
> 6. 2 · Blocked · 1 of 5 · /settings/members, button "Add": the button looked switched off; Person 2 pressed I couldn't do this. Suggested change: keep it solid and check the address on press.
> 7. 3 · Slowed · 4 of 5 · /board, menu "Share": looked for Invite and found only link options. Suggested change: put "Invite a colleague" at the top of the Share menu.
> 8. The rest · 4 · Confused · 2 of 5 · /board, field "Search": typed Sam's email into the board search.
> 9. What worked: all 5 found Settings, then Members, on their own.
> 10. Who took part: 5 people from a paid panel (Prolific), screened as having signed up this week and wanting a colleague on their board.

## 3. Label fixes

| Current | Reads as | Fix |
|---|---|---|
| "P3 · 00:03" | Priority 3 | "Person 3 · 00:03" |
| "Watch" column | GitHub's Watch | "Moments" |
| "What to change" | An instruction | "Suggested change" |
| "Problems found: 4 across 5 people." | 4 people? | Page line: "Problems found: 4, seen across all 5 people." The short form may stay in the check title |
| Green "All checks have passed" beside "no pass" | Then why green? | Neutral check, and on its page: "This check never fails your build. It reports problems, or that none were seen this time." |
| "blocked" | Merge blocked | Keep, with a legend on first use: "Blocked: kept them from the goal · Slowed: cost them time · Confused: did something that had no effect" |
| "Wrong, and sure" on a checked goal | Weekboard never asks confidence | "Pressed Done, but your check failed: x of n"; keep "Wrong, and sure" for goals without a check |
| "paid panel" | A UI panel | "paid panel (Prolific)" on first use |
| "fit", "impression" | Jargon | "Who took part", "First look" |
| "effectiveness, efficiency, satisfaction" | Standards jargon | "Reached the goal / Time on this goal / How it felt", ISO names in the method footnote |
| "Found from traces; detection is partial" | Vague | "Found automatically from what people did; it can miss problems. Watch the clips." |
| "recovered" | Error recovery | "Hit it and still reached the goal" |
| "catch", "inconclusive", "unknown", "n" | Internal | "Looking for problems", "Not enough attempts yet: 3 of 5 in", "Couldn't tell", "5 people" |

Data inconsistency to settle: `tests/vocabulary.test.ts` has an attempt with a confidence answer and "pressed Can't do it" at ease 2, while Weekboard never asks confidence and the landing's Person 3 pressed Done at ease 3.
