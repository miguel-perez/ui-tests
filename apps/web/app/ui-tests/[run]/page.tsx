import { Player } from 'ui-tests/next'
export const metadata = { title: 'Your rehearsal' }
/** The participant player route. The token arrives in the query on first load; the player removes it from the URL. */
export default async function Page({ params, searchParams }: { params: Promise<{ run: string }>; searchParams: Promise<{ token?: string }> }) {
  return <Player runId={(await params).run} token={(await searchParams).token}/>
}
