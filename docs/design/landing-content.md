# Landing content, D2 (first draft, superseded)

**Superseded** by [`landing-content-v2.md`](landing-content-v2.md) and later drafts after the author's review; kept for the record of what was rejected and why. On the figures: 87% is the achieved probability that five independent attempts show a problem affecting one person in three, 1 − (2/3)^5; the compiler's configured default is 85% confidence, from which it plans five attempts. The CLI prints only the rehearsal line today.

16 October 2026. The page written as a document before any layout, following [`content-audit.md`](content-audit.md) §4. Each block has its copy, its artefact, and notes on what the artefact must show. Copy is final unless marked draft; artefacts are described exactly enough to be generated. The non-bending rules from D1 still hold: ISO 9241-11 terms for usability, "evidence for the people clauses of ISO 9241-210", never compliant, certified, pass, or a percentage as a result at n = 5, an honest status, no mention of agent runs or the hosted track, the real `apps/web/landing.ui.test.ts` as the example, the commands unchanged.

**Example data.** Blocks 1, 3, 4 and 5 show a five-person run of the landing context. No such run has happened; R0 supports self-rehearsals only. Every example artefact carries the label "Example run: invented attempts, real formats" once, in its frame, and the people are P1 to P5. The formats are the product's own: the compiled context, the scenario card, the taskbar, the trace's issue kinds (gave up, timed out, dead click, pause, deviation, low ease rating), the outcome line and the sentence.

---

## 1. The claim

**Eyebrow.** Usability testing, in your repo.

**Headline.** Usability testing that runs like your tests.

**Standfirst.** Write who the users are and what they are trying to do. Run it. Get back the problems people hit, in their words, and a sentence that says what five people can and cannot tell you.

**For.** Developers who ship UI and have no researcher.

**Buttons.** Get started → `/docs/getting-started`. View on GitHub.

**Artefact: the contract in motion.** One frame, two halves. Left, the test file from block 2, highlighted, static. Right, a sequence that plays once on load and replays on hover or on a replay control, 12 to 15 seconds, with a reduced-motion fallback that shows the last frame:

1. The scenario card appears, with the words derived from the goal: "Imagine you want to start trying ui-tests. Work as you normally would, then tell us when you are finished." The card's `goal` line in the file lights up as it appears.
2. A cursor moves through a miniature of the page: pauses on the code block, clicks "View on GitHub", comes back, clicks "Get started". The taskbar sits at the bottom with "I'm done" and "I can't do this".
3. The trace fills beside it, one line per moment: `pause · 00:11 · 8 s on the code block`, `deviation · 00:19 · /github`, `done · 01:09`.
4. The outcome line: `Outcome: correct`. The `outcome` block in the file lights up.
5. The sentence: `Problems found: 3 across 5 people.` and under it, smaller, `Five people give an 87% chance of seeing any problem that hits at least one person in three.`

Nothing in the sequence is decorative. Every element is an artefact the product emits or will emit, and the lit-up field on the left is the field that produced it.

---

## 2. What you write

**Heading.** What you write.

**Lead.** A developer who has written a Playwright test already knows every answer. Who the people are. What they are trying to do. A goal in their words. An `outcome` on the end state. A happy path if you designed one. Everything else is derived, shown, and editable, never required.

**Artefact.** The real file, highlighted, with a margin note on each field:

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

| Field | Margin note |
| --- | --- |
| `users` | Who it is for, in one sentence. Becomes the screener. |
| `purpose` | What they are trying to do, from their side, not the product's. Becomes the fit questions and the impression stage. |
| `goal` | The test name, in the person's words. Becomes the scenario. Interface words are a lint error. |
| `happyPath` | The route you designed. Never shown to the person. Deviations from it become issue signals. |
| `outcome` | Runs in the runner against the end-state snapshot, never in the person's browser. A thrown assertion is `incorrect`. |

**Closing line.** This is the test for this page. It is not an illustration.

---

## 3. What it turns into

**Heading.** What the person sees.

**Lead.** Derived defaults are the researcher you do not have. Each one shows the rule that produced it and can be edited before anyone is invited.

**Artefact.** Three player screens as real UI, each beside the field it came from, in order:

1. **The scenario card.** "Imagine you want to start trying ui-tests. Work as you normally would, then tell us when you are finished." Beside it: `from goal; the happy path is never an input`.
2. **The fit questions.** "How relevant is it to find out whether people can use what I built, without a researcher?" with Not relevant, Somewhat relevant, Very relevant. "How often do you need to…?" with Rarely to Daily. Beside it: `from purpose`. Note in the frame: derived now, asked at run time from R1.
3. **The taskbar over the page.** "I'm done" and "I can't do this", the only two controls, floating over the live site. Beside it: `the outcome is never asked; it is checked`.

**Closing line.** Nothing the person sees contains the answer.

---

## 4. What you get back

**Heading.** What you get back.

**Lead.** A trace of what each person did, the moments that look like trouble, and the issues ranked across people. A signal is a place to look, not a verdict about a person.

**Artefact A: one person's trace.** P3, as a timeline, labelled "Example run: invented attempts, real formats":

```text
P3 · start trying ui-tests · 1:09 · outcome correct · ease 5 of 7

00:00  scenario dismissed, / ready
00:04  scroll to the code block
00:11  pause · 8 s on the code block
00:19  click "View on GitHub" · deviation · https://github.com/miguel-perez/ui-tests
00:52  back to /
01:03  click "Get started"
01:05  /docs/getting-started
01:09  I'm done
```

With the person's words after the ease question, in a quote: "I went to the repo first because I wanted to see whether it runs in my browser or theirs."

