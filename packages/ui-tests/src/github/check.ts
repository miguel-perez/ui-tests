import type { RunRecord } from '../record/schema.ts'
import { buildRecord } from '../record/build.ts'
import { firstLookLines, groupLines } from '../record/summary.ts'
import { groupFigures, resultComplete, resultFigures, type GroupFigures } from '../runner/progress.ts'
import { primaryGoalIndex } from '../runner/sequence.ts'
import { signedUrl } from '../report/sign.ts'
import type { RunResult, RunRow, RunStore } from '../store/types.ts'
import type { UiTestsConfig } from '../types.ts'
import { sendWebhook, type WebhookOptions } from '../notify/webhook.ts'
import type { Delivered, GitHubClient, GitHubLink } from './types.ts'

/** A human run's check is `ui-tests`; an agent run posts its own, and the two are never merged into one (PRD 04). */
export const CHECK_NAMES = { human: 'ui-tests', agent: 'ui-tests (agent)' } as const
export const checkName = (actor: 'human' | 'agent') => CHECK_NAMES[actor]
export const AGENT_NEVER_FAILS = 'This check is informational and never fails your build. It is a capability test, not usability: an agent passing says nothing about people.'

export const COMMENT_MARKER = '<!-- ui-tests -->'
export const NEVER_FAILS = 'This check never fails your build. It reports problems, or that none were seen this time.'
export const FAILS_ON_PROBLEMS = 'This check fails your build when it finds problems. It reports problems, or that none were seen this time.'

type Finished = Exclude<RunResult, 'pending'>
export type Outcome = 'problems' | 'none' | 'inconclusive'
export const outcomeOf = (result: Finished): Outcome => result === 'problems-found' ? 'problems' : result === 'none-found' ? 'none' : 'inconclusive'

/** The merge-box title. `reached` of `n` people reached the goal; `attempted` of `n` attempts completed. Same wording as the landing's check (apps/web/lib/check.ts). */
export function checkTitle(input: { n: number; reached: number; attempted: number; problems: number; result: Finished; groups?: GroupFigures[] }): string {
  const { n, reached, attempted, problems, result, groups } = input
  // Several groups are counted each against its own quota, never pooled.
  if (groups && groups.length > 1) {
    const each = (count: (g: GroupFigures) => number) => groups.map(g => `${g.name} ${count(g)} of ${g.quota}`).join(', ')
    if (result === 'inconclusive') return `Inconclusive · only ${each(g => g.attempted)} attempts completed`
    if (result === 'none-found') return `No problems found · ${each(g => g.reached)} reached the goal`
    return `${problems} problem${problems === 1 ? '' : 's'} found · ${each(g => g.reached)} reached the goal`
  }
  if (result === 'inconclusive') return `Inconclusive · only ${attempted} of ${n} attempts completed`
  if (result === 'none-found') return `No problems found with ${n} people · ${reached} of ${n} reached the goal`
  return `${problems} problem${problems === 1 ? '' : 's'} found · ${reached} of ${n} people reached the goal`
}

/** `neutral` for everything, `failure` only for a run that found problems when the author asked to block on them. Never `success`. */
export function checkConclusion(result: Finished, blockOn?: 'problems'): 'neutral' | 'failure' {
  return result === 'problems-found' && blockOn === 'problems' ? 'failure' : 'neutral'
}

/** The numbers a title needs, read from the record: people counted toward n, and how many of them reached the outcome. */
export function figuresOf(record: RunRecord) {
  const complete = resultComplete({ states: record.handle.states, result: record.handle.result })
  const counted = record.attempts.map(a => ({ ...a, startedAt: a.timings.startedAt }))
  const { attempted, reached } = resultFigures(counted, primaryGoalIndex(record.compiled), complete)
  const groups = groupFigures(counted, record.compiled.groups ?? [], primaryGoalIndex(record.compiled), complete)
  const result = record.handle.result === 'pending' ? 'inconclusive' : record.handle.result
  const problems = result === 'problems-found' ? Math.max(record.issues.length, 1) : 0
  return { n: record.compiled.sample.n, reached, attempted, problems, result, ...(groups && { groups }) } as const
}

export const titleOf = (record: RunRecord) => checkTitle(figuresOf(record))

/** The title of an agent run's check: trials, not people. */
export function agentTitle(record: RunRecord): string {
  const trials = record.trials ?? []
  const verified = trials.filter(t => t.state === 'verified').length
  if (record.handle.result === 'inconclusive') return `Inconclusive · ${trials.filter(t => t.state === 'unknown').length} of ${trials.length} trials could not be read`
  return `${record.handle.result === 'none-found' ? 'Capability test passed' : 'Capability test failed'} · ${verified} of ${trials.length} trials verified`
}

