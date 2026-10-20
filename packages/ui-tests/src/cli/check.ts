import { readFile } from 'node:fs/promises'
import { loadConfig } from '../config.ts'
import { owedDeliveries, patchRun, pendingSummary, reportLinks } from '../github/check.ts'
import type { GitHubClient, GitHubLink } from '../github/types.ts'
import { openStore } from '../store/open.ts'
import type { RunRow } from '../store/types.ts'
import type { UiTestsConfig } from '../types.ts'
import type { Command, Io } from './main.ts'
import { githubFor } from './outward.ts'
import { recruit } from './recruit.ts'
import { status } from './status.ts'
import { verify } from './verify.ts'

type Subject = { owner: string; repo: string; pr: number; headSha: string }

/** Whether the pull request's labels satisfy `ci.on`. Not set: every pull request. Each entry is `label:<name>`; one is enough. */
export function wanted(on: string[] | undefined, labels: string[]): boolean {
  if (!on) return true
  return on.some(entry => entry.startsWith('label:') && labels.includes(entry.slice('label:'.length)))
}

type Event = {
  repository?: { full_name?: string }
  pull_request?: { number: number; head: { sha: string }; labels?: { name: string }[] }
  deployment?: { sha: string }
  deployment_status?: { state?: string }
}

/** The pull request an event is about, or the reason there is none. A deployment event finds it through GitHub by the head commit. */
async function subjectOf(event: Event, io: Io, github: GitHubClient): Promise<{ subject: Subject; labels: string[] } | { skip: string }> {
  const [owner, repo] = (event.repository?.full_name ?? io.env.GITHUB_REPOSITORY ?? '').split('/')
  if (!owner || !repo) throw new Error('the repository is unknown; set GITHUB_REPOSITORY')
  if (event.pull_request) {
    const { number, head, labels } = event.pull_request
    return { subject: { owner, repo, pr: number, headSha: head.sha }, labels: (labels ?? []).map(l => l.name) }
  }
  if (event.deployment && event.deployment_status) {
    if (event.deployment_status.state !== 'success') return { skip: `the deployment is ${event.deployment_status.state ?? 'not successful'}` }
    const headSha = event.deployment.sha
    const [found] = await github.pullRequestsForCommit({ owner, repo, headSha })
    return found ? { subject: { owner, repo, pr: found.number, headSha }, labels: found.labels } : { skip: `no open pull request has ${headSha.slice(0, 7)} as its head` }
  }
  throw new Error('the event is neither a pull_request nor a deployment_status')
}

async function checkPullRequest(args: Parameters<Command>[0], io: Io): Promise<number> {
  const eventPath = io.env.GITHUB_EVENT_PATH
  if (!eventPath) { io.stderr.write('check: GITHUB_EVENT_PATH is not set; run it from GitHub Actions, or pass --reconcile\n'); return 2 }
  const github = githubFor(io)
  if (!github) { io.stderr.write('check: set GITHUB_TOKEN\n'); return 2 }
  const event = JSON.parse(await readFile(eventPath, 'utf8')) as Event
  const found = await subjectOf(event, io, github)
  if ('skip' in found) { io.stdout.write(`check: skipped, ${found.skip}\n`); return 0 }
  const { subject, labels } = found

  let config: UiTestsConfig
  try { config = (await loadConfig(io.cwd)).config } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  if (!wanted(config.ci?.on, labels)) { io.stdout.write(`check: skipped, pull request #${subject.pr} is not selected by ci.on\n`); return 0 }

  // The run is made (or found) by the same command people use; its key is the pull request's, so a new push finds the same run.
  const flags = new Map<string, string | true>([['json', true], ['pr', String(subject.pr)], ['commit', subject.headSha]])
  for (const name of ['actor', 'key', 'study']) { const value = args.flags.get(name); if (value !== undefined) flags.set(name, value) }
  let out = ''
  const code = await recruit({ positionals: [], flags }, { ...io, stdout: { write: text => (out += text) } })
  if (code !== 0) return code
  const handle = JSON.parse(out) as { run: string; actor: 'human' | 'agent' }

  const store = await openStore(io.env)
  try {
    const name = handle.actor === 'agent' ? 'ui-tests (agent)' : 'ui-tests'
    // Claim the run's check before making it: the claim is stored against the run's revision, so of two pushes racing, one wins.
    const claim: GitHubLink = { ...subject, checkId: null, name }
    let run: RunRow | undefined
    for (let tries = 0; tries < 5 && !run; tries++) {
      const current = (await store.getRun(handle.run))!
      if (current.github) { io.stdout.write(`check: ${current.run} already has its check\n`); return 0 }
      if (await store.updateRun(current.run, { github: claim }, current.revision)) run = current
    }
    if (!run) { io.stderr.write(`check: ${handle.run} kept changing; try again\n`); return 2 }
    const options = { ...(config.check?.block_on && { blockOn: config.check.block_on }), ...(reportLinks(run, io.env.UI_TESTS_SHARE_SECRET) && { links: reportLinks(run, io.env.UI_TESTS_SHARE_SECRET)! }) }
    const { title, summary } = pendingSummary(run, options)
    let id: number
    try {
      ;({ id } = await github.createCheck({ ...subject, name, status: 'in_progress', title, summary, ...(options.links && { detailsUrl: options.links.report }) }))
    } catch (error) {
      await patchRun(store, run.run, () => ({ github: undefined })) // nothing was made: let the next try claim again
      throw error
    }
    try { await patchRun(store, run.run, () => ({ github: { ...claim, checkId: id } satisfies GitHubLink })) } catch (error) {
      // The check exists but could not be recorded: say so on the check rather than leave it pending without an owner.
      await github.updateCheck(id, { ...subject, status: 'completed', conclusion: 'neutral', title: 'Could not be recorded', summary: 'The run was made but this check could not be linked to it. Push again to retry.' }).catch(() => undefined)
      throw error
    }
    io.stdout.write(`check: ${name} is pending for ${run.run}\n`)
    return 0
  } finally { await store.close() }
}

/** Runs `verify` then `status` for every run that still owes its check, comment or webhook something (or is waiting for a result); each of them delivers. One run failing does not stop the rest. */
async function reconcile(io: Io): Promise<number> {
  let config: UiTestsConfig
  try { config = (await loadConfig(io.cwd)).config } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  const store = await openStore(io.env)
  let open: RunRow[]
  try {
    open = (await store.listRuns()).filter(run => {
      if (run.rehearsal) return false
      if (run.result === 'pending') return Boolean(run.github) || Boolean(config.webhook?.url)
      const owed = owedDeliveries(run, config)
      return owed.check || owed.comment || owed.webhook
    })
  } finally { await store.close() }
  let worst = 0
  for (const run of open) {
    const quiet = { ...io, stdout: { write: () => true } }
    try {
      for (const command of [verify, status]) worst = Math.max(worst, await command({ positionals: [run.run], flags: new Map() }, quiet))
      io.stdout.write(`reconciled ${run.run}\n`)
    } catch (error) {
      worst = 2
      io.stderr.write(`${run.run}: ${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
  if (!open.length) io.stdout.write('reconcile: no open checks\n')
  return worst
}

/**
 * `ui-tests check`: from a GitHub event (`GITHUB_EVENT_PATH`), makes the run for the pull request (once; a new push finds the same one)
 * and posts the pending check. `--reconcile` instead brings every open run's check up to date.
 */
export const check: Command = async (args, io) => args.flags.has('reconcile') ? reconcile(io) : checkPullRequest(args, io)
