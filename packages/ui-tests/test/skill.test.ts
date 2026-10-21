import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { rules } from '../src/lint-rules.ts'
import { skillRules } from '../src/mcp/skill-rules.ts'

const root = join(import.meta.dirname, '..')
const skill = readFile(join(root, 'skills/ui-tests/SKILL.md'), 'utf8')

describe('the skill', () => {
  it('has frontmatter with name ui-tests and a description', async () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(await skill)
    expect(match).not.toBeNull()
    const fields = Object.fromEntries(match![1]!.split('\n').map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()]))
    expect(fields.name).toBe('ui-tests')
    expect(fields.description?.length).toBeGreaterThan(40)
  })

  it('lists every lint rule with its reason, equal to lint-rules.ts', async () => {
    const text = await skill
    for (const rule of rules) { expect(text).toContain(`\`${rule.id}\``); expect(text).toContain(rule.reason) }
    const section = /<!-- lint-rules:start -->\n([\s\S]*?)\n<!-- lint-rules:end -->/.exec(text)
    expect(section?.[1]).toBe(skillRules())
  })

  it('teaches the contract, dev mode, the sentence and the limits', async () => {
    const text = await skill
    expect(text).toContain('capability test, not usability')
    for (const word of ['study(', 'setup(', 'task(', 'outcome(', 'expect', 'npx ui-tests lint', 'rehearses', 'That is not a completion rate', 'What a run cannot license']) expect(text).toContain(word)
  })

  it('tells the tag-and-server story: the tag init prints, ui-tests serve and the image', async () => {
    const text = await skill
    for (const word of ['prints the script tag', 'npx ui-tests serve', 'docker build -t ui-tests .', 'ghcr.io/miguel-perez/ui-tests', 'front door']) expect(text).toContain(word)
  })

  it('is shipped by the package and the plugin manifest', async () => {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    expect(pkg.files).toContain('skills')
    expect(pkg.files).toContain('.claude-plugin')
    const plugin = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'))
    expect(plugin).toMatchObject({ name: 'ui-tests', skills: './skills', mcpServers: { 'ui-tests': { args: ['ui-tests', 'mcp'] } } })
  })
})
