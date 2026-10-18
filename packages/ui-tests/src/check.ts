import { impacts, ranked, legendLine, type Impact } from './rank.ts'
export { impacts, ranked, legend, legendLine, caveat, problemsLine, type Impact } from './rank.ts'

/**
 * The pull-request check (docs/discovery/pull-request-surfaces-research.md, section 3). One check run named `ui-tests` on the
 * commit, `neutral` for all three outcomes so it never blocks a merge, even when a team marks it required; `failure` only when the
 * author opts in with `block_on: problems` and problems were found. The page GitHub shows is `output.summary`: the sentence, the
 * three problems to fix first with a link to the moment, the links and a footer; the rest go in `output.text` inside `<details>`.
 * No annotations (problems are on pages, not lines, and GitHub cannot clear old ones) and no images. One sticky comment of three
 * to five lines, updated in place and posted only when the outcome changes, unless the author turns it off.
 * The self-hosted track calls `publishCheck` with the job's `GITHUB_TOKEN` (`checks: write`, `pull-requests: write` when the sticky comment is on); a GitHub
 * App on the author's own deploy (`ui-tests host`) calls the same function with its installation token.
 */

/**
 * `check` in CI (issue #68): the landing and the guide put `npx ui-tests check` in the preview job, starting one run per pull request
 * under the config's cap. Today it publishes the check from a run summary you pass it; starting the run itself is issue #69, and the
 * guide says so in one line until then, as `host` does with #59.
 */
export { checkIssue, checkCaveat } from './slice.ts'

/** One problem as the check shows it: the sentence about the design, the page and element, how many people, the impact and the moment to watch. */
export type CheckProblem = { title: string; page: string; locator: string; people: number; impact: Impact; moment?: { person: number; seconds: number; url: string } }
/** What one run says to the pull request. `attempted` below `people` makes it inconclusive. */
export type CheckRun = {
  goal: string; people: number; attempted: number; reached: number
  /** On a goal with a check: pressed Done, but the check failed. */
  pressedDoneFailed?: number
  problems: CheckProblem[]
  /** The report page: the check's Details link. Each problem's moment links into it. */
  reportUrl: string
  /** The footer line: who took part, where it ran, the commit and the date. */
  footer: { people: string; preview: string; commit: string; date: string }
}
/** The author's settings for the check: `block_on: problems` sends `failure` when problems are found; `comment: false` turns the sticky comment off. */
export type CheckOptions = { block_on?: 'problems'; comment?: boolean }
export type Outcome = 'problems' | 'none' | 'inconclusive'
export type Conclusion = 'neutral' | 'failure'

export const checkName = 'ui-tests'
/** The marker that finds the sticky comment again and remembers the outcome it reported. */
export const stickyMarker = '<!-- ui-tests:sticky'
const top = 3

/** Inconclusive when fewer attempts completed than the run asked for; otherwise problems, or none. */
export function outcomeOf(run: CheckRun): Outcome {
  if (run.attempted < run.people) return 'inconclusive'
  return run.problems.length ? 'problems' : 'none'
}
/** `output.title`, one line in the merge box. */
export function checkTitle(run: CheckRun) {
  const outcome = outcomeOf(run), n = run.problems.length
  if (outcome === 'inconclusive') return `Inconclusive · only ${run.attempted} of ${run.people} attempts completed`
  if (outcome === 'none') return `No problems found with ${run.people} people · ${run.reached} of ${run.people} reached the goal`
  return `${n} problem${n === 1 ? '' : 's'} found · ${run.reached} of ${run.people} people reached the goal`
}
/** Neutral for every outcome; failure only with `block_on: problems` and problems found. */
export function checkConclusion(run: CheckRun, options: CheckOptions = {}): Conclusion {
  return options.block_on === 'problems' && outcomeOf(run) === 'problems' ? 'failure' : 'neutral'
}

/** 00:58, as on a recording. */
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const capital = (word: string) => word[0].toUpperCase() + word.slice(1)
/** A table cell: no pipe or line break may end the cell early. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')
const code = (text: string) => `\`${text.replace(/`/g, "'")}\``
/** Markdown link text: brackets would close the link early. */
const label = (text: string) => text.replace(/[[\]]/g, '')

