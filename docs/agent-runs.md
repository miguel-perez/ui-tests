# Agent runs: the loop and the cli and http harnesses

`ui-tests --actor agent` runs a study's tasks as agent trials: a capability test, not usability. Each task gets `trials` trials (five by default), each from a reset harness, with the task's scenario text as the agent's prompt. The task's hooks verify each trial's end state: `verified` (correct), `stopped` (incorrect, with what stopped it in one line) or `unknown` (the hook could not read its evidence). The code path is tested with the `scripted` provider; the `anthropic` provider is documented, not executed.

## The agent

Set it in `ui-tests.config.ts` under `agents`; it is pinned into the run by its fingerprint, so changing anything is a different run (key `${commit}:${contextId}:${fingerprint}:agent`; `--key` overrides, a repeated key shows the stored trials).

```ts
agents: {
  model: { provider: 'anthropic', name: 'claude-opus-5-5' },
  budgets: { calls: 30, seconds: 600, tokens: 500000, dollars: 5 },
}
```

- `anthropic`: Claude through the Messages API (`@anthropic-ai/sdk`). Needs `ANTHROPIC_API_KEY` in the environment of the command; without it the command exits 2 before making a run. Not run from here. There is no fallback to another model: a refusal is what stopped the trial.
- `scripted`: plays back a JSON file of turns named by `name` (`{ provider: 'scripted', name: './agent-script.json' }`), each `{ text?, toolCalls?: [{ name, input }], stop? }`. Offline; for tests and trying the harnesses.

Budgets default to 30 model calls and 600 seconds. A trial that reaches one ends there and its hook still runs.

## What the agent can do

- **cli** (`target.cli`): a fresh temporary directory per trial and one tool, `run`, that runs the configured command with the arguments the agent chooses. No shell and no other program. Each run stops after 120 s; stdout and stderr are capped at 64 KiB each; the environment holds no secrets (names with SECRET, TOKEN, KEY, PASSWORD, AUTH, COOKIE, SESSION, DATABASE_URL, and every `ANTHROPIC_`, `UI_TESTS_`, `VERCEL_`, `GITHUB_`, `AWS_` variable are removed). A relative path in the configured command (`node ./cli.mjs`) is a file of the project. `workspace.file(glob)` in a hook reads the trial's directory: the first matching file's text, or `null` when none matches.
- **http** (`target.http`): one tool, `request({ method, path, body, headers })`, on that origin only. Other origins are refused and redirects are not followed; 30 s per request, bodies capped at 64 KiB. A 404 reads "called POST /invites, which does not exist".

The mcp and web harnesses come next; until then those targets exit 2.

## What is recorded

Each trial is an attempt of the run (participant `agent:<task>:<n>`): its end state, its verdict, its transcript as a blob, and its summary (state, claimed done, what stopped it, recovered, cost in tokens, model calls, wall time and dollars, side effects, behaviours such as a clarifying question). With the `json` reporter, the report is written to `.ui-tests/runs/<run>/report.json`. Exit codes: 0 pass, 1 fail, 3 inconclusive, 2 error.
