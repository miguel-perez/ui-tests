/** What the check on a pull request says; `conclusion` is only ever `neutral` or `failure`, never `success`. */
export type CheckInput = {
  owner: string
  repo: string
  headSha: string
  name: string
  status: 'in_progress' | 'completed'
  conclusion?: 'neutral' | 'failure'
  title: string
  summary: string
  text?: string
  detailsUrl?: string
}

/** A pull request as the check needs it: its number, its head commit and its labels. */
export type PullRequestInfo = { number: number; headSha: string; labels: string[] }

/** GitHub as the check talks to it. The real one is `restGitHub`; tests use `fakeGitHub`. `updateCheck` needs `owner` and `repo` in its input. */
export interface GitHubClient {
  createCheck(input: CheckInput): Promise<{ id: number }>
  updateCheck(id: number, input: Partial<CheckInput>): Promise<void>
  /** Creates the comment carrying `marker`, or replaces its body when one is already there. */
  upsertComment(input: { owner: string; repo: string; pr: number; marker: string; body: string }): Promise<void>
  /** The open pull requests whose head is `headSha`. */
  pullRequestsForCommit(input: { owner: string; repo: string; headSha: string }): Promise<PullRequestInfo[]>
}

/** Where a run's check lives, stored on the run (`RunRow.github`). */
export type GitHubLink = { owner: string; repo: string; pr: number; headSha: string; checkId: number; name: string }

/** What has already been told to the outside for the run's current result, stored on the run (`RunRow.delivered`). */
export type Delivered = { check?: string; comment?: string; webhook?: string }
