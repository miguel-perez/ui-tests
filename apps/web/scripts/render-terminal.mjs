// Run with: FORCE_COLOR=1 node --import tsx apps/web/scripts/render-terminal.mjs
import React from 'react'
import { render } from 'ink-testing-library'
import Convert from 'ansi-to-html'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { TerminalOutput } from '../../../packages/ui-tests/src/report.tsx'
import { commands, problems, rehearsal } from '../lib/copy.ts'

export const exampleReport = { people: 5, selectedRank: 1, problems: problems.map((p, i) => ({ title: i === 1 ? 'Pressed Add, saw nothing change, pressed it again' : p.title, people: Number(p.count[0]) })) }
export const surfaces = {
  report: { report: exampleReport },
  commands: { lines: [commands.install, commands.init, commands.run] },
  install: { lines: [commands.install] },
  initCommand: { lines: [commands.init] },
  devCommand: { lines: [commands.run] },
  runCommand: { lines: [commands.people] },
  reportCommand: { lines: [commands.report] },
  // Actual init filenames and mount instructions; not the aspirational auto-mount output.
  init: { lines: ['Created ui-tests.config.ts', 'Created landing.ui.test.ts', 'Created vitest.config.ts', 'Mount instructions:', "1. Import { UiTests } from 'ui-tests/next' and mount <UiTests /> in your root layout body.", "2. In app/ui-tests/[run]/page.tsx render <Player runId={run} token={token} /> from 'ui-tests/next'.", "3. In app/api/ui-tests/route.ts export GET and POST = createCollector() from 'ui-tests/server'; export const runtime = 'nodejs'.", '4. Run npm run dev, then npx ui-tests.'] },
  dev: { lines: ['Outcome: correct', rehearsal, 'Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/' + '0'.repeat(64)] },
  run: { lines: ['Run k2m9 started', 'Send this link to anyone: https://ui-tests.com/t/k2m9', 'Panel: 5 people matched to "people who signed up this week and want a colleague on their board"', 'Cap: $60 · results within 48 hours'] },
}
export async function capture(props) {
  const instance = render(React.createElement(TerminalOutput, props))
  await new Promise(resolve => setTimeout(resolve, 30))
  const frame = instance.lastFrame()
  instance.unmount()
  instance.cleanup()
  if (!frame) throw new Error('Ink produced no terminal frame')
  const convert = new Convert({ escapeXML: true, fg: 'var(--ink)', bg: 'var(--canvas)', colors: { 3: 'var(--moment)', 7: 'var(--ink)', 8: 'var(--muted)', 15: 'var(--ink)' } })
  // Annotate the already-rendered columns for responsive reflow. Text content,
  // including column padding, remains byte-for-byte identical to the Ink frame.
  const html = props.report ? frame.split('\n').map(line => {
    const columns = /^([▏ ]\d+  )(.+?)( +\d+ of \d+ *)$/.exec(stripVTControlCharacters(line))
    if (!columns) return convert.toHtml(line)
    return `<span class="terminal-report-line${columns[1].startsWith('▏') ? ' selected' : ''}"><span class="terminal-rank">${convert.toHtml(columns[1])}</span><span>${convert.toHtml(columns[2])}</span><span class="terminal-count">${convert.toHtml(columns[3])}</span></span>`
  }).join('\n') : convert.toHtml(frame)
  return { frame, html: html + '\n' }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = new URL('../generated/', import.meta.url)
  await mkdir(directory, { recursive: true })
  for (const [name, props] of Object.entries(surfaces)) {
    const { html } = await capture(props)
    const destination = new URL(`terminal-${name}.html`, directory)
    if (process.argv.includes('--check')) {
      if (await readFile(destination, 'utf8') !== html) throw new Error(`Terminal fragment drift: ${name}`)
    } else await writeFile(destination, html)
  }
  if (!process.argv.includes('--check')) await writeFile(new URL('example-report.json', directory), JSON.stringify(exampleReport, null, 2) + '\n')
}
