import type { Snapshot } from '../store/types.ts'
import type { Workspace } from '../types.ts'

/** One call the model asks the harness to make. The loop gives it an `id` when the model did not. */
export type ToolCall = { id?: string; name: string; input: unknown }

/**
 * One entry of an agent trial's transcript: the prompt and the harness's notes (`user`), the model's turns (`assistant`),
 * and each tool's answer (`tool`). `raw` keeps a provider's own content so it can be sent back unchanged.
 */
export type AgentMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: 'tool'; id: string; name: string; output: string; error?: string }

/** A tool the harness offers the agent, described by a JSON Schema for its input. */
export type ToolSpec = { name: string; description: string; input: { type: 'object'; properties: Record<string, unknown>; required?: string[] } }

/** What one model step returns: text, the tools it calls, what it cost, and why it stopped. */
export type AgentStep = {
  text?: string
  toolCalls: ToolCall[]
  usage: { inputTokens: number; outputTokens: number; dollars?: number }
  /**
   * `tool`: it called tools and waits for their answers. `done`: it ended its turn (which is not a claim that the task is
   * done: that is the `done` tool). `refusal`: it declined. `max_tokens`: its reply was cut off at the output limit.
   */
  stop: 'done' | 'tool' | 'refusal' | 'max_tokens'
  /** Provider content to keep on the assistant message, sent back unchanged on the next step. */
  raw?: unknown
}

/** The model an agent trial runs on. Providers: `scripted` (tests, offline) and `anthropic` (needs `ANTHROPIC_API_KEY`). */
export interface AgentModel {
  step(input: { system: string; messages: AgentMessage[]; tools: ToolSpec[] }): Promise<AgentStep>
}

/**
 * What an agent acts through: the tools it is offered, what calling one does, and the end state a hook reads.
 * `reset` starts a fresh trial (fixtures reset), `dispose` releases everything. `sideEffects` lists what the trial changed.
 */
export interface Harness {
  tools(): ToolSpec[]
  call(name: string, input: unknown): Promise<{ output: string; error?: string }>
  endState(): Promise<{ workspace?: Workspace; snapshot?: Snapshot; sideEffects?: string[] }>
  reset(): Promise<void>
  dispose(): Promise<void>
}
