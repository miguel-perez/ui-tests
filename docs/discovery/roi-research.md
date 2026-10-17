# What a run is worth: the case a developer can put in front of a team

17 October 2026. The ROI work for the library was written on 12 October in the design corpus (`designs/usability-library/roi.md`, recovered here as [`roi-2026-10-12.md`](roi-2026-10-12.md)) and never came across in the move to this repository. Nothing on the page weighs the price against a benefit: the panel's "about $54" stands alone, and the only framing of money is defensive. This document records what was lost, which figures in the literature survive scrutiny, what the corpus says, and the two-layer proposal: a sentence for the landing and a calculator the run's own numbers fill.

## 1. What was lost

The old document's thesis: "Spend less time explaining, triaging, and rebuilding interfaces… Report recovered hours before monetary value." It held a benefit ledger of eight channels (confusion-driven reports, diagnosis, rework, dev tools, onboarding, cheaper research, conversion, access); the recovered-hours formula `(Q0 − Q1) × h0 + Q1 × (h0 − h1)` with reports normalised by exposure and no credit for relabelling; the accounting contract (`ROI = (benefit − cost) / cost`, break-even hours, payback months) with capacity, cash avoided and contribution margin kept apart; a worked sensitivity (120 reports a month at 30 minutes and $100 an hour against $2,300 upfront: break-even at 17.8% fewer reports, payback 1.9 months); an evidence table that said "historical effect sizes are unsuitable calculator defaults"; and a value hypothesis per finding, `goal → obstacle → fix → expected operational change → value measure`. The guardrails to carry over: hours before dollars, no double counting of a problem as a leak and as rework, a closed issue is not proof of a saving.

## 2. The literature, with verdicts

