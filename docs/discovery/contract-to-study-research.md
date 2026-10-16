# From the file to the study: what each line produces

16 October 2026. Research for the merged landing section that shows the test file on one side and the study it becomes on the other, with the Weekboard example throughout. Sources: [`../prd/01-dx-contract.md`](../prd/01-dx-contract.md) (inputs, derived fields, the `screen` table), [`../prd/02-study-and-verdict.md`](../prd/02-study-and-verdict.md) ("What a test compiles to", "Participant flow"), [`screener-research.md`](screener-research.md), [`participant-overlay-research.md`](participant-overlay-research.md), [`participant-chrome-research.md`](participant-chrome-research.md), the design corpus and the documentation sites named below.

## Findings first

- **Three contradictions, now settled.** (1) The bar's labels: the landing and `taskbar.html` say "I'm done / I can't do this", the card said "press Finish", the overlay research says "Done / I couldn't do this". The overlay research wins; the card's last line quotes the bar's labels verbatim. (2) The card text: `scenario-card.html`, landing v3 block 3 and getting-started step 4 still say "Imagine you want to invite a colleague… Work as you normally would", which carries no data. The derived text below replaces all three. (3) Confidence: PRD 01 asks it only when the outcome cannot be verified; PRD 02's participant flow lists it for every goal. PRD 01 wins; Weekboard's outcome is verifiable, so the confidence question is not shown in this example.
- **What the current landing covers:** about 6 of the 24 rows below (users, purpose, goal, happyPath and outcome as file text, plus the ease question and the comment box). None of consent, the screener, the impression stage, fixtures, the sample size or recording.
- **A fourth contradiction: the impression question's form.** PRD 02 compiles the impression stage as "What is this for?" with the purpose among generated distractors. [`impression-research.md`](impression-research.md) recommends "one open 'what is this site for?'", and the method sources agree: Perfetti's five-second test asks for free recall and then open questions tied to the page's purpose ([centercentre](https://articles.centercentre.com/five_second_test/)); Lyssna's guide opens with "What was this page about?" in the participant's own words, warns against priming, and reads the answers for themes with an 80% benchmark ([Lyssna](https://www.lyssna.com/guides/five-second-testing/)). A closed list leaks the purpose and turns recognition into recall of the options. The question is open; the answers are coded against the `purpose` (model-proposed, labelled, reviewable in the trace), and the purpose is never shown. PRD 02 should be amended.
- **Two URLs, one default.** The start page is implicit today: the first page of `happyPath`, and the impression stage flashes the same page. They come apart when the task starts behind a login and the purpose lives on the public page. The contract gains `start` on the goal (where the person lands; default the first page of `happyPath`, else the target's root) and `impression: { page }` (default the first goal's `start`; any public URL, since the flash is a screenshot). The Weekboard file is unchanged because the defaults hold.
- **No completion screen, no auto-advance.** The check's condition was true for Person 3 at 0:58; the finding happened after it. Ending the task when the state is reached would hide that and reveal the success condition. The person ends the task; Done confirms in place.
- **The fairness answer comes from what is hidden.** `happyPath`, the outcome assertion and `screen.not` never reach the participant. The section has to mark those lines visibly.

## 1. The mapping

Shown: the participant sees it. D/V: derived or verbatim. Landing: on the current page.

