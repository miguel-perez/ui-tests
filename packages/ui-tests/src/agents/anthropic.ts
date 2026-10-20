import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig } from './config.ts'
import type { AgentMessage, AgentModel, ToolSpec } from './model.ts'

/** The model an `anthropic` agent runs on when the config names none. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

/** Dollars per million input and output tokens, for the models whose price is known here; others report no dollars. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

function toParams(messages: AgentMessage[]): Anthropic.MessageParam[] {
  const params: Anthropic.MessageParam[] = []
  let results: Anthropic.ToolResultBlockParam[] = []
  const flush = () => { if (results.length) { params.push({ role: 'user', content: results }); results = [] } }
  for (const message of messages) {
    if (message.role === 'tool') {
      results.push({ type: 'tool_result', tool_use_id: message.id, content: message.error ? `${message.error}\n${message.output}`.trim() : message.output || '(no output)', ...(message.error && { is_error: true }) })
      continue
    }
    flush()
    if (message.role === 'user') params.push({ role: 'user', content: message.text })
    else {
      // The provider's own content goes back unchanged, so thinking blocks stay valid.
      const content = (message.raw as Anthropic.ContentBlockParam[] | undefined) ?? [
        ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
        ...message.toolCalls.map(call => ({ type: 'tool_use' as const, id: call.id ?? '', name: call.name, input: call.input })),
      ]
      params.push({ role: 'assistant', content })
    }
  }
  flush()
  return params
}

/**
 * The Claude model behind an agent run, through the Messages API with the harness's tools (a manual tool loop: the
 * trial loop runs the tools). Needs `ANTHROPIC_API_KEY`; documented, never called in tests. The model is the pinned
 * one: no server-side fallback to another model, because a different model is a different run, so a refusal is
 * recorded as what stopped the trial.
 */
export function anthropicModel(config: AgentConfig['model'], apiKey = process.env.ANTHROPIC_API_KEY): AgentModel {
  if (!apiKey) throw new Error('The anthropic agent needs ANTHROPIC_API_KEY in the environment')
  const client = new Anthropic({ apiKey })
  // `name` is the model id; `version` is pinned into the fingerprint as a record of what ran.
  const model = config.name || DEFAULT_ANTHROPIC_MODEL
  const price = PRICES[model]
  return {
    async step({ system, messages, tools }: { system: string; messages: AgentMessage[]; tools: ToolSpec[] }) {
      const response = await client.messages.create({
        model,
        max_tokens: 16000,
        system,
        messages: toParams(messages),
        tools: tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.input })),
      })
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n')
      const toolCalls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input }))
      const { input_tokens: inputTokens, output_tokens: outputTokens } = response.usage
      return {
        ...(text && { text }),
        toolCalls,
        usage: { inputTokens, outputTokens, ...(price && { dollars: (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000 }) },
        stop: response.stop_reason === 'refusal' ? 'refusal' : toolCalls.length ? 'tool' : 'done',
        raw: response.content,
      }
    },
  }
}
