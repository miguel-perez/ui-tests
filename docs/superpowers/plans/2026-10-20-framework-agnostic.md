# One Script Tag, Any App: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next.js mount with one inline `<script>` tag plus a ui-tests server the author runs (`npx ui-tests serve` or Docker), keep everything R0 to R2 shipped working against that server, white-label every participant surface, and make every doc tell only that story.

**Architecture:** The collector, player, report and static bundles move behind one `node:http` server (`createHandler` is a pure `Request → Response` function; `startServer` adapts it). The page side is an inline snippet that does nothing without a handoff fragment or a stored attempt key, then loads `ui-tests.js` from the address in `data-ui-tests`; the loader trades a one-time handoff code for a narrow attempt key and mounts the bar in a shadow root. The CLI keeps talking to the store directly; it starts the server itself for local work and, for `--tunnel`/`--host`, a front door that serves app and server from one origin.

**Tech Stack:** Node 24+, TypeScript run through `tsx`, `node:http`, esbuild (browser bundles at runtime, as `trace/serve.ts` already does), React 19 (`react-dom/server` on the server, `react-dom/client` in the bar and player bundles), Zod 4, Vitest with linkedom and `node:vm`, Playwright, Docker.

**Spec:** `docs/superpowers/specs/2026-10-20-framework-agnostic-design.md` (binding, approved). The PRD (`docs/prd/*.md`) is rewritten to match it in Task 11.

## Global Constraints

**Gate and repository**
- `npm run validate` passes after every task. Never edit `factory/`, `.github/workflows/merge-gate.yml`, `review-event.yml`, `delivery-status.yml`, `.archon/commands/`, `.archon/workflows/`. `ci.yml` and `ui-tests-*.yml` may change.
- New dependencies pinned exactly (`npm i -E`), each at least two weeks old. `react` and `react-dom` move from `peerDependencies` to `dependencies` of `packages/ui-tests`, pinned to `19.3.1` (what the lockfile resolves today).
- Node 24 or later for server and CLI (`engines` already says so). The Docker base image is `node:24-slim`.
- Product vocabulary stays in `packages/ui-tests`; every file under `apps/web` still passes `tests/vocabulary.test.ts`.

**Names this plan decides (the design left them to the builder)**
- Tag: `<script data-ui-tests="<server origin>">TAG_SCRIPT</script>`; `TAG_SCRIPT` and `tagFor(server: string): string` live in `packages/ui-tests/src/browser/tag.ts`, exported as `ui-tests/tag`. `TAG_SCRIPT.length <= 700`.
- Fragment: `#ui-tests=<run>.<code>` (`HANDOFF_PARAM = 'ui-tests'`). If the start URL already has a fragment, the parameter is appended as `#<existing>&ui-tests=<run>.<code>` and the snippet restores `#<existing>`.
- Handoff code: 64 hex chars, single use, `HANDOFF_TTL_MS = 60_000`. Attempt key: 64 hex chars, `ATTEMPT_KEY_TTL_MS = 7_200_000`, bound to one attempt id (it never follows the person to their next goal).
- `localStorage['ui-tests-attempt']` holds `StoredAttempt = { v: 1; server: string; run: string; attempt: string; key: string; expiresAt: number }` on the app's origin.
- Bar root attribute is renamed `data-ui-tests` → `data-ui-tests-root` (`ROOT_ATTRIBUTE`), so the tag's own `data-ui-tests` never matches the bar, block or snapshot selectors.
- Config: `server: { url?: string }`, default `'http://localhost:4300'`; the template writes `server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' }`. `brand: { name?: string; logo?: string; accent?: string; background?: string; text?: string; font?: { family: string; url?: string } }`; `brand.poweredBy` is removed.
- Server environment: `PORT` (default `4300`), `UI_TESTS_PUBLIC_URL`, `UI_TESTS_DATABASE_URL` (else SQLite under `UI_TESTS_DATA_DIR ?? .ui-tests`), `UI_TESTS_SHARE_SECRET`, `UI_TESTS_CLI_SECRET`, `UI_TESTS_TRANSCRIBER`. Flags: `ui-tests serve --port <n> --bind <addr>` (bind default `0.0.0.0`).
- Server paths: `GET /healthz` → `200 {"ok":true,"name":"ui-tests"}`; `GET /ui-tests.js` (no-cache); `GET /ui-tests/assets/<name>-<hash>.js` (immutable); `/api/ui-tests/` (collector) and `POST /api/ui-tests/exchange?run=<run>`; `GET /ui-tests/<run>/` (player); `GET /r/…`, `GET /rv/…` (signed report and video). Anything else 404.
- Invite link: `${server}/ui-tests/${run}/?t=<token>`, plus `&bypass=<secret>` when `VERCEL_AUTOMATION_BYPASS_SECRET` is set; the player puts `x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=samesitenone` on the handoff URL's query.
- Tag address per setup (printed by `init`, shown on getting-started): Vite `%VITE_UI_TESTS_URL%`, Astro `import.meta.env.PUBLIC_UI_TESTS_URL`, Next.js `process.env.NEXT_PUBLIC_UI_TESTS_URL`, Rails `ENV["UI_TESTS_URL"]`, plain HTML the address itself.
- Docker image: `ghcr.io/miguel-perez/ui-tests`, built from the repository root `Dockerfile` (publishing is documented, not executed).
- Package exports after Task 9: `"."`, `"./config"`, `"./tag"`, `"./schemas/*"`. No `./next`, no `./server`.

**Security (from the design's anti-goals)**
- The snippet loads only `${data-ui-tests}/ui-tests.js`, only when `data-ui-tests` is an absolute `http:`/`https:` URL, only with a handoff fragment or an unexpired `StoredAttempt` whose `server` equals that address. No link can change the server.
- The participant token never reaches the app's page. The attempt key may only: GET the bar view, and POST `events`, `replay`, `video`, `video-note`, `video-declined`, `step`, `end`, `more-time`, and `answers` carrying only `firstClick`. Anything else with an attempt key is 403.
- Cross-origin requests to the collector are accepted only from the run's stored origins, only with an attempt key (or at `exchange`), never with credentials (`Access-Control-Allow-Credentials` is never sent). Same-origin player requests keep today's token, cookie and Origin check.
- No participant-facing surface (bar, player, report, server HTML titles) shows the name or marks of ui-tests.

## Review Focus

1. **Loopback aliases**: an app opened at `http://localhost:3000` for a run whose target is `http://127.0.0.1:3000` (or the reverse). A person expects the bar to work. `runOrigins` adds the other loopback spelling for loopback targets; pinned in Task 1.
2. **The server is stopped while a person still holds an attempt key** (between studies, or a crash). A person expects the author's page to load and work as if the tag were absent: no thrown error, no DOM change. Pinned in Task 3 (loader with a rejecting `fetch` and a failing import).
3. **Hash-routed single-page apps** (start `/#/board`). A person expects the app's own fragment to survive the handoff. Pinned in Task 2 (handoff URL builder) and Task 3 (snippet restores `#/board`).
4. **A stale `StoredAttempt` from an earlier attempt or study when a new handoff arrives.** A person expects the new attempt to win. Pinned in Task 3 (loader replaces the entry after a successful exchange; a failed exchange keeps nothing).
5. **The server behind TLS termination** (Docker behind a proxy, `UI_TESTS_PUBLIC_URL=https://…`, plain-http request inside). A person expects the player's cookie to be `Secure` and same-origin posts to pass the Origin check. Pinned in Task 4 (`publicUrl` overrides the request's own origin in the collector).

---

### Task 1: Handoff codes, attempt keys and run origins in the store

**Files:**
- Modify: `packages/ui-tests/src/store/types.ts`, `src/store/migrations.ts` (SQLite migration 3), `src/store/sql.ts` (Postgres migration 2), `src/store/sqlite.ts`, `src/store/postgres.ts`, `src/runner/create-run.ts`
- Create: `packages/ui-tests/src/server/origins.ts`, `packages/ui-tests/src/server/credentials.ts`
- Test: `packages/ui-tests/test/store-conformance.ts` (runs for SQLite, PGlite and Neon-shaped stores), `packages/ui-tests/test/origins.test.ts`

All paths below are under `packages/ui-tests/` unless they start at the repository root.

**Interfaces:**
- Produces (`store/types.ts`): `RunRow.appUrl?: string` (where participants open the app), `RunRow.origins?: string[]`; `CreateRunInput.appUrl?: string`. New `RunStore` methods:
  - `createHandoff(attemptId: string, expiresAt: string): Promise<string>`
  - `redeemHandoff(code: string, now: string): Promise<{ run: RunRow; attempt: AttemptRow } | undefined>`: deletes the row in the same statement it reads it (`DELETE … RETURNING`), returns undefined when missing or `expires_at <= now`.
  - `createAttemptKey(attemptId: string, expiresAt: string): Promise<string>`
  - `authorizeAttemptKey(key: string, now: string): Promise<{ run: RunRow; attempt: AttemptRow } | undefined>`
  - `revokeAttemptKeys(attemptId: string): Promise<void>`: removes handoff codes and attempt keys, keeps the participant token.
  - `authorize(token)` now matches `kind = 'participant'` only; `revokeTokens` still removes every kind.
