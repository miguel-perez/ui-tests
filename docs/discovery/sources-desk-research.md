# Where the people come from: panels, competitors, intercepts and links

16 October 2026. Desk research for the sources section, companion to [`sources-research.md`](sources-research.md). Every figure carries its URL; "not found" means not found.

## 1. Panels

| Panel | Pool claimed | Targeting | Price | Speed (published) | Recording |
|---|---|---|---|---|---|
| Prolific | "300,000+ active participants", "300+ audience filters" ([pricing](https://www.prolific.com/pricing)) | Prescreen filters; the device setting "does not screen out participants" ([study details](https://researcher-help.prolific.com/en/articles/445126-study-details)) | Minimum $8/h, recommended at least $12/h; fee 42.8% corporate, 33.3% academic ([pricing](https://www.prolific.com/pricing)); UK VAT on the fee | "start receiving responses within hours"; "The average study takes 2 hours to complete" ([vs MTurk](https://www.prolific.com/prolific-vs-mturk)); no guarantee of a time window ([time-sensitive](https://researcher-help.prolific.com/en/articles/445150-what-if-my-study-is-time-sensitive)) | See below |
| Maze panel | "millions… in 150+ countries", "400+ filters" ([panel](https://maze.co/product/panel/)) | Country, age, sex, education, profession, screeners | 3 credits per response Core, 5 Extended B2C, 9 Extended B2B ([help](https://help.maze.co/articles/1813153510-recruiting-participants-from-maze-s-extended-network)) | Core "2–4 hours"; Extended "2–3 business days"; "15 mins median time to first participant match" | Supported |
| Lyssna | "690,000+ panelists", "395+ demographic filters" ([pricing](https://www.lyssna.com/pricing/)) | Demographic filters and custom screeners | Credits from $1.00; a response uses one or more ([help](https://help.lyssna.com/en/articles/4953377-lyssna-pricing)) | "50 responses in under two hours for common demographics… within 30 minutes for untargeted"; partner panel "24-48 hours to begin" ([help](https://help.lyssna.com/en/articles/4952930-how-long-will-results-take)) | Audio, screen and camera on unmoderated tests |
| Userbrain | "180k+ qualified testers" | Country, age, gender, language, device, screeners | $45 per extra tester on Flex ([pricing](https://www.userbrain.com/en/pricing)) | "results in just a few hours" | Screen and audio every tester |
| UserTesting | "6 million" / "7 million", 34 countries ([network](https://www.usertesting.com/platform/network)) | Standard and additional countries | Not found | "most tests fill in just an hour or two" ([help](https://help.usertesting.com/hc/articles/11880395269917)) | Core product |
| User Interviews | "6–7.5 million", 34 countries ([pricing](https://www.userinterviews.com/pricing)) | B2B add-on $45/session | $49/session plus incentive | Not found | Not stated |
| Respondent | Not found | — | $30 platform fee per session plus incentive (third party) | Not found | — |
| TestingTime | ~950k (conflicting) | Screeners | Calculator only | "a few days" unmoderated (third party) | — |

**Prolific API** creates, updates and publishes studies, approves and rejects submissions, pays bonuses, manages participant groups and prescreening surveys, with event hooks; topping up cannot be done through the API ([API](https://docs.prolific.com/api-reference/introduction)). Prolific "calculates the effective hourly rate based on the median actual completion time" and flags underpaying studies ([help](https://researcher-help.prolific.com/en/articles/445266-how-much-should-i-pay-participants)).

**Prolific and recording.** No published policy names screen recording. Studies can be marked as needing audio, camera, microphone or downloads ([study details](https://researcher-help.prolific.com/en/articles/445126-study-details)). "Only this select group of researchers may collect PII" ([participant help](https://participant-help.prolific.com/en/articles/445036-personal-information-in-studies)); a voice recording or a screen showing an inbox may count. Maze's Core panel is "powered by Prolific" and Maze sells recorded unmoderated tests, so recorded tasks on Prolific participants do run.

**Five people, a ten-minute task, Prolific corporate rates, USD:** minimum $8/h gives $9.57 total with fee; recommended $12/h gives $14.28; priced at 15 minutes to cover consent and screen-share setup, $21.42. Resellers: Lyssna about $50 (unconfirmed credit rate), Userbrain about $225, PlaybookUX $325 ([pricing](https://www.playbookux.com/pricing/)).

**Realistic turnaround** for five general-audience participants: minutes to first response, a few hours to all five (Lyssna 50 in under 2 hours; Maze Core 2–4 hours with a 15-minute median to first match; UserTesting "an hour or two"; Userbrain "a few hours"). No panel publishes a median for 5, 10 or 20. Narrow audiences, non-English tests and weekends are slower; Maze Extended 2–3 business days; Lyssna's partner panel 24–48 hours to begin.

## 2. How competitors present participant sources

- **Maze** ([panel](https://maze.co/product/panel/)): alternating image-and-text sections, four benefit blocks, an FAQ. "share your test link for free"; names Prolific and Respondent, "Zero lock-in"; proof ">95% invited participants show up"; caveats only in the help centre.
- **Lyssna** ([panel](https://www.lyssna.com/features/research-panel/)): "Most studies using the Lyssna panel return results the same day"; "Results often start arriving within 30 minutes"; "US$1.00 per credit"; "Quality response guaranteed – or we'll replace it". The caveat lives in "most" and "often".
- **Useberry** ([recruitment](https://www.useberry.com/participant-recruitment/)): two named options, "Participant Pool" and "share a custom link to reach your own users"; no numbers on that page.
- **UserTesting** ([network](https://www.usertesting.com/platform/network)): "100% proprietary… We never buy audiences"; a five-step "How it works"; the guarantee as caveat: "you'll never pay for a fraudulent session"; no turnaround stated.
- **Userbrain** ([pricing](https://www.userbrain.com/en/pricing)): pricing cards; own testers "do not use your panel-tester balance".
- **PlaybookUX** ([pricing](https://www.playbookux.com/pricing/)): "7M+ Consumers & Professionals"; bring-your-own is Enterprise only.
- **Hotjar Engage** is no longer sold to new customers; Trymata redirects to QuestionPro.

Pattern: nobody uses a three-way table of link, panel and intercept. The panel gets its own page; "your own users" is one line or card. Turnaround is always stated in hours or "same day", never 48 hours.

## 3. Live-site intercepts

- **Triggers:** Qualaroo time on page, exit intent, scroll halfway ([help](https://help.qualaroo.com/hc/en-us/articles/203496847)); Ethnio random times, URL rules, device, geography, custom data, a delay, display percentage 0.001–100% ([intercepts](https://ethn.io/intercepts)); Sprig in-product events ([docs](https://docs.sprig.com/docs/survey-creation)); Hotjar behaviour, page visits, exit intent.
- **Frequency capping:** Sprig's recontact waiting period counts people who saw a survey, 30 days as a start ([docs](https://docs.sprig.com/docs/resurvey-waiting-period)); Ethnio display limits and exclusivity; Qualaroo once per visitor.
- **Wording:** Ethnio offers short/medium/long with a "dismiss nicely" option. Smashing: say who you are, the objective and the time, mention the incentive after the introduction, none needed under 15 minutes ([Smashing](https://www.smashingmagazine.com/2016/02/the-art-of-the-intercept/)).
- **Consent and payment:** Ethnio tracks consent per participant with expiry and pays in any currency including gift cards.
- **Checkout and forms:** no vendor rule found; Contentsquare's u-turns after add-to-cart argue for watching, not interrupting ([guide](https://contentsquare.com/guides/frustrated-users/)).
- **Acceptance rates:** no authoritative figure; Qualaroo claims 10–30% (marketing), Koji 26% for web in-app surveys (secondary); NN/g and MeasuringU not found.
- **Behaviour signals and terms:** Hotjar rage click "the same element clicked five times within 500ms", u-turn "returns directly back to the previous page within seven seconds", a frustration score ([panel](https://help.hotjar.com/hc/en-us/articles/36820020385297-What-is-the-Heatmaps-Side-Panel), [update](https://hotjar.com/updates/en/level-up-your-prioritization-with-frustration-and-engagement-scores)); FullStory rage, error and dead clicks and "thrashed cursor", with false positives on Next/Previous ([help](https://help.fullstory.com/hc/en-us/articles/360020624154)); Contentsquare frustration score ([page](https://contentsquare.com/platform/capabilities/frustration-score/)). Triggering an invitation on a rage click has no native vendor feature; only workarounds through custom events ([Portent](https://portent.com/blog/cro/leverage-hotjar-surveys-for-rage-click-custom-events.htm)). ui-tests is novel here and must explain the mechanism.

## 4. The link

| Case | One line | Caveat |
|---|---|---|
| Vercel preview | Previews sit behind Standard Protection; use a Shareable Link or append `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true` ([bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation), [shareable](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/sharable-links)) | Hobby gets one shareable link per account; Password Protection is $20/month per project on Pro ([protection](https://vercel.com/docs/deployment-protection)); the bypass secret in a URL is a credential |
| Netlify preview | Private by default; a Pro shared password or team login ([KB](https://www.netlify.com/knowledge-base/how-to-password-protect-a-netlify-site-or-deploy-previews/)) | Team login needs a paid seat; no API or CLI for these settings |
| ngrok | `ngrok http 3000` | Free tier shows an interstitial on HTML traffic, suppressed by cookie for 7 days; 1 GB/month, 20,000 requests ([limits](https://ngrok.com/docs/pricing-limits/free-plan-limits)) |
| Cloudflare quick tunnel | `cloudflared tunnel --url localhost:3000` gives a `trycloudflare.com` URL | No uptime guarantee; "The URL stops working when you stop the cloudflared process", "The hostname changes each time" ([docs](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)) |
| localtunnel | `npx localtunnel --port 3000` | Visitors get a reminder page asking for a password that is the developer's public IP ([repo](https://github.com/localtunnel/localtunnel)) |
| VS Code dev tunnels | Set visibility to Public ([VS Code](https://code.visualstudio.com/docs/debugtest/port-forwarding)) | An "interstitial anti-phishing page" on first visit ([MS](https://learn.microsoft.com/azure/developer/dev-tunnels/security)) |
| Live site | One script tag | Safari, Firefox and Brave block third-party cookies by default; a first-party snippet avoids it |

Every tunnel dies when the laptop sleeps or the process stops.

## Summary

| Source | Defensible turnaround | Cost statement | Top caveat |
|---|---|---|---|
| Your link | As each person finishes; depends on who you send it to | Free from ui-tests; a protected preview needs a shareable link or the bypass secret | Previews are protected by default; tunnels show warning pages and die with the laptop |
| Paid panel (name Prolific, as Maze does) | First people in minutes, usually all five within a few hours; narrow audiences a day or more | Our formula: about $11 a person for a short recorded task including the panel's fee, five about $55, cap about $70 with the reserve. Prolific's own minimum would be far lower; resellers far higher | A sentence must become filters plus a screener; recording touches Prolific's PII rule |
| Your visitors | Traffic × sampling × acceptance; no published acceptance benchmark | Paid at the panel rate under a daily cap (PRD); competitors give nothing under 15 minutes | Struggle-triggered invitations have no vendor precedent; needs frequency caps, consent before recording, never on checkout |

**Claims on the current page the evidence contradicts:** "Within 48 hours"; "About $54 for a short task" with a $60 cap; "matched to the `users` line" without showing the translation into filters and a screener; the panel left unnamed; "Your link… Free" with no word on protected previews; "invited the moment they are visibly struggling… as each person finishes"; "The paid panel is the only thing you pay for" when the preview host's access options may not be free.
