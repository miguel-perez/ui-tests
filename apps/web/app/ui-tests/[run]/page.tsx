import { Player } from 'ui-tests/next'
export const metadata = { title: 'Your rehearsal' }
export default async function Page({ params, searchParams }: { params: Promise<{ run: string }>; searchParams: Promise<{ token?: string }> }) {
  return <Player runId={(await params).run} token={(await searchParams).token}/>
}
