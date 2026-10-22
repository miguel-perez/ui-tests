# DX contract

The criterion for every field: a developer who has written a Playwright test already knows the answer. Anything else is derived, shown in the trace, and editable but never required.

**Names.** The tables below name fields by their contract names; the authoring API, which the landing page shows, spells them as follows, and a contract name in a study is a lint error whose fix names the API's: `context` is `study(name, options, fn)`; `goal` is `task(name, { path, timeLimit }, fn)`; `beforeEach` is `setup(async ({ request }) => ({ start, ...values }))`, run once per attempt with Playwright's `request` against the target, its `start` the attempt's first URL; `happyPath` is `path`, the route you expect, which decides nothing; `catch` is `sample: { affecting, confidence }` on the study; `video: true` is `record: 'video'`; `impression` is `firstLook`, one per study, off when the start comes from `setup` unless `firstLook: { page }` names a public path; and `outcome(async ({ request, setup }) => …)` reads the app's state, whatever page the person ended on. The commands go by cost: `npx ui-tests` rehearses on you, `npx ui-tests recruit` puts real people in front of the study, and `npx ui-tests check` is the one CI command. There is no `estimate` intent: a run reports problems, or that it found none, and never a pass. The file `init` writes is the one the landing shows, `apps/web/lib/example.ts`.

## Inputs

| Input | Where | Why the author knows it |
| --- | --- | --- |
| Users, one plain sentence, or what they did and how to check it | `context({ users })`: a string, or an object `{ did, within, often, role, uses, not, groups, are, insiders, professionals, where, language, age }` with `did` required and every other field optional (below) | They know what their customers did recently, in which roles, which tools they use and who they are not; the method is derived, and what is drafted is reviewed in a snapshot |
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
| The page toured first, and what it should get across | `study(name, { firstLook })`: on by default, `false` turns it off, `{ page, says }` names the path and what the page should say; default the primary task's start page, and the page's `<h1>`, meta description or og:description | They know which page should carry the purpose, and what it should tell a newcomer |

## Derived

