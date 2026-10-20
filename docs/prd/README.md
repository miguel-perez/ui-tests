# ui-tests PRD

**Status, 20 October 2026:** the R0 to R2 slices are built and verified offline: the `ui-tests` package, the landing page, and the player, collector and report in server mode; see the status lines in [`../story-map.md`](../story-map.md) for what is built, what is documented but not executed (npm publish, a Neon database, the Vercel Preview environment, GitHub secrets, a model API key, a named tunnel, the VoiceOver check) and what the release metrics still need. Paying a panel (R3) and `ui-tests host` ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) are not built. "Not shipped yet" below means not built.

Built on [`../pitch.md`](../pitch.md), [`../stack.md`](../stack.md), [`../personas.md`](../personas.md). Each file owns one area. Release order lives in [`../story-map.md`](../story-map.md).

| File | Owns |
| --- | --- |
| [`01-dx-contract.md`](01-dx-contract.md) | What a developer types and what is derived; config, test file, CLI, reporters, CI, lint |
| [`02-study-and-verdict.md`](02-study-and-verdict.md) | What a context compiles to; the ladder the report reads; the impression stage; fit; participant flow; measures in the standard's terms; sample size; what the numbers may say; issues; the trace |
| [`03-participants.md`](03-participants.md) | Sources including intercept; router; incentive formula; budget; the payout line; consent and purposes; quality; payment; access conditions |
| [`04-agent-studies.md`](04-agent-studies.md) | The agent actor: targets, harnesses, measures, separation from human studies |
| [`05-integration.md`](05-integration.md) | Where things run and where the record lives; the run handle; idempotency; JSON contracts; GitHub; the author's deploy (`ui-tests host`); DAG and GEPA consumers |
| [`06-nonfunctional.md`](06-nonfunctional.md) | Privacy, security, money, accessibility, licensing |

## Problem

Unit and end-to-end tests prove the code works, not that people can use it. Usability testing needs a research skill set plus a platform or a managed study, so teams without a researcher skip it or post on a forum instead.

## Goals

1. A developer with no research background gets from install to a first result on their own preview URL in one afternoon.
2. A test is who the users are, what they are trying to do, a goal, and an `outcome`, with a happy path if you have one and steps when the route is the requirement. Everything else is derived and visible, including the impression stage and the fit questions.
3. Every run surfaces the problems that stopped people, ranked, in their words, with the moment to watch and the smallest change that would fix each, and reports the rung above usable: fit and recognition of the purpose. A run reports the problems it found, or that it found none this time; there is no score and no pass.
4. The numbers come with a sentence that says what they can and cannot support. Five people find problems; they do not certify a rate.
5. Participants are real people treated fairly, or agents clearly labelled as agents. The two never mix.
6. Output is a durable JSON record a DAG, a factory, or GEPA can consume without reading a dashboard, with the purposes participants consented to attached.
7. One person with a personal email can use it, with no seats, no contract and no approval from anyone.

## Non-goals

Figma prototypes, mobile native, moderated sessions, comparisons between builds, synthetic users as stand-ins for people, think-aloud recording, GEPA itself, any framework adapter other than Next.js.

## Personas

See [`../personas.md`](../personas.md). The author is persona 1; persona 2 is served by the impression stage, issues and intercept recruiting; persona 3 by `ui-tests host`, the one-command deploy to their own account, once it ships (not shipped yet: [#59](https://github.com/miguel-perez/ui-tests/issues/59)).

## Riskiest assumptions

Which slice tests each one is in [`../story-map.md`](../story-map.md).

| Assumption | How it is tested |
| --- | --- |
| The contract is enough to produce a credible run | The generated scenario, fit questions, impression stage and sentence for our own landing context read correctly to the author |
| A developer understands the promise from the site alone | The landing context's impression stage and goal, with the author and with five people from our audience |
| Derived defaults do not need overriding in practice | Overrides per context are counted; a default overridden in most contexts becomes an input |
| Humans fit a pull request's timescale | If nobody waits for the check, it becomes a nightly job and the product survives the finding |
| Participants arrive fast enough through a panel at formula rates | Time to fill and no-show against the raise rule |
| Visitors mid-struggle accept a paid invitation at a useful rate | Acceptance rate of the intercept invitation |

## Success metrics

| Metric | Target |
| --- | --- |
| Install to first result, new author | under one afternoon |
| Overrides of derived fields per context | fewer than one on average |
| Problems surfaced per run that the author acts on | at least one |
| Cost per verified attempt with a panel | from $12 a person, from $60 for five |
| Our site: visitors understand what it is for and start | per the landing context's sentence |

## Glossary

**Context**: the root of a test, after ISO 9241-11's context of use: specified users, a purpose, an environment, and the goals under them; named and identified by its users and purpose. A file may hold several. **Goal**: what a participant is trying to achieve, with a scenario, an optional happy path, optional steps, and usually an `outcome` hook; a goal without one yields issues only. The unit of the count. **Task**: one step inside a goal, shown when the route is the requirement. **Impression**: the derived first stage of a run, the first look: a flash, recognition of the purpose and a first click, before any goal. **Fit**: the screener's three purpose questions, scored, opening the report. **Attempt**: one participant's try at one goal. **Verified outcome**: the goal's `outcome` result, `correct`, `incorrect`, or `unknown`. **Run**: one execution of a context against one build by one actor, human or agent, with a durable handle. **Trace**: everything recorded about a run, viewable and exportable. **Issue**: a problem participants hit, derived from trace signals, with its participants, impact, words and moments. **Sentence**: the plain statement of what a run's numbers support.
