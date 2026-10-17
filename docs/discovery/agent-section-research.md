# Agents use interfaces, too: the agent section

17 October 2026. Research for the landing's agent block, which the author found reads as "agents are synthetic users", with a brief for a visually distinct section. Sources: `docs/prd/04-agent-studies.md`, the current copy in `apps/web/lib/copy.ts`, the field, and the design corpus.

## 1. Why the current block reads as synthetic users

The heading "The same test, run by an agent", the lead's "instead of a person", and the denial "never counted with people and never described as people" all keep people in the reader's head and cast the agent as a substitute. The terminal prints the human report's vocabulary ("reached the outcome", "3 of 5"), so a pass^k capability result reads as a completion rate from a sample; it omits the "capability test, not usability" heading PRD 04 requires and gives no pass^k verdict (with the default `reliability: 'all'`, 3 of 5 is a fail). The block uses the same frame, layout and canvas as the human artefacts, and sits after the three people sections, so it reads as a fourth way to source people. The guide pairs "Run it with real people" with "Run it with an agent". The example also puts `target` on the goal, where the contract puts `actors` and `target` on the context, and omits `actors: ['agent']`.

PRD 04 already says the right thing: "a separate actor, never a stand-in for people … the only published comparison shows agents succeeding 0 to 25% of the time where humans succeed 62 to 95%", and "An agent failing on a website is a reason to look at the trace, not a usability finding." Discovery ranks "Prove an agent can use my CLI, MCP or API" as unserved by anyone.

## 2. The field

