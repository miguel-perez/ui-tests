import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect as vitestExpect, it } from 'vitest'
import { httpHarness } from '../src/agents/harness-http.ts'
import { runTrials } from '../src/agents/loop.ts'
import { scriptedModel, type ScriptedTurn } from '../src/agents/scripted.ts'
import { expect } from '../src/expect.ts'
import type { RunStore } from '../src/store/types.ts'
import type { Hook } from '../src/types.ts'
import { agentStudy } from './agent-fixtures.ts'

let server: Server
let url: string
let members: { name: string }[] = []
const seen: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`)
    let body = ''
    req.on('data', chunk => (body += chunk))
    req.on('end', () => {
      if (req.url === '/members' && req.method === 'GET') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(members))
      if (req.url === '/members' && req.method === 'POST') { members.push(JSON.parse(body)); return void res.writeHead(201, { 'content-type': 'application/json' }).end(body) }
      if (req.url === '/big') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('y'.repeat(500_000))
      if (req.url === '/away') return void res.writeHead(302, { location: 'http://example.com/' }).end()
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})
let stores: RunStore[] = []
beforeEach(() => { members = []; seen.length = 0 })
afterEach(async () => { for (const store of stores) await store.close(); stores = [] })

const adaAdded: Hook = async ({ request }) => {
  const response = await request.get('/members')
  expect(await response.json()).toContainEqual({ name: 'Ada' })
}
const done: ScriptedTurn = { toolCalls: [{ name: 'done', input: {} }] }
const call = (method: string, path: string, body?: unknown): ScriptedTurn => ({ toolCalls: [{ name: 'request', input: { method, path, ...(body !== undefined && { body }) } }] })

async function trialsOf(script: ScriptedTurn[], hook: Hook = adaAdded) {
  const made = await agentStudy({ target: { http: url }, hook, trials: 1, scenario: 'Add Ada as a member of the team.' })
  stores.push(made.store)
  return runTrials({ ...made, model: scriptedModel(script), harness: httpHarness(url, 'A team API: GET and POST /members.') })
}

describe('agent trials through the http harness', () => {
  it('verifies a trial whose request reached the end state, and lists its side effects', async () => {
    const [trial] = await trialsOf([call('POST', '/members', { name: 'Ada' }), done])
    vitestExpect(trial).toMatchObject({ state: 'verified', claimedDone: true, sideEffects: ['POST /members answered 201'] })
    const tool = trial.transcript.find(m => m.role === 'tool')
    vitestExpect(tool?.role === 'tool' && tool.output).toMatch(/^201 Created\ncontent-type: application\/json/)
  })

  it('stops a trial that called a path that does not exist, and says so in one line', async () => {
    const [trial] = await trialsOf([call('POST', '/invites', { email: 'ada@example.com' }), done])
    vitestExpect(trial).toMatchObject({ state: 'stopped', claimedDone: true, stoppedBy: 'called POST /invites, which does not exist' })
    vitestExpect(trial.verification.status).toBe('incorrect')
    vitestExpect(trial.cost).toMatchObject({ tokens: 240, calls: 2 })
    vitestExpect(trial.sideEffects).toEqual([])
  })

  it('reads a hook with no evidence as unknown, never as stopped', async () => {
    const [trial] = await trialsOf([call('POST', '/members', { name: 'Ada' }), done], async ({ page }) => { expect(page.textContent('h1')).toBe('Ada') })
    vitestExpect(trial.state).toBe('unknown')
    vitestExpect(trial.stoppedBy).toBeUndefined()
    vitestExpect(trial.verification).toMatchObject({ status: 'unknown', reason: 'Missing end-state snapshot' })
    vitestExpect(trial.cost.tokens).toBeGreaterThan(0)
  })

  it('reaches only the configured origin', async () => {
    const harness = httpHarness(url)
    for (const path of ['http://example.com/', '//example.com/x', 'members']) {
      vitestExpect((await harness.call('request', { method: 'GET', path })).error).toMatch(/but only paths on http:\/\/127\.0\.0\.1:\d+ starting with \/ can be called$/)
    }
    const redirect = await harness.call('request', { method: 'GET', path: '/away' })
    vitestExpect(redirect.output).toMatch(/^302 Found\n.*\nlocation: http:\/\/example.com\//)
    vitestExpect(seen).toEqual(['GET /away'])
    vitestExpect((await harness.call('request', { method: 'TRACE', path: '/' })).error).toBe('called TRACE, which is not an HTTP method here')
  })

  it('stays under a base path, gives the agent the API description, and reads no more of a body than it shows', async () => {
    const scoped = httpHarness(`${url}/api`, 'Members live under /api/members.', { outputCap: 1000 })
    vitestExpect(scoped.tools()[0].description).toContain('About the API: Members live under /api/members.')
    for (const path of ['/../members', '/api/../members', '/%2e%2e/members']) {
      vitestExpect((await scoped.call('request', { method: 'GET', path })).error).toBe(`called GET ${path}, which is outside ${url}/api`)
    }
    vitestExpect(seen).toEqual([])
    const big = await httpHarness(url, undefined, { outputCap: 1000 }).call('request', { method: 'GET', path: '/big' })
    vitestExpect(big.output).toMatch(/\n\ny{1000}\n\[body cut at 1000 characters\]$/)
  })

  it('passes the target description from the study to the harness', async () => {
    const made = await agentStudy({ target: { http: url, description: 'A team API: GET and POST /members.' }, hook: adaAdded, trials: 1 })
    stores.push(made.store)
    vitestExpect(made.goal.agent?.target).toEqual({ kind: 'http', value: url, description: 'A team API: GET and POST /members.' })
  })

  it('names the status of other errors and resets its side effects between trials', async () => {
    const harness = httpHarness(`${url}/`)
    await harness.call('request', { method: 'POST', path: '/members', body: { name: 'Grace' } })
    vitestExpect((await harness.endState()).sideEffects).toEqual(['POST /members answered 201'])
    await harness.reset()
    vitestExpect((await harness.endState()).sideEffects).toEqual([])
    const unreachable = httpHarness('http://127.0.0.1:9')
    vitestExpect((await unreachable.call('request', { method: 'GET', path: '/' })).error).toBe('called GET /, which could not be reached')
  })
})
