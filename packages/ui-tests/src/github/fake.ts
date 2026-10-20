import type { CheckInput, GitHubClient, PullRequestInfo } from './types.ts'

export type FakeGitHub = GitHubClient & {
  /** Every call in order, as `{ call, ... }`. */
  calls: { call: string; [key: string]: unknown }[]
  /** The checks by id, as last updated. */
  checks: Map<number, CheckInput>
  /** The comments by `pr:marker`, as last written. */
  comments: Map<string, string>
  pullRequests: PullRequestInfo[]
}

/** A GitHub that keeps everything in memory. `pullRequests` is what `pullRequestsForCommit` answers from. */
export function fakeGitHub(pullRequests: PullRequestInfo[] = []): FakeGitHub {
  const calls: FakeGitHub['calls'] = []
  const checks = new Map<number, CheckInput>()
  const comments = new Map<string, string>()
  let next = 1
  return {
    calls, checks, comments, pullRequests,
    async createCheck(input) {
      const id = next++
      checks.set(id, input)
      calls.push({ call: 'createCheck', id, input })
      return { id }
    },
    async updateCheck(id, input) {
      const current = checks.get(id)
      if (!current) throw new Error(`No such check: ${id}`)
      checks.set(id, { ...current, ...input })
      calls.push({ call: 'updateCheck', id, input })
    },
    async upsertComment({ pr, marker, body }) {
      const key = `${pr}:${marker}`
      calls.push({ call: 'upsertComment', pr, created: !comments.has(key), body })
      comments.set(key, body)
    },
    async pullRequestsForCommit({ headSha }) {
      calls.push({ call: 'pullRequestsForCommit', headSha })
      return pullRequests.filter(p => p.headSha === headSha)
    },
  }
}
