import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { readableRecord } from '../src/consumers.ts'
import { createMcpServer } from '../src/mcp/server.ts'
import { stubScreenshotter } from '../src/runner/screenshot.ts'
import { openStore } from '../src/store/open.ts'
import type { RunRecord } from '../src/record/schema.ts'
import { stubServer } from './server-stub.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
/** The ui-tests server the invite links are on. */
let server: Awaited<ReturnType<typeof stubServer>>
let work: string
let data: string
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  server = await stubServer()
  work = await mkdtemp(join(fixtures, '.tmp-mcp-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-mcp-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${url}' } }\n`)
})
afterAll(async () => {
  await server.close()
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

const io = (): Io => ({ stdout: { write: () => true }, stderr: { write: () => true }, cwd: work, env: { UI_TESTS_DATA_DIR: data }, deps: { pollMs: 1, screenshotter: stubScreenshotter(new Uint8Array([0])) } })

async function connect() {
  const server = createMcpServer(io())
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  cleanup.push(() => client.close())
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args }) as { isError?: boolean; content: { type: string; text: string }[] }
    return { isError: result.isError === true, text: result.content[0]!.text, json: () => JSON.parse(result.content[0]!.text) }
  }
  return { client, call }
}

async function cli(...argv: string[]) {
  let out = ''
  const code = await main(argv, { ...io(), stdout: { write: t => (out += t) } })
  return { code, out }
}

describe('the MCP server', () => {
  it('lists exactly the seven tools', async () => {
    const { client } = await connect()
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual(['estimate', 'lint', 'report', 'run', 'status', 'trace', 'verify'])
    expect(tools.find(t => t.name === 'run')!.inputSchema.required).toContain('actor')
  })

  it('refuses run without an actor, and refuses both', async () => {
    const { call } = await connect()
    await expect(call('run', {})).resolves.toMatchObject({ isError: true })
    await expect(call('run', { actor: 'both' })).resolves.toMatchObject({ isError: true })
  })

  it('returns the same run for one key', async () => {
    const { call } = await connect()
    const first = await call('run', { actor: 'human', key: 'mcp-key-1' })
    const second = await call('run', { actor: 'human', key: 'mcp-key-1' })
    expect(first.isError).toBe(false)
    expect(first.json()).toMatchObject({ run: expect.stringMatching(/^r_/), key: 'mcp-key-1', actor: 'human', result: 'pending' })
    expect(second.json().run).toBe(first.json().run)
    const other = await call('run', { actor: 'human', key: 'mcp-key-2' })
    expect(other.json().run).not.toBe(first.json().run)
  })

  it('returns what `lint --json` and `estimate --json` print', async () => {
    const { call } = await connect()
    const lint = await call('lint', {})
    expect(lint.isError).toBe(false)
    expect(`${lint.text}\n`).toBe((await cli('lint', '--json')).out)
    const estimate = await call('estimate', {})
    expect(`${estimate.text}\n`).toBe((await cli('estimate', '--json')).out)
    expect(estimate.json()).toEqual({ n: 5, minutes: 3 })
  })

  it('reports a study that fails to load as a tool error', async () => {
    const { call } = await connect()
    const result = await call('lint', { files: ['missing.ui.test.ts'] })
    expect(result.isError).toBe(true)
    expect(result.json().error.message).toBeTruthy()
  })

  it('gives status and verify as the CLI does, and no hooks, expected answers or identity anywhere', async () => {
    const { call } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-3' })).json()
    const status = await call('status', { run })
    expect(`${status.text}\n`).toBe((await cli('status', run, '--json')).out)
    expect(status.json()).toMatchObject({ run, states: { recruitment: 'open' } })
    const verify = await call('verify', { run })
    expect(verify.json()).toMatchObject({ run, verified: 0, attempts: expect.any(Array) })
    const report = await call('report', { run, use: 'workflow' })
    for (const text of [status.text, verify.text, report.text]) expect(text).not.toMatch(/hooksBundle|"expected"|"identity"|"hooks"/)
    expect(report.json().handle.run).toBe(run)
    expect((await call('status', { run: 'r_missing' })).isError).toBe(true)
  })

  it('is a workflow consumer: words come only from people who agreed to share with a workflow, and the withheld are counted', async () => {
    const { call } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-4' })).json()
    const store = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => store.close())
    const make = async (participant: string, purposes: string[]) => {
      const { attempt } = await store.createAttempt({ runId: run, participant, goalIndex: 0, rehearsal: false })
      await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(5000).toISOString(), answers: { 'goal0.ease': 2, 'goal0.difficulty': `words of ${participant}` } })
    }
    await make('author-only', ['analysis by the author'])
    await make('everything', ['analysis by the author', 'model-assisted analysis of the trace', 'sharing the record with an automated workflow'])
    const wordsOf = (record: RunRecord) => record.attempts.filter(a => a.status === 'finished').map(a => [a.participant, a.answers])
    const expected = [['author-only', { 'goal0.ease': 2 }], ['everything', { 'goal0.ease': 2, 'goal0.difficulty': 'words of everything' }]]
    const report = (await call('report', { run })).json()
    expect(wordsOf(report)).toEqual(expected)
    expect(report.withheld).toBe(1)
    // A `use` argument cannot widen the gate.
    expect(wordsOf((await call('report', { run, use: 'recordings' })).json())).toEqual(expected)
    const traced = (await call('trace', { run })).json()
    expect(traced.withheld).toBe(1)
    expect(wordsOf(traced.record)).toEqual(expected)
    expect(JSON.stringify(traced)).not.toContain('words of author-only')
    expect(traced.attempts.map((a: { attempt: string }) => a.attempt)).toHaveLength(1)
  })

  it('keeps every word of an author-only attempt out of report and trace: first look, comment, voice, screener and typed answer; codes and scales stay', async () => {
    const { call } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-6' })).json()
    const store = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => store.close())
    const { attempt } = await store.createAttempt({ runId: run, participant: 'closed', goalIndex: 0, rehearsal: false })
    await store.updateAttempt(attempt.id, {
      status: 'finished', reason: 'done', purposes: ['analysis by the author'], startedAt: new Date(0).toISOString(), endedAt: new Date(5000).toISOString(),
      answers: {
        screener: { 'screener.today': 'secret-screener' },
        screenerResult: { matches: true, outside: [], fit: { total: 5 } },
        impression: { text: 'secret-first-look', code: 'did not name it', codedBy: 'rule', firstClick: null, firstClickReason: 'off the target' },
        'goal0.ease': 3, 'goal0.difficulty': 'secret-voice-transcript', 'goal0.difficulty.voice': 'blob-1',
        'Which plan was shown?': 'secret-typed-answer', useful: 4, easy: 5, uxliteVersion: 'v1', anything: 'secret-comment', moreTime: true,
      },
      verification: { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: 'Team', actual: 'secret-typed-answer' }, steps: [], answer: { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: 'Team', actual: 'secret-typed-answer' } } },
    })
    const report = (await call('report', { run })).json()
    const traced = (await call('trace', { run })).json()
    for (const text of [JSON.stringify(report), JSON.stringify(traced)]) expect(text).not.toMatch(/secret-/)
    const closed = report.attempts.find((a: { participant: string }) => a.participant === 'closed')
    expect(closed.answers).toEqual({
      screenerResult: { matches: true, outside: [], fit: { total: 5 } },
      impression: { code: 'did not name it', codedBy: 'rule', firstClick: null, firstClickReason: 'off the target' },
      'goal0.ease': 3, useful: 4, easy: 5, uxliteVersion: 'v1', moreTime: true,
    })
    expect(closed.verification).toMatchObject({ status: 'incorrect', answer: { status: 'incorrect' } })
  })

  it('drops the words and moments of closed attempts from the issues', () => {
    const attempt = (id: string, participant: string, purposes: string[]) => ({ id, participant, purposes, restrictions: [], answers: {} })
    const record = {
      attempts: [attempt('a1', 'p1', ['analysis by the author']), attempt('a2', 'p2', ['analysis by the author', 'model-assisted analysis of the trace'])],
      issues: [{ words: [{ participant: 'p1', text: 'one' }, { participant: 'p2', text: 'two' }], moments: [{ attempt: 'a1', at: 1 }, { attempt: 'a2', at: 2 }], count: '2 of 5' }],
    } as unknown as RunRecord
    expect(readableRecord(record, 'words').issues[0]).toMatchObject({ words: [{ participant: 'p2', text: 'two' }], moments: [{ attempt: 'a2', at: 2 }] })
    expect(readableRecord(record, 'words').issues[0]!.words).toEqual([{ participant: 'p2', text: 'two' }])
    expect(readableRecord(record, 'recordings').issues[0]).toMatchObject({ words: [{ text: 'one' }, { text: 'two' }], moments: [{ attempt: 'a1' }, { attempt: 'a2' }] })
    expect(readableRecord(record, 'workflow').issues[0]).toMatchObject({ words: [], moments: [] })
  })

  it('returns the trace as data and starts no server', async () => {
    const { call } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-5' })).json()
    const traced = (await call('trace', { run })).json()
    expect(traced).toMatchObject({ run, record: { handle: { run } }, withheld: 0, attempts: [] })
    expect(JSON.stringify(traced)).not.toMatch(/http:\/\/(127|localhost)[^"]*\/runs\//)
    expect((await call('trace', { run: 'r_missing' })).isError).toBe(true)
  })

  it('serves over stdio from the ui-tests mcp command', async () => {
    const transport = new StdioClientTransport({ command: 'node', args: [join(import.meta.dirname, '../bin/ui-tests.mjs'), 'mcp'], cwd: work, env: { PATH: process.env.PATH ?? '', UI_TESTS_DATA_DIR: data }, stderr: 'pipe' })
    const client = new Client({ name: 'test', version: '0.0.0' })
    cleanup.push(() => client.close())
    await client.connect(transport)
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(7)
    const estimate = await client.callTool({ name: 'estimate', arguments: {} }) as { content: { text: string }[] }
    expect(JSON.parse(estimate.content[0]!.text)).toEqual({ n: 5, minutes: 3 })
  }, 30_000)

  it('exits by itself when the client closes stdin after a trace call', async () => {
    const { spawn } = await import('node:child_process')
    const child = spawn('node', [join(import.meta.dirname, '../bin/ui-tests.mjs'), 'mcp'], { cwd: work, env: { PATH: process.env.PATH ?? '', UI_TESTS_DATA_DIR: data }, stdio: ['pipe', 'pipe', 'pipe'] })
    cleanup.push(() => { child.kill() })
    let out = ''
    child.stdout.on('data', d => (out += d))
    const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`)
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } })
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'trace', arguments: { run: 'r_missing' } } })
    await vi.waitFor(() => expect(out).toContain('"id":2'), { timeout: 15_000 })
    const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)))
    child.stdin.end()
    expect(await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('still running'), 5000))])).toBe(0)
  }, 30_000)
})