| Derived | From | Visible as |
| --- | --- | --- |
| Scenario wording | the situation from `users.are` and `purpose`, the action from the goal's name, the data from what `beforeEach` returns; never the happy path, the outcome or the screener; written by the configured model through the author's key, or by a deterministic template when no model is configured; linted (no word that appears on a control of the target site unless the goal has steps, so the card cannot hint where to click; one outcome, context sentence, user's words), with the rule and its reason beside each change | Editable text in the trace before launch |
| First look | on by default, one per study: Krug's home page tour of `firstLook.page`, else the primary task's start page, live and untimed, scroll only, nothing clickable; then one open prompt, "What do you make of that page? Say what it is, whose it is, what you can do there, and what it's for.", typed or spoken. The answer is coded per part against `firstLook.says` (identified it, identified who it is from, named an action, named its purpose) by the configured model; with no model it is left uncoded and listed. The `purpose` is never shown before it; `firstLook: false` turns it off | The coded parts beside the issues, never counted in them; the uncoded answers listed; each code settable in the trace beside the person's words |
| Sample size | `sample: { affecting: 1 / 3, confidence: 0.85 }` on the study, for the whole study; leave it out and that is the default, five people | The sentence, not the number |
| The sentence | the same inputs and the observed counts | In the report and the check |
| Goal timeout | happy-path or step count × 90 seconds, 3-minute floor; silent, with no countdown shown; the participant may ask for more time once | `timeLimit` on the task |
| Questions | one per screen: the SEQ after every attempt, give-ups included; "What made it difficult?" when it is 4 or below; confidence only when the outcome cannot be verified by the end state or a validation question; UX-Lite at the end with usefulness reported on its own; the open question last. Every question that takes words also takes voice, with microphone consent asked once ([`participant-overlay-research.md`](../discovery/participant-overlay-research.md)) | Always collected, reported as context; spoken answers keep their audio and transcript with the attempt |
| Screener | the `users` object (below), or a draft inferred from the `users` sentence when it is a string; at most five screens before consent, one question per screen, nothing preselected, unordered options in an order of their own per person; same-category decoys drafted by the configured model | In the committed snapshot `<study file>.screener.snap`, which `ui-tests lint -u` writes and the author reviews: each screen with its options and their accept, reject or may-select labels, the decoys, the derived `are`, the purpose in the "you" form, `says` and its source, and the group quotas; `ui-tests lint` prints an inferred draft as a `users: { did, ... }` object in TypeScript |
| Incentive | estimated minutes, wage floor, role and recording multipliers, raise rule, true-up reserve; a floor the author can raise and nothing can lower, except for `link` participants, whom the author pays, or not, themselves | Line item against the budget; the consent's payout line states the amount, or that a `link` run is unpaid ([`03-participants.md`](03-participants.md#the-payout-line)) |
| Panel routing | bandit over configured panels under the cap | Per-panel counts |
| Consent, instructions, attention and speeder flags, repeat exclusion | standing defaults | Flags recorded, nothing deleted |
| Recording level | event replay always (what the person does on the page: clicks, typing without its values, pages); `record: 'video'` on the study adds the screen as a video, which needs the browser's prompt and carries the 1.5× recording multiplier on the incentive's hourly term (under ten minutes the short-study floor usually governs; [`03-participants.md`](03-participants.md)). Voice and camera are never author fields: both are always the person's choice, voice by "Talk instead", the camera on the consent, off unless they turn it on; there is no microphone during the task | `record: 'video'`; printed in the plan by `ui-tests lint` and the run, and read by the consent list and the attempt's footer |
| Environment | browser and device read from the user agent, never asked; assistive technology asked after consent, optional, filtering nobody; locale; `environment` on the context narrows who is invited | Overridable |
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
  model: { provider: 'anthropic', name: 'claude-sonnet-5-5' },   // optional: the one model; drafts the screener snapshot, codes the first look, and runs agents. The key stays in ANTHROPIC_API_KEY
  check: { block_on: 'problems' },           // optional: without it the `ui-tests` check is always neutral; with it, red when a completed run finds problems, never green
  ci: { on: ['label:ui-test'] },             // optional: narrows which pull requests get a human run; without it, every one gets one run
  reporters: ['default', 'github-actions', 'json'],
})
```

`target.url` is the app; `server.url` is the ui-tests server people's browsers reach for the player, the collector and the report, `http://localhost:4300` by default. The brand is stored with the run when it is created, so the server and the bar render it without reading the author's files. Each brand value is checked when the study compiles, and an unsafe one is refused, naming the field: colours are `#rgb` or `#rrggbb`, the font family is a name without quotes, the font URL is https. Without a brand the bar takes its colours and font from the host page and the server's pages use a neutral theme; neither shows a ui-tests mark.

Discovery order mirrors Vitest: `ui-tests.config.{ts,mts,js}` first, then `vite.config.*` with a `uiTests` key; no config is valid and runs with defaults against localhost. The init command adds `*.ui.test.ts` to Vitest's exclude list so Vitest never collects it.

The actor is a run parameter, not a file kind. `actor: 'human'` in the config is the default; `ui-tests run --actor agent` runs the same context with an agent harness. A run has exactly one actor; `--actor both` is refused. `target.url` serves both actors; `target.cli`, `target.mcp` and `target.http` serve agents; a human terminal harness is a planned omission, and the lint says so if a context admits humans on them. See [`04-agent-studies.md`](04-agent-studies.md).

## The `users` object

A sentence names the group; a screener needs a behaviour, a window, the groups to sample and the people to leave out, which no generator can read out of one sentence ([`screener-research.md`](../discovery/screener-research.md)). So `users` is either the sentence alone or an object of facts about the author's customers, from which the compiler derives the method:

