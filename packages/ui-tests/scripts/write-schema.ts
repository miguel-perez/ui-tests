import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { runRecordSchema } from '../src/record/schema.ts'

const target = new URL('../schemas/run-record.v1.json', import.meta.url)
writeFileSync(target, `${JSON.stringify(z.toJSONSchema(runRecordSchema), null, 2)}\n`)
console.log(`wrote ${target.pathname}`)
