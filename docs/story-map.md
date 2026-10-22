# Story map: ui-tests

Built with Patton's five steps: frame, map the big picture, explore, slice viable releases, slice a development strategy. Cards are short verb phrases. Details hang under each task, most necessary first, tagged with the slice that ships them. Each slice is a complete walk across the backbone and ends with Miguel using it.

**Status:** R0, R1 and R2 are built and verified offline, from a clean clone: the `ui-tests` package with its script tag and the ui-tests server (`npx ui-tests serve`, or the Docker image) that runs the player, collector and report, and the landing page as a static site carrying the tag. What needs an account or a person is documented, not executed: `npm publish`, publishing the Docker image, a ui-tests server for a Vercel preview, a Neon database, a GitHub token or App and the repository secrets, `ANTHROPIC_API_KEY`, a named cloudflared tunnel, and the VoiceOver check on Safari. R1 and R2 have not had their check-ins, and neither release metric has been measured. R3 (paying a panel), the hosted track and `ui-tests host` ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) are not built.

## Frame

- **What:** a usability test runner that runs like unit tests; see [`pitch.md`](pitch.md).
- **Who:** the three personas in [`personas.md`](personas.md), the participant, the agent under test, the consumer workflow. The author is also the chooser.
- **Why:** prove the rung your tests don't, to the ISO 9241 definition, from the same pipeline, from $60 a run, with no research background; and say whether people want it before you polish it.
- **Success metrics:** install to first result under one afternoon; fewer than one override per context; at least one problem acted on per run; from $12 a person with a panel; our own landing study's sentence.

## Backbone (narrative flow, top to bottom)

Patton draws the backbone left to right; it is turned on its side here so the table fits a page. Read each row as one activity and its tasks in order.

| Activity | First | Then | Then |
| --- | --- | --- | --- |
| **Discover** | Land on the site | Understand what it is for | Take the first step |
| **Set up** | Install the package, the skill, or paste the snippet | Add a config | Point at a preview, a live site, or a tunnel to localhost |
| **Author** | Name the users and the purpose, write a goal, steps if the route matters | Write the outcome | Fix the lint |
| **Rehearse** | Run it on myself | See the generated scenario | Watch the replay |
| **Run** | Run it in CI against a preview, or from the hosted UI | Invite people, or let the site invite them | Spend within a cap |
| **Participate** | Screen and consent | Take the first look, try the goal | Answer the questions after |
| **Verify and report** | Verify through the outcome in the runner | State the sentence and the issues | Open the trace, share the report, hand the record to an auditor |
| **Iterate** | Read the issues and fix | Re-run on the new build | Promote a path people took |
| **Integrate** | Feed the record to a workflow | Await the handle in a DAG | Keep humans and agents apart |

## Body

### Discover › land, understand, start
- Landing page structured as the ladder: functional and reliable are yours, usable, desirable and pleasurable are measured here; leads with the issue list and the sentence; shows the context file `R0`
- Getting-started page gets to a first result with copy-paste commands `R0`
- The site is itself the first context under test `R0`
- The README carries the same promise and example; the public repo is the second door, with stars, views and clones reported beside the study, never as a verdict `R0`
- Agent studies introduced as capability tests, explicitly not usability `R2`
- Hosted install-once explained for people without a repo `H1`
- Pricing: free with your own participants, per-run cap with a panel `R3`

### Set up › install, config, preview, snippet
- `npm i -D ui-tests` and `npx ui-tests init` writes config, the example, and the Vitest exclude `R0`
- One script tag in the app's layout, any framework, loads the recorder and taskbar from the ui-tests server only while a person is in an attempt; the player runs on that server (`npx ui-tests serve`, or the Docker image) `R0`
- SQLite store in dev `R0`
- Postgres store, independent of any preview, shared by the ui-tests server and the CLI in CI `R1`
- Panel tokens from env `R3`
- The same tag through a tag manager; hosted UI with the same inputs `H1`
- Skill installable with `npx skills add` or as a plugin `R2`
- `ui-tests mcp` serving lint, estimate, run, status, verify, report, trace `R2`

