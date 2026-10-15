# R0: walking skeleton. The site is live and ui-tests runs its own landing context on the author

Self-contained issue text. The factory reads only this.

## Outcome

A developer can read the ui-tests site, install the package, run the example context on themselves in dev mode, and see the outcome, the first issue signals, the sentence and a trace. No CI runs, no strangers, no money moves.

## Stack, fixed

npm workspaces (the repository already uses npm and a package-lock, and the factory validates with `npm run validate`) with exactly two packages: `apps/web` (Next.js App Router, TypeScript, Tailwind, shadcn/ui, deployed on Vercel; the domain is already there) and `packages/ui-tests` (CLI, SDK and player; Node 22, TypeScript, Zod 4 schemas, SQLite via better-sqlite3 in dev). Our own tests: Vitest and Playwright with `@axe-core/playwright`; Vitest's config excludes `**/*.ui.test.ts`. Raw HTML pages, inline scripts, or a second UI framework are out.

## Build

1. **Site.** `apps/web` with two pages. `/`: the promise in one line ("Usability testing that runs like your unit tests. Define the goal and the happy path. It recruits the people, runs it, and reports the problems they hit."), then the ladder as the page's structure: functional and reliable are yours, usable, desirable and pleasurable are measured here, with the ISO 9241-11 terms on the usable rung; an example issue list and sentence rendered first within the usable rung; the context file rendered as code; three short sections (what you write, what is derived, what you get back); one line on the record as evidence for ISO 9241-210's people clauses, never the word compliant; and one call to action to `/docs/getting-started`. `/docs/getting-started`: install, init, write the test, run dev mode, read the result, with copy-paste commands. Agent runs and hosted are not mentioned.
2. **SDK mount.** `packages/ui-tests` exports a Next.js integration: a `<UiTests />` component for the root layout that, when a `ui-tests-run` cookie is present, mounts the recorder (clicks with target and whether anything changed within 300 ms, URL changes, scroll, masked input events, pauses over 5 seconds) and the floating taskbar as a fixed portal that survives client-side navigation, styled from the host's CSS variables with a neutral fallback, carrying the author's name and no ui-tests branding; a player route at `/ui-tests/[run]` for consent, the scenario card and the questions only, never the trace; and a collector route handler under `/api/ui-tests` that validates a participant token and writes runs, attempts, events and end-state snapshots (URL and serialised DOM at attempt end) through a storage adapter. Implement the SQLite adapter. `apps/web` mounts all three.
3. **Authoring.** The API, exactly:

   ```ts
   import { defineConfig } from 'ui-tests'           // ui-tests.config.ts
   export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })

   import { context, goal, task, outcome, expect } from 'ui-tests'   // *.ui.test.ts
   context({ users: '…', purpose: '…' /* required; no title; name and id derived */ }, () => {
     goal('…', { happyPath: ['/', '/docs/getting-started'] }, () => {      // options are optional
       task('…')                                                           // optional step
       task('…', async ({ page }) => { expect(page.url()).toContain('/x') })  // step with a check
       outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
     })
     goal('…', { minutes: 5 })                                              // no outcome: issues only, lint warns
   })
   ```

   `page` exposes `url()` and a DOM query over the stored snapshot; `participant.answer()` asks one validation question with distractors when the end state is not observable. Done and can't are the taskbar's. `expect` is a small assertion API over the snapshot (`toContain`, `toBe`, `toExist`, `toContainEqual`). The impression stage and the fit questions are derived from the context and compiled, but not run in this slice. A goal may have an `outcome` alone, a `happyPath`, `task` steps shown one at a time, or `minutes` with no outcome; the compiled context records which shape. `outcome` and per-task checks are compiled into a hooks bundle with esbuild and executed by the CLI (`ui-tests verify`) against the stored end-state snapshot; they never run in the app. An assertion failure is `incorrect`; missing evidence is `unknown`.
