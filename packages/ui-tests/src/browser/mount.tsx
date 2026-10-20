import { createRoot } from 'react-dom/client'
import { Bar, type BarClient } from './bar.tsx'
import { ROOT_ATTRIBUTE } from './recorder.ts'

/** The host page's inherited styles stop at the bar: it sets its own colours, font and size. */
const HOST_CSS = ':host { all: initial; }'

/**
 * Mounts the bar on the app's page: one host element at the end of the body, marked so the recorder, the replay and the snapshot leave
 * it out, with an open shadow root so the page's CSS cannot reach the bar and the bar's cannot reach the page. Returns the unmount.
 */
export function mountBar(client: BarClient, doc: Document): () => void {
  const host = doc.createElement('div')
  host.setAttribute(ROOT_ATTRIBUTE, '')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = doc.createElement('style')
  style.textContent = HOST_CSS
  const container = doc.createElement('div')
  shadow.append(style, container)
  doc.body.append(host)
  const root = createRoot(container)
  root.render(<Bar client={client} />)
  let mounted = true
  return () => {
    if (!mounted) return
    mounted = false
    root.unmount()
    host.remove()
  }
}
