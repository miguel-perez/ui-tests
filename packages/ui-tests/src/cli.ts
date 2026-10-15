import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { userInfo } from 'node:os'
import { build } from 'esbuild'
import { compileFile } from './compiler.ts'
import { SQLiteAdapter, dataDirectory } from './storage.ts'
import { verify } from './verify.ts'
import { renderTrace } from './trace.tsx'
import type { Context } from './index.ts'

const args = process.argv.slice(2)
const command = args[0]?.startsWith('-') ? 'dev' : args[0] ?? 'dev'
function option(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
async function exists(file: string) { try { await access(file); return true } catch { return false } }
async function findTests(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'factory'].includes(entry.name)) continue
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await findTests(file))
    else if (entry.name.endsWith('.ui.test.ts')) files.push(file)
  }
  return files.sort()
}
function open(url: string) {
  if (args.includes('--no-open')) return
  const child = process.platform === 'darwin' ? spawn('open', [url]) : process.platform === 'win32' ? spawn('cmd', ['/c', 'start', '', url]) : spawn('xdg-open', [url])
  child.on('error', () => console.log(`Open this URL in your browser: ${url}`)); child.unref()
}
async function init() {
  const files: Record<string, string> = {
    'ui-tests.config.ts': `import { defineConfig } from 'ui-tests'\nexport default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })\n`,
    'landing.ui.test.ts': `import { context, goal, outcome, expect } from 'ui-tests'\ncontext({ users: 'developers who ship UI and have no researcher', purpose: 'find out whether people can use what I built, without a researcher' }, () => {\n  goal('start trying ui-tests', { happyPath: ['/', '/docs/getting-started'] }, () => {\n    outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })\n  })\n})\n`,
  }
  // Preserve an existing Vitest setup; add the exclusion without replacing its settings.
  const existingConfig = (await Promise.all(['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vite.config.ts'].map(async file => await exists(file) ? file : null))).find(Boolean)
  if (existingConfig) {
    const text = await readFile(existingConfig, 'utf8')
    if (!text.includes('**/*.ui.test.ts')) {
      let updated: string
      if (/exclude\s*:\s*\[/.test(text)) updated = text.replace(/exclude\s*:\s*\[/, "exclude: ['**/*.ui.test.ts', ")
      else if (/test\s*:\s*\{/.test(text)) updated = text.replace(/test\s*:\s*\{/, "test: { exclude: ['**/node_modules/**', '**/dist/**', '**/*.ui.test.ts'], ")
      else if (/defineConfig\(\s*\{/.test(text)) updated = text.replace(/defineConfig\(\s*\{/, "defineConfig({ test: { exclude: ['**/node_modules/**', '**/dist/**', '**/*.ui.test.ts'] }, ")
      else throw new Error(`Cannot safely extend ${existingConfig}; add '**/*.ui.test.ts' to test.exclude and rerun init.`)
      files[existingConfig] = updated
    }
  } else files['vitest.config.ts'] = `import { defineConfig, configDefaults } from 'vitest/config'\nexport default defineConfig({ test: { exclude: [...configDefaults.exclude, '**/*.ui.test.ts'] } })\n`
  for (const [file, contents] of Object.entries(files)) {
    if (file === existingConfig) { await writeFile(file, contents); console.log(`Updated ${file}`) }
    else if (await exists(file)) console.log(`Preserved ${file}`)
    else { await writeFile(file, contents, { flag: 'wx' }); console.log(`Created ${file}`) }
  }
  console.log(`Mount instructions:\n1. Import { UiTests } from 'ui-tests/next' and mount <UiTests /> in your root layout body.\n2. In app/ui-tests/[run]/page.tsx render <Player runId={run} token={token} /> from 'ui-tests/next'.\n3. In app/api/ui-tests/route.ts export GET and POST = createCollector() from 'ui-tests/server'; export const runtime = 'nodejs'.\n4. Run npm run dev, then npx ui-tests.`)
}
async function main() {
  if (command === 'init') return init()
  if (command === 'verify') {
    const id = args[1]
    if (!id) throw new Error('Usage: ui-tests verify <run-id> [--file test.ui.test.ts]')
    const store = new SQLiteAdapter()
    try {
      const run = store.get(id); if (!run) throw new Error('Run not found')
      if (!run.hooksBundle || !await exists(run.hooksBundle)) throw new Error('The stored hooks bundle is missing; repeat the rehearsal to restore the authored evidence.')
      const authored = (await import(pathToFileURL(run.hooksBundle).href)).default as Context[]
      run.result = await verify(run, authored[run.authoredContextIndex ?? 0].goals[run.goalIndex], store.events(run.id)); store.update(run)
      console.log(JSON.stringify(run.result, null, 2))
    } finally { store.close() }
    return
  }
  const file = option('--file') ?? (await findTests(process.cwd()))[0]
  if (!file) throw new Error('No *.ui.test.ts found. Run npx ui-tests init.')
  const result = await compileFile(file, path.join(dataDirectory(), 'compiled'))
  for (const d of result.diagnostics) console.log(`${d.severity} [${d.rule}] ${d.source}\n  ${d.reason} Fix: ${d.fix}`)
  if (result.diagnostics.some(d => d.severity === 'error')) throw new Error('Lint failed; fix the rules above before starting dev mode.')
  if (command === 'lint') { console.log(`Compiled ${file}: ${result.bundle.replace(/hooks-.*$/, 'context.json')}`); return }
  if (command !== 'dev') throw new Error(`Unknown command: ${command}`)
  const store = new SQLiteAdapter()
  const configFile = path.resolve('ui-tests.config.ts')
  let config: { target: { url: string }; author?: string } = { target: { url: 'http://localhost:3000' } }
  if (await exists(configFile)) {
    // Compile config to ESM too: host apps need not set package.json type=module.
    const configBundle = result.bundle.replace('hooks-', 'config-')
    await build({ entryPoints: [configFile], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: configBundle })
    config = (await import(pathToFileURL(configBundle).href)).default
  }
  const selectedContext = option('--context'), selectedGoal = option('--goal')
  const pending = result.compiled.flatMap((compiled, contextIndex) => compiled.goals.map((_, goalIndex) => ({ compiled, contextIndex, goalIndex })))
    .filter(entry => (selectedContext === undefined || entry.contextIndex === Number(selectedContext)) && (selectedGoal === undefined || entry.goalIndex === Number(selectedGoal)))
  if (!pending.length) throw new Error('No matching context/goal; --context and --goal are zero-based indices.')
  let active = pending.shift()!
  function createRun() {
    active.compiled.author = config.author ?? result.authored[active.contextIndex].author ?? userInfo().username
    const created = store.create(active.compiled, active.goalIndex)
    created.hooksBundle = result.bundle; created.authoredContextIndex = active.contextIndex; store.update(created)
    return created
  }
  const target = new URL(config.target.url)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) throw new Error('This slice supports local dev targets only.')
  let run = createRun()
  const owned = new Set([run.id])
  const server = createServer((request, response) => {
    const [, id, token] = request.url?.split('/') ?? []
    const requested = owned.has(id) ? store.authorize(id, token ?? '') : undefined
    if (!requested) { response.writeHead(404).end(); return }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' })
    response.end(renderTrace(requested, store.events(id)))
  })
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(Number(option('--port') ?? 0), '127.0.0.1', resolve) })
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Viewer did not start')
  const viewerOrigin = `http://127.0.0.1:${address.port}`
  function traceUrl() { return `${viewerOrigin}/${run.id}/${run.token}` }
  function launch() {
    const player = new URL(`/ui-tests/${run.id}`, target); player.searchParams.set('token', run.token)
    console.log(`Player: ${player}\nTrace: ${traceUrl()}\nRun: ${run.id}`)
    open(player.href)
  }
  launch()
  let completed = false, verifying = false
  const interval = setInterval(async () => {
    if (completed || verifying) return
    const current = store.get(run.id)!
    if (!['questions', 'finished'].includes(current.status)) return
    const previous = structuredClone(current)
    verifying = true
    try {
      current.result = await verify(current, result.authored[active.contextIndex].goals[active.goalIndex], store.events(current.id))
      if (!store.update(current, previous)) return
      if (current.status === 'finished' && !(current.result as { question?: unknown }).question) {
        console.log(`Outcome: ${(current.result as { status: string }).status}\n${active.compiled.goals[active.goalIndex].resultSentence ?? 'Issues-only exploration; no result sentence.'}\nTrace: ${traceUrl()}`)
        open(traceUrl())
        if (pending.length) {
          active = pending.shift()!
          run = createRun(); owned.add(run.id); launch()
        } else completed = true
      }
    } catch (error) { console.error(error) } finally { verifying = false }
  }, 100)
  function stop() { clearInterval(interval); server.close(); store.close(); process.exit(0) }
  process.on('SIGINT', stop); process.on('SIGTERM', stop)
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
