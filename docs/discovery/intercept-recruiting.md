# Proposal: recruit participants from the website itself, triggered by struggle

Written 15 October 2026 from Miguel's 2016 sketch [`eMotion.js`](https://github.com/miguel-perez/eMotion.js) and its sibling `cxi-emotion`. Adopted into the PRD as the `intercept` source and the H2 slice; this note keeps the reasoning and the research basis.

## The idea

A fourth participant source beside link, Prolific and Connect: **the site's own visitors**, invited at the moment the page shows they are struggling. The invitation is the recruitment call. The same snippet that powers the hosted install-once track watches for struggle signals, and when one fires it offers: "Having trouble with this? Help us fix it, five minutes, we pay." Accepting opens the player in companion mode on the live site, with a task derived from where they were, consent, the questions, and the incentive. The visitor becomes a participant who already matches the audience by definition: they are a real user of the thing, mid-task, on their own device.

This serves the two needs the opportunity map ranks first, being shown the problem and getting participants who match, and it does so for persona 3, who cannot deploy a preview or recruit a panel, and for persona 2, whose "launch to find out" becomes "launch and let the struggling visitors tell you".

## What eMotion.js already had

| Detector | Rule in the 2016 code | Status |
| --- | --- | --- |
| Mouse lethargy | Split mousemove stream into actions at 200 ms pauses; compare the latest action to the visitor's own earlier actions; flag when distance is more than 30% longer or velocity more than 17% slower | Implemented, tested, dispatches a DOM event; thresholds hard-coded |
| Pogo-sticking | Last three page URLs form A-B-A | Implemented |
| Click-whiffing (dead clicks) | Empty file | Stub |
| Rapid-fire clicking (rage clicks) | Empty file | Stub |

The thresholds come from Hibbeln, Jenkins, Schneider, Valacich and Weinmann, "How Is Your User Feeling? Inferring Emotion Through Human-Computer Interaction Devices", MIS Quarterly 41(1), March 2017: negative emotion increases cursor distance and reduces cursor speed; distance and speed inferred negative emotion with 81.7% accuracy on a mock e-commerce site (n = 126) and explained self-reported negative emotion with an out-of-sample R² of 0.17 on a product configurator (n = 80). Sources: [University of Arizona record](https://experts.arizona.edu/en/publications/how-is-your-user-feeling-inferring-emotion-through-human-computer/), [MISQ appendix](https://misq.umn.edu/skin/frontend/default/misq/pdf/appendices/2017/V41I1Appendices/01_11979_RA_HibbelnAppendix.pdf), [LSE Business Review summary](https://blogs.lse.ac.uk/businessreview/?p=9935). Read honestly: the signal is real and weak. 81.7% on a lab manipulation is not 81.7% in the wild, and an R² of 0.17 means most of the variance is not emotion. The detector is a trigger for an invitation, not evidence of a problem by itself. It is also mouse-only; touch devices need the click and scroll detectors.

## What changes if we adopt it

1. **Participants, a fourth source.** `intercept` in the config, with the triggers, the invitation copy, the cap per day, and the incentive. Visitors who accept are participants like any other: consent, task, questions, pay. Visitors who decline are never asked again that session. The invitation never fires on a checkout, payment or form-in-progress page.
2. **One detector set, two jobs.** The struggle detectors (lethargy, pogo-sticking, dead click, rage click, long pause, backtrack) are the same signals the PRD's Issues section reads from a trace. In a study they mark the moment; on a live site they trigger the invitation. One implementation in the SDK, with the thresholds adjustable and logged.
3. **The task comes from the page.** The scenario is derived from where the visitor was and what they were doing: "You were trying to [goal from the page's declared happy path]. Keep going, and tell us where it goes wrong." Authors declare happy paths per route in the same four-input format; on the hosted track, in the UI.
4. **Ethics are part of the design, not a footnote.** The visitor is told why they were invited ("you seemed to be having trouble"), what is recorded, and what they are paid, before anything is captured. Nothing from before acceptance is kept. The detector never runs on pages the author marks sensitive. This is the difference between an invitation and surveillance, and it is the line Clarity and Contentsquare do not draw because they never ask.
5. **Verdicts stay honest.** Intercept participants are a biased sample by construction: people who struggled and said yes. The report labels the source, keeps intercept attempts out of a `catch` or `estimate` sample unless the author opted in, and reports them as issues found, not as a completion rate.

## How it fits the slices

Intercept needs the snippet on a live site, so it belongs to the hosted install-once track after R1. The detectors themselves land earlier, in R1, because the Issues section needs them in the trace. That ordering lets us validate the detectors on our own site against hook-verified failures before anyone is invited by them.

## Riskiest assumptions

- Visitors mid-struggle will accept a five-minute paid invitation at a useful rate. No account in D0 reports trying this; the nearest is the owner who "would pay good money" to watch each sign-up (hn_5688018).
- The detectors fire on struggle and not on reading, hesitation, or a slow trackpad. Hibbeln et al. say the effect appears on pages after the frustration, which argues for triggering on the second signal, not the first.
- Authors will declare happy paths per route for a live site, which is more than the four inputs they give a test file.
