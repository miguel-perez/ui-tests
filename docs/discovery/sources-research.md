# Where the people come from: what the documents and the corpus say

16 October 2026. Research for the landing section that explains the three sources (your link, a paid panel, your visitors), which the author found thin and inconsistent with the rest of the site. Part 1 is what our own documents state and where they disagree; part 2 is what the design corpus says each source is good for; part 3 is the content schema for the expanded section. A second document, [`sources-desk-research.md`](sources-desk-research.md), covers panels, competitors, intercepts and links from outside sources.

## 1. What our documents say

### Facts per source

| Field | Your link (`link`) | A paid panel (`prolific`, `connect`) | Your visitors (`intercept`) |
|---|---|---|---|
| Who | Anyone the author sends it to (landing-content-v3 block 4) | Strangers matched by the `screen` block, or by a draft inferred from `users` and marked inferred (01-dx-contract; 03-participants "Quality and audience") | Visitors on the live site who struggled and then said yes (03-participants "Intercept") |
| How reached | The run prints a link. Its real format is `<target>/ui-tests/<run>?invite=<secret>`; with `VERCEL_AUTOMATION_BYPASS_SECRET` set the Vercel bypass is appended. Never printed in CI (R1-02 §2) | Prolific API on the author's token, Connect API on the author's key; a bandit spreads invitations across panels under the cap (03 "Sources", "Router"); on the hosted track the panels run on our accounts (05-integration) | The hosted snippet (`<script src="https://ui-tests.com/s.js" data-site=…>`); hosted only |
| Author does | Shares the link; may set any incentive, including none, and the consent then reads "This study is unpaid." (03; R1-02 §3) | Puts the token in env and `budget.max` in config (01 "Config") | Installs the snippet, declares a happy path per route, marks sensitive pages (intercept-recruiting §3) |
| Person sees first | Screener questions, then consent (R1-02: join, then consent) | The study listing on the panel, then custom screening, then consent (screener-research part 2) | "Having trouble with this? Help us fix it, five minutes, we pay." in the site's own name and style (03) |
| Filters | None; `where`, `language`, `age` recorded with `applied: false` (R1-06) | Prolific: filters plus paid screen-out slots, minimum $0.14 each. Connect: profiled fields only; anything else needs a paid prescreen project | Fires on the second struggle signal; never on sensitive, checkout, payment or form-in-progress pages; not again that session after a decline; mouse detectors do not run on touch |
| Consent | Standard; the pay sentence may read "unpaid" | Standard; rejecting someone for a prescreen mismatch is prohibited on Prolific | Says why they were invited; nothing from before acceptance is kept (intercept-recruiting §4) |
| Cost | Free, or what the author chooses | Formula floor $7.50 for a five-minute task, about $10.71 after Prolific's fee, about $54 for five, about $68 with the 25% reserve (03 "Worked default") | The formula applies; only `link` is exempt; paid from our wallet under a cap per run (05) |
| Cap | n/a | Hard cap per run including the 25% reserve; example `max: 80`; a run that cannot fit n under the cap does not start | "Cap per day" (intercept-recruiting §1) and "cap per run" (05); settled as per day, see §3 |
| Time | Join closes at the deadline (48 h default) or at 4 × planned joins (R1-02 §3) | 48 hours is the **default deadline** (01 "Derived"), not a measured fill time; raise rule at half the deadline | No number; depends on traffic |
| Quality | Attention item, speeder flag, device and IP hash, screener (03 "Quality") | Same; platform rejection only when a failed attention item and a speeder flag coincide | Labelled by source; kept out of `catch`/`estimate` counts unless the author opts in |
| Source label | `link` | `prolific` / `connect`; the UI word is "paid panel" | `intercept` |
| Ships | R1 (R1-02) | R3 (story-map) | H2, after H1, after R3 (story-map) |

Schema today: `SourceOption = name, who, cost, timing, mini UI` (site-schema); `copy.ts` holds four-tuples; `options-row.tsx` maps the icons link, users, cursor. The attempt footer carries "Person n of N · source · what they use today".

### Contradictions and gaps

