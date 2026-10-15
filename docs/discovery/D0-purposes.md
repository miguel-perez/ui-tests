# D0: purposes behind "can people actually use what I built?"

Discovery slice, run before R0's site copy is written. Method: [purpose-graphing](https://github.com/miguel-perez/purpose-graphing), Indi Young's Data Science that Listens, on first-person public accounts. Output: proto-personas and purposes in people's own words that replace the audience sentence and the landing task goal we specified ourselves.

## Question, in the author's words

"What goes through people's minds when they try to find out whether others can actually use what they built, and what gets in the way?"

## Accounts and where they come from

An account is a first-person narrative of something the person did or went through. A question about theory is not an account. Filter for "I" or "we" plus a built thing plus an attempt or a need.

| Source | Access | Terms | Expected yield | Status |
| --- | --- | --- | --- | --- |
| UX Stack Exchange, Stack Overflow, Software Engineering SE | public API `search/advanced` with `filter=withbody`, 300 requests a day without a key | CC BY-SA; keep author and link for attribution | probed 15 Oct: "no UX researcher usability" 71 on UX.SE, "unmoderated usability test" 9, "how many users usability test" 31 + 42; expect 30 to 50 usable accounts after filtering | ready |
| Hacker News | Algolia API, no key | public; attribution by link | 296 stories and 2,015 comments matching "usability testing"; Ask HN threads such as "How do you perform usability testing?" (2016) and "How do you do your usability testing?" (2009); expect 20 to 40 first-person comments | ready |
| Reviews of Maze, UserTesting, Lyssna, Useberry, Hotjar, Prolific on Trustpilot or G2 | Trustpilot's terms are reported to prohibit scraping and offer a business API; G2 similar | not cleared | richest "solutions today" pain, but only through an API or by hand | blocked until terms are read in full |
| Reddit r/UXResearch, r/webdev, r/SaaS | Data API; research and commercial use need Reddit's own program | restricted | skip; reading a few threads by hand for reconnaissance only, no rows | skip |

Public posts are reconnaissance, not participation. No quotes from review sites are published; Stack Exchange and HN fragments carry their attribution link in `rows.csv`.

## Procedure

1. Collect with two scripts under `docs/discovery/collect/` (a third, `judge.py`, scores candidates with the rows judge): one for Stack Exchange (queries above plus "usability test my app", "test with real users before launch", "small team user testing"), one for HN (Ask HN threads and comments matching "usability testing", "user testing", "unmoderated"). Each writes one `.txt` per account into `docs/discovery/accounts/`, first line a source URL, body the person's own words only, answers and replies by others dropped.
2. Rank with the rows judge instead of reading everything. purpose-graphing publishes its judges (CC BY 4.0, `judges/rows.json`); the one scored question, `in-mind-at-the-time`, asks whether a passage conveys the speaker's own thinking, feeling, or personal rule in a recounted situation. Send every candidate post or comment to Jev (`typesafe/jev-1.13` through OpenRouter, temperature 0, key in the ignored `.env`), take the expected rung scaled 0 to 1, and sort. Calibrate the cut on 20 hand-labelled candidates first; a threshold is a tool for ordering reading time, not a verdict. Hand-check from the top until 40 to 80 accounts are in; keep `scores.csv` and `rejected.csv` with reasons. Long threads are split into one candidate per comment so the score lands on a person's words, and an accepted comment keeps its thread link.
3. Prepare the accounts. The collectors write JSON candidate arrays, not account files. Hand-label the top 200 ranked candidates as clear, borderline or rejected, then write one text file per kept candidate under `accounts/`, named by source and id (`hn_<id>.txt`, `se_<site>_<id>.txt`), holding the passage as a single first-person turn with its title and link on the first line. This step was done by hand with the ranked list; no script for it is kept, and the labels and account files were purged (see the run log).
4. Run purpose-graphing as a whole study in `docs/discovery/study/` with the question above. Helpers take one account each.
5. Read `reports/` and `groups.csv`.

## Deliverables

- `docs/discovery/report.md`: the skill's report, answering the question with counterexamples.
- `docs/personas.md`: two to four proto-personas, each a purpose group in people's words with the circumstances that produce it, the solutions they tried, and what stopped them. Marked provisional per Lean UX until R1 participants confirm or refute them.
- Revisions to `pitch.md` (Who, Why, Solutions today, riskiest assumption) and to the R0 issue's landing copy and the landing study's audience and goal.

## Check-in

Miguel reads the report and decides whether "designer-developers who ship UI with CI and have no researcher" survives, is narrowed, or is replaced. No R0 issue is opened before that decision.

## Later use of the same skill

From R1, participants' free-text comments and give-up reasons are first-person accounts. The same skill can group them across runs, traced to words, as an optional analysis of the trace. It never produces the verdict.

## Run log

**15 October 2026, collection and scoring.** Collected 1,074 Stack Exchange questions (14 queries × UX, Stack Overflow, Software Engineering, Project Management) and 3,091 Hacker News stories and comments (8 queries). After the first-person and length filter, 3,418 candidates were scored with the rows judge through Jev at $0.186 total, no errors. Medians: in-mind 0.70, on-topic 0.20, combined 0.10; 615 candidates have combined ≥ 0.5 (249 Stack Exchange, 366 HN). The unvalidated on-topic question is permissive: it lets through some first-person posts about unrelated building, so hand-checking from the top of `ranked/ranked.md` is still required. Outputs: `candidates/scores.csv`, `ranked/ranked.md`, `ranked/calibration.md` (20 items, scores hidden) with `ranked/calibration-key.csv`.

**15 October 2026, study run.** Hand-checked the top 200 of the ranked list: 95 clear accounts, 29 borderline kept, 76 rejected (precision 0.70 at 50, 0.62 at 200; `candidates/labels-top200.csv`). 124 accounts (30,263 words) rewritten as single Person turns with attribution in `accounts-index.csv`. Whole study run with purpose-graphing: 41 helpers, 1,023 rows, 524 kind-1 rows, 523 summaries, one duplicate set aside; grouped by the parent into 27 level-1, 7 level-2 and 3 level-3 groups with every summary placed and three set aside with reasons. Outputs: `study/graph.db`, `report.md`, `groups.csv`, `summaries.csv`, `rows.csv`, and [`../personas.md`](../personas.md). Pitch Who and riskiest-assumption sections rewritten from them.

**15 October 2026, purge.** The raw material was deleted so that nothing in `docs/` republishes other people's posts or a third-party skill: `accounts/`, `accounts-index.csv`, `candidates/`, `rows.csv`, `summaries.csv`, `study/` (including `graph.db`), `skill/`, and the per-passage files under `ranked/` (`ranked.md`, `calibration.md`, `calibration-key.csv`, `top200-full.txt`, `all-summaries.txt`, `summaries-with-source.txt`, `summary-source.json`, `summary.txt`, `valence.csv`). What remains is derived: `report.md`, `groups.csv`, `ranked/opportunity-map.md`, `ranked/people-per-group.json`, `ranked/valence-by-group.json`, the memos, and the `collect/` scripts. Account ids such as `hn_2726997` resolve to `https://news.ycombinator.com/item?id=2726997`; `s123`-style summary ids no longer resolve. To regenerate, rerun the `collect/` scripts and the purpose-graphing skill as described under Procedure.
