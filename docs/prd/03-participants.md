# Participants

## Sources

| Source | How | Where |
| --- | --- | --- |
| `link` | the run issues invite links; the author shares them; participants need nothing installed | runner and hosted |
| `prolific` | Prolific API with the author's token: create, publish, read submissions, approve, bonus; completion codes and webhooks deduplicated by event id | runner and hosted |
| `connect` | CloudResearch Connect API with the author's key; polling, idempotency token on every mutation | runner and hosted |
| `intercept` | the site's own visitors, invited when a page has given them trouble twice; see below | hosted |
| partner panels | Respondent, User Interviews, Cint, Dynata need partner agreements; manual handoff | planned omission |

A source adapter declares: audience translation, estimate, publish, pause, stop, submissions, approve, reject, bonus, and how completion is signalled. The runner owns participant ids; native ids stay in the adapter's table.

## Intercept: recruiting from the website itself

On the hosted track, the same snippet that records attempts watches for the trouble the attempt view shows (a dead click, a rage click, a U-turn, a long pause) while a visitor uses the live site. The detectors: mouse lethargy (distance more than 30% longer or speed more than 17% slower than the visitor's own earlier actions), pogo-sticking (A-B-A page history), dead clicks, rage clicks, long pauses, backtracks. These detectors are one implementation shared with the issue signals. When a second signal fires on the same page, and the author has not marked that page sensitive, the visitor sees the invitation in the participant chrome (the inverse of the host page, with the author's accent), word for word: "This page seems to be giving you trouble. Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you." with "Sure" and "No thanks". The same string is in the player (`invitation` in `packages/ui-tests/src/next.tsx`) and the demo app. Nothing from before acceptance is kept. On acceptance the player opens in companion mode on the live site with a task derived from the page's declared happy path, consent, the questions and the incentive. A no is not asked again that visit. The invitation never fires on checkout, payment or a form in progress, nor on any page the author marks. Intercept participants are paid at the formula rate like the paid panel, from a cap per day the author sets. The design and its evidence are in [`../discovery/intercept-recruiting.md`](../discovery/intercept-recruiting.md).

Intercept participants are a biased sample by construction: people who struggled and said yes. The report labels the source, keeps them out of a `catch` or `estimate` count unless the author opted in, and reports them as issues found. The detector's research basis is a weak signal (Hibbeln et al., MIS Quarterly 2017: 81.7% accuracy in a lab manipulation, R² 0.17 in the field) and is treated as a trigger for an invitation, never as evidence of a problem by itself. Mouse detectors do not run on touch devices.

## Router

Fan-out across configured sources is a budgeted bandit; with the paid panel on, the run spreads invitations across Prolific and CloudResearch Connect under the cap and labels each attempt with the one it came from: each source is an arm, reward is verified attempts within the deadline at the formula rate, the budget cap is the knapsack. Pay is not a dimension the bandit can move; it chooses where to invite, never how much to offer. Explore-first across all configured sources, then allocate to the arm with the best observed fill. Pause an arm when the cap would be exceeded; stop all arms at n. Cross-source duplicates are detected by a device and IP hash, scoped to the project and never exported, plus declared prior participation in the screener; duplicates are excluded from n and still paid.

## Incentive formula

```
incentive = max(platformMinimum,
                shortStudyFloor × minutes            // under 10 minutes
                minutes/60 × wageBase × roleMultiplier × recordingMultiplier)
```

| Term | Default | Source |
| --- | --- | --- |
| `wageBase` | max(local minimum wage, $12/hour) | Prolific's recommended rate; Silberman 2018 minimum-wage floor; Ritchey 2023 halves dropout near twice minimum wage |
| `roleMultiplier` | consumer 1.0, professional 1.5, specialist 2.0, derived from the audience sentence | User Interviews B2B versus B2C deltas; Respondent's twice-hourly-rate rule |
| `recordingMultiplier` | events 1.0, screen recording 1.5 | Prolific guidance to pay more for recordings; UserTesting rates |
| `minutes` | rehearsal median × 1.25 + 2, or before rehearsal, 1.5 per happy-path step + 2 | MeasuringU task-length distributions |
| short-study floor | $1.50 per minute under 10 minutes | User Interviews short-study guidance |

