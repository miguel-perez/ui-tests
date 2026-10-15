import { it, expect, afterEach } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const exec = promisify(execFile)
const cli = path.resolve('packages/ui-tests/bin/ui-tests.mjs')
const directories: string[] = []
async function fixture() {
  await mkdir('.ui-tests', { recursive: true })
  const directory = await mkdtemp(path.resolve('.ui-tests', 'cli-test-')); directories.push(directory); return directory
}
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
it('init preserves author files and existing Vitest settings, adds the exclusion, and is idempotent', async () => {
  const cwd = await fixture()
  const original = `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { environment: 'node', exclude: ['custom/**'] } })\n`
  await writeFile(path.join(cwd, 'vitest.config.ts'), original)
  await writeFile(path.join(cwd, 'ui-tests.config.ts'), '// my existing configuration\n')
  const { stdout } = await exec(process.execPath, [cli, 'init'], { cwd })
  expect(stdout).toContain('Mount instructions:')
  expect(await readFile(path.join(cwd, 'ui-tests.config.ts'), 'utf8')).toBe('// my existing configuration\n')
  const updated = await readFile(path.join(cwd, 'vitest.config.ts'), 'utf8')
  expect(updated).toContain("exclude: ['**/*.ui.test.ts', 'custom/**']")
  expect(updated).toContain("environment: 'node'")
  await exec(process.execPath, [cli, 'init'], { cwd })
  expect(await readFile(path.join(cwd, 'vitest.config.ts'), 'utf8')).toBe(updated)
  expect(await readFile(path.join(cwd, 'landing.ui.test.ts'), 'utf8')).toContain("goal('start trying ui-tests'")
})
it('lint compiles in a separate CLI process and prints actionable source diagnostics', async () => {
  const cwd = await fixture(), file = path.join(cwd, 'bad.ui.test.ts')
  await writeFile(file, `import { context, goal, outcome, expect } from 'ui-tests'\ncontext({users:'people',purpose:'use ui-tests'},()=>{goal('click the Docs link and open getting started',()=>outcome(({page})=>expect(page.url()).toContain('/')));goal('understand what ui-tests does and start',()=>outcome(({page})=>expect(page.url()).toContain('/')))})`)
  try { await exec(process.execPath, [cli, 'lint', '--file', file], { cwd }); throw new Error('Lint unexpectedly passed') }
  catch (error) {
    const output = (error as { stdout: string }).stdout
    expect(output).toContain('[goal-no-interface]'); expect(output).toContain('[person-purpose]'); expect(output).toContain('[outcome-strength]')
    expect(output).toContain('Fix:'); expect(output).toContain('bad.ui.test.ts')
  }
  await writeFile(file, `import { context, goal, task, outcome, expect } from 'ui-tests'\ncontext({users:'people',purpose:'finish my work'},()=>goal('finish',()=>{task('click the Docs link and open getting started');task('understand what ui-tests does and start');outcome(({page})=>expect(page.url()).toContain('/'))}))`)
  const { stdout } = await exec(process.execPath, [cli, 'lint', '--file', file], { cwd })
  expect(stdout).toContain('Compiled'); expect(stdout).not.toContain('error [')
})