| Author writes | Participant sees / runner does | Comes back | Shown | D/V | Landing |
|---|---|---|---|---|---|
| `users` | Motive clause of the card; a draft `screen` when none is written; the panel match sentence | Who was matched | yes (card) | D | file only |
| `purpose` | Three fit questions ("When did you last need to…", "How do you do it today?", "How much does it matter?"); what the open impression answers are coded against; the card's situation sentence | Fit of the sample; how many named the purpose | yes | D | file only |
| `environment` | Narrows invites; device, browser and assistive technology asked in the screener | Environment per attempt | yes (screener) | D | no |
| `screen.did` + `within` | "When was the last time you {did}?" with recency bands; accept inside `within` | Screened in or out | yes | D | no |
| `screen.often` | Frequency question with concrete bands | same | yes | D | no |
| `screen.role` | Broad kind-of-work question, then role among neutral roles | same | yes | D | no |
| `screen.uses` | Multi-select with one decoy and "None of the above" | same | yes | D | no |
| `screen.not` | Listed among neutral options, plus the standing UX, design and marketing exclusion | same | yes, disguised | D | no |
| `screen.where`, `language`, `age` | Panel filters, never asked | Panel counts | no | — | no |
| `impression` (on by default; `{ page }` to flash another page) | The goal's `start` page flashed 500 ms, appeal 1–9, one open "What was that page for?", first click | Named the purpose (coded against `purpose`, with the words), appeal, first click | yes | D | no |
| `independent: true` | Goal order randomised | Order per participant | no | — | no |
| `record: 'screen'` | Consent lists screen recording; recording indicator; higher incentive | Video on the attempt | yes | D | no |
| `catch` / `estimate` | n derived: 1 in 3 at 0.85 gives 5 | "Five people give an 87% chance…"; the cost line | no | — | "5 people" only |
| `beforeEach` return | Names and data in the card ("Sam", the email) | — | yes | V (values) | no |
| `goal(name)` | The card's action sentence; the bar's one-line summary | Goal name in the report | yes | D | yes |
| `start` | Where the person lands; default the first page of `happyPath`, else the target's root | — | yes (the page) | V | no |
| `happyPath` | Never shown. Timeout floor (2 routes × 90 s, minimum 3 min); first-click target | Off-path moments, first click, path | no | — | file only |
| `task()` steps | One step at a time, each with its own Done; UI terms allowed | Step completion | yes | V | no |
| `timeout` | Silent limit, no countdown; "more time" offered once | How it ended: ran out of time | partly | D or V | no |
| `minutes` | Time box, no outcome | Problems and paths only | yes | V | no |
| `outcome()` | Never shown. Runs on the snapshot after Done or give-up | Reached: yes / no / couldn't tell, with the diff | no | — | yes ("runs on your side") |
| `participant.answer()` | One validation question with distractors | Verified answer | yes | D | no |
| `scenario` pin | Pinned card text replaces the derived text | Scenario text in the trace | yes | V | no |
| (standing) questions | SEQ after every attempt; "What made it difficult?" at 4 or below; confidence only when unverifiable; UX-Lite at the end; open question last, voice allowed | Ease, words, audio, usefulness | yes | D | ease and box only |
| (standing) consent, practice, completion | Consent filled with recording, incentive and purposes; one practice screen; completion code | Consented purposes, payment | yes | D | no |

## The Weekboard file (23 lines)

