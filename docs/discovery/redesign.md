# Redesign from D0: where the PRD, the archive and the corpus meet what people actually need

Written 15 October 2026 after the D0 study ([`report.md`](report.md), [`../personas.md`](../personas.md)). Each row names a need in people's words, what the current PRD does about it, what the 12 October archive or the designgenome corpus already holds, and the change. Emotional charge per purpose group is from a Jev pass over all 523 summaries (`ranked/valence-by-group.json`); the opportunity map at the end uses it.

## 1. Need by need

| Need, in their words | People | PRD today | Archive or corpus already has | Change |
| --- | --- | --- | --- | --- |
| "QA and unit tests tell me whether the code works but not whether the experience makes sense." Want the real-user check as a stage in the loop. (G14, G5) | 9 + 32 | Async run, GitHub check, JSON record. Verdict is task completion only. | Archive `quantitative-metrics.md` has an **Observed problems** metric: participant-by-problem matrix, exposure, coding provenance, recurrence, impact. Archive `analysis-stack.md` has incident extraction with analyst adapters. Corpus: Fan 2020 (automatic detection of problem encounters from verbalisation, recall limits), AMUSED 2025 (usability smells from logs), Krug (fix the most serious problems first). | **Biggest miss.** The product must surface usability problems, not only pass/fail. See §3. |
| "I can't see it fresh any more." Want outside eyes; find watching reveals what I could not see. (G3a, G5) | 21, 32 | Trace per attempt, SEQ, path deviation listed "not scored". | MUiQ briefing: click paths, lostness given a happy path, confidence+failure = disaster. | Make the trace a highlight reel: the moments where a person deviated, backtracked, paused, gave up, or rated low, with their words. The deviation list becomes the issue feed. |
| "How does one do so? What questions should I ask? How should I observe them?" (G9a, G3b) | 7, 26 | Scenario generated and linted; sample-size sentence; verdict sentence. | NN/g and MeasuringU task rules in briefings; Sauro sample-size model. | Covered. Add one thing: the lint explains *why* in one line, because these people want to learn, not only obey. |
| "I am a student. I am broke." Tools want a company email, a second seat, $500 a month. (G11) | 6, charge .33 | BYOK panels, per-run cap, open source. No sign-up at all for the runner. | Recruitment briefing: Prolific self-serve, $12/hour. | Zero-procurement as a design rule: personal email, no seats, free with your own link participants, pay only the panel. See §4. |
| Panel testers "rushed through everything"; free tester "not my target audience". (G10a, G4) | 7, 9 | Audience sentence to screener plus one behavioural question; speeder flags. | Archive `study-design.md` protocol checks: "anyone" rejected; behavioural eligibility. | Covered in principle. Add: the screener question is shown with the reason, and a "not my audience" exclusion is a one-click revision with the participant still paid. |
| Can't get the build to people: friends can't reach the dev server; UDID hassle; pretend transactions. (G10b) | 6 | Preview URL with SDK mounted in a Next.js app. | Archive `remote-testing-core.md` connection modes: companion page vs owned-site SDK vs extension. | Preview URL serves developers. For the lone UX person who cannot deploy anything, the install-once snippet on the live site is the answer. See §2. |
| "Would pay good money" to watch each user's sign-up; a GoPro as a poor man's eye tracker. (G9c) | 9 | Screen recording opt-in, raises incentive. | MUiQ: session recordings with think-aloud picture-in-picture. | Keep opt-in, but make the default trace rich enough that most people do not need video: event replay (rrweb-style) of the attempt, cheap and no consent escalation. Archive `dependencies.md` already picked rrweb lazily. |
| "Is this a usability issue?" "Was the sample too small?" "Real problem or novelty?" (G8, G16c) | 10, 12 | Verdict sentence from the occurrence input. | Sauro: five users find problems affecting one in three; Krug: fix the worst three. | Each issue carries: how many of n hit it, impact (blocked, slowed, confused), and a plain sentence: "2 of 5 could not find X; that is the share you said you care about." Novelty gets its own tag when the participant recovers within the attempt. |
| "No qualitative or quantitative data to show them." A PO on intuition, devs who tear into features, a teacher who is "the pro". (G13a, G13b) | 5 + 4, charge .38 | Trace viewer and report, local. | Archive: report sections "what decision was studied, what happened, whom it covers, what might change." | A shareable report page per run with the person's words, the issue list and the clips, that needs no login to read. Evidence for the room is a first-class output, not an export. |
| "A little lost" between building, promoting and testing; launched a week ago and afraid to promote. (G15, G1) | 8, 16 | CI trigger on label or main. | — | Make a run cheap enough to be routine: five link participants costs nothing, five panel participants about the price of a coffee. Say that on the site. |
| Agent logs "like speed-running hundreds of usability tests"; MCP builders cannot tell whether agents succeed. (G14 agent half) | 5 | Agent studies as a separate actor, pass^k, cli/mcp/http/web harnesses. | Archive `agent-dx.md` measures and separation rules. | Covered. The D0 accounts confirm the separation: nobody claims the agent is a person. |
| Expert review suffices; metrics on principle distrusted. (counterexamples) | 3 | — | — | Not designed for. Keep visible in the pitch's non-goals. |

