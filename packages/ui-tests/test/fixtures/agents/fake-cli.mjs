// A stand-in for a CLI under test: writes the run report the PRD 04 outcome looks for, or fails on request.
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (args.includes('--bad')) { console.error('unknown flag --bad\nrun with --help'); process.exit(1) }
if (args.includes('--sleep')) setTimeout(() => {}, 60_000)
else if (args.includes('--env')) console.log(Object.keys(process.env).sort().join('\n'))
else if (args.includes('--big')) process.stdout.write('x'.repeat(200_000))
else {
  mkdirSync('.ui-tests/runs/r1', { recursive: true })
  writeFileSync('.ui-tests/runs/r1/report.json', JSON.stringify({ run: 'r1', cwd: process.cwd() }))
  console.log(`wrote .ui-tests/runs/r1/report.json in ${process.cwd()}`)
}
