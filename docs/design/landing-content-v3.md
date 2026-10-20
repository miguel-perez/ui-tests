# Landing content, version 3

The page written out in reading order, one block at a time. One example run (inviting a colleague to a board in a freshly launched app) carries through every block so the visitor follows a single story. The artefacts are invented content in the product's real formats; each frame carries the label "Example run" once. Each block is preceded by a note, in italics, of the question the visitor is asking at that point; the note is for the designer and is not page copy.

**The page since the composition round (issue #46).** Six sections, in this order: the promise (block 1); what comes back (block 2, which since issue #46 carries the check, its page and the report that block 5 used to carry, and no longer the one-person attempt); what you write, what they see (block 3, its six screens one at a time as tabs); where the people come from (block 4); the agent section; the hosted section. Every section sits on one grid ([`../../design/artefacts/README.md`](../../design/artefacts/README.md#the-page-grid-in-one-place)); the words of every block are unchanged except block 2's, which are [`../../design/artefacts/what-comes-back.html`](../../design/artefacts/what-comes-back.html)'s.

**The agent round (issue #49).** Block 2 is "How it works." with no lead, and its report is the list ([`../../design/artefacts/run-report-list.html`](../../design/artefacts/run-report-list.html)); the sources table opens with no row open; the agent section is [`../../design/artefacts/agents-section.html`](../../design/artefacts/agents-section.html)'s, written out under "The agent section" below; the guide's steps 5 and 6 are "Run it with people" and "Test your API with an agent".


**The worth round (issue #53).** A section between where the people come from and the agent section: what a run is worth, in one sentence, from [`../../design/artefacts/roi-section.html`](../../design/artefacts/roi-section.html) and [`../discovery/roi-research.md`](../discovery/roi-research.md), written out under "What a run is worth" below. The page is now seven sections: the promise, how it works, what you write, where the people come from, what a run is worth, the agent section, the hosted section.

**The host round (issue #56).** There is no hosted service ([`../discovery/hosting-decision.md`](../discovery/hosting-decision.md)): the no-repo path is a one-command deploy the author owns. The last section is [`../../design/artefacts/hosted-section.html`](../../design/artefacts/hosted-section.html)'s, written out under "No repo to put it in? One command." below; the dashboard leaves the landing; the visitors row says "On your deploy"; the guide's "Without a repository" is one paragraph on `ui-tests host` with its caveat line.

---

## The visitor

They shipped something last week: a side project, a redesign, a two-person startup's sign-up. The code has tests. Nothing tests whether a stranger understands the first screen. No researcher, no budget, nobody who thinks this matters.

One minute ago a forum thread told them to do some usability testing, and they searched for how. Three friends said it looks great. They believed none of them.

They fear that people arrive, leave, and never say why. That a tool wants a company email or $500 a month. That they will word the task wrong and lead people. That paid strangers will rush through. That it takes a weekend. And, a little, of what they will find.

They have tried watching a friend over a shoulder, an analytics goal, a free test with the wrong tester, a trial that hit a paywall at step three.

First five seconds: another platform with a demo button, or a unit test library, or a sign-up form. They stay if the second screen is a list of problems they would fix on Monday, with the moment and the words. They leave at a logo wall, a tab of roles, a sentence they must read twice.

---

## Headline

**Chosen.** See where people get stuck on what you just shipped.

**Alternatives.**

1. You stopped seeing your own site weeks ago. Strangers haven't.
2. Real people try your site. You get the moments where they got lost.

**Why the chosen one survives the five seconds.** It is the sentence the visitor already has in their head, it names the fear (stuck) and the moment (just shipped), and it says nothing about method, so a developer cannot read it as unit testing and a person with no researcher cannot read it as a researcher's tool.

---

## 1. The promise

*Will this tell me where people get stuck, and is it for someone like me.*

**Headline.** See where people get stuck on what you just shipped.

**Standfirst.** Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.

**Buttons.** Get started (`/docs/getting-started`). GitHub.

**Under the buttons.** Open source. Nothing to sign up for. Runs on your preview or your live site.

**Artefact.** The result as it lands in the terminal. Frame label: Example run.

```text
Problems found: 4, seen across all 5 people.
Reached the goal: 4 of 5.

1  1 of 5  blocked   Add looked switched off; pressed I couldn't do this
2  4 of 5  slowed    Looked for Invite in the Share menu, found only links
3  2 of 5  confused  Pressed Add, saw nothing change, pressed it again
4  2 of 5  confused  Typed Sam's email into the board search
```

**Caption.** Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

---

## 2. How it works

*What do I actually get, and would I know what to do with it.*

Rebuilt in the composition round (issue #46) from [`../../design/artefacts/what-comes-back.html`](../../design/artefacts/what-comes-back.html), in place of this block's one-person attempt and of block 5, "In the pull request"; the words below are the artefact's, verbatim. The one-person attempt view is no longer on the landing: it is the page `/r/k2m9/p<n>` behind each name in the report's people line. Frame label: Example run.

**Heading.** How it works. (Issue #49: "What comes back." until then. No lead; since issue #62 the three pieces have no rule between them.)

1. **The check.** One line in the merge box, next to your other checks, from `npx ui-tests check` in your preview job. It waits while people take part and turns neutral when the run closes, never red or green: there is no pass to give. One run per pull request: a push while people are still in starts nothing new, and the line names the commit they saw.

```text
ui-tests · 4 problems found · 4 of 5 people reached the goal
```

2. **Its details, on GitHub.** Press Details and GitHub shows the check's own page: the sentence, the three problems to fix first with where they are and a link to the moment, and a link to the report. One screen, no pictures, no scrolling.

The page: "5 people tried *invite a colleague* on this preview. 4 of 5 reached the goal. This check never fails your build. It reports problems, or that none were seen this time." Then the three to fix first, by impact, then by how many people hit them:

| # | Problem | Where | People | Impact | Moment |
| --- | --- | --- | --- | --- | --- |
| 1 | The Add button looked switched off; Person 2 pressed I couldn't do this | `/settings/members` · `button "Add"` | 1 of 5 | Blocked | Person 2 · 00:49 |
| 2 | Looked for Invite in the Share menu and found only link options | `/board` · `menu "Share"` | 4 of 5 | Slowed | Person 1 · 00:04 |
| 3 | Pressed Add, saw nothing change, pressed it again; Sam got two invitations | `/settings/members` · `button "Add"` | 2 of 5 | Confused | Person 3 · 00:58 |

Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect. Open the report · +1 more problem · What worked. Footer: 5 people · paid panel (Prolific, CloudResearch Connect) · the preview · the commit · the date.

3. **The replay.** Every problem in the report comes with the moment it happened: the person's minute as a rail, the moments that got in the way as stops, and at each stop the clip, what they did, what they said afterwards, and the smallest change that would have fixed it.

Since the replay round (issue #62), in place of the report as the list, which stays at `/r/k2m9` (`design/artefacts/run-report-list.html`) and which the check page's links open. An illustration with nothing to press. The card: Person 3's screen at 00:58, "00:58 → 01:04". "Person 3 · 00:58 · Confused". "Pressed Add, saw nothing change, pressed it again." "I wasn't sure the first Add did anything, so I pressed it again." Smallest change: On press, change the button to "Invited sam@acme.example" and disable it. The rail: the attempt's thirteen events at 00:00, 00:03, 00:05, 00:12, 00:19, 00:23, 00:27, 00:36, 00:41, 00:46, 00:58, 01:01 and 01:03; the moments 00:03 Slowed, 00:23 Confused and 00:58 Confused; the ends "00:00 Started on /board" and "01:03 Pressed Done · reached the goal, with two invitations". The closing line under the report is off the landing with it.

---

## 3. What you write, what they see

*Do I have to write a script, and will I lead them.*

Since the composition round (issue #46) the six screens below are tabs under the commands, one step open at a time (1 Consent, 2 Screener, 3 First look, 4 Scenario card, 5 Your page, with the bar, 6 After the task); the words are unchanged. Since the trim round (issue #54) the tabs carry no code and the file sits after the steps' previous and next row; it is listed here first, as the command card names it.

**Heading.** What you write, what they see.

**Lead.** Every screen a person meets, in the order they meet it, and what comes back from each, then the whole test that produces them. The path you expect and the check you wrote stay on your side, so nothing you wrote can lead them.

**Commands.** Since the contract round (issue #68), one stacked list by what each costs: the command on the left (22ch) and what it does on the right, one row each; at phone width each row stacks. Nothing under it.

| Command | Does |
| --- | --- |
| `npm install -D ui-tests` | Adds the package. |
| `npx ui-tests init` | Writes **a study file** and a config, and prints the three lines to mount in your app. |
| `npx ui-tests` | Runs the whole study **on you**, in your browser: the consent, the scenario card, your page with the bar, and your own trace. Recruits nobody, costs nothing. |
| `npx ui-tests recruit` | Runs it with **real people**: your link, your visitors or a paid panel. Shows the plan and the price, and asks first. |
| `npx ui-tests check` | In the job that deploys your preview: the same run, with the cap in your config as the yes, and **a check on the pull request**. |

**The file.** `ui-tests/invite.ui.test.ts`, 30 lines, exactly what `npx ui-tests init` writes. Frame label: Example run.

```ts
import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', {
  users: {
    are: 'people who plan work with a team in a shared tool',
    did: 'used a shared tool to plan work with a team',
    within: '3 months',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
    firstLook: { page: '/' },
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(`/api/test/boards/${setup.board}/invitations`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})
```

**The pieces.** Six, in the order a person meets them. Each shows its name and the note on the left, and the screen in a light frame with the chrome at real size and what comes back on the right. No piece shows code of its own (the trim round, issue #54).

### 1. Consent

**Subtitle.** before anything loads

**Note.** What the person does on the page is always recorded, and the consent says so in plain words. `record: 'video'` adds the screen as a video, which is what needs the browser's prompt and raises the incentive to 1.5×, and the plan shows that price; without that line the first line of the list is all there is. Voice and camera are always the person's choice. The incentive and the purposes are filled in from the run. The colours are Weekboard's: the chrome inverts their page and takes the one accent they set.

**Screen.** "Weekboard · before you start". "Weekboard would like to watch you try something on their site." What you do on their page: where you click, what you type, which pages you open (always) · Your screen, as a video, while you try it (needed) · Your voice, only if you choose to talk later (optional) · Your camera (off). "The website is being tested, not you. You can stop at any time and still be paid $9." [ What is recorded? ] [ Continue ]

**Comes back.** recorded: actions, screen, voice · camera: declined

### 2. Who gets in, and how many

**Subtitle.** the sample

**Note.** Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.

The `sample` line sets how many, for the whole study: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost from $60, under a cap you set before it starts. The paid panel and your visitors are the only things you pay for; your own link costs nothing.

**Screens.** Six, one per screen, each with Next. "A few questions first · n of 6". (1) When did you last use a shared tool to plan work with a team? In the past week · In the past month · In the past 3 months · Longer ago, or never. (2) Which of these do you use to plan work? Pick all that apply. Trello · Asana · Notion · Linear · Basecamp · None of these. (3) Which of these have you done? Pick all that apply. Managed a team of more than five · Used Weekboard · Taken a course on planning or project management · None of these. (4) When did you last need to plan a week with other people? This week · This month · Earlier this year · I don't. (5) How do you do it today? A shared document or spreadsheet · A planning tool · Chat and email · In my head. (6) How much does it matter to you to get this right? A lot: it costs me time every week · Some · Not much.

**Comes back.** screened 20 · matched 5 · who took part: 3 of 5 had the need this month · how they do it today, in their words

### 3. First look

**Subtitle.** on for public pages

**Note.** A page is flashed for 500 ms, then one open question. It is the page the task starts on when that page is public, and off when the start is behind a sign-in, as Weekboard's board is; `firstLook: { page }` names the public page where the purpose lives, here the home page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.

**Screen.** Over the flashed page: "You saw a page for half a second". "What was that page for?" [ In your own words. There is no right answer. ] Talk instead · [ Next ]

**Comes back.** named the purpose: 4 of 5, with their words · first click on your path: 3 of 5

### 4. Scenario card

**Subtitle.** from the task, never the path

**Note.** The situation from `users.are` and `purpose`, the action from the task's name, the name and email from what `setup` returns. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.

**Screen.** Over the dimmed page: "Task 1 of 1". "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example." "When you think you've finished, press **Done**. If you get stuck, press **I couldn't do this**." [ Start task ]

**Comes back.** the exact card text, kept with the run

### 5. Your page, with the bar, then the check

**Subtitle.** two controls, one check

**Note.** One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `record: 'video'`, with a pause; there is no microphone during the task. The summary is the goal's name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: `timeLimit` is silent, and the person may ask for more time once. The `path` is only what you expect them to take; it sets nothing else. The pill takes your font, inverts your page's colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.

When they press Done, the `outcome` asks your app what happened, whatever page they ended on: here, whether this board has an invitation for Sam. What they said does not count; what your app holds does. Pressing Add twice still invited Sam; the second invitation comes back as a problem, not as a failure. A check that cannot decide returns "couldn't tell" and is never rounded either way.

**Screen.** The board with the bar: ● 0:41 ‖ · Task 1 of 1 Invite Sam to the board · Done · I couldn't do this.

**Comes back.** time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn't tell, with the diff

### 6. After the task

**Subtitle.** not from your file

**Note.** Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that ended with I couldn't do this: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard's people never see it.

**Screens.** Five, one per screen, each with Next, the last with Finish. "After the task · 1 of 2": Overall, how difficult or easy did you find this task? 1 Very difficult … 7 Very easy. "After the task · 2 of 2": What made it difficult? (typed, or Talk instead). "After all goals · 1 of 3": Would Weekboard be useful to you? Strongly disagree · Disagree · Neither · Agree · Strongly agree. "After all goals · 2 of 3": Weekboard is easy to use. (the same five). "After all goals · 3 of 3": Anything you want to tell Weekboard? Type here, or talk.

**Comes back.** ease 3 of 7 · what made it difficult, in their words · would it help them 4 of 5 · easy to use 2 of 5 · words and audio

---

## 4. Where the people come from

*I don't know anyone who isn't a friend.*

Rebuilt in round seven (issue #31) from [`../../design/artefacts/sources-section.html`](../../design/artefacts/sources-section.html); the copy below is the artefact's, verbatim. The research is [`../discovery/sources-research.md`](../discovery/sources-research.md) and [`../discovery/sources-desk-research.md`](../discovery/sources-desk-research.md).

**Heading.** Where the people come from.

**Lead.** Friends are kind and coworkers know too much. Three ways to reach people who are neither, and what each one can and cannot tell you. Open a row to see how it works and what the person sees.

| Source | Who | Cost | Time | Good for |
| --- | --- | --- | --- | --- |
| **Your link** · A link to your run that anyone can open. Nothing to install. | Anyone outside your team: a customer, a community, a friend's friend | Free · Pay them if you like; the consent says so either way | As each person finishes · Closes at the deadline, 48 h unless you set one | What almost anybody would stumble on, today, and every week |
| **Your visitors** · On your deploy: people already on your live site, invited when a page has given them trouble twice. | Real visitors who seemed stuck and said yes, on their own device | Paid · Like the panel, under a daily cap you set | Depends on your traffic · A page with trouble and a few hundred visitors a day gives one or two | Real tasks, real devices, the moment it went wrong |
| **A paid panel** · Five strangers who match your `users` block, found for you and paid by the run. | People who say they did what `users` describes; nobody who works in UX, design or marketing | Starting at $12 a person · Five from $60; a cap of $70 holds the reserve | First people within minutes · Usually all five within a few hours; a narrow audience a day or more | People like your users when you don't know any |

No row is open on arrival (issue #49); the first click opens one. One row is open at a time; each opens to how it works, the caveat and one picture.

**Your link.** How it works: (1) `npx ui-tests recruit` prints the link. It can point at a branch preview, at your laptop through a tunnel, or at your live site. (2) You send it. Ask a friend to pass it on rather than take it themselves. (3) Whoever opens it answers the same short screener, so the report still says who they were. Each attempt lands as the person finishes. Caveat: **Friends are kind and people in tech know too much.** Send it beyond your team and beyond tech where you can, and for each problem ask whether your users would hit it too. Picture: the join screen a person sees when they open the link, from the real player: "Weekboard · about 10 minutes". "Weekboard asked for your help with one thing on their site." "You'll try it the way you normally would, then answer two short questions. There are no wrong moves. The website is being tested, not you." What you do on their page is recorded (always) · Your screen, as a video (needed) · Your voice, only if you choose to talk (optional). "A few questions about you first." [ Start ]

**Your visitors.** How it works: (1) One script tag on your site. It watches for the same trouble the attempt view shows: a dead click, a rage click, a U-turn, a long pause. (2) Mark the pages it must never interrupt. Checkout, payment and a form in progress are never interrupted anyway. (3) The second sign of trouble on the same page invites the person. Nothing from before a yes is kept. Their attempt is kept beside the five, not inside. Caveat: **They show where real users get stuck, not how many do.** Treat their problems as leads, and confirm them with a link or a panel run. Picture: the invitation over the Weekboard page, in the chrome's surface, from the real player: "This page seems to be giving you trouble. Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you." [ Sure ] [ No thanks ]

**A paid panel.** How it works: (1) Put a cap in the config. Your deploy and your machine both use your own panel account: add a token once. (2) `npx ui-tests recruit` turns `users` into each panel's filters and a short screener, prints the plan, and asks before it spends. In CI, `npx ui-tests check` asks nothing: the cap in the config is the yes. (3) People are paid as they finish. Anyone you exclude later stays paid. What is not spent comes back. Caveat: **Panel people answer screeners for money.** Read the Who took part line in the report, and exclude anyone who is plainly not your audience. They stay paid; the count does not. Picture: run k2m9 filling, 5 people wanted, 2 h 10 m. Prolific (its wordmark): 3 of 3, first at 6 min; Pool: 300,000+ active participants, 300+ filters, plus the screener from `users`; Speed: First person usually within minutes; five within a few hours; a narrow audience a day or more, and the plan says so. CloudResearch Connect (its wordmark): 2 of 2, first at 11 min; Pool: Thousands of vetted, census-matched participants; profiled, screened and custom audiences; Speed: First person within minutes; five within a few hours; a narrow audience needs a prescreen project, which adds time and cost. Paid $60 of the $70 cap · $10 back · Each attempt labelled with its panel.

---

## What a run is worth

*Is it worth paying for?*

Added in the worth round (issue #53) from [`../../design/artefacts/roi-section.html`](../../design/artefacts/roi-section.html) and [`../discovery/roi-research.md`](../discovery/roi-research.md); the words are the artefact's, verbatim. The smallest section on the page: no figure and no calculator, the heading in the first five columns and the rest in the right seven. It weighs the price in a developer's hours, never as an ROI figure, the rule of ten, "studies show", "doubles conversion" or "saves money".

**Heading.** What a run is worth.

**The sentence.** Five people cost about **$60**, about **39 minutes** of a US developer's time. If one problem they show you would have taken longer than that to find from bug reports, reproduce and fix after release, the run has paid for itself.

**The arithmetic.** The arithmetic: `$135,980 ÷ 2,080 h = $65` an hour in wages. Wages are `70%` of what employers pay, so about `$93` an hour. `$60 ÷ $93 = 0.65 h`, about 39 minutes.

The four given numbers, $135,980 (US median pay for software developers, a year), 2,080 (working hours a year), 70 (wages as a share of what employers pay, per cent) and $60 (what the run cost: five people at $12 each), can be edited in place; $65, $93, 0.65 h and the time, in the arithmetic and the sentence, follow. Nothing is kept: a reload brings the defaults back.

**Sources.** [BLS, software developers, May 2025](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm) · [BLS, employer costs, March 2026](https://www.bls.gov/news.release/archives/ecec_03202026.htm)

---

## The agent section

*Does this only work for screens?*

Rebuilt in the agent round (issue #49) from [`../../design/artefacts/agents-section.html`](../../design/artefacts/agents-section.html) and [`../discovery/agent-section-research.md`](../discovery/agent-section-research.md); the words are the artefact's, verbatim. No terminal, no code block, no result line; the agent check keeps its name `ui-tests (agent)` in the package, and the landing does not show it.

**Heading.** Agents use some interfaces, too.

**Under the heading.** `$ npx ui-tests --actor agent`

**Lead.** Your API, your MCP server and your CLI have a second kind of user: an agent that reads text, not pixels. Point the same file at that surface and five trials show whether it gets through. It is a capability test, not a usability one, and it never counts with people.

| Tile | Target | Sentence |
| --- | --- | --- |
| Your API | `target: { http }` | Endpoint names, schemas and error bodies are its whole page. A `400` with no reason is a dead end. |
| Your MCP server | `target: { mcp }` | Tool names and their descriptions are the only labels it reads. If two tools sound alike, it picks one. |
| Your CLI | `target: { cli }` | Flags, help text and exit codes are what it sees. A `--help` that lies costs it the run. |

---

## No repo to put it in? One command.

*I have no repository. Can I still use it?*

Rebuilt in the host round (issue #56) from [`../../design/artefacts/hosted-section.html`](../../design/artefacts/hosted-section.html) and [`../discovery/hosting-decision.md`](../discovery/hosting-decision.md); the words are the artefact's, verbatim. Two pieces, unnumbered; no dashboard.

**Lead.** `npx ui-tests host` puts the collector, the player and the store on a free tier in an account you own, and prints one line to paste on your live site. Then the same test in a form instead of a file. The recordings stay on your box.

**The command.** Once, from any folder. It creates the deploy, keeps it on the free tier, and prints what to paste. Run it again to update.

```text
$ npx ui-tests host
Deploying to your account…
  collector   https://ui-tests.weekboard.workers.dev
  player      https://ui-tests.weekboard.workers.dev/t
  store       weekboard-ui-tests, your bucket, 0 recordings
  panel       no key yet · add one with ui-tests host --panel prolific
```

**The line.** One script tag, pointing at your deploy. It records only while a run is open and a person has said yes; the rest of the time it is forty lines that do nothing.

```html
<script src="https://ui-tests.weekboard.workers.dev/s.js" async></script>
```

**Closing.** Same test, same report, on a box you own.

---

## 5. In the pull request

Folded into block 2 in the composition round (issue #46): the check, its page and the report are the three pieces of "What comes back.", in the artefact's words. The heading "In the pull request." and its lead are no longer on the page.

---

## 6. Three commands

Folded into block 3 in round six (issue #28). The commands are the section's three cards; the closing copy moves into the screener piece's note (the panel's cost and cap, and, from round seven (issue #31), that the paid panel and your visitors are the only things you pay for: your visitors are paid like the panel, under a daily cap you set, and only your own link is free) and into the note under the commands (the bare `npx ui-tests` runs every screen on you first). The page no longer shows its own test file.

---

## Getting-started page

Six steps, each as the thing you type and the thing you then see.

**1. Install**

You type:

```sh
npm install -D ui-tests
```

You see `"ui-tests"` in `devDependencies`.

**2. Set up**

You type:

```sh
npx ui-tests init
```

You see:

```text
Created ui-tests.config.ts
Created ui-tests/invite.ui.test.ts
Created vitest.config.ts
Next: npm run dev, then npx ui-tests
```

**3. Try it on yourself**

You type:

```sh
npx ui-tests
```

You see a link in the terminal, then in your browser the consent, a few questions, the first look, the scenario card, your own page with the bar over it, and the questions after the task, one at a time. Press "Done". The terminal prints:

```text
Reached the goal: Yes
Rehearsal: 0 of 5 planned attempts recorded.
Trace: http://127.0.0.1:43210/…
```

**4. Write your own**

You open `ui-tests/invite.ui.test.ts`, the file `init` wrote with the Weekboard example filled in (round six: the same file the landing section and the README show), and change it to your own site:

```ts
import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', {
  users: {
    are: 'people who plan work with a team in a shared tool',
    did: 'used a shared tool to plan work with a team',
    within: '3 months',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
    firstLook: { page: '/' },
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(`/api/test/boards/${setup.board}/invitations`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})
```

You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example. When you think you've finished, press Done. If you get stuck, press I couldn't do this." It is written from `users`, `purpose`, the task and what `setup` returns, never from the path; pin your own wording with `scenario`. Write `users` as the sentence alone and `ui-tests lint` prints the screener it drafted from it, and the plan names the recording level: event replay, or screen video with `record: 'video'`.

**5. Run it with people** (issue #49; step 6 is "Test your API with an agent")

You type:

```sh
npx ui-tests recruit
```

You see:

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

**Read what came back**

You type, once the attempts are in:

```sh
npx ui-tests report k2m9
```

You see:

```text
Problems found: 4, seen across all 5 people.
Reached the goal: 4 of 5.

1  1 of 5  blocked   Add looked switched off; pressed I couldn't do this
2  4 of 5  slowed    Looked for Invite in the Share menu, found only links
3  2 of 5  confused  Pressed Add, saw nothing change, pressed it again
4  2 of 5  confused  Typed Sam's email into the board search

Report: https://ui-tests.com/r/k2m9
```

Then, for the pull request, put `npx ui-tests check` in the job that deploys your preview. It starts one run per pull request within the cap in your config, asks nothing, and the check waits while people take part, then turns neutral. A push during the run starts nothing new. On the next pull request you see the check:

```text
ui-tests · 4 problems found · 4 of 5 people reached the goal · Details
```

Until it ships, one line under it: check: starting the run from CI is not shipped yet; today it publishes the check from a run summary. (Design record, 2026-10: written before #69 shipped; kept as it was.) See https://github.com/miguel-perez/ui-tests/issues/69.

---

## What was left out, and why

Nothing on the page says how many people a run needs or what a small group can and cannot detect, because the visitor's doubt at this point is whether anyone will try the thing at all; the number lives inside the example result and nowhere else. No research counts, quotes or standards, because evidence of the author's homework is proof for the author, and this visitor wants proof that the output is usable on Monday. No list of roles, because the visitor decides whether the page is for them from the problem list, and anyone who has ever shipped a screen recognises themselves in "Share is where you add people". No explanation of how the card, the questions or the ranking are produced, because the visitor cannot act on it yet and the earlier drafts stalled there. No AI or agent angle, no pricing table, no commands reference, no status or roadmap, no second question in the player, because each costs a sentence the visitor has to read before they see the result, and the result is the only thing that makes them stay.
