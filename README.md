# ui-tests

See where people get stuck on what you just shipped.

ui-tests is an open-source runner for usability tests written like Playwright tests. You say who your users are, what they are trying to do and how you would know they did it. Real people try it on your preview, and you get back the problems they hit, ranked.

## Status

Built and verified offline from a clone: the `ui-tests` package (the authoring API, lint, the `ui-tests` command, the script tag, the ui-tests server with the player, collector and report, the trace, the pull-request check and agent runs), and this site, which carries the tag like any other app. The landing page is the false door the [pitch](docs/pitch.md) describes, and the product's first test subject; its study is `apps/web/ui-tests/landing.ui.test.ts`.

What does not work yet:

- The package is not on npm, so `npm install -D ui-tests` finds nothing. Run it from a clone, as below.
- Paying a panel is not built: `recruit` makes your own invite links; inviting visitors on a live site is not built. `ui-tests host` prints its plan and stops.
- Several steps need your own accounts and are written down in [getting started](apps/web/app/docs/getting-started/page.tsx), not run from here: publishing the Docker image, a Neon database, a ui-tests server for a Vercel preview, a GitHub token and secrets, an `ANTHROPIC_API_KEY` for agent runs, a named cloudflared tunnel, and a VoiceOver check on Safari.
- Nobody has yet run the landing study with five real people, or an agent through all five trials with a real model. See [`docs/story-map.md`](docs/story-map.md).

## The study

The landing's own study, as it shows it:

```ts
import { study, task, outcome, expect } from 'ui-tests'

study('getting started', {
  users: {
    are: 'developers who ship UI and have no researcher',
    did: 'shipped a user interface you built yourself',
    within: '3 months',
    role: ['developer', 'designer', 'founder'],
    not: ['works in UX research'],
  },
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  task('start trying ui-tests', { path: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})
```

## The commands

```sh
npm install -D ui-tests
npx ui-tests init
npx ui-tests
npx ui-tests recruit
npx ui-tests check
```

`init` writes a study file and a config, and prints the script tag for your app: one inline `<script>` in its HTML layout, whatever the app is built with, that does nothing until a person is in an attempt. With no command, the study runs on you, in your browser, and recruits nobody. `recruit` runs it with real people through your link. `check`, in the job that deploys your preview, posts the result as a check on the pull request. The package is not on npm yet, so the first line works only after it is published; until then use the clone below.

The consent, the questions, the collector and the report run on a ui-tests server you run while a study is open. Rehearsal starts one on your machine; to run it yourself:

```sh
npx ui-tests serve                # http://localhost:4300; PORT, UI_TESTS_PUBLIC_URL, UI_TESTS_DATABASE_URL
docker build -t ui-tests .        # from a clone of the repository
docker run -p 4300:4300 -v ui-tests:/data ui-tests
```

The image is built from the [`Dockerfile`](Dockerfile) at the root. It is not on a registry yet: it is to be published as `ghcr.io/miguel-perez/ui-tests`, which needs an account and is not run from here.

## What is here

| Path | What it is |
| --- | --- |
| [`packages/ui-tests`](packages/ui-tests) | The package: authoring API, CLI, the script tag, the ui-tests server (player, collector, report), stores, check, agent runs, skill and MCP server |
| [`apps/web`](apps/web) | The landing page and docs: Next.js, exported as a static site to `apps/web/out`, carrying the tag; in development its tag points at `http://localhost:4300` (`apps/web/.env.development`) |
| [`docs/pitch.md`](docs/pitch.md) | The frame every other document references |
| [`docs/prd/`](docs/prd/README.md) | The product requirements, one file per area |
| [`docs/story-map.md`](docs/story-map.md) | Release order |
| [`docs/discovery/`](docs/discovery) | The research the page and the PRD rest on |
| [`docs/design/`](docs/design), [`design/`](design) | The page's content plans, artefacts, brand and captures |
| [`factory/`](factory/README.md) | The delivery automation, vendored from `miguel-perez/archon-factory` |

## Running the product

```sh
git clone https://github.com/miguel-perez/ui-tests
cd ui-tests
npm ci
npm run dev        # http://127.0.0.1:3000, the site, with its tag pointed at the ui-tests server on 4300
```

Leave that running. In a second terminal:

```sh
cd apps/web && npx ui-tests
```

That starts the ui-tests server on port 4300 if none is running, rehearses the landing study on you and shows the trace. The steps, and what needs your own accounts for CI, are in `/docs/getting-started` on the running site ([source](apps/web/app/docs/getting-started/page.tsx)).

`npm run build` writes the static site to `apps/web/out`. `npm run validate` checks the factory, TypeScript and the unit tests, then builds the site with its tag pointed at a `ui-tests serve` it starts, and runs the browser tests against the site, the server and a plain HTML page that carries nothing but the tag. It needs `npx playwright install chromium` once, and `python3` to serve the static export.

## Contributing and automation

Planning documents live in [`docs/`](docs/). To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. The model reviewer's report and the protected merge requirements remain in force.

## Licence

[MIT](LICENSE).
