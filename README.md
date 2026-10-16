# ui-tests

See where people get stuck on what you just shipped.

Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.

## The promise and the run

Open source. Nothing to sign up for. Runs on your preview or your live site.

Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

P3 · 00:03 · looked for Invite in the Share menu

“Share is where you add people. I checked there first.”

What comes back.

Here is the whole of one run: the file that asked for it, what one person did, and what to fix.

If you have written a Playwright test, you have written this.

Problems found: 4 across 5 people.

Problem 1 is one link. Problem 2 is the one to fix first: both people who hit it believed they were finished, and their colleague got the same email twice.

A run reports the problems it found, or that it found none this time. There is no score and no pass.

What the person sees.

Your page, with a small bar over it. Nothing else.

Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished.

goal('invite a colleague')

outcome(...)

It runs on your side after either button.

the rating and the words land in their trace.

They never see the path you expected or the check you wrote, so nothing you wrote can lead them.

Where the people come from.

Friends are kind and coworkers know too much. Three ways to reach people who are neither.

In the pull request.

Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request with a report page anyone on the team can open. Your other tests prove the code works. This one shows whether a person can use it.

the report page opens on the ranked problems, each with the moments to watch and what to change, and every person's trace below.

Three commands.

Node 22 and a Next.js app.

The third command runs the example task on you, so you see the card, the bar and your own trace before anyone else does. Open source, with no seats and no account. Your own link and your own visitors cost nothing. The panel is the only thing you pay for, and you set the cap before it starts.

This page runs this test.

The outcome checks that you reached the guide. If you get stuck on the way there, this page may ask you to say so. That is the third way to find people, running here.

## The file

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'people who signed up this week and want a colleague on their board',
  purpose: 'plan the week together without emailing screenshots around',
}, () => {
  goal('invite a colleague', { happyPath: ['/board', '/settings/members'] }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})
```

## The problems

Looked for Invite in the Share menu and found only link options

4 of 5

"Share is where you add people."

P1 00:04, P2 00:06, P3 00:03, P5 00:09

Put "Invite a colleague" at the top of the Share menu.

P3 · 00:03 → 00:12

Pressed Add, saw nothing change, pressed it again; two invitations went out

2 of 5

"I wasn't sure the first one did anything."

P3 00:58, P4 00:41

On press, change the button to "Invited sam@acme.co" and disable it.

P3 · 00:58 → 01:04

Typed the colleague's email into the board search

2 of 5

"I figured it would find them."

P3 00:23, P1 00:30

When a search matches no cards, offer "Invite someone with this email".

P3 · 00:23 → 00:32

Stopped at a grey Add button and gave up

1 of 5

"It looked switched off."

P2 00:49

Keep the button solid. Validate the address on press, with a message.

P2 · 00:45 → 00:54

## Where the people come from

Your link

Anyone you send it to: a customer, a community, the person at the next desk

Free

As each person finishes

A panel

People matched to the `users` line in your file, found for you

About $54 for a short task, under a cap you set

Within 48 hours

Your visitors

On the hosted version: people already on your live site, invited the moment they are visibly struggling

Free

As each person finishes

## This page runs this test

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

## Getting started

Getting started

Install

Set up

Try it on yourself

Write your own

Run it with real people

You see "ui-tests" in `devDependencies`.

You see a link in the terminal, then in your browser the scenario card, your own page with the bar over it, and the ease question. Press "I'm done". The terminal prints:

You type, in `ui-tests/first.ui.test.ts`:

You see, on the next `npx ui-tests`, the card now reads: "Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished."

Read what came back

You type, once the attempts are in:

Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:

## Commands

npm install -D ui-tests

npx ui-tests init

npx ui-tests

npx ui-tests run

npx ui-tests report k2m9

## Site navigation and controls

ui-tests

Guide

GitHub

Get started

Skip to content

Main navigation

Getting started

Copy

Copied

Could not copy. Select and copy the code.

TypeScript

Shell

Output

Example run

## Rehearsal

Rehearsal: 0 of 5 planned attempts recorded.

## Terminal output

These frames are generated by the CLI’s Ink renderer.

### report

```text
● Problems found: 4 across 5 people.

▏1  Looked for Invite in the Share menu and found only link options  4 of 5
 2  Pressed Add, saw nothing change, pressed it again                2 of 5
 3  Typed the colleague's email into the board search                2 of 5
 4  Stopped at a grey Add button and gave up                         1 of 5
```

### commands

```text
npm install -D ui-tests
npx ui-tests init
npx ui-tests
```

### init

```text
Created ui-tests.config.ts
Created landing.ui.test.ts
Created vitest.config.ts
Mount instructions:
1. Import { UiTests } from 'ui-tests/next' and mount <UiTests /> in your root layout body.
2. In app/ui-tests/[run]/page.tsx render <Player runId={run} token={token} /> from 'ui-tests/next'.
3. In app/api/ui-tests/route.ts export GET and POST = createCollector() from 'ui-tests/server'; export const runtime = 'nodejs'.
4. Run npm run dev, then npx ui-tests.
```

### dev

```text
Outcome: correct
Rehearsal: 0 of 5 planned attempts recorded.
Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/0000000000000000000000000000000000000000000000000000000000000000
```

### run

```text
Run k2m9 started
Send this link to anyone: https://ui-tests.com/t/k2m9
Panel: 5 people matched to "people who signed up this week and want a colleague on their board"
Cap: $60 · results within 48 hours
```

## Contributing and automation

Run `npm ci` and `npx playwright install chromium`, then `npm run validate`. This checks the factory, TypeScript, unit tests and the local browser rehearsal (including accessibility). `npm run build` checks the production Next.js build. Vitest excludes `**/*.ui.test.ts`; those files are authoring inputs, not unit tests.

The two npm workspaces are `apps/web` and `packages/ui-tests`. The collector and SQLite adapter are for local development. The player receives an allowlisted participant view; expected answers, happy paths and hooks stay in the CLI. Local SQLite data and compiled hooks live in ignored `.ui-tests/`.

The autonomous factory is vendored in [`factory/`](factory/README.md) from `miguel-perez/archon-factory`. Planning documents live in [`docs/`](docs/). To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. CodeRabbit review and protected merge requirements remain in force.
