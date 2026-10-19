import { Player } from '../player/player.tsx'

/** The participant's page: mount it at `app/ui-tests/[run]/page.server.tsx`. Next 15 hands `params` over as a Promise. */
export async function PlayerPage({ params }: { params: Promise<{ run: string }> }) {
  const { run } = await params
  return <Player runId={run} />
}
