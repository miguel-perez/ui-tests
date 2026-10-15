# Proto-personas

Derived from the purpose groups in [`discovery/report.md`](discovery/report.md), a study of 124 public first-person accounts. Each persona is a bundle of purposes several accounts share, in those people's own words where possible, with the circumstances that produce it. Provisional per Lean UX; the screener places each participant against them, so every run with strangers tests the personas as well as the product. Counts are distinct accounts among 124.

## 1. The developer who tests code, not experience

**Who.** Solo or small-team developers with unit and end-to-end tests and no researcher. Twelve accounts, including hn_2726997, hn_46913402, hn_42157991, hn_5688018, hn_49157807, hn_4302433, hn_47437591, hn_46409307. Few of them mention CI; that is our delivery mechanism, not their trait.

**Purposes.**
- "QA and unit tests tell me whether the code works but not whether the experience makes sense" (s123). Want the real-user check as a stage in their loop (s149).
- "Being a developer, though, I'd like to test this. How does one do so?" (s5). Want a method, not a coffee-shop anecdote.
- Would "pay good money" to watch a recording of each user's sign-up (s197). Want to see, not be told.

**Counter-evidence to hold visible.** Three of these accounts built or wanted AI-persona testers because real users were unavailable (s124, s151). This product declines synthetic users as stand-ins for people, by design, because the only published comparison shows agents succeeding 0 to 25% of the time where humans succeed 62 to 95% (Loop11). The agent actor serves a different need: proving an agent can use a CLI, MCP server or API.

**What gets in the way.** No participants who match; no idea what to ask or how to observe; tools that need a company email; QA that passes while a real user leaves.

**Design consequence.** The context file, dev mode, the runner-executed outcome, the ranked issues, the CI check and the clause evidence in the record are for this person.

## 2. The builder who launched to find out

**Who.** Founders and indie makers who ship early because launching is the only test they can run. Thirteen accounts, including hn_3885019, hn_36227470, hn_41187753, hn_1845594, hn_1538987, hn_831533, hn_8231452, hn_38533620, hn_22628988, hn_2654053.

**Purposes.**
- "It was time to validate the idea and check if anyone would actually use such a system" (s73).
- Discount friends' excitement and surveys; only "real customers buying" counts (s12, s13).
- Having been "burnt building unnecessary stuff before", validate first next time (s92).
- Feel "a little lost" between acquiring users and fixing what testing revealed (s239, s242).

**What gets in the way.** Cannot get the right alpha users without launching; cannot promote something too incomplete, yet gets no feedback without promotion; low traffic makes numbers meaningless, and one usability-test subject saying "no idea what your product is about" is the first real signal (s337).

**Design consequence.** Their question is desirability and recognition, not goal completion. The fit questions answer "do these people have the purpose", the impression stage answers "do visitors recognise it", the issues answer "where did they get stuck", and intercept recruiting on the hosted track lets the struggling visitors of a launched product tell them. An outcome hook alone does not serve this person, and the docs do not claim it does.

## 3. The lone UX person without a researcher, budget, or backing

**Who.** Designers, students and consultants who know testing matters and carry it alone. Sixteen accounts, including se_ux_145133, se_ux_81741, se_ux_141621, se_ux_131516, se_ux_148225, se_ux_122318, se_ux_95050, se_ux_20222, se_ux_83313, se_ux_149719, se_stackoverflow_424589, se_ux_129811, se_ux_5226, se_ux_87364, se_ux_104568, se_ux_17974. The largest bundle, and most of the "run a sound test without a researcher" group.

**Purposes.**
- Work "from reliable data rather than the PO's intuition" (s2); base decisions on "actual behavior" not attitudes (s462).
- Get a fair test: fear a too-specific goal leads the user and a too-open one yields incomparable results (s508); fear users will say what pleases the designer (s493).
- Decide what a finding means before acting: real problem, novelty, small sample (s431, s435).
- Prove it to people who do not care: "no qualitative or quantitative data to show them" (s444).

**What gets in the way.** Tools priced for companies ("I am a student. I am broke.", s413 to s417); no time; nobody interested; a PO, teacher or dev team that overrides them; a client who booked the wrong method; no repo to mount an SDK in and no preview to deploy.

**Design consequence.** This person cannot install a runner, fund a panel or write a hook. They are reached by the hosted install-once track: one snippet through a tag manager, the same inputs in a hosted UI, a success check by URL, element or question, and a shareable report page that is their evidence for the room. Derived defaults are the researcher they do not have.

## Not a persona

People who distrust instrumentation or metrics on principle (hn_6072635, hn_17339903), and consultants for whom expert review already suffices (se_ux_132241). Counterexamples to keep visible, not a segment to design for.
