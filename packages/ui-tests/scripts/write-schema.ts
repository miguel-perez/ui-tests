import { writeFileSync } from 'node:fs'
import { runRecordJsonSchema } from '../src/record/schema.ts'

const target = new URL('../schemas/run-record.v1.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(runRecordJsonSchema(), null, 2)}\n`)
console.log(`wrote ${target.pathname}`)
