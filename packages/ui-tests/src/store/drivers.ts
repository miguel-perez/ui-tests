import { Pool } from '@neondatabase/serverless'
import type { SqlClient } from './sql.ts'

/** PGlite (Postgres compiled to WASM): in memory, or persisted under `dataDir`. */
export async function pgliteClient(dataDir?: string): Promise<SqlClient> {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = dataDir ? new PGlite(dataDir) : new PGlite()
  await db.waitReady
  const wrap = (target: { query: PGliteQuery }): Pick<SqlClient, 'query'> => ({
    query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await target.query(text, params)).rows as T[] }),
  })
  return {
    ...wrap(db),
    transaction: (fn) =>
      db.transaction(async (tx) => {
        const client: SqlClient = {
          ...wrap(tx),
          transaction: (inner) => inner(client),
          close: async () => {},
        }
        return fn(client)
      }),
    close: () => db.close(),
  }
}
type PGliteQuery = (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>

/** Neon over its serverless driver. Builds a pool without connecting; the first query opens the connection. */
export function neonClient(url: string): SqlClient {
  const pool = new Pool({ connectionString: url })
  return {
    query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await pool.query(text, params as unknown[])).rows as T[] }),
    async transaction(fn) {
      const connection = await pool.connect()
      const client: SqlClient = {
        query: async <T,>(text: string, params?: unknown[]) => ({ rows: (await connection.query(text, params as unknown[])).rows as T[] }),
        transaction: (inner) => inner(client),
        close: async () => {},
      }
      try {
        await connection.query('BEGIN')
        const result = await fn(client)
        await connection.query('COMMIT')
        return result
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        connection.release()
      }
    },
    close: () => pool.end(),
  }
}