1. **The $60 cap cannot hold $54.** The cap includes the 25% reserve, so five people need about $67. Getting-started step 5, `terminal-run.html`, `cap-control.html` and `cap-control.tsx` all show $60; under the PRD's rule that run would refuse to start. The config example uses $80.
2. **"$54" leaves things out:** the short-study floor, Prolific only, five minutes, and neither Prolific's screen-out slots nor Connect's prescreen project, both of which the PRD puts on the budget.
3. **"Within 48 hours" is a deadline, not a measured fill time.** No document measures panel fill time; 05 calls it "a 48-hour panel run", a default repeated as a promise.
4. **"Free" for visitors is false by the PRD.** Intercept participants are paid at the formula rate ("we pay"); only `link` may be unpaid. Block 6 repeats the error.
5. **The visitor invitation exists in three versions:** the PRD's "Having trouble with this?… five minutes, we pay"; `visitor-invitation.html`'s "Mind helping us for two minutes? A short task on this page, paid." (no reason given, which §4 requires); the component's "Looks like this is not going smoothly… Two minutes, and we pay".
6. **"Visibly struggling" is vaguer than the PRD.** The trigger is a second signal from six detectors with exclusions; "the moment" overstates what the detectors can tell (Hibbeln: 81.7% in the lab, R² 0.17 in the field).
7. **The invite link URL differs:** artefacts show `https://ui-tests.com/t/k2m9`; R1-02 says `<target>/ui-tests/<run>?invite=<secret>`, hosted on the author's own app on the runner track.
8. **Localhost is unclear.** The default target is localhost; a link to it reaches nobody outside the machine unless `--tunnel` is used, which 05 restricts to link runs. Step 5 shows plain `npx ui-tests run` with no tunnel and no preview.
9. **Protected previews are half-covered.** Only Vercel protection is handled, through the bypass secret in the link; Netlify passwords, basic auth and Cloudflare Access are not. The secret travels in a URL handed to strangers; the docs do not say whether it enters the Prolific study URL.
10. **Screening is described as matching.** "Matched to the `users` line" is really the `screen` block or an inferred draft; the criteria are self-reported and "known-gameable".
11. **The name differs:** v3 says "A panel"; copy, hosted form and schema say "A paid panel".
12. **Mini UI labels and themes are inconsistent.** The artefacts say "Your link" and "Cap"; the components "Invite link" and "Spending cap". `cap-control` shows "panel live" as if a run were in progress; a cap input exists only on the hosted form; the site-schema light-theme rule is the round-three misread.
13. **Ship order is not disclosed.** All three sources read as present tense; panels come in R3 and intercept in H2. Block 6's caption claims the intercept is running on our own site.
14. **Connect is never named, and nothing names the standing exclusion** (UX, design, marketing, market research), which does not apply to `link`.

## 2. The design corpus

| Source | Rule | Implication |
|---|---|---|
| Krug, *Rocket Surgery*, ch. 5 "Recruit loosely and grade on a curve" (`P4_Krug_Rocket_Surgery.txt` l.1847–1867) | "Many of the most serious usability problems… are problems that almost anybody will encounter." "Try to find users who reflect your audience, but don't get hung up about it… Would our users have that problem?" | **Link**: friends do find the layout and navigation problems; read every problem with "would my users hit this?" |
| Krug ch. 5 (l.1965–1985) | "If you need 'just anyone,' consider friends, family, and neighbors." People in your organisation "know too much… can't use people who work on what you're testing" | **Link**: friends are fine, coworkers are not |
| Krug ch. 5 (l.1963, 2027) | "put a link on your Home page or create a pop-up invitation that appears when they enter or leave" | **Visitors**: the invitation is an established move |
| Krug ch. 5 (l.2073) | "Some people will stretch the truth to make a few dollars." | **Panel**: screeners can be lied to |
| Krug ch. 14, unmoderated remote (l.5116–5170) | Panel testers "have been screened to ensure that they're good at thinking aloud, and they tend to put a fair amount of effort"; "you can't ask questions and you can't probe." | **Panel**: practised, willing, and nobody can ask them why |
| Nielsen, *Prioritizing Web Usability* (l.1645–1660) | "We screened out anybody working in technology, marketing, Web design, or usability… People who work in the biz know too much… invalid as usage data." | **Link**: a developer's network is mostly people Nielsen screens out; our standing exclusion omits "technology" |
| Sauro & Lewis, *Quantifying the UX*, ch. 2 (l.1322–1391) | "Sample size and representativeness are actually different concepts." "Representativeness is more important than randomness." Participants self-select | **All**: fit matters more than headcount; report fit, not just n |
| Cooper, *About Face*, ch. 2 (l.3666–3673; l.7572) | A research firm is "useful for reaching consumers with diverse demographics"; friends and relatives are "quite limiting as far as diversity" | **Link** narrow, **panel** broad |
| Hanington & Martin, *Universal Methods* #88 (l.16867–16910), #69 (l.13418) | "Live recruiting intercepts potential participants at the moment that they set out to complete a self-directed task… within their native environment." Yield: 1.5–2% of visitors who see the screener complete it, about 65% of those can participate; worth it at "10,000 unique visitors per day" | **Visitors**: real tasks on real devices; fill depends on traffic: on their funnel 1.5–2% complete the screener, about 65% of those can take part, and only a little over half consent, so roughly 1 in 80 to 1 in 100 exposed visitors becomes a participant, fewer again when only strugglers are invited |
| Hanington #05 (l.1506–1512) | Automated remote research "should not be used as a replacement" for methods that explain why | **Visitors**: a struggle signal is not a finding until the person shows why |
| Alvarez, *Lean Customer Development* pp. 36, 42, 46 (atom `lcd-method-recruiting-and-scheduling`) | Friends should "remain the intermediary… vouching for you"; "Don't approach until after those tasks are complete"; "Offering paid compensation only lures the desperate and unemployed" | **Link**: ask friends to forward it. **Visitors**: never on checkout. **Panel**: pay draws its own population |
| ISO 9241-210:2019 §5.3, §5.4, §7.5.4 (atoms) | Participants "should have capabilities, characteristics and experience that reflect the range of users"; users "should carry out tasks… rather than just be shown demonstrations" | **All**: no single source covers the range; visitors cover only the strugglers |
| Gothelf, *Lean UX* pp. 76–77 (atom `lux-method-continuous-discovery`) | "Three users every Thursday" | **Link**: a free source makes frequent small rounds possible |

