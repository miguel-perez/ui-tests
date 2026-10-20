import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import { main, parseArgs, type Io } from '../src/cli/main.ts'
import { addVitestExclude } from '../src/cli/init.ts'
import { configTemplate } from '../src/templates/config.ts'
import { exampleTemplate } from '../src/templates/example.ts'

let cwd: string
let out: string
let err: string
const io = (): Io => ({ stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd, env: {} })
const run = (...argv: string[]) => main(argv, io())
const withVitest = () => writeFile(join(cwd, 'package.json'), JSON.stringify({ devDependencies: { vitest: '4.0.0' } }))

beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), 'ui-tests-init-')); out = ''; err = '' })
afterEach(() => rm(cwd, { recursive: true, force: true }))

describe('ui-tests init', () => {
  it('writes the config and the example, byte-equal to the landing, and prints the three lines to mount', async () => {
    await withVitest()
    expect(await run('init')).toBe(0)
    expect(exampleTemplate).toBe(exampleFile)
    expect(await readFile(join(cwd, 'ui-tests.config.ts'), 'utf8')).toBe(configTemplate)
    expect(await readFile(join(cwd, 'ui-tests/invite.ui.test.ts'), 'utf8')).toBe(exampleFile)
    expect(out).toContain("import { UiTests } from 'ui-tests/next'")
    expect(out).toContain('<UiTests />')
    expect(out).toContain("app/api/ui-tests/[[...path]]/route.ts:   export { GET, POST } from 'ui-tests/server'")
    expect(out).toContain("app/ui-tests/[run]/page.tsx:   export { PlayerPage as default } from 'ui-tests/server'")
  })
  it('creates vitest.config.ts with configDefaults.exclude when there is none', async () => {
    await withVitest()
    await run('init')
    const config = await readFile(join(cwd, 'vitest.config.ts'), 'utf8')
    expect(config).toContain("exclude: [...configDefaults.exclude, '**/*.ui.test.ts']")
  })
  it('adds the pattern to an existing exclude and to a config without one', async () => {
    await withVitest()
    await writeFile(join(cwd, 'vitest.config.ts'), "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { exclude: ['e2e/**'] } })\n")
    expect(await addVitestExclude(cwd)).toBe('updated')
    expect(await readFile(join(cwd, 'vitest.config.ts'), 'utf8')).toContain("exclude: ['**/*.ui.test.ts', 'e2e/**']")
    await writeFile(join(cwd, 'vitest.config.ts'), "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { globals: true } })\n")
    expect(await addVitestExclude(cwd)).toBe('updated')
    const config = await readFile(join(cwd, 'vitest.config.ts'), 'utf8')
    expect(config).toContain("import { configDefaults, defineConfig } from 'vitest/config'")
    expect(config).toContain("exclude: [...configDefaults.exclude, '**/*.ui.test.ts']")
    expect(await addVitestExclude(cwd)).toBe('updated')
    expect(await readFile(join(cwd, 'vitest.config.ts'), 'utf8')).toBe(config)
  })
  it('edits only an exclude directly inside the test block', async () => {
    await withVitest()
    const head = "import { defineConfig } from 'vitest/config'\n"
    await writeFile(join(cwd, 'vitest.config.ts'), `${head}export default defineConfig({ test: { coverage: { exclude: ['x/**'] } } })\n`)
    expect(await addVitestExclude(cwd)).toBe('updated')
    const coverage = await readFile(join(cwd, 'vitest.config.ts'), 'utf8')
    expect(coverage).toContain("coverage: { exclude: ['x/**'] }")
    expect(coverage).toContain("exclude: [...configDefaults.exclude, '**/*.ui.test.ts']")
    await writeFile(join(cwd, 'vitest.config.ts'), `${head}export default defineConfig({\n  test: {\n    // exclude: ['old'],\n    globals: true,\n  },\n})\n`)
    await addVitestExclude(cwd)
    const commented = await readFile(join(cwd, 'vitest.config.ts'), 'utf8')
    expect(commented).toContain("// exclude: ['old'],")
    expect(commented).toContain("exclude: [...configDefaults.exclude, '**/*.ui.test.ts']")
    await writeFile(join(cwd, 'vitest.config.ts'), `${head}export default defineConfig({ test: { exclude: ['a'], coverage: { exclude: ['b'] } } })\n`)
    await addVitestExclude(cwd)
    expect(await readFile(join(cwd, 'vitest.config.ts'), 'utf8')).toContain("test: { exclude: ['**/*.ui.test.ts', 'a'], coverage: { exclude: ['b'] } }")
  })
  it('throws the manual-add error without a test block, and init still writes the files but exits 1', async () => {
    await withVitest()
    await writeFile(join(cwd, 'vitest.config.ts'), "export default {}\n")
    await expect(addVitestExclude(cwd)).rejects.toThrow('add it by hand')
    expect(await run('init')).toBe(1)
    expect(err).toContain('add it by hand')
    expect(await readFile(join(cwd, 'ui-tests.config.ts'), 'utf8')).toBe(configTemplate)
  })
  it('leaves Vitest alone when the project does not use it', async () => {
    expect(await addVitestExclude(cwd)).toBe('no-vitest')
    await run('init')
    await expect(readFile(join(cwd, 'vitest.config.ts'), 'utf8')).rejects.toThrow()
  })
  it('overwrites nothing on a second run and says so', async () => {
    await withVitest()
    await run('init')
    await writeFile(join(cwd, 'ui-tests.config.ts'), '// mine\n')
    await mkdir(join(cwd, 'ui-tests'), { recursive: true })
    out = ''
    expect(await run('init')).toBe(0)
    expect(await readFile(join(cwd, 'ui-tests.config.ts'), 'utf8')).toBe('// mine\n')
    expect(out).toContain('exists, left as it is: ui-tests.config.ts')
    expect(out).toContain('exists, left as it is: ui-tests/invite.ui.test.ts')
  })
})

