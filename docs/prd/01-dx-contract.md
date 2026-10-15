# DX contract

The criterion for every field: a developer who has written a Playwright test already knows the answer. Anything else is derived, shown in the trace, and editable but never required.

## Inputs

| Input | Where | Why the author knows it |
| --- | --- | --- |
| Users, one plain sentence | `context({ users })` | They know who the product is for |
| Purpose, one verb phrase from the person's side | `context({ purpose })` | They know what people are trying to do, independent of the product |
| Target URL | config `target.url` | Their preview deployment |
| Goal | `goal('give an accountant read-only access', …)` | It is the test name |
| Happy path, if they have one | `happyPath` on a goal: the routes they expect | They designed it |
| Steps, when the route is the requirement | `task('open billing')` inside a goal | They know the procedure |
| Fixture | `beforeEach`-style setup: seeded account, test data | Same as any end-to-end test |
| Outcome | `outcome()` inside a goal, `expect` on end state; optional per-task checks | Same as any end-to-end test |
| Panel keys and a budget cap | config and env | Their accounts, their money |
| Actors a context admits | `actors: ['human']` default; `['human', 'agent']` or `['agent']` | They know who the thing is for |

## Derived

| Derived | From | Visible as |
| --- | --- | --- |
| Scenario wording | goal and fixture names only, never the happy path; written by the configured model through the author's key, or by a deterministic template when no model is configured; linted (no UI terms unless the goal has steps, one outcome, context sentence, user's words), with the rule and its reason beside each change | Editable text in the trace before launch |
| Impression stage | on by default: the first goal's starting page flashed for 500 ms, one appeal item, "What is this for?" with the context's `purpose` as the answer and distractors written by the same generator as the scenario, a first click toward the first goal; `impression: false` turns it off | Results beside the issues |
| Fit questions in the screener | the `purpose`: when did you last need to do this, how do you do it today, how much does it matter | Shown in the trace; the fit of the sample opens the report |
| Sample size | `catch: { affecting: '1 in 3', confidence: 0.85 }` default on the goal, or an `estimate` target | The sentence, not the number |
| The sentence | the same inputs and the observed counts | In the report and the check |
| Goal timeout | happy-path or step count × 90 seconds, 3-minute floor; the participant may ask for more time once | Overridable |
| Questions | SEQ and confidence per goal, UX-Lite at the end with usefulness reported on its own | Always collected, reported as context |
| Screener | the `users` sentence, one behavioural question, panel filters where the source has them, the three fit questions and the three persona-placement questions | Shown in the trace with the reason |
| Incentive | estimated minutes, wage floor, role and recording multipliers, raise rule, true-up reserve; a floor the author can raise and nothing can lower, except for `link` participants | Line item against the budget |
| Panel routing | bandit over configured panels under the cap | Per-panel counts |
| Consent, instructions, attention and speeder flags, repeat exclusion | standing defaults | Flags recorded, nothing deleted |
| Recording level | events always, replayable; screen recording opt-in | `record: 'screen'` |
| Environment | device, browser, assistive technology, locale recorded from the screener; `environment` on the context narrows who is invited | Overridable |
| Deadline, language | 48 hours, the site's language | Overridable |

Not inputs: the participant's own "I did it" and their explanation. Both are recorded as data next to the outcome.

## Config

```ts
// ui-tests.config.ts
import { defineConfig } from 'ui-tests'

export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  participants: {
    sources: ['link', 'prolific'],              // fan-out order; 'link' is always available
    prolific: { token: process.env.PROLIFIC_TOKEN },
    budget: { max: 80, currency: 'USD' },       // hard cap per run, includes the 25% reserve for raise and true-up
  },
  ci: { blocking: false, on: ['label:ui-test', 'main'] },   // per-context `blocking` overrides this default
  reporters: ['default', 'github-actions', 'json'],
})
```

Discovery order mirrors Vitest: `ui-tests.config.{ts,mts,js}` first, then `vite.config.*` with a `uiTests` key; no config is valid and runs with defaults against localhost. The init command adds `*.ui.test.ts` to Vitest's exclude list so Vitest never collects it.

The actor is a run parameter, not a file kind. `actor: 'human'` in the config is the default; `ui-tests run --actor agent` runs the same context with an agent harness. A run has exactly one actor; `--actor both` is refused. `target.url` serves both actors; `target.cli`, `target.mcp` and `target.http` serve agents; a human terminal harness is a planned omission, and the lint says so if a context admits humans on them. See [`04-agent-studies.md`](04-agent-studies.md).

## Test file

Mirrors describe/it, with the standard's structure: `context` is the context of use (ISO 9241-11: specified users, goals and tasks, environment), `goal` is what a person tries to achieve, `task` is a step, `outcome` is the goal's hook. RSpec users know `context` as a `describe` alias; it reads the same here. A context has no title: its name in reports is "users, purpose" and its id in the record is derived from the two, so neither is written twice.

```ts
// landing.ui.test.ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'developers who ship UI and have no researcher',
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  goal('start trying ui-tests', { happyPath: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})
```

The impression stage runs before the goal with nothing written: `/` flashed, one appeal item, "What is this for?" answered against the purpose, a first click toward the goal.

**Four shapes of a goal, one primitive.** What you write decides which question a goal asks, and the report names it.

