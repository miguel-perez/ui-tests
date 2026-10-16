// Run after npm run build, with PLAYWRIGHT_BROWSERS_PATH=0.
// Lighthouse connects to Chromium launched by Playwright; it never discovers Chrome.
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const root = process.cwd()
if (!path.resolve(chromium.executablePath()).startsWith(root + path.sep)) throw new Error('Use worktree-local Playwright Chromium')
const directory = path.join(root, '.archon/runtime/lighthouse')
await mkdir(directory, { recursive: true })
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/web', '--hostname', '127.0.0.1', '--port', '3100'], { cwd: root, stdio: 'pipe' })
let logs = ''
server.stdout.on('data', data => { logs += data })
server.stderr.on('data', data => { logs += data })
const socket = createServer()
await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
const port = socket.address().port
await new Promise(resolve => socket.close(resolve))
let browser
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs)
    try { if ((await fetch('http://127.0.0.1:3100')).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  if (!ready) throw new Error('Production server did not become ready')
  browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] })
  const summaries = []
  for (const [name, route] of [['landing', '/'], ['guide', '/docs/getting-started']]) {
    for (const mobile of [false, true]) {
      const result = await lighthouse(`http://127.0.0.1:3100${route}`, { port, onlyCategories: ['performance', 'accessibility'], output: 'json', logLevel: 'error', formFactor: mobile ? 'mobile' : 'desktop', screenEmulation: { mobile, width: mobile ? 375 : 1440, height: 1000, deviceScaleFactor: 1, disabled: false } }, mobile ? undefined : desktopConfig)
      const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)]))
      const summary = { route, width: mobile ? 375 : 1440, ...scores }
      summaries.push(summary)
      console.log(JSON.stringify(summary))
      await writeFile(path.join(directory, `${name}-${summary.width}.json`), result.report)
    }
  }
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify({ browser: chromium.executablePath(), results: summaries }, null, 2))
  if (summaries.some(result => result.performance < 90 || result.accessibility < 90)) throw new Error('Lighthouse scores below required 90')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
  await writeFile(path.join(directory, 'server.log'), logs)
}
