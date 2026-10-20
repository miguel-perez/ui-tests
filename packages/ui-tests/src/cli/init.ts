import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { TAG_SETUPS } from '../browser/setups.ts'
import { tagFor } from '../browser/tag.ts'
import { configTemplate } from '../templates/config.ts'
import { exampleTemplate } from '../templates/example.ts'
import type { Command } from './main.ts'

const pattern = '**/*.ui.test.ts'
const quoted = `'${pattern}'`

/** The tag `init` prints, for a ui-tests server on this machine at its default port. */
export const initTag = tagFor('http://localhost:4300')

async function hasVitest(cwd: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    return Boolean(pkg.dependencies?.vitest || pkg.devDependencies?.vitest)
  } catch { return false }
}

const createdConfig = `import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, ${quoted}],
  },
})
`

/** Blanks comments and string contents (same length) so braces and keys inside them are not read as code. */
function mask(source: string): string {
  return source
    .replace(/\/\*[^]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, m => m[0] + m.slice(1, -1).replace(/[^\n]/g, ' ') + m[0])
}

/** Adds `**\/*.ui.test.ts` to Vitest's exclude so it never collects study files. */
export async function addVitestExclude(cwd: string): Promise<'updated' | 'created' | 'no-vitest'> {
  if (!(await hasVitest(cwd))) return 'no-vitest'
  const names = await readdir(cwd)
  const name = names.find(n => /^vitest\.config\.[cm]?[jt]s$/.test(n)) ?? names.find(n => /^vite\.config\.[cm]?[jt]s$/.test(n))
  if (!name) { await writeFile(join(cwd, 'vitest.config.ts'), createdConfig); return 'created' }
  const file = join(cwd, name)
  const source = await readFile(file, 'utf8')
  if (source.includes(pattern)) return 'updated'
  const masked = mask(source)
  const open = /\btest\s*:\s*\{/.exec(masked)
  if (!open) throw new Error(`could not add ${quoted} to the exclude in ${name}; add it by hand`)
  const start = open.index + open[0].length
  let depth = 1
  let end = start
  let direct: number | undefined
  for (; end < masked.length && depth > 0; end++) {
    const c = masked[end]
    if (c === '{' || c === '[' || c === '(') depth++
    else if (c === '}' || c === ']' || c === ')') depth--
    else if (depth === 1 && direct === undefined && /^exclude\s*:\s*\[/.test(masked.slice(end)) && !/\w/.test(masked[end - 1] ?? ' ')) {
      direct = end + /^exclude\s*:\s*\[/.exec(masked.slice(end))![0].length
    }
  }
  if (depth > 0) throw new Error(`could not add ${quoted} to the exclude in ${name}; add it by hand`)
  let next: string
  if (direct !== undefined) next = `${source.slice(0, direct)}${quoted}, ${source.slice(direct)}`
  else {
    next = `${source.slice(0, start)}\n    exclude: [...configDefaults.exclude, ${quoted}],${source.slice(start)}`
    const imp = /import\s*\{([^}]*)\}\s*from\s*['"]vitest\/config['"]/.exec(next)
    if (imp && !/\bconfigDefaults\b/.test(imp[1])) next = next.replace(imp[0], `import { configDefaults,${imp[1]}} from 'vitest/config'`)
    else if (!imp && !/\bconfigDefaults\b/.test(source)) next = `import { configDefaults } from 'vitest/config'\n${next}`
  }
  await writeFile(file, next)
  return 'updated'
}

async function writeNew(cwd: string, relative: string, content: string, io: { stdout: { write(text: string): unknown } }) {
  const file = join(cwd, relative)
  if (existsSync(file)) { io.stdout.write(`exists, left as it is: ${relative}\n`); return }
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
  io.stdout.write(`wrote ${relative}\n`)
}

/** Writes the config, the example study and the Vitest exclude, then prints the tag, where it goes in each setup, and how to start the server. Overwrites nothing. */
export const init: Command = async (_args, io) => {
  await writeNew(io.cwd, 'ui-tests.config.ts', configTemplate, io)
  await writeNew(io.cwd, 'ui-tests/invite.ui.test.ts', exampleTemplate, io)
  let failed = false
  try {
    const result = await addVitestExclude(io.cwd)
    if (result === 'created') io.stdout.write(`wrote vitest.config.ts with ${quoted} excluded\n`)
    else if (result === 'updated') io.stdout.write(`vitest: ${quoted} is excluded\n`)
  } catch (error) { io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); failed = true }
  io.stdout.write(`\nAdd this tag to your app's HTML layout:\n  ${initTag}\n\nThe address differs between rehearsal, previews and production. Read it from the environment:\n`)
  io.stdout.write(TAG_SETUPS.map(setup => `  ${setup.name}: ${setup.line}\n`).join(''))
  io.stdout.write('\nStart the server with: npx ui-tests serve (rehearsal starts it for you)\n')
  return failed ? 1 : 0
}
