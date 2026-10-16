# Reporting schema: what a usability study reports, and how a developer reads it

16 October 2026. Research for the Session view (one person, one goal) and the run report (one goal, n people). Interrogates `Session` in [`../design/site-schema.md`](../design/site-schema.md) and the measures in [`../prd/02-study-and-verdict.md`](../prd/02-study-and-verdict.md). Sources are the design corpus (Sauro and Lewis, Krug, Nielsen, Hanington, Norman, Tufte, ISO 9241-210) and, where the corpus is silent, the NIST Common Industry Format, MeasuringU and Nielsen Norman Group.

## 1. What the corpus says is reported

**The standard frame.** Usability is "the extent to which a system, product or service can be used by specified users to achieve specified goals with effectiveness, efficiency and satisfaction in a specified context of use" (ISO 9241-210:2019, 3.13, citing 9241-11). Evaluation should involve "analysing the results, prioritizing issues and proposing solutions" and "communicating the solutions appropriately so that they can be used effectively by the design team" (9241-210, 7.5.2 d–e). Users, goals and context are part of the result, not decoration; but the standard asks for prioritised issues to be communicated, not for metadata to lead.

**What practitioners collect.** Sauro and Lewis's survey of almost 100 summative tests: "some combination of completion rates, errors, task times, task-level satisfaction, test-level satisfaction, help access, and lists of usability problems (typically including frequency and severity)" (*Quantifying the User Experience*, ch. 2, "Usability Testing").