```ts
import { context, beforeEach, goal, outcome, expect } from 'ui-tests'

context({
  users: 'people who signed up this week and want a colleague on their board',
  purpose: 'plan the week together without emailing screenshots around',
  screen: {
    did: 'signed up for a tool to plan work with a team',
    within: '7 days',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  record: 'screen',
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

`catch` is the default, written out because it is the line that produces "5 people" and the cost. `impression` is left unwritten because it is on by default; its surface links back to lines 5 and 16. Left out: `environment` (shape unspecified), `task` (a different goal shape), `answer` (the outcome is observable), `scenario` (pinned only after review), `where`/`language`/`age` (filters, nothing visible).

**Surfaces it produces, in participant order** (number, lines, what comes back):

1. **Consent.** Screen recording, incentive, purposes; "the website is being tested, not you". Line 12. Consented purposes.
2. **Screener.** "When was the last time you signed up for a tool to plan work with a team?" (accept: past 7 days); tools multi-select with a decoy; exclusion list; then the three fit questions. Lines 4–11, 5. Fit.
3. **Practice screen.** Standing text.
4. **Impression.** /board flashed 500 ms, appeal, one open "What was that page for?", first click. Lines 5, 16. How many named the purpose, with their words; appeal; first click.
5. **Scenario card.** Lines 4, 5, 14, 15. Scenario text in the trace.
6. **Page with the bar.** Done, I couldn't do this, recording chip, no countdown, 3-minute silent limit. Lines 15, 16, 12. Time, path, moments, how it ended.
7. **The check after Done.** Not shown. Lines 19–21. Reached or not; P3's "2 invitations pending" is not reached.
8. **Ease.** "Overall, how difficult or easy did you find this task?", then "What made it difficult?" at 4 or below. Ease and words.
9. **After all goals.** UX-Lite, "Anything you want to tell us?" with voice, completion code. Usefulness and words.

The result rolls up into the sentence, from line 17: "Problems found: 4 across 5 people."

## 2. Showing cause and effect

| Pattern | What it does | Good for | Source |
|---|---|---|---|
| Comparisons within the eyespan, small multiples | Side by side in one frame; "constancy of design puts the emphasis on changes in data, not changes in data frames" | All surfaces in one constant frame size, in sequence | Tufte, *Envisioning Information*, "Small Multiples" |
| Colour and position as label, not letter codes | Byrne's Euclid replaced an "alphabetic macaroni of 63 encoded links" with elements that name themselves | Use marks sparingly; let highlight carry the link | Tufte, "Color and Information" |
| Adjacent in space, not stacked in time | Comparing from memory is weaker; separate legends are "navigation-related excise" | File and surfaces visible together; captions inside the frames | Cooper, *About Face* ch. 17 |
| Two-Panel Selector | A list in one panel, the selected item in the other; cuts eye travel and memory load; the list is the "you are here"; does not fit small screens | Sticky file plus scrolling surfaces | Tidwell, *Designing Interfaces* ch. 2 |
| Data brushing, coordinated views | Selecting in one view highlights the same items in the other, "different perspectives on the same data" | Two-way hover: line to surface and surface to lines | Tidwell ch. 6 |
| Natural mapping | "Arrange the controls in the same pattern as the lights" | Number the surfaces in participant order and put the same numbers in the code gutter | Norman, *Design of Everyday Things* |
| Stripe docs | Prose left, sticky code right; quickstarts highlight the lines for the step you scroll to | Scroll-synced line highlighting | stripe.com/docs |
| Playwright trace viewer | Selecting an action shows its source line and snapshot | The mental model this audience already has | playwright.dev/docs/trace-viewer |
| Tailwind docs | Rendered example above its code, one to one | Single input to single output | tailwindcss.com/docs |
| Storybook Controls | Edit an arg, the render updates | Exploration; not recommended here, it needs a live generator and invites play over judgement | storybook.js.org |

**What this visitor needs.** Two questions: can I write this (the whole file, unchanged, visible at once, and still), and does it lead people (which lines reach no surface).

**Layout at 1440.** Heading "What you write, what they see." Lead: the test on the left, every screen it produces on the right in the order a person meets it with what comes back from each, and the lines marked never shown stay on your side. A commands strip above the two columns: `npm install -D ui-tests`, `npx ui-tests init` creates the file (left), `npx ui-tests run` sends it to people (right); `npx ui-tests` alone in the caption, "try every screen on yourself first". Left 5 columns sticky: the code window with the 23 lines, the gutter carrying the surface numbers beside each line (a line may carry several), lines 16 and 19–21 marked never shown. Right 7 columns: the surfaces in constant-size light frames, each with its number, one caption naming the source lines, and one "Comes back" line; the check row has no frame, a dashed "runs on your side" row with its result. Linking: on scroll the row crossing about 40% of the viewport lights its lines; on hover both directions light; a gutter number click scrolls to the row; numbers are the keyboard and screen-reader fallback. After the sequence, one line: "Five people, from line 17: about $54 under the cap you set. Open source, no account." Derivation detail (screener bands, decoys) behind expand.

**At 375.** Commands stacked; the full file once, scrollable inside its window; then the sequence, each row preceded by an excerpt of just its lines with the original line numbers; a thin sticky header "5 of 9 · Scenario card".

**Schema impact.** Replaces the PlayerSurface rows and the commands block with one type, Compilation: file, surfaces[] {n, kind, lines[], caption, returns}, hidden lines[].

## 3. The card

Rules: character, motive, action and data, nothing more, and "trim any detail that doesn't contribute" (Krug, *Rocket Surgery*, ch. 5); no words from the screen, or the task becomes "a simple game of word-finding" (Krug; NN/g, [better usability tasks](https://www.nngroup.com/articles/better-usability-tasks/)); no steps, no elaborate stories, tell rather than ask (NN/g); give a reason, use the user's language, be more explicit in unmoderated tests (Sauro, [task tips](https://measuringu.com/task-tips/)); say how the task ends, because nobody will move them on (NN/g, [unmoderated testing](https://www.nngroup.com/articles/unmoderated-usability-testing/)).

| Rule | Current text | Verdict |
|---|---|---|
| Motive | "want your colleague Sam to plan it with you" | pass |
| Data | name and email | pass |
| No steps | | pass |
| UI words | "Invite" passes today (controls are Share, Manage link, Settings, Members, Add); it fails after fix 1 puts "Invite a colleague" in the Share menu, so lint re-checks against the target's control labels every run | conditional |
| End | "press Finish" | fails: no such label |
| Give-up | "If you can't find it" | weak: presumes a thing to find |

**Final card text.**

> You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.
>
> When you think you've finished, press **Done**. If you get stuck, press **I couldn't do this**.
>
> [ Start task ]

"We're testing the site, not you" belongs on the consent and practice screens, not on every card. The same text replaces the "Imagine you want…" text in `scenario-card.html`, landing v3 block 3 and getting-started step 4.

**Derivation rule.** (1) Situation: "You {purpose verb phrase, second person, its 'without…' clause dropped} on this {fixture object}", then "and want {motive}", the `users` relative clause with the generic noun replaced by the fixture name. (2) Action: the `goal` verb phrase in the imperative with the fixture name substituted; never built from `happyPath`, `outcome` or `screen`; lint rewrites the verb as the end state when it matches a control label on any happy-path page. (3) Data: one sentence per fixture value the outcome depends on. (4) End: a fixed line quoting the bar's labels. Lint fails on a UI label in sentences 1–2, more than one action, a missing fixture value the goal references, or a card longer than four sentences. The output is editable in the trace and pinned with `scenario`.
