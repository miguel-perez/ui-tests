import type { AgentModel, AgentStep, ToolCall } from './model.ts'

/** One scripted turn: what the model says and calls. `stop` defaults to `tool` when it calls tools, else `done`. */
export type ScriptedTurn = { text?: string; toolCalls?: ToolCall[]; stop?: AgentStep['stop']; usage?: Partial<AgentStep['usage']>; throws?: string }

const defaultUsage = { inputTokens: 100, outputTokens: 20 }

/**
 * A model that plays back a script, for tests and offline runs. Each trial starts from the top of the script: a step whose
 * transcript holds only the prompt is the first turn. Past the end of the script it calls `done`.
 * A script of scripts gives each trial its own: trial n plays `script[n % script.length]`.
 */
export function scriptedModel(script: ScriptedTurn[] | ScriptedTurn[][]): AgentModel {
  const scripts = (Array.isArray(script[0]) ? script : [script]) as ScriptedTurn[][]
  let trial = -1
  let turn = 0
  return {
    async step({ messages }) {
      if (!messages.some(m => m.role === 'assistant')) { trial++; turn = 0 }
      const turns = scripts[trial % scripts.length] ?? []
      const next = turns[turn++] ?? { toolCalls: [{ name: 'done', input: {} }] }
      if (next.throws) throw new Error(next.throws)
      const toolCalls = next.toolCalls ?? []
      return {
        ...(next.text !== undefined && { text: next.text }),
        toolCalls,
        usage: { ...defaultUsage, ...next.usage },
        stop: next.stop ?? (toolCalls.length ? 'tool' : 'done'),
      }
    },
  }
}
