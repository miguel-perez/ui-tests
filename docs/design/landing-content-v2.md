# Landing content, version 2

**Superseded** by [`landing-content-v3.md`](landing-content-v3.md), which is the approved copy; kept for the record. Its sources figures were corrected in round seven (issue #31), which found the old ones contradicted by the research ([`../discovery/sources-research.md`](../discovery/sources-research.md)). The 87% sentence in this draft is dropped in version 3: the approved page states only the problems found and their counts, because a run may mix link, panel and struggle-triggered visitors, and the detection probability holds only for a sample that meets its occurrence and sampling assumptions.

The page as a document, block by block in reading order. Every example artefact is invented content in the product's real formats and carries the label "Example run" once in its frame.

---

## Headline

**Chosen.** Write one test. Real people run it.

**Alternatives.**

1. Usability testing you can run in CI.
2. Five people from your audience try your pull request. You get back what went wrong.
3. Find out whether people can use what you built, before you merge it.

---

## 1. The promise

**Headline.** Write one test. Real people run it.

**Standfirst.** Say who your users are, what they are trying to do, and how you can tell they did it. One command sends five people from your audience to try it on your preview. Back comes every problem they hit, ranked, with the moment to watch, the words they said, and what to change.

**For.** Developers, designers and founders who ship UI without a researcher.

**Buttons.** Get started (`/docs/getting-started`). GitHub.

**Under the buttons.** Open source. Nothing to sign up for. Node 22 and a Next.js app.

**Artefact.** Two halves. Left, what you write. Right, what comes back. The right frame carries the label "Example run".

Left:

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

Caption under the file: This page runs this test.

Right, the check as it appears on the pull request:

```text
ui-tests (human) · problems found: 4 across 5 people · see report
```

Right, below the check, the top of the report:

```text
Problems found: 4 across 5 people.

1  Clicked the code block to copy it, nothing happened      3 of 5
2  Read the README on GitHub before finding the guide       2 of 5
3  Looked for a sign-up before the install command          2 of 5
4  Gave up: has no Next.js app to try it on                 1 of 5
```

Caption under the report: Each problem opens to the moments to watch, the words, and what to change. Problem 1 is why the code blocks on this page have a copy button.

---

## 2. What comes back

**Heading.** What comes back.

**Lead.** A trace of what each person did, the problems ranked across people, and the smallest change that would fix each one. Here is a run on a billing page.

**Artefact A: the test.** Frame label: Example run.

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'office managers who pay for their team plan',
  purpose: 'keep the subscription paid without emailing support',
}, () => {
  goal('replace the card on file', {
    happyPath: ['/settings', '/settings/billing', '/settings/billing/payment-method'],
  }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('Default card ending in 4242')
    })
  })
})
```

**Artefact B: one person's trace.**

```text
P2 · replace the card on file
2:48 · outcome incorrect · ease 2 of 7 · confidence 5 of 7

