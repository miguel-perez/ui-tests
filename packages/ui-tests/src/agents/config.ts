import { createHash } from 'node:crypto'

/** The agent a run puts through the study: its model, prompt, tools, permissions and budgets. Any change is a different run. */
export type AgentConfig = {
  model: { provider: 'anthropic' | 'scripted'; name: string; version?: string }
  system?: string
  tools?: string[]
  permissions?: { network?: boolean; write?: boolean }
  budgets?: { tokens?: number; calls?: number; seconds?: number; dollars?: number }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}

/** A short stable hash of the agent configuration (key order does not matter); `none` when no agent is configured. */
export function agentFingerprint(agent: AgentConfig | undefined): string {
  if (!agent) return 'none'
  return createHash('sha256').update(JSON.stringify(canonical(agent))).digest('hex').slice(0, 12)
}
