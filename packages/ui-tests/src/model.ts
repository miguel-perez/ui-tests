import Anthropic from '@anthropic-ai/sdk'

/** A configured text model: drafts the screener's decoys into the snapshot and codes the first look. */
export interface TextModel { complete(prompt: string): Promise<string> }

/** The model text is drafted and coded with when `UI_TESTS_MODEL` names none. */
export const DEFAULT_TEXT_MODEL = 'claude-sonnet-5-5'

/**
 * The author's own model: Claude through their `ANTHROPIC_API_KEY`, the model `UI_TESTS_MODEL` names. Undefined when no key is set,
 * and then nothing is drafted or coded by a model; nothing stands in for it.
 */
export function textModelFrom(env: Record<string, string | undefined>): TextModel | undefined {
  const apiKey = env.ANTHROPIC_API_KEY
  if (!apiKey) return undefined
  const client = new Anthropic({ apiKey })
  const model = env.UI_TESTS_MODEL || DEFAULT_TEXT_MODEL
  return {
    async complete(prompt) {
      const response = await client.messages.create({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
      return response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n')
    },
  }
}
