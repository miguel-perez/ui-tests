# Landing content, version 3

The page written out in reading order, one block at a time. One example run (inviting a colleague to a board in a freshly launched app) carries through every block so the visitor follows a single story. The artefacts are invented content in the product's real formats; each frame carries the label "Example run" once. Each block is preceded by a note, in italics, of the question the visitor is asking at that point; the note is for the designer and is not page copy.

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
Problems found: 4 across 5 people.

1  Looked for Invite in the Share menu and found only link options   4 of 5
2  Pressed Add, saw nothing change, pressed it again                 2 of 5
3  Typed the colleague's email into the board search                 2 of 5
4  Stopped at a grey Add button and gave up                          1 of 5
```

**Caption.** Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.

---

## 2. What comes back

*What do I actually get, and would I know what to do with it.*

**Heading.** What comes back.

**Lead.** Here is the whole of one run: the file that asked for it, what one person did, and what to fix.

**Artefact A: the file.** Frame label: Example run.

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

**Caption.** If you have written a Playwright test, you have written this.

**Artefact B: one person.**

```text
P3 · invite a colleague
1:03 · outcome incorrect · ease 3 of 7

00:00  scenario dismissed                      /board
00:03  click "Share"                           menu open
00:05  pause · 7 s reading the menu
00:12  click "Manage link"                     deviation · /board/link
00:19  back                                   backtrack · /board
00:23  type "sam@acme.co" into Search
00:27  pause · 9 s on "No cards match"
00:36  press Enter                             dead click
00:41  click the avatar, click "Settings"      /settings
00:46  click "Members"                         /settings/members
00:58  type the email, press "Add"             1 invitation pending
01:01  press "Add" again                       2 invitations pending
01:03  I'm done
```

Their words, after the ease question: "Share seemed like the place for people. When I found it I wasn't sure the first Add did anything, so I pressed it again."

**Artefact C: the problems, ranked across the run.**

| # | Problem | People | What they said | Watch | What to change |
| --- | --- | --- | --- | --- | --- |
| 1 | Looked for Invite in the Share menu and found only link options | 4 of 5 | "Share is where you add people." | P1 00:04, P2 00:06, P3 00:03, P5 00:09 | Put "Invite a colleague" at the top of the Share menu. |
| 2 | Pressed Add, saw nothing change, pressed it again; two invitations went out | 2 of 5 | "I wasn't sure the first one did anything." | P3 00:58, P4 00:41 | On press, change the button to "Invited sam@acme.co" and disable it. |
| 3 | Typed the colleague's email into the board search | 2 of 5 | "I figured it would find them." | P3 00:23, P1 00:30 | When a search matches no cards, offer "Invite someone with this email". |
| 4 | Stopped at a grey Add button and gave up | 1 of 5 | "It looked switched off." | P2 00:49 | Keep the button solid. Validate the address on press, with a message. |

**Artefact D: the last line of the report.**

```text
Problems found: 4 across 5 people.
```

Under it: Problem 1 is one link. Problem 2 is the one to fix first: both people who hit it believed they were finished, and their colleague got the same email twice.

**Closing line.** A run reports the problems it found, or that it found none this time. There is no score and no pass.

---

## 3. What the person sees

*Do I have to write a script, and will I lead them.*

**Heading.** What the person sees.

**Lead.** Your page, with a small bar over it. Nothing else.

**Artefact.** Three screens as real UI, each beside the line in the file it came from. Frame label: Example run.

1. **The scenario card**, before your page loads:

   > Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished.
   >
   > [ Start ]

   Beside it: `goal('invite a colleague')`.

2. **The bar**, the only two controls on the page:

   > [ I'm done ]  [ I can't do this ]

   Beside it: `outcome(...)`. It runs on your side after either button.

3. **One question and a box**, after the bar:

   > How easy was that? 1 very hard … 7 very easy
   >
   > Anything you want to tell us? (optional)

   Beside it: the rating and the words land in their trace.

*Designer's note, not page copy: the player also shows a consent screen before the card and a confidence question after the ease question; the page shows only the three surfaces above. The optional box is added to the player in D2.*

**Closing line.** They never see the path you expected or the check you wrote, so nothing you wrote can lead them.

---

## 4. Where the people come from

*I don't know anyone who isn't a friend.*

**Heading.** Where the people come from.

**Lead.** Friends are kind and coworkers know too much. Three ways to reach people who are neither.

| | Who | Cost | Results |
| --- | --- | --- | --- |
| Your link | Anyone you send it to: a customer, a community, the person at the next desk | Free | As each person finishes |
| A panel | People matched to the `users` line in your file, found for you | About $54 for a short task, under a cap you set | Within 48 hours |
| Your visitors | On the hosted version: people already on your live site, invited the moment they are visibly struggling | Free | As each person finishes |

---

## 5. In the pull request

*Does it fit the way I already work.*

**Heading.** In the pull request.

**Lead.** Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request with a report page anyone on the team can open. Your other tests prove the code works. This one shows whether a person can use it.

**Artefact.** The check as it appears on the pull request. Frame label: Example run.

```text
ui-tests · Problems found: 4 across 5 people · Report
```

Under it: the report page opens on the ranked problems, each with the moments to watch and what to change, and every person's trace below.

---

## 6. Three commands

*How long until I see something, and what does it cost.*

**Heading.** Three commands.

**Lead.** Node 22 and a Next.js app.

```sh
npm install -D ui-tests
npx ui-tests init
npx ui-tests
```

**Closing copy.** The third command runs the example task on you, so you see the card, the bar and your own trace before anyone else does. Open source, with no seats and no account. Your own link and your own visitors cost nothing. The panel is the only thing you pay for, and you set the cap before it starts.

**Buttons.** Get started. GitHub.

**Artefact.** This page runs this test.

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

**Caption.** The outcome checks that you reached the guide. If you get stuck on the way there, this page may ask you to say so. That is the third way to find people, running here.

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
Created ui-tests/first.ui.test.ts
Player available at /ui-tests
Try it on yourself: npx ui-tests
```

