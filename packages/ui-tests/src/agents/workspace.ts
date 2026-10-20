import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { Workspace } from '../types.ts'

const MAX_FILES = 20_000

/** A glob as a regular expression over `/`-separated relative paths: `**` any directories, `*` any name part, `?` one character. */
export function globToRegExp(glob: string): RegExp {
  let source = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') { source += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1 }
    else if (c === '*') source += '[^/]*'
    else if (c === '?') source += '[^/]'
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`)
}

/**
 * Every file under `root`, as sorted `/`-separated relative paths (stops at a large number of files). Installed packages
 * (`node_modules`) are not listed: they are what `npm i` put there, not what the trial made.
 */
export function listFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(path) }
      else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'))
    }
  }
  try { walk(root) } catch { /* a missing workspace has no files */ }
  return files.sort()
}

/** What a hook reads of a directory: `file(glob)` is the text of the first matching file (in path order), or `null` when none matches. */
export function workspaceAt(root: string): Workspace {
  return {
    root,
    file(glob: string) {
      const pattern = globToRegExp(glob.replace(/^\.\//, ''))
      const match = listFiles(root).find(path => pattern.test(path))
      return match === undefined ? null : readFileSync(join(root, match), 'utf8')
    },
  }
}

/** A fingerprint of every file in `root` (path to content hash), to tell what a trial created, changed or deleted. */
export function fingerprintFiles(root: string): Map<string, string> {
  const map = new Map<string, string>()
  if (existsSync(join(root, 'node_modules'))) map.set('node_modules/', 'present')
  for (const path of listFiles(root)) {
    try {
      const full = join(root, path)
      map.set(path, statSync(full).size > 5_000_000 ? `size:${statSync(full).size}` : createHash('sha256').update(readFileSync(full)).digest('hex'))
    } catch { /* gone between listing and reading */ }
  }
  return map
}

/** What changed between two fingerprints, one line each: "created x", "changed y", "deleted z". */
export function diffFiles(before: Map<string, string>, after: Map<string, string>): string[] {
  const lines: string[] = []
  for (const [path, hash] of after) {
    if (!before.has(path)) lines.push(`created ${path}`)
    else if (before.get(path) !== hash) lines.push(`changed ${path}`)
  }
  for (const path of before.keys()) if (!after.has(path)) lines.push(`deleted ${path}`)
  return lines
}

/** A fresh, empty temporary directory for one trial. */
export function makeTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'ui-tests-agent-'))
}

export function removeWorkspace(root: string | undefined) {
  if (root) rmSync(root, { recursive: true, force: true })
}
