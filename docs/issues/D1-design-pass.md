# D1: design and copy pass. The site looks like developer tooling and says what the research found

Self-contained issue text. The factory reads only this.

## Outcome

ui-tests.com reads as a serious developer tool the moment it loads: dark, restrained, one accent, the product's own output as the hero. The words come from what 124 people said in public when they tried to find out whether others could use what they built. A developer who lands on `/` recognises their own situation in the first screen, understands what they would get back, and reaches `/docs/getting-started` without hunting. Nothing in the package changes.

## Direction, fixed

Vitest-led developer tooling. Read `design/references/README.md` and open every capture in `design/references/` before designing; the index says what to take from each.

- Surface: near-black background, hairline borders, one green accent for links, focus rings and the primary button. Dark is the only theme; ignore `prefers-color-scheme` for now.
- Type: the Fira family, loaded through `next/font/google` so Next self-hosts it: Fira Sans for all text, Fira Code for code, the terminal panel and anything mono. No other typeface, no external stylesheet. Headline scale from the Maze and Linear captures: the headline sits on two lines at desktop.
- Restraint from the Framer and Vercel captures: few elements, generous space, no photography, no stock illustration, no gradients beyond one accent glow.
- Participant surfaces (the player and the taskbar in `packages/ui-tests`) are not edited. They read the host's CSS variables, so they inherit the new tokens from `apps/web/app/globals.css`.

## Copy, grounded in the research

All site copy lives in `apps/web/lib/copy.ts` and is mirrored word for word in `README.md`; a unit test enforces the mirror, so change both together. Rewrite the copy from the material below. Keep the structure of the landing page (promise, ladder, example issue list and sentence, the context file, three sections, the standard line, one call to action) and of the guide (install, init and mount, write the test, run dev mode, read the result).

**Who reads it.** First, the developer who tests code, not experience: solo or small-team, has unit and end-to-end tests, no researcher, no idea how to run a fair test, no participants who match, and QA that passes while a real user leaves. Second, the builder who launched to find out: ships early because launching is the only test they can run, discounts friends' excitement and surveys, has been burnt building on assumptions, and wants to know whether visitors understand what the thing is. Write to the first; let the second recognise themselves. The lone UX person without a repo is not addressed on this site yet.

**What the research found, in order of weight.**

1. People want to see other people use the thing because they can no longer see it themselves. The strongest moment in every account is watching someone get stuck and being shown what they could not have seen alone. The feeling to write for is "see what stopped them", never "pass the check".
2. What stands between the want and the watching, by how many people hit it: not knowing how to run a fair test; being priced out of or blocked from tools (company email, mandatory seats, hundreds a month); no participants who match the audience; nobody around them who thinks it matters.
3. People discount signals that are not observed behaviour. Friends' excitement, surveys and ratings do not count; watching does.
4. Five people find problems; they do not certify a rate. Every self-serve tool hands back a percentage and a recording. Nothing says what two of five means. The sentence is the product's answer, and it must be on the landing page.
5. The want is a stage in the build loop, in the person's words: "know whether the experience makes sense", the way tests already say whether the code works. Describe the pipeline in those terms; do not lead with CI.
6. Zero procurement is table stakes: open source, nothing to sign up for, free with your own participants, pay only a panel, no seats.

**Their words you may quote.** Public posts, at most three on the whole site, each under fifteen words, each linked to its source:

- "QA and unit tests tell me whether the code works but not whether the experience makes sense." https://news.ycombinator.com/item?id=46913402
- "Being a developer, though, I'd like to test this. How does one do so?" https://news.ycombinator.com/item?id=2726997
- "I am a student. I am broke." https://ux.stackexchange.com/questions/141621
- Users "stare at the page for minutes" because the form does not look like a form. https://news.ycombinator.com/item?id=942344

**Rules that do not bend.**

- The usable rung names effectiveness, efficiency and satisfaction in a specified context of use and cites ISO 9241-11. The record is "evidence for the people clauses of ISO 9241-210"; never write compliant, certified or passes.
- A problem-catching run reports problems found or none found at this n. Never a percentage at n = 5, never pass or fail for people.
- Say only what is true today, and say plainly what is not. The work-in-progress note stays and lists what works now (local self-rehearsals, snapshot outcomes, issue signals, a trace) and what does not yet (recruitment, multi-person runs, impression and fit questions at run time, aggregated findings, the pull-request check). The headline may promise the product; the note keeps it honest.
- No synthetic users, no AI participants, no "agents as people". Do not mention agent runs or the hosted track at all.
- The example context stays exactly the contents of `apps/web/landing.ui.test.ts`; it is the real test, not an illustration. The users and purpose strings in that file do not change.
- The call to action still leads from `/` to `/docs/getting-started`; the landing context's happy path depends on it.
- The commands in the guide stay exactly as they are: `npm install -D ui-tests`, `npx ui-tests init`, `npm run dev`, `npx ui-tests`.
- Plain words. No marketing adjectives, no exclamation marks, no "seamless", "powerful", "effortless", "revolutionary". Sentences a developer would say out loud.

**The guide's prose** is for someone who has never run a usability test. Each step says what the command does and, in one line, why the derived thing exists: why the scenario is generated from the goal and not the path, why the lint rejects interface words in a goal, why the sentence says "0 of 5 planned attempts", why the outcome runs in the CLI and not in the app.

