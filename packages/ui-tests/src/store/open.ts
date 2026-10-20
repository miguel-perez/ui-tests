import { existsSync } from 'node:fs'
import path from 'node:path'
import { neonClient, pgliteClient } from './drivers.ts'
import { PostgresStore } from './postgres.ts'
import { SqliteStore } from './sqlite.ts'
import type { RunStore } from './types.ts'

/** The local data directory: `UI_TESTS_DATA_DIR`, or `.ui-tests` next to the nearest `package-lock.json`. */
export function dataDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UI_TESTS_DATA_DIR) return env.UI_TESTS_DATA_DIR
  let root = process.cwd()
  while (!existsSync(path.join(root, 'package-lock.json')) && path.dirname(root) !== root) root = path.dirname(root)
  return path.join(root, '.ui-tests')
}

/** Opens the store the environment names: `UI_TESTS_DATABASE_URL` is `postgres://…` (Neon), `pglite:memory` or `pglite:<dir>` (PGlite); unset, SQLite at `<data directory>/dev.sqlite`. */
export async function openStore(env: NodeJS.ProcessEnv = process.env): Promise<RunStore> {
  const url = env.UI_TESTS_DATABASE_URL
  if (url) {
    if (url.startsWith('pglite:')) {
      const dir = url.slice('pglite:'.length)
      return new PostgresStore(await pgliteClient(dir === 'memory' ? undefined : dir))
    }
    if (/^postgres(ql)?:\/\//.test(url)) return new PostgresStore(neonClient(url))
    throw new Error('UI_TESTS_DATABASE_URL must be postgres://…, pglite:memory or pglite:<dir>')
  }
  return new SqliteStore(path.join(dataDirectory(env), 'dev.sqlite'))
}
