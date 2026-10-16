// Run with: FORCE_COLOR=3 node --import tsx apps/web/scripts/render-terminal.mjs
import React from 'react'
import { render } from 'ink-testing-library'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { TerminalOutput } from '../../../packages/ui-tests/src/report.tsx'
import { agent, commands, problems, rehearsal } from '../lib/copy.ts'
import metadata from '../public/sessions/sessions.json' with { type: 'json' }

// The run's report: who reached the goal and who was wrong and sure come from the attempts; the problems, in the run's rank, from the copy.
// Two titles are shortened to fit 80 columns beside the rank, count and impact.
const short = ['Pressed Add, saw nothing change, pressed it again', "Stopped at a grey Add, pressed I couldn't do this", 'Looked for Invite in the Share menu, found only links']
export const exampleReport = {
  people: metadata.attempts.length,
  reached: metadata.attempts.filter(a => a.reached === 'yes').length,
  wrongAndSure: metadata.attempts.filter(a => a.reached === 'no' && a.sure === 7).length,
  selectedRank: 1,
  problems: problems.map((p, i) => ({ title: short[i] ?? p.title, people: Number(p.count[0]), impact: p.impact })),
}
const prompt = command => `$ ${command}`
export const surfaces = {
  agent: { actor: 'agent', agentReport: agent.report },
  report: { report: exampleReport },
  // One terminal session for the commands block: each command, then what init prints that a reader needs.
  commands: { lines: [prompt(commands.install), prompt(commands.init), 'Created ui-tests.config.ts', 'Created ui-tests/invite.ui.test.ts', 'Created vitest.config.ts', 'Next: npm run dev, then npx ui-tests', prompt(commands.run)] },
  install: { lines: [prompt(commands.install)] },
  initCommand: { lines: [prompt(commands.init)] },
  devCommand: { lines: [prompt(commands.run)] },
  runCommand: { lines: [prompt(commands.people)] },
  reportCommand: { lines: [prompt(commands.report)] },
  agentCommand: { lines: [prompt(agent.command)] },
  // The lines of `ui-tests init` a reader needs: the created files and the next command. The mount steps live in the guide.
  init: { lines: ['Created ui-tests.config.ts', 'Created ui-tests/invite.ui.test.ts', 'Created vitest.config.ts', 'Next: npm run dev, then npx ui-tests'] },
  dev: { lines: ['Reached the goal: Yes', rehearsal, 'Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/' + '0'.repeat(64)] },
  run: { lines: ['Run k2m9 started', 'Send this link to anyone: https://ui-tests.com/t/k2m9', 'Paid panel: 5 people matched to "people who signed up this week and want a colleague on their board"', 'Cap: $60 · results within 48 hours'] },
}

const escape = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
/** Splits an Ink frame into runs of one colour: the 24-bit hex Ink emitted, or null for uncoloured text. */
function runs(frame) {
  let colour = null
  const found = []
  for (const part of frame.split(/(\x1b\[[\d;]*m)/)) {
    const sgr = /^\x1b\[([\d;]*)m$/.exec(part)
    if (!sgr) { if (part) found.push({ colour, text: part }); continue }
    const codes = sgr[1].split(';').map(Number)
    for (let i = 0; i < codes.length; i++) {
      if (codes[i] === 38 && codes[i + 1] === 2) { colour = '#' + codes.slice(i + 2, i + 5).map(value => value.toString(16).padStart(2, '0')).join(''); i += 4 }
      else if (codes[i] === 39 || codes[i] === 0 || Number.isNaN(codes[i])) colour = null
    }
  }
  return found
}
const html = found => found.map(run => run.colour ? `<span style="color:${run.colour}">${escape(run.text)}</span>` : escape(run.text)).join('')
/**
 * ANSI to HTML for the frames Ink prints: one flat span per coloured run, the colour as the hex Ink emitted,
 * so the page carries exactly the CLI's colours. Uncoloured text stays bare and inherits the window's ink.
 */
export function ansiToHtml(frame) { return html(runs(frame)) }
/** The runs between two visible character positions. */
function slice(found, from, to) {
  const out = []
  let position = 0
  for (const run of found) {
    const characters = [...run.text], start = Math.max(from - position, 0), end = Math.min(to - position, characters.length)
    if (end > start) out.push({ colour: run.colour, text: characters.slice(start, end).join('') })
    position += characters.length
  }
  return out
}

export async function capture(props) {
  const instance = render(React.createElement(TerminalOutput, props))
  await new Promise(resolve => setTimeout(resolve, 30))
  const frame = instance.lastFrame()
  instance.unmount()
  instance.cleanup()
  if (!frame) throw new Error('Ink produced no terminal frame')
  // Annotate the already-rendered report columns for responsive reflow: rank, count and impact stay fixed, the problem wraps.
  // Text content, including column padding and colour, remains identical to the Ink frame.
  const fragment = props.report ? frame.split('\n').map(line => {
    const columns = /^([▏ ] *\d+)(  +\d+ of \d+  (?:\w+ +)?)(.+)$/.exec(stripVTControlCharacters(line))
    if (!columns) return ansiToHtml(line)
    const [rank, count] = [[...columns[1]].length, [...columns[1]].length + columns[2].length]
    const cut = (from, to) => html(slice(runs(line), from, to))
    return `<span class="terminal-report-line${columns[1].startsWith('▏') ? ' selected' : ''}"><span class="terminal-rank">${cut(0, rank)}</span><span class="terminal-count">${cut(rank, count)}</span><span class="terminal-problem">${cut(count, Infinity)}</span></span>`
  }).join('\n') : ansiToHtml(frame)
  return { frame, html: fragment + '\n' }
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