/** The run's sentence: who tried what, how many reached it, and on a checked goal how many pressed Done though the check failed. */
export function checkSentence(run: CheckRun) {
  const tried = `${run.people} people tried *${run.goal}* on this preview.`
  if (outcomeOf(run) === 'inconclusive') return `${run.people} people were asked to try *${run.goal}* on this preview. Not enough attempts yet: ${run.attempted} of ${run.people} in.`
  const failed = run.pressedDoneFailed ? `; ${run.pressedDoneFailed} of ${run.people} pressed Done, but your check failed` : ''
  return `${tried} ${run.reached} of ${run.people} reached the goal${failed}.`
}
/** What the check promises about the build, which `block_on` changes. */
export function buildLine(options: CheckOptions = {}) {
  return options.block_on === 'problems'
    ? 'This check fails your build when it finds problems (`block_on: problems`). It reports problems, or that none were seen this time.'
    : 'This check never fails your build. It reports problems, or that none were seen this time.'
}
/** The table of problems: rank, the problem, where as page and element, people, impact, and the moment as a link. */
function table(run: CheckRun, rows: CheckProblem[], from: number) {
  return ['| # | Problem | Where | People | Impact | Moment |', '| --- | --- | --- | --- | --- | --- |', ...rows.map((problem, index) =>
    `| ${from + index + 1} | ${cell(problem.title)} | ${code(problem.page)} · ${code(problem.locator)} | ${problem.people} of ${run.people} | ${capital(problem.impact)} | ${problem.moment ? `[Person ${problem.moment.person} · ${clock(problem.moment.seconds)}](${problem.moment.url})` : ''} |`)].join('\n')
}
/** `output.summary`: the check's own page on GitHub, about one screen, no pictures. */
export function checkSummary(run: CheckRun, options: CheckOptions = {}) {
  const problems = ranked(run.problems), rest = problems.length - top
  const links = [`[Open the report](${run.reportUrl})`]
  if (rest > 0) links.push(`[+${rest} more problem${rest === 1 ? '' : 's'}](${run.reportUrl}#problem-${top + 1})`)
  if (outcomeOf(run) !== 'inconclusive') links.push(`[What worked](${run.reportUrl}#worked)`)
  const footer = [run.footer.people, run.footer.preview, run.footer.commit, run.footer.date].filter(Boolean).join(' · ')
  return [
    `${checkSentence(run)} ${buildLine(options)}`,
    ...(problems.length ? [table(run, problems.slice(0, top), 0), legendLine] : outcomeOf(run) === 'none' ? ['No problems were seen this time.'] : []),
    links.join(' · '),
    `<sub>${footer}</sub>`,
  ].join('\n\n')
}
/** `output.text`: the problems after the first three, folded; nothing when there are none. */
export function checkText(run: CheckRun) {
  const problems = ranked(run.problems), rest = problems.slice(top)
  if (!rest.length) return undefined
  return `<details><summary>${rest.length} more problem${rest.length === 1 ? '' : 's'}</summary>\n\n${table(run, rest, top)}\n\n</details>`
}
/**
 * The body of `POST /repos/{owner}/{repo}/check-runs`: completed, with the Details link to the report, no annotations and no images.
 * GitHub keeps `details_url` for an App's installation token; a check created with an Actions `GITHUB_TOKEN` gets its Details link
 * pointed at the check's own page instead, so the summary also carries "Open the report".
 */
export function checkRunPayload(run: CheckRun, headSha: string, options: CheckOptions = {}) {
  const text = checkText(run)
  return {
    name: checkName, head_sha: headSha, status: 'completed' as const, conclusion: checkConclusion(run, options), details_url: run.reportUrl,
    output: { title: checkTitle(run), summary: checkSummary(run, options), ...(text ? { text } : {}) },
  }
}
/** The sticky comment: the hidden marker with the outcome, then three lines: the title, the worst problem or the state, the report. */
export function stickyComment(run: CheckRun) {
  const outcome = outcomeOf(run), worst = ranked(run.problems)[0]
  const middle = outcome === 'inconclusive' ? `Not enough attempts yet: ${run.attempted} of ${run.people} in.`
    : worst ? `Fix first: ${worst.title} (${capital(worst.impact)}, ${worst.people} of ${run.people}, ${code(worst.page)} · ${code(worst.locator)})`
    : 'No problems were seen this time.'
  return [`${stickyMarker} outcome=${outcome} -->`, `**${checkName}** · ${checkTitle(run)}`, middle, `[Open the report](${run.reportUrl})`].join('\n')
}
/** The outcome a sticky comment last reported, read from its marker. */
export function stickyOutcome(body: string): Outcome | undefined {
  return /<!-- ui-tests:sticky outcome=(problems|none|inconclusive) -->/.exec(body)?.[1] as Outcome | undefined
}

