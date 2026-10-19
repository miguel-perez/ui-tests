# ui-tests

See where people get stuck on what you just shipped.

ui-tests is a planned open-source runner for usability tests written like Playwright tests. You say who your users are, what they are trying to do and how you would know they did it. Real people try it on your preview, and you get back the problems they hit, ranked.

## Status

Nothing is built yet. This repository holds the landing page and the documents behind it. The page describes the product as designed: its commands, its example file and its pull-request check are the plan, not a package you can install. It is the false door the [pitch](docs/pitch.md) describes, and the product's first test subject.

## What is here

| Path | What it is |
| --- | --- |
| [`apps/web`](apps/web) | The landing page: Next.js, exported as a static site to `apps/web/out` |
| [`docs/pitch.md`](docs/pitch.md) | The frame every other document references |
| [`docs/prd/`](docs/prd/README.md) | The product requirements, one file per area |
| [`docs/story-map.md`](docs/story-map.md) | Release order |
| [`docs/discovery/`](docs/discovery) | The research the page and the PRD rest on |
| [`docs/design/`](docs/design), [`design/`](design) | The page's content plans, artefacts, brand and captures |
| [`factory/`](factory/README.md) | The delivery automation, vendored from `miguel-perez/archon-factory` |

## Running the site

```sh
npm ci
npm run dev        # http://127.0.0.1:3000
npm run build      # writes the static site to apps/web/out
```

`npm run validate` checks the factory, TypeScript and the unit tests, then builds the site and runs the browser tests (layout, accessibility, copy) against the exported files. It needs `npx playwright install chromium` once, and `python3` to serve the export.

## Contributing and automation

Planning documents live in [`docs/`](docs/). To start delivery, open an issue with acceptance criteria and comment:

```text
@archon /workflow run autonomous-delivery Implement this issue and satisfy its acceptance criteria.
```

Edit factory behavior in `factory/`, run `node factory/install.mjs`, and commit both. The host, status and recovery commands are the `automation:*` npm scripts; see the factory README for GitHub configuration and the local host. The model reviewer's report and the protected merge requirements remain in force.

## Licence

[MIT](LICENSE).
