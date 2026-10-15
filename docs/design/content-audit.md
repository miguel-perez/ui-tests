# Content audit: SDK sites and usability platforms, and what ui-tests takes from each

16 October 2026. Input to the second design pass (D2). Sixteen marketing sites were reduced to their content schema: what kinds of content appear, in what order, with what artefacts. Layouts and copy were not recorded; a few phrases under fifteen words are quoted for identification. The audit was done by two research subagents reading each home page and its getting-started entry; per-site records are in the appendix.

Sites. SDK and developer tooling: Vitest, Playwright, Sentry, PostHog, Storybook, Checkly, Cypress, Resend. Usability and research platforms: Maze, Optimal Workshop, UserTesting, Lookback, Useberry, Lyssna, Hotjar (now a Contentsquare page), Userlytics.

## 1. The SDK schema

Typical order, shared by six of eight:

1. Announcement ribbon (a launch or a conference; agent and MCP features are this cycle's filler).
2. Hero: one claim about outcome or positioning, a scope line (languages, browsers, products), a primary CTA (docs for open source, sign-up or install for SaaS), a secondary CTA (GitHub stars or a demo), one hero artefact (terminal screenshot, product mock, chat transcript, animation).
3. Install one-liner in or under the hero.
4. Trust strip: customer logos, often with a count.
5. Three to five feature pillars, each a heading, two sentences, one artefact, a docs link.
6. Workflow tour in tabs or stages: the de facto "how it works".
7. Ecosystem wall: integrations, frameworks, CI providers.
8. Social proof: named quotes with title and company, stat tiles (stars, downloads), case-study numbers.
9. Getting-started detail: platform picker or onboarding timeline.
10. Final CTA repeating the hero action, usually with the install command again.

Recurring artefacts: the install one-liner, product screenshots with plausible data, terminal mockups, logo walls, named quotes, stat tiles, short looping motion, and, new this year, agent chat transcripts. Syntax-highlighted code appears on five of eight but is usually only the install or init snippet.

What separates the strongest from the weakest is one thing: **input and output shown together.** Resend puts the API call beside its HTTP 200 response and the React email source beside the rendered email. Checkly puts the check file beside its CLI run. Cypress puts a failing assertion beside the fix and the passing run. The weakest, Playwright and Vitest, are prose feature lists; Vitest has no code on its home page at all, and both delegate the showing to the docs. Even the docs entry pages share the gap: none of the four checked pairs an example file with its result above the fold.

Consistent omissions: pricing (PostHog excepted), benchmarks even where speed is the claim, comparisons, failure states (Cypress and Checkly are the only ones showing a red run), limitations.

## 2. The usability-platform schema

Typical order, shared by six of eight:

1. Hero: one claim about speed, confidence or consolidation; two CTAs, free or self-serve plus demo.
2. Trust line and logo wall with a headline number (users, Fortune 100, panel size).
3. "How it works" in three beats: create or ask, recruit or learn, results or act, with time claims (minutes, hours not weeks).
4. Method or capability catalogue: cards, tabs or alternating screenshot and text.
5. Participant panel pitch with a size (690k, 2M, 6M, 7M) and vetting claims.
6. AI and analysis block, now almost always with MCP or bring-your-own model.
7. Persona or use-case tabs: designers, PMs, marketers, researchers, CX.
8. Testimonials with photo, role, logo and an outcome percentage.
9. Case-study or KPI tiles with business numbers.
10. Security and compliance grid (SOC 2, GDPR, SSO; ISO only at Userlytics).
11. Analyst and G2 badges.
12. Final CTA repeating the hero, newsletter, footer.

Recurring artefacts: logo marquees, stat counters, product screenshots with empty alt text, quotes that carry a number, compliance badges, autoplay product loops (Lookback), GIF process diagrams (Maze), click-to-play story videos (UserTesting). An example task appears only in template galleries, as a card title.

The strongest show the product running (Lookback's three autoplay loops), pair a concrete three-step process with screenshots and stack quantified proof (UserTesting), state time and panel numbers inside the steps and name audiences in the trust line (Lyssna), or show real result screens (Contentsquare heatmaps, replays, funnels). The weakest rely on stock photos or alt-less screenshots, defer everything to a demo, and describe metrics only in prose.

Consistent omissions, and these are the opening for ui-tests: **no site shows a study's setup and its result together.** None shows a raw trace, one participant's path, or a misclick with its cause. No example result carries realistic numbers; task success, time on task and misclicks are named but never instantiated. Sample size is discussed nowhere except a "rule of 5" FAQ at Userlytics; nobody says what five participants can and cannot tell you. Participant quality is asserted, not evidenced. Developers are never a persona; "no researcher" is handled with persona tabs or a "democratize" quote, never a guided path for someone who has never run a test. AI blocks promise summaries and never show a summary beside the sessions it came from.

## 3. The marriage

ui-tests is a developer tool whose output is a usability study. The site borrows the SDK schema's spine, because the reader is a developer and that is the shape they trust, and fills it with the usability platforms' missing artefacts: the study setup beside its result, the trace, the sentence about n. What neither genre does, ui-tests does as its centrepiece.

| Keep from SDK sites | Keep from usability platforms | Do what neither does |
| --- | --- | --- |
| Code near the top, highlighted, real | A three-beat how-it-works with the time it takes | Show what you write beside what you get back, as one continuous artefact |
| Install one-liner, docs as the CTA | Show the product running, not a diagram of it | Show one participant's trace with an issue moment and its cause |
| Terminal output with real shapes | Name the audience in the first screen | Say what five people can and cannot tell you, in the result itself |
| A red run shown, not hidden | Persona-specific entry (ours is one persona, so the whole page is it) | Address the developer with no researcher as the person, not a tab |
| Honest limits in place of a limitations section nobody has | | Research as proof instead of logos: 124 accounts, 32 moments, quoted |

Drop from both: logo walls, stat tiles, testimonials and case-study numbers (none exist and the PRD forbids inventing them), compliance grids, persona tabs, method catalogues, announcement ribbons, AI blocks, the panel pitch (R3), pricing tables (nothing is sold yet).

The "layers" framing (functional, usable, desirable, pleasurable) is the report's reading order in the PRD, not a story a visitor needs. It survives as one sentence ("your tests prove it works; this proves people can use it") and as the structure of the docs page on reading a report. The four-cell grid goes.

## 4. The proposed content schema for the landing page

Inverted pyramid: each block answers the next question a developer asks, and each is grounded in a need from the opportunity map (N numbers) or the PRD. Every example artefact is generated from the real product's shapes (compiled context, scenario card, taskbar, trace with issue kinds, outcome line, sentence) and is labelled as an example.

| # | Block | Question it answers | Content | Artefact | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | The claim | What is this and is it for me | One line: usability testing that runs like your tests. One line for whom: developers who ship UI and have no researcher. Get started, GitHub. | The contract in motion: the test file on one side; on the other, in sequence, the scenario a person reads, their attempt, the trace filling with issue moments, the sentence. Animated, replayable, reduced-motion safe. | Pitch one-liner; persona 1; N2 |
| 2 | What you write | How much do I have to learn | The context: users, purpose, a goal, an outcome hook, a happy path if you have one. "A developer who has written a Playwright test already knows the answer." Everything else is derived and shown. | The real landing test file, highlighted, with margin notes on each field. | PRD 01 inputs table |
| 3 | What it turns into | What does the person see | The derived scenario card (never the happy path), the fit questions, the impression stage, the taskbar with done and can't. Derived defaults are the researcher you don't have. | Player screens as real UI, side by side with the field each came from. | PRD 01 derived table; PRD 02 flow; N1 |
| 4 | What you get back | What do I actually learn | A trace: the path, the moments, the issue signals (dead click, deviation, pause, gave up, low ease) with the cause, in the person's words where there are words. Then the issues ranked across people. | A generated five-person example: a trace timeline for one person and the ranked issue list for five, realistic, labelled example. | PRD 02 measures and issues; verify.ts signal kinds; N2 |
| 5 | What the numbers may say | Can I trust five people | The sentence. Five people give an 87% chance of seeing any problem that hits one in three. Problems found or none found at this n; never pass, never a percentage. | The sentence as rendered in the CLI and the report, beside the n derivation. | PRD 02 sample size; N7 (satisfaction 2 of 10 across the market) |
| 6 | Where it runs | Does it fit my loop | On yourself in dev mode today. By link with five people from your audience, and as a check on the pull request, next. Honest status: what runs now, what is planned, in those words. | CLI output as it is; a mock of the planned check, marked planned. | PRD 01 CLI and CI; N5; story map R0 to R1 |
| 7 | Install | How long until I see something | Three commands, Node 22 and Next.js App Router, one afternoon to a first result. | Shell block with copy. | PRD goal 1 |
| 8 | Why we built it | Is this grounded | Three or four quotes from the 124 accounts, attributed by link, and the counts: 85 wanted outside eyes, 32 described the moment, 26 posted instead. The ISO line. | Pull quotes; the research link. | Discovery report; the non-bending rules |
| 9 | Terms | What does it cost, who owns what | Open source. Nothing to sign up for. Free with your own participants; a panel costs what the panel costs, under a cap you set. No seats. | Plain text. | N4, N9; PRD goal 7 |

The getting-started page keeps its five steps but each step pairs the thing you type with the thing you see, which is the gap every audited docs page has.

## 5. Decisions this audit asks for

1. The spine above, or a different order. The audit argues for the contract first and research last; the previous page did roughly the reverse.
2. The layers: one sentence and the docs, not a section.
3. Generated examples: a five-person example run is invented and labelled. The alternative is to show only the author's own rehearsal, which is real but thin (0 of 5).
4. Brand: a logomark, explored before the layout. The previous brief banned one.
5. Motion: the hero contract plays. The previous brief banned motion.

## Appendix A: SDK per-site records

Vitest. Hero with claim about speed and DX, Get Started to the guide, GitHub; a static terminal screenshot as the hero visual; a "why" paragraph; a four-cell feature grid with two canvas animations; sponsor tiers. No code, no install command, no input and output pairing on the home page. Proof is sponsor logos only.

Playwright. Hero on reliability and breadth; three path cards (Test, CLI, MCP) with install one-liners in plain code; prose feature lists; browser logos; a live star count; customer logos. No code example, no output, no motion, no how-it-works.

Sentry. Announcement ribbon; hero with a Rive animation and a sign-up CTA; a 22-logo wall; a developer-first carousel; a three-tab product tour; an AI tour; three named quotes; a 23-platform install picker with highlighted install and init snippets; compliance prose; newsletter; final CTA. Input (init code) and output (product screenshots) are in separate sections.

PostHog. Hero with a wizard one-liner and a trust line (teams count, percentage paying nothing); a three-tab animated demo (a natural-language question and its answer, labelled sample data; an agent context diagram; an inbox of reports); an 18-product list; a logo wall; a usage-based pricing table with real prices; a why section; reading links; a parody CTA box. The only site showing prices; input and output are paired, but as question and answer, not code and result.

Storybook. Hero with install one-liner and a live star count; a stats row; use-case tabs; an interactive product mockup (controls to rendered state); customer logos; five pillars each with motion, sub-features and a quote; a community section with many counts. No story file shown, no terminal output.

Checkly. Hero with an install one-liner and a named audience (developers and agents); a hero mockup pairing a TypeScript check file with its CLI output; customer logos; feature blocks (chat mock, code-first snippet, region map); a dashboard with realistic counts including failures; one named testimonial; a problem and solution section with stat tiles; a workflow in tabs with screenshot and snippet per card; an agents section with CLI, constructs, REST and skills; integrations; a four-step onboarding timeline; closing CTA with the install command. The clearest input-and-output pairing in the set.

Cypress. Hero with a four-tab switcher (Create, Run, Debug, Improve) and an install CTA; customer logos; per-stage sections with a GitHub Actions snippet, a parallelisation diagram, a terminal mock that pairs a failing assertion with the fix and the passing run, an animated replay, coverage and accessibility screenshots; a social proof block with stars, downloads, dependents and 15 developer posts; three case-study cards with numbers. One of two sites showing a red run.

Resend. Hero with a 3D clip; a trust line; an integrate section with SDK and framework tabs and a highlighted send snippet; an interactive demo pairing the call with its 200 response and an event stream; an editor section; React email source beside the rendered email; deliverability features in text; many named quotes; final CTA. The clearest code-beside-result pairing in the set.

## Appendix B: usability-platform per-site records

Maze. Scroll-driven hero swapping two claims; a three-step Recruit, Research, Decide; a 24-logo wall; a five-stage learning-loop in tabs with GIFs; a security grid; a testimonial carousel with outcome numbers; a report promo; three case-study tiles; final CTA. The usability use-case page has four screenshot blocks with empty alt text. No task beside a result, no example metrics, no sample-size discussion.

Optimal Workshop (usability-testing page). Hero on mixed methods with try and demo CTAs; a big-brand logo marquee; four feature blocks with screenshots; an FAQ; related products; a CTA. Metrics named in prose only; no example numbers; no motion; assumes a research reader.

UserTesting. Hero on confidence in the AI era with a click-to-play video and a demo CTA; a Fortune 100 logo row; a three-step Ask, Learn, Act with screenshots; a pull quote; a participant network block with four stats; a platform list; an MCP block; persona tabs for six roles; KPI tiles; customer story videos; an AI block; analyst and award grid; compliance badges. The heaviest proof stack; no study setup beside its result.

Lookback. Hero on speed and depth with demo and free-session CTAs; three pillars with stat counters; a compliance strip placed third; three autoplay product videos (moderated, unmoderated with AI follow-ups, insight search); value tiles; outcome cards; testimonials; demo CTA. The product is shown running; no task definition beside a metric.

Useberry (text-only read). Hero; logo strip; four value statements; nine method cards; interviews; integrations; recruitment; four result-feature cards; templates; a who-is-it-for list; five customer stories with percentages; final CTA. No panel size, no compliance, no named people.

Lyssna. Hero with a free sign-up and no card; a user-count trust line with logos; a three-step how-it-works with time and panel numbers inside the steps; eight use-case tabs; logos; testimonials with numbers; four persona tabs; a template gallery; a security block; G2 badges. The product page is a content hub with no result screenshots.

Hotjar (Contentsquare migration page). Hero on continuity and free scale; a sites-count trust line; a comparison table; eight capability accordions with real result screenshots (heatmaps, replays, errors, funnels, surveys, AI); an AI block with MCP; FAQ; final CTA. Results shown without any task, because there are no tasks.

Userlytics. Hero on human plus AI with a YouTube video and a demo CTA; a logo carousel with five stat counters; a benchmarking score block; industry fit; roadmap bullets; testimonials; a security block with ISO 27001; a closing line. Stock photos on the home page; the product page has a "rule of 5" FAQ, the only sample-size mention in the set.
