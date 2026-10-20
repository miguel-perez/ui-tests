import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { ROOT_ATTRIBUTE } from '../next/recorder.ts'
import type { Snapshot } from '../store/types.ts'
import type { Harness, ToolSpec } from './model.ts'

/** How long one action may wait for its element or page. */
export const WEB_ACTION_TIMEOUT_MS = 10_000
/** How much of a page's accessibility snapshot the agent is shown. */
export const WEB_OUTPUT_CAP = 64 * 1024
const MAX_SNAPSHOT_CHARS = 2_000_000

export type WebHarnessInput = {
  /** The product under test; the agent's pages are on this origin. */
  target: string
  /** The player for the agent run, `<origin>/ui-tests/<run>/`. The trial's own token is added when it starts. */
  playerUrl: string
}
export type WebHarnessOptions = { actionTimeoutMs?: number; outputCap?: number; headless?: boolean }

const message = (error: unknown) => error instanceof Error ? error.message.split('\n')[0]! : String(error)

const tools: ToolSpec[] = [
  { name: 'look', description: 'Returns the current page as an accessibility snapshot: its address, then its elements with a ref like e12 (or f1e12 inside a frame) for each one you can act on. Look again after the page changes: refs belong to the latest look.', input: { type: 'object', properties: {} } },
  { name: 'click', description: 'Clicks the element with this ref from your latest look, then returns the page as look does.', input: { type: 'object', properties: { ref: { type: 'string', description: 'The ref, for example e12 or f1e12' } }, required: ['ref'] } },
  { name: 'type', description: 'Replaces the text of the field with this ref from your latest look, then returns the page as look does.', input: { type: 'object', properties: { ref: { type: 'string', description: 'The ref, for example e12 or f1e12' }, text: { type: 'string' } }, required: ['ref', 'text'] } },
  { name: 'goto', description: 'Opens a path on the product, starting with /, then returns the page as look does. Only paths on the product can be opened.', input: { type: 'object', properties: { path: { type: 'string', description: 'The path and query, starting with /' } }, required: ['path'] } },
  { name: 'done', description: 'Call this when the task is done: it presses Done in the task bar. Nothing after it runs.', input: { type: 'object', properties: { summary: { type: 'string', description: 'What you did, in one line' } } } },
  { name: 'cannot', description: 'Call this when you cannot do the task: it presses "I couldn\'t do this" in the task bar. Nothing after it runs.', input: { type: 'object', properties: { reason: { type: 'string', description: 'What stopped you, in one line' } }, required: ['reason'] } },
]

/**
 * The web harness: the agent uses the product in a browser through the same player and collector a person uses. Each trial opens the
 * player as the trial's attempt, whose consent was given when the attempt was made (an agent is not asked); pressing Start task
 * there takes the agent to the product, where the same task bar and recorder run. The agent acts through `look`, `click`, `type`
 * and `goto` on the product's origin only, and ends with `done` or `cannot`, which press the bar's own buttons, so the end state is
 * the snapshot the collector stored. A trial that ends any other way is read from the page it was left on.
 */