The formula sets a **floor**, not a target. Pay can be raised by the author, by the raise rule, or by the true-up; nothing in the product ever lowers it below the formula, and no optimisation, including the router, is allowed to treat lower pay as a lever. The evidence points one way: paying near twice minimum wage roughly halved attrition on Prolific (Ritchey et al. 2023), unmoderated no-shows fall from about 30% to under 10% as rates rise (User Interviews), and underpaid participants rush (hn_1783588). Cheap participants are slower, fewer and worse, so a lowballing algorithm would defeat the run it was saving money on. The one exception is `link`: participants the author brings are the author's own relationship, and the author may set any amount for them, including none, with the formula's figure shown beside the field.

Worked default: a five-minute run pays $7.50 a person from the short-study floor; with Prolific's 42.8% fee and the screener's paid screen-out slots the paid panel starts at $12 a person, so five people cost from $60, and the example cap of $70 holds them with $10 back when nothing is raised. Raise rule: if fewer than half of n have arrived at half the deadline, raise by 25% for new invitations, once. True-up: after the run, if the median actual time pushes the effective hourly rate below `wageBase`, pay the difference as a bonus. The cap includes a reserve for the raise and the true-up, so neither can breach it. The raise only touches invitations not yet filled, at most half of n, so on five people from $60 the reserve is about $10 and the example cap is $70; `ui-tests estimate` shows the reserve for any n. A run that cannot fit n under the cap says so and does not start. Everything is a line item in the trace.

Pay follows participation, not success. A failed task, a broken hook, or a disagreement with the report never withholds pay. Exclusion from n, whether for audience mismatch, duplication or a quality flag, never withholds pay either. Rejection on a platform is only for a failed attention item plus a speeder flag together, and follows the platform's own rules.

## Consent and purposes

Standing text generated per run: who is running the study, what is recorded at the chosen level, how long it takes, what is paid, that the participant may stop at any time and still be paid for completed goals, and where to ask questions. The consent names the purposes: analysis by the author, model-assisted analysis of the trace, and, only if the author enables it, sharing the record with an automated workflow. Each attempt in the record carries the purposes consented to and the source's own restrictions; a consumer must check them before reading words or recordings. The author sees the consent in the trace and may not remove the pay, withdrawal or purpose sentences.

## Quality and audience

An attention item once per run, a speeder flag at under half the median goal time, the device and IP hash, and the screener. It is a known-gameable gate and the trace says so.

The screener is derived from the context's `users` object ([`01-dx-contract.md`](01-dx-contract.md), [`screener-research.md`](../discovery/screener-research.md)), in funnel order: panel filters first and never asked (`where`, `language`, `age`, prior participation); the recency gate from `did` and `within`, in plain bands widening from the window ("In the past week", "In the past month", "Earlier this year", "I haven't"); the frequency question from `often`; the role asked broad, then narrow; the `uses` multi-select with a neutral tool and "None of these"; the `not` exclusions mixed among neutral options, always with the standing exclusion of people who work in UX, design, marketing or market research; then the three fit questions from the purpose. Every option carries an accept, reject or may-select label, and every question the field and the rule it came from; the participant sees one question per screen, the words and choices only, nothing preselected. When `users` is the sentence alone, the compiler drafts the facts from it and marks each field inferred; lint prints the draft to paste in, and the trace shows the derived table so a wrong inference is a one-line edit.

Per source: on Prolific, `where`, `language` and `age` map to its filters and the behavioural questions run as custom screening with paid screen-out slots, a budget line in the trace; on Connect, criteria it profiles map to its demographic targeting and the rest need a paid prescreen project, which the trace estimates; on `link`, the questions are asked before consent and nothing is filtered. After the fact, the author can exclude a participant as "not my audience" with one click; the exclusion is a revision, the participant stays paid, and the count of such exclusions is reported.

## Environment

The screener records usual browser, device and assistive technology, the ISO environment of the context of use. Accommodation and a participant's own assistive technology are never quality flags; task-solving help is recorded separately as assistance. Issues report the access conditions of the participants who hit them, so a failure under a screen reader is visible as such and never averaged away.

## Data

Participant identity lives only in the adapter's table and is never exported. The trace exports attempts by runner id. Recordings are stored under the author's own storage adapter with a retention default of 90 days. A participant may withdraw; withdrawal removes recordings, marks the attempt withdrawn without changing n for a completed result, and the report says its reproducibility is reduced.
