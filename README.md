# ui-tests

See where people get stuck on what you just shipped.

Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.

## The promise and the run

Open source. Nothing to sign up for. Runs on your preview or your live site.

Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

Person 3 · 00:58 · pressed Add twice

“I wasn’t sure the first Add did anything, so I pressed it again.”

What comes back.

Here is one person’s attempt at one goal as it comes back: whether they reached it, the moments that got in the way, each playing in place, and how it felt.

If you have written a Playwright test, you have written this.

Problems found: 4 across 5 people.

Reached the goal: 2 of 5.

After the goal, typically: Would it help them? 4 of 5 · Easy to use? 2 of 5

Problem 1 is the one to fix first: both people who hit it pressed Done believing they had finished, and their colleague got the same email twice. Problem 3 is one link.

A run reports the problems it found, or that it found none this time. There is no score and no pass.

What the person sees.

Your page, with a small bar over it. Nothing else.

You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.

goal('invite a colleague')

The card is written from the goal, never from the path you expect.

outcome(...)

It runs on your side after either button.

The rating and the words, typed or spoken, land in their trace.

They never see the path you expected or the check you wrote, so nothing you wrote can lead them.

Where the people come from.

Friends are kind and coworkers know too much. Three ways to reach people who are neither.

In the pull request.

Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request with a report page anyone on the team can open. Your other tests prove the code works. This one shows whether a person can use it.

The report page opens on whether people reached the goal and the ranked problems, each with the moments to watch and what to change, and every person's attempt below.

Three commands.

Node 22. Paste one line on any site, or install the package in a Next.js app.

No Next.js app? Paste the one line from the hosted block on any site instead.

The third command runs the example task on you, so you see the card, the bar and your own trace before anyone else does. Open source, with no seats and no account. Your own link and your own visitors cost nothing. The paid panel is the only thing you pay for, and you set the cap before it starts.

This page runs this test.

The outcome checks that you reached the guide. If you get stuck on the way there, this page may ask you to say so. That is the third way to find people, running here.

## Agent runs

The same test, run by an agent.

Point a file at your API, your MCP server or your CLI and run it with an agent instead of a person. Five trials, a trace for each, a report of its own. Agent runs are never counted with people and never described as people.

One file, two actors, two reports that never mix.

npx ui-tests run --actor agent

goal('add a member through the API', { target: { http: 'https://api.weekboard.app' } })

add a member through the API

https://ui-tests.com/r/k2m9-agent

0:19

POST /members, then GET /members

0:22

0:41

called POST /invites, which does not exist

0:17

0:35

sent the email in the query string, 400

## Without a repository

No repo to put it in? Paste one line.

One script tag on your live site, through your tag manager if that is how you ship. Then the same test in a form instead of a file: who the users are, what they are trying to do, and how you can tell they did it, by a page they reach, an element they see or a question they answer. People come from your link, a paid panel or your own visitors, and the report is a page you can share.

Same test, same report, no install.

```html
<script src="https://ui-tests.com/s.js" data-site="weekboard" async></script>
```

people who signed up this week and want a colleague on their board

plan the week together without emailing screenshots around

invite a colleague

signed up for a tool to plan work with a team

7 days

Trello, Asana, Notion, Linear

has used Weekboard

Paste the line

You see the script in your live site’s markup, or in the tag manager that publishes it.

Fill the form

You see the run on your dashboard, and a report page you can share once the attempts are in.

## The hosted dashboard

16 Oct

3 of 5

running

change the plan to Team

15 Oct

5 of 5

done

Reached 5 of 5 · 1 problem

great

export last month’s board

12 Oct

8 of 8

done

Reached 6 of 8 · 3 problems

check

start a board from a template

9 Oct

5 of 5

done

Reached 5 of 5 · none found

great

find a card from last week

—

0 of 5

draft

archive a finished board

