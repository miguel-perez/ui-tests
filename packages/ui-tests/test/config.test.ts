import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverStudyFiles, loadConfig } from '../src/config.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const dir = () => mkdtempSync(join(tmpdir(), 'ui-tests-config-'))

afterEach(() => { delete process.env.PREVIEW_URL })

describe('loadConfig', () => {
  it('runs with defaults against localhost:3000 when there is no config', async () => {
    const { config, file } = await loadConfig(dir())
    expect(config.target.url).toBe('http://localhost:3000')
    expect(file).toBeUndefined()
  })
  it('prefers ui-tests.config.ts over vite.config.ts', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'ui-tests.config.ts'), `export default { target: { url: 'http://own' } }`)
    writeFileSync(join(cwd, 'vite.config.ts'), `export default { uiTests: { target: { url: 'http://vite' } } }`)
    const { config, file } = await loadConfig(cwd)
    expect(config.target.url).toBe('http://own')
    expect(file).toBe(join(cwd, 'ui-tests.config.ts'))
  })
  it('reads the uiTests key of vite.config.ts', async () => {
    const { config, file } = await loadConfig(join(fixtures, 'vite-project'))
    expect(config.target.url).toBe('http://x')
    expect(file).toMatch(/vite\.config\.ts$/)
  })
  it('ignores a vite config without a uiTests key', async () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'vite.config.ts'), `export default { plugins: [] }`)
    const { config, file } = await loadConfig(cwd)
    expect(config.target.url).toBe('http://localhost:3000')
    expect(file).toBeUndefined()
  })
  it('lets PREVIEW_URL reach the config through process.env', async () => {
    const cwd = dir()
    process.env.PREVIEW_URL = 'http://preview.example'
    writeFileSync(join(cwd, 'ui-tests.config.mts'), `export default { target: { url: process.env.PREVIEW_URL } }`)
    expect((await loadConfig(cwd)).config.target.url).toBe('http://preview.example')
  })
})

describe('discoverStudyFiles', () => {
  it('finds *.ui.test.ts files and skips node_modules, .next* and out', async () => {
    const cwd = dir()
    for (const path of ['a.ui.test.ts', 'ui-tests/b.ui.test.ts', 'node_modules/x/c.ui.test.ts', '.next-server/d.ui.test.ts', 'out/e.ui.test.ts', 'plain.test.ts']) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true })
      writeFileSync(join(cwd, path), '')
    }
    expect((await discoverStudyFiles(cwd)).map(file => file.slice(cwd.length + 1))).toEqual(['a.ui.test.ts', 'ui-tests/b.ui.test.ts'])
  })
})
