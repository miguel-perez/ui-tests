import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHmac } from 'node:crypto'
import { shown, offences } from '../vocabulary'

/** The share secret playwright.config.ts gives the dev server; the signature is the one lib/share.ts makes. */
const sign = (path: string) => createHmac('sha256', 'e2e-share-secret').update(path).digest('base64url').slice(0, 22)
const titles = ['Pressed Add, saw nothing change, pressed it again; Sam got two invitations.', "The Add button looked switched off; Person 2 pressed I couldn't do this.", 'Looked for Invite in the Share menu and found only link options.', "Typed Sam's email into the board search.", 'Found Settings, then Members, on their own.']

async function open(page: Page, route: string, width: number) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(route)
  await page.evaluate(() => document.fonts.ready)
  return errors
}

for (const width of [1440, 375]) {
  test(`the section "In the pull request": a neutral check, its page on GitHub and the report at ${width}px`, async ({ page }) => {
    const errors = await open(page, '/', width)
    const pr = page.locator('section[aria-labelledby="pull-request"]')
    await expect(pr.getByRole('heading', { level: 2 })).toHaveText('In the pull request.')
    await expect(pr.locator('.pr-head p')).toContainText('It never fails your build.')
    await expect(pr.locator('.pr-intro h3')).toHaveText(['The check', 'Its details, on GitHub', 'The report'])
    // One column: the three pieces stack in the order a developer meets them, inside 10 of the 12 columns at 1440.
    const boxes = await pr.locator('.pr-piece').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(r => ({ x: Math.round(r.x), y: r.y, width: Math.round(r.width) })))
    expect(new Set(boxes.map(box => box.x)).size).toBe(1)
    expect(boxes.every((box, i) => i === 0 || box.y > boxes[i - 1].y)).toBe(true)
    if (width === 1440) expect(boxes[0].width).toBe(1036)
    // The check in the merge box: neutral, never green or red, beside the team's green checks.
    const ours = pr.locator('.pr-chk.ours')
    await expect(ours).toContainText('ui-tests · 4 problems found · 2 of 5 people reached the goal')
    const mark = await ours.locator('.pr-ic').evaluate(node => getComputedStyle(node).color)
    expect(mark).toBe('rgb(87, 87, 87)')
    expect(['rgb(0, 120, 82)', 'rgb(189, 31, 68)']).not.toContain(mark)
    // Its page: the title, the two sentences, the three to fix first (Share third), the moment links, the three links and the footer.
    const checkPage = pr.locator('[data-artefact="check-page"]')
    await expect(checkPage.locator('h4')).toHaveText('4 problems found · 2 of 5 people reached the goal')
    await expect(checkPage.locator('.pr-md > p').first()).toHaveText('5 people tried invite a colleague on this preview. 2 of 5 reached the goal; 2 of 5 pressed Done, but your check failed. This check never fails your build. It reports problems, or that none were seen this time.')
    await expect(checkPage.locator('thead th')).toHaveText(['#', 'Problem', 'Where', 'People', 'Impact', 'Moment'])
    await expect(checkPage.locator('tbody tr')).toHaveCount(3)
    await expect(checkPage.locator('tbody tr').nth(2)).toContainText('Share menu')
    await expect(checkPage.locator('tbody td:last-child a')).toHaveText(['Person 3 · 00:58', 'Person 2 · 00:49', 'Person 1 · 00:04'])
    await expect(checkPage.locator('tbody td:last-child a').first()).toHaveAttribute('href', '/r/k2m9#problem-1&t=58')
    await expect(checkPage.locator('.pr-legend')).toHaveText('Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect')
    await expect(checkPage.locator('.pr-links a')).toHaveText(['Open the report', '+1 more problem', 'What worked'])
    await expect(checkPage.locator('.pr-foot')).toContainText('paid panel (Prolific, CloudResearch Connect)')
    // The report's people link to their attempts; the Details link opens the check page.
    await expect(pr.locator('.rr-people a')).toHaveCount(5)
    await expect(pr.locator('.rr-people a').first()).toHaveAttribute('href', '/r/k2m9/p1')
    await expect(ours.getByRole('link', { name: 'ui-tests details' })).toHaveAttribute('href', '#check-page')
    expect(offences(await pr.innerText(), shown)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('section[aria-labelledby="pull-request"]').analyze()).violations).toEqual([])
    expect(errors).toEqual([])
  })

  test(`the report page /r/k2m9 from the run's data: selection, the pane, the copy and the people at ${width}px`, async ({ page, context }) => {
    const errors = await open(page, '/r/k2m9', width)
    const report = page.locator('.run-report')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('invite a colleague · Reached the goal: 2 of 5 · Problems found: 4, seen across all 5 people · Pressed Done, but your check failed: 2 of 5')
    await expect(report.locator('.rr-crumb')).toContainText('5 people from a paid panel (Prolific, CloudResearch Connect)')
    // The five people in one line from the recordings: reached or not, time and ease, each linking to their attempt.
    await expect(report.locator('.rr-people li')).toHaveText([/Person 1 reached · 0:57 · ease 4/, /Person 2 not reached · 0:53 · ease 2/, /Person 3 not reached · 1:03 · ease 3/, /Person 4 not reached · 0:47 · ease 4/, /Person 5 reached · 0:52 · ease 5/])
    // The list: worst first by impact then count, what worked last; the legend on first use.
    await expect(report.locator('.rr-row .rr-what > b')).toHaveText(titles)
    await expect(report.locator('.rr-row .rr-count')).toHaveText(['2 of 5', '1 of 5', '4 of 5', '2 of 5', '5 of 5'])
    await expect(report.locator('.rr-row .rr-impact')).toHaveText(['Blocked', 'Blocked', 'Slowed', 'Confused', 'Worked'])
    await expect(report.locator('.rr-row').nth(2).locator('.rr-marks')).toHaveAttribute('aria-label', 'Hit by Person 1, Person 2, Person 3, Person 5')
    await expect(report.locator('.rr-legend')).toHaveText('Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect')
    // The pane: the first problem's evidence.
    const pane = report.locator('.rr-pane')
    await expect(pane.locator('.rr-quote')).toContainText("I wasn't sure the first Add did anything, so I pressed it again.Person 3, after the task")
    await expect(pane.locator('dd code')).toHaveText(['/settings/members', "getByRole('button', { name: 'Add' })"])
    await expect(pane.locator('.rr-chip')).toHaveText(['Person 3 · 00:58', 'Person 4 · 00:41'])
    await expect(pane.locator('.rr-fix')).toHaveText('On press, change the button to "Invited sam@acme.co" and disable it.')
    await expect(pane.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p3.webm#t=58')
    await expect(pane.locator('.rr-secs')).toHaveText('00:58 → 01:04')
    // Selecting a problem swaps the evidence; a moment chip swaps the clip to that person at that second.
    await report.locator('.rr-row').nth(2).click()
    await expect(report.locator('.rr-row').nth(2)).toHaveAttribute('aria-pressed', 'true')
    await expect(pane).toHaveAttribute('aria-label', 'Evidence: Looked for Invite in the Share menu and found only link options')
    await expect(pane.locator('.rr-quote')).toContainText('Share is where you add people.')
    await expect(pane.locator('.rr-chip')).toHaveText(['Person 1 · 00:04', 'Person 2 · 00:06', 'Person 3 · 00:03', 'Person 5 · 00:09'])
    await expect(pane.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p1.webm#t=4')
    await pane.getByRole('button', { name: 'Person 5 · 00:09', exact: true }).click()
    await expect(pane.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p5.webm#t=9')
    // "Copy as an issue" puts the Markdown on the clipboard: title, where, steps from the trace, the clip link and the suggested change.
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await pane.getByRole('button', { name: 'Copy as an issue' }).click()
    await expect(pane.getByRole('status')).toHaveText('Copied')
    const markdown = await page.evaluate(() => navigator.clipboard.readText())
    expect(markdown).toMatch(/^## Looked for Invite in the Share menu and found only link options\n\n\*\*Where:\*\* `\/board` · `getByRole\('button', \{ name: 'Share' \}\)`/)
    expect(markdown).toContain("**Steps, from Person 5's trace** (Desktop · Chromium · window 1280×800):\n\n1. `00:00` Started · scenario card dismissed (/board)\n2. `00:09` Clicked Share · menu open (/board)")
    expect(markdown).toContain('**Clip:** https://ui-tests.com/r/k2m9#problem-3&t=9 (Person 5 · 00:09)')
    expect(markdown).toContain('**Suggested change:** Put "Invite a colleague" at the top of the Share menu.')
    expect(offences(markdown, shown)).toEqual([])
    // The closing line: the study-wide answers, the first look, who took part, the environment and the caveat.
    await expect(report.locator('.rr-foot')).toHaveText('After the goal: would it help them 4 of 5 · easy to use 2 of 5 · First look: named the purpose 4 of 5, first click on your path 3 of 5 · Who took part: 5 people from a paid panel (Prolific, CloudResearch Connect), screened as signed up for a planning tool this week · desktop Chromium, 1280×800 · Found automatically from what people did; it can miss problems. Watch the clips.')
    expect(offences(await report.innerText(), shown)).toEqual([])

    const [list, side] = await Promise.all([report.locator('.rr-list').boundingBox(), pane.boundingBox()])
    if (width === 1440) {
      // Side by side, 5 to 7; the pane stays put while the list scrolls: given a list longer than the screen, it holds 16px from the top.
      expect(side!.x).toBeGreaterThan(list!.x + list!.width)
      expect(list!.width / (list!.width + side!.width)).toBeCloseTo(5 / 12, 1)
      await expect(pane).toHaveCSS('position', 'sticky')
      await report.locator('.rr-list ol').evaluate(ol => { for (let i = 0; i < 4; i++) for (const row of [...ol.children].slice(0, 5)) ol.append(row.cloneNode(true)) })
      const top = await report.locator('.rr-viewer').evaluate(node => node.getBoundingClientRect().top + scrollY)
      for (const offset of [200, 900, 1600]) {
        await page.evaluate(y => scrollTo(0, y), top + offset)
        await expect.poll(() => pane.evaluate(node => Math.round(node.getBoundingClientRect().top))).toBe(16)
      }
    } else {
      // On a phone the two panes stack, the pane under the list and not sticky.
      expect(side!.y).toBeGreaterThanOrEqual(list!.y + list!.height - 1)
      await expect(pane).toHaveCSS('position', 'static')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(errors).toEqual([])
  })
}

test('the check links select the problem and the moment; each person opens their attempt; the share link is signed and white-labelled', async ({ page, context }) => {
  await page.goto('/r/k2m9#problem-2&t=49')
  const pane = page.locator('.rr-pane')
  await expect(page.locator('.rr-row').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(pane.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p2.webm#t=49')
  // Each person links to their attempt, where everything about that person lives.
  await page.locator('.rr-people a').nth(3).click()
  await expect(page).toHaveURL(/\/r\/k2m9\/p4$/)
  await expect(page.locator('.attempt-headline')).toHaveText('Person 4 did not reach the goal.')
  await expect(page.locator('.attempt-foot')).toContainText('Person 4 of 5 · paid panel (Prolific)')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  // The author's page offers the signed link; it opens the report without the site's header, and its people link to signed attempts.
  await page.goto('/r/k2m9')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Share the report link' }).click()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  expect(link).toBe(`/r/k2m9?s=${sign('/r/k2m9')}`)
  await page.goto(link)
  await expect(page.locator('.site-header, .wordmark')).toHaveCount(0)
  await expect(page.locator('.run-report')).toBeVisible()
  await expect(page.locator('.rr-people a').first()).toHaveAttribute('href', `/r/k2m9/p1?s=${sign('/r/k2m9/p1')}`)
  expect((await page.request.get(`/r/k2m9/p1?s=${sign('/r/k2m9/p1')}`)).status()).toBe(200)
  // An altered or foreign signature, and an unknown run, are not found.
  for (const route of ['/r/k2m9?s=forged', `/r/k2m9/p1?s=${sign('/r/k2m9')}`, '/r/zzzz', '/r/k2m9/p9']) expect((await page.request.get(route)).status(), route).toBe(404)
})
