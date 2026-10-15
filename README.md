# ui-tests

Usability testing that runs like your unit tests. Define the goal and the happy path. It recruits the people, runs it, and reports the problems they hit.

- Functional and reliable — Yours: make it work and keep it working.
- Usable — Measured here: effectiveness, efficiency and satisfaction in a specified context of use (ISO 9241-11).
- Desirable — Measured here: does this fit what people need?
- Pleasurable — Measured here: how does the experience feel?

- What you write — The people, their purpose, a goal and an observable outcome.
- What is derived — The scenario, timing, sample plan, impression stage and fit questions.
- What you get back — An outcome, the first issue signals, a sentence and a trace.

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'developers who ship UI and have no researcher',
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  goal('start trying ui-tests', { happyPath: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})
```

## Install and rehearse

Requires Node 22 or newer and a Next.js App Router application.

```sh
npm install -D ui-tests
npx ui-tests init
npm run dev
# In another terminal
npx ui-tests
```

Init prints the root layout, player and collector mount instructions. From this repository:

```sh
npm ci
npm run dev
# In another terminal
cd apps/web
npx ui-tests
```

Read the result in the CLI’s separate local trace viewer. Rehearsal: 0 of 5 planned attempts recorded.

Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person studies, impression and fit questions at run time, and aggregated findings do not work yet.

The record is evidence for ISO 9241-210’s people clauses; it is not a certification.

[Site and getting started](https://ui-tests.vercel.app/docs/getting-started)

## Contributing and automation

Run `npm ci` and `npx playwright install chromium`, then `npm run validate`. This checks the factory, TypeScript, unit tests and the local browser rehearsal (including accessibility). `npm run build` checks the production Next.js build. Vitest excludes `**/*.ui.test.ts`; those files are authoring inputs, not unit tests.

The two npm workspaces are `apps/web` and `packages/ui-tests`. The collector and SQLite adapter are for local development. The player receives an allowlisted participant view; expected answers, happy paths and hooks stay in the CLI. Local SQLite data and compiled hooks live in ignored `.ui-tests/`.

The autonomous factory is vendored in [`factory/`](factory/README.md) from `miguel-perez/archon-factory`. Planning documents live in the untracked local `docs/` directory. To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. CodeRabbit review and protected merge requirements remain in force.
