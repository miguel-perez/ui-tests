import { createCollector } from 'ui-tests/server'
/** The development collector. It needs Node.js for SQLite and answers 404 in production. */
export const runtime = 'nodejs'
export const GET = createCollector()
export const POST = GET
