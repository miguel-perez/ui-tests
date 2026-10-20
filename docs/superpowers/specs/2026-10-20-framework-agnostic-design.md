# One script tag, any app: ui-tests without Next.js

Status: design, awaiting approval. Date: 20 October 2026.

## Intent

ui-tests has to work with whatever an author's app is built with: Vite, Astro, plain HTML, Rails, Next.js, anything that
serves HTML to a browser. The PRD made Next.js the one shipped integration (an SDK component in the root layout, a
collector route and a player page inside the author's app). The owner calls that a mistake in the PRD: the product should
be framework-agnostic from the start, and this change comes before any other work.

The way in is a single `<script>` tag. Everything else (the invite page, consent, screener, first look, the questions
after, the collector, the shareable report) runs on a **ui-tests server** that the author runs themselves: on their own
machine, through a tunnel, or on a machine they pay for or a free tier. Nobody operates a ui-tests service; that part of
the PRD stands.

## Goals

1. An author adds ui-tests to any app with one `<script>` tag in their HTML layout, and nothing else in the app: no
   component, no route, no page, no build plugin.
2. Without a person in an attempt, the tag makes no request and changes nothing on the page, so the ui-tests server only
   has to run while a study is open.
3. `npx ui-tests serve` starts the ui-tests server with one command on any machine with Node 24 or later; an official
   Docker image runs the same thing for hosts that prefer containers.
4. Rehearsal (`npx ui-tests`), `recruit` (`--tunnel`, `--host`, `--local`, previews from CI), agent runs and the GitHub
   check keep working, now against the ui-tests server instead of routes in the app.
5. What participants see can be white-labelled: the author's name, logo, colours and fonts, on the bar on their page and
   on every ui-tests server page. No ui-tests marks are shown to participants.
6. Every document says the same thing: the PRD, the story map, the getting-started page, the landing page, the README and
   the other docs describe the script tag and the server, and nothing describes the Next.js mount.

## Non-goals

- A ui-tests-operated hosted service, free or paid. The server is always the author's.
- Replacing the markup or CSS of the participant's screens wholesale. White-labelling is name, logo, colours and fonts.
- Framework-specific adapters or plugins (a Vite plugin, a Rails gem, a Next.js component). One tag serves all of them.
- Shipping `ui-tests host` (the one-command deploy to a provider, #59). It stays a stub; the Docker image and
  `ui-tests serve` are the path for now.
- Following a participant across a navigation to a different origin inside the author's app (for example from
  `app.example.com` to `auth.example.com`). The bar lives on one origin per attempt, as it does today.

## Anti-goals (would make this a failure even if it technically works)

- Any doc, page or command output still telling the Next.js story, or telling two stories.
- Participants seeing ui-tests branding, or a bar that can't be made to look like the author's product.
- The tag making the author's app slower or heavier when no run is on.
- A security regression: the tag must not let a crafted link run a script from an origin the author did not choose, and
  participant tokens must not leak into the app's server logs or be readable by the app's own scripts.

## Constraints

- The PRD (`docs/prd/*.md`) is binding and is corrected in this change; where this design differs, the PRD is rewritten
  to match, not left in conflict.
- Everything R0 to R2 shipped keeps working: consent and its purposes, the first click taken on the real page (PRD
  02:39), the retry buffer, replay and screen video, voice answers, withdrawal, the report and its signed links, agent
  runs reported apart, the GitHub check.
- AGENTS.md workflow: `npm run validate` passes; generated factory files are not edited.
- Node 24 or later for the server and the CLI. The tag must work in the browsers the player supports today.

## How it works

### The tag

```html
<script data-ui-tests="https://tests.example.com">/* a few hundred bytes, printed by ui-tests init */</script>
```

The tag is a short inline script with the author's ui-tests server in `data-ui-tests`. `ui-tests init` prints it with the
right address, plus one line per common setup on how to read the address from an environment variable (Vite, Astro,
Rails, plain HTML, Next.js), because the address differs between rehearsal, previews and production. The getting-started
page shows the same. Authors whose content security policy forbids inline scripts can host the same few lines as a file
with their app's own assets.

On every page load the inline script checks, without any request, whether a person is in an attempt: a handoff code in
the URL fragment or an attempt key in `localStorage` (below). If not, it stops: no requests, no DOM changes. So **the
ui-tests server only has to be up while a study is running**; between studies it can be stopped, and pages carrying the
tag are unaffected. If a person is in an attempt, the script loads `ui-tests.js` from the server in `data-ui-tests`, which
loads the rest (the bar, the recorder, rrweb when replay is on, the screen recorder when video is on) and mounts the bar
in a shadow root, so the host page's CSS cannot break the bar and the bar's CSS cannot leak into the page.

The server's address comes only from the tag the author wrote. A link cannot point the script at another server, so a
crafted link cannot make the author's page run someone else's script.

### The participant's journey

1. The invite link opens the player on the ui-tests server: `https://tests.example.com/ui-tests/<run>/?t=<token>`.
   Consent, screener, practice and the first look's opening screens happen there, as today.
2. The player hands the person into the app at the task's start URL with a one-time handoff code in the URL
   **fragment**: `https://app.example.com/start#ui-tests=<code>`. A fragment is never sent to the app's server, so the
   code stays out of its logs. Where a Vercel protection bypass is configured, the bypass parameters go on that URL's
   query, as they go on the invite link today.
3. The loader removes the fragment with `history.replaceState`, trades the code at the collector for an attempt key
   (see "Decisions made after the builder check"), and keeps the key in `localStorage` on the app's origin. From then on,
   every page and tab of the app finds it there, whether the app is a single-page app or a Rails app with full page
   loads.
4. The bar and recorder talk to the collector on the ui-tests server cross-origin, with the attempt key as
   `Authorization: Bearer`. No cookies cross sites, so Safari's and Chrome's third-party cookie rules do not apply.
5. The first-look click is taken on the real page, as now, and Done and "I couldn't do this" send the person back to the
   player on the ui-tests server (`/ui-tests/<run>/?after=…`) for the questions after. The loader knows the server's
   address because it was loaded from it.
6. When the attempt ends or is withdrawn, the loader clears the attempt key from `localStorage`.

### The ui-tests server

`npx ui-tests serve` is one Node process (`node:http`, like the trace server already is). It serves:

| Path | What |
| --- | --- |
| `/ui-tests.js` and its chunks | the loader and the lazy bundles, built with esbuild into the package, cached by content hash |
| `/api/ui-tests/` | the collector, today's `createCollector`, unchanged in its actions |
| `/ui-tests/<run>/` | the player (consent, screener, first look, scenario card, questions, voice) |
| `/r/…` and `/rv/…` | the shareable report and its signed video, as today |
| `/healthz` | for hosts and Docker health checks |

Settings come from the environment and the command line: the port (`PORT`, default 4300), the public address
(`UI_TESTS_PUBLIC_URL`, printed with the tag at start), the store (`UI_TESTS_DATABASE_URL`, else a file under
`.ui-tests/`), `UI_TESTS_SHARE_SECRET`, `UI_TESTS_TRANSCRIBER`. The Docker image is the same command with a volume for
the file store.

The collector accepts cross-origin requests only from the origins of the runs' targets (the study's `target.url`, the
preview URL a run was created for, the tunnel URL), answers CORS preflights for those, and requires the Bearer token on
every cross-origin request. Same-origin requests from the player keep today's cookie and Origin check.

