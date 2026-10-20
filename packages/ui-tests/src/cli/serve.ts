import { tagFor } from '../browser/tag.ts'
import { getBundles } from '../server/bundles.ts'
import { startServer } from '../server/http.ts'
import { getStore } from '../server/store.ts'
import { moduleTranscriber } from '../transcriber.ts'
import type { Command } from './main.ts'
import { pause } from './trace.ts'

/** A port from a flag or the environment: a whole number up to 65535, or undefined when it is not one. */
const portOf = (value: string) => (/^\d{1,5}$/.test(value) && Number(value) <= 65535 ? Number(value) : undefined)

/** The public address as an origin; undefined when it is not an absolute http(s) address with nothing after its host. */
function publicOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    const bare = url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password && !value.endsWith('#') && !value.endsWith('?')
    return (url.protocol === 'http:' || url.protocol === 'https:') && bare ? url.origin : undefined
  } catch { return undefined }
}

/** An abort signal that fires on Ctrl-C, and on the SIGTERM a container is stopped with (Node as PID 1 does not exit on it). */
function stopped(): AbortSignal {
  const controller = new AbortController()
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort())
  return controller.signal
}

/**
 * `ui-tests serve`: the collector, the player, the shared report and the browser bundles on one server, run while a study is open. It
 * prints the address it is reached at and the tag an app carries for it, and runs until Ctrl-C.
 */
export const serve: Command = async (args, io) => {
  const { env } = io
  const portFlag = args.flags.get('port')
  const portText = typeof portFlag === 'string' ? portFlag : env.PORT
  const port = portText === undefined ? 4300 : portOf(portText)
  if (port === undefined) { io.stderr.write(`${typeof portFlag === 'string' ? '--port' : 'PORT'} must be a port number, not "${portText}"\n`); return 2 }
  const bindFlag = args.flags.get('bind')
  if (bindFlag === true) { io.stderr.write('--bind needs an address, such as 127.0.0.1\n'); return 2 }
  const publicUrl = env.UI_TESTS_PUBLIC_URL ? publicOrigin(env.UI_TESTS_PUBLIC_URL) : undefined
  if (env.UI_TESTS_PUBLIC_URL && !publicUrl) {
    io.stderr.write(`UI_TESTS_PUBLIC_URL must be an absolute http(s) origin, such as https://tests.example.com, not "${env.UI_TESTS_PUBLIC_URL}"\n`)
    return 2
  }

  const store = () => getStore(env)
  await store()
  await getBundles()
  const server = await startServer({
    store,
    port,
    host: bindFlag ?? '0.0.0.0',
    transcriber: moduleTranscriber(() => env.UI_TESTS_TRANSCRIBER),
    ...(publicUrl && { publicUrl }),
    ...(env.UI_TESTS_CLI_SECRET && { cliSecret: env.UI_TESTS_CLI_SECRET }),
    ...(env.UI_TESTS_SHARE_SECRET && { shareSecret: env.UI_TESTS_SHARE_SECRET }),
  })
  // A wildcard or loopback bind is reached here as localhost; a specific address only at that address.
  const host = typeof bindFlag === 'string' ? bindFlag : '0.0.0.0'
  const local = ['0.0.0.0', '::', '127.0.0.1', '::1', 'localhost'].includes(host)
  const address = publicUrl ?? (local ? `http://localhost:${new URL(server.url).port}` : server.url)
  io.stdout.write(`ui-tests server: ${address}\n${tagFor(address)}\n`)
  await pause(io.deps?.signal ?? stopped())
  await server.close()
  return 0
}
