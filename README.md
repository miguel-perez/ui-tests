# ui-tests

See where people get stuck on what you just shipped.

Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.

## The promise and the run

Open source. Nothing to sign up for. Runs on your preview or your live site.

Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

If you have written a Playwright test, you have written this.

A run reports the problems it found, or that it found none this time. There is no score and no pass.

You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.

## Agent runs

Agents use some interfaces, too.

Your API, your MCP server and your CLI have a second kind of user: an agent that reads text, not pixels. Point the same file at that surface and five trials show whether it gets through. It is a capability test, not a usability one, and it never counts with people.

api

Your API

target: { http }

Endpoint names, schemas and error bodies are its whole page. A `400` with no reason is a dead end.

mcp

Your MCP server

target: { mcp }

Tool names and their descriptions are the only labels it reads. If two tools sound alike, it picks one.

cli

Your CLI

target: { cli }

Flags, help text and exit codes are what it sees. A `--help` that lies costs it the run.

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

## What you write, what they see

What you write, what they see.

Every screen a person meets, in the order they meet it, beside the lines of your test that produce it, and what comes back from each. The path you expect and the check you wrote stay on your side, so nothing you wrote can lead them.

npm install -D ui-tests

Adds the package.

npx ui-tests init

Creates the file below, with the example filled in.

the file

npx ui-tests run

Turns it into these screens and puts people in front of them.

these screens

`npx ui-tests` on its own runs every screen on you first, so you see the card, the bar and your own trace before anyone else does.

consent

Consent

Consent

before anything loads

What the person does on the page is always recorded, and the consent says so in plain words. `video: true` adds the screen as a video, which is what needs the browser's prompt; without that line the first line of the list is all there is. Voice and camera are always the person's choice. The incentive and the purposes are filled in from the run. The colours are Weekboard's: the chrome inverts their page and takes the one accent they set.

recorded: actions, screen, voice · camera: declined

screener

Screener

Who gets in, and how many

the sample

Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.

The `catch` line sets how many: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost from $60, under a cap you set before it starts. The paid panel and your visitors are the only things you pay for; your own link costs nothing.

screened 20 · matched 5 · who took part: 3 of 5 had the need this month · how they do it today, in their words

impression

First look

First look

on by default

The page the task starts on is flashed for 500 ms, then one open question. The start is the first page of the `happyPath` unless the goal names a `start`; name another page for the flash with `impression: { page }` when the task begins behind a login and the purpose lives on the public page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.

named the purpose: 4 of 5, with their words · first click on your path: 3 of 5

card

Scenario card

Scenario card

from the goal, never the path

The situation from `users.are` and `purpose`, the action from the goal's name, the name and email from `beforeEach`. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.

the exact card text, kept with the run

bar

Your page, with the bar

Your page, with the bar, then the check

two controls, one check

One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `video`, with a pause; there is no microphone during the task. The summary is the goal's name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: the two pages of the `happyPath` set a silent three-minute limit, and the person may ask for more time once. The pill takes your font, inverts your page's colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.

When they press Done, the `outcome` runs against the page as they left it. What they said does not count; what the page says does. A check that cannot decide returns "couldn't tell" and is never rounded either way.

time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn't tell, with the diff

after

After the task

After the task

not from your file

Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that ended with I couldn't do this: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard's people never see it.

ease 3 of 7 · what made it difficult, in their words · would it help them 4 of 5 · easy to use 2 of 5 · words and audio

People

5 from the paid panel, matched to `users`

Chance of seeing a 1-in-3 problem

87%

Cost

from $60 · cap $70 · first people within minutes, usually all five within a few hours

## The file

ui-tests/invite.ui.test.ts

```ts
import { context, beforeEach, goal, outcome, expect } from 'ui-tests'

context({
  users: {
    are: 'people who signed up this week and want a colleague on their board',
    did: 'signed up for a tool to plan work with a team',
    within: '7 days',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  video: true,
}, () => {
  beforeEach(async () => ({ colleague: 'Sam', email: 'sam@acme.co' }))
  goal('invite a colleague', {
    happyPath: ['/board', '/settings/members'],
    catch: { affecting: '1 in 3', confidence: 0.85 },
  }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})
```

## The problems

Pressed Add, saw nothing change, pressed it again; Sam got two invitations

blocked

/settings/members

button "Add"

getByRole('button', { name: 'Add' })

I wasn't sure the first Add did anything, so I pressed it again.

Person 3, after the task