```ts
// apps/web/ui-tests/landing.ui.test.ts
study('getting started', {
  users: {
    did: 'shipped a user interface you built yourself',
    role: ['Developer', 'Designer', 'Founder'],          // one group: any of these
    // role: { Developer: 3, Designer: 2 },             // two groups, sampled separately with these quotas
  },
  purpose: 'find out whether people can use what I built, without a researcher',
  // firstLook: { page: '/', says: '…' },              // both have defaults; firstLook: false turns it off
}, () => { … })
```

| Field | Shape | Becomes |
| --- | --- | --- |
| `did` | past-tense behaviour of the category, never the product; required unless `users` is a sentence | The recency gate, "When did you last {did}?", with at least four mutually exclusive bands, including bands beyond the window, and "Never" |
| `within` | `'<n> days\|weeks\|months\|years'`, default `'3 months'` | The accepted bands |
| `often` | `'daily'`…`'yearly'` | A frequency question, only when lint judges `did` to be something people repeat |
| `role` | `string[]` (one group, any of these) or `Record<string, number>` (one group per role, with quotas) | "Which of these is closest to your role?", the roles among same-category decoys and "None of these". There is no broad-area question |
| `uses` | `string[]` | "Which of these do you use?" with same-category decoys; "None of these" and the decoys reject |
| `not` | `string[]`, in the participant's voice | Exclusions shown among in-register options. Items a default already covers are dropped, with a lint note |
| `groups` | `[{ name, quota, …fields }]` | Only for groups that differ in more than one field. A one-field difference is written as the object form of that field |
| `are` | optional | Derived from `did` with the person shifted ("people who shipped a user interface they built themselves") unless written. Used in reports, the panel match and the scenario card; never asked |
| `insiders`, `professionals` | `'exclude' \| 'include'`, rarely written | Defaults: people who work on or have tested this product are excluded; UX, design, marketing and market research are excluded minus any role a group accepts. `professionals: 'exclude'` with an accepted role in one of those areas is a lint error naming `professionals` |
| `where`, `language`, `age` | ISO country codes, an ISO 639-1 code, `{ min, max }` | Panel filters, never asked; `language` defaults to the first look's page's `<html lang>`, read into the snapshot by `ui-tests lint -u` (with no first look, write it); prior participation is always a panel filter too |
| `firstLook.page` | path | Default: the primary task's start page |
| `firstLook.says` | what the page should get across | Default: the start page's `<h1>`, else its `<meta name="description">`, else `og:description`, read by `ui-tests lint -u`. Never `purpose` |

`did`, and whether roles form one group or several, are never defaulted. With two or more roles and no quotas, lint prints one line: "treated as one group; write `role: { … }` with counts to sample them separately". Each group in `groups` gets 3 people unless a quota is written, and `ui-tests estimate` shows the cost; one group is sampled to `sample`'s n.

