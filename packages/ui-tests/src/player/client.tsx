import { createRoot } from 'react-dom/client'
import { Player } from './player.tsx'

// The player's page as `ui-tests serve` writes it: one root naming the run.
const root = document.getElementById('root')
if (root?.dataset.run) createRoot(root).render(<Player runId={root.dataset.run} />)