00:00  scenario dismissed · /dashboard
00:06  open the avatar menu
00:09  click "Account"                 deviation · /account
00:17  pause · 11 s on /account
00:28  click "Plan"                    dead click
00:31  click "Plan"                    dead click
00:40  back to /dashboard              backtrack
00:52  click "Settings"                /settings
00:55  click "Billing"                 /settings/billing
01:10  pause · 9 s on the invoice list
01:19  click the card row              dead click
01:33  scroll, click "Add card"        /settings/billing/payment-method
02:31  click "Save"                    card ending in 4242 added · default still 1881
02:48  I'm done
```

Their words, after the two questions: "I went to my avatar because billing is about me. Then I added the card. I assume it uses the new one now."

**Artefact C: problems across five people.** Ranked by how many hit them.

| # | Problem | People | What they said | Watch | What to change |
| --- | --- | --- | --- | --- | --- |
| 1 | Looked for billing under the avatar menu and found only Account | 4 of 5 | "Billing is about me, so I went to my avatar." | P2 00:09, P1 00:07, P4 00:05, P5 00:12 | Add Billing to the avatar menu. One link. |
| 2 | Clicked "Plan" on the account page and nothing happened | 3 of 5 | No words. Two clicks each, then back. | P2 00:28, P1 00:21, P4 00:19 | "Plan" is a heading styled like a link. Link it to `/settings/billing`. |
| 3 | Added a new card and left the old one charging | 2 of 5 | "I assume it uses the new one now." | P2 02:31, P5 01:47 | Make a newly added card the default, or ask on save: "Use this card from now on?" |
| 4 | Clicked the card row to edit it; the only button is below the fold | 2 of 5 | "I thought the card was the thing you click." | P2 01:19, P3 00:44 | Make the card row open the payment-method page. |

**Artefact D: the result line.**

```text
Problems found: 4 across 5 people.
Five people give an 87% chance of seeing any problem that hits at least one person in three.
```

Under it: Fix problem 3 first. Two people believed they had finished, and their next invoice would still go to the old card.

**Closing line.** A run reports the problems it found, or that it found none at this sample size. It does not grade your page.

---

## 3. What the person sees

**Heading.** What the person sees.

**Lead.** The test becomes a task for a real person. They see your live page with a small bar over it, and nothing else.

**Artefact.** Three screens as real UI, each beside the line in the file that made it. Frame label: Example run.

1. **The scenario card**, shown before your page loads:

   > Imagine you want to replace the card on file. Work as you normally would, then tell us when you are finished.
   >
   > [ Start ]

   Beside it: `goal('replace the card on file')`.

2. **The bar over your page**, the only two controls:

   > [ I'm done ]  [ I can't do this ]

   Beside it: `outcome(...)`. The check runs on your side after either button.

3. **Two questions and a box**, after the bar:

   > How easy was that? 1 very hard … 7 very easy
   >
   > How confident are you that it worked? 1 not at all … 7 completely
   >
   > Anything you want to tell us? (optional)

   Beside it: their ratings and words land in the trace.

**Closing line.** They never see the path you expected or the check you wrote.

---

## 4. Who tries it

**Heading.** Who tries it.

**Lead.** Three ways to get people. Mix them in one run.

| | Who | Cost | Results |
| --- | --- | --- | --- |
| Your link | Anyone you send it to: customers, a community, the person at the next desk | Free | As each person finishes |
| A panel | Five people matched to `users`, found for you | About $55 for five on Prolific and CloudResearch Connect, under a cap of $70 that holds the reserve. | First people within minutes; usually all five within a few hours |
| Your visitors | On the hosted version: people already on your live site, invited when a page has given them trouble twice | Paid like the panel, under a daily cap you set | Depends on your traffic |

---

## 5. In your pull request

**Heading.** In your pull request.

**Lead.** Add `npx ui-tests run` to the job that deploys your preview. When the attempts are in, the run posts a check with a report page the whole team can open and share.

**Artefact.** The check:

```text
ui-tests (human) · problems found: 4 across 5 people · see report
```

The commands:

| Command | What it does |
| --- | --- |
| `npx ui-tests` | Rehearse the test on yourself. Nothing is counted as a result. |
| `npx ui-tests run` | A real run. Invites people, records every attempt, checks each one, posts the check. |
| `npx ui-tests report <run>` | The ranked problems, each with the moments to watch and what to change. |
| `npx ui-tests trace <run>` | Every person's trace, moment by moment. |

---

## 6. Install

**Heading.** Three commands.

**Lead.** Node 22 and a Next.js app.

```sh
npm install -D ui-tests
npx ui-tests init
npx ui-tests
```

**Closing copy.** The third command rehearses the example test on you, so you see the task, the bar and your own trace before you invite anyone. Open source. No seats, no contract, nothing to sign up for. Free with your own link or your own visitors. Pay for the panel only, under a cap you set.

**Buttons.** Get started. GitHub.

---

## Getting-started page

Five steps. Each pairs what you type with what you see.

**1. Install**

You type:

```sh
npm install -D ui-tests
```

You see `ui-tests` under `devDependencies` in `package.json`.

**2. Set up**

You type:

```sh
npx ui-tests init
```

You see:

```text
Wrote ui-tests.config.ts
Wrote ui-tests/getting-started.ui.test.ts
Mounted the player at /ui-tests
Next: npx ui-tests
```

**3. Rehearse on yourself**

You type:

```sh
npx ui-tests
```

You see a link in the terminal, then in your browser the scenario card, your own page with the bar over it, and the two questions. Press "I'm done". The terminal prints:

```text
Outcome: correct
Rehearsal: not counted. Trace: http://localhost:3000/ui-tests/trace/local
```

**4. Write your own test**

You type, in `ui-tests/getting-started.ui.test.ts`:

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'office managers who pay for their team plan',
  purpose: 'keep the subscription paid without emailing support',
}, () => {
  goal('replace the card on file', { happyPath: ['/settings', '/settings/billing'] }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('Default card ending in 4242')
    })
  })
})
```

You see, on the next `npx ui-tests`, the scenario card now reads: "Imagine you want to replace the card on file. Work as you normally would, then tell us when you are finished."

**5. Run it with real people**

You type:

```sh
npx ui-tests run
```

You see:

```text
Run 7f3a started
Share this link: https://ui-tests.com/t/7f3a
Paid panel: 5 people · cap $70 · first people within minutes
```

Then, when the attempts are in, `npx ui-tests report 7f3a`:

```text
Problems found: 4 across 5 people.
Five people give an 87% chance of seeing any problem that hits at least one person in three.

1  Looked for billing under the avatar menu      4 of 5   P2 00:09, P1 00:07, P4 00:05, P5 00:12
2  Clicked "Plan" and nothing happened           3 of 5   P2 00:28, P1 00:21, P4 00:19
3  Added a new card, old one still charging      2 of 5   P2 02:31, P5 01:47
4  Clicked the card row to edit it               2 of 5   P2 01:19, P3 00:44
```

---

## What was cut from the schema, and why

Cut from §4: the animated contract (a still file beside its result says it in one glance), the per-field margin notes, the status line and planned labels, the research quotes and counts, the standards sentence, and the sample-size block as a block of its own. Terms folded into Install. The trace and ranked problems moved up to the second screen.