| Source | Framing or number |
|---|---|
| Biilmann, "Introducing AX" ([blog](https://biilmann.blog/articles/introducing-ax/)) | AX is "the holistic experience AI agents will have as the user of a product or platform"; agents as "a persona your team is building and developing for"; "collaborators and extensions of humans, rather than replacements" |
| Netlify AXIS ([blog](https://www.netlify.com/blog/how-we-measure-netlify-agent-experience)) | "Lighthouse, but for Agent Experience": a scenario plus a rubric scored 0–100 by an LLM judge, every tool call recorded. The closest comparator; we verify with an outcome hook and a pass^k check instead of a judge |
| Yang et al., SWE-agent ([arXiv 2405.15793](https://arxiv.org/abs/2405.15793)) | Agents "represent a new category of end users with their own needs and abilities"; the agent-computer interface took pass@1 to 12.5%; actions "simple and easy to understand for agents", compact informative feedback, guardrails |
| Anthropic, [building effective agents](https://www.anthropic.com/engineering/building-effective-agents), [writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | "invest just as much effort in creating good agent-computer interfaces as in HCI"; "Poka-yoke your tools"; "prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks" |
| llms.txt ([llmstxt.org](https://llmstxt.org/)), Vercel ([content negotiation](https://vercel.com/blog/making-agent-friendly-pages-with-content-negotiation)), Mintlify | "web pages are built for people"; agents are served markdown by `Accept` header and a curated index |
| τ-bench ([2406.12045](https://arxiv.org/abs/2406.12045)) | gpt-4o under 50% of tasks; pass^8 under 25% in retail: inconsistency across trials is where pass^k comes from |
| WebArena ([2307.13854](https://arxiv.org/abs/2307.13854)) | best agent 14.41% against 78.24% for humans |
| BFCL ([blog](https://gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard.html)), REST-API study ([2504.15546](https://arxiv.org/html/2504.15546)), CRITICTOOL ([2506.13977](https://arxiv.org/pdf/2506.13977)) | Failure types: wrong function, hallucinated parameter, missing required parameter, type and value mismatch, repeated invocation, a nonexistent tool, replies like "Bad request" that trap agents in loops; only 26% of cases error-free; 34% of tools passed 0–25% of tests |

Our two failing trials map onto that list: `POST /invites` that does not exist is a hallucinated endpoint, a docs and naming signal; the email in the query string with a bare 400 is an input error with an unreadable reply. Products that sell an agent angle (Stripe's agent toolkit, Stagehand, Browserbase, Apify) keep the agent as the subject of the verb and prove it with machine artefacts: code, a call log, timings, tokens. None says "instead of a person".

## 3. The corpus

- **Cooper, posture** (`P2_24_Cooper_About_Face.txt` ~10087, 10740): a product's posture is "how it presents itself to users"; a daemon's messages "must not confuse users or lead to misunderstandings". An API has a posture and its users are whoever reads its messages.
- **Norman** (`P4_Norman_Design_of_Everyday_Things.txt` 808, 952, 2699, 2719): affordances "provide strong clues"; "make things visible"; the gulf of execution ("Do the actions provided by the system match those intended") and of evaluation ("information about its state in a form that is easy to get, is easy to interpret"). `POST /invites` is a gulf of execution; a bare 400 is a gulf of evaluation; the agent's trace shows the developer both.
- **Tufte, small multiples** (`P4_Tufte_Envisioning_Information.txt` 10034): "Compared to what?"; "Constancy of design puts the emphasis on changes in data, not changes in data frames." Five trials are a small multiple never summed into a rate; a changed frame tells the reader the data is different in kind.
- **Krug** (`P4_Krug_Dont_Make_Me_Think.txt` 776, 1062, 1270): "Don't make me think!"; "self-explanatory"; "we satisfice". An agent satisfices too; the error message is its page, and "400 Bad Request" breaks the first law.
- **Lean UX, hypothesis statement** (`Lean_UX/atoms/lux-method-hypothesis-statement.yaml`): one persona per row. The agent run is its own hypothesis with its own falsifier, pass^5; the rule behind separate records.

## 4. The proposal

**Title:** "Agents use interfaces, too." (over "Your API has users who never see a pixel" and "Not every user has a cursor"). **Lead:** "Your API, your MCP server and your CLI have a second kind of user: an agent that reads your docs, calls your endpoints and reads what comes back. Point a test file at that surface, and five trials show whether an agent can get the job done, and the exact call where your interface lost it."

**The file**, contract-correct, `actors` and `target` on the context (the `api` fixture in the outcome hook needs confirming in PRD 04):

```ts
context({
  users: 'agents that manage Weekboard teams for their owners',
  purpose: 'add a person to a team without opening the app',
  actors: ['agent'],
  target: { http: 'https://api.weekboard.app' },
}, () => {
  goal('add a member through the API', { trials: 5 }, () => {
    outcome(async ({ api }) => {
      expect(await api.get('/members')).toContainEqual(expect.objectContaining({ email: 'sam@acme.co' }))
    })
  })
})
```

**The picture:** the terminal as a trace, "capability test, not usability" in the heading, "verified" instead of the human vocabulary, the failing trial expanded into its calls with the failing one marked, and the PRD's own verdict:

```
Agent run · capability test, not usability
add a member through the API · http · 5 trials · model and harness pinned
1  0:19  verified  POST /members 201, GET /members 200
2  0:22  verified
3  0:41  stopped   POST /invites 404: the agent guessed an endpoint your docs don't rule out
4  0:17  verified
5  0:35  stopped   POST /members?email=sam@acme.co 400
                   ↳ response body: "Bad Request"   ← the agent could not tell what to fix
pass^5  fail · 3 of 5 verified · 0 false successes
Check: ui-tests (agent) · Report: https://ui-tests.com/r/k2m9-agent
```

**Three sentences that keep it honest:** an agent is a second kind of user with its own interface, it reads text, not pixels; its runs are their own records under their own check, `ui-tests (agent)`, never added to anything people did; when an agent fails it is telling you about your docs, your error messages and the shape of your API, not about whether a person could do it.

**Visual distinction:** a full-bleed band on the dark alternate palette (`data-theme="dark"` on the section, no new colours), the heading in the mono face, the terminal without the window chrome the human artefacts share, a plain rule with the label "agent · http". Placed after the hosted section, before the commands, so the human story runs unbroken and the band reads as an intermission. Tufte's constancy rule is the reason: a changed palette, face and frame say "a different kind of user". The guide's steps become "Run it with people" and "Test your API with an agent".
