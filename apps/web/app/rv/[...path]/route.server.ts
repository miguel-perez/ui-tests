import { GET_REPORT_VIDEO } from 'ui-tests/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const GET = (request: Request) => GET_REPORT_VIDEO(request)
