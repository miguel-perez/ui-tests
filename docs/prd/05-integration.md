# Integration

## Where things run

| Piece | Runner track | Hosted track |
| --- | --- | --- |
| Recorder, taskbar, player | SDK mounted in the author's Next.js app through a root-layout component, active only when a run cookie is present | One snippet through a tag manager or `<script>` on the live site, companion mode |
| Collector | Route handler in the author's app, writes to the run store | the author's deploy |
| Run store | SQLite file in dev; Postgres on previews and in CI; independent of any deployment | the deploy's store (D1 on the first provider), recordings in the author's bucket (R2) |
| Hooks | Run by `ui-tests verify` in CI or on the dev machine against stored end-state snapshots; never inside the app under test | Success checks by URL, element or question, evaluated on the deploy |
| Context definition | `*.ui.test.ts` | a form on the deploy with the same inputs |
| Participants | link, panel by the author's key | link, panel by the author's key, intercept |
| Payment | author's panel wallet, cap per run | author's panel wallet, cap per run; for intercept a cap per day, on the deploy |
| Output | the run record, trace, shareable report page, GitHub check | the same record, trace and report page |

The candidate build can record and store attempts; it cannot judge them. Hooks, happy paths and expected answers never ship to the app or the player. The run record outlives any preview because it lives in the store, and `ui-tests status`, `verify` and the GitHub check read the store, not the preview.

Any framework can implement the recorder and collector contract; it is a handful of HTTP endpoints with JSON schemas. Next.js is the one shipped. The hosted track is the same compiler, lint, sentence, issues and trace with a different install path and host: the author's deploy, made by `ui-tests host` ([`01-dx-contract.md`](01-dx-contract.md); [`../discovery/hosting-decision.md`](../discovery/hosting-decision.md)). There is no service operated by ui-tests.com; recordings, panel accounts and payment are the author's. The command's contract is provider-agnostic, a container plus a bucket; the first provider is Cloudflare Workers, with R2 as the bucket and D1 as the store. Until the deploy ships ([#59](https://github.com/miguel-perez/ui-tests/issues/59)) `ui-tests host` prints what it will do and where, and exits 2 with "host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59".

## Reachability

