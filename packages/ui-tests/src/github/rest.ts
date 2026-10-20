import type { CheckInput, GitHubClient } from './types.ts'

const API = 'https://api.github.com'
const MAX_TEXT = 60_000

/** The GitHub REST API as `GitHubClient`, authenticated with a token (`GITHUB_TOKEN`). */
export function restGitHub(token: string, fetchImpl: typeof fetch = fetch): GitHubClient {
  async function call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(body !== undefined && { 'content-type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    if (!response.ok) throw new Error(`GitHub ${method} ${path} answered ${response.status}`)
    return response.status === 204 ? undefined : response.json()
  }
  const payload = (input: Partial<CheckInput>) => ({
    ...(input.name !== undefined && { name: input.name }),
    ...(input.headSha !== undefined && { head_sha: input.headSha }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.conclusion !== undefined && { conclusion: input.conclusion }),
    ...(input.detailsUrl !== undefined && { details_url: input.detailsUrl }),
    ...(input.title !== undefined && input.summary !== undefined && {
      output: { title: input.title, summary: input.summary, ...(input.text !== undefined && { text: input.text.slice(0, MAX_TEXT) }) },
    }),
  })
  return {
    async createCheck(input) {
      const created = await call('POST', `/repos/${input.owner}/${input.repo}/check-runs`, payload(input)) as { id: number }
      return { id: created.id }
    },
    async updateCheck(id, input) {
      if (!input.owner || !input.repo) throw new Error('updateCheck needs owner and repo')
      await call('PATCH', `/repos/${input.owner}/${input.repo}/check-runs/${id}`, payload(input))
    },
    async upsertComment({ owner, repo, pr, marker, body }) {
      const comments = await call('GET', `/repos/${owner}/${repo}/issues/${pr}/comments?per_page=100`) as { id: number; body?: string }[]
      const mine = comments.find(c => c.body?.includes(marker))
      if (mine) await call('PATCH', `/repos/${owner}/${repo}/issues/comments/${mine.id}`, { body })
      else await call('POST', `/repos/${owner}/${repo}/issues/${pr}/comments`, { body })
    },
    async pullRequestsForCommit({ owner, repo, headSha }) {
      const found = await call('GET', `/repos/${owner}/${repo}/commits/${headSha}/pulls`) as { number: number; state: string; head: { sha: string }; labels: { name: string }[] }[]
      return found.filter(p => p.state === 'open').map(p => ({ number: p.number, headSha: p.head.sha, labels: p.labels.map(l => l.name) }))
    },
  }
}