**3. Try it on yourself**

You type:

```sh
npx ui-tests
```

You see a link in the terminal, then in your browser the scenario card, your own page with the bar over it, and the ease question. Press "I'm done". The terminal prints:

```text
Outcome: correct · ease 6 of 7
You, not counted. Trace: http://localhost:3000/ui-tests/trace/you
```

**4. Write your own**

You type, in `ui-tests/first.ui.test.ts`:

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

You see, on the next `npx ui-tests`, the card now reads: "Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished."

**5. Run it with real people**

You type:

```sh
npx ui-tests run
```

You see:

```text
Run k2m9 started
Send this link to anyone: https://ui-tests.com/t/k2m9
Panel: 5 people matched to "people who signed up this week and want a colleague on their board"
Cap: $60 · results within 48 hours
```

**6. Read what came back**

You type, once the attempts are in:

```sh
npx ui-tests report k2m9
```

You see:

```text
Problems found: 4 across 5 people.

1  Looked for Invite in the Share menu and found only link options   4 of 5   P1 00:04, P2 00:06, P3 00:03, P5 00:09
2  Pressed Add, saw nothing change, pressed it again                 2 of 5   P3 00:58, P4 00:41
3  Typed the colleague's email into the board search                 2 of 5   P3 00:23, P1 00:30
4  Stopped at a grey Add button and gave up                          1 of 5   P2 00:49

Report: https://ui-tests.com/r/k2m9
```

Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:

```text
ui-tests · Problems found: 4 across 5 people · Report
```

---

## What was left out, and why

Nothing on the page says how many people a run needs or what a small group can and cannot detect, because the visitor's doubt at this point is whether anyone will try the thing at all; the number lives inside the example result and nowhere else. No research counts, quotes or standards, because evidence of the author's homework is proof for the author, and this visitor wants proof that the output is usable on Monday. No list of roles, because the visitor decides whether the page is for them from the problem list, and anyone who has ever shipped a screen recognises themselves in "Share is where you add people". No explanation of how the card, the questions or the ranking are produced, because the visitor cannot act on it yet and the earlier drafts stalled there. No AI or agent angle, no pricing table, no commands reference, no status or roadmap, no second question in the player, because each costs a sentence the visitor has to read before they see the result, and the result is the only thing that makes them stay.