describe('ui-tests arguments', () => {
  it('exits 2 with usage for an unknown command', async () => {
    expect(await run('frobnicate')).toBe(2)
    expect(err).toContain('Unknown command: frobnicate')
    expect(err).toContain('Usage: ui-tests <command>')
    expect(out).toBe('')
  })
  it('reads space-separated values for flags a command declares, and --flag=value', () => {
    expect(parseArgs(['recruit', '--actor', 'agent', '--key=k1', '--json', 'x']).flags).toEqual(new Map<string, string | true>([['actor', 'agent'], ['key', 'k1'], ['json', true]]))
    expect(parseArgs(['recruit', '--actor', 'agent', '--json', 'x']).positionals).toEqual(['recruit', 'x'])
    expect(parseArgs(['--port', '4000']).flags.get('port')).toBe('4000')
    expect(parseArgs(['lint', '--json', 'a.ui.test.ts']).positionals).toEqual(['lint', 'a.ui.test.ts'])
  })
  it('prints the command usage for lint --help', async () => {
    expect(await run('lint', '--help')).toBe(0)
    expect(out).toContain('Usage: ui-tests lint')
  })
  it('prints usage and exits 0 for --help', async () => {
    expect(await run('--help')).toBe(0)
    expect(out).toContain('Usage: ui-tests <command>')
  })
  it('prints "not shipped yet" and exits 2 for commands later tasks build', async () => {
    for (const name of ['recruit', 'check', 'estimate', 'mcp']) {
      err = ''
      expect(await run(name)).toBe(2)
      expect(err).toBe(`${name}: not shipped yet\n`)
    }
  })
  it('host prints its plan and exits 2 with the not-shipped line', async () => {
    expect(await run('host')).toBe(2)
    expect(out).toContain('collector, the player and the store')
    expect(err).toBe('host: not shipped yet; see https://github.com/miguel-perez/ui-tests/issues/59\n')
  })
})
