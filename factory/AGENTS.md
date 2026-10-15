# archon-factory

This repository is the source of the autonomous delivery factory that other
repositories vendor as a git subtree at `factory/`.

- `automation/` and `scripts/` run in place from the subtree. Keep them free of
  assumptions about the consumer's layout: locate siblings with the script's own
  path and the consumer root with `ARCHON_REPO_ROOT`, then `git rev-parse
  --show-toplevel`.
- `payload/` is copied into consumers by `install.mjs`. Reference factory code
  from it only as `{{FACTORY}}/...`. `payload/seed/` is written once and then
  owned by the consumer.
- `npm run validate` must pass before any push. It runs every test in this repo.
- Changes to the payload or scripts are breaking for consumers until they run
  `git subtree pull` and `node factory/install.mjs`; say so in the commit message.
