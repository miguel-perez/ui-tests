# Agent studies

An agent run proves that an agent can do the thing against a CLI, an MCP server, an API, or a website. It is a separate actor, never a stand-in for people, and it never shares a report, a count, or a result with a human run. Demand for synthetic users as stand-ins exists in the accounts; this product declines it by design, because the only published comparison shows agents succeeding 0 to 25% of the time where humans succeed 62 to 95%.

## Separation

- One test file serves both actors. The actor is chosen per run, never mixed within a run, and `--actor both` is refused. A context declares which actors it admits; the lint rejects a run with any other.
- `actor` is a required field in the run record's schema. Human and agent runs are separate records and separate files; no aggregate is ever computed across them.
- A human run's GitHub check is `ui-tests`; an agent run posts its own check, `ui-tests (agent)`, once agent runs ship, and the two are never merged into one. Reports, JSON records and the trace viewer label the actor on every screen. The `default` reporter prints agent results under a heading that says "capability test, not usability".
- Nothing from an agent run enters a human sample size, incentive, or result, and nothing from a human run enters pass^k.
- The pitch, the site, and the docs never describe agent runs as usability testing. They are capability tests. The site introduces them as "Agents use some interfaces, too.": an API, an MCP server and a CLI have a second kind of user, an agent that reads text, not pixels; the same file pointed at that surface runs five trials that show whether it gets through; "It is a capability test, not a usability one, and it never counts with people." Nothing on the site or in the docs presents an agent run as taking a person's place, in those words or any others, because that casts the agent as a substitute ([`../discovery/agent-section-research.md`](../discovery/agent-section-research.md)).

## Targets and harnesses

| Target | Harness | What the agent gets |
| --- | --- | --- |
| web | Playwright-driven browser agent through the same player humans use | the scenario text and a browser |
| cli | sandboxed shell with the package installed | the scenario text, a working directory, the binary |
| mcp | an MCP client connected to the server under test | the scenario text and the server's tools |
| http | an HTTP client with the API's description | the scenario text and the base URL |

The site shows the three text surfaces, `target: { http }`, `target: { mcp }` and `target: { cli }`, run with `npx ui-tests --actor agent` (agent runs are not shipped yet: [#72](https://github.com/miguel-perez/ui-tests/issues/72); today the command prints the plan and stops); `target.url` with the web harness is the same contract on a website. A target sits on the study, or on one task to override it, as in the guide's `task('add a member through the API', { target: { http: 'https://api.weekboard.app' } })`.


## The same file, run as an agent

```ts
// cli-first-run.ui.test.ts
import { study, task, outcome, expect } from 'ui-tests'

study('first run', {
  users: 'developers trying ui-tests for the first time',
  purpose: 'find out whether people can use what I built',
  actors: ['agent'],
  target: { cli: 'npx ui-tests' },
}, () => {
  task('install ui-tests and get a result on the example', {
    path: ['npm i -D ui-tests', 'npx ui-tests'],
    trials: 5,
  }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
    })
  })
})
```

`npx ui-tests --actor agent` runs this with the cli harness and the configured model, five trials, fixtures reset between trials. A study on `target.cli` that lists `human` in `actors` fails lint, because a human terminal harness is a planned omission. The same study against `target.url` could admit both. The inputs are unchanged. `trials` replaces sample size for agent runs; the scenario wording is given to the agent as its prompt.

An agent is model plus harness plus context: provider and version, system instructions, visible tools, permissions, and budgets, set in the config under `agents` and pinned into the compiled run. Changing any of them is a different run.

## Measures

| Measure | Definition |
| --- | --- |
| Verified completion per trial | the hook, run by the runner against the trial's end state, as for humans |
| pass^k | all k trials verified correct; the default result |
| pass@k | at least one; reported, never the result unless `reliability: 'any'` |
| False success | the agent claimed done and the hook said incorrect |
| Recovery | trials that hit an error and still verified correct |
| Cost | tokens, calls, wall time, and metered dollars per trial, failures included |
| Side effects | changes outside the happy path's scope, from the fixture diff |

Fewer calls are not better by themselves. Asking a clarifying question when the scenario is ambiguous is reported as a behaviour, not a failure.

## Result

A trial reads `verified` when the hook says correct, and `stopped` when the hook says incorrect, including a trial that ended on an error, a refusal or its budget before reaching the end state; a stopped trial is `incorrect` for the result. A trial whose hook cannot read its evidence is `unknown`, shown as such, never as stopped. Default `reliability: 'all'`: pass if every trial verified correct, fail if any verified incorrect, inconclusive if any unknown and none incorrect. Agent results may be used as an optimisation signal; human results may not. Report the per-trial table with the trace link for each: each trial reads `verified`, `stopped` or `unknown`, with its time and, when it stopped, what stopped it in one line ("called POST /invites, which does not exist"; "sent the email in the query string, 400"). The agent report has its own address and its own check, and never appears inside a human report.

## What this does not claim

An agent passing says nothing about people. An agent failing on a website is a reason to look at the trace, not a usability finding. The site and the docs say this where agent studies are introduced.
