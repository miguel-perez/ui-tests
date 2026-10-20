import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { serveTrace } from '../../packages/ui-tests/src/trace/serve.ts'
import { videoChunks } from '../../packages/ui-tests/src/video.ts'
import { PRODUCT_URL, createRehearsalRun } from './helpers'

/**
 * Screen recording opt-in (Task 33). The browser's own screen picker cannot be driven here, so `getDisplayMedia` is stubbed with a
 * canvas stream; everything after it (MediaRecorder, the chunks, the collector, the store, the trace) is real.
 */

const video = join(import.meta.dirname, 'fixtures', 'video.ui.test.ts')
const plain = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')

async function stubScreen(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 320
      canvas.height = 180
      const context = canvas.getContext('2d')!
      let n = 0
      setInterval(() => { context.fillStyle = n++ % 2 ? '#223355' : '#ccd0e0'; context.fillRect(0, 0, 320, 180) }, 100)
      return canvas.captureStream(10)
    }
  })
}

async function begin(page: Page, playerUrl: string) {
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
}

test('a study that records the screen says so, asks first, shows a red dot with the time and a pause, stores chunks, and the trace shows a clip', async ({ page }) => {
  test.setTimeout(120_000)
  await stubScreen(page)
  const { runId, playerUrl } = await createRehearsalRun(video)
  await page.goto(playerUrl)
  await expect(page.getByText('and so is your screen, as a video')).toBeVisible()
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByText('your browser will ask whether to share your screen')).toBeVisible()
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()

  // Nothing is recorded until the person says yes.
  await expect(page.getByRole('group', { name: 'Share your screen' })).toBeVisible()
  await expect(bar.getByRole('status', { name: /Recording your screen/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Share my screen' }).click()
  const dot = bar.getByRole('status', { name: /Recording your screen, \d+:\d\d/ })
  await expect(dot).toBeVisible()
  await expect(page.getByRole('group', { name: 'Share your screen' })).toHaveCount(0)
  await bar.getByRole('button', { name: 'Pause recording' }).click()
  await expect(bar.getByRole('status', { name: /paused/ })).toBeVisible()
  await bar.getByRole('button', { name: 'Resume recording' }).click()
  await expect(dot).toBeVisible()

  // A moment worth watching, while the screen is shared.
  await page.evaluate(() => {
    const inert = document.createElement('div')
    inert.id = 'inert'
    inert.style.padding = '20px'
    inert.textContent = 'Nothing happens here'
    document.body.prepend(inert)
  })
  await page.waitForTimeout(1500)
  await page.locator('#inert').click()
  // Long enough for a whole chunk to go out on its own.
  await page.waitForTimeout(6500)

  const store = await openStore()
  try {
    const attemptId = (await store.listAttempts(runId))[0]!.id
    await expect.poll(async () => videoChunks((await store.getAttempt(attemptId))!.answers).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(1)
    const ended = page.waitForResponse((r) => r.url() === `${PRODUCT_URL}/api/ui-tests/` && r.request().postDataJSON()?.action === 'end')
    await bar.getByRole('button', { name: 'Done' }).click()
    await bar.getByRole('button', { name: 'Yes' }).click()
    expect((await ended).status()).toBe(200)
    await page.waitForURL(`${PRODUCT_URL}/ui-tests/${runId}/?after=1`)

    const chunks = videoChunks((await store.getAttempt(attemptId))!.answers)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const chunk of chunks) expect((await store.getBlob(chunk.blob))!.bytes.length).toBeGreaterThan(0)
    expect((await store.getAttempt(attemptId))!.flags).not.toContain('video-declined')

    const trace = await serveTrace({ store, port: 0 })
    try {
      await page.goto(`${trace.url}/runs/${runId}/`, { waitUntil: 'domcontentloaded' })
      const clip = page.locator('video[data-clip="1"]')
      await expect(clip).toHaveCount(1)
      expect(await clip.getAttribute('src')).toMatch(/\/runs\/.+\/video\/1\?s=\d+#t=\d+(\.\d)?/)
      const bytes = await page.evaluate(async (src) => {
        const response = await fetch(src.split('#')[0]!)
        return { status: response.status, type: response.headers.get('content-type'), size: (await response.arrayBuffer()).byteLength }
      }, (await clip.getAttribute('src'))!)
      expect(bytes).toMatchObject({ status: 200, type: expect.stringContaining('video/') })
      expect(bytes.size).toBeGreaterThan(1000)
    } finally {
      await trace.close()
    }
  } finally {
    await store.close()
  }
})

test('saying no keeps the attempt, marks it, and records nothing', async ({ page }) => {
  test.setTimeout(60_000)
  await stubScreen(page)
  const { runId, playerUrl } = await createRehearsalRun(video)
  await begin(page, playerUrl)
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await page.getByRole('button', { name: 'No thanks' }).click()
  await expect(page.getByRole('group', { name: 'Share your screen' })).toHaveCount(0)
  await expect(bar.getByRole('status', { name: /Recording your screen/ })).toHaveCount(0)
  const ended = page.waitForResponse((r) => r.url() === `${PRODUCT_URL}/api/ui-tests/` && r.request().postDataJSON()?.action === 'end')
  await bar.getByRole('button', { name: 'Done' }).click()
  await bar.getByRole('button', { name: 'Yes' }).click()
  expect((await ended).status()).toBe(200)
  const store = await openStore()
  try {
    const attempt = (await store.listAttempts(runId))[0]!
    expect(attempt.flags).toContain('video-declined')
    expect(attempt.reason).toBe('done')
    expect(videoChunks(attempt.answers)).toEqual([])
  } finally {
    await store.close()
  }
})

test('a study without record asks for nothing and shows no dot', async ({ page }) => {
  test.setTimeout(60_000)
  let asked = 0
  await page.addInitScript(() => { navigator.mediaDevices.getDisplayMedia = async () => { (window as unknown as { __asked: number }).__asked = 1; throw new Error('not asked for') } })
  const { playerUrl } = await createRehearsalRun(plain)
  await begin(page, playerUrl)
  await expect(page.getByText('your browser will ask whether to share your screen')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()
  await expect(page.getByRole('group', { name: 'Share your screen' })).toHaveCount(0)
  await expect(bar.getByRole('status', { name: /Recording your screen/ })).toHaveCount(0)
  await expect(bar.getByRole('button', { name: /recording/i })).toHaveCount(0)
  asked = await page.evaluate(() => (window as unknown as { __asked?: number }).__asked ?? 0)
  expect(asked).toBe(0)
})
