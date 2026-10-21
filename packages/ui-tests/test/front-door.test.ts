import { request } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isServerPath, rewriteTag, SERVER_PREFIXES, startFrontDoor } from '../src/server/front-door.ts'
import { stubServer } from './server-stub.ts'

type Seen = { path: string; headers: Record<string, string | string[] | undefined> }
const appSeen: Seen[] = []
const serverSeen: Seen[] = []
const PAGE = '<!doctype html><html><head><script data-ui-tests="http://localhost:4300">x</script></head><body><div data-ui-tests="keep">é</div></body></html>'
const JSON_BODY = '{"tag":"<script data-ui-tests=\\"http://localhost:4300\\">"}'

let app: Awaited<ReturnType<typeof stubServer>>
let server: Awaited<ReturnType<typeof stubServer>>
let door: Awaited<ReturnType<typeof startFrontDoor>>

beforeAll(async () => {
  app = await stubServer((req, res) => {
    appSeen.push({ path: req.url ?? '', headers: req.headers })
    if (req.url === '/data.json') res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON_BODY) }).end(JSON_BODY)
    else if (req.url === '/empty') res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<script data-ui-tests="" src="/a.js"></script><script data-ui-tests=''></script>`)
    else if (req.url === '/away') res.writeHead(302, { Location: `${app.url}/landed` }).end()
    else res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(PAGE) }).end(PAGE)
  })
  server = await stubServer((req, res) => {
    serverSeen.push({ path: req.url ?? '', headers: req.headers })
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('server')
  })
  door = await startFrontDoor({ app: app.url, server: server.url, appHeaders: { 'x-vercel-protection-bypass': 'b' } })
})
afterAll(async () => {
  await door.close()
  await app.close()
  await server.close()
})

/** A GET through the door with the headers given (fetch will not set `Host`). */
function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(`${door.url}${path}`, { headers }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('isServerPath', () => {
  it('names the server\'s paths and nothing else', () => {
    expect(SERVER_PREFIXES).toEqual(['/ui-tests.js', '/ui-tests/', '/api/ui-tests/', '/r/', '/rv/'])
    for (const path of ['/ui-tests.js', '/ui-tests/r_X/', '/ui-tests/assets/bar-abc.js', '/api/ui-tests/', '/api/ui-tests/exchange', '/r/r_X', '/rv/r_X/p1']) expect(isServerPath(path), path).toBe(true)
    for (const path of ['/', '/ui-tests-guide', '/ui-tests.jsx', '/api/other', '/report', '/rvx']) expect(isServerPath(path), path).toBe(false)
  })
})

describe('rewriteTag', () => {
  it('changes the address of a script start tag only, keeping its quote', () => {
    expect(rewriteTag('<script data-ui-tests="http://localhost:4300">x</script>', 'https://a.example')).toBe('<script data-ui-tests="https://a.example">x</script>')
    expect(rewriteTag(`<SCRIPT async data-ui-tests='' >x</SCRIPT>`, 'http://h:1')).toBe(`<SCRIPT async data-ui-tests='http://h:1' >x</SCRIPT>`)
    expect(rewriteTag('<script data-x="a>b" data-ui-tests="old"></script>', 'http://h:1')).toBe('<script data-x="a>b" data-ui-tests="http://h:1"></script>')
    for (const same of ['<div data-ui-tests="keep"></div>', '<script data-ui-tests-root="keep"></script>', '<script title=\'data-ui-tests="x"\'></script>', '<scripts data-ui-tests="x">', '<script data-ui-tests=bare></script>']) expect(rewriteTag(same, 'http://h:1')).toBe(same)
  })
})

describe('startFrontDoor', () => {
  it('sends the server\'s paths to the server, saying which host the browser asked for', async () => {
    const host = new URL(door.url).host
    for (const path of ['/ui-tests.js', '/ui-tests/r_X/', '/api/ui-tests/?run=r_X', '/r/r_X', '/rv/r_X/p1']) {
      serverSeen.length = 0
      const answer = await get(path)
      expect(answer.body, path).toBe('server')
      expect(serverSeen).toHaveLength(1)
      expect(serverSeen[0]!.path).toBe(path)
      expect(serverSeen[0]!.headers['x-forwarded-host']).toBe(host)
      expect(serverSeen[0]!.headers['x-forwarded-proto']).toBe('http')
      // The app's headers are the app's alone.
      expect(serverSeen[0]!.headers['x-vercel-protection-bypass']).toBeUndefined()
    }
  })

  it('sends everything else to the app, with its headers and no compression', async () => {
    for (const path of ['/', '/ui-tests-guide', '/api/other']) {
      appSeen.length = 0
      await get(path, { 'Accept-Encoding': 'gzip, br' })
      expect(appSeen.map(s => s.path)).toEqual([path])
      expect(appSeen[0]!.headers['x-vercel-protection-bypass']).toBe('b')
      expect(appSeen[0]!.headers['accept-encoding']).toBe('identity')
      expect(appSeen[0]!.headers.host).toBe(new URL(app.url).host)
    }
  })

  it('never sends our cookies to the app, and keeps the app\'s own', async () => {
    appSeen.length = 0
    await get('/', { Cookie: 'session=abc; ui-tests-run=token; theme=dark' })
    await get('/', { Cookie: 'ui-tests-run=token; UI-TESTS-other=x' })
    await get('/')
    expect(appSeen.map(s => s.headers.cookie)).toEqual(['session=abc; theme=dark', undefined, undefined])
    serverSeen.length = 0
    await get('/api/ui-tests/', { Cookie: 'ui-tests-run=token' })
    expect(serverSeen[0]!.headers.cookie).toBe('ui-tests-run=token')
  })

  it('points the app\'s tag at the door, and changes nothing else', async () => {
    const page = await get('/')
    const port = new URL(door.url).port
    expect(page.body).toBe(PAGE.replace('http://localhost:4300', `http://127.0.0.1:${port}`))
    expect(page.headers['content-length']).toBeUndefined()
    expect((await get('/empty')).body).toBe(`<script data-ui-tests="http://127.0.0.1:${port}" src="/a.js"></script><script data-ui-tests='http://127.0.0.1:${port}'></script>`)
    const json = await get('/data.json')
    expect(json.body).toBe(JSON_BODY)
    expect(json.headers['content-length']).toBe(String(Buffer.byteLength(JSON_BODY)))
  })

  it('takes the address a tunnel names', async () => {
    const page = await get('/', { Host: 'abc.trycloudflare.com', 'X-Forwarded-Proto': 'https' })
    expect(page.body).toContain('<script data-ui-tests="https://abc.trycloudflare.com">')
    serverSeen.length = 0
    await get('/ui-tests.js', { Host: 'abc.trycloudflare.com', 'X-Forwarded-Proto': 'https' })
    expect(serverSeen[0]!.headers).toMatchObject({ 'x-forwarded-host': 'abc.trycloudflare.com', 'x-forwarded-proto': 'https' })
  })

  it('keeps a redirect on the door', async () => {
    const away = await get('/away')
    expect(away.status).toBe(302)
    expect(away.headers.location).toBe(`${door.url}/landed`)
  })

  it('answers 502 when the app is down, and closes', async () => {
    const other = await startFrontDoor({ app: 'http://127.0.0.1:1', server: server.url })
    expect((await fetch(other.url)).status).toBe(502)
    await other.close()
    await expect(fetch(other.url)).rejects.toThrow()
  })
})