On press, change the button to "Invited sam@acme.co" and disable it.

The Add button looked switched off; Person 2 pressed I couldn't do this

blocked

/settings/members

button "Add"

getByRole('button', { name: 'Add' })

It looked switched off.

Person 2, after the task

Keep the button solid, and check the address on press, with a message.

Looked for Invite in the Share menu and found only link options

slowed

/board

menu "Share"

getByRole('button', { name: 'Share' })

Share is where you add people.

Person 5, after the task

Put "Invite a colleague" at the top of the Share menu.

Typed Sam's email into the board search

confused

/board

field "Search"

getByRole('textbox', { name: 'Search cards' })

I figured it would find them.

Person 1, after the task

When a search matches no cards, offer "Invite someone with this email".

## What worked

Found Settings, then Members, on their own

/settings

tab "Members"

getByRole('link', { name: 'Members' })

## How it works

How it works.

the-check

The check

One line in the merge box, next to your other checks. Its mark is neutral, never red or green: there is no pass to give, and it never blocks a merge unless you ask it to.

All checks have passed

1 neutral and 2 successful checks

preview

Deployment ready

tests

212 passed

check-page

Its details, on GitHub

Press Details and GitHub shows the check's own page: the sentence, the three problems to fix first with where they are and a link to the moment, and a link to the report. One screen, no pictures, no scrolling.

the-report

The report

The page the check links to, and the one you can send as a link. One line says whether it worked. Then each problem as one card, worst first, with its evidence inline: who hit it, where, the clip, their words and the smallest change. The five people in a strip, each linking to their attempt. One line closes the page.

## The example run

Weekboard

https://ui-tests.com

weekboard-git-invite-flow.vercel.app

80035db

Prolific

Prolific

CloudResearch Connect

Prolific

CloudResearch Connect

screened as signed up for a planning tool this week

Share

## Where the people come from

Where the people come from.

Friends are kind and coworkers know too much. Three ways to reach people who are neither, and what each one can and cannot tell you. Open a row to see how it works and what the person sees.

Source

Who

Cost

Time

Good for

How it works

link

Your link

A link to your run that anyone can open. Nothing to install.

Anyone outside your team: a customer, a community, a friend's friend

Free

Pay them if you like; the consent says so either way

As each person finishes

Closes at the deadline, 48 h unless you set one

What almost anybody would stumble on, today, and every week

`npx ui-tests run` prints the link. It can point at a branch preview, at your laptop through a tunnel, or at your live site.

You send it. Ask a friend to pass it on rather than take it themselves.

Whoever opens it answers the same short screener, so the report still says who they were. Each attempt lands as the person finishes.

Friends are kind and people in tech know too much.

Send it beyond your team and beyond tech where you can, and for each problem ask whether your users would hit it too.

visitors

Your visitors

On the hosted version: people already on your live site, invited when a page has given them trouble twice.

Real visitors who seemed stuck and said yes, on their own device

Paid

Like the panel, under a daily cap you set

Depends on your traffic

A page with trouble and a few hundred visitors a day gives one or two

Real tasks, real devices, the moment it went wrong

One script tag on your site. It watches for the same trouble the attempt view shows: a dead click, a rage click, a U-turn, a long pause.

Mark the pages it must never interrupt. Checkout, payment and a form in progress are never interrupted anyway.

The second sign of trouble on the same page invites the person. Nothing from before a yes is kept. Their attempt is kept beside the five, not inside.

They show where real users get stuck, not how many do.

Treat their problems as leads, and confirm them with a link or a panel run.

paid-panel

A paid panel

Five strangers who match your `users` block, found for you and paid by the run.

People who say they did what `users` describes; nobody who works in UX, design or marketing

Starting at $12 a person

Five from $60; a cap of $70 holds the reserve

First people within minutes

Usually all five within a few hours; a narrow audience a day or more

People like your users when you don't know any

Put a cap in the config. The hosted version brings the panel accounts; on your own machine you add a token.

`npx ui-tests run` turns `users` into each panel's filters and a short screener, prints the plan, and asks before it spends.

People are paid as they finish. Anyone you exclude later stays paid. What is not spent comes back.

Panel people answer screeners for money.

Read the Who took part line in the report, and exclude anyone who is plainly not your audience. They stay paid; the count does not.

One run filling across two panels

k2m9

5 people wanted

2 h 10 m

prolific

Prolific

3 of 3

first at 6 min

300,000+ active participants, 300+ filters, plus the screener from `users`

