# DX contract

The criterion for every field: a developer who has written a Playwright test already knows the answer. Anything else is derived, shown in the trace, and editable but never required.

**Names.** The tables below name fields by their contract names; the authoring API, which the landing page shows, spells them as follows, and a contract name in a study is a lint error whose fix names the API's: `context` is `study(name, options, fn)`; `goal` is `task(name, { path, timeLimit, firstLook }, fn)`; `beforeEach` is `setup(async ({ request }) => ({ start, ...values }))`, run once per attempt with Playwright's `request` against the target, its `start` the attempt's first URL; `happyPath` is `path`, the route you expect, which decides nothing; `catch` is `sample: { affecting, confidence }` on the study; `video: true` is `record: 'video'`; `impression` is `firstLook`, off when the start comes from `setup` unless `firstLook: { page }` names a public page; and `outcome(async ({ request, setup }) => …)` reads the app's state, whatever page the person ended on. The commands go by cost: `npx ui-tests` rehearses on you, `npx ui-tests recruit` puts real people in front of the study, and `npx ui-tests check` is the one CI command. There is no `estimate` intent: a run reports problems, or that it found none, and never a pass. The file `init` writes is the one the landing shows, `apps/web/lib/example.ts`.

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
| Screen video | `study(name, { record: 'video' })`; nothing written means event replay only | They know whether they want to watch the screen, and that it costs more |
| Where the person lands | `start` on a goal; default the first page of `happyPath`, else the target's root (`/`) | They know where the task begins |
| The page flashed first | `context({ impression })`: on by default, `false` turns it off, `{ page }` names the page; default the first goal's `start` | They know which page should carry the purpose |

## Derived

