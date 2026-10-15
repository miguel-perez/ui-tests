# archon-factory

Autonomous delivery for a GitHub repository: Archon implements a task from an
issue comment on an isolated branch, CodeRabbit reviews the pull request, and
GitHub's protected auto-merge merges it once review, CI and conversations are
satisfied. This repository holds the machinery; consumers vendor it as a git
subtree and install a small payload at their root.

## Adopt in a repository

Requirements: Node 22.13+, Python 3, `gh` authenticated, Homebrew git with
`git subtree` available.

```sh
git subtree add --prefix=factory git@github.com:miguel-perez/archon-factory.git main --squash
node factory/install.mjs
node factory/check.mjs
```

`install.mjs` writes:

- Managed copies, overwritten on every install and checked by `check.mjs`:
  `.github/workflows/{merge-gate,review-event,delivery-status}.yml`,
  `.archon/commands/`, `.archon/workflows/`, `.coderabbit.yaml`.
- Seeds, written only if absent and then yours: `.github/workflows/ci.yml`,
  `.archon/config.yaml`, `opencode.json`, `.npmrc`, `AGENTS.md`, and ignore
  lines for `.archon/runtime/` and Archon artifacts.
- npm scripts `automation:*`, `factory:check` and `factory:test` in
  `package.json`, added only when missing.

Add `node factory/check.mjs && npm --prefix factory run validate` to your
`validate` script so CI rejects edits to the managed copies. The CI job must be
named `Automation CI`; the seeded workflow is.

Update later with `git subtree pull --prefix=factory git@github.com:miguel-perez/archon-factory.git main --squash`
followed by `node factory/install.mjs`. Contribute fixes made inside `factory/`
back with `git subtree push --prefix=factory git@github.com:miguel-perez/archon-factory.git <branch>`.

## GitHub configuration

- Install the CodeRabbit GitHub App on the repository.
- Protect `main`: required checks `Automation CI` and `CodeRabbit approval`,
  one approving review, dismiss stale approvals, require conversation
  resolution, enforce for admins, no force pushes or deletions.
- Allow squash merges and auto-merge; delete branches on merge.
- Set the repository variable `AUTOMERGE_ENABLED=true` once protections exist.
  `false` stops new auto-merge requests; pause a PR already enabled with
  `gh pr merge NUMBER --disable-auto`.

The merge gate (`automation/merge_gate.py`) runs only trusted default-branch
code. It enables auto-merge solely when CodeRabbit's actual APPROVED review is
on the current head and CI succeeded. Missing, stale, dismissed or skipped
reviews never merge.

## Start a task

Create an issue with the behavior and acceptance criteria, then comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Archon handles at most five cumulative CodeRabbit correction rounds across runs
and continuations; a sixth is never attempted and the PR stays open with a
blocker report. From the consumer root:

```sh
npm run automation:deliver -- --branch BRANCH --input issue=N "Implement issue #N and satisfy its acceptance criteria"
npm run automation:repair -- --branch EXISTING_PR_BRANCH --input pr=PR --input issue=N
npm run automation:status -- --issue N [--json] [--github-only] [--watch run --run ID --deadline 600]
```

Status is read-only unless `--publish` is given. It posts one automation-owned
comment on the issue marked `<!-- archon-factory-delivery-status:v1 -->`; the
`Delivery status reconciliation` workflow refreshes it after PR closure and
every 15 minutes using only default-branch code.

## Local host

The host runs Archon on `127.0.0.1:3090` behind a Cloudflare quick tunnel that
exposes only the signed webhook endpoint. On first start it creates the GitHub
webhook for the repository (events: check_run, issues, issue_comment,
pull_request, pull_request_review, pull_request_review_comment) and saves its id
in `.archon/runtime/webhook-id`; later starts repoint that hook at the new
tunnel URL.

```sh
npm run automation:build          # builds the pinned Archon repair with Bun 1.3.11 into .archon/runtime/bin
npm run automation:verify-serve   # isolated readiness proof
npm run automation:verify-sol     # real provider smoke, evidence under .archon/runtime/evidence
python3 factory/scripts/install-archon-service.py   # macOS LaunchAgent, or:
npm run automation:start
npm run automation:stop
```

Provide `.archon/runtime/bin/cloudflared` yourself. Environment:

- `ARCHON_REPO_ROOT`: consumer root override; otherwise the git top level.
- `ARCHON_ALLOWED_USERS`: comma-separated GitHub logins allowed to trigger
  workflows; defaults to the authenticated `gh` login.
- `ARCHON_HOME`, `DATABASE_URL`, `ARCHON_DOCKER`, `WORKSPACE_PATH`: passed
  through to Archon unchanged.

Everything downloaded or generated lives in the ignored `.archon/runtime/`.

## Develop the factory

```sh
npm run validate
```

Runs the Node and Python test suites. The provider and model for the Archon
workflows are set in `payload/.archon/workflows/**` and `payload/seed/.archon/config.yaml`;
changing them per consumer is a known limitation.
