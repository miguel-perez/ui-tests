import { existsSync } from 'node:fs'
import path from 'node:path'
import { SqliteStore } from './sqlite.ts'
import type { RunStore } from './types.ts'

/** The local data directory: `UI_TESTS_DATA_DIR`, or `.ui-tests` next to the nearest `package-lock.json`. */
export function dataDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.UI_TESTS_DATA_DIR) return env.UI_TESTS_DATA_DIR
  let root = process.cwd()
  while (!existsSync(path.join(root, 'package-lock.json')) && path.dirname(root) !== root) root = path.dirname(root)
  return path.join(root, '.ui-tests')
}

/** Opens the store the environment names: SQLite at `<data directory>/dev.sqlite` when `UI_TESTS_DATABASE_URL` is unset. */
export async function openStore(env: NodeJS.ProcessEnv = process.env): Promise<RunStore> {
  if (env.UI_TESTS_DATABASE_URL) throw new Error(`UI_TESTS_DATABASE_URL is set but the Postgres adapter is not available yet`)
  return new SqliteStore(path.join(dataDirectory(env), 'dev.sqlite'))
}
