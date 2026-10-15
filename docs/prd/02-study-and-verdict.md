# Context, measures, and what the numbers may say

## What a test compiles to

`ui-tests lint` and every run compile a context into a JSON record. The compiled context is stored with the run, so a later edit to the test file never changes a past run. The player receives only what a participant needs; happy paths, expected answers and hooks stay with the runner.

| Compiled field | From | Goes to the player |
| --- | --- | --- |
| `users`, `purpose`, `environment` | the context's inputs | the purpose, as the answer among distractors in the impression stage |
| `screener` | the `users` sentence; one behavioural question; panel filters where available; the three fit questions derived from the purpose; three persona-placement questions | yes |
| `impression` | derived: the first goal's starting page, 500 ms, one appeal item, "What is this for?" with the purpose and distractors from the generator, first click toward the first goal | yes |
| `goals[].scenario` | goal plus fixture names, linted; pinned by `scenario` after review | yes |
| `goals[].shape` | goal-only, happy-path, steps, or time-boxed, from what the author wrote | no |
| `goals[].tasks[]` | the steps, when the goal has them, each with its wording and optional check | wording only, one at a time |
| `goals[].happyPath`, `goals[].answer`, `goals[].outcome` | the inputs | no |
| `goals[].timeout` | happy-path or step count × 90 seconds, minimum 3 minutes | yes |
| `goals[].questions` | SEQ (7-point ease), confidence (7-point) | yes |
| `questions` | UX-Lite, two items, usefulness and ease | yes |
| `sample` | n, derived (below) | no |
| `sentenceRule` | derived (below) | no |
| `consent`, `instructions` | standing text with recording level, incentive and purposes filled in | yes |

## The ladder the report reads

The report is organised bottom up, after Walter's hierarchy of user needs and the ISO 9241-11 definition of usability. Each rung only matters if the one below holds.

| Rung | Measures | Standard |
| --- | --- | --- |
| Functional, reliable | the author's own tests; not measured here | |
| Usable | **effectiveness**: the verified outcome; **efficiency**: time on goal and deviation from the happy path; **satisfaction**: SEQ, confidence, UX-Lite; all for the specified users in the recorded environment | ISO 9241-11 3.1.1: effectiveness, efficiency and satisfaction for specified users and goals in a specified context of use |
| Desirable | **fit**: the three screener questions scored per participant, and the usefulness item of UX-Lite reported on its own | Lean Customer Development's problem hypothesis and earlyvangelist screen; Lean Analytics' problem-interview scoring; UX-Lite descends from the Technology Acceptance Model |
| Pleasurable | **appeal**: the impression stage's item and the positive words in the trace; measured, not designed | Walter's top tier; Lindgaard's 500 ms |

A finding is reported at the level it belongs to: the UI (issues), the goal (people reached a different end state, or completed the steps and said "why would I"), or the context (the fit questions find few who have the purpose, the impression stage finds few who recognise it, usefulness is low while completion is high, give-ups say "I don't need this" rather than "I can't find it"). The report shows what people did and said at that level, lists the alternative explanations beside it, and offers the cheapest next check. It never says the product has no market.

## The impression stage

On by default, derived entirely from the context, for the question an outcome hook cannot answer: do these users recognise the purpose in the page. The page may be any public URL, including a README on GitHub, because the flash is a screenshot and the stage needs no recorder; only the first click requires the author's own site. In order: a fixation point, the first goal's starting page flashed for 500 ms, one appeal item on a 1 to 9 scale, "What is this for?" with the context's purpose among generated distractors, then the real page for a first click toward the first goal. It runs on the same participants as the goals, takes under a minute, and needs no fixture. `impression: false` on the context turns it off.

What it reports, and what it may say, follows [`../discovery/impression-research.md`](../discovery/impression-research.md):

- **Recognition:** how many of n chose the purpose. It says whether the headline and hero carry the purpose, nothing deeper.
- **Appeal:** the distribution. It is reliable at 500 ms and predicts the attitude participants bring into the goal through a halo; it is reported as a covariate beside the issues and never as an outcome.
- **First click:** how many of n clicked on the happy path. On a live page this predicts goal success weakly (about 78% versus 70% in the replication), strongly only when the goal is pure findability; the report says which.

