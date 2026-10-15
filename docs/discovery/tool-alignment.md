# Off-the-shelf tools against the ten D0 needs

Collected 15 October 2026 by a research subagent from vendor pricing and docs pages. "n/p" = not public. Used by the opportunity map in [`redesign.md`](redesign.md).

## Market changes first

- Trymata (ex TryMyUI) merged into QuestionPro, Feb 2026; combined pricing n/p.
- Hotjar is now Contentsquare; Hotjar Engage recruiting is gone from the pricing page.
- UserTesting acquired User Interviews, Jan 2026.
- Maze dropped its $99/month Starter in April 2026; only Free and Enterprise remain (maze.co/pricing shows no prices).
- Acceptify exists only as a Show HN; site returns 403.

## Matrix

| Tool | Sign-up and price | Install | Participants | Verified automatically | Surfaces problems | API / CI | Mode | For, procurement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Maze | Self-serve Free; Enterprise by sales; no paid individual tier | Figma; live URL without install (desktop recordings, "qualitative only"); optional JS snippet unlocks heatmaps and goal-based success | Own link; panel pay-per-use, $ n/p | With snippet: success by expected paths, misclick rate, duration, Usability Score 0–100 | Misclicks, usability score, AI report; AI moderator is Enterprise | Read-only MCP; no write API | One-off | Designers, PMs; Free needs nothing |
| UserTesting | Request pricing; annual; no self-serve | Link; participant recorder | Panel, $ n/p; own via Research Hub | Task success by question, QXscore, time | AI summaries, reels; humans watch | Results API read-only, Advanced+; MCP can draft and launch | One-off | Enterprise; sales call |
| Lyssna | Self-serve, no card. Free (3 seats, 15 self-recruited responses, no live-site tests); Growth $166/mo (live website tests, think-aloud, MCP); student discount | Paste URL, no snippet; Figma | Own link; panel 690k at about $1 per minute per response plus screener and recording surcharges | Completion time, recordings, follow-ups; first-click and path on prototypes | AI summaries; recordings human-reviewed | MCP on Growth; no REST | One-off | Designers; no procurement |
| Useberry | Self-serve. Free (1 seat, 10 responses/mo); Growth €83/mo yearly; Business €659/mo | Figma; live site via proxy (paste URL) or snippet | Own link; pool, $ n/p | Completion by path, URL or trigger element; time, misclicks, DOM replays | Misclicks, drop-offs; AI "coming soon" | None | One-off | Designers; no procurement |
| Lookback | 60-day trial; Freelance $299/yr (10 sessions); annual only | Link; Chrome/Edge, mobile app | Own link; User Interviews panel $49 + 6% | Nothing automatic; recordings | Human watches; AI findings and reels | n/p | One-off | Researchers |
| Hotjar / Contentsquare | Self-serve. Free (200k sessions, 5% replay); Growth $39/mo yearly | Snippet, GTM, SDKs | Live traffic only | Heatmaps, replays, funnels; no tasks | Frustration Score and filters (Growth+), AI replay summaries | APIs Pro+; MCP all tiers | Continuous | PMs, marketers |
| Microsoft Clarity | Free, unlimited, self-serve | Snippet, GTM, npm, CMS plugins | Live traffic | Heatmaps, recordings, funnels | Rage, dead and quick-back clicks, excessive scroll, JS errors; AI session summaries; Copilot; MCP | Data Export API, 1 to 3 days | Continuous | Anyone; zero procurement |
| UXtweak | Self-serve. Free (1 seat, 15 responses/mo; website test 3 responses, 1 task); Business price "temporarily unavailable" | Chrome extension or snippet/GTM; Figma | Own link, onsite widget, panel (8 countries) | Success by end URL, time, first click, abandonment, recordings | AI summaries and highlights on Business | None | One-off | Researchers, students |
| Userbrain | 30-day trial with 2 testers; Starter $49/mo (3 panel testers, 1 test) | Link; tester records via extension/app | Panel included; own sessions 3/mo; extra testers $45 | Self-report and recording; no URL success | AI insights, notes, clips | None | One-off | Founders, designers |
| PlaybookUX | Free sign-up, $65 per unmoderated participant; BYO is Enterprise | Link | Panel 7M+ | Self-report, recordings, transcripts | Clips, reels; AI and synthetic participants are Enterprise | API and MCP are Enterprise | One-off | PMs |
| Userlytics | Demo-led; Enterprise $34/session annual; Premium self-recruit $699/mo | Link; recorders | Panel 2M+; BYO on self-recruit | Self-report; recordings | Reels, AI analysis, sentiment | None | One-off | Enterprise; sales |
| Loop11 | 14-day trial; Rapid $179/mo annual, 10 participants/project | Paste URL, no code | BYO free; AI browser agents as a participant source | Success by URL, time, clickstream, lostness, heatmaps (Pro) | Lostness, AI insights; vendor's own study: agents 0–25% success vs humans 62–95% | None | One-off plus intercepts | Researchers, PMs |
| Optimal Workshop | Starter $199/mo annual; free plan discontinued | Figma; no live-site tasks | Own link; recruitment credits | First-click, tree test, card sort | AI insights, reels, MCP | MCP; no REST | One-off | IA researchers |
| MUiQ | $59,980/yr, 5 seats; demo | Link; URL paths | Panel 20M+ | Task success, time, paths, heat maps, recording, SUS/SUPR-Q, built-in statistical comparisons | Stats-backed comparisons; human review | n/p | One-off | Quant researchers; procurement |
| Prolific | Wallet, no subscription; 42.8% fee; min $8/hr, recommended $12/hr; personal email but manual approval | You host the study | 300+ filters, screeners | Nothing; your tool verifies | None | Full API: create, publish, read, approve | One-off | Academics, developers |
| User Interviews | $49/session plus incentives; no free tier | You host; scheduling | 6M+ marketplace | Nothing | None | API in Research Hub only | One-off | Now a UserTesting unit |
| OpenUser | Free, MIT; `npx openuser-cli`; agent tokens only | Local daemon plus Playwright against any URL; MCP | Named personas | goal_achieved / blocked / partial; video, logs | Findings typed functional, console, network, ux_confusion with severity | CLI and MCP; CI undocumented | Per run | Solo developers |
| TestSprite | Free (150 credits); Starter $19/mo | GitHub App on Vercel/Netlify deployment events, runs on the preview URL with protection bypass | None (agent) | Functional pass/fail, screenshots, fix prompt on PR, can block merge | Not usability | CLI, MCP, PR checks | CI | Developers |
| UXAgent and cousins | Research code; Mimiq free/$10; Synthetic Users $12,500/yr (interviews, not navigation) | Browser connector | Generated personas | Actions, replay, agent "interview" | Pilot of study design | n/a | n/a | Researchers |
| Vercel and Playwright agents | Free Playwright test agents; vercel-labs agent-browser (a11y audits, OIDC to protected previews) | Local or preview | None | Test pass/fail | No usability judgement | Native CI | CI | Developers |

