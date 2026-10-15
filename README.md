# ui-tests

Usability testing, in your repo

## See what stopped them.

For developers who test code, ship UI and have no researcher. Find where people get stuck, with issue signals, a sentence that says what the evidence means, and a trace to inspect.

[Get started](https://ui-tests.com/docs/getting-started) · [View on GitHub](https://github.com/miguel-perez/ui-tests)

Local rehearsal · example identifiers

```text
Player: http://localhost:3000/ui-tests/00000000-0000-4000-8000-000000000000?token=0000000000000000000000000000000000000000000000000000000000000000
Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/0000000000000000000000000000000000000000000000000000000000000000
Run: 00000000-0000-4000-8000-000000000000
Outcome: correct
Rehearsal: 0 of 5 planned attempts recorded.
```

Your tests say the code works. Watching someone use it tells you whether the experience makes sense. Start with a local rehearsal of the task you want to observe.

## From working to making sense.

Friends can like the idea and still get stuck using it. Look at what happens when someone tries.

### Functional and reliable

Your code tests tell you whether it works and keeps working. Keep those tests. This is the next question.

### Usable

Effectiveness, efficiency and satisfaction in a specified context of use (ISO 9241-11). Watch where the task breaks down, not just where it ends.

Example issue signals

- Dead click · 00:12 · “Install” did not respond.
- Deviation · 00:28 · A visit to /pricing interrupted the path.

Rehearsal: 0 of 5 planned attempts recorded.

Five people can uncover problems. They cannot establish a rate. A problem-catching run reports problems found, or none found at this n.

Outcome correct · Final URL: /docs/getting-started.

### Desirable

Does this help the people you built it for do something they need to do?

Derived now; questions are not asked at run time yet.

### Pleasurable

How does it feel to use? A finished task can still leave someone frustrated.

Derived now; questions are not asked at run time yet.

## Write the goal. Leave room to get lost.

This is the test for this page. The happy path stays with the outcome check; the person doing the task only sees the scenario.

landing.ui.test.ts

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

## Part of the build loop.

Name the people and what they came to do. Rehearse the task. Inspect what got in the way.

### What you write

Who the people are, what they need to do, and what you can observe when they finish. A goal, not a set of directions.

### What is derived

A scenario from the goal, timing and a sample plan. Impression and fit questions are derived too, ready for a later stage.

### What you get back

Issue signals to investigate, a sentence that puts the sample in context, and a trace. The snapshot outcome says where the attempt ended.

Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person runs, impression and fit questions at run time, aggregated findings and the pull-request check do not work yet.

Open source. Nothing to sign up for. Local rehearsals are free. The plan: free with your own participants, pay only for a panel, no seats.

The record is evidence for the people clauses of ISO 9241-210.

## Your first local rehearsal

Try the task yourself before asking anyone else. A rehearsal checks the setup and shows you the evidence you will be able to inspect.

### Before you start

Use Node 22 or newer and a Next.js App Router application. Run this locally in development mode.

### 1. Install

Add ui-tests as a development dependency in your application. It keeps the task definition beside the code you are building.

```sh
npm install -D ui-tests
```

### 2. Init and mount

```sh
npx ui-tests init
```

Init writes the config, example test and Vitest exclusion, preserving existing author files. Mount the integration in your root layout so the taskbar stays with the person as they navigate.

```tsx
import { UiTests } from 'ui-tests/next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<UiTests /></body></html>
}
```

Mount the player at app/ui-tests/[run]/page.tsx. It asks for consent and presents the scenario before the task begins.

```tsx
import { Player } from 'ui-tests/next'
export default async function Page({ params, searchParams }: {
  params: Promise<{ run: string }>
  searchParams: Promise<{ token?: string }>
}) {
  return <Player runId={(await params).run} token={(await searchParams).token} />
}
```

Mount the development collector at app/api/ui-tests/route.ts. It records the local attempt so you can inspect what happened.

```ts
import { createCollector } from 'ui-tests/server'
export const runtime = 'nodejs'
export const GET = createCollector()
export const POST = GET
```

### 3. Write the test

Save this as landing.ui.test.ts. Name the people and their goal in words they would use.

Use the context above, unchanged.

The scenario comes from the goal, not the happy path, so it does not give away the route. The lint rejects interface words in a goal because telling someone which button to click hides whether they could find it.

Set the local target in ui-tests.config.ts so the player knows which application to open.

```ts
import { defineConfig } from 'ui-tests'
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })
```

### 4. Run dev mode

Start your app, then run the rehearsal in another terminal from the application directory. The CLI opens the player and a separate local trace viewer.

```sh
npm run dev
# In another terminal
npx ui-tests
```

Give consent, read the scenario and begin the task. Use “I’m done” or “I can’t do this”, then answer the ease and confidence questions even if you stopped.

To rehearse this repository from a clean clone:

```sh
npm ci
npm run dev
# In another terminal
cd apps/web
npx ui-tests
```

### 5. Read the result

Look at the issue moments first. The trace shows what happened, when it happened, and the expected and actual evidence. A signal is a place to investigate, not a verdict about a person.

The outcome runs in the CLI against the saved URL and DOM, not in your app. This keeps the expected answer and the checking code out of the participant’s experience.

```text
Rehearsal: 0 of 5 planned attempts recorded.
```

The sentence says “0 of 5 planned attempts” because a self-rehearsal does not count as evidence from other people. Five is a plan for finding problems, not a measured rate.

A minutes-only goal produces issues without a result sentence. Stop the viewer with Ctrl+C. Local records stay in .ui-tests/.

```sh
npx ui-tests lint
# Replace RUN_ID with the run ID printed by the CLI.
npx ui-tests verify RUN_ID
```

### Site navigation and controls

Main navigation: ui-tests · Guide · GitHub. Skip to content.

Getting started and On this page link to the five steps. Code labels: TypeScript, Shell, Output. Copy controls announce Copied, or Could not copy. Select and copy the code.

## Contributing and automation

Run `npm ci` and `npx playwright install chromium`, then `npm run validate`. This checks the factory, TypeScript, unit tests and the local browser rehearsal (including accessibility). `npm run build` checks the production Next.js build. Vitest excludes `**/*.ui.test.ts`; those files are authoring inputs, not unit tests.

The two npm workspaces are `apps/web` and `packages/ui-tests`. The collector and SQLite adapter are for local development. The player receives an allowlisted participant view; expected answers, happy paths and hooks stay in the CLI. Local SQLite data and compiled hooks live in ignored `.ui-tests/`.

The autonomous factory is vendored in [`factory/`](factory/README.md) from `miguel-perez/archon-factory`. Planning documents live in [`docs/`](docs/). To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. CodeRabbit review and protected merge requirements remain in force.