| You write | The participant sees | The question | Measured |
| --- | --- | --- | --- |
| `goal` with `outcome` | the goal in their words, nothing about where to go | can people find their own way to the outcome | outcome, issues from dead clicks, pauses, backtracks, give-ups, words; every path taken is recorded |
| `goal` with `happyPath` and `outcome` | the same wording; the path is never shown | the same, plus whether they take the route you designed | the above plus deviation, lostness and first click |
| `goal` with `task`s and `outcome` | the steps one at a time, each with its own done | can people execute this procedure | step completion, per-task checks, outcome; labelled "execution"; UI terms allowed in steps |
| `goal` with no `outcome`, with `minutes` | a situation and a time box | where people go and get stuck when nobody says what to do | issues and paths only; no count, no sentence; lint warns |

A path participants actually took can be promoted to a goal's `happyPath` after a run, as a revision, so a goal-only run feeds the next run's measurement. "5 of 5 reached the outcome by their own route" and "5 of 5 completed the steps" are different claims and the report never lets one read as the other.

Semantics: `outcome` and per-task checks run in the runner, on the dev machine or in CI, against the end-state snapshot the collector stored when the participant ended the goal with done, give up, timeout, or withdrawal. `page` is a read-only view of that snapshot: URL, DOM, and any app state the fixture exposed. A thrown assertion is `incorrect`; a hook that cannot read its evidence is `unknown`, never `incorrect`. `participant.answer()` asks one validation question with distractors from the generator when the end state is not observable; done and can't are the taskbar's, not calls. `beforeEach` provisions an isolated fixture per attempt and returns names the scenario may use.

Optional context fields: `environment`, `actors`, `target` (overrides the config's target for this context, for example `{ cli: 'npx ui-tests' }`), `impression: false`, `independent: true` (goals are randomised in order), `record: 'screen'`, `blocking`. Optional goal fields: `catch` or `estimate` (human runs), `trials` (agent runs, default 5), `timeout`, `minutes`, `primary` (the goal that carries the context's result when there are several), `scenario` to pin wording after review. A `task` takes an optional check with the same signature as `outcome`, evaluated against the snapshot at that step's done: `task('choose the new plan', async ({ page }) => expect(page.url()).toContain('/plans'))`.

## Lint

Runs on `ui-tests lint`, in dev mode, and before any run. Each rule prints its reason in one line, because the author wants to learn, not only obey.

| Rule | Example | Source |
| --- | --- | --- |
| No interface terms in a goal | "click Members and select Viewer"; allowed inside `task` steps, where the question is execution | NN/g task writing |
| One outcome per goal | "understand what it does and start" is two; split, and let the derived impression stage carry "understand" | MeasuringU task tips |
| Outcome present | a goal with neither `outcome` nor `minutes`; a goal with `minutes` and no `outcome` warns that it yields issues only | this contract |
| Hook not weaker than the goal | URL match for a permission goal, or for "understand" | MeasuringU validation methods |
| Goals independent | an earlier goal reveals a later answer | NN/g |
| One primary goal | several goals with outcomes and no `primary` | this contract |
| Context under 30 minutes | ten goals with long paths | MeasuringU online study time |
| Users and purpose named | `users: 'anyone'`, or a purpose that names the product instead of what the person is trying to do | this contract; Young |
| Actor admitted | `--actor agent` on a context with `actors: ['human']`, or `actors` including `human` on a `target.cli`, `target.mcp` or `target.http` | this contract |

Lint failures block a run and name the fix. Warnings appear in the trace.

## CLI

| Command | Does |
| --- | --- |
| `ui-tests` | Dev mode: opens the player in your browser with you as a rehearsal participant against `target.url`; the outcome runs; the trace renders; the attempt never counts toward n |
| `ui-tests run [--actor human\|agent] [--tunnel]` | Async run of one context for one actor: creates the run with an idempotency key derived from commit, context id and actor, returns a durable handle, exits 0; a repeated key returns the existing run. `--tunnel` serves a local build through a run-scoped tunnel; see [`05-integration.md`](05-integration.md) |
| `ui-tests run --wait` | Same, then polls to completion; exit codes 0 nothing found or estimate passed, 1 problems found or estimate failed, 3 pending or inconclusive, 2 error |
| `ui-tests verify <run>` | Executes the hooks against stored snapshots for attempts not yet verified; CI runs it on the reconciliation schedule |
| `ui-tests status <run>` | Independent states: recruitment, collection, verification, payment |
| `ui-tests report <run>` | Human report, `--json`, or `--share` for a signed public link |
| `ui-tests trace <run>` | Opens the trace viewer |
| `ui-tests lint` | Lint only, no run |
| `ui-tests estimate` | Derived n, minutes, incentive, and cost per source before anything is spent |
| `ui-tests mcp` | Serves the commands above as MCP tools with the same arguments, outputs and guards; see [`05-integration.md`](05-integration.md) |

`--json` keeps stdout for structure and stderr for diagnostics.

## CI

A GitHub Action wraps `ui-tests run` and posts a check named `ui-tests (human)` or `ui-tests (agent)` as pending with the estimate in its summary. The usual arrangement is agent runs on every push, because they are fast and cost only model tokens, and human runs on a label or on merge to main, because those pay people. A scheduled reconciliation workflow runs `ui-tests verify` and updates the check from `ui-tests status` until it completes, the same pattern the factory uses for delivery status. A context's `blocking` makes the check required; the config sets the default. Triggers default to a label or a merge to main; a push never spends money. The Action passes the Vercel protection-bypass token into invite links so participants reach a protected preview.

## Reporters

`default` prints the issues and the sentence. `github-actions` annotates the check. `json` writes the run record described in [`05-integration.md`](05-integration.md). `junit` is a planned omission.