## Assessment per need

- **N1 Method in an afternoon.** Strong: Lyssna, Useberry free tiers, Userbrain Starter. Partial: Loop11 trial, Maze Free (prototypes). Weak: UserTesting, Userlytics, MUiQ.
- **N2 Watch and be shown problems.** Strong on watching: Userbrain, Lyssna, UserTesting. Strong on being shown: Clarity, Contentsquare, but on live traffic without tasks. Partial: Maze misclicks and score, Loop11 lostness. No tool both runs a task and diagnoses the failure.
- **N3 Matching participants.** Strong: Prolific, Lyssna panel, PlaybookUX. Partial: Userbrain, User Interviews.
- **N4 Under $50 a run.** Strong: Clarity, OpenUser, TestSprite, Lyssna, Useberry, UXtweak free tiers with own recruits, Prolific DIY (about $20 for five ten-minute attempts). Partial: Userbrain, Lookback Freelance. Weak: Loop11, Optimal, PlaybookUX, MUiQ.
- **N5 Stage in CI.** Strong only for functional agents: TestSprite, Playwright agents, OpenUser. Partial: Prolific API (you host and verify), UserTesting read-only API, read-only MCPs. None otherwise.
- **N6 Preview URL or install once.** Strong: Clarity and Contentsquare (snippet once, hosted UI), TestSprite and agent-browser (protected previews). Partial: Maze, Useberry, UXtweak, Loop11 accept public URLs. No human-panel tool documents protected previews.
- **N7 Meaning at n=5.** Strong: MUiQ only. Partial: Maze score, Loop11 lostness. Everyone else shows a percentage.
- **N8 Shareable evidence.** Strong: UserTesting, Userbrain, Lookback, Lyssna, Maze, UXtweak, PlaybookUX. Partial: Clarity, Contentsquare. Weak: Prolific, User Interviews, OpenUser.
- **N9 No procurement.** Strong: Clarity, Lyssna, Useberry, UXtweak, Userbrain, Loop11, Contentsquare Growth, TestSprite, Prolific, PlaybookUX. Weak: UserTesting, Userlytics, MUiQ, Maze beyond Free, Synthetic Users, Lookback.
- **N10 Agent capability on CLI, MCP or API.** Nothing purpose-built. Partial: OpenUser, Playwright agents, agent-browser (browser only), TestSprite (functional API tests).

## Three biggest gaps

1. No task-based tool closes the loop between "task failed" and "here is why", and none plugs into CI. Analytics tools auto-detect frustration without tasks; task tools verify by URL or path and hand back a percentage and a recording; the only programmable path is Prolific plus your own page plus Playwright, or TestSprite's functional-only agent.
2. Small-n sense-making is unsolved below enterprise price. MUiQ ships inference at $59,980 a year; everyone self-serve reports raw rates and leaves a developer to guess whether two of five is a finding.
3. The affordable individual tier is eroding into "free self-recruit or enterprise". Maze Starter gone, Optimal free gone, UXtweak Business price withdrawn, three vendors absorbed. What remains under $50 a run is free self-recruit tiers, Userbrain's three testers, Prolific plus DIY hosting, Clarity for live traffic, and zero-dollar agent testers that cannot judge usability.
