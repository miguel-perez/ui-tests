import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { readableRecord } from '../src/consumers.ts'
import { createMcpServer } from '../src/mcp/server.ts'
import { stubScreenshotter } from '../src/runner/screenshot.ts'
import { openStore } from '../src/store/open.ts'
import type { RunRecord } from '../src/record/schema.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let work: string
let data: string
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  work = await mkdtemp(join(fixtures, '.tmp-mcp-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-mcp-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${url}' } }\n`)
})
afterAll(async () => {
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

  it('leaves out the words and recordings of people who did not agree to the use', async () => {
    const { call } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-4' })).json()
    const store = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => store.close())
    const consent = ['analysis by the author', 'model-assisted analysis of the trace', 'sharing the record with an automated workflow']
    const make = async (participant: string, purposes: string[]) => {
      const { attempt } = await store.createAttempt({ runId: run, participant, goalIndex: 0, rehearsal: false })
      await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(5000).toISOString(), answers: { 'goal0.ease': 2, 'goal0.difficulty': `words of ${participant}` } })
    }
    await make('author-only', ['analysis by the author'])
    await make('everything', consent)
    const wordsOf = async (use: string) => {
      const record = (await call('report', { run, use })).json() as RunRecord
      return record.attempts.filter(a => a.status === 'finished').map(a => [a.participant, a.answers])
    }
    expect(await wordsOf('words')).toEqual([['author-only', { 'goal0.ease': 2 }], ['everything', { 'goal0.ease': 2, 'goal0.difficulty': 'words of everything' }]])
    expect(await wordsOf('recordings')).toEqual([['author-only', { 'goal0.ease': 2, 'goal0.difficulty': 'words of author-only' }], ['everything', { 'goal0.ease': 2, 'goal0.difficulty': 'words of everything' }]])
    expect(await wordsOf('workflow')).toEqual([['author-only', { 'goal0.ease': 2 }], ['everything', { 'goal0.ease': 2, 'goal0.difficulty': 'words of everything' }]])
    expect((await call('report', { run, use: 'anything' })).isError).toBe(true)
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

  it('serves the trace on the loopback address only and stops with the server', async () => {
    const { call, client } = await connect()
    const { run } = (await call('run', { actor: 'human', key: 'mcp-key-5' })).json()
    const traced = await call('trace', { run })
    const { url } = traced.json()
    expect(new URL(url).hostname).toBe('127.0.0.1')
    expect((await call('trace', { run })).json().url).toBe(url)
    expect((await fetch(url)).status).toBe(200)
    expect((await call('trace', { run: 'r_missing' })).isError).toBe(true)
    await client.close()
    await expect(fetch(url)).rejects.toThrow()
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
})