**What each source can and cannot tell you.**

- **Link.** Good for fast, free rounds that catch what almost anybody hits. Cannot tell you whether real users would hit domain or jargon problems. Caveat: friends are kind and technical friends know too much; grade on a curve.
- **Panel.** Good for strangers who match a stated behaviour, on demand, without a network. Cannot tell you why beyond what they say afterwards, and their screener answers cannot be verified. Caveat: practised test-takers who answer screeners for money; fluency above typical.
- **Visitors.** Good for real users on their own devices, partway through a task they chose. Cannot tell you how common the problem is; every visitor is self-selected and struggling. Caveat: it fills only with traffic.

## 3. Proposed content schema

`SourceOption { name; what; who; steps[3]; firstScreen; cost; time; goodFor; caveat; mini; availability }`. The page states facts, not citations.

| Field | Your link | A paid panel | Your visitors |
|---|---|---|---|
| what | A link to your run that anyone can open, nothing to install | People found for you on Prolific or CloudResearch Connect, paid by the run | An invitation on your live site to people who are having trouble |
| who | Customers, a community, a friend's friend: anyone outside your team | Strangers who say they did what your `users` block describes, excluding people who work in UX, design or marketing | Real visitors to your live site who seem stuck, said yes, on their own device |
| steps | `run` prints the link · you send it · each attempt lands in the run | a panel key and a cap in config · `run` turns `users` into panel filters and questions · people are paid as they finish, the cap holds | one script tag · mark the pages it must never interrupt · the second sign of trouble invites the person |
| firstScreen | Short screener, then consent | The study listing on the panel, then screener, then consent | The invitation: why they were invited, how long, what it pays |
| cost | Free, or what you choose to give | On Prolific, about $11 a person for a five-minute task, plus screen-outs; cap about $70 for five (**replaces $54/$60**). On Connect add its prescreen project when the criteria are not profiled fields | Paid at the panel rate, under a daily cap (**replaces "Free"**; the daily scope settles the conflict between intercept-recruiting §1, per day, and 05-integration, per run: the intercept runs continuously on the live site and has no run to cap, so the cap is per day and 05 should be amended) |
| time | As people open it; closes at the deadline | **Unsupported by the docs**: say "by the deadline you set, 48 hours by default", or a measured figure from the desk research | **Unsupported**: "depends on your traffic" |
| goodFor | Catching what almost anybody would stumble on, today | People like your users when you don't know any | Real tasks, real devices, the moment it went wrong |
| mini | The invite link in its real format, with copy | The cap with the reserve shown, no "live" dot | The invitation as specified, with "No thanks" |
| availability | Now, on a public or Vercel-protected preview, or `--tunnel` | Later (R3): needs a label | Hosted only, later (H2): needs a label |

**The three caveats a developer can act on.**

- **Link:** send it to people outside your team and outside tech where you can, and for each problem ask whether your real users would hit it too.
- **Panel:** panel people answer screeners for money, so check the fit line in the report and exclude anyone plainly not your audience (they stay paid).
- **Visitors:** they show where real users get stuck but not how many do; treat their problems as leads and confirm them with a link or panel run.