### The CLI

- The config gains the server's address, separate from the app's (`target.url` stays the app). Rehearsal starts the
  ui-tests server itself on the local machine, so the default for local work is `http://localhost:4300` and the tag in
  dev points there.
- `recruit --tunnel` and `--host` expose the app and the ui-tests server through one front door (see "Decisions made
  after the builder check"), since participants must reach both.
- Invite links point at the ui-tests server's player, not at a path in the app.
- Agent runs (R2) find the player and the collector on the server instead of the app.
- `ui-tests init` writes the config and the study as now and prints the tag instead of three mount lines.

### White-labelling

The config gains a `brand`: the name shown to participants (also the "who is running the study" in the consent, which
the author cannot remove), a logo, colours (accent, background, text) and fonts (a family and an optional font URL). The
brand is stored with the run when it is created, so the server and the bar render it without reading the author's
files. Without a brand, the bar keeps today's behaviour of taking colours and font from the host page (`theme.ts`), and
the server pages use a neutral theme. Neither the bar nor the server pages show ui-tests marks.

### Next.js

Next.js apps use the same tag (through `next/script` or a plain `<script>`); there is no `ui-tests/next` component and no
`ui-tests/server` route export. This repository's own site, `apps/web`, drops its mounted routes and its server build
mode and uses the tag like any other app; its static export stays as it is. The product e2e tests run against
`ui-tests serve` plus two apps: `apps/web` and a plain static HTML page with nothing but the tag, which is the proof that
no framework is involved.

### What changes in the docs and the site

- PRD: `05-integration.md` (where things run, reachability, the collector's location), `01-dx-contract.md` (the `init`
  and `host` rows, plus a `serve` row), `README.md` and the story map's out-of-scope line (no more "any framework adapter
  other than Next.js"), and every row that says "in the app".
- The getting-started page: "Mount it in your app" becomes adding the tag and starting the server; the CI section
  replaces `UI_TESTS_SERVER=1` on a Vercel preview with a running ui-tests server.
- The landing page: the `init` line in the compile section ("prints the three lines to mount in your app") and any other
  landing copy, screenshots or example that implies Next.js or mounting.
- README, `docs/stack.md`, `docs/pitch.md`, `docs/github-check.md`, `docs/postgres-store.md`, `docs/tunnel.md`,
  `docs/agent-runs.md`, and the package's skill files.
- A check in `npm run validate` that fails if any tracked doc or page still mentions `ui-tests/next`, the mount lines or
  `UI_TESTS_SERVER`.

### Decisions made after the builder check (the designer's calls; the owner may overrule)

- **Tunnels and LAN hosts keep the tag unchanged.** For `recruit --tunnel` and `--host`, the CLI starts a local front
  door: one origin that proxies the ui-tests server's paths (`/ui-tests.js` and its chunks, `/api/ui-tests/`,
  `/ui-tests/<run>/`, `/r/`, `/rv/`) to the server and everything else to the app, and rewrites the tag's configured
  local server address in the app's HTML responses to the front door's own origin. One tunnel exposes the front door, so
  a random quick-tunnel address works without rebuilding or restarting the app. Deployed apps don't use the front door;
  their tag points at the server the author runs for the length of the study.
