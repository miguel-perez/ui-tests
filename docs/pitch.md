# ui-tests: the pitch

The frame every other document references.

## One line

Usability testing that runs like your unit tests: see where people get stuck on what you just shipped. Say who your users are, what they are trying to do, and how you would know they did it. It recruits the people, runs it, and reports the problems they hit, with the moment to watch, their words and what to change.

## What

An open-source test runner for the rung your tests don't cover. You write a `*.ui.test.ts` that names who the users are and what they are trying to do, then a goal and an `outcome` on the end state, the same hook you would write in Playwright, with a happy path if you have one and steps when the route is the requirement. One command runs it against your preview URL, brings participants, pays them by a formula grounded in published rates, records the attempts, verifies the outcome in the runner, and reports the problems people hit, ranked and in their words, with a sentence that says what the numbers can and cannot support.

It measures usability the way ISO 9241-11 defines it, effectiveness, efficiency and satisfaction for specified users and goals in a specified context of use, and reads the rung above: whether these users need and recognise the purpose. Every run exports a record that is evidence for the clauses of ISO 9241-210 that need people.

Participants come from your own link, from a panel with your key (Prolific, CloudResearch Connect), and, on the hosted track, from your own site's visitors invited when they struggle.

The same test file can be run by a second actor, an agent, to prove an agent can do the thing against a CLI, an MCP server, an API, or a website. A run has one actor, agent runs get their own records, checks and reports, and they are never counted with, or described as, human studies.

A run is an asynchronous node. It returns a durable handle and completes by webhook or poll, so a DAG, a delivery factory, or a GEPA harness can await it. The package ships a skill and an MCP server so an agent can write, run and read a context the same way a person does. GEPA itself lives outside this repository.

## Who

Grounded in [`personas.md`](personas.md), derived from 124 public first-person accounts in [`discovery/report.md`](discovery/report.md).

- **The developer who tests code, not experience.** Has unit and end-to-end tests and no researcher. "QA and unit tests tell me whether the code works but not whether the experience makes sense." Wants the real-user check as a stage, and a method rather than a coffee-shop anecdote. The primary author and the chooser.
- **The builder who launched to find out.** Ships early because launching is the only test they can run; discounts friends' excitement and surveys; has been burnt building on assumptions. Their question is whether visitors understand what the thing is and whether anyone wants it, which the first look and launch-and-learn with issues serve, and which an outcome hook alone does not.
- **The lone UX person without a researcher, budget or backing.** Knows testing matters, carries it alone, is priced out of company tools, and needs evidence for a room that does not care. Reached through the hosted install-once track, not the runner.
- **Participants**, who get a clear task, a fair rate, and nothing to install.
- **Agents under test**, for authors who need to prove an agent can use their CLI, MCP server or API. Never counted with people.

First customer is us: n = 1 is enough to build it.

## Why

A product can be functional and not usable, usable and not wanted, wanted and forgettable. Your tests prove the first rung and your monitoring the second. Nothing in a developer's pipeline proves the third, and the people who could, researchers, are not in the room. The off-the-shelf market, reviewed in [`discovery/tool-alignment.md`](discovery/tool-alignment.md), splits four ways: analytics tools detect rage clicks on live traffic but have no goals; task tools verify by URL or path and hand back a percentage and a recording to watch; the one tool that ships statistical meaning costs sixty thousand dollars a year; and the agents that live in CI test function, not people. Nothing runs a goal, says why people failed, says what five people can and cannot tell you, reports it to the pull request, and leaves behind the evidence a standard asks for. That combination is the product.

Your tests prove it works and keeps working. ui-tests proves people can use it, to the ISO 9241 definition, from the same pipeline, and tells you whether they want it before you polish it. One file, one command, a record you can hand to an auditor or a factory.

## What users will do to get value

1. Install the package, run `npx ui-tests init`, add the script tag it prints to their app, whatever it is built with, and change the study it writes to their own site.
2. Run it on themselves in dev mode, which starts the ui-tests server on their machine. For real people they run the server themselves, `npx ui-tests serve` or the Docker image, while the study is open.
3. Share a link with five people from their audience, or add a panel key and a cap. Put `npx ui-tests check` in the job that deploys the preview: one run per pull request, within the cap.
4. Read who took part, the problems and the sentence. Fix the UI, or the purpose. Re-run.

## Riskiest assumption and how we test it

That a developer without a researcher can understand the promise and get to a first result without help. The want is real and repeated in the accounts: 32 of 124 describe the moment of watching someone use their thing and seeing what they could not see alone, and 26 turn to a forum because they have no reference to lean on. The accounts cannot show whether this product is the thing they reach for. The website is the false door and the first test subject:

1. I can understand it and do it myself.
2. We run the landing context with five people from our audience and see whether they understand the value proposition and start.
3. The repository is public while it is a work in progress, with a README that carries the same promise and the same example. Stars, views and clones are a second, cheaper door: not a verdict, a line in the report we read beside the run.

This does not test traction. That is fine.

## Success metrics

- Time from install to first result for a new author.
- Problems surfaced per run that the author acts on.
- Cost per verified attempt with a panel: from $12 a person, from $60 for five.
- Our own site: visitors understand what it is for and start.

## Defaults

- **CI**: one run per pull request, a neutral check that is never red or green and never fails the build; `check: { block_on: 'problems' }` in the config is the one opt-in that makes it red when a completed run finds problems; it is never green. A push during the run starts nothing new, and never pays participants again.
- **Sample size**: no modes. A goal states the smallest problem occurrence it wants to catch and the confidence it wants of seeing it; the runner derives n (problems hitting one in three users at 85% confidence gives five). The sentence states what the number supports.
- **Results**: a run reports the problems it found, or that it found none this time; there is no score and no pass. Findings are reported at the level they belong to: the UI, the goal, or the context.
- **Success**: defined by the author's hooks, run in the runner, never in the app under test. A participant's own judgement is recorded as data.
- **Review**: the trace is auditable. Generated scenario wording can be edited before launch. Exclusions and incentive adjustments are recorded as revisions.
- **White label**: everything a participant sees carries the author's name, logo, colours and font; no ui-tests mark appears to participants.
- **Participants**: a person who is not the audience is excluded with one click and still paid. Accommodation is never a quality flag. The incentive formula is a floor; pay only goes up from it, except for people the author brings themselves.

## Non-goals

Figma prototypes, mobile native, moderated sessions, comparisons between builds, synthetic users as stand-ins for people, think-aloud recording, GEPA itself, framework adapters or plugins: one script tag serves every framework.