| Derived | From | Visible as |
| --- | --- | --- |
| Scenario wording | the situation from `users.are` and `purpose`, the action from the goal's name, the data from what `beforeEach` returns; never the happy path, the outcome or the screener; written by the configured model through the author's key, or by a deterministic template when no model is configured; linted (no word that appears on a control of the target site unless the goal has steps, so the card cannot hint where to click; one outcome, context sentence, user's words), with the rule and its reason beside each change | Editable text in the trace before launch |
| Impression stage | on by default: `impression.page`, else the first goal's `start`, flashed for 500 ms, then one open question, "What was that page for?", answered by typing or talking, a first click toward the first goal; no distractors, and the `purpose` is never shown in the stage. The answers are coded against the `purpose`, by the configured model or, when no model is configured, by a deterministic word-overlap rule, and labelled "named the purpose", "did not name it" or "no answer"; `impression: false` turns it off | How many named the purpose, with their words, beside the issues; each code reviewable in the trace beside the person's words |
| Fit questions in the screener | the `purpose`: when did you last need to do this, how do you do it today, how much does it matter | Shown in the trace; the fit of the sample opens the report |
| Sample size | `sample: { affecting: 1 / 3, confidence: 0.85 }` on the study, for the whole study; leave it out and that is the default, five people | The sentence, not the number |
| The sentence | the same inputs and the observed counts | In the report and the check |
| Goal timeout | happy-path or step count × 90 seconds, 3-minute floor; silent, with no countdown shown; the participant may ask for more time once | `timeLimit` on the task |
| Questions | one per screen: the SEQ after every attempt, give-ups included; "What made it difficult?" when it is 4 or below; confidence only when the outcome cannot be verified by the end state or a validation question; UX-Lite at the end with usefulness reported on its own; the open question last. Every question that takes words also takes voice, with microphone consent asked once ([`participant-overlay-research.md`](../discovery/participant-overlay-research.md)) | Always collected, reported as context; spoken answers keep their audio and transcript with the attempt |
| Screener | the `users` object (below), or a draft inferred from the `users` sentence when it is a string; the three fit questions from the `purpose` as before; one question per screen, nothing preselected | Shown in the trace as an editable table: each question with its options and their accept, reject or may-select labels, the `users` field it came from and the rule; `ui-tests lint` prints an inferred draft as a `users: { are, ... }` object in TypeScript |
| Incentive | estimated minutes, wage floor, role and recording multipliers, raise rule, true-up reserve; a floor the author can raise and nothing can lower, except for `link` participants, whom the author pays, or not, themselves | Line item against the budget; the consent's payout line states the amount, or that a `link` run is unpaid ([`03-participants.md`](03-participants.md#the-payout-line)) |
| Panel routing | bandit over configured panels under the cap | Per-panel counts |
| Consent, instructions, attention and speeder flags, repeat exclusion | standing defaults | Flags recorded, nothing deleted |
| Recording level | event replay always (what the person does on the page: clicks, typing without its values, pages); `record: 'video'` on the study adds the screen as a video, which needs the browser's prompt and carries the 1.5× recording multiplier on the incentive's hourly term (under ten minutes the short-study floor usually governs; [`03-participants.md`](03-participants.md)). Voice and camera are never author fields: both are always the person's choice, voice by "Talk instead", the camera on the consent, off unless they turn it on; there is no microphone during the task | `record: 'video'`; printed in the plan by `ui-tests lint` and the run, and read by the consent list and the attempt's footer |
| Environment | device, browser, assistive technology, locale recorded from the screener; `environment` on the context narrows who is invited | Overridable |
| Deadline, language | 48 hours, the site's language | Overridable |

Not inputs: the participant's own "I did it" and their explanation. Both are recorded as data next to the outcome.

## Config

```ts
// ui-tests.config.ts
import { defineConfig } from 'ui-tests'

export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' },   // the ui-tests server; the app's tag points here too
  brand: {                                      // optional: what participants see in place of ours
    name: 'Weekboard',                          // default: `author`, then `product`; also who runs the study in the consent
    logo: 'https://weekboard.app/logo.svg',     // https, http://localhost, or a data: image
    accent: '#3355ff', background: '#ffffff', text: '#111111',
    font: { family: 'Inter', url: 'https://fonts.googleapis.com/css2?family=Inter' },
  },
  participants: {
    sources: ['link', 'prolific'],              // fan-out order; 'link' is always available
    prolific: { token: process.env.PROLIFIC_TOKEN },
    budget: { max: 70, currency: 'USD' },       // hard cap per run, includes the reserve for the raise and the true-up
  },
  check: { block_on: 'problems' },           // optional: without it the `ui-tests` check is always neutral; with it, red when a completed run finds problems, never green
  ci: { on: ['label:ui-test'] },             // optional: narrows which pull requests get a human run; without it, every one gets one run
  reporters: ['default', 'github-actions', 'json'],
})
```

`target.url` is the app; `server.url` is the ui-tests server people's browsers reach for the player, the collector and the report, `http://localhost:4300` by default. The brand is stored with the run when it is created, so the server and the bar render it without reading the author's files. Each brand value is checked when the study compiles, and an unsafe one is refused, naming the field: colours are `#rgb` or `#rrggbb`, the font family is a name without quotes, the font URL is https. Without a brand the bar takes its colours and font from the host page and the server's pages use a neutral theme; neither shows a ui-tests mark.

Discovery order mirrors Vitest: `ui-tests.config.{ts,mts,js}` first, then `vite.config.*` with a `uiTests` key; no config is valid and runs with defaults against localhost. The init command adds `*.ui.test.ts` to Vitest's exclude list so Vitest never collects it.

The actor is a run parameter, not a file kind. `actor: 'human'` in the config is the default; `ui-tests run --actor agent` runs the same context with an agent harness. A run has exactly one actor; `--actor both` is refused. `target.url` serves both actors; `target.cli`, `target.mcp` and `target.http` serve agents; a human terminal harness is a planned omission, and the lint says so if a context admits humans on them. See [`04-agent-studies.md`](04-agent-studies.md).

## The `users` object

A sentence names the group; a screener needs a behaviour, a window and an exclusion, which no generator can read out of one sentence ([`screener-research.md`](../discovery/screener-research.md)). So `users` is either the sentence alone or an object: the same sentence under `are`, plus facts about the author's customers, from which the compiler derives the method:

```ts
// ui-tests/invite.ui.test.ts
users: {
  are: 'people who plan work with a team in a shared tool',
  did: 'used a shared tool to plan work with a team',
  within: '3 months',
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

Mirrors describe/it, with the standard's structure: `study` is the context of use (ISO 9241-11: specified users, goals, environment), `task` is what a person tries to achieve, the goal, and `outcome` is its hook. Written like a Playwright test, read like a study: an `expect` that fails means one person did not get there, never a red build. A study's name is the author's label; its name in reports is "users, purpose" and its id in the record is derived from the two, so neither is written twice.

```ts
// ui-tests/invite.ui.test.ts, as `npx ui-tests init` writes it
import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', {
  users: {
    are: 'people who plan work with a team in a shared tool',
    did: 'used a shared tool to plan work with a team',
    within: '3 months',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
    firstLook: { page: '/' },
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(`/api/test/boards/${setup.board}/invitations`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})
```

The first look runs before the task with nothing more written. It flashes the page the task starts on when that page is public; here the start comes from `setup`, behind a sign-in, so `firstLook: { page: '/' }` names the public home page, where the purpose lives. It is flashed for 500 ms, then the open question "What was that page for?", the answers coded against the purpose, which the person never sees, then the page comes back for one click. The scenario card is derived from `users.are`, `purpose`, the task's name and what `setup` returns, never from `path`, `outcome` or the screener: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example.", then "When you think you've finished, press Done. If you get stuck, press I couldn't do this." and "Start task".

**Four shapes of a goal, one primitive.** What you write decides which question a goal asks, and the report names it.

| You write | The participant sees | The question | Measured |
| --- | --- | --- | --- |
| `goal` with `outcome` | the goal in their words, nothing about where to go | can people find their own way to the outcome | outcome, issues from dead clicks, pauses, backtracks, give-ups, words; every path taken is recorded |
| `goal` with `happyPath` and `outcome` | the same wording; the path is never shown | the same, plus whether they take the route you designed | the above plus deviation, lostness and first click |
| `goal` with `task`s and `outcome` | the steps one at a time, each with its own done | can people execute this procedure | step completion, per-task checks, outcome; labelled "execution"; UI terms allowed in steps |
| `goal` with no `outcome`, with `minutes` | a situation and a time box | where people go and get stuck when nobody says what to do | issues and paths only; no count, no sentence; lint warns |

A path participants actually took can be promoted to a goal's `happyPath` after a run, as a revision, so a goal-only run feeds the next run's measurement. "5 of 5 reached the outcome by their own route" and "5 of 5 completed the steps" are different claims and the report never lets one read as the other.

Semantics: `outcome` and per-task checks run in the runner, on the dev machine or in CI, after the participant ended the goal with done, give up, timeout, or withdrawal. `outcome(async ({ request, setup }) => …)` asks the app what happened, through Playwright's `request` against the target and the values `setup` returned, whatever page the person ended on: what they said does not count; what the app holds does. In the example, pressing Add twice still invited Sam, so the outcome is `correct` and the second invitation comes back as a problem, not as a failure. `page` is a read-only view of the end-state snapshot the collector stored: `url()`, `textContent(selector)`, the DOM, and any app state the fixture exposed. A thrown assertion is `incorrect`; a hook that cannot read its evidence is `unknown`, never `incorrect`. `participant.answer()` asks one validation question with distractors from the generator when the end state is not observable; done and can't are the taskbar's, not calls. `beforeEach` provisions an isolated fixture per attempt and returns names the scenario may use.

Optional context fields: `environment`, `actors`, `target` (overrides the config's target for this context, for example `{ cli: 'npx ui-tests' }`), `impression: false` or `impression: { page }` (any public URL, since the flash is a screenshot), `independent: true` (goals are randomised in order), `video: true` (adds the screen as a video to the event replay; `init` writes the hint as a comment in `ui-tests.config.ts`). Optional goal fields: `start` (where the person lands; default the first page of `happyPath`, else `/`), `target` (agent runs: the surface this one goal points at, overriding the context's, as in the guide's `task('add a member through the API', { target: { http: 'https://api.weekboard.app' } })`), `catch` (human runs; now `sample` on the study), `trials` (agent runs, default 5), `timeout`, `minutes`, `primary` (the goal that carries the context's result when there are several), `scenario` to pin wording after review. A `task` takes an optional check with the same signature as `outcome`, evaluated against the snapshot at that step's done: `task('choose the new plan', async ({ page }) => expect(page.url()).toContain('/plans'))`.

## Lint

Runs on `ui-tests lint`, in dev mode, and before any run. Each rule prints its reason in one line, because the author wants to learn, not only obey.

| Rule | Example | Source |
| --- | --- | --- |
| No interface terms in a goal or its card | a word that appears on a control of the target site, such as "Members" or "Add", in the task's name or the scenario card, so the card cannot hint where to click; allowed inside steps, where the question is execution. Today the rule checks a fixed list of interface words (click, button, menu and the like) in the task's name | NN/g task writing |
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

`ui-tests lint`, dev mode and `ui-tests recruit` print the plan before anything starts, with the recording level on its own line, for example "Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive 1.5×)"; without `record: 'video'` the line names event replay alone.

## CLI

| Command | Does |
| --- | --- |
| `ui-tests init` | Writes the study file and `ui-tests.config.ts` (the Weekboard example, as the landing shows it in `apps/web/lib/example.ts`) and prints the script tag for the app's HTML layout, with one line per setup on reading the server's address from the environment: Vite `%VITE_UI_TESTS_URL%`, Astro `import.meta.env.PUBLIC_UI_TESTS_URL`, Next.js `process.env.NEXT_PUBLIC_UI_TESTS_URL`, Rails `ENV["UI_TESTS_URL"]`, plain HTML the address itself |
| `ui-tests serve [--port <n>] [--bind <addr>]` | Starts the ui-tests server: the script the tag loads, the player, the collector, the shareable report and `/healthz`. `PORT` or `--port` (default 4300), `--bind` (default `0.0.0.0`), `UI_TESTS_PUBLIC_URL` (the address people reach it at, an absolute http(s) origin; a malformed one is refused), the store from `UI_TESTS_DATABASE_URL`, else SQLite under `UI_TESTS_DATA_DIR` or `.ui-tests/`, and `UI_TESTS_SHARE_SECRET`, `UI_TESTS_CLI_SECRET`, `UI_TESTS_TRANSCRIBER`. Prints its address and the tag for it. The Docker image, built from a clone with `docker build -t ui-tests .` and run with `docker run -p 4300:4300 -v ui-tests:/data ui-tests`, runs the same command with its store on the volume `/data`; it is to be published as `ghcr.io/miguel-perez/ui-tests`. Rehearsal starts the server itself when `server.url` is an http address on this machine and none answers there |
| `ui-tests` | Dev mode: runs the whole study on you, in your browser, against `target.url`, with the ui-tests server at `server.url` (started when it is an http address on this machine and none answers there; a server elsewhere must already answer): the consent, the screener, the first look, the scenario card, your page with the bar, the questions after, then your own trace; the outcome runs; recruits nobody, costs nothing, and the attempt never counts toward n |
| `ui-tests recruit [--tunnel \| --host <name> \| --local]`, and `ui-tests --actor agent` for an agent run | Async run of one context for one actor (runs with your own invite links are built (inviting visitors is not), [#71](https://github.com/miguel-perez/ui-tests/issues/71), and so are agent runs, [#72](https://github.com/miguel-perez/ui-tests/issues/72); paying a panel is R3 and not built): creates the run with an idempotency key derived from commit, context id and actor, returns a durable handle, exits 0; a repeated key returns the existing run. `--tunnel` serves a local build and a ui-tests server of the command's own through one front door and a run-scoped tunnel, for a run the author watches for a few hours; `--host <name>` serves them through the front door to people inside a network, on that name; if the machine closes mid-run the link goes dark, and the next `recruit` with the same key resumes the same run while the deadline keeps counting; a longer or unattended run uses a ui-tests server the author keeps up, `ui-tests serve` or the Docker image on a machine people can reach, with the app deployed; `ui-tests host` will make that one command (not shipped yet: [#59](https://github.com/miguel-perez/ui-tests/issues/59)). See [`05-integration.md`](05-integration.md#when-the-laptop-closes) |
| `ui-tests recruit --wait` | Same, then polls to completion; exit codes 0 none found, 1 problems found, 3 pending or inconclusive, 2 error |
| `ui-tests verify <run>` | Executes the hooks against stored snapshots for attempts not yet verified; CI runs it on the reconciliation schedule |
| `ui-tests status <run>` | Independent states: recruitment, collection, verification, payment |
| `ui-tests report <run>` | Human report, `--json`, or `--share` for a signed public link |
| `ui-tests trace <run>` | Opens the trace viewer |
| `ui-tests check` | In the job that deploys the preview: the same run as `recruit`, one per pull request, with the cap in the config as the yes, and a check on the pull request; see CI below |
| `ui-tests lint` | Lint only, no run |
| `ui-tests estimate` | Derived n, minutes, incentive, and cost per source before anything is spent |
| `ui-tests host [--panel prolific\|connect]` | Until it ships, `ui-tests serve` and the Docker image are the way to run the server. The no-repo path ([`05-integration.md`](05-integration.md#where-things-run)): deploys the collector, the player and the store to a free tier in the author's own account (first provider: Cloudflare Workers with R2 and D1; the contract is provider-agnostic, a container plus a bucket); prints the collector and player URLs, the store name and the panel state, and the one line to paste on the live site. `--panel` adds the author's own Prolific token or Connect key to the deploy. Idempotent: run it again to update. Until the deploy ships ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) it prints what it will do and where, and exits 2 with "host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59" |
| `ui-tests mcp` | Serves the commands above as MCP tools with the same arguments, outputs and guards; see [`05-integration.md`](05-integration.md) |

`--json` keeps stdout for structure and stderr for diagnostics.

## CI

`npx ui-tests check`, in the job that deploys the preview, starts the run and posts one check on the commit (`npx ui-tests check <run.json>` also publishes the check from a run summary you pass it): `ui-tests` for a human run, and for an agent run its own check, `ui-tests (agent)`, which never counts with people. It asks nothing: the cap in the config is the yes, and a run that cannot fit n under the cap does not start. One run per pull request: `check` derives the run's key from the pull request, the study and the actor, not the commit, so a push while people are still in starts nothing new, and the check stays with the commit they saw, which its footer names. While attempts arrive it is pending with the estimate in its summary. By default, when the run completes, its conclusion is neutral whatever the outcome, never red or green, because there is no pass to give: it never fails the build or blocks a merge, even when a team marks it required. The one opt-in is `check: { block_on: 'problems' }`, which makes it red when a completed run has problems; it is never green; an inconclusive run, with fewer attempts than it asked for, stays neutral either way. `check: { comment: false }` turns off its one sticky comment. Its titles and its page are in [`05-integration.md`](05-integration.md#github). Every pull request gets one human run by default; `ci.on` narrows which ones do, for example to a label, and a push never starts a second paid run. Agent runs are not gated by `ci.on` and start on every push, because they are fast and cost only model tokens. A scheduled reconciliation workflow runs `ui-tests verify` and updates the check from `ui-tests status` until it completes, the same pattern the factory uses for delivery status. `check` passes the Vercel protection-bypass token into invite links so participants reach a protected preview.

## Reporters

`default` prints the issues and the sentence. `github-actions` annotates the check. `json` writes the run record described in [`05-integration.md`](05-integration.md). `junit` is a planned omission.