/** The page of an agent run's check: its sentence, what the check promises, and one line per trial. */
/** Text in a Markdown table cell: a pipe or a line break would end the cell or the row. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ')

export function agentCheckPage(record: RunRecord): string {
  const rows = (record.trials ?? []).map(t => `| ${cell(record.compiled.goals[t.goalIndex]?.name ?? 'task')} | ${t.index} | ${t.state} | ${(t.wallMs / 1000).toFixed(1)} s | ${cell(t.stoppedBy ?? '')} |`)
  return [record.sentence, '', AGENT_NEVER_FAILS, '', '| Task | Trial | State | Time | What stopped it |', '| --- | --- | --- | --- | --- |', ...rows].join('\n')
}

const impactOrder = { blocked: 0, slowed: 1, confused: 2 } as const
const peopleOf = (issue: RunRecord['issues'][number]) => issue.participants.length
const rankedIssues = (record: RunRecord) =>
  record.issues.map((issue, i) => ({ issue, i })).sort((a, b) => impactOrder[a.issue.impact] - impactOrder[b.issue.impact] || peopleOf(b.issue) - peopleOf(a.issue) || a.i - b.i).map(e => e.issue)
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The signed links into a run's report, under the run's own target. Without the share secret there are none. */
export type ReportLinks = { report: string; attempt(n: number, at?: number): string }
export function reportLinks(run: Pick<RunRow, 'run' | 'target'>, secret: string | undefined): ReportLinks | undefined {
  if (!secret) return undefined
  const base = run.target.replace(/\/+$/, '')
  return {
    report: `${base}${signedUrl(`/r/${run.run}`, secret)}`,
    attempt: (n, at) => `${base}${signedUrl(`/r/${run.run}/p${n}`, secret)}${at === undefined ? '' : `&at=${at}`}`,
  }
}

export type PageOptions = { blockOn?: 'problems'; links?: ReportLinks }

function problemLines(record: RunRecord, issues: RunRecord['issues'], links: ReportLinks | undefined, start: number): string[] {
  return issues.flatMap((issue, k) => {
    const moment = issue.moments[0]
    const n = moment ? record.attempts.findIndex(a => a.id === moment.attempt) + 1 : 0
    const watch = links && moment && n > 0 ? ` · [Watch the moment](${links.attempt(n, moment.at)})` : ''
    const where = `${issue.where.page}${issue.where.element ? `, ${issue.where.element}` : ''}`
    return [`${start + k}. **${issue.title}**`, `   ${where} · ${issue.count} people · ${cap(issue.impact)}${watch}`]
  })
}

function footerOf(record: RunRecord): string {
  const counted = record.attempts.filter(a => !a.rehearsal && a.timings.startedAt)
  const people = new Set(counted.map(a => a.participant)).size
  const ended = counted.map(a => a.timings.endedAt ?? a.timings.startedAt!).sort().at(-1)
  const { build } = record.handle
  return [
    `${people} ${people === 1 ? 'person' : 'people'} from a link`, `ran on ${build.url}`, `commit ${build.commit.slice(0, 7)}`, ended ? ended.slice(0, 10) : undefined,
  ].filter(Boolean).join(' · ')
}

/** The check's page (Markdown, no images): the sentence, what the check promises, three problems, report links, a footer, and the rest folded away. */
export function checkPage(record: RunRecord, options: PageOptions = {}): string {
  const { links } = options
  const issues = rankedIssues(record)
  const top = issues.slice(0, 3)
  const rest = issues.slice(3)
  const out = [record.sentence, '', options.blockOn === 'problems' ? FAILS_ON_PROBLEMS : NEVER_FAILS]
  if (top.length) out.push('', '### Problems, most serious first', '', ...problemLines(record, top, links, 1))
  if (links) out.push('', `[Full report](${links.report})`)
  out.push('', `<sub>${footerOf(record)}</sub>`)
  const folded = [
    ...(rest.length ? ['#### More problems', '', ...problemLines(record, rest, links, 4), ''] : []),
    record.compiled.sample.sentence, ...[...groupLines(record), ...firstLookLines(record)].flatMap(line => ['', line]),
  ]
  out.push('', '<details>', '<summary>The rest</summary>', '', ...folded, '', '</details>')
  return out.join('\n')
}

/** The sticky comment: 3 to 5 lines, replaced in place when the outcome changes. */
export function stickyComment(record: RunRecord, options: PageOptions = {}): string {
  const top = rankedIssues(record)[0]
  return [
    COMMENT_MARKER,
    `**${titleOf(record)}**`,
    record.sentence,
    ...(top ? [`Most serious: ${top.title} (${top.where.page}).`] : []),
    ...(options.links ? [`[Full report](${options.links.report})`] : []),
  ].join('\n')
}

