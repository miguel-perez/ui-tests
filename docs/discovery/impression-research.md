# What an impression stage can and cannot claim

Primary-source briefing collected by a research subagent. Used by the impression stage in [`../prd/02-study-and-verdict.md`](../prd/02-study-and-verdict.md).

## First click

The quoted figures, 87% eventual success after a correct first click versus 46% after a wrong one, come from Bob Bailey and Cari Wolfson's analysis of about a dozen moderated tests on live US government sites (2006 to 2009; the original page is gone, surviving through [Sauro 2011](https://measuringu.com/first-click/) and [Sauro 2013](https://measuringu.com/first-choice/); peer-reviewed companion Bailey, Wolfson, Nall and Koyani, HCII 2009). Sauro's replication on five live sites, 21 tasks, 750 users found 78% versus 70%, a ratio of 1.13, with per-study ratios from 0.93 to 1.47; on tree tests the same comparison was 80% versus 14%. The effect is large when navigation is the only route and modest on real pages with search and in-page routes. Screenshot click tests differ from live-page clicks by about 5 to 8% on average and up to 40% where hover menus exist; MeasuringU calls ±10% the best case ([2023](https://measuringu.com/?p=36842)). The finding is correlational and survivorship-prone, and the "optimal" click is researcher-coded.

## Five-second test

Perfetti's original (UIE 2007, [centercentre](https://articles.centercentre.com/five_second_test/)) was built for content pages and declared "less useful for home pages". [Gronier 2016](https://www.guillaumegronier.com/resources/2016_JUS_Gronier.pdf), 146 respondents, one site: attractiveness ratings did not differ between 5 seconds and unlimited time; pragmatic quality and ease ratings were lower at 5 seconds; purpose identification was 97% versus 92% for the primary purpose and near zero for secondary purposes; the author says the method "has never been scientifically proven". Kuric et al. 2024 (Behaviour and IT, [summary](https://www.smashingmagazine.com/2023/12/five-second-testing-case-study/)): attitude ratings are stable from about 2 seconds; purpose identification still rises between 5 and 10 seconds and is worse on complex pages. [NN/g 2024](https://www.nngroup.com/articles/testing-visual-design/): captures gut reaction to visual style, too short for copy. No published study links five-second recall to later task success.

## Thin-slice appeal

Lindgaard et al. 2006: appeal ratings at 500 ms correlate r = .97 with repeated ratings and .98 with unlimited viewing; 50 ms correlates .97 with 500 ms. Lindgaard et al. 2011: 50 ms judgements of appeal, trust and usability are all driven by appeal, a halo. [Tuch et al. 2012](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/38315.pdf): visual complexity and prototypicality explain most of appeal from 33 ms on. Reinecke et al. 2013: complexity, colourfulness and demographics explain about half of appeal variance.

Direction of causation: Tractinsky 2000 found aesthetics drove perceived usability; [Tuch, Roth, Hornbæk et al. 2012](https://research.google/blog/is-beautiful-usable-what-is-the-influence-of-beauty-and-usability-on-reactions-to-a-product/) found the reverse, poor usability lowered post-use beauty and beauty did not change perceived usability; Grishin and Gillan 2019 and Sauer and Sonderegger 2022 found no aesthetics effect on SUS or UX over repeated use. [NN/g](https://www.nngroup.com/articles/aesthetic-usability-effect/): the aesthetic-usability effect masks minor problems only and can get in the way of a test; Lindgaard and Dudek 2003 saw over 50% task failure with satisfaction still high.

## Downstream outcomes

Lab only. Iten et al. 2018 (n = 120): appeal predicted willingness to stay in brief tasks but usage mode dominated in realistic browsing. SUPR-Q: appearance contributes to loyalty alongside usability and trust. No field study ties a 50 ms or 5 second score to conversion or retention. Comprehension-to-conversion evidence is vendor anecdote only.

## What the stage may claim

- The appeal item is reliable and predicts the attitude participants bring into the task, through a halo. It is a covariate, not an outcome.
- The comprehension question says whether the headline and hero carry the primary purpose, and nothing deeper.
- The first click on the real page predicts navigation success weakly on a live page (about 78% versus 70%) and strongly when the task is pure findability; expect ±10% noise.

## What it may not claim

That appeal predicts task success, post-use SEQ or SUS, or conversion. That a passed five-second test means the page works. That first-click aggregates generalise beyond the one framed task.

## The cheapest honest design

One unmoderated session per participant, in order: 500 ms flash, one appeal item on a 1 to 9 scale, one open "what is this site for?", one first click on the live page for an unprimed task, then the full task. Report the stage as a covariate beside the issues, never inside the counts. Thirty to fifty participants per design for a first-click split; five to ten for qualitative comprehension.