**Completion.** "The most fundamental of usability metrics", binary, reported as successes over attempts, "8 out of 10 … usually reported as 80%"; they "prefer the simpler binary measure" to partial credit (Sauro, ch. 2, "Completion Rates"). Nielsen grants partial credit because "it seems unreasonable to give a zero to both users who did nothing and those who successfully completed much of the task" (*Prioritizing Web Usability*, ch. 2). NN/g later says not to average partial levels: "assign word labels to levels of success instead of numbering them" ([NN/g, Success Rate](https://www.nngroup.com/articles/success-rate-the-simplest-usability-metric/)). The NIST CIF template defines success as "the correct outcome, without assistance, within the time allotted", and failure as abandoned, wrong, or out of time ([NISTIR 7742](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7742.pdf), Data Scoring). ui-tests' verified outcome is this definition with the check done by code rather than an observer.

**Time.** Three variants: "task completion time", "time until failure", "total time on task" (Sauro, ch. 2). For n < 25 "the geometric mean has less error and bias than the median" (Sauro, ch. 3; [MeasuringU, average times](https://measuringu.com/average-times/): the median "tends to overstate … by as much as 10%"). CIF averages only successful times. The PRD's "medians; no geometric mean" contradicts Sauro; at n = 5 the cleaner answer is to show all five times.

**Errors and deviations.** Errors are "any unintended action, slip, mistake, or omission" and "where possible, are mapped to UI problems" (Sauro, ch. 2). CIF says reporting path deviations is "strongly recommended", as observed steps over optimal steps (NISTIR 7742). Norman separates slips (right goal, wrong action) from mistakes (wrong goal) (*Design of Everyday Things*, ch. 5); the PRD's "different end state" finding is a mistake in his sense.

**Assists.** CIF counts assisted completions as failures (NISTIR 7742). An unmoderated study has no facilitator, so assists are always zero; do not show the field.

**Satisfaction.** Post-task: SEQ, seven points, "we recommend using the seven-point version"; SEQ or, online, SMEQ for "practical post-task assessment of perceived task difficulty" (Sauro, ch. 8). The SEQ average across 400+ tasks "hovers between about 5.3 and 5.6"; below 5 suggests difficulty; about 14% of users who failed still rated the task very easy ([MeasuringU, SEQ](https://measuringu.com/seq10/)). Post-study: UX-Lite, two five-point items, each `(x − 1) × 25`, averaged, ease and usefulness reportable separately with percentile grades against norms "from retrospective surveys", to be compared with test data with caution ([MeasuringU, UX-Lite](https://measuringu.com/how-to-score-and-interpret-the-ux-lite/)). Nielsen: "subjective satisfaction ratings are not a very telling usability measure because users tend give generous scores even when they have great difficulty" (ch. 2).

**Confidence and disasters.** "Disasters are when users fail the task and yet report they are extremely confident they completed it successfully (e.g. 7's on a 7 point scale)"; median disaster rate 5% across 174 tasks ([MeasuringU, UI disasters](https://measuringu.com/ui-disasters/)). The threshold is 7, not "high". The current example labels a 6 a confident failure; under the source definition it is not.

**Problems, severity, frequency.** Frequency is occurrences over participants; impact is "(1) prevents task completion, (2) causes a significant delay or frustration, (3) has a relatively minor effect … (4) is a suggestion" (Rubin via Sauro, ch. 2). Nielsen adds persistence and rates "very simply as high, medium, or low" because "there is no meaningful difference between something rated 62 … and 63" (ch. 4). NN/g's 0–4 scale ends at "usability catastrophe: imperative to fix" ([NN/g, severity](https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/)). Krug: severity is "Will a lot of people experience this problem?" and "Will it cause a serious problem … or is it just an inconvenience?"; "Focus ruthlessly on only the most serious problems" (*Rocket Surgery Made Easy*, ch. 10).

**The problem-by-participant matrix.** "A useful way to organize UI problems is to associate them with the users who encountered them" (Sauro, ch. 2, Table 2.1: problems as rows, users as columns, X marks, frequency per row).

**Participants.** CIF tabulates participant ID, role, experience, product experience and assistive technology needs, with names replaced by IDs (NISTIR 7742). Krug: "Recruit loosely and grade on a curve" (ch. 7): who they were changes how you read a result, so it belongs beside it.

**Executive summary.** "Describe the most salient and serious usability problems first", then total problems "with frequency, impact, and persistence", video and "participant quotations … to anchor the problem to actual events", the list to fix, positive findings, then tasks (Hanington, *Universal Methods of Design*, "Usability Report"). CIF's summary adds who, how many, what tasks, and a per-task table: N, success, path deviation, time, errors, rating (NISTIR 7742). Krug: "A short list of the most serious problems" instead of the "Big Honkin' Report" whose fixes never shipped (ch. 3, 13).

**Findings phrasing.** "Identify the specific area of the design"; "Findings should explain the elements of the design that confused users", not what the user failed to do; rank and include positives ([NN/g, actionable findings](https://www.nngroup.com/articles/actionable-usability-findings/)). Norman's gulf of evaluation: a display is good when its state is "easy to get, is easy to interpret, and matches the way the person thinks of the system" (ch. 2). Tufte: small multiples "enforce local comparisons within our eyespan" (*Envisioning Information*, ch. 4); at n = 5, five values side by side beat a mean. For non-researchers Sauro advises error bars or asterisks rather than walking through calculations ([MeasuringU, misconceptions](https://measuringu.com/?p=106)).

## 2. How a developer reads the current fields

Reader: knows Playwright, assertions, traces and bug priorities; has not run a study.

| Shown now | First reading | Right? | Fix |
| --- | --- | --- | --- |
| P3 · panel | Priority 3 bug; a UI panel | No | "Person 3 of 5 · paid panel (Prolific)" |
| incorrect | The assertion failed | Mostly; but it does not say why it ended | Split: "Reached the goal? No" and "How it ended: pressed Done" |
| gave up | Same as incorrect? | Unclear which axis | "How it ended: pressed Can't do it" |
| confident failure | A flaky test that failed confidently? | No; and it fired at 6 | "Wrong, and sure they were right" only at 7 of 7; otherwise show both facts plainly |
| SEQ ease 3 of 7 | Some score; is 7 good? | Direction unknown | "How easy was it? 3 of 7 (7 = very easy; typical 5.5)" |
| confidence 6 of 7 | Model confidence; statistical confidence | No | "How sure they'd done it: 6 of 7" |
| UX-Lite usefulness 75 · ease 25 | 75% of something | No: raw 4 and 2 of 5; per study, not per goal | Move off the attempt; "Would it help them? 4 of 5 · Easy to use? 2 of 5" |
| duration | Whole session | No: time on goal, questions excluded | "Time on this goal: 3 min 12 s" |
| 1280×800 | Viewport, as in Playwright | Yes | "Window 1280×800 · Chrome 141 · macOS" in the footer |
| date, device at the top | Reproduction context | Partly; it is not the result | Footer; one line |
| deviation | Statistical deviation; diff | No | "Off your path: opened /pricing" |
| backtrack | Browser back | Close: any return to an earlier page | "Went back to /cart" |
| dead click | Click on a disabled element | Close | "Clicked, nothing happened" |
| pause | Debugger pause | No | "Stopped for 14 s" |
| recording state | Recording available | Mixes availability and consent | Footer: "Recorded: screen, voice. Camera: declined" |

A developer cares about date, viewport and browser only when deciding whether a problem is theirs to reproduce; they belong in a one-line footer below the clip, not at the head.

## 3. The proposal

### Attempt (one person, one goal)

| Field | Label shown | Format | Source | Priority | Default |
| --- | --- | --- | --- | --- | --- |
| reached | Reached the goal? | Yes / No / Couldn't tell (the check returned unknown) | Binary completion, Sauro ch. 2; CIF success; verified by the goal's check | headline | shown |
| ended | How it ended | Pressed Done · Pressed Can't do it · Ran out of time (3 min) · Left | CIF failure kinds, NISTIR 7742 | headline | shown |
| sure | How sure they'd done it | n of 7 (7 = completely sure); with "Wrong, and sure" when No and 7 | MeasuringU disasters | headline | shown |
| blockers | What got in the way | Up to three moments, each: what happened, where (page, element), time stamp | Hanington; NN/g specific, design-not-user | headline | shown |
| time | Time on this goal | m min s s; "timer stops at Done" on first view | Sauro ch. 2 time variants | body | shown |
| ease | How easy was it? | n of 7 (7 = very easy; typical 5.5) | SEQ, Sauro ch. 8; MeasuringU norm | body | shown |
| video | Recording | video, jumps to moments | Hanington | body | shown |
| moments | What they did | timeline: clicked, typed, off your path, went back, clicked with no effect, stopped n s, pressed Done | CIF path deviation; Sauro errors | body | shown |
| words | What they said | quotes with time stamps | Hanington quotations | body | shown |
| path | Their path vs yours | pages visited / pages on your path (7 / 4) | CIF deviation ratio | detail | folded |
| check | What the check saw | assertion diff | PRD verified outcome | detail | folded |
| lanes | Event lanes | lane chart | trace | detail | folded |
| person | Who | Person 3 of 5 · paid panel · uses a spreadsheet for this today | CIF participant table; Krug | footer | shown |
| setup | Where | Desktop · Chrome 141 · window 1280×800 · 16 Oct | CIF context of use | footer | shown |
| consent | Recorded | screen, voice; camera declined | PRD consent | footer | shown |

UX-Lite and the fit answers belong to the person, not the goal; they appear on the run report.

### Run (one goal, n people)

| Field | Label shown | Format | Source | Priority | Default |
| --- | --- | --- | --- | --- | --- |
| sentence | Result | the PRD sentence, counting people: "2 of 5 could not find X" | Krug; PRD | headline | shown |
| reached | Reached the goal | x of n; adjusted-Wald range only when the goal estimates a rate | Sauro ch. 3; NN/g | headline | shown |
| top | Worst problems | top three: what, where, people x of n, impact (blocked / slowed / confused) | Krug ch. 10; Rubin impact; Nielsen high/medium/low | headline | shown |
| wrongsure | Wrong, and sure | x of n | MeasuringU disasters | headline | shown when ≥ 1 |
| matrix | Who hit what | problems × people, marks, row counts | Sauro Table 2.1 | body | shown |
| perperson | Each person | one row per person: reached, how it ended, time, ease, sure, link | Tufte small multiples; CIF per-task table | body | shown |
| worked | What worked | observed successes | Hanington; NN/g | body | shown |
| alltime | Time | every person's time on a strip; typical (median) for those who reached | Sauro; PRD | detail | folded |
| uxlite | After all goals: easy to use? would it help? | each n of 5, per person; 0–100 only beside a norm | MeasuringU UX-Lite | detail | folded |
| others | Other problems | ranked list | Krug | detail | folded |
| fit | Who took part | screened, had the need recently, how they do it today | PRD fit; CIF participants | footer | shown (promoted to headline when fit is low) |
| method | How this was run | goal wording shown, n planned and attempted, source, dates | CIF method | footer | shown |

### Reading orders

**Attempt:** did they reach it and how it ended → were they sure → what got in the way → time and ease → video, timeline, words → path, check diff, lanes (folded) → who, setup, consent. Completion is "the most fundamental" measure (Sauro). Hanington and Krug put the serious problem first and anchor it with clips and quotes. The gulf-of-evaluation test (Norman) says the state should be read before the mechanism. CIF puts participants and context in method, not results.

**Run:** the sentence → reached x of n and wrong-and-sure → three worst problems → who hit what → each person in a row → what worked → time, UX-Lite, other problems (folded) → who took part, how it was run. Hanington: "most salient and serious usability problems first". Krug: "Focus ruthlessly". Sauro's matrix ties problems to people. Tufte's small multiples suit n = 5. This departs from the PRD's "report opens with the sample's fit": fit opens the report only when it is the finding.

### Glossary (terms that stay)

- **Goal:** what the person was asked to achieve, in their words.
- **Attempt:** one person trying one goal.
- **Run:** one study: n people trying the same goals.
- **Your path:** the route you wrote in the test; people may take others.
- **Check:** your code that decides whether the end state is right.
- **Reached the goal:** the check passed; what they said does not count.
- **Couldn't tell:** the check returned unknown; never counted as pass or fail.
- **Wrong, and sure:** did not reach the goal yet rated themselves 7 of 7 sure; the costliest kind of failure because nobody reports it.
- **Ease rating:** the 1–7 answer to "How easy was it?" (the Single Ease Question).
- **Problem:** something in the design that stopped, slowed or confused someone.
- **Impact:** blocked, slowed, or confused: the worst seen for that problem.
- **Panel:** a paid pool of strangers recruited through a service.

### Fields to drop or move

- "confident failure" as a label, and firing it below 7.
- UX-Lite on the attempt view, and its 0–100 numbers without a norm.
- Instrument names (SEQ, UX-Lite) in labels; keep them in a footnote.
- Date, device and viewport at the top; move to the footer.
- "P" person ids and bare "panel".
- "duration"; replace with time on this goal.
- Assists: always zero unmoderated.
- The lane chart by default; fold it.
- "done" as a moment kind; it is "How it ended".

### Conflicts with the PRD to resolve

- **Disaster threshold.** The PRD flags a "confident failure" at high confidence; the source defines it at 7 of 7 only. The P3 example (6 of 7) is not a disaster under that definition.
- **Time summary.** The PRD says medians, no geometric mean; Sauro and MeasuringU recommend the geometric mean under n = 25. At n = 5 show every time and call the median "typical".
- **Report opening.** The PRD opens with the sample's fit; the corpus opens with the worst problems. Fit leads only when low fit is the finding.