The stage never enters a goal's counts or the sentence. The report quotes these limits beside the result.

## Fit, before anyone tries a goal

Three screener questions derived from the purpose, asked of everyone who arrives, before any goal: when did you last need to [purpose]; how do you do it today; how much does it matter to you. Scored per participant after Lean Analytics' problem-interview weights for recency, active solving and importance. The report opens with the sample's fit: "Of 20 screened, 3 had done this in the last month; 2 of them use a spreadsheet." A sample with little fit is a context-level finding before any goal is attempted, and the cheapest one to get. The incumbent solutions, in the participants' words, are the first competitors.

## Participant flow

Consent → screener with the fit questions → one practice screen → impression stage unless turned off → for each goal: scenario card, target opens top-level with a floating taskbar, participant presses done or can't do it (a goal with steps shows them one at a time, each with its own done), SEQ and confidence → UX-Lite → completion code or thank-you. Goals run in the declared order; when the context sets `independent: true`, order is randomised; either way the order is recorded per participant. Every screen works with a keyboard and a screen reader; the taskbar never covers the target's primary content. All of it is white-labelled: the author's name and theme, no ui-tests branding unless the author opts in (see [`06-nonfunctional.md`](06-nonfunctional.md)).

Time on goal starts when the scenario card is dismissed and the target is ready, and ends at done, can't do it, timeout, or close. Questions are outside the timer. The participant may ask for more time once without penalty.

## Measures, always collected

| Measure | Definition |
| --- | --- |
| Verified outcome | the goal's `outcome` result: `correct`, `incorrect`, `unknown`, with the assertion diff; per-task checks reported beside it |
| Terminal reason | done, gave up, timeout, withdrew, disconnected |
| Self-reported completion | the participant's own claim, recorded beside the verified outcome |
| Time on goal | reported separately for verified completions and for all attempts, as medians; no geometric mean |
| Path | URL and semantic events; every path taken is recorded; compared with the happy path when the goal has one, and deviations feed the issues |
| SEQ, confidence | per goal, reported as distributions; a confident failure is flagged as a disaster |
| UX-Lite | per context, each item transformed `(response − 1) × 25`; the usefulness item reported on its own as the adoption signal, then averaged; wording version pinned |
| Environment | usual browser, device and assistive technology from the screener; accommodation is never a quality flag |
| Quality flags | speeder under half the median, failed attention item; flagged, never auto-excluded. A duplicate device or IP across runs of the same project is the one exception: excluded from n and still paid |

Screen recording, when `record: 'screen'`, attaches to the attempt and raises the incentive multiplier. Event replay is always available.

## Sample size

No modes. A goal with an outcome carries one of two legible intents, and n follows. A goal without an outcome has no n; it yields issues and paths from however many came.

**Catch problems.** Default `catch: { affecting: '1 in 3', confidence: 0.85 }`. With p the occurrence and c the confidence, n is the smallest integer with 1 − (1 − p)^n ≥ c. One in three at 85% gives 5. One in ten at 85% gives 19. The trace shows the sentence: "Five people give an 87% chance of seeing any problem that hits at least one person in three."

**Estimate a rate.** `estimate: { within: 0.10, confidence: 0.90, target: 0.80 }`. n is planned from the adjusted-Wald interval at the worst case p = 0.5, about 65 for ±10 points at 90%. `target` has no default; the trace shows the published average unmoderated completion rate, 78%, with its source and year, as a reference the author may adopt. The plan states the power to detect a rate 10 points below target at the planned n.

Both intents are per goal. The context recruits the maximum and reuses participants across goals; only the `primary` goal carries the context's result.

## What the numbers may say

Attempts count toward n only when the participant passed the screener and reached the goal. Product failure after exposure is an outcome, never a reason to replace a participant. The author's own rehearsal attempts never count.

**Catch** reports problems, never a pass. With f verified incorrect and u unknown among n attempts:

