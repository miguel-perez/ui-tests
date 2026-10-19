import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { configTemplate } from '../templates/config.ts'
import { exampleTemplate } from '../templates/example.ts'
import type { Command } from './main.ts'

const pattern = '**/*.ui.test.ts'
const quoted = `'${pattern}'`

export const mountLines = [
  "import { UiTests } from 'ui-tests/next'   and   <UiTests />   in your root layout",
  "app/api/ui-tests/[[...path]]/route.ts:   export { GET, POST } from 'ui-tests/server'",
  "app/ui-tests/[run]/page.tsx:   export { PlayerPage as default } from 'ui-tests/server'",
]

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

/** Adds `**\/*.ui.test.ts` to Vitest's exclude so it never collects study files. */
export async function addVitestExclude(cwd: string): Promise<'updated' | 'created' | 'no-vitest'> {
  if (!(await hasVitest(cwd))) return 'no-vitest'
  const names = await readdir(cwd)
  const name = names.find(n => /^vitest\.config\.[cm]?[jt]s$/.test(n)) ?? names.find(n => /^vite\.config\.[cm]?[jt]s$/.test(n))
  if (!name) { await writeFile(join(cwd, 'vitest.config.ts'), createdConfig); return 'created' }
  const file = join(cwd, name)
  const source = await readFile(file, 'utf8')
  if (source.includes(pattern)) return 'updated'
  let next: string
  if (/exclude\s*:\s*\[/.test(source)) next = source.replace(/exclude\s*:\s*\[/, `exclude: [${quoted}, `)
  else if (/\btest\s*:\s*\{/.test(source)) {
    next = source.replace(/\btest\s*:\s*\{/, `test: {\n    exclude: [...configDefaults.exclude, ${quoted}],`)
    if (!/\bconfigDefaults\b[^]*\bfrom\s+['"]vitest\/config['"]/.test(next.split('exclude:')[0])) {
      next = /import\s*\{([^}]*)\}\s*from\s*['"]vitest\/config['"]/.test(next)
        ? next.replace(/import\s*\{([^}]*)\}\s*from\s*['"]vitest\/config['"]/, (_m, names: string) => `import { configDefaults,${names}} from 'vitest/config'`)
        : `import { configDefaults } from 'vitest/config'\n${next}`
    }
  } else throw new Error(`could not add ${quoted} to the exclude in ${name}; add it by hand`)
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

/** Writes the config, the example study and the Vitest exclude, then prints the three lines to mount. Overwrites nothing. */
export const init: Command = async (_args, io) => {
  await writeNew(io.cwd, 'ui-tests.config.ts', configTemplate, io)
  await writeNew(io.cwd, 'ui-tests/invite.ui.test.ts', exampleTemplate, io)
  try {
    const result = await addVitestExclude(io.cwd)
    if (result === 'created') io.stdout.write(`wrote vitest.config.ts with ${quoted} excluded\n`)
    else if (result === 'updated') io.stdout.write(`vitest: ${quoted} is excluded\n`)
  } catch (error) { io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`) }
  io.stdout.write(`\nMount these three lines in your app:\n${mountLines.map(line => `  ${line}`).join('\n')}\n`)
  return 0
}
