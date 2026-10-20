import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Tunnel } from './types.ts'

/**
 * A tunnel for tests and offline runs (`UI_TESTS_TUNNEL=fake`): a local reverse proxy on a port of its own, so the "public" URL is
 * `http://127.0.0.1:<proxy>` and everything reaches the build the way it would through a real tunnel. Never touches the network.
 */
export function fakeTunnel(): Tunnel {
  return {
    async open(localUrl) {
      const target = new URL(localUrl)
      const server: Server = createServer((req, res) => {
        const upstream = request({ hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } }, answer => {
          res.writeHead(answer.statusCode ?? 502, answer.headers)
          answer.pipe(res)
        })
        upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
        req.pipe(upstream)
      })
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
      let closed = false
      return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: async () => {
          if (closed) return
          closed = true
          server.closeAllConnections()
          await new Promise<void>(resolve => server.close(() => resolve()))
        },
      }
    },
  }
}