- **This repository runs no permanent server.** The site carries the tag with its server address empty until a study
  is run on it, and CI proves the preview flow by starting `ui-tests serve` inside the job next to the preview, creating
  a run, driving an attempt and reading it with the GitHub check.
- **The CLI keeps reaching data through the store, not through a server API.** As in R1 today, CI and the CLI hold
  `UI_TESTS_DATABASE_URL` for the same Postgres database the server uses; the file store is for one machine. The
  origins a run may be called from (its target, preview or front-door address) are stored with the run, and the
  collector's CORS check reads them from there.
- **The page never holds the participant's token.** The fragment carries a one-time handoff code, valid for a minute and
  for a single exchange. The loader trades it at the collector for an attempt key that can only do what the bar does:
  send events, replay and video, take the first click, record the step, ask for more time and end the attempt.
  Answers, withdrawal and reading the study's view stay with the player on the server origin, behind today's token and
  cookie. Analytics or error tools on the author's page that capture the URL catch only a code that is already spent.
- **Every tab of the app sees the attempt.** The attempt key lives in `localStorage` on the app's origin, keyed by
  attempt and expiring with it, so new tabs, `target="_blank"` links and popups on the same origin keep the bar and the
  recording, as the cookie does today; ending or withdrawing clears it, and the other tabs see that through the `storage`
  event.
- **One server, one author's project.** A server holds one store, one CLI secret and one share secret. Several studies
  and runs in that project share it; separate projects run separate servers.

## Success looks like

- The landing study rehearses end to end on this site with nothing but the tag, and on a plain HTML page served by a
  static file server.
- `npx ui-tests serve` and `docker run` both bring the server up; a link from `recruit` works through each.
- A preview from CI, with the tag pointing at a ui-tests server started for the run, produces a run the GitHub check reads.
- A run with a brand shows the author's name, logo, colours and fonts and no ui-tests marks, on the bar and on every
  server page.
- No page, doc or command output tells the Next.js story; `npm run validate` passes.

## Left to the builder

- Exact names: the config keys for the server address and the brand, the fragment key, the Docker image name.
- The size budget for the loader (aim: a few kilobytes) and how the lazy bundles are split.
- How the player is rendered on the server (an HTML shell plus the client bundle, or server rendering for the report).
- How the existing product tests are moved onto the server and the two fixture apps.