| Claim | Number | Origin | Verdict |
|---|---|---|---|
| "IBM Systems Sciences Institute" phase costs | 1 : 6 : 15 : 100 | Pressman 1987 citing course notes; Bossavit traced it to an internal training programme with data from 1967–81 ([The Register](https://www.theregister.com/2021/07/22/bugs_expense_bs/), [Hillel Wayne](https://buttondown.com/hillelwayne/archive/i-ing-hate-science)) | Not usable |
| Usability "rule of ten" | $1 : $10 : $100 | Gilb 1988 as a rule of thumb ([UXPA](https://uxpa.org/the-roi-of-usability/)) | Not usable as fact |
| Boehm's cost-of-change curve | "often" 100× after delivery, about 5:1 for small noncritical systems | Boehm & Basili, IEEE Computer 2001 | Defensible with caveats; only the 5:1 applies to our users |
| No consistent delayed-issue effect | 171 projects, 2006–2014 | Menzies, Nichols, Shull & Layman 2017 ([arXiv](https://arxiv.org/abs/1609.04886)) | Defensible; the multiplier defaults to 1 |
| "$100 for every $1", "9,900% ROI" | 100:1 | A paywalled 2016 Forrester report nobody quotes by page; "cannot be traced" even by its fans | Not usable |
| "$2 for every $1", "$10 to $100" | | No primary source | Not usable |
| NN/g 2003 | 42 redesigns improved KPIs 135%; about 10% of budget | Collected cases; Nielsen says the units differ so no ROI can be computed ([NN/g](https://www.nngroup.com/articles/return-on-investment-for-usability/)) | Defensible with caveats |
| NN/g 2008 | 83% across 72 cases, down from 135% ([NN/g](https://www.nngroup.com/articles/usability-roi-declining-but-still-strong/)) | | Defensible with caveats; gains shrink |
| Bias & Mayhew, *Cost-Justifying Usability* | No universal ratio; per-project benefit categories from the team's own data at conservative and aggressive values | | Defensible; the method to copy |
| Spool 2018 | Calls × cost per call, plus lost sales, plus rework; find where your own design costs money ([Center Centre](https://articles.centercentre.com/?p=2465)) | | Defensible; the framing to use |
| Five users find 85% | Only for problems affecting about 3 in 10 users | Nielsen & Landauer 1993 via [MeasuringU](https://measuringu.com/five-user-85/) | Defensible with caveats |
| 1 of 5 hit it | 95% interval 2% to 64% | [MeasuringU](https://measuringu.com/binomial-probability/) | Defensible; use in the calculator |
| Cost of a support ticket | $62 average | MetricNet/HDI, internal IT desktop support, 2010 | Not usable as a default |
| "$15 to $40 per SaaS ticket" | | Third-party calculators citing a trends report with no data | Not usable |
| Baymard checkout | 35.26% relative lift possible | Large US and EU retailers, a potential gain | Defensible with caveats; not for sign-up flows |
| Engineer hourly cost | $135,980 median, May 2025 ([BLS](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm)); wages 70.1% of compensation ([BLS ECEC](https://www.bls.gov/news.release/archives/ecec_03202026.htm)): about $93 an hour loaded | | Defensible |

## 3. The corpus

- **Krug, *Rocket Surgery*** (`P4_Krug_Rocket_Surgery.txt` 1070, 1217, 1309–1355, 4936–4970): "'A morning a month'… shorthand for keeping it as simple as possible so you do it often"; "$5,000 to $15,000 per round if you hire someone" against "a few hundred dollars"; a DIY year at $4,000 to $6,000, mostly incentives; on ROI case studies, "very convincing, but… very time-consuming and expensive to create… I'm not a big fan"; his one example is time-based.
- **Sauro & Lewis, ch. 7** (`P2_26_Sauro_Quantifying_UX.txt` 12285–12345, 12438–12460): discovery follows 1 − (1 − p)^n; Lewis's 1994 simulation with fix costs of $100 against $200 to $1,000 undiscovered found the cost of an undiscovered problem "had a minor effect on the sample size at maximum ROI"; severity is independent of how early a problem is found.
- **Nielsen & Loranger** (4476–4512): doubling conversion "a likely result", with the 2003 and 2008 caveats.
- **Cooper, *Inmates*** (2570): "more costly in the long run to have programmers write the wrong thing than to write nothing at all."
- **Lean UX** (atom `lux-principle-ux-debt`): track UX debt like technical debt; "once we presented rework as debt, all opposition fell away."
- **Alvarez** (750): "every hour spent on customer development has saved 5, 10, or even more hours", her own experience, an opinion.

## 4. The proposal

**The landing sentence.** The most defensible comparison is an engineer-hour: a government figure, known to the reader, with no multiplier.

> Five people cost about $55, about 35 minutes of a US developer's time. If one problem they show you would have taken longer than that to find from bug reports, reproduce and fix after release, the run has paid for itself.

The arithmetic as a footnote: $135,980 ÷ 2,080 hours = $65 an hour in wages; wages are 70% of what employers pay, so about $93 an hour loaded; $55 ÷ $93 = 0.59 hours, about 35 minutes. An optional second line from the run's own evidence: "If 2 of 5 got stuck at a step, at least 12 in 100 of your visitors probably do too."

**The calculator.** Inputs the run fills: the price P from the receipt; x of n at the problem; the moment, page and step. Inputs the author enters: W, people who reach that step each week; v, what one lost person is worth (a sign-up's value, or a support contact as handling minutes × R); h, hours to fix it now; d, extra hours if found after release (reports, triage, reproduction, redeploy); T, weeks until it would otherwise be noticed. Defaults with sources: r, the share affected, as the lower bound of the 95% adjusted-Wald interval (1/5 → 2%, 2/5 → 12%, 3/5 → 23%, 4/5 → 36%, 5/5 → 51%); R, the loaded rate, $93 an hour; m, the after-release multiplier, 1, with a toggle to 5 labelled "Boehm & Basili 2001, small noncritical systems; Menzies 2017 found no consistent effect".

Two formulas. Leak: weekly loss = W × r × v; the run pays for itself when T ≥ P ÷ (W × r × v). Engineering: the run pays for itself when (m − 1) × h × R + d × R ≥ P; with m = 1 that is d ≥ P ÷ R, about 0.6 hours. The output is a sentence: "This run pays for itself if the problem at step 3, /signup, would have stayed live more than 2.4 days, or would have cost you more than 35 minutes of finding and fixing after release." It states the uncertainty: paid testers are not your visitors; r is a lower bound, not a forecast. Guardrails: hours before dollars; never count the same problem as a leak and as rework; a closed issue is not proof of a saving.

**Words to avoid:** ROI percentages; the rule of ten as fact; "studies show"; Forrester or IBM figures; "doubles conversion"; "saves money"; "85% of problems" without "that affect about 3 in 10". **Words to use:** "pays for itself when…"; "about 35 minutes of a developer's time"; "at least x in 100 (95% interval)"; "your numbers, not ours"; "before you merge"; "one problem acted on per run".
