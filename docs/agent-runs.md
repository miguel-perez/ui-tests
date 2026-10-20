# Agent runs: the loop and the cli and http harnesses

`ui-tests --actor agent` runs a study's tasks as agent trials: a capability test, not usability. Each task gets `trials` trials (five by default), each from a reset harness, with the task's scenario text as the agent's prompt. The task's hooks verify each trial's end state: `verified` (correct), `stopped` (incorrect, with what stopped it in one line) or `unknown` (the hook could not read its evidence, or the model provider failed). The code path is tested with the `scripted` provider; the `anthropic` provider is documented, not executed.

## The agent

Set it in `ui-tests.config.ts` under `agents`; it is pinned into the run by its fingerprint, so changing anything is a different run.

```ts
agents: {
  model: { provider: 'anthropic', name: 'claude-opus-5-5' },
  budgets: { calls: 30, seconds: 600, tokens: 500000, dollars: 5 },
}
```

- `anthropic`: Claude through the Messages API (`@anthropic-ai/sdk`). `name` is the model id. Needs `ANTHROPIC_API_KEY` in the environment of the command; without it the command exits 2 before making a run. Not run from here. There is no fallback to another model: a refusal is what stopped the trial.
- `scripted`: plays back a JSON file of turns named by `name` (`{ provider: 'scripted', name: './agent-script.json' }`), each `{ text?, toolCalls?: [{ name, input }], stop? }`; past its end it calls `done`. Offline; for tests and trying the harnesses.

Budgets default to 30 model calls and 600 seconds. The time budget also bounds a model step in progress; a step that passes the token or dollars budget ends the trial before its tool calls run; a dollars budget with a model that reports no price ends the trial at once. A trial that reaches a budget ends there and its hook still runs.

## How a trial ends

Besides the harness's tools the agent gets `done` and `give_up({ reason })`. Only `done` is a claim that the task is done; done and a hook that says incorrect is a false success. `give_up`, or a final message without `done`, ends the trial with the agent's own words as what stopped it. A message ending in `?` is a clarifying question: it is recorded as a behaviour and the agent is told to carry on (three questions end the trial). A refusal, a reply cut off at the output limit and a budget end the trial and say so. A failed call to the model provider (an outage) makes the trial `unknown`, not `stopped`.

## The run and its key

The key is `${commit}:${contextId}:${fingerprint}:agent`; `--key` overrides. A repeated key keeps the trials already stored and runs the missing ones up to k, so an interrupted run is finished by running the same command again. No verdict is read from fewer than k trials: the task reads `pending` and the command exits 3.

## What the agent can do

**The cli harness is not a security boundary.** It limits what the agent can start, not what the target CLI does once started. A target CLI can run code the agent writes or points it at: `ui-tests` itself does, since `lint`, `check`, `verify` and dev mode bundle and import study files by path, and any `target.cli` may do the same. Such code runs as the operator's user and can read or write any path that user can, and reach the network. The environment allowlist and the forced npm options only limit accidental reach (an inherited credential, the real home, a registry). Run agent trials in a disposable environment, such as a CI job's container or a VM, holding no secret beyond the model key.


