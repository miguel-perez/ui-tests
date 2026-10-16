import { it, expect, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { SQLiteAdapter } from '../packages/ui-tests/src/storage'

const exec = promisify(execFile)
const cli = path.resolve('packages/ui-tests/bin/ui-tests.mjs')
const directories: string[] = []
/** Creates a temporary project directory under `.ui-tests`, removed after each test. */
async function fixture() {
  await mkdir('.ui-tests', { recursive: true })
  const directory = await mkdtemp(path.resolve('.ui-tests', 'cli-test-')); directories.push(directory); return directory
}
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
// These integration tests launch two or three cold Node/tsx processes. Allow CI
// startup time while bounding each child and the complete test separately.
it('rejects non-local targets before persisting any runs or attempts', async () => {
  const cwd = await fixture()
  await exec(process.execPath, [cli, 'init'], { cwd, timeout: 10000 })
  await writeFile(path.join(cwd, 'ui-tests.config.ts'), `export default { target: { url: 'https://example.com' } }`)
  for (let i = 0; i < 2; i++) {
    await expect(exec(process.execPath, [cli, '--no-open'], { cwd, env: { ...process.env, UI_TESTS_DATA_DIR: cwd }, timeout: 10000 })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('This slice supports local dev targets only.') })
  }
  const store = new SQLiteAdapter(path.join(cwd, 'dev.sqlite'))
  try {
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM runs').get()).toEqual({ count: 0 })
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM attempts').get()).toEqual({ count: 0 })
  } finally { store.close() }
}, 35000)
it('init preserves author files and existing Vitest settings, adds the exclusion, and is idempotent', async () => {
  const cwd = await fixture()
  const original = `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { environment: 'node', exclude: ['custom/**'] } })\n`
  await writeFile(path.join(cwd, 'vitest.config.ts'), original)
  await writeFile(path.join(cwd, 'ui-tests.config.ts'), '// my existing configuration\n')
  const { stdout } = await exec(process.execPath, [cli, 'init'], { cwd, timeout: 10000 })
  expect(stdout).toContain('Mount instructions:')
  expect(stdout.trim().split('\n').at(-1)).toBe('Next: npm run dev, then npx ui-tests')
  expect(await readFile(path.join(cwd, 'ui-tests.config.ts'), 'utf8')).toBe('// my existing configuration\n')
  const updated = await readFile(path.join(cwd, 'vitest.config.ts'), 'utf8')
  expect(updated).toContain("exclude: ['**/*.ui.test.ts', 'custom/**']")
  expect(updated).toContain("environment: 'node'")
  await exec(process.execPath, [cli, 'init'], { cwd, timeout: 10000 })
  expect(await readFile(path.join(cwd, 'vitest.config.ts'), 'utf8')).toBe(updated)
  expect(await readFile(path.join(cwd, 'landing.ui.test.ts'), 'utf8')).toContain("goal('start trying ui-tests'")
}, 30000)
it('lint compiles in a separate CLI process and prints actionable source diagnostics', async () => {
  const cwd = await fixture(), file = path.join(cwd, 'bad.ui.test.ts')
  await writeFile(file, `import { context, goal, outcome, expect } from 'ui-tests'\ncontext({users:'people',purpose:'use ui-tests'},()=>{goal('click the Docs link and open getting started',()=>outcome(({page})=>expect(page.url()).toContain('/')));goal('understand what ui-tests does and start',()=>outcome(({page})=>expect(page.url()).toContain('/')))})`)
  try { await exec(process.execPath, [cli, 'lint', '--file', file], { cwd, timeout: 10000 }); throw new Error('Lint unexpectedly passed') }
  catch (error) {
    expect(error).toMatchObject({ code: 1 })
    const output = (error as { stdout: string }).stdout
    expect(output).toContain('[goal-no-interface]'); expect(output).toContain('[person-purpose]'); expect(output).toContain('[outcome-strength]')
    expect(output).toContain('Fix:'); expect(output).toContain('bad.ui.test.ts')
  }
  await writeFile(file, `import { context, goal, task, outcome, expect } from 'ui-tests'\ncontext({users:'people',purpose:'finish my work'},()=>goal('finish',()=>{task('click the Docs link and open getting started');task('understand what ui-tests does and start');outcome(({page})=>expect(page.url()).toContain('/'))}))`)
  const { stdout } = await exec(process.execPath, [cli, 'lint', '--file', file], { cwd, timeout: 10000 })
  expect(stdout).toContain('Compiled'); expect(stdout).not.toContain('error [')
}, 30000)
it('lint prints the screener it drafted from users as TypeScript to paste in, and is quiet about it once screen is written', async () => {
  const cwd = await fixture(), file = path.join(cwd, 'draft.ui.test.ts')
  const body = (screen: string) => `import { context, goal, outcome, expect } from 'ui-tests'\ncontext({users:'people who signed up this week and want a colleague on their board',purpose:'plan the week together'${screen}},()=>goal('invite a colleague',()=>outcome(({page})=>expect(page.url()).toContain('/members'))))`
  await writeFile(file, body(''))
  const { stdout } = await exec(process.execPath, [cli, 'lint', '--file', file], { cwd, timeout: 10000 })
  expect(stdout).toContain('warning [screen-inferred]')
  expect(stdout).toContain("  screen: {\n    did: 'signed up', // inferred\n    within: '7 days', // inferred\n  },")
  expect(stdout).toContain('Compiled')
  await writeFile(file, body(",screen:{did:'signed up for a tool to plan work with a team',within:'7 days'}"))
  const { stdout: pinned } = await exec(process.execPath, [cli, 'lint', '--file', file], { cwd, timeout: 10000 })
  expect(pinned).not.toContain('screen-')
}, 30000)