```
problems found:       f >= 1, each listed as an issue
none found at this n: f = 0 and u = 0, with the detection chance stated
inconclusive:         u > 0, or fewer than n attempts at the deadline
```

The sentence for "none found" is: "Five people gave an 87% chance of seeing any problem that hits one in three; none was seen. That is not a completion rate." The sentence for problems found counts people: "2 of 5 could not find X." Each issue is reported regardless of how many hit it. The sentence names the question the goal asked: "reached the outcome by their own route" for a goal-only or happy-path goal, "completed the steps" for a goal with tasks; the two are never compared as if they measured the same thing.

**Estimate** uses the adjusted-Wald interval on verified completion at the stated confidence, and the verdict must survive every assignment of unknown outcomes:

```
pass:          lower bound >= target with unknowns counted as incorrect
fail:          upper bound < target with unknowns counted as correct
inconclusive:  otherwise, or fewer than n attempts at the deadline
```

**Context.** The `primary` goal's result is the context's result. Other goals are reported beside it, never combined.

Unknown outcomes are never rounded. A run whose hooks returned unknown for most attempts is reported as an instrumentation problem, not a product result.

## Issues

The counts say how many got through. Issues say what stopped the rest, which is what the author actually wants to see. They are derived from signals the trace already holds; nothing extra is asked of the participant.

**Per attempt:**

| Signal | Source | Suggests |
| --- | --- | --- |
| Deviation from the happy path (when the goal has one), backtrack to an earlier page | URL and semantic events | Lost, or the path is not where the author expected |
| Dead click, repeated click on the same target | events | Thought it was interactive, or nothing happened |
| Pause over a threshold with no input | events | Reading, searching, or stuck |
| Gave up, timed out | terminal reason | Blocked |
| Said done but the outcome says incorrect | outcome and claim | Wrong mental model; a disaster when confidence is also high |
| SEQ of 3 or below, free-text comment | questions | The person's own account of the trouble |
| Recording segment, when opted in | recording | The clip |

**Across attempts:** signals are clustered by location (page, element, step) into issue candidates. An issue carries the participants who hit it as a count of n, never a percentage at small n; the worst impact seen (blocked, slowed, confused); the participants' words; the access conditions of those who hit it; and a trace link to each moment. A participant who hit a problem and recovered within the attempt is tagged recovered, so novelty is visible. Issues are ranked by impact then frequency, and the report names the three most serious per goal and says so, following Krug's rule that finite effort goes to the worst problems first. The rest stay in the list.

**Model assistance, bounded:** a model may propose issue labels and merge candidates, within the purposes the participants consented to. The automated list is labelled "found from traces" because detection recall is partial (Fan 2020, Reca11), a reviewer can add, split or merge as a revision, and the counts never depend on the issue list. Agreement between a model and a reviewer is not ground truth.

## The trace

One record per run, viewable in the browser like a Playwright trace behind the author's session or a signed link, and exported as JSON:

- the compiled context with every derived field and its source rule
- the scenario text shown, with any edit and who made it
- per attempt: events, URL path, end-state snapshot, hook result and diff, terminal reason, timings, questions, access conditions, quality flags, consented purposes, and recording if any
- a highlight reel per attempt: the moments the issue signals fired, playable as an event replay, with the participant's words beside them
- the issue list for the run, ranked
- the fit of the sample and the impression results, as the report's opening
- measures named by the standard: effectiveness, efficiency, satisfaction; then fit and appeal
- recruitment: per source, invited, screened, started, finished, paid, with time stamps
- money: estimate, reserved, paid, trued up, in minor units
- the sentence

A shareable report page renders the issues, the sentence and the moments for a reader without a login, through a signed link the author creates.

## Revisions

Five things can change after a run and each creates a revision on the record rather than editing it: excluding an attempt with a reason, which keeps the participant paid; adjusting an incentive; editing or merging issues; pinning or editing scenario wording for the next run; and promoting a path participants took to a goal's `happyPath` for the next run. The original stays. A withdrawal removes recordings and marks the attempt withdrawn; the report then says its reproducibility is reduced.
