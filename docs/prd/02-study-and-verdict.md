# Context, measures, and what the numbers may say

## What a test compiles to

`ui-tests lint` and every run compile a context into a JSON record. The compiled context is stored with the run, so a later edit to the test file never changes a past run. The player receives only what a participant needs; happy paths, expected answers and hooks stay with the runner.

| Compiled field | From | Goes to the player |
| --- | --- | --- |
| `users`, `purpose`, `environment` | the context's inputs; `users` as a sentence or as the object `{ are, did, within, … }` | no; the purpose is never shown as an answer or a hint, and reaches the participant only through the scenario card's situation sentence |
| `screener` | the `users` object, or a draft inferred from the `users` sentence; panel filters where available; the three fit questions derived from the purpose: six questions for the Weekboard example, three from `users` and three from `purpose` | the questions, one per screen with nothing preselected; never the labels, fields or rules |
| `impression` | derived: `firstLook.page`, else the first goal's start when it is public, off when the start comes from `setup` behind a sign-in; 500 ms, the open question "What was that page for?", first click toward the first goal; the answers coded against the purpose | the page and the open question; not the purpose or the codes |
| `goals[].start` | the goal's `start`; default the first page of `happyPath`, else the target's root | yes |
| `goals[].scenario` | the situation from `users.are` and `purpose`, the action from the goal's name, the data from `beforeEach`, linted; pinned by `scenario` after review | yes |
| `goals[].shape` | goal-only, happy-path, steps, or time-boxed, from what the author wrote | no |
| `goals[].tasks[]` | the steps, when the goal has them, each with its wording and optional check | wording only, one at a time |
| `goals[].happyPath`, `goals[].answer`, `goals[].outcome` | the inputs | no |
| `goals[].timeout` | `timeLimit`, else happy-path or step count × 90 seconds, minimum 3 minutes; silent, never shown as a countdown | yes, to end the attempt; never displayed |
| `goals[].questions` | SEQ (7-point ease), confidence (7-point) | yes |
| `questions` | UX-Lite, two items, usefulness and ease | yes |
| `sample` | n, derived (below) | no |
| `sentenceRule` | derived (below) | no |
| `consent`, `instructions` | standing text with the recording level (event replay always, screen video when `record: 'video'`), the payout line (the amount, or that a `link` run is unpaid; [`03-participants.md`](03-participants.md#the-payout-line)) and purposes filled in | yes |

## The ladder the report reads

The report is organised bottom up, after Walter's hierarchy of user needs and the ISO 9241-11 definition of usability. Each rung only matters if the one below holds.

| Rung | Measures | Standard |
| --- | --- | --- |
| Functional, reliable | the author's own tests; not measured here | |
| Usable | **effectiveness**: the verified outcome; **efficiency**: time on goal and deviation from the happy path; **satisfaction**: SEQ, confidence, UX-Lite; all for the specified users in the recorded environment | ISO 9241-11 3.1.1: effectiveness, efficiency and satisfaction for specified users and goals in a specified context of use |
| Desirable | **fit**: the three screener questions scored per participant, and the usefulness item of UX-Lite reported on its own | Lean Customer Development's problem hypothesis and earlyvangelist screen; Lean Analytics' problem-interview scoring; UX-Lite descends from the Technology Acceptance Model |
| Pleasurable | **appeal**: the positive words in the trace; measured, not designed, and never asked as a rating | Walter's top tier |

A finding is reported at the level it belongs to: the UI (issues), the goal (people reached a different end state, or completed the steps and said "why would I"), or the context (the fit questions find few who have the purpose, the impression stage finds few who recognise it, usefulness is low while completion is high, give-ups say "I don't need this" rather than "I can't find it"). The report shows what people did and said at that level, lists the alternative explanations beside it, and offers the cheapest next check. It never says the product has no market.

## The impression stage

On for public pages, derived entirely from the context, for the question an outcome hook cannot answer: do these users recognise the purpose in the page. The page is the first goal's start when that page is public, and the stage is off when the start is behind a sign-in, as when `setup` returns it, unless `firstLook: { page }` names a public page where the purpose lives; it may be any public URL, including a README on GitHub, because the flash is a screenshot and the stage needs no recorder; only the first click requires the author's own site. In order: a fixation point, the page flashed for 500 ms, then one open question, "What was that page for?", answered by typing or talking, then the real page for a first click toward the first goal. There are no distractors, and the purpose is never shown in the stage, neither as an option nor as a hint; the consent does not show it either. It runs on the same participants as the goals, takes under a minute, and needs no fixture. `firstLook: false` turns it off. No rating is asked: the stage measures recognition and the first click, not appeal.

Each answer is coded against the context's `purpose`: the configured model proposes the code, or a deterministic word-overlap rule does when no model is configured, and the code is labelled "named the purpose", "did not name it" or "no answer". Every code sits in the trace beside the person's words, where the author can re-read and change it as a revision.

What it reports, and what it may say, follows [`../discovery/impression-research.md`](../discovery/impression-research.md):

- **Recognition:** how many of n named the purpose, with their words. It says whether the headline and hero carry the purpose, nothing deeper.
- **First click:** how many of n clicked on the happy path. On a live page this predicts goal success weakly (about 78% versus 70% in the replication), strongly only when the goal is pure findability; the report says which.

The stage never enters a goal's counts or the sentence. Its denominator is the participants who completed the impression stage, which can exceed a goal's n when someone disconnects before attempting a goal; the report states both numbers. The report quotes these limits beside the result.

## Fit, before anyone tries a goal

Three screener questions derived from the purpose, asked of everyone who arrives, before any goal: when did you last need to [purpose]; how do you do it today; how much does it matter to you. Scored per participant after Lean Analytics' problem-interview weights for recency, active solving and importance. The report opens with the sample's fit: "Of 20 screened, 3 had done this in the last month; 2 of them use a spreadsheet." A sample with little fit is a context-level finding before any goal is attempted, and the cheapest one to get. The incumbent solutions, in the participants' words, are the first competitors.

## Participant flow

Consent → screener, one question per screen, with the fit questions → one practice screen → impression stage unless turned off → for each goal: scenario card ending in "Start task", the target opens top-level at the goal's start with the bar (one small pill in a corner, draggable, that hides while they type in the page; its summary is the goal's name, pressed to reread the card; with `record: 'video'` a red dot, the time and a pause; no countdown and no microphone during the task), the participant presses Done (confirmed in place: "Finished this task?") or "I couldn't do this" (a goal with steps shows them one at a time, each with its own done), then "Overall, how difficult or easy did you find this task?" and, at 4 or below, "What made it difficult?", with confidence only when the outcome cannot be verified → once after all goals, "Would {product} be useful to you?", "{product} is easy to use." and "Anything you want to tell {product}?" → completion code or thank-you. Every question is one per screen with nothing preselected. The person ends the task: there is no completion screen and no auto-advance when the end state is reached, because ending the task then would hide what happens after it and reveal the success condition. Goals run in the declared order; when the context sets `independent: true`, order is randomised; either way the order is recorded per participant. Every screen works with a keyboard and a screen reader; the taskbar never covers the target's primary content. All of it is white-labelled: the author's name and theme, no ui-tests branding unless the author opts in (see [`06-nonfunctional.md`](06-nonfunctional.md)).

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

Event replay (what the person does on the page: clicks, typing without its values, pages) is always recorded. Screen video, when the study sets `record: 'video'`, needs the browser's prompt, attaches to the attempt and applies the 1.5× recording multiplier to the incentive's hourly term ([`03-participants.md`](03-participants.md)). Voice and camera are always the person's choice, the camera off unless they turn it on in the consent; neither is an author field.

## Sample size

No modes, and one intent: catch problems. A goal without an outcome has no n; it yields issues and paths from however many came.

`sample: { affecting: 1 / 3, confidence: 0.85 }` on the study sets how many people take the whole study; leave it out and that is the default. With p the occurrence and c the confidence, n is the smallest integer with 1 − (1 − p)^n ≥ c. One in three at 85% gives 5. One in ten at 85% gives 19. The trace shows the sentence: "Five people give an 87% chance of seeing any problem that hits at least one person in three." From the paid panel, five people cost from $60, under a cap the author sets before it starts.

There is no rate to estimate and no target to pass: five people find problems; they do not certify a rate. The same people attempt every goal in the study; only the `primary` goal carries the study's result.

## What the numbers may say

Attempts count toward n only when the participant passed the screener and reached the goal. Product failure after exposure is an outcome, never a reason to replace a participant. The author's own rehearsal attempts never count.

A run reports problems, never a pass or a score. With f verified incorrect and u unknown among n attempts:

```
problems found:       f >= 1, each listed as an issue
none found at this n: f = 0 and u = 0, with the detection chance stated
inconclusive:         u > 0, or fewer than n attempts at the deadline
```

The sentence for "none found" is: "Five people gave an 87% chance of seeing any problem that hits one in three; none was seen. That is not a completion rate." The sentence for problems found counts people: "2 of 5 could not find X." Each issue is reported regardless of how many hit it. The sentence names the question the goal asked: "reached the outcome by their own route" for a goal-only or happy-path goal, "completed the steps" for a goal with tasks; the two are never compared as if they measured the same thing.

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
| Screen video segment, when `record: 'video'` | recording | The clip |

**Across attempts:** signals are clustered by location (page, element, step) into issue candidates. An issue carries the participants who hit it as a count of n, never a percentage at small n; the worst impact seen (blocked, slowed, confused); the participants' words; the access conditions of those who hit it; a trace link to each moment, the first one the moment to watch; and a suggested change, the smallest change to the design that would have fixed it. A participant who hit a problem and recovered within the attempt is tagged recovered, so novelty is visible. Issues are ranked by impact then frequency, and the report names the three most serious per goal and says so, following Krug's rule that finite effort goes to the worst problems first. The rest stay in the list.

**Model assistance, bounded:** a model may propose issue labels, merge candidates and the suggested change, within the purposes the participants consented to. The automated list is labelled "found from traces" because detection recall is partial (Fan 2020, Reca11), a reviewer can add, split or merge as a revision, and the counts never depend on the issue list. Agreement between a model and a reviewer is not ground truth.

## The trace

One record per run, viewable in the browser like a Playwright trace behind the author's session or a signed link, and exported as JSON:

- the compiled context with every derived field and its source rule
- the scenario text shown, with any edit and who made it
- per attempt: events, URL path, end-state snapshot, hook result and diff, terminal reason, timings, questions, access conditions, quality flags, consented purposes, and recording if any
- a highlight reel per attempt: the moments the issue signals fired, playable as an event replay, with the participant's words beside them
- the issue list for the run, ranked
- the fit of the sample and the impression results, as the report's opening
- measures named by the standard: effectiveness, efficiency, satisfaction; then fit
- recruitment: per source, invited, screened, started, finished, paid, with time stamps
- money: estimate, reserved, paid, trued up, in minor units
- the sentence

## The report

The report is the list at `/r/<run>`: the result line, then one card per problem, ranked by impact and then by how many people hit it, each with where it is (the page and the element), who hit it, their words, the moments as play chips and the suggested change; what worked is the last card. Under the cards are the people, each linking to their attempt at `/r/<run>/p<n>`, the attempt view, where everything about one person stays. The pull-request check's links open a card at its moment.

A reader without a login sees the same report through a share link the author creates with `ui-tests report --share`: the path signed with an HMAC under `UI_TESTS_SHARE_SECRET`, white-labelled, its people linking to signed attempts. Without the secret there are no share links, and an unsigned or altered link is not found.

The landing page shows no report. It shows the replay: an illustration of one person's minute as a rail, with the moments that got in the way as stops and one moment as a card, and nothing to press. It promises nothing interactive about the report; the report's behaviour is described here and nowhere on the landing.

## Revisions

Five things can change after a run and each creates a revision on the record rather than editing it: excluding an attempt with a reason, which keeps the participant paid; adjusting an incentive; editing or merging issues; pinning or editing scenario wording for the next run; and promoting a path participants took to a goal's `happyPath` for the next run. The original stays. A withdrawal removes recordings and marks the attempt withdrawn; the report then says its reproducibility is reduced.
