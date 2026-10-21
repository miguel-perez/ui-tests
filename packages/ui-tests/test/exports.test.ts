import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..', '..')
const pkg = join(root, 'packages', 'ui-tests')

/** Every source file under `directory`, leaving out what is installed or built. */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', '.next-server', 'out', '.ui-tests'].includes(entry.name)) return []
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.(?:ts|tsx|mjs|js)$/.test(entry.name) ? [path] : []
  })
}

describe('what the package offers', () => {
  it('exports the study API, the config, the tag and the schemas, and no framework mount or server routes', () => {
    const { exports } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { exports: Record<string, string> }
    expect(Object.keys(exports)).toEqual(['.', './config', './tag', './schemas/*'])
  })

  it('nothing in the package or this site imports Next from the package, or a mount that is gone', () => {
    const found = [...sources(join(pkg, 'src')), ...sources(join(root, 'apps', 'web'))].flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      const inPackage = file.startsWith(join(pkg, 'src'))
      // Import and export statements only: a page's copy may quote one.
      const bad = [/^\s*(?:import|export)\b.*from ['"]ui-tests\/(?:next|server)['"]/m, ...(inPackage ? [/^\s*(?:import|export)\b.*from ['"]next(?:\/[\w-]+)?['"]/m] : [])]
      return bad.some((pattern) => pattern.test(text)) ? [relative(root, file)] : []
    })
    expect(found).toEqual([])
  })
})
