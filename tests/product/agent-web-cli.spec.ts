import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { main, type Io } from '../../packages/ui-tests/src/cli/main.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { PRODUCT_URL, SERVER_URL } from './helpers'

/**
 * `ui-tests --actor agent` on a web target: the CLI runs the web harness through the player on the ui-tests server, and the task on
 * the target, whose tag sends the bar back to that server.
 */

const fixtures = join(import.meta.dirname, 'fixtures')

async function project(target: string, server = SERVER_URL) {
  const work = await mkdtemp(join(fixtures, '.tmp-agent-web-'))
  const source = (await readFile(join(fixtures, 'agent-web.ui.test.ts'), 'utf8')).replace('http://127.0.0.1:3100', target)
  await writeFile(join(work, 'agent-web.ui.test.ts'), source)
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server}' }, reporters: ['default', 'json'], agents: { model: { provider: 'scripted', name: './agent-script.json' } } }\n`)
  await writeFile(join(work, 'agent-script.json'), JSON.stringify([{ toolCalls: [{ name: 'goto', input: { path: '/docs/getting-started' } }] }, { toolCalls: [{ name: 'done', input: {} }] }]))
  const run = async (argv: string[]) => {
    let out = '', err = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR, PATH: process.env.PATH ?? '' }, deps: { signal: new AbortController().signal } }
    return { code: await main(argv, io), out, err }
  }
  return { work, run, cleanup: () => rm(work, { recursive: true, force: true }) }
}

test('drives one scripted trial end to end from the command line, through the player, as the agent', async () => {
  const p = await project(PRODUCT_URL)
  try {
    const key = `cli-web:${Date.now()}`
    const { code, out, err } = await p.run(['--actor', 'agent', '--commit', 'e2e', '--key', key])
    expect(err).toBe('')
    expect(code).toBe(0)
    expect(out).toMatch(/^Agent run r_\w+ · capability test, not usability\n/)
    expect(out).toContain('pass^k: pass · 1 of 1 verified')
    const runId = /Agent run (r_\w+)/.exec(out)![1]!
    const report = JSON.parse(await readFile(join(p.work, '.ui-tests', 'runs', runId, 'report.json'), 'utf8'))
    expect(report).toMatchObject({ run: runId, actor: 'agent', tasks: [{ result: 'pass', target: { kind: 'web', value: PRODUCT_URL } }] })
    // The server's own store holds the attempt: it went through the player and the collector.
    const store = await openStore()
    try {
      const [attempt] = await store.listAttempts(runId)
      expect(attempt).toMatchObject({ participant: 'agent:0:1', status: 'finished', reason: 'done', verification: { status: 'correct' } })
      expect((await store.getRun(runId))?.actor).toBe('agent')
      expect((await store.getSnapshot(attempt!.id, 'end'))?.url).toContain('/docs/getting-started')
    } finally { await store.close() }
  } finally { await p.cleanup() }
})

test('a server address where another site answers exits 2 before any run exists', async () => {
  const site = createServer((_req, res) => void res.writeHead(404).end('Not found'))
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
  const p = await project(PRODUCT_URL, url)
  try {
    const { code, out, err } = await p.run(['--actor', 'agent', '--commit', 'e2e'])
    expect(code).toBe(2)
    expect(err).toBe(`ui-tests server not reachable: ${url}\n`)
    expect(out).not.toContain('Agent run')
  } finally { await p.cleanup(); site.closeAllConnections(); await new Promise(resolve => site.close(resolve)) }
})
