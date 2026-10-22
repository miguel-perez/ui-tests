import Anthropic from '@anthropic-ai/sdk'
import type { ModelConfig } from './agents/config.ts'

/** A configured text model: drafts the screener's decoys into the snapshot and codes the first look. */
export interface TextModel { complete(prompt: string): Promise<string> }

/** What lint says when the config names no model it can draft with. */
export const NO_MODEL = "no model is configured: set model: { provider: 'anthropic', name } in ui-tests.config.ts"

/**
 * The project's model as a text model: the config's `model` (one place for it, the same the agent runs on), through the author's
 * `ANTHROPIC_API_KEY` from the environment. When there is none to use, the reason, and nothing stands in for it.
 */
export function textModelFor(model: ModelConfig | undefined, env: Record<string, string | undefined>): { model: TextModel } | { missing: string } {
  if (!model) return { missing: NO_MODEL }
  if (model.provider !== 'anthropic') return { missing: `model provider ${model.provider} only runs agents; set model: { provider: 'anthropic', name } in ui-tests.config.ts to draft and code` }
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return { missing: 'model is set in ui-tests.config.ts but ANTHROPIC_API_KEY is not in the environment' }
  const client = new Anthropic({ apiKey })
  return {
    model: {
      async complete(prompt) {
        const response = await client.messages.create({ model: model.name, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
        return response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n')
      },
    },
  }
}
