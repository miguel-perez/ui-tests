# DX contract

The criterion for every field: a developer who has written a Playwright test already knows the answer. Anything else is derived, shown in the trace, and editable but never required.

## Inputs

| Input | Where | Why the author knows it |
| --- | --- | --- |
| Users, one plain sentence, or the sentence and how to check it | `context({ users })`: a string, or an object `{ are, did, within, often, role, uses, not, where, language, age }` with the sentence under `are` and every other field optional (below) | They know who the product is for, what their customers did recently, which tools they use and who they are not; the method is derived |
| Purpose, one verb phrase from the person's side | `context({ purpose })` | They know what people are trying to do, independent of the product |
| Target URL | config `target.url` | Their preview deployment |
| Goal | `goal('give an accountant read-only access', …)` | It is the test name |
| Happy path, if they have one | `happyPath` on a goal: the routes they expect | They designed it |
| Steps, when the route is the requirement | `task('open billing')` inside a goal | They know the procedure |
| Fixture | `beforeEach`-style setup: seeded account, test data | Same as any end-to-end test |
| Outcome | `outcome()` inside a goal, `expect` on end state; optional per-task checks | Same as any end-to-end test |
| Panel keys and a budget cap | config and env | Their accounts, their money |
| Actors a context admits | `actors: ['human']` default; `['human', 'agent']` or `['agent']` | They know who the thing is for |
| Screen video | `context({ video: true })`; nothing written means event replay only | They know whether they want to watch the screen, and that it costs more |
| Where the person lands | `start` on a goal; default the first page of `happyPath`, else the target's root (`/`) | They know where the task begins |
| The page flashed first | `context({ impression })`: on by default, `false` turns it off, `{ page }` names the page; default the first goal's `start` | They know which page should carry the purpose |

## Derived

