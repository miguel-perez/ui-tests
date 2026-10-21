# Blind ideation from the D0 evidence (no proposal seen)

A fresh subagent given only `report.md`, `personas.md`, `tool-alignment.md`, `summaries.csv` and the raw accounts, 15 October 2026. Reproduced verbatim as the subagent's words.

## A. Ten ideas

1. **Cold Read** (G3, "I can't see it fresh"; no recruiting). Paste a URL and one sentence of what a visitor should understand; get a labelled machine read: what the page seems to be for, what it would click first, three things it is unsure of, a diff against the author's sentence. Stamped "machine read, not a person". Nobody does a five-second comprehension check on a live page. Risk: an agent's confusion may not predict a human's (Loop11's own data: agents 0–25% success vs humans 62–95%).
2. **Swap Test** (community mechanism). hn_1005674 shut a feedback community because "most people would only ask for feedback and never give it" (s63). Your link and task are held until you complete one recorded attempt at someone else's. Every tool buys participants; none trades them. Risk: forced reciprocity, and builders not matching each other's audiences (s229).
3. **Sign-up Tape** (persona 1; production). hn_5688018: "I would pay good money to watch a recorded clip of each user going through the 10 second signup" (s197). One snippet, name the success URL; one clip per invited person from invite to first success or abandonment, consent on the invite page. Risk: consent on the invite tanks sign-up; a founder wants the thirty stalls, not 1k clips.
4. **Proof Reel** (persona 3; "no data to show them", s444; "proof to the programmers", s486). Drop any three recordings and the task sentence; get one shareable page with timelines, stall markers, ten-second clips and one sentence per person. Nothing accepts bring-your-own video. Risk: stall detection on arbitrary video; a jaded team moving for n=3.
5. **Loop Gate** (persona 1; build loop). `npx loopgate --task "…" --url <preview>` in a PR or on Vercel deployment events; a PR check pending until five humans tried the preview; then pass and stall counts, clips, where each stopped. A `--dry-run` sends an agent first, labelled, and can never turn the check green. Sits on gap 1 and N5. Risk: humans may not fit a PR's timescale; may become nightly.
6. **Two of Five** (a format). s431, s439. Enter n, how many hit it, whether they recovered; get one sentence with its working, embeddable in a forum reply. Only MUiQ ships inference. Risk: feature, not product.
7. **Script Check** (persona 3). s508, s380. Paste task wording and the page; get each UI word flagged as leading, a too-open or too-specific reading, one rewrite, the rule behind each change. Nobody critiques wording against the actual page.
8. **Pretend Mode** (get the build somewhere safe). s18, s159. Point at a preview, pick a seed (fake account, card, data); get a hosted recorded browser already logged in that dies in 24 hours. Nobody seeds state. Risk: hosted-browser cost; seeded state not matching real use (s82).
9. **Pay Per Watch** (pricing). s413 to s415. Personal email, $5 wallet, no seat, hard per-run cap. The individual tier is eroding. Risk: one-time portfolio buyers.
10. **Clunker Profile** (browser feature). s48, s271, s301, s467. One toggle: slow CPU, 3G, 150% text, crowded extension bar, 1366×768, touchpad-only; a list of what overflowed or stalled. DevTools has the parts, no bundle, no large text, no report.

## B. Three things any product here will get wrong

1. Selling a panel participant as "a user" (s8, s9). Needs behavioural screening and automatic replacement.
2. Letting a pass read as proof (s117, s245). "5/5 completed" in green invites it; success needs its ceiling.
3. Handing back recordings and a percentage and leaving the meaning to the person (s346, s505). And assuming the test is pure when the designer is the moderator (s454, s455).

## C. Build first: Loop Gate

Because the team is persona 1 and can dogfood it on its own pull requests from week one; it sits on the largest gap; it composes Vercel deployment events, a Node CLI and Prolific's API; only the human run can turn the check green and the agent dry-run is a separately named command; Proof Reel and Two of Five fall out of its output as the artefact and the sentence. The riskiest assumption, humans on a PR timescale, is cheap to test on the team itself.