## 2. The hosted model, rethought: install once, run from a hosted UI

D0 persona 3 cannot deploy a preview, mount an SDK, or get budget. What they can do is what they already do with Heap, Google Analytics or Hotjar: paste one snippet through a tag manager, then work in a hosted UI. That is the first concrete value of hosted, and it is a channel for a persona the open-source runner cannot reach.

| | Open-source runner (R0 to R3) | Hosted, install-once (new track) |
| --- | --- | --- |
| Who | Persona 1 and 2: developers with a repo and a preview URL | Persona 3 and non-developers: a designer, PM or founder with a live site and a tag manager |
| Install | SDK mounted in the app; CLI; config file | One snippet via tag manager or `<script>`; nothing in the repo |
| Where participants run | Preview deployment | The live site, with an intercept or an invite link, in companion mode |
| Where studies are defined | `*.ui.test.ts` | Hosted UI with the same four inputs: URL, goal, happy path, success check (URL reached, element present, or a question with distractors) |
| Where data lives | The author's own store adapter | Our collector and storage |
| Payment | BYOK panels, cap per run | Held panel accounts and a wallet, cap per run |
| Output | JSON record, trace, GitHub check | The same record and trace, plus the shareable report page |

The study format, the compiler, the lint, the verdict and the trace are shared. Only the install path and the host differ. The archive's "companion page" connection mode, which the PRD deferred, becomes required for this track, and its limits stay honest: on an arbitrary site the success check is URL, element, or question, not a server-side hook.

Story map consequence: hosted install-once is a parallel track, slices H1 and H2, whose first slice ships after R1, because it shares everything R1 builds and reaches the persona with the sharpest "I'm priced out" charge.

## 3. Surfacing usability problems, not only completion

The PRD's verdict is honest but blind: it says how many got through, not what stopped the rest. Thirty-two people describe the value of testing as *seeing the problem*. The product has to produce problems.

**Per attempt, from signals already in the trace:**

| Signal | Source | What it suggests |
| --- | --- | --- |
| Deviation from the happy path, backtrack to an earlier page | URL and semantic events | Lost, or the path is not where expected |
| Dead click, repeated click on the same target | events | Thought it was interactive, or nothing happened |
| Pause over a threshold with no input | events | Reading, searching, or stuck |
| Gave up, timed out | terminal reason | Blocked |
| Self-reported done but hook says incorrect | hook + claim | Wrong mental model, the "disaster" when confidence is also high |
| SEQ 3 or below, free-text comment | questions | The person's own account of the trouble |
| Screen recording segment, when opted in | recording | Evidence for the clip |

**Across attempts:** cluster signals by location (page, element, step) into issue candidates. An issue carries the participants who hit it (count of n, never a percentage at n = 5), the worst impact seen (blocked, slowed, confused), the participants' words, and trace links to each moment. Rank by impact then frequency, following Krug: the report names the three most serious problems per task and says so. Everything else stays in the list.

**Model assistance, bounded:** a model may propose labels and merge candidates, with Fan 2020 and Reca11 as the stated limits: detection recall is partial, so the automated list is labelled "candidates found from traces", a human can add or merge, and the verdict never depends on it. Agreement between a model and a reviewer is not ground truth (Measuring Annotator Agreement, Counting on Consensus).

**In the PRD:** `02-study-and-verdict.md` carries the Issues section with the signal table and the ranking rule, the trace's highlight reel, and "three most serious problems" per task; `05-integration.md`'s record carries `issues[]` so a factory or GEPA reads problems, not only a scalar.

## 4. Going unnoticed by higher-ups: zero-procurement as a rule

Nine people's obstacle was the organisation, not the method. The product should be usable by one person with a personal email and a credit card, or with no card at all:

- Personal email sign-up for hosted; no seats, no annual contract, no sales call.
- Free when participants come by your own link. Pay only the panel, per run, under a cap you set.
- Nothing to install in the repo for the hosted track; nothing to approve for the open-source track beyond `npm i -D`.
- The shareable report is the artefact that later wins the room, after the fact.
- For a factory, the JSON record and webhook are the integration; no dashboard login is ever required to consume a result.

## 5. Opportunity map, an ODI proxy

Outcome-Driven Innovation scores an outcome by importance and satisfaction on 0 to 10 and ranks by `importance + max(importance − satisfaction, 0)`. The proxy here: importance = 10 × (0.6 × min(people/50, 1) + 0.4 × charge/0.4), with people the distinct accounts carrying the purpose and charge the mean Jev emotional charge of those summaries; satisfaction = how well the best off-the-shelf tool serves the need for one person without procurement, from [`tool-alignment.md`](tool-alignment.md), on a 1 to 8 scale. These are lenses for where to lean, not measurements.