**Artefact B: issues across five people.** Ranked by how many hit them, with the moment to watch:

| # | Issue | People | Words | Moment |
| --- | --- | --- | --- | --- |
| 1 | Paused on the test file to work out where the outcome runs | 3 of 5 | "in my browser or theirs" | P3 00:11, P1 00:08, P5 00:14 |
| 2 | Left for the repository before the guide | 2 of 5 | "I read READMEs first" | P3 00:19, P2 00:06 |
| 3 | Clicked the issue list expecting it to open | 2 of 5 | dead click | P1 00:31, P4 00:27 |
| 4 | Gave up: no Next.js app to try it on | 1 of 5 | "I have a Rails app" | P4 00:58, context-level |

Under the table: `3 of 5 reached the outcome by their own route · 1 incorrect (ended on GitHub) · 1 gave up`. The fourth issue is marked as a finding about the context, not the page: the person is outside `users` as written, and the report says so instead of counting it as a failure.

**Closing line.** Every path is recorded. The happy path is what you compare them to, not what you make people follow.

---

## 5. What the numbers may say

**Heading.** What five people can tell you.

**Lead.** Problems, not rates. Five people give an 87% chance of seeing any problem that hits at least one person in three. They cannot say how often it happens. So a run reports problems found, or none found at this n, and never a pass.

**Artefact.** The sentence as the CLI and the report print it, in two states:

```text
Problems found: 4 across 5 people.
Five people give an 87% chance of seeing any problem that hits at least one person in three.
```

```text
Rehearsal: 0 of 5 planned attempts recorded.
```

The second is what you see today, after rehearsing on yourself: an attempt by the author never counts toward n.

**Closing line.** If you need a rate, the file can ask for one, and the plan grows to what a rate costs.

---

## 6. Where it runs

**Heading.** In your loop.

**Lead.** Today: a rehearsal on yourself, in dev mode, with the outcome checked and the trace rendered. Next: the same file with five people from your own audience by link, and the result as a check on the pull request. Then a panel, under a cap you set.

**Artefact.** The CLI output, verbatim from a dev run with example identifiers:

```text
Player: http://localhost:3000/ui-tests/00000000-0000-4000-8000-000000000000?token=…
Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/…
Run: 00000000-0000-4000-8000-000000000000
Outcome: correct
Rehearsal: 0 of 5 planned attempts recorded.
```

Beside it, a small mock of the planned pull-request check, labelled "Planned": `ui-tests (human) · problems found: 4 across 5 people · see report`.

**Status line.** Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person runs, impression and fit questions at run time, aggregated findings and the pull-request check do not work yet.

---

## 7. Install

**Heading.** Three commands.

**Lead.** Node 22 or newer and a Next.js App Router application. One afternoon from install to a first result.

```sh
npm install -D ui-tests
npx ui-tests init
npx ui-tests
```

**Closing line.** The init writes the config, the example test and the Vitest exclusion, and leaves existing files alone. Then follow the guide.

---

## 8. Why we built it

**Heading.** The want is old. The tool is not.

**Lead.** We read 124 public first-person accounts, from 2009 to 2026, of people trying to find out whether others could use what they built. Eighty-five wanted outside eyes because their own had gone blind to it. Thirty-two described the moment of watching someone and being shown something they could not have seen alone. Twenty-six posted on a forum instead, because they had nothing else.

**Artefact.** Four pull quotes, each linked to its source:

- "QA and unit tests tell me whether the code works but not whether the experience makes sense." (Hacker News, 2026)
- "Being a developer, though, I'd like to test this. How does one do so?" (Hacker News, 2011)
- "Really helpful to see people charge off down the wrong alley if the wording is just slightly off." (Hacker News, 2012)
- "I am a student. I am broke." (UX Stack Exchange, 2023)

**Closing line.** The record a run leaves behind is evidence for the people clauses of ISO 9241-210. It is not a certification.

---

## 9. Terms

**Heading.** Yours.

**Copy.** Open source. Nothing to sign up for. Local rehearsals are free and stay on your machine. The plan: free with your own participants, pay only for a panel, no seats. Your tests prove it works and keeps working. This proves people can use it.

**Footer line.** The record is evidence for the people clauses of ISO 9241-210.

---

## Getting-started page

Keeps the five steps and the commands. Each step pairs what you type with what you see, as a two-column pair:

| Step | You type | You see |
| --- | --- | --- |
| 1 Install | `npm install -D ui-tests` | the package in `devDependencies` |
| 2 Init and mount | `npx ui-tests init`; the three mounts | the files it wrote, and the taskbar over your page in dev |
| 3 Write the test | the landing file | `npx ui-tests lint` output: the derived scenario and each rule's reason |
| 4 Run dev mode | `npx ui-tests` | the CLI lines, the player's consent and scenario card, the taskbar |
| 5 Read the result | nothing | the trace: outcome, issue signals, the path against the happy path, the sentence |

The lint output in step 3 is new on the page and real: it is what the compiler prints today.

---

## README

Mirrors the copy word for word, as the test enforces: headline, standfirst, blocks 2, 5, 6, 7 and 9 in prose, the status line, and the contributing section unchanged. The example run (blocks 1, 3, 4) is not mirrored; the README links to the site for it.

## Open items

- The five-person example is invented. If the author prefers, blocks 4 and 5 can show only the real rehearsal; the page is then honest but thin, and the audit's case for showing the result would be lost.
- The quotes in block 8 are short enough to quote and link; the years are from the account ids.
- Block 6's pull-request check mock is the one artefact that does not exist in any form yet. It is labelled planned; drop it if that label is not enough.