- **cli** (`target.cli`): each trial gets a fresh temporary directory holding a minimal npm project (its working directory), its own home and its own temp directory. One tool, `run`, runs exactly these, with no shell; the programs are found once, as absolute paths, when the harness is made:
  - the configured command with the arguments the agent adds (unless the configured command is itself `npm` or `npx`, as in `npx ui-tests`: then the npm forms below are all there is);
  - `npm install|i [-D|--save-dev] [ui-tests]` and `npm ci`, nothing else: no other subcommand (`exec`, `run`, `pkg`, `config`, `view`, `publish` …), no other package and no other option. The harness appends `--offline --ignore-scripts --no-audit --no-fund --no-update-notifier` and the trial's `--prefix`, `--userconfig`, `--cache` (and `--registry` the cache is keyed by) after the agent's words, and the agent cannot give any of them;
  - `npx ui-tests …`, which runs the project's installed `node_modules/.bin/ui-tests` with the rest as its arguments; no npx options (`-c`, `--call`, `-p`, `--yes`), and refused until `npm i -D ui-tests` has run.
  A refused line is a tool error the agent reads, and nothing starts.
  - The environment is an allowlist: PATH (absolute entries only), `LANG`, `LC_*`, `TERM`, `CI`; `HOME`, `TMPDIR` and `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME` point into the trial; npm's cache and user config are inside the trial's home and `npm_config_offline=true`. Nothing else of the operator's environment passes.
  - The local `ui-tests` package is packed once per run (`npm pack` of this package with its dependencies bundled) and put in each trial's npm cache, so `npm i -D ui-tests` installs this code and `npx ui-tests` runs it, with no registry access. No lifecycle script of any package runs.
  - Each run stops after 120 s; stdout and stderr are capped at 64 KiB each.
  - What is controlled: the working directory, home, environment, programs and their arguments, time and output. What is not: the file system outside the trial, and whatever the target CLI itself does.
  - A relative path in the configured command (`node ./cli.mjs`) is a file of the project. `workspace.file(glob)` in a hook reads the trial's working directory (not `node_modules`): the first matching file's text, or `null` when none matches.
- **http** (`target.http`, with `target.description` given to the agent as the API's description): one tool, `request({ method, path, body, headers })`, on that origin and under its base path only. Other origins and `..` out of the base path are refused, and redirects are not followed; 30 s per request, bodies read up to 64 KiB and the rest left unread. A 404 reads "called POST /invites, which does not exist".

- **mcp** (`target.mcp`, a command): each trial starts the configured server over stdio in a fresh temporary directory (its working directory) with the cli harness's environment allowlist, and the server's own tools become the agent's tools, similar names included. Nothing else is offered; any other name is refused. A tool that answers with an error is a tool error the agent reads. The server is stopped and started again for the next trial, and `workspace.file(glob)` in a hook reads its working directory. A server tool named `done`, `give_up` or `cannot` is offered as `mcp__<name>`, so it cannot end a trial. A server that fails to start is reported with the end of its stderr. npm is offline in a trial, so an `npx -y some-mcp` target cannot fetch its server: install the server first and name the installed command (`node ./node_modules/some-mcp/bin.js`). Like the cli harness it is not a security boundary: the server is the operator's own code.
- **web** (`target.url`): the agent uses the product in a browser through the same player and collector a person uses, in an agent run of its own (`actor: 'agent'`) that no human run shares. `runTrials` refuses a run that is not an agent run. The trial's attempt is made already consented (an agent is not asked, screened or given practice), and the harness opens the player as that attempt and presses Start task. The agent's tools are `look()` (an accessibility snapshot with refs), `click(ref)`, `type(ref, text)`, `goto(path)`, `done()` and `cannot(reason)`; `done` and `cannot` press the task bar's own buttons, so the end state is the snapshot the collector stored. A trial left without either is read from the page it stopped on. Only the product's origin can be opened. `done` or `cannot` that fails (the bar is not on the page) is a tool error and the trial goes on; only one that worked ends it. The end the collector stored (Done, I couldn't do this, or the time limit) is the only end: the loop keeps its reason and time. From the command line, `ui-tests --actor agent` on a study whose target is `target.url` runs this harness against that URL, where the player and collector are mounted (server mode: `/ui-tests/<run>/` and `/api/ui-tests/`); the run is created in the store `UI_TESTS_DATA_DIR` names, which the server must read too. A target whose `/api/ui-tests/` does not answer 401 exits 2 with "target does not serve the ui-tests player: {url}". From code: `webHarness({ target, playerUrl })`.

## What is recorded

Each trial is an attempt of the run, participant `agent:<task index>:<trial number>` (`agent:0:1` for the first trial of the first task): its end state, its verdict, its transcript as a blob, and its summary in the attempt's answers (state, claimed done, what stopped it, recovered, cost in tokens, model calls, wall time and dollars, side effects, behaviours). With the `json` reporter, the report is written to `.ui-tests/runs/<run>/report.json`. Exit codes: 0 pass, 1 fail, 3 inconclusive or pending, 2 error.