Participants have to reach the build. The mode is declared in the config, shown in the trace, and limits what a run can license. The link `ui-tests recruit` prints (runs with your own invite links are built; the visitors source is not: [#71](https://github.com/miguel-perez/ui-tests/issues/71)) can point at a branch preview, at the author's laptop through a tunnel, or at the live site: the first three rows.

| Mode | How participants reach the build | Where the collector and store live | Limit |
| --- | --- | --- | --- |
| Public preview | A Vercel preview with the protection-bypass token in the invite link | In the app; the Postgres store | Needs a deployment |
| Tunnel from a local machine | `ui-tests recruit --tunnel` opens a short-lived cloudflared or ngrok tunnel to `localhost`, scoped to the run and closed at the deadline or when the process exits, whichever is first | On the dev machine; SQLite | The machine must stay up, so it fits a run the author watches for a few hours: rehearsal, or a link sent to a few people. A longer or unattended run, a paid-panel run, which stays open until its deadline (48 hours unless the author sets one), and the visitors source, which listens all the time, need `ui-tests host`, which is not shipped yet ([#59](https://github.com/miguel-perez/ui-tests/issues/59); [`../discovery/hosting-decision.md`](../discovery/hosting-decision.md)). See "When the laptop closes" below |
| The author's deploy | Participants reach the live site | The collector and store live on the deploy | The provider's free tier |
| Inside the perimeter | Invite links on the internal hostname; collector, store and runner all run inside; nothing crosses the boundary unless the author exports the record | Inside | Participants must be inside too: employees, a lab, a LAN; panels and the hosted track do not apply |
| Local only | As inside, with the runner on the same box and participants in the room | On the box | Hallway testing with a recorder and a trace |

The tunnel URL alone opens nothing: every request through it needs the participant token issued at invite and scoped to one run, as the collector requires everywhere. The tunnel URL is recorded in the trace so a leak is traceable.

### When the laptop closes

A tunnel run comes with `recruit --tunnel` ([#71](https://github.com/miguel-perez/ui-tests/issues/71)); it lives as long as the machine. If the laptop closes, sleeps or loses its connection, or the process exits, mid-run:

- The link goes dark: anyone who opens it reaches nothing.
- Attempts in progress are lost. The person's page can no longer reach the collector. Its retry buffer (IndexedDB, in the person's browser; [`06-nonfunctional.md`](06-nonfunctional.md#performance-and-reliability)) keeps unsent events and replays them if the collector comes back while that page is still open; once the person closes the page, unsent events are discarded with it. What arrived of the attempt is kept as `disconnected`, never `incorrect`, and it does not count toward n. Where the consent promised pay, that person is still owed it.
- Attempts already received are kept, with their recordings, in the SQLite store on the machine.
- The same run resumes: the next `ui-tests recruit` from the same commit, study and actor derives the same key, returns the same run, and reopens the tunnel. Nothing is created twice.
- The deadline keeps counting from the run's start; it does not pause while the machine is closed. A run that reaches its deadline closed ends as any run does then, inconclusive if fewer than n attempts came in.
- A tunnel whose address changes on each start (a quick tunnel) leaves the link sent before dark; `recruit` prints the new link to send. A named tunnel keeps its address, and the old link works again.

The tunnel fits a run watched for a few hours. A longer or unattended run needs `ui-tests host`, which is always up once it ships (not shipped yet: [#59](https://github.com/miguel-perez/ui-tests/issues/59); [`../discovery/hosting-decision.md`](../discovery/hosting-decision.md)). A remote browser hosted inside a perimeter and streamed to an outside participant is a planned omission; the player and collector never assume they are public, and the runner only ever talks to the store, so it slots in without changing the contract.

## The run handle

`ui-tests recruit` derives an idempotency key from the commit, the context id (itself derived from users and purpose) and the actor, or takes one with `--key`, creates the run, and exits. From CI, `ui-tests check` derives it from the pull request in place of the commit, so a pull request gets one run and a push during it starts nothing new ([`01-dx-contract.md`](01-dx-contract.md#ci)). A repeated key returns the existing run; a lost response never creates a second paid run. The run is a durable record with independent states:

```json
{
  "run": "r_01J…",
  "key": "abc123:developers-who-ship-ui…find-out-whether…:human",
  "context": { "users": "developers who ship UI and have no researcher", "purpose": "find out whether people can use what I built, without a researcher", "id": "developers-who-ship-ui…find-out-whether…" },
  "build": { "url": "https://ui-tests-git-abc.vercel.app", "commit": "abc123" },
  "actor": "human",
  "states": {
    "recruitment": "open | filled | paused | stopped",
    "collection":  "waiting | collecting | complete",
    "verification": "pending | complete | instrumentation-problem",
    "payment":     "none | reserved | paid | trued-up"
  },
  "result": "pending | problems-found | none-found | inconclusive",
  "deadline": "2026-10-17T12:00:00Z"
}
```

Completion is observable three ways: poll `ui-tests status`, a webhook the store's service calls when `result` leaves `pending`, and the GitHub check. A consumer deduplicates on the run id and the record's revision number.

## The run record

`ui-tests report --json` writes one file per run with the compiled context, every derived field and its source rule, attempts with their consented purposes and source restrictions, measures, the ranked `issues[]` with participants, impact, words, access conditions and moment references, the impression stage results, the fit of the sample, measures named effectiveness, efficiency, satisfaction and fit, money, quality flags, revisions, and the sentence. Its JSON Schema is published and versioned; the schema id is in the file. It is the only artifact a consumer needs.

## GitHub

`npx ui-tests check` posts one check run named `ui-tests` on the commit for a human run (starting the run from CI is built: [#69](https://github.com/miguel-perez/ui-tests/issues/69); `npx ui-tests check <run.json>` still publishes the check from a run summary); an agent run posts its own, `ui-tests (agent)`, which never counts with people ([`04-agent-studies.md`](04-agent-studies.md); agent runs are built: [#72](https://github.com/miguel-perez/ui-tests/issues/72)). One run per pull request: a push while people are still in starts nothing new, and the check stays on the commit they saw, which its footer names. While pending its summary is the estimate. On completion its conclusion is `neutral` for every outcome, so it never fails the build or blocks a merge, even when a team marks it required: there is no pass to give. The one opt-in is `check: { block_on: 'problems' }` in the config: it is `failure` when a completed run found problems, and only then; an inconclusive run, with fewer attempts completed than it asked for, stays `neutral` with or without `block_on`. Its mark in the merge box is neutral, never red or green, unless `block_on` makes it red; it is never green.

Its title, one line in the merge box, is one of three:

- "{n} problems found · {x} of {n} people reached the goal" ("1 problem found" for one)
- "No problems found with {n} people · {x} of {n} reached the goal"
- "Inconclusive · only {x} of {n} attempts completed", when fewer attempts completed than the run asked for

Its page on GitHub, behind Details, is one screen with no pictures: the sentence; "This check never fails your build. It reports problems, or that none were seen this time." (with `block_on`, that it fails the build when it finds problems); the three problems to fix first, each with where it is (the page and the element), how many people, the impact and a link to the moment; the links to the report; and a footer with who took part, where it ran, the commit and the date. The rest of the problems sit folded below. No annotations and no images. Details opens this page, on GitHub; its links open the report at `/r/<run>`, and each problem's link opens its card at the moment ([`02-study-and-verdict.md`](02-study-and-verdict.md#the-report)). One sticky comment of three to five lines is updated in place, posted only when the outcome changes; `check: { comment: false }` turns it off. The reconciliation workflow runs `ui-tests verify` and `ui-tests status` on a schedule with default-branch code only. Invite links carry the Vercel protection-bypass token so participants reach a protected preview without the author's session.

## What the record evidences

ISO 9241-210 conformance is about an organisation's process, and its Annex B checklist asks for evidence per clause. A run record is that evidence for the clauses that need people. The record says so in its own words and never says more.

| Clause | What the record shows |
| --- | --- |
| 5.3 user involvement | Who was involved, selected how, with the screener and the fit of the sample to the stated users |
| 5.4 user-centred evaluation drives and refines the design | Runs against successive builds, with revisions and the issues acted on |
| 7.2 context of use specified | `users`, `purpose`, `environment`, and the recorded device, browser and assistive technology per participant |
| 7.3 user requirements | Goals with outcomes as measurable criteria |
| 7.5.4 user-based testing | Representative users performing goals, not watching demonstrations; effectiveness, efficiency and satisfaction measured against the criteria |
| 7.5.6 long-term monitoring | On the hosted track, intercept runs on the live product over time |

The record is evidence for a claim the author makes; it is not a certificate, and the product never says "compliant". For accessibility law the same holds: the record shows testing with disabled users and the issues they hit, while WCAG conformance stays with the audit and the automated checks.

## Skill and MCP server

The package ships two things for agents, out of the box:

- **A skill** (`skills/ui-tests/SKILL.md`, installable with `npx skills add` or as a Claude Code plugin) that teaches a coding agent the contract, the lint rules and their reasons, how to run in dev mode, how to read the issues and the sentence, and what a run cannot license. It carries the same text the docs carry, so an agent and a person learn the same thing.
- **An MCP server** (`ui-tests mcp`) exposing the CLI as tools: `lint`, `estimate`, `run`, `status`, `verify`, `report`, `trace`. Every tool takes and returns the same JSON the CLI does, with `actor` required on `run`, the idempotency key honoured, and purposes gating what `report` returns. The server adds no capability the CLI lacks and bypasses no guard. A factory, a DAG step, or an agent in an editor uses it to open a run and await the handle.

Both are versioned with the package. The skill's own usability is a context in this repository: an agent run against `target.cli` with the skill loaded is how we test it.

## DAG, factory, and GEPA consumers

The record is designed to be read by a workflow without a second format:

- The result is a label and the counts; the record carries the diagnostic content: the ranked issues, per-attempt deviations, hook diffs, participant words, SEQ. A workflow that reflects on failures reads the issues and the trace, not a number.
- Measures are keyed by goal, so a frontier can be kept per goal and measure.
- A run is a node that returns a handle and completes asynchronously; a workflow awaits the webhook or polls.
- Purposes gate consumption: a consumer reads words or recordings only from attempts whose consented purposes and source restrictions allow it. The record makes the check mechanical.
- Human runs are evidence for a person's decision. They are not an adaptive fitness signal: five people cannot rank candidates, and re-running until a run comes back clean is not a confirmation. A workflow that wants to optimise on human evidence needs a confirmation protocol with fresh participants and a pre-declared decision, which this product does not supply. Automated proxies, including agent studies, may be optimised on freely.
- Human records and agent records are separate files with `actor` a required field in the schema; one run has one actor.

GEPA itself, the proposer, and the candidate tree live outside this repository.