## Build

1. **Tokens.** Define the palette, radius, borders and type scale as CSS variables in `apps/web/app/globals.css`, including the variables the taskbar reads (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--border`, `--radius`). Tailwind reads the same variables. Delete the light palette. Load Fira Sans and Fira Code with `next/font/google` in the root layout and expose them as `--font-sans` and `--font-mono`.
2. **Shell.** A nav with the wordmark set in Fira Code (no logo image), links to the guide and the GitHub repository, and a thin bottom border. A footer with the same wordmark and the standard line. Shared by both pages.
3. **Landing `/`.** Rewrite the copy per the section above, then present it:
   - Hero: the new headline on two lines, a subtitle that names who it is for, two buttons (Get started, View on GitHub), and beside them a terminal panel in Fira Code showing real dev-mode output verbatim: the `Player:`, `Trace:` and `Run:` lines, `Outcome: correct`, and `Rehearsal: 0 of 5 planned attempts recorded.` Replace the run id and token with obviously fake placeholders of the same shape. Soft accent glow behind the panel, as in the Vitest and Framer captures.
   - The ladder as a bordered four-cell grid. Each rung gets a small SVG mark. The usable rung keeps the example issue list and the sentence inside the cell, rendered like the terminal panel, before any mention of correct or incorrect.
   - The context file as a code block styled like the Vitest guide's blocks: Fira Code, hairline border, language label, copy button.
   - The three sections (what you write, what is derived, what you get back) as a three-cell bordered grid with a mark each.
   - The work-in-progress note and the standard line stay visible, smaller, near the end.
4. **Getting-started `/docs/getting-started`.** The Vitest guide layout: a left sidebar listing the five steps as anchor links, a content column with hairline rules between sections, an "on this page" rail at wide widths, a tip callout for the Node 22 requirement, copy buttons on every code block. Same nav and footer. New prose per the copy section.
5. **README.** Update `README.md` so its promise, ladder, sections, example, commands and note match the new copy word for word, and keep its "Contributing and automation" section at the end unchanged.
6. **Marks and art.**
   - Simple marks (the four rungs, the three sections, the copy icon, the glow) are SVG written by you, committed under `apps/web/public/marks/`, using `currentColor` so they follow the tokens.
   - If a richer illustration earns its place (at most one, for the hero backdrop), generate it once with a script `apps/web/scripts/generate-art.mjs` that calls OpenRouter: `recraft/recraft-v4.1-vector` for SVG, `openai/gpt-5.4-image-2` for raster. The script reads `OPENROUTER_API_KEY` from the environment, falls back to the `.env` file of the Archon workspace's `source` checkout (`<workspace>/source/.env`, three directories above the run worktree), skips files that already exist, writes the prompt beside each asset as `<name>.prompt.txt`, and never runs during `next build`. Commit the outputs under `apps/web/public/art/`. Budget: at most 12 Recraft and 2 GPT Image calls for the whole task. Never print or commit the key.
7. **Checks.** Add `tests/e2e/site.spec.ts`: a Playwright test that loads both pages at 1440 px and 375 px, asserts no horizontal overflow, runs axe with zero violations, and checks that during a rehearsal the taskbar is visible and its background equals the `--background` token. Capture both pages at both widths into `design/screens/` and commit them so the PR shows the result.

## Acceptance criteria

- `npm run validate` passes, including the new Playwright checks and the README mirror test with the new copy.
- The landing page's first screen names who it is for and what they get back, and the usable rung shows the issue list and the sentence before anything about correct or incorrect.
- No percentage, no "pass", no "compliant", no "certified", no exclamation mark anywhere on the site or in the README; at most three quotations, each linked.
- The work-in-progress note names what works today and what does not yet, in the terms listed above.
- Both pages render on the Vercel preview and on a phone-width viewport without horizontal scroll.
- The hero terminal panel contains the five real output lines named above, in Fira Code, and no real run id or token.
- Fira Sans and Fira Code are the only font families in the computed styles of both pages, loaded through `next/font`.
- Every mark under `apps/web/public/marks/` is SVG using `currentColor`; every generated asset under `apps/web/public/art/` has a `.prompt.txt` beside it; `apps/web/scripts/generate-art.mjs` exits without network access when the assets exist.
- `packages/ui-tests` has no diff; `apps/web/landing.ui.test.ts` has no diff; the taskbar in a rehearsal shows the new background and accent colours.
- No image on either page exceeds 300 KB; no external stylesheet or script is added.
- Lighthouse performance and accessibility in Chrome are at or above 90 for both pages on the production build; put the scores in the PR description.
- No ui-tests logo image anywhere; the wordmark is type.
- `design/screens/` holds the four captures of the finished pages.

## Out of scope

Light theme, blog or changelog pages, animation beyond hover and focus states, changes to the player, taskbar or trace, 3D renders, mentions of agent runs or the hosted track, and anything in `packages/ui-tests`.

## Environment

The Vercel project builds every pull request from `apps/web`. The design references are in `design/references/` on `main`. The OpenRouter key is never in the repository; see step 6 for where the script reads it.
