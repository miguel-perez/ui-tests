# Stack

Specified so no slice ships as raw HTML.

**Today** the repository is one npm workspace, `apps/web`: the landing page in Next.js and Tailwind, exported as a static site. The table is the stack the product is planned on; nothing below the Web row is built.

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js App Router, TypeScript, Tailwind, shadcn/ui | One stack for the marketing site, the participant player, the review UI and the hosted UI |
| Hosting | Vercel; the `ui-tests` domain is already there | Preview deployments are the test target; participants reach them through a protection-bypass token |
| Repo | npm workspaces: `apps/web`, and `packages/ui-tests` once there is a package to build; the factory validates with `npm run validate` | One package for CLI, SDK and player; a split needs a second author to ask for it |
| Runner | Node 26 CLI | Compiles contexts, creates runs, executes outcomes against stored snapshots, reports |
| Store | SQLite file in dev; Postgres (Neon) on Vercel | The run record lives here, independent of any deployment; the interface requires transactional reservation |
| Our tests | Vitest and Playwright, `@axe-core/playwright` | Vitest is also the DX we copy; Vitest excludes `*.ui.test.ts` |
| Event replay | rrweb, lazy-loaded | The highlight reel without screen recording |
| Schemas | Zod 4 to JSON Schema, Ajv for wire validation | Context, run and result files are JSON others can consume |
| Agent runs | Harnesses for cli, mcp, http and web (Playwright through the same player) | Same test file and hooks; one actor per run; separate records, checks and reports from human runs |
| Panels | Prolific and CloudResearch Connect, bring-your-own key | The only two self-serve full-lifecycle APIs |
| Skill and MCP | `skills/ui-tests/SKILL.md` in the package; MCP server over the CLI with `@modelcontextprotocol/sdk` | Agents learn and drive the runner the same way people do |
| Tunnel | cloudflared quick tunnel, ngrok as the alternative | Run-scoped tunnels from a local build; the factory already uses cloudflared for its webhook |

Everything a slice adds must be runnable by one person from a clean clone with `npm ci && npm run dev`, and every UI must be visible on a Vercel preview.
