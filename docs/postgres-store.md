# Postgres store: setup that needs real credentials

Documented, not executed. The code path is tested on PGlite (`UI_TESTS_DATABASE_URL=pglite:memory`).

## Store selection

`UI_TESTS_DATABASE_URL` picks the run store:

- `postgres://…` (Neon, over `@neondatabase/serverless`)
- `pglite:memory` or `pglite:<dir>` (PGlite, for local use and tests)
- unset: SQLite at `${UI_TESTS_DATA_DIR ?? '<repo>/.ui-tests'}/dev.sqlite`

The schema is applied on first use, under a Postgres advisory lock, and recorded in `schema_migrations`.

## Running from CI (getting-started, under "Running from CI")

1. Create a Neon project and database; copy its pooled connection string.
2. The ui-tests server: for the length of the study, run `npx ui-tests serve` (or, from a clone of the repository, `docker build -t ui-tests .` then `docker run -p 4300:4300 -v ui-tests:/data -e UI_TESTS_DATABASE_URL=… -e UI_TESTS_PUBLIC_URL=… ui-tests`; the image is to be published as `ghcr.io/miguel-perez/ui-tests`) where participants can reach it, with `UI_TESTS_DATABASE_URL` set to that string and `UI_TESTS_PUBLIC_URL` set to its public address.
3. Vercel: set `NEXT_PUBLIC_UI_TESTS_URL` (or your framework's variable for the tag's address) in the Preview environment to that address. The preview itself needs no database: it carries only the tag.
4. GitHub Actions: add the same string as the repository secret `UI_TESTS_DATABASE_URL`, pass it to the workflow's `env`, and set `UI_TESTS_PUBLIC_URL` there to the server's address. The config `init` writes reads `server.url` from it, so `ui-tests check` finds the server and puts the invite links on it; without it, `check` looks for a server at `http://localhost:4300` and exits 2 when none answers.

To prove a preview without people, start `npx ui-tests serve` inside the job before `ui-tests check` and leave `UI_TESTS_PUBLIC_URL` unset, as this repository's check does ([`github-check.md`](github-check.md)). That server ends with the job, so it is not one to invite people to.

The record then outlives any preview and any server: the CLI and the server read the same database, and a run is read by its handle from anywhere that shares it.
