import type { NextConfig } from 'next'
import path from 'node:path'
const config: NextConfig = { outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'), transpilePackages: ['ui-tests'], serverExternalPackages: ['better-sqlite3'] }
export default config
