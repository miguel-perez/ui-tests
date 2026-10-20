import type { Command } from './main.ts'

/**
 * `ui-tests mcp`: serves the CLI as MCP tools over stdio (`lint`, `estimate`, `run`, `status`, `verify`, `report`, `trace`) until the client
 * closes the connection. Stdout carries the protocol and nothing else; the tools run the same commands the CLI does.
 */
export const mcp: Command = async (_args, io) => {
  const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([import('../mcp/server.ts'), import('@modelcontextprotocol/sdk/server/stdio.js')])
  const server = createMcpServer(io)
  await server.connect(new StdioServerTransport())
  await new Promise<void>(resolve => {
    const previous = server.server.onclose
    server.server.onclose = () => { previous?.(); resolve() }
    process.stdin.once('end', () => resolve())
    io.deps?.signal?.addEventListener('abort', () => resolve(), { once: true })
    if (io.deps?.signal?.aborted) resolve()
  })
  await server.close()
  return 0
}
