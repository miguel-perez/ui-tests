---
name: ui-tests
description: Write, lint, run and read ui-tests studies, usability tests kept as code next to your tests. Use when a task mentions ui-tests, a *.ui.test.ts file, a usability study, recruiting people to try a feature, or a capability test of a CLI, MCP server or API with an agent.
---

# ui-tests

A study is a file, `*.ui.test.ts`, that says who the users are and what each of them is trying to do. `npx ui-tests` rehearses it on you; `npx ui-tests recruit` puts real people in front of it; `npx ui-tests --actor agent` runs the same file as a capability test with an agent. The same commands are tools of the MCP server, `npx ui-tests mcp`.

## The contract

```ts
import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', { users: { are: 'people who plan work with a team in a shared tool' }, purpose: 'plan the week together' }, () => {
  setup(async ({ request }) => ({ start: '/board', email: 'sam@acme.example' }))
  task('invite a colleague', { path: ['/board', '/settings/members'], timeLimit: '3 min' }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get('/api/test/invitations')).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})
```

- `study(name, options, fn)`: `users` (a sentence, or `{ are, did, within, often, role, uses, not, where, language, age }` with `are` required), `purpose`, `environment`, `sample: { affecting, confidence }` (default one in three, 85 percent: five people), `record: 'video'`, `firstLook`, `independent`, `actors` (default `['human']`), `target`.
- `setup(async ({ request }) => ({ start, ...values }))`: runs once for each invitation against the target; `start` is where the person lands, the other values reach `outcome` as `setup`.
- `task(name, { path, timeLimit, firstLook, start, minutes, primary, scenario, trials, reliability, target }, fn)`: one thing a person is trying to do, written as a situation and a result, never as the clicks. `path` is the route you expect and decides nothing. A `task` inside a `task` is a step.
- `outcome(async ({ request, setup, page, workspace }) => ...)`: reads the state of the app after the person says they are done, whatever page they ended on. It uses `expect`, and it is what decides whether the task was reached.
- `expect`: the assertions an `outcome` makes. `participant.answer(question, { expected, distractors })` asks a question with a known answer when the result cannot be read from the app.

The old names (`context`, `goal`, `beforeEach`, `happyPath`, `catch`, `video: true`, `impression`, a separate `screen`) are lint errors whose fix names the new one.

## The lint rules

Run `npx ui-tests lint` (or the `lint` tool) before anything is sent to people. Each finding gives the file and line, the rule, why it exists, and the fix. Fix errors first; a warning is worth reading.

<!-- lint-rules:start -->
- `renamed` (error): The authoring API took new names in issue #68; the old ones no longer do anything. Source: issue #68.
- `interface-terms` (error): A task name or scenario that names interface parts tells people where to look, so the study cannot show whether they find it. Steps may name them. Source: NN/g task writing.
- `one-outcome` (error): A task that asks for two outcomes cannot say which one failed. Source: MeasuringU task tips.
- `outcome-present` (error): Without an outcome, an answer or a time box, nothing says whether the task was done. Source: this contract.
- `hook-strength` (error): A page address says where the person ended up, not that the thing happened; for access, sharing or understanding, check the stored state. Source: MeasuringU validation methods.
- `goals-independent` (warning): When an earlier scenario contains a later answer, doing the first task gives the second away. Source: NN/g.
- `one-primary` (error): The result is read from one task; with several outcomes and no primary, it is not clear which. Source: this contract.
- `under-30-minutes` (error): Online studies lose people past about thirty minutes; the limits and five minutes of questions must fit. Source: MeasuringU online study time.
- `users-purpose-named` (error): Users and purpose describe people and what they want, not your product; naming it leads them. Source: this contract; Young.
- `users-valid` (error): The screening fields are checked before anyone is asked to match them. Source: this contract.
- `users-inferred` (warning): A users sentence is read for what people did and how recently, so the screener can ask it; guessed fields should be written down and checked. Source: this contract.
- `users-did` (warning): People are screened on what they did, not on what they say they are; without a behaviour the screener cannot ask when they last did it. Source: this contract.
- `fixture-synthetic` (warning): A real-looking address in a scenario may reach a real person; use a .example or .test address. Source: PRD 06 Privacy.
- `actor-admitted` (error): A run has one actor, and only the actors a study lists may take it; a terminal, an MCP server or an HTTP API is not something a human harness drives yet. Source: this contract.
<!-- lint-rules:end -->