/** What the pending check says: who is wanted, the estimate, and when it closes. */
export function pendingSummary(run: RunRow, options: PageOptions = {}): { title: string; summary: string } {
  const { compiled } = run
  const seconds = compiled.goals.reduce((total, goal) => total + goal.timeout.seconds, 0)
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  const n = compiled.sample.n
  const several = (compiled.groups ?? []).length > 1 ? ` (${compiled.groups.map(g => `${g.name} ${g.quota}`).join(', ')})` : ''
  return {
    title: `Waiting for ${n} ${n === 1 ? 'person' : 'people'}${several}`,
    summary: [
      compiled.sample.sentence,
      `Estimate: ${n} ${n === 1 ? 'person' : 'people'}, up to ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} each. The run closes at ${run.deadline} at the latest.`,
      options.blockOn === 'problems' ? FAILS_ON_PROBLEMS : NEVER_FAILS,
      ...(options.links ? [`[Report](${options.links.report})`] : []),
    ].join('\n\n'),
  }
}

/** Applies `change` to the stored run, retrying when the run moved underneath; throws when it keeps moving. */
async function patchRun(store: RunStore, id: string, change: (run: RunRow) => Partial<RunRow>): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    const run = await store.getRun(id)
    if (!run) return
    if (await store.updateRun(id, change(run), run.revision)) return
  }
  throw new Error(`run ${id} kept changing; the update was not stored`)
}
const markDelivered = (store: RunStore, id: string, part: Delivered) => patchRun(store, id, run => ({ delivered: { ...(run.delivered as Delivered | undefined), ...part } }))

/** What the run's current result still owes the outside: its check, its sticky comment, its webhook. Each is tracked on its own. */
export function owedDeliveries(run: RunRow, config: UiTestsConfig): { check: boolean; comment: boolean; webhook: boolean } {
  if (run.result === 'pending' || run.rehearsal) return { check: false, comment: false, webhook: false }
  const link = run.github as GitHubLink | undefined
  const done = (run.delivered ?? {}) as Delivered
  return {
    check: Boolean(link?.checkId) && done.check !== run.result,
    // An agent run has no sticky comment: its check is its own and says nothing a person would act on.
    comment: run.actor !== 'agent' && Boolean(link?.checkId) && config.check?.comment !== false && done.comment !== outcomeOf(run.result),
    webhook: Boolean(config.webhook?.url) && done.webhook !== run.result,
  }
}

export type DeliverInput = {
  store: RunStore
  run: RunRow
  config: UiTestsConfig
  github?: GitHubClient
  shareSecret?: string
  webhook?: WebhookOptions
}

/**
 * Tells the outside that a run has a result: completes its check, updates the sticky comment when the outcome changed, and calls
 * the webhook. Each is done once for a result (what was told is kept on the run), so calling this again is safe. Returns the failures.
 */
export async function deliverResult(input: DeliverInput): Promise<string[]> {
  const { store, run, config, github } = input
  if (run.result === 'pending' || run.rehearsal) return []
  const result: Finished = run.result
  const link = run.github as GitHubLink | undefined
  const done = (run.delivered ?? {}) as Delivered
  const outcome = outcomeOf(result)
  const owed = owedDeliveries(run, config)
  const wantCheck = Boolean(github && link?.checkId && owed.check)
  const wantComment = Boolean(github && link?.checkId && owed.comment)
  const wantWebhook = owed.webhook
  if (!wantCheck && !wantComment && !wantWebhook) return []

  const failures: string[] = []
  const record = await buildRecord(store, run.run, { ...(config.participants?.budget?.currency && { currency: config.participants.budget.currency }) })
  const options: PageOptions = { ...(config.check?.block_on && { blockOn: config.check.block_on }), ...(reportLinks(run, input.shareSecret) && { links: reportLinks(run, input.shareSecret)! }) }
  const attempt = async (what: string, step: () => Promise<Delivered>) => {
    try { await markDelivered(store, run.run, await step()) } catch (error) { failures.push(`${what}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  if (wantCheck) await attempt('check', async () => {
    await github!.updateCheck(link!.checkId!, {
      owner: link!.owner, repo: link!.repo, status: 'completed',
      ...(run.actor === 'agent'
        ? { conclusion: 'neutral' as const, title: agentTitle(record), summary: record.sentence, text: agentCheckPage(record) }
        : { conclusion: checkConclusion(result, config.check?.block_on), title: titleOf(record), summary: record.sentence, text: checkPage(record, options), ...(options.links && { detailsUrl: options.links.report }) }),
    })
    return { check: result }
  })
  if (wantComment) await attempt('comment', async () => {
    await github!.upsertComment({ owner: link!.owner, repo: link!.repo, pr: link!.pr, marker: COMMENT_MARKER, body: stickyComment(record, options) })
    return { comment: outcome }
  })
  if (wantWebhook) await attempt('webhook', async () => {
    await sendWebhook(record, config.webhook, input.webhook)
    return { webhook: result }
  })
  return failures
}

export { patchRun }
