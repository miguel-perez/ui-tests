# Agent studies

An agent run proves that an agent can do the thing against a CLI, an MCP server, an API, or a website. It is a separate actor, never a stand-in for people, and it never shares a report, a count, or a result with a human run. Demand for synthetic users as stand-ins exists in the accounts; this product declines it by design, because the only published comparison shows agents succeeding 0 to 25% of the time where humans succeed 62 to 95%.

## Separation

- One test file serves both actors. The actor is chosen per run, never mixed within a run, and `--actor both` is refused. A context declares which actors it admits; the lint rejects a run with any other.
- `actor` is a required field in the run record's schema. Human and agent runs are separate records and separate files; no aggregate is ever computed across them.
- The GitHub check is named `ui-tests (human)` or `ui-tests (agent)`. Reports, JSON records and the trace viewer label the actor on every screen. The `default` reporter prints agent results under a heading that says "capability test, not usability".
- Nothing from an agent run enters a human sample size, incentive, or result, and nothing from a human run enters pass^k.
- The pitch, the site, and the docs never describe agent runs as usability testing. They are capability tests.

## Targets and harnesses

| Target | Harness | What the agent gets |
| --- | --- | --- |
| web | Playwright-driven browser agent through the same player humans use | the scenario text and a browser |
| cli | sandboxed shell with the package installed | the scenario text, a working directory, the binary |
| mcp | an MCP client connected to the server under test | the scenario text and the server's tools |
| http | an HTTP client with the API's description | the scenario text and the base URL |


## The same file, run as an agent

```ts
// cli-first-run.ui.test.ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'developers trying ui-tests for the first time',
  purpose: 'find out whether people can use what I built',
  actors: ['agent'],
  target: { cli: 'npx ui-tests' },
}, () => {
  goal('install ui-tests and get a result on the example', {
    happyPath: ['npm i -D ui-tests', 'npx ui-tests'],
    trials: 5,
  }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
    })
  })
})
```

`ui-tests run --actor agent` runs this with the cli harness and the configured model, five trials, fixtures reset between trials. A context on `target.cli` that lists `human` in `actors` fails lint, because a human terminal harness is a planned omission. The same context against `target.url` could admit both. The inputs are unchanged. `trials` replaces sample size for agent runs; the scenario wording is given to the agent as its prompt.

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

Default `reliability: 'all'`: pass if every trial verified correct, fail if any verified incorrect, inconclusive if any unknown and none incorrect. Agent results may be used as an optimisation signal; human results may not. Report the per-trial table with the trace link for each.

## What this does not claim

An agent passing says nothing about people. An agent failing on a website is a reason to look at the trace, not a usability finding. The site and the docs say this where agent studies are introduced.
