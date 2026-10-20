import { readFile, writeFile } from 'node:fs/promises'
import { skillRules } from '../src/mcp/skill-rules.ts'

const file = new URL('../skills/ui-tests/SKILL.md', import.meta.url)
const text = await readFile(file, 'utf8')
await writeFile(file, text.replace(/(<!-- lint-rules:start -->\n)[\s\S]*?(<!-- lint-rules:end -->)/, `$1${skillRules()}\n$2`))
