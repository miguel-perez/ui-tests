#!/usr/bin/env node
import { register } from 'tsx/esm/api'
import { quietSqliteWarning } from './quiet-sqlite.mjs'

quietSqliteWarning()

register()
const { main } = await import('../src/cli/main.ts')
process.exitCode = await main(process.argv.slice(2))
