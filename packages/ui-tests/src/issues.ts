import type { TextModel } from './model.ts'
import type { Signal } from './signals.ts'
import type { AttemptRow } from './store/types.ts'

export type Impact = 'blocked' | 'slowed' | 'confused'

export type Issue = {
  id: string
  goalIndex: number
  where: { page: string; element?: string; step?: number }
  title: string
  participants: string[]
  /** "2 of 5": a count out of n, never a percentage. */
  count: string
  impact: Impact
  words: { participant: string; text: string }[]
  access: string[]
  moments: { attempt: string; at: number }[]
  recovered: string[]
  suggestedChange: string
  source: 'found from traces'
}

const impactOf: Record<Signal['kind'], Impact> = {
  'gave-up': 'blocked', timeout: 'blocked', 'false-done': 'blocked',
  pause: 'slowed', deviation: 'slowed', backtrack: 'slowed',
  'dead-click': 'confused', 'repeated-click': 'confused', 'low-ease': 'confused',
}
const severity: Record<Impact, number> = { blocked: 0, slowed: 1, confused: 2 }

const titles: Record<Signal['kind'], (where: string) => string> = {
  'gave-up': where => `People could not finish at ${where}`,
  timeout: where => `People ran out of time at ${where}`,
  'false-done': where => `People thought they were done at ${where} but were not`,
  pause: where => `People stalled at ${where}`,
  deviation: where => `People left the expected route at ${where}`,
  backtrack: where => `People went back at ${where}`,
  'dead-click': where => `Clicking ${where} did nothing`,
  'repeated-click': where => `People clicked ${where} again and again`,
  'low-ease': where => `People found ${where} hard`,
}

const suggestions: Record<Signal['kind'], string> = {
  'gave-up': 'Find what stopped people here and make the next step obvious or remove it.',
  timeout: 'Shorten the route to this step or make the next action easier to find.',
  'false-done': 'Make it clear what finishing looks like, and confirm the result on screen.',
  pause: 'Make the next action easier to find, or say what is expected here.',
  deviation: 'Make the intended route easier to find from this page.',
  backtrack: 'Make clear where each choice leads before people commit to it.',
  'dead-click': 'Make this element respond when clicked, or stop it looking clickable.',
  'repeated-click': 'Show that the click worked straight away, for example with a visible change.',
  'low-ease': 'Review this step with the words people gave; simplify what they found hard.',
}

const pageOf = (url: string | undefined) => (url ? new URL(url, 'http://placeholder').pathname : '/')
const normalised = (page: string) => page.replace(/(.)\/$/, '$1')
const ignored = (a: AttemptRow) => a.rehearsal || a.flags.includes('retired') || a.reason === 'withdrew' || a.reason === 'disconnected'

type Cluster = { goalIndex: number; page: string; element?: string; hits: Map<string, { attempt: AttemptRow; signals: Signal[] }>; kinds: Set<Signal['kind']> }

/**
 * Group signals from different people into issues keyed on goal, page and element. Counts come from the traces only; rehearsal, withdrawn,
 * disconnected and retired attempts are left out. Ranked by impact, then by how many people hit it.
 */
export function clusterIssues(input: { n: number; attempts: { attempt: AttemptRow; signals: Signal[] }[] }): Issue[] {
  const clusters = new Map<string, Cluster>()
  for (const { attempt, signals } of input.attempts) {
    if (ignored(attempt)) continue
    for (const signal of signals) {
      const page = pageOf(signal.url)
      const key = JSON.stringify([attempt.goalIndex, normalised(page), signal.target ?? null])
      let cluster = clusters.get(key)
      if (!cluster) clusters.set(key, cluster = { goalIndex: attempt.goalIndex, page, element: signal.target, hits: new Map(), kinds: new Set() })
      cluster.kinds.add(signal.kind)
      const hit = cluster.hits.get(attempt.participant) ?? { attempt, signals: [] }
      hit.signals.push(signal)
      cluster.hits.set(attempt.participant, hit)
    }
  }
  const issues = [...clusters.entries()].map(([key, cluster]): Issue => {
    const kinds = [...cluster.kinds].sort((x, y) => severity[impactOf[x]] - severity[impactOf[y]])
    const worst = kinds[0]!
    const hits = [...cluster.hits.entries()]
    const words: Issue['words'] = []
    const access = new Set<string>()
    const moments: Issue['moments'] = []
    for (const [participant, { attempt, signals }] of hits) {
      const said = attempt.answers[`goal${attempt.goalIndex}.difficulty`]
      if (typeof said === 'string' && said.trim()) words.push({ participant, text: said.trim() })
      for (const value of Object.values(attempt.environment ?? {})) if (value && value !== 'None') access.add(value)
      for (const signal of signals) moments.push({ attempt: attempt.id, at: signal.at })
    }
    moments.sort((x, y) => x.at - y.at)
    const where = cluster.element ? `${cluster.element} on ${cluster.page}` : cluster.page
    return {
      id: key,
      goalIndex: cluster.goalIndex,
      where: { page: cluster.page, ...(cluster.element ? { element: cluster.element } : {}) },
      title: titles[worst](where),
      participants: hits.map(([participant]) => participant),
      count: `${hits.length} of ${input.n}`,
      impact: impactOf[worst],
      words,
      access: [...access].sort(),
      moments,
      recovered: hits.filter(([, { attempt }]) => attempt.verification?.status === 'correct').map(([participant]) => participant),
      suggestedChange: suggestions[worst],
      source: 'found from traces',
    }
  })
  return issues.sort((x, y) => severity[x.impact] - severity[y.impact] || y.participants.length - x.participants.length)
}

/** The three most serious issues of one goal, in rank order. The rest stay in the full list. */
export const topThree = (issues: Issue[], goalIndex: number): Issue[] => issues.filter(issue => issue.goalIndex === goalIndex).slice(0, 3)

/** A configured model may propose plainer titles. It changes wording only; counts, ranking and members never depend on it. */
export async function retitleWithModel(issues: Issue[], model: TextModel | undefined): Promise<Issue[]> {
  if (!model) return issues
  return Promise.all(issues.map(async issue => {
    try {
      const title = (await model.complete(`Rewrite as one plain sentence under 12 words, no numbers: ${issue.title}. People's words: ${issue.words.map(w => w.text).join(' | ')}`)).trim()
      return title && title.length < 120 ? { ...issue, title } : issue
    } catch { return issue }
  }))
}
