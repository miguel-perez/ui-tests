import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/** A stub on a free loopback port. `answer` handles every request; the default answers `/healthz` as a ui-tests server does. */
export async function stubServer(answer: RequestListener = (req, res) => {
  if (req.url === '/healthz') res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true,"name":"ui-tests"}')
  else res.writeHead(404).end('Not found')
}): Promise<{ url: string; server: Server; close(): Promise<void> }> {
  const server = createServer(answer)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    server,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }),
  }
}

/** A loopback port nothing listens on: bound once, then closed. */
export async function freePort(): Promise<number> {
  const { url, close } = await stubServer()
  await close()
  return Number(new URL(url).port)
}