First person usually within minutes; five within a few hours; a narrow audience a day or more, and the plan says so

connect

CloudResearch Connect

2 of 2

first at 11 min

Thousands of vetted, census-matched participants; profiled, screened and custom audiences

First person within minutes; five within a few hours; a narrow audience needs a prescreen project, which adds time and cost

$60

$70

$10

Each attempt labelled with its panel

## What a run is worth

What a run is worth.

Five people cost about $60, about 39 minutes of a US developer's time. If one problem they show you would have taken longer than that to find from bug reports, reproduce and fix after release, the run has paid for itself.

The arithmetic: $135,980 ÷ 2,080 h = $65 an hour in wages. Wages are 70% of what employers pay, so about $93 an hour. $60 ÷ $93 = 0.65 h, about 39 minutes.

135,980

US median pay for software developers, a year

2,080

working hours a year

70

wages as a share of what employers pay, per cent

60

what the run cost

BLS, software developers, May 2025

https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm

BLS, employer costs, March 2026

https://www.bls.gov/news.release/archives/ecec_03202026.htm

## This page runs this test

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: {
    are: 'developers who ship UI and have no researcher',
    did: 'shipped a user interface you built yourself',
    within: '3 months',
    role: ['developer', 'designer', 'founder'],
    not: ['works in UX research'],
  },
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

Run it with people

Test your API with an agent

Node 22. Paste one line on any site, or install the package in a Next.js app.

In a Next.js app, install the package. On any other site, paste one line instead: Without a repository.

You see "ui-tests" in `devDependencies`.

You see a link in the terminal, then in your browser the consent, a few questions, the first look, the scenario card, your own page with the bar over it, and the questions after the task, one at a time. Press "Done". The terminal prints:

You open `ui-tests/invite.ui.test.ts`, the file `init` wrote with the Weekboard example filled in, and change it to your own site:

You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co. When you think you've finished, press Done. If you get stuck, press I couldn't do this." It is written from `users`, `purpose`, the goal and `beforeEach`, never from the path; pin your own wording with `scenario`. Write `users` as the sentence alone and `ui-tests lint` prints the screener it drafted from it, and the plan names the recording level: event replay, or screen video with `video: true`.

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

## The footer

miguel.design

Open source MIT licence

Report a bug or suggest an improvement

About ui-tests

## Rehearsal

Rehearsal: 0 of 5 planned attempts recorded.

## Terminal output

These frames are generated by the CLI’s Ink renderer.

### report

```text
● Problems found: 4, seen across all 5 people.
  Reached the goal: 2 of 5.
  Pressed Done, but your check failed: 2 of 5.

▏1  2 of 5  blocked   Pressed Add, saw nothing change, pressed it again
 2  1 of 5  blocked   Add looked switched off; pressed I couldn't do this
 3  4 of 5  slowed    Looked for Invite in the Share menu, found only links
 4  2 of 5  confused  Typed Sam's email into the board search
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
Created ui-tests/invite.ui.test.ts
Created vitest.config.ts
Next: npm run dev, then npx ui-tests
$ npx ui-tests
```

### init

```text
Created ui-tests.config.ts
Created ui-tests/invite.ui.test.ts
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
Paid panel: 5 people on Prolific and CloudResearch Connect · cap $70
First people within minutes. Usually all five within a few hours; a narrow audience a day or more.
The run closes at its deadline, 48 hours unless you set one.
Person 1 · Prolific · first at 6 min
Person 2 · Prolific
Person 3 · CloudResearch Connect · first at 11 min
Person 4 · Prolific
Person 5 · CloudResearch Connect
Paid $60 of the $70 cap · $10 back
```

## Contributing and automation

Run `npm ci` and `npx playwright install chromium`, then `npm run validate`. This checks the factory, TypeScript, unit tests and the local browser rehearsal (including accessibility). `npm run build` checks the production Next.js build. Vitest excludes `**/*.ui.test.ts`; those files are authoring inputs, not unit tests.

The two npm workspaces are `apps/web` and `packages/ui-tests`. The collector and SQLite adapter are for local development. The player receives an allowlisted participant view; expected answers, happy paths and hooks stay in the CLI. Local SQLite data and compiled hooks live in ignored `.ui-tests/`.

The autonomous factory is vendored in [`factory/`](factory/README.md) from `miguel-perez/archon-factory`. Planning documents live in [`docs/`](docs/). To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. CodeRabbit review and protected merge requirements remain in force.