/** A run summary read from JSON: every field the check needs, or an error naming the first one missing. */
export function parseCheckRun(value: unknown): CheckRun {
  const run = value as CheckRun
  const count = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= run.people
  const text = (s: unknown) => typeof s === 'string' && s.length > 0
  // The report and moment URLs go inside Markdown links: HTTP(S), no whitespace and no `)` that would close the link early.
  const link = (s: unknown) => typeof s === 'string' && /^https?:\/\/[^\s()]+$/.test(s)
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('Invalid run: not an object')
  if (!text(run.goal) || !Number.isInteger(run.people) || run.people < 1) throw new Error('Invalid run: goal and people')
  if (!count(run.attempted) || !count(run.reached) || (run.pressedDoneFailed !== undefined && !count(run.pressedDoneFailed)) || run.reached + (run.pressedDoneFailed ?? 0) > run.attempted) throw new Error('Invalid run: counts')
  if (!link(run.reportUrl)) throw new Error('Invalid run: reportUrl')
  if (!run.footer || typeof run.footer !== 'object' || !text(run.footer.people) || !text(run.footer.preview) || !text(run.footer.commit) || !text(run.footer.date)) throw new Error('Invalid run: footer')
  if (!Array.isArray(run.problems) || run.problems.some(p => !p || typeof p !== 'object' || !text(p.title) || !text(p.page) || !text(p.locator) || !Number.isInteger(p.people) || p.people < 1 || p.people > run.people || !impacts.includes(p.impact)
    || (p.moment !== undefined && (!Number.isInteger(p.moment.person) || !Number.isInteger(p.moment.seconds) || !link(p.moment.url))))) throw new Error('Invalid run: problems')
  return run
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
export type PublishInput = {
  token: string; repository: string; headSha: string; pullRequest?: number; run: CheckRun; options?: CheckOptions
  fetch?: Fetch; api?: string
}
export type Published = { checkRun: { id?: number; html_url?: string }; comment: 'created' | 'updated' | 'unchanged' | 'off' | 'no pull request' }

/**
 * Creates the `ui-tests` check run on the commit, then keeps one sticky comment on the pull request: created the first time,
 * updated in place when the outcome changes, left alone when it has not, and never posted when `comment: false`.
 */
export async function publishCheck({ token, repository, headSha, pullRequest, run, options = {}, fetch = globalThis.fetch as unknown as Fetch, api = 'https://api.github.com' }: PublishInput): Promise<Published> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error(`Invalid repository: ${repository}`)
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'ui-tests' }
  async function call(method: string, path: string, body?: unknown) {
    const response = await fetch(`${api}/repos/${repository}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) throw new Error(`GitHub ${method} ${path} answered ${response.status}`)
    return response.json()
  }
  const checkRun = await call('POST', '/check-runs', checkRunPayload(run, headSha, options)) as Published['checkRun']
  if (options.comment === false) return { checkRun, comment: 'off' }
  if (!pullRequest) return { checkRun, comment: 'no pull request' }
  const body = stickyComment(run)
  let found: { id: number; body?: string } | undefined
  for (let page = 1; !found; page++) {
    const comments = await call('GET', `/issues/${pullRequest}/comments?per_page=100&page=${page}`) as { id: number; body?: string }[]
    found = comments.find(comment => comment.body?.includes(stickyMarker))
    if (comments.length < 100) break
  }
  if (!found) { await call('POST', `/issues/${pullRequest}/comments`, { body }); return { checkRun, comment: 'created' } }
  if (stickyOutcome(found.body ?? '') === outcomeOf(run)) return { checkRun, comment: 'unchanged' }
  await call('PATCH', `/issues/comments/${found.id}`, { body })
  return { checkRun, comment: 'updated' }
}