4. **Compile and lint.** `ui-tests lint` compiles the test file to a JSON context and runs these rules, each printing its reason and source: no interface terms in a goal (allowed inside `task` steps); one outcome per goal; outcome present, or `minutes` with a warning; outcome not weaker than the goal; users and purpose named, and the purpose phrased from the person's side rather than naming the product; context under 30 minutes by estimated time. Lint failures block dev mode and name the fix.
5. **Derived fields.** Scenario text from goal and fixture names, never from the happy path, written by a deterministic template in this slice (a model generator is a later slice; the interface is one function from goal and fixture names to text); timeout from happy-path or step count × 90 seconds with a 3-minute floor; sample size from `catch: { affecting: '1 in 3', confidence: 0.85 }` default, shown as a sentence; the result sentence from the same inputs; the impression stage and the three fit questions from the purpose, compiled and shown in the trace though not run here, with distractors from the same template generator. All visible in the trace with the rule that produced them. `scenario:` pins wording. Happy paths, expected answers and hooks are never sent to the player.
6. **Dev mode.** `npx ui-tests` sets the run cookie, opens the browser to the player against `target.url`, shows consent naming the purposes, the scenario card, the target top-level with the taskbar ("I'm done", "I can't do this"), then SEQ and confidence. The CLI then runs the outcome, derives issue signals from the attempt (gave up or timed out; a dead click, meaning a click after which nothing changed within 300 ms; a pause over 5 seconds; a URL off the happy path when the goal has one; SEQ of 3 or below), and serves the trace from its own local viewer on a separate port, never from the app: events, URL path versus happy path, end-state snapshot, hook result with diff, timings, and the sentence for this rehearsal attempt. A rehearsal attempt never counts toward n; the sentence says "Rehearsal: 0 of 5 planned attempts recorded."
7. **The landing context.** `apps/web/landing.ui.test.ts`: a context with users "developers who ship UI and have no researcher" and purpose "find out whether people can use what I built, without a researcher", and goal "start trying ui-tests" with happy path `['/', '/docs/getting-started']` and `outcome` asserting `page.url()` contains `/docs/getting-started`. Nothing else is written; the impression stage and fit questions derive from it.
8. **README.** The repository README leads with the one-line promise, the ladder in four lines, a short "what you write, what is derived, what you get back" in three lines, the context file as code, the install and dev-mode commands, a plain "work in progress" note with what works today and what does not, and a link to the site. No factory operating instructions above the fold; those move under a "Contributing and automation" heading at the end. The README and the landing page say the same thing in the same words.
9. **Init.** `npx ui-tests init` writes `ui-tests.config.ts`, the example test, the Vitest exclude, and prints the mount instructions.

## Acceptance criteria

- From a clean clone: `npm ci && npm run dev` starts the site and `npx ui-tests` in `apps/web` opens the player within five seconds.
- The author completes the landing goal in dev mode; the trace, served by the CLI, shows the outcome as `correct` with the final URL; the sentence reads "Rehearsal: 0 of 5 planned attempts recorded."
- Changing the happy path to a wrong route and repeating yields `incorrect` with a diff showing expected and actual URL.
- Pressing "I can't do this" yields terminal reason `gave up`, outcome `incorrect`, SEQ still collected, and at least one issue in the trace naming the moment.
- Clicking an inert element produces a dead-click issue with the element and the moment; wandering off the happy path produces a deviation issue with the page.
- A goal with `task` steps shows them one at a time with their own done; a goal with `minutes` and no outcome runs, yields a trace and no result sentence, and the lint warns.
- The outcome runs in the CLI process, not in the Next.js app: removing the test file from the app build changes nothing in the player, and the player bundle contains no happy path or expected answer (checked by grepping the built bundle).
- `ui-tests lint` fails on a goal named "click the Docs link and open getting started", on a goal named "understand what ui-tests does and start", and on a context whose purpose is "use ui-tests", printing the rule, its reason and its source; the same words inside a `task` step pass.
- The generated scenario for the landing context contains no UI terms, names the goal, and is editable through `scenario:`.
- The compiled context shows the derived impression stage with the purpose as its answer and the three fit questions, each with the rule that produced it.
- The player passes axe with no violations and the landing task can be completed with keyboard only.
- No participant-facing surface shows a ui-tests logo, name or link; the taskbar picks up the host page's theme tokens.
- `npm run validate`, the factory's entry, runs the factory check, unit tests for compile, lint, the sentence, the template generator and the SQLite adapter, and a Playwright test that drives the player end to end against the local site; Vitest does not collect `landing.ui.test.ts`.
- The Vercel preview of `apps/web` renders both pages.
- The README's promise, ladder, example and commands match the landing page and getting-started page word for word where they overlap.
- No panel code, no payment code, no CI action, no agent harness or `--actor` flag, no Postgres in this slice.

## Out of scope

Everything in later slices: async runs, GitHub checks, invite links, the impression stage and fit questions at run time, screener and practice screen, UX-Lite, issues clustered and ranked across people, event replay, panels, money, agent runs, screen recording, Postgres, hosted.