The participant meets at most five screens before consent, one question per screen, with nothing preselected and unordered options in an order of their own, stored with the attempt; ordered scales keep their order. Labels, field names and rules never reach the participant. No participant-facing text before the first look contains `purpose`, and no drafted option says a content word of it that the start page itself does not say (lint `purpose-leak`; the author's own `did`, roles, tools and exclusions are theirs to word). Assistive technology is asked after consent; browser and device are read from the user agent. `purpose` stays at the context level, beside `users`.

**The snapshot.** Everything drafted rather than written lives in a committed file next to the study, `<study file>.screener.snap`, reviewed like a Vitest snapshot: the participant-facing screens and their options; the same-category decoys for `role`, `uses` and `not`; the derived `are`; the purpose shifted to "you" ("what you built", "your books"); `firstLook.says` and its source (meta, og or h1); the group quotas, each default with its source; and the distractors of each `participant.answer()` question the author gave none for, by its question and drafted from its expected answer. One file holds a study's drafts, so one review covers them. `ui-tests lint -u` drafts or updates it, using the project's one model, `model: { provider, name }` in `ui-tests.config.ts` (the same one agent runs use), through the author's `ANTHROPIC_API_KEY` from the environment, for the decoys, for whether `did` repeats and for the distractors of an answer that is not a count. The model is pinned into the run, and the ui-tests server codes the first look with it through its own `ANTHROPIC_API_KEY`. A drafted value whose input has not changed is kept as the author edited it. With no model configured, lint names each field it could not draft, the snapshot holds `null` there, and the author writes it in; no generic list stands in. Rehearsal (`npx ui-tests`) runs with a missing or out-of-date snapshot and labels its screens as drafts. `recruit` and `check` refuse, naming the snapshot, until it is present and current. A study only agents take needs no snapshot.

The compiler validates the object (unknown fields, a missing `did`, malformed windows, roles, quotas, codes and age ranges are a lint error with the field named) and writes the derived screener into the compiled context with the originating field and the rule beside each question. When `users` is a string, the compiler drafts the screener from the sentence (the relative clause as `did`, a time phrase as `within`), marks every field it filled as inferred, and `ui-tests lint` prints the draft as a `users: { did, ... }` object in TypeScript to paste in; a sentence with no behaviour in it yields no gate, and lint says so. The separate `screen` key of earlier drafts is removed: lint fails on it, with a fix that moves its fields under `users`.

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
    not: ['I have used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
  firstLook: { page: '/' }, // the start comes from setup, behind a sign-in: tour the public home page
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(`/api/test/boards/${setup.board}/invitations`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})
```

The first look runs before the task with nothing more written. It tours the page the primary task starts on when that page is public; here the start comes from `setup`, behind a sign-in, so `firstLook: { page: '/' }` names the public home page, where the purpose lives. The person looks at the live page for as long as they like, scrolling but clicking nothing, then answers one open prompt: what it is, whose it is, what they can do there and what it is for. The answer is coded against what the page says (its first heading here, read into the snapshot), never against the purpose, which the person never sees. The scenario card is derived from `users.are`, `purpose`, the task's name and what `setup` returns, never from `path`, `outcome` or the screener: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example.", then "When you think you've finished, press Done. If you get stuck, press I couldn't do this." and "Start task".

**Four shapes of a goal, one primitive.** What you write decides which question a goal asks, and the report names it.

| You write | The participant sees | The question | Measured |
| --- | --- | --- | --- |
| `goal` with `outcome` | the goal in their words, nothing about where to go | can people find their own way to the outcome | outcome, issues from dead clicks, pauses, backtracks, give-ups, words; every path taken is recorded |
| `goal` with `happyPath` and `outcome` | the same wording; the path is never shown | the same, plus whether they take the route you designed | the above plus deviation, lostness and first click |
| `goal` with `task`s and `outcome` | the steps one at a time, each with its own done | can people execute this procedure | step completion, per-task checks, outcome; labelled "execution"; UI terms allowed in steps |
| `goal` with no `outcome`, with `minutes` | a situation and a time box | where people go and get stuck when nobody says what to do | issues and paths only; no count, no sentence; lint warns |

A path participants actually took can be promoted to a goal's `happyPath` after a run, as a revision, so a goal-only run feeds the next run's measurement. "5 of 5 reached the outcome by their own route" and "5 of 5 completed the steps" are different claims and the report never lets one read as the other.

Semantics: `outcome` and per-task checks run in the runner, on the dev machine or in CI, after the participant ended the goal with done, give up, timeout, or withdrawal. `outcome(async ({ request, setup }) => …)` asks the app what happened, through Playwright's `request` against the target and the values `setup` returned, whatever page the person ended on: what they said does not count; what the app holds does. In the example, pressing Add twice still invited Sam, so the outcome is `correct` and the second invitation comes back as a problem, not as a failure. `page` is a read-only view of the end-state snapshot the collector stored: `url()`, `textContent(selector)`, the DOM, and any app state the fixture exposed. A thrown assertion is `incorrect`; a hook that cannot read its evidence is `unknown`, never `incorrect`. `participant.answer(question, { expected, distractors })` asks one validation question when the end state is not observable. Its wrong answers are the author's `distractors`, else drafted into the snapshot for review: a count (a whole number from 0 to 999) takes its nearest neighbours, which lint shows beside the right answer; any other answer is drafted by the model in the same kind and form as the right one, and with no model lint names the question and the author writes them in. Written `distractors` with no wrong answer in them or with a blank, the expected answer or one answer twice among them (ignoring case and surrounding spaces), and the same question asked by two tasks expecting different answers (their drafts are kept by question), are errors. Nothing generic pads them; done and can't are the taskbar's, not calls. `beforeEach` provisions an isolated fixture per attempt and returns names the scenario may use.

Optional context fields: `environment`, `actors`, `target` (overrides the config's target for this context, for example `{ cli: 'npx ui-tests' }`), `firstLook: false` or `firstLook: { page, says }` (a path on the target, since the tour is the live page; one per study, never on a task), `independent: true` (goals are randomised in order), `video: true` (adds the screen as a video to the event replay; `init` writes the hint as a comment in `ui-tests.config.ts`). Optional goal fields: `start` (where the person lands; default the first page of `happyPath`, else `/`), `target` (agent runs: the surface this one goal points at, overriding the context's, as in the guide's `task('add a member through the API', { target: { http: 'https://api.weekboard.app' } })`), `catch` (human runs; now `sample` on the study), `trials` (agent runs, default 5), `timeout`, `minutes`, `primary` (the goal that carries the context's result when there are several), `scenario` to pin wording after review. A `task` takes an optional check with the same signature as `outcome`, evaluated against the snapshot at that step's done: `task('choose the new plan', async ({ page }) => expect(page.url()).toContain('/plans'))`.

## Lint

Runs on `ui-tests lint`, in dev mode, and before any run. Each rule prints its reason in one line, because the author wants to learn, not only obey.

| Rule | Example | Source |
| --- | --- | --- |
| No interface terms in a goal or its card | a word that appears on a control of the target site, such as "Members" or "Add", in the task's name or the scenario card, so the card cannot hint where to click; allowed inside steps, where the question is execution. Today the rule checks a fixed list of interface words (click, button, menu and the like) in the task's name | NN/g task writing |
| One outcome per goal | "understand what it does and start" is two; split, and let the derived first look carry "understand" | MeasuringU task tips |
| Outcome present | a goal with neither `outcome` nor `minutes`; a goal with `minutes` and no `outcome` warns that it yields issues only | this contract |
| Hook not weaker than the goal | URL match for a permission goal, or for "understand" | MeasuringU validation methods |
| Goals independent | an earlier goal reveals a later answer | NN/g |
| One primary goal | several goals with outcomes and no `primary` | this contract |
| Context under 30 minutes | ten goals with long paths | MeasuringU online study time |
| Users and purpose named | `users: 'anyone'`, or a purpose that names the product instead of what the person is trying to do | this contract; Young |
| Users valid (`users-valid`) | an unknown field, an object without `did`, a `within` that is not a window, a `role` that is neither a list nor counts, a quota that is not a whole number above zero, `role` counts beside `groups`, a country that is not an ISO code, `age.min` above `age.max`, a `firstLook.page` that is not a path, a separate `screen` key (the fix moves its fields under `users`), `firstLook` on a task (the fix moves it to the study) | this contract |
| Users inferred (`users-inferred`) | `users` as a sentence alone: a warning with the inferred draft printed as a `users: { did, ... }` object in TypeScript | screener research |
| Users gated (`users-did`) | a sentence with no `did` in it: a warning that the screener has no gate | screener research |
| One group (`one-group`) | `role: ['Developer', 'Designer']`: a warning, "treated as one group; write `role: { … }` with counts to sample them separately" | Sauro; Krug; Hanington |
| Exclusion covered (`not-covered`) | a `not` item a default exclusion already covers, such as "I work in UX research": a warning that it is dropped | Nielsen PWU; Krug, Rocket Surgery |
| Professionals and roles (`professionals-conflict`) | `role: ['Designer']` with `professionals: 'exclude'`: an error naming `professionals`, because the exclusion would reject an accepted role | Nielsen PWU |
| Five screens before consent (`screens-before-consent`) | more than five screener questions before consent | GDD: the ideal screener is short |
| Purpose kept back (`purpose-leak`) | the purpose itself in any text shown before the first look, or a drafted option that contains a content word of `purpose` not on the start page | Krug DMMT: the first look starts cold |
| Snapshot current (`screener-snapshot`) | the snapshot is missing, holds a value nobody drafted, or is out of date: a warning in lint and rehearsal, which runs labelled draft; `recruit` and `check` refuse | GDD; Portigal: review the screener before recruiting |
| Actor admitted | `--actor agent` on a context with `actors: ['human']`, or `actors` including `human` on a `target.cli`, `target.mcp` or `target.http` | this contract |

Lint failures block a run and name the fix. Warnings appear in the trace.

`ui-tests lint`, dev mode and `ui-tests recruit` print the plan before anything starts, with the recording level on its own line, for example "Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive 1.5×)"; without `record: 'video'` the line names event replay alone.

## CLI

| Command | Does |
| --- | --- |
| `ui-tests init` | Writes the study file and `ui-tests.config.ts` (the Weekboard example, as the landing shows it in `apps/web/lib/example.ts`) and prints the script tag for the app's HTML layout, with one line per setup on reading the server's address from the environment: Vite `%VITE_UI_TESTS_URL%`, Astro `import.meta.env.PUBLIC_UI_TESTS_URL`, Next.js `process.env.NEXT_PUBLIC_UI_TESTS_URL`, Rails `ENV["UI_TESTS_URL"]`, plain HTML the address itself |
| `ui-tests serve [--port <n>] [--bind <addr>]` | Starts the ui-tests server: the script the tag loads, the player, the collector, the shareable report and `/healthz`. `PORT` or `--port` (default 4300), `--bind` (default `0.0.0.0`), `UI_TESTS_PUBLIC_URL` (the address people reach it at, an absolute http(s) origin; a malformed one is refused), the store from `UI_TESTS_DATABASE_URL`, else SQLite under `UI_TESTS_DATA_DIR` or `.ui-tests/`, and `UI_TESTS_SHARE_SECRET`, `UI_TESTS_CLI_SECRET`, `UI_TESTS_TRANSCRIBER`. Prints its address and the tag for it. The Docker image, built from a clone with `docker build -t ui-tests .` and run with `docker run -p 4300:4300 -v ui-tests:/data ui-tests`, runs the same command with its store on the volume `/data`; it is to be published as `ghcr.io/miguel-perez/ui-tests`. Rehearsal starts the server itself when `server.url` is an http address on this machine and none answers there |
| `ui-tests` | Dev mode: runs the whole study on you, in your browser, against `target.url`, with the ui-tests server at `server.url` (started when it is an http address on this machine and none answers there; a server elsewhere must already answer): the consent, the first look, the scenario card, your page with the bar, the questions after, then your own trace (you are not screened; with a missing or out-of-date snapshot the plan and the player label the screener and the first look as drafts); the outcome runs; recruits nobody, costs nothing, and the attempt never counts toward n |
| `ui-tests recruit [--tunnel \| --host <name> \| --local]`, and `ui-tests --actor agent` for an agent run | Async run of one context for one actor (runs with your own invite links are built (inviting visitors is not), [#71](https://github.com/miguel-perez/ui-tests/issues/71), and so are agent runs, [#72](https://github.com/miguel-perez/ui-tests/issues/72); paying a panel is R3 and not built): refuses, exiting 1 and naming `<study file>.screener.snap`, while a human study's snapshot is missing or out of date; then creates the run with an idempotency key derived from commit, context id and actor, returns a durable handle, exits 0; a repeated key returns the existing run. `--tunnel` serves a local build and a ui-tests server of the command's own through one front door and a run-scoped tunnel, for a run the author watches for a few hours; `--host <name>` serves them through the front door to people inside a network, on that name; if the machine closes mid-run the link goes dark, and the next `recruit` with the same key resumes the same run while the deadline keeps counting; a longer or unattended run uses a ui-tests server the author keeps up, `ui-tests serve` or the Docker image on a machine people can reach, with the app deployed; `ui-tests host` will make that one command (not shipped yet: [#59](https://github.com/miguel-perez/ui-tests/issues/59)). See [`05-integration.md`](05-integration.md#when-the-laptop-closes) |
| `ui-tests recruit --wait` | Same, then polls to completion; exit codes 0 none found, 1 problems found, 3 pending or inconclusive, 2 error |
| `ui-tests verify <run>` | Executes the hooks against stored snapshots for attempts not yet verified; CI runs it on the reconciliation schedule |
| `ui-tests status <run>` | Independent states: recruitment, collection, verification, payment |
| `ui-tests report <run>` | Human report, `--json`, or `--share` for a signed public link |
| `ui-tests trace <run>` | Opens the trace viewer |
| `ui-tests check` | In the job that deploys the preview: the same run as `recruit`, one per pull request, with the cap in the config as the yes, and a check on the pull request; see CI below |
| `ui-tests lint [-u]` | Lint only, no run. `-u` drafts or updates each study's `<study file>.screener.snap` with the configured model and the start page, and names every field it could not draft |
| `ui-tests estimate` | Derived n, minutes, incentive, and cost per source before anything is spent |
| `ui-tests host [--panel prolific\|connect]` | Until it ships, `ui-tests serve` and the Docker image are the way to run the server. The no-repo path ([`05-integration.md`](05-integration.md#where-things-run)): deploys the collector, the player and the store to a free tier in the author's own account (first provider: Cloudflare Workers with R2 and D1; the contract is provider-agnostic, a container plus a bucket); prints the collector and player URLs, the store name and the panel state, and the one line to paste on the live site. `--panel` adds the author's own Prolific token or Connect key to the deploy. Idempotent: run it again to update. Until the deploy ships ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) it prints what it will do and where, and exits 2 with "host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59" |
| `ui-tests mcp` | Serves the commands above as MCP tools with the same arguments, outputs and guards; see [`05-integration.md`](05-integration.md) |

`--json` keeps stdout for structure and stderr for diagnostics.

## CI

`npx ui-tests check`, in the job that deploys the preview, starts the run and posts one check on the commit (`npx ui-tests check <run.json>` also publishes the check from a run summary you pass it): `ui-tests` for a human run, and for an agent run its own check, `ui-tests (agent)`, which never counts with people. It asks nothing: the cap in the config is the yes, and a run that cannot fit n under the cap does not start. One run per pull request: `check` derives the run's key from the pull request, the study and the actor, not the commit, so a push while people are still in starts nothing new, and the check stays with the commit they saw, which its footer names. While attempts arrive it is pending with the estimate in its summary. By default, when the run completes, its conclusion is neutral whatever the outcome, never red or green, because there is no pass to give: it never fails the build or blocks a merge, even when a team marks it required. The one opt-in is `check: { block_on: 'problems' }`, which makes it red when a completed run has problems; it is never green; an inconclusive run, with fewer attempts than it asked for, stays neutral either way. `check: { comment: false }` turns off its one sticky comment. Its titles and its page are in [`05-integration.md`](05-integration.md#github). Every pull request gets one human run by default; `ci.on` narrows which ones do, for example to a label, and a push never starts a second paid run. Agent runs are not gated by `ci.on` and start on every push, because they are fast and cost only model tokens. A scheduled reconciliation workflow runs `ui-tests verify` and updates the check from `ui-tests status` until it completes, the same pattern the factory uses for delivery status. `check` passes the Vercel protection-bypass token into invite links so participants reach a protected preview.

## Reporters

`default` prints the issues and the sentence. `github-actions` annotates the check. `json` writes the run record described in [`05-integration.md`](05-integration.md). `junit` is a planned omission.
