# Screener research: how a `users` definition becomes a screener

The doubt: "the user definition doesn't feel right.. how would we infer how to screen participants?" The contract takes `users` as one sentence and promises a derived screener of one behavioural question, panel filters, three fit questions and three persona-placement questions. This note checks that against how practitioners and panels screen, then proposes a shape.

## Part 1: how screeners are built in practice

**NN/g, [Screening Participants](https://www.nngroup.com/articles/screening-participants/).** Screen only for criteria that would change the findings. Ask about past behaviour, never intent. No yes/no questions: "Do you shop at Amazon?" is guessable; ask "How many times have you shopped online in the past month?" with `0 (reject)`, `1-5 (proceed)`, then a multi-select of shops where Amazon is `must select` and "None of the above" rejects. Funnel: broad question first, revealing one last, so the purpose cannot be read off the screener. For interface tests "we often exclude people working in UX, marketing, or IT". Recruit people who regularly use the device under test. Avoid professional testers and repeats. Pilot it on two colleagues ([recruiting report](https://media.nngroup.com/media/reports/free/How_To_Recruit_Participants_for_Usability_Studies.pdf)).

**MeasuringU, [branding survey](https://measuringu.com/branding-survey/), [finding users](https://measuringu.com/finding-users/).** Qualifying questions are recency windows ("bought a car in the last 6 months", "booked a ticket online in the last year"). Demographics last unless they screen. Length is the biggest predictor of drop-out. Add cheater and speeder items.

**User Interviews, [Screener Surveys](https://www.userinterviews.com/ux-research-field-guide-chapter/screener-surveys).** Ten questions or fewer. Behaviour before demographics. Every answer labelled `Accept` or `Reject`; the example has one accept option among reject distractors plus "I don't know / None of the above". Must-haves first. Buckets non-overlapping (0-3, 4-7). Define "often". Recency as "When was the last time you {task}?" from today to never. Never name the product or the target ("social media habits", not "photo editing"). One open articulation question catches professional participants.

**UserTesting, [best practices](https://help.usertesting.com/hc/articles/11880418598557), [blog](https://www.usertesting.com/blog/screener-questions/).** Three to five questions. Always an escape option. Options distinct. Split double-barrelled questions. Age, gender, income, country and device are built-in filters, not questions. Each extra question screens out more of the people you wanted. Verify fit in the first task. Occupation as broad category then a narrowing follow-up.

**Respondent, [screener overview](https://developers.respondent.io/docs/Screener-responses/screener-overview).** Five to ten questions (two minimum, forty maximum). Answers carry `qualify`, `disqualify`, and for checkboxes `may select` or `must select` combined by `matchType: all | any`; skip logic routes to a later question or the end. Profile data covers only general demographics and current employment.

**Great Question, [screener guide](https://www.greatquestion.com/ux-research/screener-survey-guide).** Recency bands (week, month, 1-6 months, 6-12, more), frequency bands (weekly or more, monthly, quarterly, annually, never), tenure, self-rated experience. One red herring with a clearly correct answer and plausible distractors; wrong answer disqualifies. At least one question per criterion and one open question. Gate first, detail after.

**Lyssna, [screener questions](https://www.lyssna.com/blog/ux-screener-questions/); Userlytics, [11 practices](https://www.userlytics.com/helpcenter/clients/best-practices-for-creating-effective-screener-questions/); Askable, [mistakes](https://www.askable.com/blog/common-mistakes-when-writing-screener-questions-for-ux-and-market-research); Sago, [screeners](https://sago.com/en/resources/blog/its-time-to-change-the-way-we-write-screeners/); EphMRA, [screener guide](https://www.ephmra.org/sites/default/files/2022-10/Screener%20Design%20and%20Best%20Practice_Final%20version%20-%20Sept%2022.pdf).** Concrete counts over vague words; a decoy in a tool list; describe the study in category terms; replace "Do you own a smartwatch?" with "Which devices do you use regularly?"; "Have you used Product X in the past 30 days?" is too specific, ask about the category; drop-off spikes after question twelve; terminates and quotas first; do not re-ask what the panel holds; a security question (does not work in market research, marketing or advertising) and a past-participation window.

**The recurring structure.** Three to seven questions: panel-held demographics not asked; a gate on category behaviour with recency bands; a frequency or role narrowing question; a multi-select (tools, devices) with a decoy and "None of the above"; an exclusion (profession, past participation, current customer); optionally one open question. Every option labelled accept, reject or may-select; the first task re-verifies fit.

## Part 2: how panels express criteria in code

**Prolific.** [Filters](https://researcher-help.prolific.com/en/articles/445159-how-do-i-use-prolific-s-filters): several hundred attributes, self-reported except age and country (verified) and approval rate, join date, previous-study exclusion (platform data). Categories: sex, age, nationality, residence, languages, ethnicity, employment status and industry, student status, affiliations, socioeconomic status. The [API](https://docs.prolific.com/api-reference/filters/filters-overview) lists filters with `type` and `data_type`; a study takes a `filters` array or `filter_set_id`:

```json
{ "filter_id": "handedness", "selected_values": ["0", "1"] }
{ "filter_id": "age", "selected_range": { "lower": 18, "upper": 50 } }
```

Values are choice keys; values within a filter are OR, filters AND; [advanced filtering](https://docs.prolific.com/api-reference/filters/advanced-filtering) nests `{ "filter_id": "or" | "and", "selected_filters": [...] }` plus `participant_group_allowlist`, `previous_studies_allowlist`, `approval_rate`. Anything else is [custom screening](https://researcher-help.prolific.com/en/articles/445155-how-to-use-custom-screening-to-recruit-specific-participants): questions at the start of the study, vague wording, capped screen-out slots, every screened-out person paid a fixed reward (minimum $0.14). Other [in-study screening](https://researcher-help.prolific.com/en/articles/445165-can-i-screen-participants-within-my-study) is limited to prescreener validation in Prolific's wording, declared device checks, policy-compliant attention checks and consent; rejecting for a prescreen mismatch is prohibited.

**CloudResearch Connect.** 120 to 250 profiled [qualifying questions](https://www.cloudresearch.com/cloudresearch-connect-faqs) (demographics, behaviour, lifestyle), US-only, 18+, census matching, quotas. [In-survey screening is not allowed](https://connect-researcher-help.cloudresearch.com/hc/en-us/articles/21150663594900) for anything Connect does not profile; the routes are requesting a new demographic (reviewed weekly), completion branches with partial pay, or a paid prescreen project then a targeted follow-up. The [API](https://connect-api.cloudresearch.com/docs/index.html) exposes projects, trusted-participant groups and launch; its public pages do not document targeting fields.

**Consequence.** Code can specify country, language, age, employment, industry, prior-study exclusion, allowlists, approval rate. Everything behavioural (did X, within Y, uses Z, not a UX professional) is a question the participant answers: paid on Prolific, and on Connect only through a prescreen project.

## Part 3: proposal

The sentence is right as a name and wrong as a source: "developers who ship UI" names a group, but a screener needs a behaviour, a window and an exclusion, and no generator can read "paid for a team plan in the last three months" out of "small teams".

**(b) Typed predicates mapped to panel filters** make the developer learn Prolific's vocabulary, which Connect does not share and which covers only demographics; the criteria that matter are not filters. Rejected.

**(c) Persona reference** (`users: personas.accountant` in config) is reuse, not a shape; it needs the same fields underneath. Kept as composition: a persona is a named `Screen`.

**(a) Sentence plus a `screen` block**, recommended, because every field is a fact about the author's customers, not a research decision:

```ts
import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'small-business owners who pay for accounting software',
  purpose: 'give someone else read-only access to my books',
  screen: {
    did: 'paid for accounting software for your own business', // the gate: one verb phrase, category not product
    within: '3 months',                                          // recency window; default '3 months'
    often: 'monthly',                                            // optional frequency floor
    role: ['business owner', 'founder', 'office manager'],       // accept list; asked as broad category then role
    uses: ['QuickBooks', 'Xero', 'FreshBooks'],                  // may-select list; one decoy is added
    not: ['has used our product'],                               // always adds: works in UX, design, marketing or market research
    where: ['US', 'UK'], language: 'en', age: [18],              // panel filters where the source has them
  },
}, () => { /* goals */ })
```

Written: the sentence and any subset of `screen`; every field optional. Derived: the recency question with non-overlapping bands, `accept` on bands inside `within`; the frequency question with concrete bands, `accept` at or above `often`; the role question as broad categories with "None of the above" rejecting; the tools multi-select with a decoy and "None of the above"; the exclusion multi-select listing `not` items among neutral options, any listed item rejecting; a category-level study title; `where`, `language`, `age` as Prolific `filters` entries or Connect demographics, never re-asked; prior-participation as a panel filter; the fit questions from `purpose` as today. Order is the funnel: filters, gate, narrowing, tools, exclusion, fit. Asked by lint because it cannot be inferred: a `did` when the sentence has no behaviour verb (`users: 'accountants'` passes today's lint and yields no gate); a non-default `within`; whether `uses` is must-select.

**Shorthand.** `users` alone stays valid: the generator drafts a `screen` from the sentence, marks each field inferred, and `ui-tests lint` prints the draft as TypeScript to paste in, the same pin mechanism as `scenario`. The trace shows the screener as a table: question, options, each option's accept, reject or may-select label, the `screen` field it came from, the panel filter id and choice keys applied, and the source rule beside each row. Editing a row rewrites the pinned `screen`; a Prolific run lists screen-out slots and their reward as a budget line; a Connect run says the behavioural rows need a paid prescreen project and estimates it.

The developer fills facts (`did`, `within`, `uses`, `not`); the tool fills method (bands, decoys, order, labels, filter ids); the trace shows the derivation so a wrong inference is a one-line edit, not a surprise.