| Derived | From | Visible as |
| --- | --- | --- |
| Scenario wording | the situation from `users.are` and `purpose`, the action from the goal's name, the data from what `beforeEach` returns; never the happy path, the outcome or the screener; written by the configured model through the author's key, or by a deterministic template when no model is configured; linted (no UI terms unless the goal has steps, one outcome, context sentence, user's words), with the rule and its reason beside each change | Editable text in the trace before launch |
| Impression stage | on by default: `impression.page`, else the first goal's `start`, flashed for 500 ms, one appeal item (1–9), one open question, "What was that page for?", answered by typing or talking, a first click toward the first goal; no distractors, and the `purpose` is never shown in the stage. The answers are coded against the `purpose`, by the configured model or, when no model is configured, by a deterministic word-overlap rule, and labelled "named the purpose", "did not name it" or "no answer"; `impression: false` turns it off | How many named the purpose, with their words, beside the issues; each code reviewable in the trace beside the person's words |
| Fit questions in the screener | the `purpose`: when did you last need to do this, how do you do it today, how much does it matter | Shown in the trace; the fit of the sample opens the report |
| Sample size | `catch: { affecting: '1 in 3', confidence: 0.85 }` default on the goal, or an `estimate` target | The sentence, not the number |
| The sentence | the same inputs and the observed counts | In the report and the check |
| Goal timeout | happy-path or step count × 90 seconds, 3-minute floor; the participant may ask for more time once | Overridable |
| Questions | one per screen: the SEQ after every attempt, give-ups included; "What made it difficult?" when it is 4 or below; confidence only when the outcome cannot be verified by the end state or a validation question; UX-Lite at the end with usefulness reported on its own; the open question last. Every question that takes words also takes voice, with microphone consent asked once ([`participant-overlay-research.md`](../discovery/participant-overlay-research.md)) | Always collected, reported as context; spoken answers keep their audio and transcript with the attempt |
| Screener | the `users` object (below), or a draft inferred from the `users` sentence when it is a string; the three fit questions from the `purpose` as before; one question per screen, nothing preselected | Shown in the trace as an editable table: each question with its options and their accept, reject or may-select labels, the `users` field it came from and the rule; `ui-tests lint` prints an inferred draft as a `users: { are, ... }` object in TypeScript |
| Incentive | estimated minutes, wage floor, role and recording multipliers, raise rule, true-up reserve; a floor the author can raise and nothing can lower, except for `link` participants | Line item against the budget |
| Panel routing | bandit over configured panels under the cap | Per-panel counts |
| Consent, instructions, attention and speeder flags, repeat exclusion | standing defaults | Flags recorded, nothing deleted |
| Recording level | event replay always (what the person does on the page: clicks, typing without its values, pages); `video: true` adds the screen as a video, which needs the browser's prompt and carries the 1.5× incentive multiplier. Voice and camera are never author fields: voice is the person's choice ("Talk instead"), the camera is off | `video: true`; printed in the plan by `ui-tests lint` and the run, and read by the consent list and the attempt's footer |
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
    budget: { max: 70, currency: 'USD' },       // hard cap per run, includes the reserve for the raise and the true-up
  },
  ci: { blocking: false, on: ['label:ui-test', 'main'] },   // per-context `blocking` overrides this default
  reporters: ['default', 'github-actions', 'json'],
})
```

Discovery order mirrors Vitest: `ui-tests.config.{ts,mts,js}` first, then `vite.config.*` with a `uiTests` key; no config is valid and runs with defaults against localhost. The init command adds `*.ui.test.ts` to Vitest's exclude list so Vitest never collects it.

The actor is a run parameter, not a file kind. `actor: 'human'` in the config is the default; `ui-tests run --actor agent` runs the same context with an agent harness. A run has exactly one actor; `--actor both` is refused. `target.url` serves both actors; `target.cli`, `target.mcp` and `target.http` serve agents; a human terminal harness is a planned omission, and the lint says so if a context admits humans on them. See [`04-agent-studies.md`](04-agent-studies.md).

## The `users` object

A sentence names the group; a screener needs a behaviour, a window and an exclusion, which no generator can read out of one sentence ([`screener-research.md`](../discovery/screener-research.md)). So `users` is either the sentence alone or an object: the same sentence under `are`, plus facts about the author's customers, from which the compiler derives the method:

```ts
// ui-tests/invite.ui.test.ts
users: {
  are: 'people who signed up this week and want a colleague on their board',
  did: 'signed up for a tool to plan work with a team',
  within: '7 days',
  uses: ['Trello', 'Asana', 'Notion', 'Linear'],
  not: ['has used Weekboard'],
},
```

| Field | Shape | Becomes |
| --- | --- | --- |
| `are` | the users sentence, required in the object | the context's name in reports, the panel match sentence and the situation on the scenario card; never asked |
| `did` | one past-tense verb phrase about the category, never the product | the gate: "When did you last {did}?" with non-overlapping recency bands (for Weekboard: In the past week, In the past month, Earlier this year, I haven't), `accept` on the band inside `within` |
| `within` | `'<n> days\|weeks\|months\|years'`, default `'3 months'` | the accepted recency band |
| `often` | `'daily' \| 'weekly' \| 'monthly' \| 'yearly'` | a frequency question with concrete bands, `accept` at or above the floor |
| `role` | roles to accept | asked broad first (the kind of work), then narrow (the role among neutral roles, "None of these" rejecting), so the purpose cannot be read off the screener |
| `uses` | tools | a multi-select (for Weekboard, "Which of these do you use to plan work? Pick all that apply.") with the tools as may-select, one decoy and "None of these", both rejecting |
| `not` | exclusions | "Which of these have you done? Pick all that apply.", the exclusions listed among neutral options, any listed item rejecting, plus the standing exclusion of people who work in UX, design, marketing or market research |
| `where`, `language`, `age` | ISO country codes, an ISO 639-1 code, `{ min, max }` | paid panel filters, never asked; prior participation is always a panel filter too |

The participant meets the screener one question per screen, with nothing preselected: the questions from `users`, then the three fit questions from `purpose` (when did you last need to…, how do you do it today, how much does it matter to you to get this right). Labels, field names and rules never reach the participant. `purpose` stays at the context level, beside `users`.

The compiler validates the object (unknown fields, a missing `are`, malformed windows, codes and age ranges are a lint error with the field named) and writes the derived screener into the compiled context with the originating field and the rule beside each question. When `users` is a string, the compiler drafts the screener from the sentence (the relative clause as `did`, a time phrase as `within`), marks every field it filled as inferred, and `ui-tests lint` prints the draft as a `users: { are, ... }` object in TypeScript to paste in; a sentence with no behaviour in it yields no gate, and lint says so. The separate `screen` key of earlier drafts is removed: lint fails on it, with a fix that moves its fields under `users`.

## Test file

Mirrors describe/it, with the standard's structure: `context` is the context of use (ISO 9241-11: specified users, goals and tasks, environment), `goal` is what a person tries to achieve, `task` is a step, `outcome` is the goal's hook. RSpec users know `context` as a `describe` alias; it reads the same here. A context has no title: its name in reports is "users, purpose" and its id in the record is derived from the two, so neither is written twice.

```ts
// ui-tests/invite.ui.test.ts, as `npx ui-tests init` writes it
import { context, beforeEach, goal, outcome, expect } from 'ui-tests'

