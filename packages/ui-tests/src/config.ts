import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { UiTestsConfig } from './types.ts'

export type { UiTestsConfig } from './types.ts'

export type LoadedConfig = { config: Required<Pick<UiTestsConfig, 'target'>> & UiTestsConfig; file?: string }

const defaultUrl = 'http://localhost:3000'
const skipped = new Set(['node_modules', 'out'])

async function readModule(file: string): Promise<unknown> {
  const { tsImport } = await import('tsx/esm/api')
  let value: unknown = await tsImport(pathToFileURL(file).href, import.meta.url)
  while (value && typeof value === 'object' && 'default' in value) value = (value as { default: unknown }).default
  return value
}
async function entries(cwd: string) { return (await readdir(cwd)).sort() }

/** Reads `ui-tests.config.{ts,mts,js}`, else a `uiTests` key in `vite.config.*`, else the defaults. */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
  const names = await entries(cwd)
  let file: string | undefined
  let found: UiTestsConfig = {}
  const own = ['ui-tests.config.ts', 'ui-tests.config.mts', 'ui-tests.config.js'].find(name => names.includes(name))
  if (own) {
    file = join(cwd, own)
    found = await readModule(file) as UiTestsConfig
  } else {
    for (const name of names.filter(name => /^vite\.config\.[cm]?[jt]s$/.test(name))) {
      const exported = await readModule(join(cwd, name)) as { uiTests?: UiTestsConfig } | undefined
      if (exported && typeof exported === 'object' && exported.uiTests) { file = join(cwd, name); found = exported.uiTests; break }
    }
  }
  return { config: { ...found, target: { url: defaultUrl, ...found.target } }, file }
}

/** Lists every `*.ui.test.ts` under `cwd`, relative-sorted, skipping dependencies and build output. */
export async function discoverStudyFiles(cwd: string): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skipped.has(entry.name) || entry.name.startsWith('.next')) continue
        await walk(join(dir, entry.name))
      } else if (entry.name.endsWith('.ui.test.ts')) found.push(join(dir, entry.name))
    }
  }
  if (existsSync(cwd)) await walk(cwd)
  return found.sort((a, b) => relative(cwd, a).split(sep).join('/').localeCompare(relative(cwd, b).split(sep).join('/')))
}