export function webHarness(input: WebHarnessInput, options: WebHarnessOptions = {}): Harness {
  const target = new URL(input.target)
  const player = new URL(input.playerUrl)
  const allowed = new Set([target.origin, player.origin])
  const timeout = options.actionTimeoutMs ?? WEB_ACTION_TIMEOUT_MS
  const cap = options.outputCap ?? WEB_OUTPUT_CAP
  let browser: Browser | undefined
  let session: { context: BrowserContext; page: Page; ended: boolean } | undefined

  async function close() {
    const current = session
    session = undefined
    await current?.context.close().catch(() => {})
  }

  async function launch() {
    browser ??= await chromium.launch({ headless: options.headless ?? true })
    return browser
  }

  /** The page as text: its address, then its accessibility snapshot, cut at the cap. */
  async function look(page: Page): Promise<string> {
    const text = await page.ariaSnapshot({ mode: 'ai', timeout })
    return `url: ${page.url()}\n${text.length > cap ? `${text.slice(0, cap)}\n[snapshot cut at ${cap} characters]` : text}`
  }

  async function settle(page: Page) {
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {})
  }

  /** Presses a button of the task bar, which is the participant's, not the product's. */
  async function pressBar(page: Page, names: (string | RegExp)[]) {
    const bar = page.locator(`[${ROOT_ATTRIBUTE}]`)
    for (const name of names) await bar.getByRole('button', { name, exact: typeof name === 'string' }).click({ timeout })
  }

  async function end(page: Page, buttons: (string | RegExp)[]): Promise<{ output: string; error?: string }> {
    const current = session
    if (!current) return { output: '', error: 'no page is open' }
    if (current.ended) return { output: 'the task has ended' }
    try {
      await pressBar(page, buttons)
      await page.waitForURL(url => new URL(url).pathname.startsWith('/ui-tests/'), { timeout })
    } catch {
      return { output: '', error: 'could not press the task bar: it is not on this page. Use goto to open the product, then try again' }
    }
    return { output: 'the task has ended' }
  }

  return {
    tools: () => tools,
    async begin(attempt) {
      await close()
      const context = await (await launch()).newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
      context.setDefaultTimeout(timeout)
      // Pages of other origins are not opened, from a link or from the page's own script.
      await context.route('**/*', route => {
        const request = route.request()
        return request.isNavigationRequest() && !allowed.has(new URL(request.url()).origin) ? route.abort('blockedbyclient') : route.continue()
      })
      // Consent was given with the attempt, so the player never sets the cookies a person's consent does; the same two are set here.
      await context.addCookies([
        { name: 'ui-tests-run', value: attempt.token, url: player.origin, httpOnly: true, sameSite: 'Lax' },
        { name: 'ui-tests-active', value: '1', url: player.origin, sameSite: 'Lax' },
      ])
      const page = await context.newPage()
      const state = { context, page, ended: false }
      session = state
      page.on('response', response => {
        const request = response.request()
        if (request.method() !== 'POST' || !response.ok() || new URL(request.url()).pathname !== '/api/ui-tests/') return
        try { if ((request.postDataJSON() as { action?: string } | null)?.action === 'end') state.ended = true } catch { /* not a json body */ }
      })
      const url = new URL(player)
      url.search = new URLSearchParams({ t: attempt.token }).toString()
      await page.goto(url.toString(), { timeout })
      await page.getByRole('button', { name: 'Start task' }).click({ timeout })
      await page.waitForURL(address => !new URL(address).pathname.startsWith('/ui-tests/'), { timeout })
      await settle(page)
    },
    async call(name, input) {
      const current = session
      if (!current) return { output: '', error: `called ${name}, but no page is open` }
      const { page } = current
      const args = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
      const ref = typeof args.ref === 'string' ? args.ref.trim() : ''
      try {
        switch (name) {
          case 'look':
            return { output: await look(page) }
          case 'click':
          case 'type': {
            if (!ref) return { output: '', error: `called ${name} without a ref` }
            if (name === 'type' && typeof args.text !== 'string') return { output: '', error: 'called type without text' }
            const element = page.getByRef(ref)
            if (name === 'click') await element.click({ timeout })
            else await element.fill(args.text as string, { timeout })
            await settle(page)
            return { output: await look(page) }
          }
          case 'goto': {
            const path = typeof args.path === 'string' ? args.path : ''
            if (!path.startsWith('/') || path.startsWith('//')) return { output: '', error: `called goto ${path || '(no path)'}, but only paths on ${target.origin} starting with / can be opened` }
            const url = new URL(path, target.origin)
            if (url.origin !== target.origin) return { output: '', error: `called goto ${path}, which is not on ${target.origin}` }
            await page.goto(url.toString(), { timeout })
            await settle(page)
            return { output: await look(page) }
          }
          case 'done':
            return await end(page, ['Done', 'Yes'])
          case 'cannot':
            return await end(page, ["I couldn't do this"])
          default:
            return { output: '', error: `called ${name}, which is not a tool here` }
        }
      } catch (error) {
        const what = name === 'goto' ? `goto ${String(args.path)}` : ref ? `${name} ${ref}` : name
        const stale = name === 'click' || name === 'type'
        return { output: '', error: `called ${what}, which failed: ${message(error)}${stale ? '. Look again: the ref may belong to an earlier page' : ''}` }
      }
    },
    async endState() {
      const current = session
      // Ended through the bar: the collector stored the snapshot, and the loop reads it from there.
      if (!current || current.ended) return {}
      try { return { snapshot: await snapshotOf(current.page) } } catch { return {} }
    },
    async reset() { await close() },
    async dispose() {
      await close()
      const open = browser
      browser = undefined
      await open?.close().catch(() => {})
    },
  }
}

/** The page the agent left, as the recorder takes it at Done: scripts and the task bar left out, typed values masked, cut at a limit. */
async function snapshotOf(page: Page): Promise<Snapshot> {
  const taken = await page.evaluate(([attribute, limit]) => {
    const root = document.documentElement.cloneNode(true) as Element
    root.querySelectorAll(`script, [${attribute}]`).forEach(element => element.remove())
    root.querySelectorAll('input').forEach(field => { if (!['checkbox', 'radio', 'submit', 'button', 'reset', 'hidden', 'image'].includes((field.getAttribute('type') ?? '').toLowerCase())) field.removeAttribute('value') })
    root.querySelectorAll('textarea').forEach(area => { area.textContent = '' })
    const markup = `<!doctype html>${root.outerHTML}`
    return { url: location.href.slice(0, 2000), dom: markup.length > Number(limit) ? markup.slice(0, Number(limit)) : markup, cut: markup.length > Number(limit) }
  }, [ROOT_ATTRIBUTE, MAX_SNAPSHOT_CHARS] as const)
  return { url: taken.url, dom: taken.dom, ...(taken.cut && { truncated: true }) }
}
