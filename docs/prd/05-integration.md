# Integration

## Where things run

| Piece | Runner track | Hosted track |
| --- | --- | --- |
| Recorder, taskbar, player | SDK mounted in the author's Next.js app through a root-layout component, active only when a run cookie is present | One snippet through a tag manager or `<script>` on the live site, companion mode |
| Collector | Route handler in the author's app, writes to the run store | Our collector |
| Run store | SQLite file in dev; Postgres on previews and in CI; independent of any deployment | Our store |
| Hooks | Run by `ui-tests verify` in CI or on the dev machine against stored end-state snapshots; never inside the app under test | Success checks by URL, element or question, evaluated by our service |
| Context definition | `*.ui.test.ts` | Hosted UI with the same inputs |
| Participants | link, panel by the author's key | link, panel by held accounts, intercept |
| Payment | author's panel wallet, cap per run | our wallet, cap per run |
| Output | the run record, trace, shareable report page, GitHub check | the same record, trace and report page |

The candidate build can record and store attempts; it cannot judge them. Hooks, happy paths and expected answers never ship to the app or the player. The run record outlives any preview because it lives in the store, and `ui-tests status`, `verify` and the GitHub check read the store, not the preview.

Any framework can implement the recorder and collector contract; it is a handful of HTTP endpoints with JSON schemas. Next.js is the one shipped. The hosted track is the same compiler, lint, sentence, issues and trace with a different install path and host.

## Reachability

Participants have to reach the build. The mode is declared in the config, shown in the trace, and limits what a run can license.

| Mode | How participants reach the build | Where the collector and store live | Limit |
| --- | --- | --- | --- |
| Public preview | A Vercel preview with the protection-bypass token in the invite link | In the app; the Postgres store | Needs a deployment |
| Tunnel from a local machine | `ui-tests run --tunnel` opens a short-lived cloudflared or ngrok tunnel to `localhost`, scoped to the run and closed at the deadline or when the process exits, whichever is first | On the dev machine; SQLite | The machine must stay up; fits link runs and rehearsal, not a 48-hour panel run |
| Inside the perimeter | Invite links on the internal hostname; collector, store and runner all run inside; nothing crosses the boundary unless the author exports the record | Inside | Participants must be inside too: employees, a lab, a LAN; panels and the hosted track do not apply |
| Local only | As inside, with the runner on the same box and participants in the room | On the box | Hallway testing with a recorder and a trace |

The tunnel URL alone opens nothing: every request through it needs the participant token issued at invite and scoped to one run, as the collector requires everywhere. The tunnel URL is recorded in the trace so a leak is traceable. A remote browser hosted inside a perimeter and streamed to an outside participant is a planned omission; the player and collector never assume they are public, and the runner only ever talks to the store, so it slots in without changing the contract.

## The run handle

`ui-tests run` derives an idempotency key from the commit, the context id (itself derived from users and purpose) and the actor, or takes one with `--key`, creates the run, and exits. A repeated key returns the existing run; a lost response never creates a second paid run. The run is a durable record with independent states:

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
  "result": "pending | problems-found | none-found | pass | fail | inconclusive",
  "deadline": "2026-10-17T12:00:00Z"
}
```

Completion is observable three ways: poll `ui-tests status`, a webhook the store's service calls when `result` leaves `pending`, and the GitHub check. A consumer deduplicates on the run id and the record's revision number.

## The run record

`ui-tests report --json` writes one file per run with the compiled context, every derived field and its source rule, attempts with their consented purposes and source restrictions, measures, the ranked `issues[]` with participants, impact, words, access conditions and moment references, the impression stage results, the fit of the sample, measures named effectiveness, efficiency, satisfaction, fit and appeal, money, quality flags, revisions, and the sentence. Its JSON Schema is published and versioned; the schema id is in the file. It is the only artifact a consumer needs.

## GitHub

The action posts a check `ui-tests (human)` or `ui-tests (agent)` with the estimate as the summary while pending, then the issues, the sentence and a link to the trace. The reconciliation workflow runs `ui-tests verify` and `ui-tests status` on a schedule with default-branch code only. Invite links carry the Vercel protection-bypass token so participants reach a protected preview without the author's session.

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
