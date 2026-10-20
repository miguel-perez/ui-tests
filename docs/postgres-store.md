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
2. Vercel: set `UI_TESTS_DATABASE_URL` to that string in the Preview environment (with `UI_TESTS_SERVER=1`).
3. GitHub Actions: add the same value as the repository secret `UI_TESTS_DATABASE_URL` and pass it to the workflow's `env`.

The record then outlives any preview: a run is read by its handle from any deployment that shares the database.
