# Landing content, version 3

The page written out in reading order, one block at a time. One example run (inviting a colleague to a board in a freshly launched app) carries through every block so the visitor follows a single story. The artefacts are invented content in the product's real formats; each frame carries the label "Example run" once. Each block is preceded by a note, in italics, of the question the visitor is asking at that point; the note is for the designer and is not page copy.

**The page since the composition round (issue #46).** Six sections, in this order: the promise (block 1); what comes back (block 2, which since issue #46 carries the check, its page and the report that block 5 used to carry, and no longer the one-person attempt); what you write, what they see (block 3, its six screens one at a time as tabs); where the people come from (block 4); the agent section; the hosted section. Every section sits on one grid ([`../../design/artefacts/README.md`](../../design/artefacts/README.md#the-page-grid-in-one-place)); the words of every block are unchanged except block 2's, which are [`../../design/artefacts/what-comes-back.html`](../../design/artefacts/what-comes-back.html)'s.

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
Reached the goal: 2 of 5.
Pressed Done, but your check failed: 2 of 5.

1  2 of 5  blocked   Pressed Add, saw nothing change, pressed it again
2  1 of 5  blocked   Add looked switched off; pressed I couldn't do this
3  4 of 5  slowed    Looked for Invite in the Share menu, found only links
4  2 of 5  confused  Typed Sam's email into the board search
```

**Caption.** Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

---

## 2. What comes back

*What do I actually get, and would I know what to do with it.*

Rebuilt in the composition round (issue #46) from [`../../design/artefacts/what-comes-back.html`](../../design/artefacts/what-comes-back.html), in place of this block's one-person attempt and of block 5, "In the pull request"; the words below are the artefact's, verbatim. The one-person attempt view is no longer on the landing: it is the page `/r/k2m9/p<n>` behind each name in the report's people line. Frame label: Example run.

**Heading.** What comes back.

**Lead.** Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request, and behind it the report: whether people reached the goal, the problems they hit, worst first, and for each one the clip, their words, the moment to watch and the smallest change. The check never fails your build. Your other tests prove the code works. This one shows whether a person can use it.

1. **The check.** One line in the merge box, next to your other checks. Its mark is neutral, never red or green: there is no pass to give, and it never blocks a merge unless you ask it to.

```text
ui-tests · 4 problems found · 2 of 5 people reached the goal
```

2. **Its details, on GitHub.** Press Details and GitHub shows the check's own page: the sentence, the three problems to fix first with where they are and a link to the moment, and a link to the report. One screen, no pictures, no scrolling.

The page: "5 people tried *invite a colleague* on this preview. 2 of 5 reached the goal; 2 of 5 pressed Done, but your check failed. This check never fails your build. It reports problems, or that none were seen this time." Then the three to fix first, by impact, then by how many people hit them:

| # | Problem | Where | People | Impact | Moment |
| --- | --- | --- | --- | --- | --- |
| 1 | Pressed Add, saw nothing change, pressed it again; Sam got two invitations | `/settings/members` · `button "Add"` | 2 of 5 | Blocked | Person 3 · 00:58 |
| 2 | The Add button looked switched off; Person 2 pressed I couldn't do this | `/settings/members` · `button "Add"` | 1 of 5 | Blocked | Person 2 · 00:49 |
| 3 | Looked for Invite in the Share menu and found only link options | `/board` · `menu "Share"` | 4 of 5 | Slowed | Person 1 · 00:04 |

Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect. Open the report · +1 more problem · What worked. Footer: 5 people · paid panel (Prolific, CloudResearch Connect) · the preview · the commit · the date.

3. **The report.** The page the check links to, and the one you can send as a link. One line says whether it worked. The five people sit under it, each with their outcome and a link to their attempt. Then the problems on the left, worst first, with impact, where, who hit it and how many; on the right the evidence for the one selected, which stays put while the list scrolls: the clip, the words, where as a locator you can paste, the moments, the smallest change, and a copy as an issue. One line closes the page.

The report (`/r/k2m9`; `design/artefacts/run-report.html`): "invite a colleague · Reached the goal: 2 of 5 · Problems found: 4, seen across all 5 people · Pressed Done, but your check failed: 2 of 5". The problems in the run's rank, then "Found Settings, then Members, on their own" (5 of 5) as what worked. The closing line ends: "Found automatically from what people did; it can miss problems. Watch the clips."

**Closing line.** A run reports the problems it found, or that it found none this time. There is no score and no pass.

---

## 3. What you write, what they see

*Do I have to write a script, and will I lead them.*

Since the composition round (issue #46) the six screens below are tabs under the commands and the file, one step open at a time (1 Consent, 2 Screener, 3 First look, 4 Scenario card, 5 Your page, with the bar, 6 After the task); the words are unchanged.

**Heading.** What you write, what they see.

**Lead.** Every screen a person meets, in the order they meet it, beside the lines of your test that produce it, and what comes back from each. The path you expect and the check you wrote stay on your side, so nothing you wrote can lead them.

**Commands.** Three cards in one row, each a command and what it does.

| Command | Does |
| --- | --- |
| `npm install -D ui-tests` | Adds the package. |
| `npx ui-tests init` | Creates **the file** below, with the example filled in. |
| `npx ui-tests run` | Turns it into **these screens** and puts people in front of them. |

**Under the commands.** `npx ui-tests` on its own runs every screen on you first, so you see the card, the bar and your own trace before anyone else does.

**The file.** `ui-tests/invite.ui.test.ts`, 23 lines, exactly what `npx ui-tests init` writes. Frame label: Example run.

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

**The pieces.** Six, in the order a person meets them. Each shows its name, the note, only the lines that produce it (original line numbers kept, skipped lines as a dots row), the screen in a light frame with the chrome at real size, and what comes back.

### 1. Consent

**Subtitle.** before anything loads

**Note.** What the person does on the page is always recorded, and the consent says so in plain words. `video: true` adds the screen as a video, which is what needs the browser's prompt; without that line the first line of the list is all there is. Voice and camera are always the person's choice. The incentive and the purposes are filled in from the run. The colours are Weekboard's: the chrome inverts their page and takes the one accent they set.

**Lines.** `video`

```text
12   video: true,
```

**Screen.** "Weekboard · before you start". "Weekboard would like to watch you try something on their site." What you do on their page: where you click, what you type, which pages you open (always) · Your screen, as a video, while you try it (needed) · Your voice, only if you choose to talk later (optional) · Your camera (off). "The website is being tested, not you. You can stop at any time and still be paid $9." [ What is recorded? ] [ Continue ]

**Comes back.** recorded: actions, screen, voice · camera: declined

### 2. Who gets in, and how many

**Subtitle.** the sample

**Note.** Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.

The `catch` line sets how many: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost about $55, under a cap you set before it starts. The paid panel and your visitors are the only things you pay for; your own link costs nothing.

**Lines.** `users · purpose · catch`

```text
 4   users: {
 5     are: 'people who signed up this week and want a colleague on their board',
 6     did: 'signed up for a tool to plan work with a team',
 7     within: '7 days',
 8     uses: ['Trello', 'Asana', 'Notion', 'Linear'],
 9     not: ['has used Weekboard'],
10   },
11   purpose: 'plan the week together without emailing screenshots around',
   ⋯
17     catch: { affecting: '1 in 3', confidence: 0.85 },
```

**Screens.** Six, one per screen, each with Next. "A few questions first · n of 6". (1) When did you last sign up for a tool to plan work with a team? In the past week · In the past month · Earlier this year · I haven't. (2) Which of these do you use to plan work? Pick all that apply. Trello · Asana · Notion · Linear · Basecamp · None of these. (3) Which of these have you done? Pick all that apply. Managed a team of more than five · Used Weekboard · Taken a course on planning or project management · None of these. (4) When did you last need to plan a week with other people? This week · This month · Earlier this year · I don't. (5) How do you do it today? A shared document or spreadsheet · A planning tool · Chat and email · In my head. (6) How much does it matter to you to get this right? A lot: it costs me time every week · Some · Not much.

**Worked out on your side.** People: 5 from the paid panel, matched to `users` · Chance of seeing a 1-in-3 problem: 87% · Cost: about $55 · cap $70 · first people within minutes, usually all five within a few hours.

**Comes back.** screened 20 · matched 5 · who took part: 3 of 5 had the need this month · how they do it today, in their words

### 3. First look

**Subtitle.** on by default

**Note.** The page the task starts on is flashed for 500 ms, then one open question. The start is the first page of the `happyPath` unless the goal names a `start`; name another page for the flash with `impression: { page }` when the task begins behind a login and the purpose lives on the public page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.

**Lines.** `purpose · happyPath`

```text
11   purpose: 'plan the week together without emailing screenshots around',
   ⋯
16     happyPath: ['/board', '/settings/members'],
```

**Screen.** Over the flashed page: "You saw a page for half a second". "What was that page for?" [ In your own words. There is no right answer. ] Talk instead · [ Next ]

**Comes back.** named the purpose: 4 of 5, with their words · first click on your path: 3 of 5

### 4. Scenario card

**Subtitle.** from the goal, never the path

**Note.** The situation from `users.are` and `purpose`, the action from the goal's name, the name and email from `beforeEach`. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.

**Lines.** `users · purpose · beforeEach · goal`

```text
 5     are: 'people who signed up this week and want a colleague on their board',
   ⋯
11   purpose: 'plan the week together without emailing screenshots around',
   ⋯
14   beforeEach(async () => ({ colleague: 'Sam', email: 'sam@acme.co' }))
15   goal('invite a colleague', {
```

**Screen.** Over the dimmed page: "Task 1 of 1". "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co." "When you think you've finished, press **Done**. If you get stuck, press **I couldn't do this**." [ Start task ]

**Comes back.** the exact card text, kept with the run

### 5. Your page, with the bar, then the check

**Subtitle.** two controls, one check

**Note.** One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `video`, with a pause; there is no microphone during the task. The summary is the goal's name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: the two pages of the `happyPath` set a silent three-minute limit, and the person may ask for more time once. The pill takes your font, inverts your page's colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.

When they press Done, the `outcome` runs against the page as they left it. What they said does not count; what the page says does. A check that cannot decide returns "couldn't tell" and is never rounded either way.

**Lines.** `goal · happyPath · video · outcome`

```text
12   video: true,
   ⋯
15   goal('invite a colleague', {
16     happyPath: ['/board', '/settings/members'],
   ⋯
19     outcome(async ({ page }) => {
20       expect(await page.textContent('main')).toContain('1 invitation pending')
21     })
```

**Screen.** The board with the bar: ● 0:41 ‖ · Task 1 of 1 Invite Sam to the board · Done · I couldn't do this.

**After Done · runs on your side.** `expect(await page.textContent('main')).toContain('1 invitation pending')` · Person 3, after Done: Not reached · main contained "2 invitations pending" · Person 5, after Done: Reached · 1:12.

**Comes back.** time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn't tell, with the diff

### 6. After the task

**Subtitle.** not from your file

**Note.** Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that gave up: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard's people never see it.

**Lines.** None: not from your file.

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
| **Your visitors** · On the hosted version: people already on your live site, invited when a page has given them trouble twice. | Real visitors who seemed stuck and said yes, on their own device | Paid like the panel · Under a daily cap you set | Depends on your traffic · A page with trouble and a few hundred visitors a day gives one or two | Real tasks, real devices, the moment it went wrong |
| **A paid panel** · Five strangers who match your `users` block, found for you and paid by the run. | People who say they did what `users` describes; nobody who works in UX, design or marketing | About $11 a person · Five about $55; a cap of $70 holds the reserve | First people within minutes · Usually all five within a few hours; a narrow audience a day or more | People like your users when you don't know any |

One row is open at a time; each opens to how it works, the caveat and one picture.

**Your link.** How it works: (1) `npx ui-tests run` prints the link. It can point at a branch preview, at your laptop through a tunnel, or at your live site. (2) You send it. Ask a friend to pass it on rather than take it themselves. (3) Whoever opens it answers the same short screener, so the report still says who they were. Each attempt lands as the person finishes. Caveat: **Friends are kind and people in tech know too much.** Send it beyond your team and beyond tech where you can, and for each problem ask whether your users would hit it too. Picture: the join screen a person sees when they open the link, from the real player: "Weekboard · about 10 minutes". "Weekboard asked for your help with one thing on their site." "You'll try it the way you normally would, then answer two short questions. There are no wrong moves. The website is being tested, not you." What you do on their page is recorded (always) · Your screen, as a video (needed) · Your voice, only if you choose to talk (optional). "A few questions about you first." [ Start ]

**Your visitors.** How it works: (1) One script tag on your site. It watches for the same trouble the attempt view shows: a dead click, a rage click, a U-turn, a long pause. (2) Mark the pages it must never interrupt. Checkout, payment and a form in progress are never interrupted anyway. (3) The second sign of trouble on the same page invites the person. Nothing from before a yes is kept. Their attempt is kept beside the five, not inside. Caveat: **They show where real users get stuck, not how many do.** Treat their problems as leads, and confirm them with a link or a panel run. Picture: the invitation over the Weekboard page, in the chrome's surface, from the real player: "This page seems to be giving you trouble. Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you." [ Sure ] [ No thanks ]

**A paid panel.** How it works: (1) Put a cap in the config. The hosted version brings the panel accounts; on your own machine you add a token. (2) `npx ui-tests run` turns `users` into each panel's filters and a short screener, prints the plan, and asks before it spends. (3) People are paid as they finish. Anyone you exclude later stays paid. What is not spent comes back. Caveat: **Panel people answer screeners for money.** Read the Who took part line in the report, and exclude anyone who is plainly not your audience. They stay paid; the count does not. Picture: run k2m9 filling, 5 people wanted, 2 h 10 m. Prolific (its wordmark): 3 of 3, first at 6 min; Pool: 300,000+ active participants, 300+ filters, plus the screener from `users`; Speed: First person usually within minutes; five within a few hours; a narrow audience a day or more, and the plan says so. CloudResearch Connect (its wordmark): 2 of 2, first at 11 min; Pool: Thousands of vetted, census-matched participants; profiled, screened and custom audiences; Speed: First person within minutes; five within a few hours; a narrow audience needs a prescreen project, which adds time and cost. Paid $55 of the $70 cap · $15 back · Each attempt labelled with its panel.

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

You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co. When you think you've finished, press Done. If you get stuck, press I couldn't do this." It is written from `users`, `purpose`, the goal and `beforeEach`, never from the path; pin your own wording with `scenario`.

**5. Run it with real people**

You type:

```sh
npx ui-tests run
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
Paid $55 of the $70 cap · $15 back
```

**6. Read what came back**

You type, once the attempts are in:

```sh
npx ui-tests report k2m9
```

You see:

```text
Problems found: 4, seen across all 5 people.
Reached the goal: 2 of 5.
Pressed Done, but your check failed: 2 of 5.

1  2 of 5  blocked   Pressed Add, saw nothing change, pressed it again
2  1 of 5  blocked   Add looked switched off; pressed I couldn't do this
3  4 of 5  slowed    Looked for Invite in the Share menu, found only links
4  2 of 5  confused  Typed Sam's email into the board search

Report: https://ui-tests.com/r/k2m9
```

Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:

```text
ui-tests · 4 problems found · 2 of 5 people reached the goal · Details
```

---

## What was left out, and why

Nothing on the page says how many people a run needs or what a small group can and cannot detect, because the visitor's doubt at this point is whether anyone will try the thing at all; the number lives inside the example result and nowhere else. No research counts, quotes or standards, because evidence of the author's homework is proof for the author, and this visitor wants proof that the output is usable on Monday. No list of roles, because the visitor decides whether the page is for them from the problem list, and anyone who has ever shipped a screen recognises themselves in "Share is where you add people". No explanation of how the card, the questions or the ranking are produced, because the visitor cannot act on it yet and the earlier drafts stalled there. No AI or agent angle, no pricing table, no commands reference, no status or roadmap, no second question in the player, because each costs a sentence the visitor has to read before they see the result, and the result is the only thing that makes them stay.
