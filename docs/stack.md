# Stack

Specified so no slice ships as raw HTML.

The repository is two npm workspaces: `packages/ui-tests`, the package (authoring API, CLI, the script tag, the ui-tests server and everything it serves), and `apps/web`, the landing page in Next.js and Tailwind, exported as a static site that carries the tag like any other app. Every row below is built except Panels.

| Layer | Choice | Why |
| --- | --- | --- |
| Site | Next.js App Router, TypeScript, Tailwind, exported as static files | The marketing site and the docs; it carries the script tag and nothing else of ui-tests |
| In the author's app | One inline `<script>` tag, a few hundred bytes, with the server's address in `data-ui-tests` | Works with any framework or none; without a person in an attempt it makes no request |
| Server | `ui-tests serve`, one Node process on `node:http`; the browser bundles built with esbuild and served by content hash; React for the player and the bar; the Docker image built from the repository's `Dockerfile` (`node:24-slim`; to be published as `ghcr.io/miguel-perez/ui-tests`) | The player, the collector, the report and the tag's script on a server the author runs while a study is open; nobody operates a ui-tests service |
| Hosting | The site on Vercel, at the `ui-tests` domain | Preview deployments are a test target; participants reach a protected one through a protection-bypass token |
| Repo | npm workspaces: `apps/web` and `packages/ui-tests`; the factory validates with `npm run validate` | One package for the CLI, the tag and the server; a split needs a second author to ask for it |
| Runner | Node 24 or later CLI (CI runs Node 26) | Compiles contexts, creates runs, executes outcomes against stored snapshots, reports |
| Store | SQLite file on one machine; Postgres (Neon) for previews and CI, shared by the server and the CLI | The run record lives here, independent of any deployment; the interface requires transactional reservation |
| Our tests | Vitest and Playwright, `@axe-core/playwright` | Vitest is also the DX we copy; Vitest excludes `*.ui.test.ts` |
| Event replay | rrweb, lazy-loaded | The highlight reel without screen recording |
| Schemas | Zod 4 to JSON Schema, Ajv for wire validation | Context, run and result files are JSON others can consume |
| Agent runs | Harnesses for cli, mcp, http and web (Playwright through the same player) | Same test file and hooks; one actor per run; separate records, checks and reports from human runs |
| Panels | Prolific and CloudResearch Connect, bring-your-own key | The only two self-serve full-lifecycle APIs |
| Skill and MCP | `skills/ui-tests/SKILL.md` in the package; MCP server over the CLI with `@modelcontextprotocol/sdk` | Agents learn and drive the runner the same way people do |
| Tunnel | cloudflared quick tunnel | Run-scoped tunnels from a local build; the factory already uses cloudflared for its webhook |

Everything a slice adds must be runnable by one person from a clean clone with `npm ci && npm run dev`, and every UI must be visible on a Vercel preview or on `ui-tests serve`.