context({
  users: {
    are: 'people who signed up this week and want a colleague on their board',
    did: 'signed up for a tool to plan work with a team',
    within: '7 days',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  video: true,
}, () => {
  beforeEach(async () => ({ colleague: 'Sam', email: 'sam@acme.co' }))
  goal('invite a colleague', {
    happyPath: ['/board', '/settings/members'],
    catch: { affecting: '1 in 3', confidence: 0.85 },
  }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})
```

The impression stage runs before the goal with nothing written: the goal's `start`, here `/board` because it is the first page of the `happyPath`, flashed for 500 ms, one appeal item, the open question "What was that page for?" with the answers coded against the purpose, a first click toward the goal. The scenario card is derived from `users.are`, `purpose`, the goal's name and what `beforeEach` returns, never from `happyPath`, `outcome` or the screener: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.", then "When you think you've finished, press Done. If you get stuck, press I couldn't do this." and "Start task".

**Four shapes of a goal, one primitive.** What you write decides which question a goal asks, and the report names it.

| You write | The participant sees | The question | Measured |
| --- | --- | --- | --- |
| `goal` with `outcome` | the goal in their words, nothing about where to go | can people find their own way to the outcome | outcome, issues from dead clicks, pauses, backtracks, give-ups, words; every path taken is recorded |
| `goal` with `happyPath` and `outcome` | the same wording; the path is never shown | the same, plus whether they take the route you designed | the above plus deviation, lostness and first click |
| `goal` with `task`s and `outcome` | the steps one at a time, each with its own done | can people execute this procedure | step completion, per-task checks, outcome; labelled "execution"; UI terms allowed in steps |
| `goal` with no `outcome`, with `minutes` | a situation and a time box | where people go and get stuck when nobody says what to do | issues and paths only; no count, no sentence; lint warns |

A path participants actually took can be promoted to a goal's `happyPath` after a run, as a revision, so a goal-only run feeds the next run's measurement. "5 of 5 reached the outcome by their own route" and "5 of 5 completed the steps" are different claims and the report never lets one read as the other.

Semantics: `outcome` and per-task checks run in the runner, on the dev machine or in CI, against the end-state snapshot the collector stored when the participant ended the goal with done, give up, timeout, or withdrawal. `page` is a read-only view of that snapshot: `url()`, `textContent(selector)`, the DOM, and any app state the fixture exposed. A thrown assertion is `incorrect`; a hook that cannot read its evidence is `unknown`, never `incorrect`. `participant.answer()` asks one validation question with distractors from the generator when the end state is not observable; done and can't are the taskbar's, not calls. `beforeEach` provisions an isolated fixture per attempt and returns names the scenario may use.

Optional context fields: `environment`, `actors`, `target` (overrides the config's target for this context, for example `{ cli: 'npx ui-tests' }`), `impression: false` or `impression: { page }` (any public URL, since the flash is a screenshot), `independent: true` (goals are randomised in order), `video: true` (adds the screen as a video to the event replay; `init` writes the hint as a comment in `ui-tests.config.ts`), `blocking`. Optional goal fields: `start` (where the person lands; default the first page of `happyPath`, else `/`), `catch` or `estimate` (human runs), `trials` (agent runs, default 5), `timeout`, `minutes`, `primary` (the goal that carries the context's result when there are several), `scenario` to pin wording after review. A `task` takes an optional check with the same signature as `outcome`, evaluated against the snapshot at that step's done: `task('choose the new plan', async ({ page }) => expect(page.url()).toContain('/plans'))`.

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
| Users valid (`users-valid`) | an unknown field, an object without `are`, a `within` that is not a window, a country that is not an ISO code, `age.min` above `age.max`, a separate `screen` key (the fix moves its fields under `users`) | this contract |
| Users inferred (`users-inferred`) | `users` as a sentence alone: a warning with the inferred draft printed as a `users: { are, ... }` object in TypeScript | screener research |
| Users gated (`users-did`) | no `did` written or inferred: a warning that the screener has no gate | screener research |
| Actor admitted | `--actor agent` on a context with `actors: ['human']`, or `actors` including `human` on a `target.cli`, `target.mcp` or `target.http` | this contract |

Lint failures block a run and name the fix. Warnings appear in the trace.

`ui-tests lint`, dev mode and `ui-tests run` print the plan before anything starts, with the recording level on its own line, for example "Recording: event replay (what people do on the page) and screen video (video: true, 1.5× incentive)"; without `video: true` the line names event replay alone.

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
| `ui-tests host [--panel prolific\|connect]` | The no-repo path ([`../discovery/hosting-decision.md`](../discovery/hosting-decision.md)): deploys the collector, the player and the store to a free tier in the author's own account (first provider: Cloudflare Workers with R2 and D1; the contract is provider-agnostic, a container plus a bucket); prints the collector and player URLs, the store name and the panel state, and the one line to paste on the live site. `--panel` adds the author's own Prolific token or Connect key to the deploy. Idempotent: run it again to update. Until the deploy ships ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) it prints what it will do and where, and exits 2 with "host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59" |
| `ui-tests mcp` | Serves the commands above as MCP tools with the same arguments, outputs and guards; see [`05-integration.md`](05-integration.md) |

`--json` keeps stdout for structure and stderr for diagnostics.

## CI

A GitHub Action wraps `ui-tests run` and posts a check named `ui-tests (human)` or `ui-tests (agent)` as pending with the estimate in its summary. The usual arrangement is agent runs on every push, because they are fast and cost only model tokens, and human runs on a label or on merge to main, because those pay people. A scheduled reconciliation workflow runs `ui-tests verify` and updates the check from `ui-tests status` until it completes, the same pattern the factory uses for delivery status. A context's `blocking` makes the check required; the config sets the default. Triggers default to a label or a merge to main; a push never spends money. The Action passes the Vercel protection-bypass token into invite links so participants reach a protected preview.

## Reporters

`default` prints the issues and the sentence. `github-actions` annotates the check. `json` writes the run record described in [`05-integration.md`](05-integration.md). `junit` is a planned omission.
