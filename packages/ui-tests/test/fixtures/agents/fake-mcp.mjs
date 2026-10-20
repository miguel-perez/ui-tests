// A stdio MCP server for the mcp harness tests: a team's members, kept in members.json in the working directory.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const read = () => (existsSync('members.json') ? JSON.parse(readFileSync('members.json', 'utf8')) : [])
const write = members => writeFileSync('members.json', JSON.stringify(members))
const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] })

const server = new McpServer({ name: 'team', version: '1.0.0' })
server.registerTool('add_member', { description: 'Adds one person to the team by name.', inputSchema: { name: z.string() } }, async ({ name }) => {
  const members = read()
  if (members.includes(name)) return { ...text(`${name} is already a member`), isError: true }
  write([...members, name])
  return text(`added ${name}`)
})
server.registerTool('add_members', { description: 'Adds several people to the team at once.', inputSchema: { names: z.array(z.string()) } }, async ({ names }) => {
  write([...read(), ...names])
  return text(`added ${names.length}`)
})
server.registerTool('list_members', { description: 'Lists the team.', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => text(read()))
server.registerTool('env_names', { description: 'Lists the names of the environment variables the server sees.', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => text(Object.entries(process.env).map(([k, v]) => `${k}=${v}`).sort().join('\n')))

await server.connect(new StdioServerTransport())
