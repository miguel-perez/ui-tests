import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundleStudyFile, loadBundle, StudyLoadError } from '../src/load.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const fixture = (name: string) => join(fixtures, name)

describe('study loading', () => {
  it('loads a study with the file and line of its call site', async () => {
    const file = fixture('ok.ui.test.ts')
    const { code } = await bundleStudyFile(file)
    const [loaded, ...rest] = await loadBundle(code, file)
    expect(rest).toEqual([])
    expect(loaded.name).toBe('fixture study')
    expect(loaded.file).toMatch(/ok\.ui\.test\.ts$/)
    expect(loaded.line).toBe(3)
    expect(loaded.tasks.map(task => task.name)).toEqual(['Do the thing'])
    expect(loaded.tasks[0].line).toBe(4)
  })
  it('gives the same hash for the same file twice', async () => {
    const file = fixture('ok.ui.test.ts')
    expect((await bundleStudyFile(file)).hash).toBe((await bundleStudyFile(file)).hash)
  })
  it('rejects a file that throws at the top level with its file and line', async () => {
    const file = fixture('throws.ui.test.ts')
    const { code } = await bundleStudyFile(file)
    const error = await loadBundle(code, file).catch(e => e)
    expect(error).toBeInstanceOf(StudyLoadError)
    expect(error.file).toMatch(/throws\.ui\.test\.ts$/)
    expect(error.line).toBe(4)
    expect(error.message).toContain('boom at the top level')
  })
  it('rejects a file that does not parse with its file and line', async () => {
    const error = await bundleStudyFile(fixture('syntax.ui.test.ts')).catch(e => e)
    expect(error).toBeInstanceOf(StudyLoadError)
    expect(error.file).toMatch(/syntax\.ui\.test\.ts$/)
    expect(error.line).toBe(4)
  })
  it('imports a bundle from plain node, not only Vitest', () => {
    const out = execFileSync('node', ['--import', 'tsx', fixture('load-in-node.mjs')], { cwd: join(import.meta.dirname, '../../..'), encoding: 'utf8' })
    const [loaded] = JSON.parse(out)
    expect(loaded.name).toBe('fixture study')
    expect(loaded.file).toMatch(/ok\.ui\.test\.ts$/)
    expect(loaded.tasks).toBe(1)
  })
  it('reports the throwing line under plain node too', () => {
    const out = execFileSync('node', ['--import', 'tsx', fixture('load-throws-in-node.mjs')], { cwd: join(import.meta.dirname, '../../..'), encoding: 'utf8' })
    const error = JSON.parse(out)
    expect(error.name).toBe('StudyLoadError')
    expect(error.file).toMatch(/throws\.ui\.test\.ts$/)
    expect(error.line).toBe(4)
  })
  it('keeps concurrent loads apart', async () => {
    const files = ['ok.ui.test.ts', 'other.ui.test.ts'].map(fixture)
    const bundles = await Promise.all(files.map(file => bundleStudyFile(file)))
    const [first, second] = await Promise.all(files.map((file, index) => loadBundle(bundles[index].code, file)))
    expect(first.map(entry => entry.name)).toEqual(['fixture study'])
    expect(second.map(entry => entry.name)).toEqual(['other study'])
  })
})