## The file

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'people who signed up this week and want a colleague on their board',
  purpose: 'plan the week together without emailing screenshots around',
  screen: {
    did: 'signed up for a tool to plan work with a team',
    within: '7 days',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
}, () => {
  goal('invite a colleague', {
    happyPath: ['/board', '/settings/members'],
    scenario: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.",
  }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})
```

## The problems

Pressed Add, saw nothing change, pressed it again; two invitations went out

blocked

2 of 5

"I wasn't sure the first one did anything."

Person 3 at 00:58, Person 4 at 00:41

On press, change the button to "Invited sam@acme.co" and disable it.

Person 3 · 00:58 → 01:04

Stopped at a grey Add button and pressed I couldn't do this

blocked

1 of 5

"It looked switched off."

Person 2 at 00:49

Keep the button solid. Validate the address on press, with a message.

Person 2 · 00:45 → 00:54

Looked for Invite in the Share menu and found only link options

slowed

4 of 5

"Share is where you add people."

Person 1 at 00:04, Person 2 at 00:06, Person 3 at 00:03, Person 5 at 00:09

Put "Invite a colleague" at the top of the Share menu.

Person 3 · 00:03 → 00:12

Typed the colleague's email into the board search

confused

2 of 5

"I figured it would find them."

Person 1 at 00:30, Person 3 at 00:23

When a search matches no cards, offer "Invite someone with this email".

Person 3 · 00:23 → 00:32

## Where the people come from

Your link

Anyone you send it to: a customer, a community, the person at the next desk

Free

As each person finishes

A paid panel

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
  screen: {
    did: 'shipped a user interface you built yourself',
    within: '3 months',
    role: ['developer', 'designer', 'founder'],
    not: ['works in UX research'],
  },
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

Run it with an agent

In a Next.js app, install the package. On any other site, paste one line instead: Without a repository.

You see "ui-tests" in `devDependencies`.

You see a link in the terminal, then in your browser the scenario card, your own page with the bar over it, and the questions one at a time. Press "Done". The terminal prints:

You type, in `ui-tests/first.ui.test.ts`:

You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co. When you think you've finished, press Done. If you get stuck, press I couldn't do this." Without a `scenario` line the card is drafted from the goal's name, so read that draft and pin your own wording, and `ui-tests lint` prints the screener it drafted from `users` until you write a `screen` block.

You type, in the same file or a new one:

You see a separate agent report:

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
  Reached the goal: 2 of 5.

▏1  2 of 5  blocked   Pressed Add, saw nothing change, pressed it again
 2  1 of 5  blocked   Stopped at a grey Add, pressed I couldn't do this
 3  4 of 5  slowed    Looked for Invite in the Share menu, found only links
 4  2 of 5  confused  Typed the colleague's email into the board search
```

### agent

```text
Agent run · add a member through the API · 5 trials
1  0:19  reached the outcome · POST /members, then GET /members
2  0:22  reached the outcome
3  0:41  stopped: called POST /invites, which does not exist
4  0:17  reached the outcome
5  0:35  stopped: sent the email in the query string, 400
3 of 5 trials reached the outcome. Report: https://ui-tests.com/r/k2m9-agent
```

### commands

```text
$ npm install -D ui-tests
$ npx ui-tests init
Created ui-tests.config.ts
Created landing.ui.test.ts
Created vitest.config.ts
Next: npm run dev, then npx ui-tests
$ npx ui-tests
```

### init

```text
Created ui-tests.config.ts
Created landing.ui.test.ts
Created vitest.config.ts
Next: npm run dev, then npx ui-tests
```

### dev

```text
Reached the goal: Yes
Rehearsal: 0 of 5 planned attempts recorded.
Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/0000000000000000000000000000000000000000000000000000000000000000
```

### run

```text
Run k2m9 started
Send this link to anyone: https://ui-tests.com/t/k2m9
Paid panel: 5 people matched to "people who signed up this week and want a colleague on their board"
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
