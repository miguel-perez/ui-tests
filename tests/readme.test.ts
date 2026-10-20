import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { compilation, example, promise } from '../apps/web/lib/copy'
import { offences, unsaid } from './vocabulary'

const readme = () => readFile('README.md', 'utf8')

it('carries the landing\'s promise and example study word for word', async () => {
  const text = await readme()
  expect(text).toContain(promise)
  expect(text).toContain('```ts\n' + example + '\n```')
})

it('shows each command the landing shows, all of which are built', async () => {
  const text = await readme()
  for (const { command } of compilation.commands) expect(text, command).toContain(command)
})

it('says how to run the product from a clone and links the getting-started page', async () => {
  const text = await readme()
  expect(text).toContain('## Running the product')
  for (const line of ['npm ci', 'npm run dev', 'cd apps/web && npx ui-tests']) expect(text, line).toContain(line)
  expect(text).toContain('/docs/getting-started')
  expect(text).not.toContain('Nothing is built yet')
})

it('uses none of the words the research rules out', async () => {
  expect(offences(await readme(), unsaid)).toEqual([])
})

it('dates a status line on each of R0, R1 and R2 in the story map, and says what is not executed', async () => {
  const map = await readFile('docs/story-map.md', 'utf8')
  for (const slice of ['R0', 'R1', 'R2']) {
    const section = new RegExp(`### ${slice}: [\\s\\S]*?(?=\\n### |$)`).exec(map)![0]
    expect(section, slice).toMatch(/- \*\*Status:\*\* [^\n]*2026/)
  }
  expect(map).not.toContain('are the plan again, not a record of what shipped')
  for (const word of ['npm publish', 'Neon', 'ANTHROPIC_API_KEY', 'cloudflared', 'VoiceOver']) expect(map, word).toContain(word)
})
