# The GitHub check

`ui-tests check` posts a pending check named `ui-tests` (`ui-tests (agent)` for an agent run) on a pull request when its preview deploys. The run is keyed `pr-<number>:<context>:<actor>`, so a new push finds the same run and makes no second check. When the run has a result, `refreshRun` completes the check (conclusion `neutral`, or `failure` only with `check.block_on: 'problems'`), updates one sticky comment when the outcome changed (off with `check.comment: false`), and calls `webhook.url` with `{ run, revision, result }` signed in `x-ui-tests-signature: sha256=<hmac>` under `webhook.secret`.

Two workflows run it: `.github/workflows/ui-tests-check.yml` (on `deployment_status`, state `success`) and `.github/workflows/ui-tests-reconcile.yml` (every 15 minutes: `ui-tests check --reconcile`, which runs `verify` then `status` for each open run). Both skip with a notice when `UI_TESTS_DATABASE_URL` is not set.

## Setup (documented, not executed)

1. Repository secrets: `UI_TESTS_DATABASE_URL` (the Neon `postgres://` URL the collector uses), `VERCEL_AUTOMATION_BYPASS_SECRET` (so the runner can reach a protected preview), `UI_TESTS_SHARE_SECRET` (signs the report links in the check).
2. The Vercel project's Preview environment sets `UI_TESTS_SERVER=1` and the same database and share secrets, so the preview serves the player, collector and report.
3. The workflows use the job's `GITHUB_TOKEN` with `checks: write` and `pull-requests: write`. A GitHub App with the same two permissions works too: set its installation token as `GITHUB_TOKEN`.
4. Add the label `ui-test` to a pull request to opt it in (`ci: { on: ['label:ui-test'] }` in `ui-tests.config.ts`).

## Why the check workflow has two jobs

`deployment_status` runs with the repository's secrets and a write token, and the commit it deploys can come from a fork. So `ui-tests-check.yml` splits the work:

- `gate` has no secrets and a read-only token. It finds the open pull request whose head is the deployment commit, stops if the head lives in another repository, and stops unless the pull request has one of the `label:` entries of `ci.on` (read from the default branch's `apps/web/ui-tests.config.ts` through the API, never from the pull request).
- `check` has the secrets and runs only when the gate passed. It checks out this repository at the deployment commit, which is a same-repository head, and runs `ui-tests check`. It never runs for a fork.

`ui-tests check` applies `ci.on` again itself, so a gate that passes only lets the same decision be made with the secrets held.