### Author › goal, happy path, hook, impression, lint
- `context` with `users` and `purpose`, `goal`, `task`, `outcome`, `expect`, `beforeEach`; the four shapes of a goal `R0`
- Lint with rule sources and reasons `R0`
- Scenario generated from goal and fixture names, editable, pinnable `R0`
- `participant.answer()` with distractors the author writes or reviews in the snapshot (a count's neighbours, else drafted by the model) `R0`
- First look derived from the context: the home page tour of the live start page, coded per part against what the page says; each task's first click on its own start page `R1`
- The `sample` intent (catch problems); the sentence derived from it `R0`
- `actors` on a context; `trials`; `ui-tests run --actor agent` `R2`

### Rehearse › dev mode
- `ui-tests` opens the player with me as a rehearsal participant; never counts toward n `R0`
- Hook runs in the runner against the stored snapshot; trace renders `R0`
- Rehearsal median seeds timeout and incentive estimate `R3`

### Run › CI, invite, cap, intercept
- `ui-tests run` with an idempotency key returns a handle and exits `R1`
- GitHub check pending, reconciled on a schedule with `verify` and `status` `R1`
- Invite links with the Vercel protection-bypass token `R1`
- `ui-tests run --tunnel` from a local build, run-scoped, token-gated `R1`
- Inside-the-perimeter and local-only modes documented and tested on a LAN `R2`
- `ui-tests estimate` before spend `R3`
- Prolific adapter: publish, submissions, approve, bonus, webhooks `R3`
- Budget cap with reserve enforced before publish `R3`
- Struggle detectors on the live site invite visitors `H2`
- Connect adapter and the bandit router `R4`

### Participate › consent, task, questions
- Consent naming purposes, scenario card, floating taskbar, done or can't; all white-labelled `R0`
- Screener with behavioural and panel questions, groups with quotas, decoys drafted into a reviewed snapshot; practice screen `R1`
- SEQ, confidence, UX-Lite `R1`
- Keyboard and screen-reader operable; access conditions recorded `R1`
- Attention item and speeder flag, flagged not excluded; hashed duplicates excluded from n and paid `R3`
- Screen recording opt-in `R2`
- Companion mode on a live site `H1`

### Verify and report › hook, issues, sentence, trace
- Hook runs after the attempt; correct, incorrect, unknown with diff `R0`
- The sentence from `catch` inputs; "problems found" or "none found at this n" `R0`
- Issue signals from give-up, dead click, pause and deviation in a single attempt `R0`
- Issues from trace signals across people, ranked, three most serious per goal `R1`
- Event replay highlight reel `R1`
- Shareable report page by signed link `R1`
- The first look's coded parts and uncoded answers beside the issues; groups with their n; measures named effectiveness, efficiency, satisfaction `R1`
- Clause-evidence section in the record `R1`
- pass^k and per-trial table for agents `R2`

### Iterate › fix, re-run
- Revisions: exclude with reason and keep paid, pin wording, adjust incentive, edit issues, promote a taken path to the happy path `R1`
- Re-run on a new build keeps the old record `R1`

### Integrate › record, handle, separation
- JSON run record with published schema and consented purposes per attempt `R1`
- Webhook on result `R1`
- One actor per run; separate records and checks; `actor` required in the schema `R2`
- Consumer rules: purposes gate reading; human runs are not a fitness signal `R2`

## Release slices

Order follows the opportunity map in [`discovery/redesign.md`](discovery/redesign.md): being shown the problem (opportunity 14.0) and knowing what a finding means (8.7) lead every slice they can; a method in an afternoon (6.1) is R0's whole point; participants and price (4.7, 4.3) are R3; the agent capability test (4.6) and the factory plug (4.2) are R2 because they are cheap and dogfood on every push; install-once (4.0) is well served by analytics tools already, so the hosted track follows R3 unless a persona-3 user appears first. The walking skeleton carries a little of every backbone activity, so R0 includes the first issue signals, not only the sentence.


### D0: "The audience and the goal come from people's own words"
- **Outcome:** proto-personas and purposes derived with purpose-graphing from public first-person accounts, replacing the audience sentence and landing goal we specified ourselves.
- **Status:** done; see [`discovery/report.md`](discovery/report.md) and [`personas.md`](personas.md).

### R0: "I understand it, and I tested our own site on myself"
- **Outcome:** the author can read the site, install, write the landing context, run it on themselves, and see the outcome, the first issue signals, the sentence and a trace. No CI, no strangers, no money.
- **Serves:** opportunities 1 and 2 at their smallest: an issue list from one attempt, and the sentence that says what one attempt cannot say; a method in an afternoon.
- **Metric:** Miguel completes the loop from a clean clone in one sitting; the generated scenario and sentence need no edits; giving up on the goal produces at least one issue in the trace. Secondary, once the repo is public: GitHub traffic and stars over the first weeks, read as interest in the promise, not as evidence the product works.
- **Development strategy:** opening game. Site on Vercel with landing and getting-started; the script tag with recorder and taskbar; the ui-tests server with the player, the collector and the SQLite store; compile and lint; `answer()`; outcome run by the runner; single-attempt trace with issue signals from give-up, dead clicks, pauses and deviation; the sentence.
- **Confirmation:** from a clean clone, `npm ci && npm run dev`, then `npx ui-tests` in `apps/web`: the rehearsal of the landing study reaches the getting-started page, prints the outcome, the issue signals and the sentence, and opens the trace.
- **Check-in:** Miguel runs it, decides whether the contract holds, and decides whether to make the repository public with the README as the second door.
- **Status:** built and verified offline, 20 October 2026, from a clean clone; production at https://ui-tests.com, repository public. Built: the package with its authoring API, config loading, compile and lint; the CLI (`init`, `lint`, dev mode, `serve`, `verify`, `status`, `report`, `trace`); the script tag (recorder, retry buffer, bar), and the player and the collector on the ui-tests server; the SQLite store; verified outcomes, signals and the single-attempt trace; the getting-started page and a rehearsal of the landing study. The landing's content, block by block, is [`design/landing-content.md`](design/landing-content.md). The package is not on npm (documented: `npm publish`), so install is from a clone with `npm ci && npm run dev`. Miguel's R0 check-in has not happened.

### R1: "Real people from my audience, by link, from CI"
- **Serves:** opportunities 1 and 2 at n = 5: ranked issues across people, the sentence with real counts; the factory plug through the CI check; evidence for the room through the shareable report; who took part and what the first look got across, for the desirable rung.
- **Outcome:** a run from CI against a protected preview, invite links shared by hand, five people from our own network complete the landing context with its screener and first look, the issues and the sentence come back on a shareable page, the GitHub check completes.
- **Metric:** the false-door study: do five people from our audience understand the value proposition and start? The issues say what to change. Each of the five is recorded with their group and how they differed, criterion by criterion.
- **Development strategy:** mid game. Idempotent async run and handle, GitHub check and reconciliation with `verify`, Postgres store, protection bypass in invite links, full participant flow with screener, questions and accessibility, first look, issues from trace signals, event replay reel, shareable report, revisions, JSON record with purposes and clause evidence, webhook.
- **Check-in:** Miguel reads the issues from five people and decides what to change on the site, and whether the personas held.
- **Status:** built and verified offline, 20 October 2026; not checked in and the metric is not measured. Built: idempotent `recruit` runs with a handle and invite links (your own; inviting visitors on a live site is H2 and not built) that pass the Vercel protection bypass, `--tunnel` (tested with a local reverse proxy), `--host` and `--local` for runs inside a perimeter or on one box; the full participant flow (screener, first look, scenario card, the questions after with voice, keyboard and screen reader support); issues clustered across people, the highlight reel, the signed shareable report, revisions, the JSON record with its schema, purposes and clause evidence; the Postgres store (tested on PGlite); `ui-tests check` with its reconciliation workflows and the webhook. Documented, not executed: a Neon database, a ui-tests server for a Vercel preview, the GitHub token or App and the repository secrets ([`github-check.md`](github-check.md), [`postgres-store.md`](postgres-store.md)), a named cloudflared tunnel ([`tunnel.md`](tunnel.md)), and the VoiceOver check on Safari. Paying a panel is R3: `recruit` makes your own link, not a paid run. Still needed: the metric itself, five real people from our audience doing the landing study.

### R2: "Agents can use our CLI and API, and nobody confuses that with people"
- **Serves:** the agent capability test nobody sells, and the factory plug on every push at token cost; watching, through screen recording opt-in.
- **Outcome:** the same test files run with `--actor agent` against the ui-tests CLI and the collector API with pass^k and per-trial traces, reported apart from human runs; the landing study runs as an agent on every push; screen recording opt-in for humans lands alongside.
- **Metric:** a fresh agent installs ui-tests from the README and reaches a result in all five trials; the same with the skill loaded and through the MCP server.
- **Development strategy:** cli and http harnesses, web harness through the player, `actors` and `trials`, separate records and checks, lint for admitted actors, consumer rules, the skill and the MCP server, the docs section that says what agent runs are not.
- **Check-in:** Miguel reads an agent trace next to a human trace and confirms they cannot be mistaken for each other.
- **Status:** built and verified offline, 20 October 2026; not checked in and the metric is not measured. Built: `actors` and `trials` in the contract, cli, http, mcp and web harnesses, pass^k and pass@k, agent runs recorded and checked apart (`ui-tests (agent)`) with their own consumer rules, lint for admitted actors, the skill and the MCP server (`ui-tests mcp`), the docs page that says what agent runs are not ([`agent-runs.md`](agent-runs.md)), and screen recording for humans behind `record: 'video'`. Trials are tested with the `scripted` provider. Documented, not executed: `ANTHROPIC_API_KEY` for the `anthropic` provider, so no trial has run with a real model. Still needed: the metric itself, a fresh agent installing ui-tests from the README and reaching a result in all five trials with a real model, which also waits for the package to be published.

### R3: "Strangers I never met, fairly paid, within a cap"
- **Serves:** participants who match without a sales call, and a price one person can pay; the promise "it recruits the people" becomes true.
- **Outcome:** a run recruits from Prolific with the author's token, pays by formula, enforces the cap with its reserve, trues up, and reaches n without the author touching the panel.
- **Metric:** time to fill under the deadline; no-show under 10%; about $10 a person; zero payment disputes.
- **Development strategy:** estimate command, Prolific adapter, incentive formula with raise rule and true-up reserve, quality flags, pricing on the site.
- **Check-in:** Miguel funds one run of the landing study and decides whether the price and speed match the promise.

### H1: "Paste a snippet, run it from a page" (hosted track, after R3, or earlier if a persona-3 user asks)
- **Serves:** the largest persona bundle and the "priced out" charge; install-once itself is table stakes, tasks and the sentence on top of it are not.
- **Outcome:** a person with a live site and a tag manager, no repo, runs `ui-tests host` once, defines the same inputs in a form on that deploy, invites by link, and gets the issues, the sentence and the shareable report. Companion mode on the live site; success by URL, element or question.
- **Metric:** one persona-3 user from the D0 accounts' population completes a run without talking to us.
- **Check-in:** Miguel watches a designer with no repo get a result.

### H2: "The site invites the people who are struggling" (hosted track, after H1)
- **Serves:** participants who match by construction, and long-term monitoring for the record.
- **Outcome:** struggle detectors on the live site invite visitors mid-task; acceptors become participants; the report labels the source and keeps them out of the counts.
- **Metric:** acceptance rate of the invitation and issues found per accepted visitor.
- **Check-in:** Miguel decides whether the invitation is welcome or creepy, from the visitors' words.

### R4, later: "Keep it fed"
Connect adapter and the bandit router, partner panels, team review, pricing for hosted.

## Planned omissions
Figma prototypes, mobile native, moderated sessions, SUPR-Q, think-aloud recording, synthetic users as stand-ins, framework adapters or plugins: one script tag serves every framework.