## Running in dev mode

`npx ui-tests` with no command rehearses the first task on you: it prints the plan, checks the target is reachable, starts the ui-tests server when `server.url` is an http address on this machine (`http://localhost:4300` by default) and none answers there (a server elsewhere must already answer, or it exits 2), runs `setup`, opens the player there, which hands you into your own app with the bar, waits for you to press Done, runs `outcome`, and shows what it found and the trace. A rehearsal never counts toward n and never changes a result. Start the target first (`http://localhost:3000` unless the config says otherwise); if it is not reachable the command exits 2 with `target not reachable: {url}` before anything is made. A study file that throws or fails to parse exits 2 with the file and line.

Other commands, each also a tool: `estimate` gives n and minutes before anything is spent; `recruit` (the `run` tool with `actor: human`) makes a run, prints the invite links and exits, and a repeated key returns the same run; `status <run>` shows the four states (recruitment, collection, verification, payment) and the result; `verify <run>` runs the hooks on the stored snapshots; `report <run>` gives the report in words or the run record with `--json`; `trace <run>` serves the trace on this machine only. Exit codes of `recruit --wait`: 0 none found, 1 problems found, 3 pending or inconclusive, 2 error.

## Reading the issues and the sentence

The result is one of `problems-found`, `none-found`, `inconclusive`, or `pending` while people are still in. The record ranks the issues most serious first: blocked, slowed, then confused, each with where it happened, how many people hit it, the words they gave and a suggested change. Open the trace to watch the moments behind an issue. An issue is a lead to check in the trace, not a verdict on the design.

The sentence says what the sample can license. With five people at one in three it reads "Five people give an 87% chance of seeing any problem that hits at least one person in three." When none were seen it says so and adds "That is not a completion rate."

## What a run cannot license

- It does not show the product is easy to use, only that problems of that size were or were not seen this time. No problems found is not a pass, and the check never says pass.
- Five people do not give a rate. Do not report a completion percentage, a mean or a comparison between builds from one run.
- A rehearsal is you, not the audience. It never counts.
- An outcome that returns `unknown` makes the run `inconclusive`; fix the study before trusting it.
- Words and recordings belong to the people who agreed to the use you are putting them to. The `report` tool leaves out the rest.
- Do not edit a study to make the result go away. Change the product, or change the study when the study was wrong, and say which.

## Agent runs are capability tests

`npx ui-tests --actor agent` (the `run` tool with `actor: agent`) points the same file at a CLI, an MCP server, an HTTP API or a website with `target: { cli | mcp | http }` and runs five trials. It is a capability test, not usability: it shows whether an agent can get through, and it never counts with people, never shares a report or a result with a human run, and is never described as taking a person's place. A study on a cli, mcp or http target that lists `human` fails lint. By default a task passes only when every trial is verified (`reliability: 'all'`, pass^k); `'any'` is pass@k. A trial is `verified`, `stopped` or `unknown`.

## Setting up

`npx ui-tests init` writes `ui-tests.config.ts` and an example study, adds `*.ui.test.ts` to Vitest's exclude, and prints the script tag for your app, with one line per common setup (Vite, Astro, Next.js, Rails, plain HTML) on reading the server's address from the environment. The tag goes in the app's HTML layout, whatever it is built with, and does nothing until a person is in an attempt. No config is valid and runs against `http://localhost:3000`, with the ui-tests server at `http://localhost:4300`.

The consent, the questions, the collector and the shared report live on a ui-tests server the author runs while a study is open: `npx ui-tests serve` (`PORT`, default 4300; `UI_TESTS_PUBLIC_URL`, the address people reach it at; `UI_TESTS_DATABASE_URL`, else SQLite under `.ui-tests/`), or the Docker image `ghcr.io/miguel-perez/ui-tests`. Rehearsal starts one for you. `recruit --tunnel` and `recruit --host` serve the app and a server of their own through one front door on this machine, which points the app's tag at itself. Nobody operates a ui-tests service.
