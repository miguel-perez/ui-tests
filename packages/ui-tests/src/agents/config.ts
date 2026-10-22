import { createHash } from 'node:crypto'

/** The one model a project configures (`model` in ui-tests.config.ts): the agent of an agent run, and what drafts the screener snapshot and codes the first look. */
export type ModelConfig = { provider: 'anthropic' | 'scripted'; name: string; version?: string }
/** What `agents` in the config sets about the agent besides its model: prompt, tools, permissions and budgets. */
export type AgentSettings = { system?: string; tools?: string[]; permissions?: { network?: boolean; write?: boolean }; budgets?: { tokens?: number; calls?: number; seconds?: number; dollars?: number } }

/** The agent a run puts through the study: its model, prompt, tools, permissions and budgets. Any change is a different run. */
export type AgentConfig = {
  model: ModelConfig
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

/** The agent a run puts through the study: the config's `model` with its `agents` settings; undefined when no model is configured. */
export function agentConfigOf(config: { model?: ModelConfig; agents?: AgentSettings }): AgentConfig | undefined {
  return config.model ? { ...config.agents, model: config.model } : undefined
}