- Schema: `ALTER TABLE tokens ADD COLUMN kind TEXT NOT NULL DEFAULT 'participant'; ALTER TABLE tokens ADD COLUMN expires_at TEXT;` (kinds `participant`, `handoff`, `attempt-key`; only hashes stored, as today).
- Produces (`server/credentials.ts`): `HANDOFF_TTL_MS = 60_000`, `ATTEMPT_KEY_TTL_MS = 7_200_000`, `HANDOFF_PARAM = 'ui-tests'`.
- Produces (`server/origins.ts`): `originOf(url: string): string | undefined`; `appUrlOf(run: RunRow): string` (`appUrl ?? target`); `runOrigins(run: RunRow): string[]` (stored `origins`, else the origin of `appUrlOf(run)`, plus the target's origin, plus the other loopback spelling `localhost`/`127.0.0.1` for loopback origins, deduplicated); `setRunApp(store: RunStore, runId: string, appUrl: string): Promise<RunRow>` (sets `appUrl`, appends its origin, retries up to 5 times on a revision conflict, as `updateTunnels` does).
- `createRun` stores `appUrl: input.appUrl ?? target` and `origins: [originOf(appUrl)]`.

- [ ] **Step 1: Write the failing tests.** Conformance:
  ```ts
  const code = await store.createHandoff(attempt.id, '2026-10-20T10:01:00.000Z')
  expect(code).toMatch(/^[0-9a-f]{64}$/)
  expect(await store.authorize(code)).toBeUndefined()                                   // a code is not a token
  expect((await store.redeemHandoff(code, '2026-10-20T10:00:30.000Z'))?.attempt.id).toBe(attempt.id)
  expect(await store.redeemHandoff(code, '2026-10-20T10:00:31.000Z')).toBeUndefined()   // single use
  const late = await store.createHandoff(attempt.id, '2026-10-20T10:01:00.000Z')
  expect(await store.redeemHandoff(late, '2026-10-20T10:01:00.000Z')).toBeUndefined()   // expired at the instant
  expect(await store.redeemHandoff(late, '2026-10-20T10:00:00.000Z')).toBeUndefined()   // and spent by the failed try
  const key = await store.createAttemptKey(attempt.id, '2026-10-20T12:00:00.000Z')
  expect(await store.authorize(key)).toBeUndefined()                                    // a key is not a participant token
  expect((await store.authorizeAttemptKey(key, '2026-10-20T11:00:00.000Z'))?.run.run).toBe(run.run)
  expect(await store.authorizeAttemptKey(key, '2026-10-20T12:00:00.000Z')).toBeUndefined()
  expect(await store.authorizeAttemptKey(token, '2026-10-20T11:00:00.000Z')).toBeUndefined() // a token is not a key
  await store.revokeAttemptKeys(attempt.id)
  expect(await store.authorizeAttemptKey(key, '2026-10-20T11:00:00.000Z')).toBeUndefined()
  expect(await store.authorize(token)).toBeDefined()                                    // the token survives
  ```
  A run created with `appUrl: 'https://tunnel.example'` round-trips `appUrl` and `origins`. An existing SQLite file at migration 2 opens and keeps its tokens authorising. `origins.test.ts`: `runOrigins({ target: 'http://127.0.0.1:3000/' })` equals `['http://127.0.0.1:3000', 'http://localhost:3000']`; `originOf('HTTP://Example.com:443/x')` is `'http://example.com:443'`; `setRunApp` twice with two tunnel URLs keeps both origins and the second `appUrl`; a non-URL `appUrl` throws.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/store-sqlite.test.ts packages/ui-tests/test/store-postgres.test.ts packages/ui-tests/test/origins.test.ts` → FAIL (methods missing).
- [ ] **Step 3: Implement** the migrations, the five methods in both adapters, `credentials.ts`, `origins.ts`, and `createRun`'s new fields.
- [ ] **Step 4: Run** the same tests → PASS; `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Store handoff codes, attempt keys and the origins a run may be called from"`.

### Task 2: The collector hands off, exchanges, scopes the attempt key and answers CORS

**Files:**
- Modify: `src/server/collector.ts`, `src/server/view.ts`
- Create: `src/server/handoff.ts`
- Test: `test/collector-handoff.test.ts`, `test/collector-cors.test.ts`; `test/collector.test.ts` unchanged and still green

**Interfaces:**
- Consumes: Task 1 store methods, `runOrigins`, `appUrlOf`, TTL constants.
- Produces (`view.ts`): `type BarView = { run: string; attempt: string; status: AttemptStatus; goal: { name: string; steps: string[]; timeoutSeconds: number }; record: 'events' | 'video'; brand: ParticipantView['brand']; firstClick: boolean; rehearsal: boolean }` and `barView(run: RunRow, attempt: AttemptRow): BarView`, where `firstClick` is `status === 'consented' && impression asked && click` exactly as the bar computes it today. No consent text, scenario, screener, questions, answer or start URL.
- Produces (`handoff.ts`): `handoffUrl(start: string, appUrl: string, run: string, code: string): string`: resolves `start` against `appUrl`, then appends `ui-tests=<run>.<code>` to the fragment (`#ui-tests=…`, or `#<existing>&ui-tests=…`).
- Produces (`collector.ts`):
  - `CollectorOptions.publicUrl?: string`: when set, it is the collector's own origin for the Origin check and the cookie's `Secure` flag.
  - New player action `{ action: 'handoff' }` (token or cookie only) → `200 { url: string }` built from `setupValues.start ?? goal.start` and `appUrlOf(run)`, with a fresh code expiring in `HANDOFF_TTL_MS`; allowed when the attempt is `active`, or `consented` with the first-look click pending; else `409 'Nothing to hand off'`.
  - `POST /api/ui-tests/exchange?run=<run>`, body `{ code: string }` (the part after `<run>.`), no other auth → `200 { key, run, attempt, expiresAt }` (epoch ms), key expiring in `ATTEMPT_KEY_TTL_MS`; `401` for an unknown, spent or expired code, or one whose run differs from `?run`.
  - Auth order becomes: CLI secret, `?t=` (GET), Bearer participant token, Bearer attempt key (`via: 'attempt-key'`), cookie. With `via: 'attempt-key'`: `GET` answers `barView`; `POST` allows only the bar actions listed in Global Constraints, `answers` only with `firstClick` and nothing else, otherwise `403 'Not allowed with an attempt key'`. Any GET may ask `?view=bar` for the same `BarView`.
  - `end` does not revoke the key (a last video chunk may still land while the attempt is in `questions`); `withdraw` calls `revokeAttemptKeys` for every attempt of the person; a key is refused once its attempt's `reason` is `withdrew` or its status is `finished`.
  - CORS: a request whose `Origin` differs from the collector's own origin is cross-origin. `OPTIONS` with `?run=` whose `runOrigins` include the Origin → `204` with `Access-Control-Allow-Origin: <origin>`, `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers: authorization, content-type`, `Access-Control-Max-Age: 600`, `Vary: Origin`, and `Access-Control-Allow-Private-Network: true` when the preflight asks for it; anything else → `403` without CORS headers. A cross-origin `GET`/`POST` must name `?run=`, come from one of its origins, and authenticate with an attempt key (or be `exchange`); else `403`. Every answer to an allowed cross-origin request carries `Access-Control-Allow-Origin` and `Vary: Origin`.

- [ ] **Step 1: Write the failing tests** (all against `createCollector` with a SQLite `:memory:` store and a fixed `now`).
  `collector-handoff.test.ts`:
  - `hands off an active attempt to the app with a one-time code in the fragment`: `begin`, then `handoff` → `url` matches `^http://app\.test/board#ui-tests=r_[0-9A-Z]{26}\.[0-9a-f]{64}$`; the code exchanged with `Origin: http://app.test` → 200 with a 64-hex `key` and `expiresAt === now + 7_200_000`; the same code again → 401.
  - `refuses a code after 60 seconds`: exchange at `now + 60_000` → 401.
  - `keeps the app's own fragment`: `handoffUrl('/#/board', 'http://app.test', 'r_X', 'c')` is `'http://app.test/#/board&ui-tests=r_X.c'`; `handoffUrl('https://elsewhere.test/a', …)` keeps the absolute start.
  - `refuses a handoff before consent` (status `created`) → 409.
  - `the attempt key does only what the bar does`: with the key, `events`, `step`, `more-time`, `end` → 200; `answers` `{ firstClick }` → 200; `answers` `{ ease: 5 }` → 403; `answers` `{ firstClick, comment: 'x' }` → 403; `withdraw`, `consent`, `begin`, `voice`, `handoff` → 403; `GET` → a body whose keys are exactly those of `BarView` and that has no `consent`, `scenario`, `questions`, `screener`, `answer` or `start`.
  - `a key is bound to its attempt`: after the last answer moves the person to their next goal, the old key's GET still names the old attempt and its `events` → 409 (`Attempt is not active`).
  - `withdrawal revokes the key`: after `withdraw` by token, the key's GET → 401.
  `collector-cors.test.ts`:
  - `answers a preflight only for the run's own origins`: `OPTIONS ?run=` with `Origin: http://app.test` → 204 with the headers above; with `Origin: http://evil.test` → 403 and no `access-control-allow-origin`; without `?run=` → 403.
  - `never allows credentials`: no response in either file has `access-control-allow-credentials`.
  - `refuses a cross-origin request carried by the cookie or the participant token`: `POST` with `Origin: http://app.test`, `?run=`, and the cookie → 403; with `Authorization: Bearer <token>` → 403; with the key → 200 and `access-control-allow-origin: http://app.test`.
  - `refuses an exchange from another origin` (`Origin: http://evil.test`) → 403 and the code is still redeemable from `http://app.test`.
  - `keeps the player's same-origin path`: `consent` with the cookie and `Origin` equal to the collector's own origin → 200 as today.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/collector-handoff.test.ts packages/ui-tests/test/collector-cors.test.ts` → FAIL.
- [ ] **Step 3: Implement** `barView`, `handoffUrl`, the `handoff` action, the `exchange` path, the attempt-key branch of `authorize` (it does not go through `currentAttempt`), the action allowlist, and the CORS wrapper around the existing handler.
- [ ] **Step 4: Run** those two files and `test/collector.test.ts` → PASS; `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Hand off to the app with a one-time code and scope what the page may do"`.

### Task 3: The tag, the loader and the bar in a shadow root

**Files:**
- Move (`git mv`): `src/next/{buffer,recorder,replay-recorder,screen-recorder,video-upload,theme}.ts` and `src/next/taskbar.tsx` → `src/browser/`
- Create: `src/browser/tag.ts`, `src/browser/attempt.ts`, `src/browser/bar.tsx`, `src/browser/key-client.ts`, `src/browser/mount.tsx`, `src/browser/loader.ts`
- Modify: `src/next/index.tsx` (becomes a cookie client around `Bar`), `src/browser/recorder.ts` (`ROOT_ATTRIBUTE = 'data-ui-tests-root'`), `tests/product/mount.spec.ts`, `tests/product/rehearsal.spec.ts` and any spec selecting `[data-ui-tests]` (select `[data-ui-tests-root]`)
- Test: `test/tag.test.ts`, `test/attempt-store.test.ts`, `test/loader.test.ts`; `test/{buffer,recorder,replay-recorder,screen-recorder,video}.test.ts` import from `src/browser/`

**Interfaces:**
- Consumes: Task 2 `BarView`, exchange and bar actions.
- Produces (`tag.ts`): `TAG_SCRIPT: string` (minified, self-contained, reads `document.currentScript`); `tagFor(server: string): string` → `<script data-ui-tests="${server}">${TAG_SCRIPT}</script>` (attribute HTML-escaped).
  Snippet algorithm (exact behaviour; write it by hand, no build step):
  ```text
  u = currentScript.getAttribute('data-ui-tests'); stop unless /^https?:\/\/[^/]+\/?$/i matches u; server = u without trailing '/'
  m = /(^#|&)ui-tests=([^&]*)/.exec(location.hash)
  if m: history.replaceState(history.state, '', location.href without that parameter, and without '#' when nothing is left)
  else: read localStorage['ui-tests-attempt'] in try/catch; stop unless JSON.server === server and JSON.expiresAt > Date.now()
  append <script type="module" src="${server}/ui-tests.js${m ? '#' + m[2] : ''}"> to document.head
  ```
- Produces (`attempt.ts`): `STORAGE_KEY = 'ui-tests-attempt'`; `type StoredAttempt`; `readAttempt(storage: Storage | undefined, server: string, now: number): StoredAttempt | undefined`; `writeAttempt(storage, value): void`; `forgetAttempt(storage, idb: IDBFactory | undefined, attempt: string): void` (removes the entry and the `ui-tests-events:<attempt>` / `ui-tests-replay:<attempt>` databases; never throws).
- Produces (`bar.tsx`): `type BarClient = { view(): Promise<BarView | undefined>; post(body: unknown, options?: { keepalive?: boolean }): Promise<Response>; back(query: 'after=1' | 'after=first-look'): void }` and `Bar({ client }: { client: BarClient })`: today's `UiTests` body (recording, buffers, video, timer, steps, first click) with every `fetch` replaced by `client`, `window.location.assign('/ui-tests/…')` replaced by `client.back(…)`, and the theme read from `BarView.brand`.
- Produces (`key-client.ts`): `keyClient(server: string, stored: StoredAttempt, deps?: { fetch; location; storage; idb }): BarClient`: requests go to `${server}/api/ui-tests/?run=<run>[&view=bar]` with `Authorization: Bearer <key>` and `credentials: 'omit'`; a 401 calls `forgetAttempt`; `back(q)` calls `forgetAttempt` then assigns `${server}/ui-tests/${run}/?${q}`.
- Produces (`mount.tsx`): `mountBar(client: BarClient, doc: Document): () => void`: one `<div data-ui-tests-root>` appended to `document.body` with an open shadow root holding the bar's `<style>` and a React root; the returned function unmounts and removes the host.
- Produces (`loader.ts`): `start(moduleUrl: string, deps?: LoaderDeps): Promise<void>`, `LoaderDeps = { fetch; storage; idb; location; addEventListener; importBar: () => Promise<{ mountBar: typeof mountBar }> }`: `server = new URL(moduleUrl).origin`; with a fragment code, `POST ${server}/api/ui-tests/exchange?run=<run>` (`credentials: 'omit'`), on 200 `writeAttempt` (replacing any older entry), on anything else `forgetAttempt` for the older entry only if its run matches and stop; then `readAttempt`, `importBar()`, `mountBar(keyClient(…))`; on a `storage` event that removes or replaces `STORAGE_KEY`, unmount. Every failure is swallowed (no throw, no DOM change).
- `src/next/index.tsx` keeps `export function UiTests({ endpoint })` for apps/web until Task 9: it gates on the `ui-tests-active` cookie as today and renders `<Bar client={cookieClient(endpoint)} />` through a portal.

- [ ] **Step 1: Write the failing tests.**
  `tag.test.ts` runs `TAG_SCRIPT` in `node:vm` with a fake `document` (`currentScript.getAttribute`, `createElement`, `head.appendChild` recorder), `location`, `history.replaceState` spy, `localStorage`:
  - `makes no request and changes nothing without an attempt`: no hash, empty storage → `appended.length === 0`, `replaceState` not called.
  - `loads the loader from data-ui-tests only`: hash `#ui-tests=r_A.c0de` → one element, `type === 'module'`, `src === 'https://tests.example.com/ui-tests.js#r_A.c0de'`; with hash `#ui-tests=r_A.c&server=https://evil.example` and `#ui-tests=https://evil.example/x.js` → the one `src` still has origin `https://tests.example.com`.
  - `removes the code from the address`: `https://app.test/start#ui-tests=r_A.c` → `replaceState(…, 'https://app.test/start')`; `https://app.test/#/board&ui-tests=r_A.c` → `'https://app.test/#/board'` (Review Focus 3).
  - `refuses a server that is not an absolute http(s) origin`: `''`, `'javascript:alert(1)'`, `'/relative'`, `'https://x.test/path'` → nothing appended.
  - `uses only an unexpired attempt for this server`: stored `{ server: 'https://tests.example.com', expiresAt: now + 1 }` → appended without a fragment; `expiresAt: now` → nothing; `server: 'https://other.test'` → nothing; `localStorage` getter throws → nothing, no throw.
  - `stays small`: `TAG_SCRIPT.length <= 700`; `tagFor('https://t.test')` starts with `<script data-ui-tests="https://t.test">`.
  `attempt-store.test.ts`: write/read round trip; a value with `v !== 1` or bad JSON reads as undefined; `forgetAttempt` deletes both IndexedDB names (fake-indexeddb) and survives a throwing `localStorage`.
  `loader.test.ts` (fake deps, linkedom document):
  - `trades the code for a key and mounts the bar`: exchange → 200 → storage holds `{ v: 1, server, run: 'r_A', attempt, key, expiresAt }`, `mountBar` called once; the exchange request has `credentials: 'omit'` and no `Authorization`.
  - `replaces an older attempt` (Review Focus 4): storage holds attempt `a1`; a new code exchanges to `a2` → storage names `a2`.
  - `keeps nothing after a failed exchange`: 401 → storage empty for that run, `mountBar` not called.
  - `leaves the page alone when the server is down` (Review Focus 2): `fetch` rejects and `importBar` rejects → `start` resolves, the document's `outerHTML` is unchanged.
  - `unmounts when another tab ends the attempt`: a `storage` event with `key: STORAGE_KEY, newValue: null` calls the unmount function once.
  - `a 401 on the bar view forgets the attempt`: `keyClient(...).view()` → 401 → storage empty and both databases deleted.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/tag.test.ts packages/ui-tests/test/attempt-store.test.ts packages/ui-tests/test/loader.test.ts` → FAIL.
- [ ] **Step 3: Implement** the move, the rename, the six new files and the cookie client. The recorder still skips anything under `[data-ui-tests-root]` (shadow-root clicks retarget to the host, which carries it), and `serializeSnapshot` still removes it.
- [ ] **Step 4: Run** the new tests and the moved ones → PASS; `npm run validate` → PASS (the product project still runs through `ui-tests/next`).
- [ ] **Step 5: Commit** `git commit -m "Add the script tag, the loader and the bar in a shadow root"`.

### Task 4: `ui-tests serve`, its bundles, the standalone player and report, and the Docker image

**Files:**
- Create: `src/server/bundles.ts`, `src/server/shell.ts`, `src/server/report.ts`, `src/server/handler.ts`, `src/server/http.ts`, `src/player/client.tsx`, `src/player/handoff.ts`, `src/report/document.ts`, `src/cli/serve.ts`; repository root `Dockerfile`, `.dockerignore`
- Modify: `src/player/player.tsx`, `src/server/video.ts`, `src/server/index.ts` (adapts to the new `reportVideo` signature), `src/trace/serve.ts` (uses `reportDocument`), `src/cli/main.ts` (command `serve`, flags `serve: ['port', 'bind']`, help line), `packages/ui-tests/package.json` (react, react-dom to `dependencies`), `.github/workflows/ci.yml` (a step after Validate)
- Test: `test/server-handler.test.ts`, `test/bundles.test.ts`, `test/cli-serve.test.ts`, `test/player-handoff.test.ts`, `test/dockerfile.test.ts`

**Interfaces:**
- Consumes: Task 2 collector (`publicUrl`, `handoff`), Task 3 `loader.ts`.
- Produces (`bundles.ts`): `type Bundles = { loader: string /* body of /ui-tests.js */; assets: Map<string, string> /* file name → JS */; player: string; replay: string /* asset names */ }`; `getBundles(): Promise<Bundles>`: one esbuild build, cached per process like `replayBundle`, entry points `{ 'ui-tests': src/browser/loader.ts, player: src/player/client.tsx, replay: <stdin as trace/serve.ts builds it> }`, `bundle, splitting, format: 'esm', platform: 'browser', target: 'es2022', minify, jsx: 'automatic', entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]'`. `/ui-tests.js` is exactly `import { start } from './ui-tests/assets/<ui-tests entry>'; start(import.meta.url)`.
- Produces (`shell.ts`): `playerShell(input: { runId: string; brand?: CompiledBrand; title: string; script: string }): string`: `<!doctype html>`, viewport meta, `<title>`, brand CSS variables and an optional font `<link>`, `<div id="root" data-run="…">`, the module script. Brand values are escaped; Task 6 fills in the brand.
- Produces (`report/document.ts`): `reportDocument(input: { record; trace?; person?: number; at?: number; link(path: string): string; video?(person: number, segment: number): string; replayScript: string }): string | undefined`: the HTML `trace/serve.ts` `authorReport` builds today, shared by both servers.
- Produces (`report.ts`): `reportResponse(request: Request, options: { store: RunStore; shareSecret?: string; bundles: Bundles }): Promise<Response>`: `ReportPage`'s rules (signed `/r/<run>` and `/r/<run>/p<n>`, 404 otherwise, agent runs 404) without `next/navigation`.
- `video.ts`: `reportVideo(request: Request, options: { store: RunStore; shareSecret?: string }): Promise<Response>`.
- Produces (`handler.ts`): `type ServerOptions = { store: () => Promise<RunStore>; publicUrl?: string; cliSecret?: string; shareSecret?: string; transcriber?: Transcriber; now?: () => number }`; `createHandler(options: ServerOptions): (request: Request) => Promise<Response>` routing the paths in Global Constraints. HTML answers carry `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cache-Control: no-store`. `/ui-tests.js` and assets carry `Access-Control-Allow-Origin: *` (no credentials), `Content-Type: text/javascript; charset=utf-8`; `/ui-tests.js` `Cache-Control: no-cache`, assets `public, max-age=31536000, immutable`. `/ui-tests/<run>` redirects 308 to `/ui-tests/<run>/`.
- Produces (`http.ts`): `startServer(options: ServerOptions & { port?: number; host?: string }): Promise<{ url: string; close(): Promise<void> }>` (`node:http`; streams bodies; `X-Forwarded-Host`/`-Proto` pass through to the `Request` URL's headers).
- Produces (`cli/serve.ts`): `serve: Command`: opens the store from `io.env` (`getStore`'s retention included), reads the environment listed in Global Constraints, warms `getBundles()`, listens on `--port ?? PORT ?? 4300` and `--bind ?? 0.0.0.0`, prints `ui-tests server: <UI_TESTS_PUBLIC_URL ?? http://localhost:<port>>` and then `tagFor(<that address>)` on its own line, and runs until the signal (`deps.signal ?? interrupt()`).
- Produces (`player/handoff.ts`): `withBypass(url: string, bypass?: string): string` (query parameters before the fragment); `rememberBypass(run: string, search: string, storage?: Storage): string | undefined` (reads `bypass` from the invite query, keeps it in `sessionStorage['ui-tests-bypass:<run>']`).
- `player.tsx`: `Player({ runId, endpoint = '/api/ui-tests/' })`; `start()` and the first-look click phase POST `{ action: 'handoff' }` and `window.location.assign(withBypass(url, bypass))` in place of `assign(view.goal.start)`. `client.tsx` renders `<Player runId={root.dataset.run} />` with `react-dom/client`.
- `Dockerfile`: `FROM node:24-slim`, workdir `/app`, copies the root `package.json`, `package-lock.json`, `apps/web/package.json` and `packages/ui-tests/`, `npm ci --omit=dev --workspace ui-tests`, `ENV PORT=4300 UI_TESTS_DATA_DIR=/data`, `VOLUME /data`, `EXPOSE 4300`, `HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"`, `CMD ["node", "packages/ui-tests/bin/ui-tests.mjs", "serve"]`.
- `ci.yml`, after Validate: `docker build -t ui-tests:ci .`, `docker run -d -p 4300:4300 ui-tests:ci`, poll `curl -fsS http://127.0.0.1:4300/healthz` for 30 s, then `curl -fsS http://127.0.0.1:4300/ui-tests.js | grep -q 'start(import.meta.url)'`.

- [ ] **Step 1: Write the failing tests.**
  `server-handler.test.ts` (`createHandler` over a SQLite `:memory:` store, no sockets):
  - `GET /healthz` → 200, JSON `{ ok: true, name: 'ui-tests' }`.
  - `/ui-tests.js` → 200, `text/javascript`, `cache-control: no-cache`, `access-control-allow-origin: *`, no `access-control-allow-credentials`; its imported asset → 200 `immutable`; `/ui-tests/assets/nope.js` → 404.
  - `/ui-tests/<run>/` → HTML with `data-run="<run>"`, `referrer-policy: no-referrer`, `x-frame-options: DENY`; `/ui-tests/<run>` → 308.
  - `/api/ui-tests/` without a token → 401 (the collector is mounted).
  - `/r/<run>?sig=<valid>` → 200 HTML naming the study; bad signature, no secret, or an agent run → 404; `/rv/…` keeps `video.test.ts`'s rules with `shareSecret` passed in.
  - `honours the public address behind a proxy` (Review Focus 5): `publicUrl: 'https://tests.example.com'`; a `consent` POST to `http://10.0.0.2:4300/api/ui-tests/` with `Authorization: Bearer <token>` → 200 and the `ui-tests-run` cookie ends in `; Secure`; then a `begin` POST with that cookie and `Origin: https://tests.example.com` → 200, and with `Origin: http://10.0.0.2:4300` → 403.
  `bundles.test.ts`: the `ui-tests` entry asset is at most 8,192 bytes and contains neither `react` nor `rrweb` (`/createElement|rrweb/` does not match); building twice returns the same asset names; the player asset exists.
  `cli-serve.test.ts`: `main(['serve', '--port', '0'], io)` with an abort signal prints `ui-tests server: http://localhost:` and a line starting `<script data-ui-tests=`; with `UI_TESTS_PUBLIC_URL=https://t.test` the tag carries `https://t.test`; a real `fetch` of `/healthz` on the bound port → 200; aborting resolves with 0.
  `player-handoff.test.ts`: `withBypass('https://p.vercel.app/a#ui-tests=r.c', 's')` is `'https://p.vercel.app/a?x-vercel-protection-bypass=s&x-vercel-set-bypass-cookie=samesitenone#ui-tests=r.c'`; without a secret it is unchanged; `rememberBypass` round-trips through `sessionStorage`.
  `dockerfile.test.ts`: the root `Dockerfile` has `FROM node:24-slim`, `EXPOSE 4300`, `VOLUME /data`, a `HEALTHCHECK` naming `/healthz`, and `CMD` ending in `"serve"]`.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/server-handler.test.ts packages/ui-tests/test/bundles.test.ts packages/ui-tests/test/cli-serve.test.ts packages/ui-tests/test/player-handoff.test.ts packages/ui-tests/test/dockerfile.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files above. `ReportPage` and `PlayerPage` stay in `src/server/` for apps/web until Task 9; the player's handoff already works there because the run's `appUrl` is the Next app itself.
- [ ] **Step 4: Run** the tests → PASS; `docker build -t ui-tests:ci . && docker run --rm -d -p 4300:4300 ui-tests:ci` then `curl -fsS http://127.0.0.1:4300/healthz` → `{"ok":true,"name":"ui-tests"}` (skip locally if Docker is absent; CI runs it); `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Serve the collector, player, report and bundles from ui-tests serve, also as a Docker image"`.

### Task 5: The tag in apps/web and a plain HTML page, proven end to end

**Files:**
- Modify: `packages/ui-tests/package.json` (export `"./tag": "./src/browser/tag.ts"`), `apps/web/app/layout.tsx` (the tag in `<head>`, beside `<UiTests />` until Task 9), `src/next/index.tsx` (transitional guard: renders nothing once the snippet has appended `script[type="module"][src*="/ui-tests.js"]`, so one bar shows; the snippet strips the fragment before React runs, so the guard cannot look for it); old product specs that assert the bar's transport (cookie on collector calls) now expect the attempt key, since the tag's bar takes over on the Next pages too, `playwright.config.ts`, `tests/product/helpers.ts`
- Create: `tests/product/fixtures/plain/index.html`, `tests/product/fixtures/plain/next.html`, `tests/product/fixtures/plain/hostile.html`, `tests/product/fixtures/plain.ui.test.ts`, `tests/product/tag.spec.ts`

**Interfaces:**
- Consumes: Task 3 tag, Task 4 server.
- Produces: the layout renders `<script data-ui-tests={process.env.NEXT_PUBLIC_UI_TESTS_URL ?? ''} dangerouslySetInnerHTML={{ __html: TAG_SCRIPT }} />`.
- Produces (`helpers.ts`): `SERVER_URL = 'http://127.0.0.1:4300'`, `PLAIN_URL = 'http://127.0.0.1:3200'`; `RunOptions.app?: string` (the run's target and `appUrl`, default `PRODUCT_URL`); `createRehearsalRun`/`createLinkRun` return `playerUrl` on `RunOptions.player ?? PRODUCT_URL` (old specs) or `SERVER_URL`.
- Playwright: the product web server's env gains `NEXT_PUBLIC_UI_TESTS_URL: 'http://127.0.0.1:4300'`; two more web servers: `node packages/ui-tests/bin/ui-tests.mjs serve --port 4300` (env `UI_TESTS_DATA_DIR`, `UI_TESTS_SHARE_SECRET: 'test'`, `UI_TESTS_PUBLIC_URL: 'http://127.0.0.1:4300'`, url `http://127.0.0.1:4300/healthz`) and `python3 -m http.server 3200 --bind 127.0.0.1 --directory tests/product/fixtures/plain`.
- The plain pages are static HTML with only `tagFor('http://127.0.0.1:4300')` pasted in `<head>` (a test asserts it equals `tagFor` byte for byte), headings, and links between `index.html` and `next.html`; `hostile.html` adds `<style>* { all: unset !important; display: none !important }</style>` after the tag. The study: `path: ['/', '/next.html']`, outcome `expect(page.url()).toContain('/next.html')`.

- [ ] **Step 1: Write the failing tests** (`tag.spec.ts`, every run `{ app: PLAIN_URL, player: SERVER_URL }` unless named):
  - `a page with the tag and no attempt makes no request and changes nothing`: `goto(PLAIN_URL)`, `networkidle`; requests to any origin but `PLAIN_URL` → `[]`; `[data-ui-tests-root]` count 0; the body's `innerHTML` equals the file's body.
  - `a person goes from the player to the plain page and back, with the bar in a shadow root`: player → `I agree and continue` → `Start task` → the page URL is `${PLAIN_URL}/` with an empty `hash`; `[data-ui-tests-root]` has a `shadowRoot` with buttons `Done` and `I couldn't do this`; `localStorage['ui-tests-attempt']` parses with `run` equal to the run id; `context.cookies(PLAIN_URL)` has no cookie whose name starts with `ui-tests`; every request to `/api/ui-tests/` carried `authorization: Bearer <64 hex>` and no `cookie` header; following the link to `next.html` keeps the bar; `Done` → `Finished this task?` → `Yes` → heading of the first question on `${SERVER_URL}/ui-tests/<run>/`; `localStorage['ui-tests-attempt']` on the plain origin is gone; the store has the attempt in `questions` with an `end` snapshot whose `url` ends in `/next.html`.
  - `every tab of the app sees the attempt, and the end`: during the task, `context.newPage().goto(PLAIN_URL + '/next.html')` shows the bar; pressing `Done` in the first tab removes the bar from the second within 2 s.
  - `the host page's CSS cannot hide the bar`: start on `hostile.html` → `Done` is visible and clickable inside the shadow root.
  - `a spent or crafted link loads nothing from elsewhere`: reuse the handoff URL captured from the first journey → the exchange answers 401, no bar, `localStorage` empty; `goto(PLAIN_URL + '/#ui-tests=r_X.https%3A%2F%2Fevil.test%2Fx.js')` → every script request's origin is `SERVER_URL` or `PLAIN_URL`.
  - `the collector refuses an origin the run does not know`: `request.post(SERVER_URL + '/api/ui-tests/exchange?run=<run>', { headers: { Origin: 'http://evil.test' } })` → 403, no `access-control-allow-origin`.
  - `apps/web carries the tag and shows one bar`: run `{ app: PRODUCT_URL, player: SERVER_URL }` → start → exactly one `[data-ui-tests-root]` on the Next page.
  - `the plain fixture carries the tag init prints`: `index.html` contains `tagFor('http://127.0.0.1:4300')`.
- [ ] **Step 2: Run** `npx playwright test tests/product/tag.spec.ts` → FAIL.
- [ ] **Step 3: Implement** the export, the layout tag, the guard, the fixtures, the helpers and the web servers.
- [ ] **Step 4: Run** `npx playwright test --project product` → PASS (old specs still pass through the Next mount); `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Prove the tag on a plain HTML page and on this site"`.

### Task 6: White-labelling from the config, stored with the run

**Files:**
- Modify: `src/types.ts` (`brand`), `src/compile.ts`, `src/schema/compiled.ts`, `src/server/view.ts`, `src/server/shell.ts`, `src/player/screens.tsx`, `src/player/copy.ts` (remove `POWERED_BY`), `src/browser/taskbar.tsx`, `src/browser/bar.tsx`, `src/browser/theme.ts`, `src/report/view.tsx`, `schemas/run-record.v1.json` (regenerated by `npm run schema --workspace ui-tests`)
- Test: `test/brand.test.ts`; update `test/player-render.test.ts`, `test/report.test.ts`, `test/screener.test.ts`, `test/collector.test.ts` (no `poweredBy`)

**Interfaces:**
- Produces: `type CompiledBrand = { name: string; logo?: string; accent?: string; background?: string; text?: string; font?: { family: string; url?: string } }` in `schema/compiled.ts`; `compileStudy` sets `name = config.brand?.name ?? config.author ?? product`, and refuses (a `CompileError` naming `brand.<field>`) a colour that is not `#rgb`/`#rrggbb`, a `logo` that is not `https:`, `http://localhost`/`127.0.0.1`, or `data:image/(png|jpeg|gif|webp|svg+xml)`, a `font.url` that is not `https:`, and a `font.family` with `;{}<>"`. `ParticipantView.brand` and `BarView.brand` are `CompiledBrand`. The consent's "who is running the study" uses `brand.name`.
- Rendering: the player and the report put `brand.logo` (alt `brand.name`) and `brand.name` in their header, `--pl-accent`/`--pl-bg`/`--pl-ink`/`--pl-font` from the brand; `playerShell` sets `<title>` to `brand.name` and links `font.url`. The bar shows the logo (alt `brand.name`) before the task name; with `accent`, `background` or `text` set it uses them through `chromeVars`, keeping the contrast floors in `theme.ts`; without them it keeps reading the host page (`readHost`); `font.family` wins over the host font.

- [ ] **Step 1: Write the failing tests** (`brand.test.ts`):
  - `stores the brand with the run`: a config `{ author: 'Acme Labs', brand: { name: 'Acme', logo: 'https://acme.test/l.svg', accent: '#0a7d4f', background: '#ffffff', text: '#111111', font: { family: 'Inter', url: 'https://fonts.test/inter.css' } } }` compiles to that `brand`, and `participantView`/`barView` both carry it.
  - `defaults the name to the author`: `{ author: 'Acme Labs' }` → `brand.name === 'Acme Labs'`.
  - `refuses unsafe values`: `accent: 'red;}'`, `logo: 'javascript:x'`, `font: { family: 'x"><script>' }` each throw naming the field.
  - `shows no ui-tests marks anywhere a participant looks`: the text of every player screen (`renderToStaticMarkup` over each `Screen` kind), the taskbar and first-click bar markup, `playerShell(...)`, and `reportDocument(...)` contains neither `ui-tests` nor `Powered by` (the asset URLs inside `src` attributes are not text and are not checked); the logo `<img>` has `alt="Acme"`.
  - `the bar takes the brand's colours, else the host's`: `chromeVars` for a brand with `background: '#ffffff', text: '#111111'` uses them; for no brand colours equals today's `chromeTheme(readHost(...))` output.
  - `the player page carries the brand`: `playerShell` for the brand above has `<title>Acme</title>`, `<link rel="stylesheet" href="https://fonts.test/inter.css">` and `--pl-accent:#0a7d4f`.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/brand.test.ts` → FAIL.
- [ ] **Step 3: Implement**; delete `poweredBy` from the config type, the compiled schema, every view and every test fixture; regenerate the record schema.
- [ ] **Step 4: Run** `npx vitest run packages/ui-tests/test` → PASS; `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "White-label the bar and every server page from the config's brand"`.

### Task 7: The CLI works against the ui-tests server

**Files:**
- Modify: `src/types.ts` (`server`), `src/config.ts`, `src/templates/config.ts`, `src/cli/dev.ts`, `src/cli/recruit.ts`, `src/runner/invites.ts`, `src/cli/agent-run.ts`, `src/agents/harness-web.ts`, `src/cli/init.ts`, `src/cli/main.ts` (help text), `src/mcp/server.ts` (if it builds player URLs), `apps/web/ui-tests.config.ts`, `tests/product/rehearsal.spec.ts`, `tests/product/agent-web-cli.spec.ts`, `tests/product/agent-web.spec.ts`, `tests/product/lan.spec.ts`, `tests/product/fixtures/agent-web.ui.test.ts`
- Create: `src/cli/ensure-server.ts`, `src/browser/setups.ts`
- Test: `test/ensure-server.test.ts`, `test/cli-dev.test.ts`, `test/recruit.test.ts`, `test/cli-init.test.ts`, `test/agent-mcp.test.ts`/`agent-*.test.ts` as they change, `tests/getting-started.test.ts` (config line)

**Interfaces:**
- Consumes: Task 4 `startServer`, Task 3 `tagFor`, Task 1 `createRun({ appUrl })`.
- Produces: `UiTestsConfig.server?: { url?: string }`; `loadConfig` fills `server.url` with `'http://localhost:4300'`. `configTemplate` gains `server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' },` under `target`. `apps/web/ui-tests.config.ts` gains the same line.
- Produces (`ensure-server.ts`): `ensureServer(input: { url: string; store: RunStore; io: Io; bind?: string; fetch?: typeof fetch }): Promise<{ url: string; started: boolean; close(): Promise<void> }>`: `GET ${url}/healthz` (2 s); a JSON `{ name: 'ui-tests' }` answer → reuse (`started: false`); otherwise, for a loopback `url`, `startServer({ store: async () => store, port, host: bind ?? '127.0.0.1', publicUrl: url, ...env secrets })` and prints `Started the ui-tests server on <url>`; otherwise throws `ServerUnreachable` with message `ui-tests server not reachable: <url>`.
- Produces (`setups.ts`): `TAG_SETUPS: { name: 'Vite' | 'Astro' | 'Next.js' | 'Rails' | 'Plain HTML'; line: string }[]`, exactly:
  - Vite: `index.html: <script data-ui-tests="%VITE_UI_TESTS_URL%">…</script>, with VITE_UI_TESTS_URL in .env`
  - Astro: `<script is:inline data-ui-tests={import.meta.env.PUBLIC_UI_TESTS_URL}>…</script> in your layout`
  - Next.js: `<script data-ui-tests={process.env.NEXT_PUBLIC_UI_TESTS_URL} dangerouslySetInnerHTML={{ __html: TAG_SCRIPT }} /> in app/layout.tsx, with TAG_SCRIPT from 'ui-tests/tag'`
  - Rails: `<script data-ui-tests="<%= ENV["UI_TESTS_URL"] %>">…</script> in app/views/layouts/application.html.erb`
  - Plain HTML: `the tag as printed, with the address of your ui-tests server`
- `dev.ts`: after the target check, `ensureServer({ url: config.server.url, store, io })`; the run is created with `appUrl: target`; player URL `${server}/ui-tests/${run}/?t=<token>`; the in-process server closes when the trace is closed.
- `invites.ts`: `inviteLink(server: string, run: string, token: string, bypass?: string): string` → `${server}/ui-tests/${run}/?t=<token>[&bypass=<secret>]`; `createInvites`/`reissueInvites` take `linkBase` as the server address.
- `recruit.ts` (this task; `--tunnel` and `--host` move to the front door in Task 8): the link base is `config.server.url` (`linkBaseFor(server, host)` with `--host`); `--local` uses `ensureServer`; otherwise `GET ${server}/healthz` must answer or it exits 2 with `ui-tests server not reachable: <url>` before any run exists. The run's `appUrl` is the target (or `linkBaseFor(target, host)` with `--host`).
- `agent-run.ts`/`harness-web.ts`: `playerUrl = ${server}/ui-tests/${run}/`; the probe is `ensureServer` for a loopback server, else `GET ${server}/api/ui-tests/` must be 401 (message `ui-tests server not reachable: <url>`); in the harness the "on the player" and "collector answered" checks compare `origin` with the server's and the path with `/ui-tests/` / `/api/ui-tests/`.
- `init.ts`: drop `mountLines`; print `\nAdd this tag to your app's HTML layout:\n  ${tagFor('http://localhost:4300')}\n\nThe address differs between rehearsal, previews and production. Read it from the environment:\n` then one `  <name>: <line>` per `TAG_SETUPS`, then `\nStart the server with: npx ui-tests serve (rehearsal starts it for you)\n`. Export `initTag = tagFor('http://localhost:4300')`.

- [ ] **Step 1: Write the failing tests.**
  - `ensure-server.test.ts`: `reuses a running server` (a stub http server answering `/healthz` with `{"ok":true,"name":"ui-tests"}` → `started: false`, no second listen); `starts one on a free loopback port` (→ `started: true`, `/healthz` answers, `close()` frees the port); `refuses another service on the port` (stub answers 200 `ok` text → it does not reuse; the port is busy, so it throws `ui-tests server not reachable`); `refuses a remote address it cannot reach` (`http://10.255.255.1:4300` with a fetch that rejects → throws, never listens).
  - `cli-dev.test.ts`: `--no-open` prints `{"player":"http://127.0.0.1:<port>/ui-tests/r_…/?t=<64 hex>"}` on the server's address, not the target's; the stored run has `appUrl` equal to the target.
  - `recruit.test.ts`: invite links start with `${serverUrl}/ui-tests/${run}/?t=`; with `VERCEL_AUTOMATION_BYPASS_SECRET=s` they end with `&bypass=s` and carry no `x-vercel` parameter; with the server down → exit 2, stderr `ui-tests server not reachable: http://127.0.0.1:<port>`, and `listRuns()` is empty.
  - `cli-init.test.ts`: output contains `initTag` verbatim and one line per `TAG_SETUPS` entry; it contains neither `ui-tests/next` nor `ui-tests/server`; the written config contains `server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' }`.
  - `tests/getting-started.test.ts`: `apps/web/ui-tests.config.ts` contains the `server` line above.
  - Product specs: `rehearsal.spec.ts` (CLI in `apps/web` with `PREVIEW_URL=PRODUCT_URL`, `UI_TESTS_PUBLIC_URL=SERVER_URL`) opens the printed player on `SERVER_URL`, completes the landing task on the Next page through the tag, and still reads `Rehearsal: 0 of 5 planned attempts recorded.`; `agent-web-cli.spec.ts` and `agent-web.spec.ts` drive the player on `SERVER_URL` and the task on `PRODUCT_URL`; `lan.spec.ts` gets links on `http://<lan>:4300`.
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/ensure-server.test.ts packages/ui-tests/test/cli-dev.test.ts packages/ui-tests/test/recruit.test.ts packages/ui-tests/test/cli-init.test.ts` → FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** the unit tests and `npx playwright test --project product --project lan` → PASS; `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Point rehearsal, invites and agent runs at the ui-tests server"`.

### Task 8: One front door for tunnels and LAN hosts

**Files:**
- Create: `src/server/front-door.ts`
- Modify: `src/cli/recruit.ts`, `src/tunnel/session.ts` (opens the tunnel to the front door), `src/cli/main.ts` (help for `--tunnel`/`--host`), `tests/product/lan.spec.ts`
- Test: `test/front-door.test.ts`, `test/tunnel.test.ts`, `test/perimeter.test.ts`, `test/recruit.test.ts`

**Interfaces:**
- Consumes: Task 7 `ensureServer`, Task 1 `setRunApp`, `inviteLink`.
- Produces (`front-door.ts`): `SERVER_PREFIXES = ['/ui-tests.js', '/ui-tests/', '/api/ui-tests/', '/r/', '/rv/']`; `isServerPath(pathname: string): boolean`; `rewriteTag(html: string, origin: string): string` (replaces the value of `data-ui-tests` on `<script` start tags only, quoted with `"` or `'`, including an empty value; nothing else in the page changes); `startFrontDoor(input: { app: string; server: string; host?: string; port?: number; appHeaders?: Record<string, string> }): Promise<{ url: string; close(): Promise<void> }>`: a `node:http` proxy; server paths go to `server` with `X-Forwarded-Host` = the request's `Host` and `X-Forwarded-Proto` = the request's `X-Forwarded-Proto ?? 'http'`; everything else goes to `app` (with `appHeaders`, `Accept-Encoding: identity`), and `text/html` answers pass through `rewriteTag` with the origin `${proto}://${host}` and without `content-length`/`content-encoding`. Binds `host ?? '127.0.0.1'`, `port ?? 0`.
- `recruit --tunnel`: `ensureServer`, `startFrontDoor({ app: target, server })`, the tunnel opens the front door's URL; `linkBase` and the run's `appUrl` are the tunnel URL (`setRunApp` on every reopen, so a resumed run with a new quick-tunnel address accepts the new origin); invite slots reissue under it as today.
- `recruit --host <name>`: `ensureServer`, `startFrontDoor({ app: target, server, host: '0.0.0.0' })`; `linkBase` and `appUrl` are `linkBaseFor(door.url, name)`; the command holds until the deadline or Ctrl-C, like `--tunnel`, and prints `Inside the perimeter: links are on <base>. Keep this command running while people take part.`

- [ ] **Step 1: Write the failing tests.**
  - `front-door.test.ts` (stub app and stub server on loopback ports): `/ui-tests.js`, `/ui-tests/r_X/`, `/api/ui-tests/?run=r_X`, `/r/r_X`, `/rv/r_X/p1` reach the server stub with `x-forwarded-host` equal to the door's host; `/`, `/ui-tests-guide` and `/api/other` reach the app stub; an app page `<script data-ui-tests="http://localhost:4300">x</script>` comes back with `data-ui-tests="http://127.0.0.1:<door port>"`; `data-ui-tests=""` is rewritten too; a `<div data-ui-tests="keep">` and a JSON answer are byte-identical; with `X-Forwarded-Proto: https` and `Host: abc.trycloudflare.com` the tag becomes `https://abc.trycloudflare.com`; `appHeaders` reach the app stub only.
  - `tunnel.test.ts` (fake tunnel): links and `appUrl` are on the tunnel URL; a second `recruit` with the same key and a new fake address leaves `runOrigins` holding both and reissues unclaimed links under the new one.
  - `perimeter.test.ts` / `recruit.test.ts`: `--host 10.0.0.5` prints links `http://10.0.0.5:<door port>/ui-tests/<run>/?t=`; the run's `appUrl` is `http://10.0.0.5:<door port>`; `--host` with `--tunnel` and `--local` with `--host` keep their refusals.
  - `lan.spec.ts`: `recruit --host <lan>` in a temp project with target `PRODUCT_URL` gives links on the door; a participant opens one at `http://<lan>:<door port>`, completes the landing task with the bar loaded from the door's own origin (every request's origin is the door's).
- [ ] **Step 2: Run** `npx vitest run packages/ui-tests/test/front-door.test.ts packages/ui-tests/test/tunnel.test.ts packages/ui-tests/test/perimeter.test.ts` → FAIL.
- [ ] **Step 3: Implement** `front-door.ts` and the two recruit paths.
- [ ] **Step 4: Run** the tests and `npx playwright test --project lan` → PASS (skipped only where the machine has no LAN address, as today); `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Serve the app and the ui-tests server through one front door for tunnels and LAN hosts"`.

### Task 9: Remove the Next.js mount; product e2e runs on `ui-tests serve` with two apps

**Files:**
- Delete: `src/next/` (whole directory), `src/server/index.ts`, `src/server/player-page.tsx`, `src/server/report-page.tsx`, `src/server/store.ts` (its retention moves into `cli/serve.ts`), `apps/web/app/api/`, `apps/web/app/ui-tests/`, `apps/web/app/r/`, `apps/web/app/rv/`
- Modify: `packages/ui-tests/package.json` (exports `"."`, `"./config"`, `"./tag"`, `"./schemas/*"`), `src/server/collector.ts` (consent sets only `ui-tests-run`; no `ui-tests-active`), `apps/web/app/layout.tsx` (tag only), `apps/web/next.config.ts` (one static mode: `output: 'export'`, `trailingSlash: true`, `transpilePackages: ['ui-tests']`), `apps/web/package.json` (drop `build:server`, `start:server`; `dev` is `next dev --hostname 127.0.0.1`), `playwright.config.ts`, `tests/product/helpers.ts`, every `tests/product/*.spec.ts`, `test/server-index.test.ts` → `test/server-store.test.ts` covers `serve`'s store opening
- Create: `apps/web/.env.development` (`NEXT_PUBLIC_UI_TESTS_URL=http://localhost:4300`), `tests/product/site-tag.spec.ts` (replaces `mount.spec.ts`)

**Interfaces:**
- Consumes: everything above.
- Produces (`playwright.config.ts`): web servers: the site build `NEXT_PUBLIC_UI_TESTS_URL=http://127.0.0.1:4300 npm run build && python3 -m http.server 3000 --bind 127.0.0.1 --directory apps/web/out` (url `http://localhost:3000`); `ui-tests serve --port 4300` as in Task 5; the plain fixture on 3200. Projects: `site` (unchanged), `product` (`tests/product`, ignoring `lan.spec.ts`), `lan`. `helpers.ts`: `PRODUCT_URL = 'http://127.0.0.1:3000'` (the static export is the app), `SERVER_URL`, `PLAIN_URL`; every player URL is on `SERVER_URL`.
- Produces: the site's production build (no env) renders `data-ui-tests=""`, which the snippet ignores.

- [ ] **Step 1: Write the failing tests.**
  - `site-tag.spec.ts`: `the landing carries the tag and makes no request without an attempt` (requests leaving `PRODUCT_URL` → `[]`, no `[data-ui-tests-root]`); `the static export holds no player, collector or report` (`apps/web/out` has `index.html` and no `ui-tests/`, `api/`, `r/`, `rv/` directories); `a rehearsal link opens the consent on the server`; `the cookie stays on the server`: after consent `context.cookies(SERVER_URL)` has `ui-tests-run` (`httpOnly`, `sameSite: 'Lax'`) and no `ui-tests-active`, and `context.cookies(PRODUCT_URL)` has none starting with `ui-tests`.
  - `test/exports.test.ts`: `packages/ui-tests/package.json` `exports` keys equal `['.', './config', './tag', './schemas/*']`; no file under `packages/ui-tests/src` or `apps/web` imports `next/navigation` from the package or `ui-tests/next`/`ui-tests/server`.
  - Port `goals`, `impression`, `questions`, `replay`, `report` (share links on `SERVER_URL/r/…`), `screener`, `video`, `rehearsal`, `agent-web*` specs: player on `SERVER_URL`, tasks on `PRODUCT_URL` (static export) or `PLAIN_URL`; first look's click on the real page through the tag; the report and its video under `SERVER_URL`.
- [ ] **Step 2: Run** `npx playwright test --project product` → FAIL (specs point at the old mount).
- [ ] **Step 3: Implement** the deletions and changes above.
- [ ] **Step 4: Run** `npm run typecheck && npx vitest run && npx playwright test` → PASS; `npm run validate` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Drop the Next.js mount: this site and a plain page use the tag against ui-tests serve"`.

### Task 10: CI proves a preview with a server started in the job

**Files:**
- Create: `tests/preview/preview.spec.ts`, `playwright.preview.config.ts`
- Modify: `playwright.config.ts` (project `preview`: `testDir: './tests/preview'`, against the site export on 3000 as a stand-in preview), `.github/workflows/ui-tests-check.yml`, `docs/github-check.md` (the job's new steps; Task 11 rewrites the rest)
- Test: the spec itself; `tests/workflows.test.ts`

**Interfaces:**
- Consumes: Task 8 `startFrontDoor`, `setRunApp`; Task 4 `serve`.
- Produces (`preview.spec.ts`): reads `PREVIEW_URL` (default `http://localhost:3000`), `SERVER_URL` (default `http://127.0.0.1:4300`), `VERCEL_AUTOMATION_BYPASS_SECRET`; the run is `UI_TESTS_RUN` if set, else the latest run whose `build.url` is `PREVIEW_URL`, else one it creates from `apps/web/ui-tests/landing.ui.test.ts`. It starts `startFrontDoor({ app: PREVIEW_URL, server: SERVER_URL, appHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : {} })`, calls `setRunApp(store, run, door.url)`, makes a rehearsal attempt (participant `ci-preview`, so it never counts toward n), drives it through the player, the landing task (to `/docs/getting-started`, Done, every question) and asserts the attempt is `finished` with reason `done` and an `end` snapshot whose `url` contains `/docs/getting-started`; it writes the run id to `.ui-tests/preview-run`.
- `playwright.preview.config.ts`: `testDir: './tests/preview'`, no web servers (the job starts them).
- `ui-tests-check.yml` `check` job, after `npm ci`, each step guarded by `steps.configured.outputs.run == 'true'`: start `npx ui-tests serve --port 4300 &` in `apps/web` with `UI_TESTS_PUBLIC_URL=http://127.0.0.1:4300` and wait for `/healthz` (30 s); `npx ui-tests check` (unchanged); `npx playwright install --with-deps chromium`; `npx playwright test -c playwright.preview.config.ts` with `PREVIEW_URL`; `npx ui-tests verify "$(cat .ui-tests/preview-run)"` and `npx ui-tests status "$(cat .ui-tests/preview-run)"` with `GITHUB_TOKEN`. The secrets list stays `UI_TESTS_DATABASE_URL`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `UI_TESTS_SHARE_SECRET`; `UI_TESTS_SERVER=1` appears nowhere.

- [ ] **Step 1: Write the failing tests.** `preview.spec.ts` as above (it fails until the project exists). `tests/workflows.test.ts`: `ui-tests-check.yml` contains `ui-tests serve`, `/healthz`, `playwright.preview.config.ts`, `ui-tests status`, and not `UI_TESTS_SERVER`; every new step in the `check` job has the `configured` guard; `ci.yml` still has the job named `Automation CI`.
- [ ] **Step 2: Run** `npx playwright test --project preview && npx vitest run tests/workflows.test.ts` → FAIL.
- [ ] **Step 3: Implement** the spec, the configs and the workflow steps.
- [ ] **Step 4: Run** the same → PASS; `npm run validate` → PASS. The workflow itself needs the repository's secrets and a real preview: documented, not executed.
- [ ] **Step 5: Commit** `git commit -m "Prove the preview flow in CI with a ui-tests server started in the job"`.

### Task 11: Every document tells the tag-and-server story, and validate holds it there

**Files:**
- Modify: `docs/prd/05-integration.md` (Where things run: tag on any app, collector/player/report on the author's ui-tests server, the hosted column's "one snippet" row merged; Reachability rows "Where the collector and store live" → the ui-tests server; the "any framework can implement the contract … Next.js is the one shipped" paragraph replaced by the tag, the server and the front door; "When the laptop closes" names the server and the front door), `docs/prd/01-dx-contract.md` (`init` row prints the tag and the per-setup lines; new `ui-tests serve` row with `PORT` 4300, `UI_TESTS_PUBLIC_URL`, the store, `/healthz` and the Docker image; `host` row: Docker and `serve` are the path until #59; config gains `server` and `brand`), `docs/prd/README.md:32` and `docs/story-map.md:165` (drop "any framework adapter other than Next.js"; framework adapters stay out because one tag serves all), `docs/story-map.md:43,121` (the tag card), every PRD row saying "in the app" for the collector or player, `docs/prd/06-nonfunctional.md` (the attempt key, handoff code and fragment under Security; the loader's size budget), `docs/stack.md`, `docs/pitch.md:75`, `docs/github-check.md`, `docs/postgres-store.md`, `docs/tunnel.md`, `docs/agent-runs.md`, `README.md` (the `apps/web` row: a static site carrying the tag; a `ui-tests serve` / Docker line), `apps/web/lib/copy.ts:44` (`does: 'Writes a study file and a config, and prints the script tag for your app.'`), `apps/web/lib/getting-started.ts`, `apps/web/app/docs/getting-started/page.tsx`, `packages/ui-tests/skills/ui-tests/SKILL.md`, `packages/ui-tests/scripts/write-skill-rules.ts` if it carries the mount, `tests/getting-started.test.ts`
- Create: `tests/one-story.test.ts`

**Interfaces:**
- Consumes: Task 7 `initTag`, `TAG_SETUPS`; Task 4 server facts.
- Produces (`getting-started.ts`): step ids `['install', 'init', 'tag', 'study', 'run', 'read']`; the `tag` step: heading `'Add the tag and start the server'`, text saying the tag does nothing until a person is in an attempt and rehearsal starts the server for you, `tag: initTag`, `setups: TAG_SETUPS`, `command: 'npx ui-tests serve'` shown as the way to run it yourself, plus `docker run -p 4300:4300 -v ui-tests:/data ghcr.io/miguel-perez/ui-tests`. The `ci` steps replace "`UI_TESTS_SERVER=1` in the Preview environment" with: run `ui-tests serve` (or the image) for the length of the study, set `UI_TESTS_PUBLIC_URL` on it, and set `NEXT_PUBLIC_UI_TESTS_URL` (or your framework's variable) on the preview to that address.
- Produces (`one-story.test.ts`): lists tracked files with `git ls-files` (`*.md`, `*.ts`, `*.tsx`, `*.mjs`, `*.json`, `*.yml`, `*.html`), excluding `factory/`, `docs/plans/`, `docs/superpowers/`, `docs/issues/` (dated records of earlier decisions), `package-lock.json` and itself; fails listing `file:line` for any match of `/ui-tests\/next\b/`, `/['"\`]ui-tests\/server['"\`]/`, `/\bUI_TESTS_SERVER\b/`, `/<UiTests\b/`, `/\bPlayerPage\b/`, `/\[\[\.\.\.path\]\]/`, `/\b(?:page|route)\.server\.tsx?\b/`, `/lines to mount/i`, `/Mount it in your app/`.

- [ ] **Step 1: Write the failing tests.** `one-story.test.ts` as above → it lists every remaining mention. `tests/getting-started.test.ts`: step ids as above; the `tag` step's `tag` equals `initTag` and `setups` equals `TAG_SETUPS`; the CI steps mention `ui-tests serve` and not `UI_TESTS_SERVER`; `compilation.commands[1].does` equals the copy above. The skill test (`test/skill.test.ts`) asserts `SKILL.md` names `ui-tests serve` and the tag.
- [ ] **Step 2: Run** `npx vitest run tests/one-story.test.ts tests/getting-started.test.ts packages/ui-tests/test/skill.test.ts` → FAIL, listing the files above.
- [ ] **Step 3: Rewrite** each file to the design's story: one tag in any app, a ui-tests server the author runs (`npx ui-tests serve` or the Docker image) only while a study is open, rehearsal starting it, the front door for `--tunnel` and `--host`, white-labelling by `brand`, and no ui-tests-operated service. Keep every R0 to R2 fact that still holds (consent, first click on the real page, retry buffer, replay and video, voice, withdrawal, signed report links, agent runs apart, the check). Render the `tag` step on the getting-started page with the same `Command` component (`label="the script tag"`), the setup lines as a list.
- [ ] **Step 4: Run** the three tests → PASS; `npm run validate` → PASS (the `site` e2e project renders the new getting-started page; `tests/vocabulary.test.ts` passes).
- [ ] **Step 5: Commit** `git commit -m "Tell one story everywhere: a script tag and a server you run"`.

---

## Self-review

- **Spec coverage.** Goal 1 (one tag, nothing else): Tasks 3, 5, 9. Goal 2 (no request without an attempt; server up only during a study): Task 3 snippet tests, Task 5 and Task 9 e2e. Goal 3 (`serve`, Node 24, Docker): Task 4. Goal 4 (rehearsal, recruit `--tunnel`/`--host`/`--local`, CI previews, agent runs, the check): Tasks 7, 8, 10. Goal 5 (white label, no marks): Task 6. Goal 6 (every document): Task 11, held by `one-story.test.ts`. Decisions after the builder check: front door (Task 8), no permanent server and CI proof (Tasks 9, 10), CLI through the store with origins stored on the run (Task 1), handoff code and narrow key (Tasks 1 to 3), every tab via `localStorage` and `storage` (Tasks 3, 5), one server per project (Task 4: one store, one CLI secret, one share secret per process). Anti-goals: the security bullets in Global Constraints are each pinned by a named test in Tasks 1 to 5.
- **Names checked across tasks:** `BarView`, `barView`, `handoffUrl`, `HANDOFF_TTL_MS`, `ATTEMPT_KEY_TTL_MS`, `StoredAttempt`, `STORAGE_KEY`, `TAG_SCRIPT`, `tagFor`, `initTag`, `TAG_SETUPS`, `ensureServer`, `startServer`, `createHandler`, `startFrontDoor`, `setRunApp`, `runOrigins`, `appUrlOf`, `reportDocument`, `getBundles`.
- **Transitional seams**, each removed by Task 9: `src/next/index.tsx` as a cookie client around `Bar` (Task 3) with a guard (Task 5); `src/server/{index,player-page,report-page,store}.ts(x)` for apps/web's server mode (Tasks 4 to 8).
