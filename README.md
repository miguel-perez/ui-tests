# ui-tests

Research repository delivered by the autonomous factory vendored in
[`factory/`](factory/README.md) from `miguel-perez/archon-factory`. Planning
documents live in the untracked local `docs/` directory.

## Start a task

Open an issue with the behavior and acceptance criteria, then comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

## Validate

```sh
npm ci
npm run validate
```

## Factory

Edit the factory in `factory/`, run `node factory/install.mjs`, and commit both.
The host, status and recovery commands are the `automation:*` npm scripts; see
the factory README for GitHub configuration and the local host.
