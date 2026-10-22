# What a first look can and cannot claim

Primary-source briefing collected by a research subagent, then revised for issue [#81](https://github.com/miguel-perez/ui-tests/issues/81). Used by the first look in [`../prd/02-study-and-verdict.md`](../prd/02-study-and-verdict.md). The first sections are background: they explain why the earlier design, a 500 ms flash followed by "What was that page for?", was removed.

## First click

The quoted figures, 87% eventual success after a correct first click versus 46% after a wrong one, come from Bob Bailey and Cari Wolfson's analysis of about a dozen moderated tests on live US government sites (2006 to 2009; the original page is gone, surviving through [Sauro 2011](https://measuringu.com/first-click/) and [Sauro 2013](https://measuringu.com/first-choice/); peer-reviewed companion Bailey, Wolfson, Nall and Koyani, HCII 2009). Sauro's replication on five live sites, 21 tasks, 750 users found 78% versus 70%, a ratio of 1.13, with per-study ratios from 0.93 to 1.47; on tree tests the same comparison was 80% versus 14%. The effect is large when navigation is the only route and modest on real pages with search and in-page routes. Screenshot click tests differ from live-page clicks by about 5 to 8% on average and up to 40% where hover menus exist; MeasuringU calls ±10% the best case ([2023](https://measuringu.com/?p=36842)). The finding is correlational and survivorship-prone, and the "optimal" click is researcher-coded.

## Five-second test

Perfetti's original (UIE 2007, [centercentre](https://articles.centercentre.com/five_second_test/)) was built for content pages and declared "less useful for home pages". [Gronier 2016](https://www.guillaumegronier.com/resources/2016_JUS_Gronier.pdf), 146 respondents, one site: attractiveness ratings did not differ between 5 seconds and unlimited time; pragmatic quality and ease ratings were lower at 5 seconds; purpose identification was 97% versus 92% for the primary purpose and near zero for secondary purposes; the author says the method "has never been scientifically proven". Kuric et al. 2024 (Behaviour and IT, [summary](https://www.smashingmagazine.com/2023/12/five-second-testing-case-study/)): attitude ratings are stable from about 2 seconds; purpose identification still rises between 5 and 10 seconds and is worse on complex pages. [NN/g 2024](https://www.nngroup.com/articles/testing-visual-design/): captures gut reaction to visual style, too short for copy. No published study links five-second recall to later task success.

## Thin-slice appeal

Lindgaard et al. 2006: appeal ratings at 500 ms correlate r = .97 with repeated ratings and .98 with unlimited viewing; 50 ms correlates .97 with 500 ms. Lindgaard et al. 2011: 50 ms judgements of appeal, trust and usability are all driven by appeal, a halo. [Tuch et al. 2012](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/38315.pdf): visual complexity and prototypicality explain most of appeal from 33 ms on. Reinecke et al. 2013: complexity, colourfulness and demographics explain about half of appeal variance.

The same method underlies Miguel's 2015 `turk-test` and `grokkedit` studies on Mechanical Turk (Grokked.it was the HIT-posting service around them): a 500 ms fixation point, a design flashed for 500 ms (variants at 5 and 10 s), then eight Likert items on cleanliness, aesthetic, originality, creativity, colour, appeal, convenience and navigation, with four attention items and a semantic differential. In the D0 accounts hn_41261 asks for exactly this, "flash it in front of a tester for 5-10 seconds, and then have the tester answer questions about their comprehension of the site's purpose and benefits" (s78), because low traffic made numbers meaningless (s79). Lyssna sells five-second tests on their own; as the first stage of a run on the same participants, beside the issues and never combined into the result, it is sold nowhere.

Direction of causation: Tractinsky 2000 found aesthetics drove perceived usability; [Tuch, Roth, Hornbæk et al. 2012](https://research.google/blog/is-beautiful-usable-what-is-the-influence-of-beauty-and-usability-on-reactions-to-a-product/) found the reverse, poor usability lowered post-use beauty and beauty did not change perceived usability; Grishin and Gillan 2019 and Sauer and Sonderegger 2022 found no aesthetics effect on SUS or UX over repeated use. [NN/g](https://www.nngroup.com/articles/aesthetic-usability-effect/): the aesthetic-usability effect masks minor problems only and can get in the way of a test; Lindgaard and Dudek 2003 saw over 50% task failure with satisfaction still high.

## Downstream outcomes

Lab only. Iten et al. 2018 (n = 120): appeal predicted willingness to stay in brief tasks but usage mode dominated in realistic browsing. SUPR-Q: appearance contributes to loyalty alongside usability and trust. No field study ties a 50 ms or 5 second score to conversion or retention. Comprehension-to-conversion evidence is vendor anecdote only.

## What the stage may claim

- The tour's answer says whether the page gets across what it is, whose it is, what you can do there and what it is for, part by part against what the page should say, and nothing deeper.
- The first click on the real page predicts navigation success weakly on a live page (about 78% versus 70%) and strongly when the task is pure findability; expect ±10% noise.

## What it may not claim

That a first look predicts task success, that appeal predicts task success, post-use SEQ or SUS, or conversion. That a passed five-second test means the page works. That first-click aggregates generalise beyond the one framed task.

## Why the flash was removed

The earlier stage mixed two methods and measured neither. A 500 ms flash is Lindgaard's thin slice, which is valid for appeal; "What was that page for?" is the five-second test's question, and purpose identification still improves between 5 and 10 seconds (Gronier 2016; Kuric et al. 2024), so half a second measures it badly. It coded answers against the study's `purpose`, which is what the author wants people to do, not what the page says. Without a model it fell back to a word-overlap rule, and that rule rewarded repeating the purpose the screener had just shown. The thin-slice appeal measure is not kept as an option: appeal is a halo and a covariate (above), and the question the stage exists for is comprehension.

## The design: the home page tour

The usability method in the design corpus is Krug's home page tour, done in every session: an untimed look at the page, "tell me what you make of it … whose site it is, what you can do here, and what it's for … don't click on anything yet" (*Rocket Surgery Made Easy*), and the first look must start cold: avoid discussing the site beforehand, so it shows whether people can figure out what it is from a standing start (*Don't Make Me Think*).

- **The page.** The live start page (`firstLook.page`, else the primary task's start), with no time limit. The person can scroll; nothing is clickable. There is no picture and no flash.
- **The prompt.** One open prompt in four parts: what it is, whose it is, what you can do there, what it is for. Typed, or spoken with "Talk instead".
- **What it is coded against.** `firstLook.says`, what the page should get across: written by the author, or read from the start page's `<h1>`, meta description or og:description, and reviewed in the study's snapshot. Never the `purpose`, and nothing before the first look shows the purpose.
- **The codes.** Per part: identified it, identified who it is from, named an action, named its purpose. The configured model codes them; without one, or when its reply does not parse, the answer is left uncoded and listed for the author, who can code it in the trace. Nothing guesses.
- **Where it goes.** Beside the issues, never inside the counts or the sentence. Five to ten people are enough for qualitative comprehension.
- **First click.** Each task's first click is read on its own start page, against its own goal and path, from the task's own events; it predicts navigation success weakly on a live page (about 78% versus 70%) and strongly when the task is pure findability.