| Rank | Need | People of 124 | Charge | Importance | Satisfaction | Opportunity | Best off-the-shelf today |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | N2 Watch real people and be shown the problems I cannot see | 53 | 0.3 | 9.0 | 4 | **14.0** | Recordings everywhere; auto-detected frustration only on live traffic (Clarity, Contentsquare); no tool runs a task and diagnoses the failure. |
| 2 | N7 Decide what a finding means at n=5 | 21 | 0.28 | 5.3 | 2 | **8.7** | Only MUiQ ships inference, at $59,980 a year. Everyone else shows a percentage. |
| 3 | N1 A method in an afternoon, with no researcher | 30 | 0.25 | 6.1 | 7 | **6.1** | Lyssna and Useberry free tiers, Userbrain; templated tasks, same-day results. Strong on prototypes and public URLs. |
| 4 | N9 Run it without procurement | 11 | 0.35 | 4.8 | 7 | **4.8** | Most self-serve tools need no approval; enterprise tools do. |
| 5 | N3 Participants who match, without a sales call | 16 | 0.28 | 4.7 | 7 | **4.7** | Prolific, Lyssna panel, PlaybookUX self-serve. |
| 6 | N10 Prove an agent can use my CLI, MCP or API | 9 | 0.22 | 3.3 | 2 | **4.6** | Nothing purpose-built; OpenUser and Playwright agents drive browsers only. |
| 7 | N4 Afford it as one person, no mandatory seats | 11 | 0.3 | 4.3 | 6 | **4.3** | Free self-recruit tiers, Prolific DIY, Clarity; the paid individual tier is eroding (Maze Starter gone, Optimal free gone). |
| 8 | N5 A stage in the build loop, not a one-off session | 12 | 0.22 | 3.6 | 3 | **4.2** | Only functional agents plug into CI (TestSprite, Playwright agents). Human-panel tools have read-only MCPs or no API; Prolific's API makes you host everything. |
| 9 | N8 Evidence for a room that does not care | 10 | 0.29 | 4.1 | 7 | **4.1** | Highlight reels, clips, auto reports are common (UserTesting, Userbrain, Lyssna, Maze). |
| 10 | N6 Get the build in front of people: preview URL or install once | 15 | 0.22 | 4.0 | 5 | **4.0** | Snippet-once exists for analytics (Clarity, Contentsquare); task tools accept public URLs; nobody documents protected previews for humans. |

### Reading the map

- **The gap is real, and it is narrower than "fully automated".** The two outcomes with the most daylight are N2, be shown the problem not just the completion rate, and N7, know what a finding means at five people. Every self-serve tool verifies a task by URL or path and hands back a percentage and a recording to watch. Nothing diagnoses the failure, and only a $59,980 product does inference. Those two are exactly what the PRD now adds: ranked issues from trace signals, and a verdict sentence derived from occurrence and confidence.
- **"Plugs into a factory" is underserved (N5, satisfaction 3) but carries less charge** than being shown the problem. Only functional agents live in CI today; no human-panel tool does. This is the moat for persona 1, and it is a feature nobody is competing on, which also means few people are asking for it in those words. The accounts ask for the outcome, "know whether the experience makes sense," not for CI.
- **"Unnoticed by higher-ups" is table stakes, not the gap.** N9 scores high on importance for the people who hit it, but satisfaction is already high: Clarity, Lyssna, Useberry, Userbrain, Prolific all need no approval. The product must match that, and the eroding individual tier is the reason it still matters, but it will not differentiate on its own.
- **N10, the agent capability test, is unserved by anyone** and is where the agent actor earns its separate existence. It is a small market with low charge in the accounts, which fits keeping it as R2 rather than the headline.
- **Being shown the problem has the strongest feeling behind it.** The most charged summaries in the study are about seeing what watching revealed or failing to: "extremely confused and stare at the page for minutes" (hn_942344), "it really sucks to get an email saying a user can't register" (hn_5688018), "so disappointed by the result of following aria-live recommendations" (se_ux_118374), "burnt building unnecessary stuff before" (hn_36227470). The groups with the highest mean charge are the organisational fight (G13a, 0.38), making sense of a finding (G8, 0.37), being priced out (G11, 0.33), and watching itself (G5, 0.33). The pitch's feeling is "see what stopped them", not "pass the check".

### What changes in the product because of this

1. Issues and the verdict sentence move from nice-to-have to the headline. The landing page leads with the problem list and the sentence, and shows the pass/fail second.
2. The hosted install-once track is a channel for persona 3, not a differentiator; Clarity and Contentsquare already own "snippet once". What ours adds is tasks and the verdict on top of the snippet. It ships after R1 and shares everything.
3. CI stays the moat for persona 1 and is described in the outcome's words: "know before merge whether people can get through."
4. Pricing matches the self-serve floor: free with your own participants, a per-run cap with a panel, no seats, personal email.
