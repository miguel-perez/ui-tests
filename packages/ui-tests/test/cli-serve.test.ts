import { mkdtemp, rm } from 'node:fs/promises'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'

let data: string
beforeAll(async () => { data = await mkdtemp(join(tmpdir(), 'ui-tests-serve-')) })
afterAll(async () => { await rm(data, { recursive: true, force: true }) })

/** Starts `ui-tests serve` and waits for it to print the tag; `stop` aborts it and resolves with the exit code. */
async function serve(argv: string[], env: Record<string, string> = {}) {
  const controller = new AbortController()
  let out = ''
  let err = ''
  const io: Io = { stdout: { write: (t) => (out += t) }, stderr: { write: (t) => (err += t) }, cwd: data, env: { UI_TESTS_DATA_DIR: data, ...env }, deps: { signal: controller.signal } }
  const code = main(['serve', ...argv], io)
  let settled: number | undefined
  void code.then((c) => { settled = c })
  while (settled === undefined && !out.includes('<script data-ui-tests=')) await new Promise((resolve) => setTimeout(resolve, 20))
  return { out: () => out, err: () => err, settled: () => settled, stop: async () => { controller.abort(); return code } }
}

describe('ui-tests serve', () => {
  it('prints its address and the tag for it, answers on the port it bound, and stops on the signal', async () => {
    const server = await serve(['--port', '0', '--bind', '127.0.0.1'])
    const [first, second] = server.out().split('\n')
    expect(first).toMatch(/^ui-tests server: http:\/\/localhost:\d+$/)
    expect(second).toMatch(/^<script data-ui-tests="http:\/\/localhost:\d+">/)
    const port = /:(\d+)$/.exec(first!)![1]
    const health = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, name: 'ui-tests' })
    expect(await server.stop()).toBe(0)
  }, 60_000)

  const lan = Object.values(networkInterfaces()).flat().find((info) => info && info.family === 'IPv4' && !info.internal)?.address
  it.skipIf(!lan)('names the address it is bound to when that is one interface, not every one', async () => {
    const server = await serve(['--port', '0', '--bind', lan!])
    const [first, second] = server.out().split('\n')
    expect(first).toMatch(new RegExp(`^ui-tests server: http://${lan!.replace(/\./g, '\\.')}:\\d+$`))
    expect(second).toContain(`<script data-ui-tests="http://${lan}:`)
    expect((await fetch(`${first!.slice('ui-tests server: '.length)}/healthz`)).status).toBe(200)
    expect(await server.stop()).toBe(0)
  }, 60_000)

  it('names the public address in the tag when one is set', async () => {
    const server = await serve(['--port', '0', '--bind', '127.0.0.1'], { UI_TESTS_PUBLIC_URL: 'https://t.test' })
    expect(server.out()).toContain('ui-tests server: https://t.test\n<script data-ui-tests="https://t.test">')
    expect(await server.stop()).toBe(0)
  }, 60_000)

  it('refuses to start on a public address that is not an http(s) origin', async () => {
    for (const bad of ['tests.example.com', 'ftp://t.test', 'https://t.test/studies']) {
      const server = await serve(['--port', '0'], { UI_TESTS_PUBLIC_URL: bad })
      expect(server.settled(), bad).toBe(2)
      expect(server.err()).toContain('UI_TESTS_PUBLIC_URL')
      expect(server.out()).toBe('')
    }
  })

  it('refuses a port that is not a number', async () => {
    const server = await serve(['--port', 'abc'])
    expect(server.settled()).toBe(2)
    expect(server.err()).toContain('--port')
  })
})
