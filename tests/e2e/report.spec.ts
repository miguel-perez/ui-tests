import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
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
  test(`the section "How it works.": a neutral check, its page on GitHub and the replay at ${width}px`, async ({ page }) => {
    const errors = await open(page, '/', width)
    const pr = page.locator('section[aria-labelledby="comes-back"]')
    // The artefact's words (design/artefacts/what-comes-back.html), verbatim: issue #49, item 2, the heading "How it works." and no lead.
    const { parseHTML } = await import('linkedom')
    const artefact = parseHTML(await readFile('design/artefacts/what-comes-back.html', 'utf8')).document
    expect(artefact.querySelector('title')!.textContent).toBe('How It Works')
    expect(artefact.querySelector('.head h1')!.textContent).toBe('How it works.')
    expect(artefact.querySelectorAll('.head p')).toHaveLength(0)
    await expect(pr.getByRole('heading', { level: 2 })).toHaveText(artefact.querySelector('.head h1')!.textContent!)
    await expect(pr.locator('.section-head p, [data-lead]')).toHaveCount(0)
    // Issue #62: its third piece is the replay, and the report list is off the landing (it stays at /r/k2m9).
    expect(artefact.querySelectorAll('#report, .pcard, .pstrip, .vpane, .vrow')).toHaveLength(0)
    await expect(pr.locator('[data-artefact="run-report"], .run-report, .rr-card, .rr-strip, video')).toHaveCount(0)
    await expect(page.locator('[data-artefact="run-report"]')).toHaveCount(0)
    await expect(pr.locator('.piece-intro h3')).toHaveText([...artefact.querySelectorAll('.piece .intro h2')].map(node => node.textContent!))
    await expect(pr.locator('.piece-intro p')).toHaveText([...artefact.querySelectorAll('.piece .intro p')].map(node => node.textContent!))
    await expect(pr.locator('.piece-intro h3')).toHaveText(['The check', 'Its details, on GitHub', 'The replay'])
    // On the page grid: the three pieces stack in the order a developer meets them, each across all twelve columns at 1440, 48 apart
    // with no rule between them (issue #62).
    const boxes = await pr.locator('.piece').evaluateAll(nodes => nodes.map(node => ({ rect: node.getBoundingClientRect(), style: getComputedStyle(node) })).map(({ rect, style }) => ({ x: Math.round(rect.x), y: rect.y, bottom: rect.bottom, width: Math.round(rect.width), border: style.borderTopWidth, padding: style.paddingTop })))
    expect(new Set(boxes.map(box => box.x)).size).toBe(1)
    expect(boxes.every((box, i) => i === 0 || box.y > boxes[i - 1].y)).toBe(true)
    for (const [i, box] of boxes.entries()) {
      expect([box.border, box.padding]).toEqual(['0px', '0px'])
      if (i) expect(Math.round(box.y - boxes[i - 1].bottom)).toBe(width === 1440 ? 48 : 36)
    }
    if (width === 1440) expect(boxes.map(box => [box.x, box.width])).toEqual([[96, 1248], [96, 1248], [96, 1248]])
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
    await expect(checkPage.locator('.pr-links a').first()).toHaveAttribute('href', '/r/k2m9')
    await expect(checkPage.locator('.pr-foot')).toContainText('paid panel (Prolific, CloudResearch Connect)')
    // The merge box's Details still opens the check's page, whose links open the report at /r/k2m9.
    await expect(ours.getByRole('link', { name: 'ui-tests details' })).toHaveAttribute('href', '#check-page')

    // The replay (issue #62, item 1), word for word: the moment card's still, span, who, what they did, what they said and the change.
    const drawn = artefact.querySelector('#replay')!, text = (node: Element | null) => node!.textContent!.replace(/\s+/g, ' ').trim()
    const replay = pr.locator('#the-replay'), card = replay.locator('figure.replay-moment')
    await expect(card).toHaveAttribute('aria-label', drawn.querySelector('figure.moment')!.getAttribute('aria-label')!)
    await expect(card.locator('.replay-clock')).toHaveText(text(drawn.querySelector('.clock')))
    await expect(card.locator('.replay-who')).toHaveText(text(drawn.querySelector('.who')))
    await expect(card.locator('h4')).toHaveText(text(drawn.querySelector('.moment h3')))
    await expect(card.locator('blockquote')).toHaveText(text(drawn.querySelector('blockquote')))
    await expect(card.locator('.replay-fix')).toHaveText(text(drawn.querySelector('.fix')))
    expect(text(drawn.querySelector('.fix'))).toBe('Smallest changeOn press, change the button to "Invited sam@acme.co" and disable it.')
    await expect(card.locator('.replay-clip img')).toHaveAttribute('src', '/sessions/p3-58.jpg')
    await expect(card.locator('.replay-play')).toHaveAttribute('aria-hidden', 'true')
    // The rail: a dot at each of the attempt's thirteen events at the artefact's positions, the three moments with their time and word,
    // and the two ends.
    const rail = replay.locator('.replay-rail')
    await expect(rail).toHaveAttribute('aria-label', drawn.querySelector('.rail')!.getAttribute('aria-label')!)
    const events = [...drawn.querySelectorAll('.rail .dots li')]
    expect(events).toHaveLength(13)
    expect(await rail.locator('.replay-dots li').evaluateAll(nodes => nodes.map(node => (node as HTMLElement).style.left))).toEqual(events.map(node => (node as HTMLElement).getAttribute('style')!.replace(/^left:\s*/, '').replace(/;$/, '')))
    expect(await rail.locator('.replay-dots li').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-at'))))).toEqual([0, 3, 5, 12, 19, 23, 27, 36, 41, 46, 58, 61, 63])
    expect(await rail.locator('.replay-dots li').evaluateAll(nodes => nodes.map(node => node.className))).toEqual(events.map(node => node.className.replace(/^mo /, '')))
    await expect(rail.locator('.replay-dots li span')).toHaveText(events.filter(node => node.querySelector('span')).map(node => text(node.querySelector('span'))))
    await expect(rail.locator('.replay-dots li span')).toHaveText(['00:03Slowed', '00:23Confused', '00:58Blocked'])
    await expect(rail.locator('.replay-ends > span')).toHaveText([...drawn.querySelectorAll('.rail .ends > span')].map(node => text(node)))
    // The dots: hollow 8px on the 2px line in the line colour; the moments 14px, filled in yellow, note violet and red, ringed in the canvas.
    await expect(rail.locator('.replay-line')).toHaveCSS('height', '2px')
    await expect(rail.locator('.replay-line')).toHaveCSS('background-color', 'rgb(226, 226, 226)')
    const dots = await rail.locator('.replay-dots li i').evaluateAll(nodes => nodes.map(node => { const style = getComputedStyle(node); return [style.width, style.backgroundColor, style.boxShadow.includes('rgb(246, 246, 246)')] }))
    expect(dots.filter(([size]) => size === '8px')).toHaveLength(10)
    expect(dots.filter(([size]) => size === '14px').map(([, colour, ring]) => [colour, ring])).toEqual([['rgb(139, 97, 0)', true], ['rgb(122, 65, 175)', true], ['rgb(189, 31, 68)', true]])
    // An illustration: nothing in the piece takes focus or a press.
    await expect(replay.locator('a, button, input, video, [tabindex], [role="button"]')).toHaveCount(0)
    // The intro and the card on the 5/7 split at 1440, the card in the right seven and its clip 240px; the rail across all twelve.
    const [intro, moment, clip, line] = await Promise.all([replay.locator('.piece-intro').boundingBox(), card.boundingBox(), card.locator('.replay-clip').boundingBox(), rail.boundingBox()])
    if (width === 1440) {
      expect([Math.round(moment!.x), Math.round(moment!.width)]).toEqual([630, 714])
      expect(Math.round(intro!.x)).toBe(96)
      expect(Math.round(clip!.width)).toBe(240)
      expect([Math.round(line!.x), Math.round(line!.width)]).toEqual([96, 1248])
    } else {
      expect(moment!.y).toBeGreaterThanOrEqual(intro!.y + intro!.height)
      expect([Math.round(line!.x), Math.round(line!.width)]).toEqual([16, 343])
    }
    expect(line!.y).toBeGreaterThan(moment!.y + moment!.height)
    // Issue #65, item 4: the rail's ends. Every dot, its ring included, sits inside the container, the first and the last too, and the
    // line is inset by half the largest dot; the moments' labels stay inside it and never overlap one another.
    const ends = await rail.evaluate(node => {
      const box = node.getBoundingClientRect(), track = node.querySelector('.replay-line')!.getBoundingClientRect()
      // A moment's dot carries a 4px ring outside its box.
      const dots = [...node.querySelectorAll('.replay-dots li i')].map(dot => { const r = dot.getBoundingClientRect(), ring = dot.parentElement!.className ? 4 : 0; return { left: r.left - ring, right: r.right + ring } })
      const labels = [...node.querySelectorAll('.replay-dots li span')].map(label => { const r = label.getBoundingClientRect(); return { left: r.left, right: r.right } })
      return { box: { left: box.left, right: box.right }, inset: [track.left - box.left, box.right - track.right], dots, labels }
    })
    expect(ends.inset).toEqual([11, 11])
    for (const dot of ends.dots) {
      expect(dot.left, 'a dot inside the container').toBeGreaterThanOrEqual(ends.box.left)
      expect(dot.right, 'a dot inside the container').toBeLessThanOrEqual(ends.box.right)
    }
    expect(ends.labels).toHaveLength(3)
    for (const [i, label] of ends.labels.entries()) {
      expect(label.left).toBeGreaterThanOrEqual(ends.box.left)
      expect(label.right).toBeLessThanOrEqual(ends.box.right)
      if (i) expect(label.left, 'the labels never overlap').toBeGreaterThan(ends.labels[i - 1].right)
    }
    expect(offences(await pr.innerText(), shown)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect((await new AxeBuilder({ page }).include('section[aria-labelledby="comes-back"]').analyze()).violations).toEqual([])
    expect(errors).toEqual([])
  })

  test(`the report page /r/k2m9 as the list, from the run's data: the cards, their clips and moments, and the people at ${width}px`, async ({ page }) => {
    const errors = await open(page, '/r/k2m9', width)
    const report = page.locator('.run-report')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('invite a colleague · Reached the goal: 2 of 5 · Problems found: 4, seen across all 5 people · Pressed Done, but your check failed: 2 of 5')
    await expect(report.locator('.rr-crumb')).toContainText('5 people from a paid panel (Prolific, CloudResearch Connect)')
    await expect(report.locator('.rr-legend')).toHaveText('Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect')
    // Issue #49, item 3: one card per problem, worst first by impact then count, what worked as the last card.
    const cards = report.locator('.rr-card')
    await expect(cards.locator('.rr-what > b')).toHaveText(titles)
    await expect(cards.locator('.rr-rank')).toHaveText(['1', '2', '3', '4', ''])
    await expect(cards.locator('.rr-impact')).toHaveText(['Blocked', 'Blocked', 'Slowed', 'Confused', 'Worked'])
    await expect(cards.locator('.rr-where')).toHaveText(['/settings/members · button "Add"', '/settings/members · button "Add"', '/board · menu "Share"', '/board · field "Search"', '/settings · tab "Members"'])
    await expect(cards.locator('.rr-count')).toHaveText(['2 of 5', '1 of 5', '4 of 5', '2 of 5', '5 of 5'])
    // The cards' words are design/artefacts/run-report-list.html's, verbatim: the sentence, the impact, where, x of n and the quote.
    const { parseHTML } = await import('linkedom')
    const list = [...parseHTML(await readFile('design/artefacts/run-report-list.html', 'utf8')).document.querySelectorAll('.rep .pcard')]
    const words = (selector: string) => list.flatMap(card => [...card.querySelectorAll(selector)].map(node => node.textContent!.replace(/\s+/g, ' ').trim()))
    await expect(cards.locator('.rr-what > b')).toHaveText(words('.hd > span:nth-child(3) > b'))
    await expect(cards.locator('.rr-impact')).toHaveText(words('.hd .impact'))
    await expect(cards.locator('.rr-where')).toHaveText(words('.hd .where'))
    await expect(cards.locator('.rr-quote')).toHaveText(words('.q'))
    await expect(cards.nth(2).locator('.rr-marks')).toHaveAttribute('aria-label', 'Hit by Person 1, Person 2, Person 3, Person 5')
    await expect(cards.nth(2).locator('.rr-marks i.on')).toHaveText(['1', '2', '3', '5'])
    await expect(cards.last()).toHaveAttribute('id', 'worked')
    await expect(cards.last().locator('.rr-clip, .rr-quote, .rr-chip, .rr-fix')).toHaveCount(0)
    // Each problem card: the words and who said them, the moments as play chips, the suggested change, and the clip on the right.
    const first = report.locator('#problem-1')
    await expect(first.locator('.rr-quote')).toHaveText("I wasn't sure the first Add did anything, so I pressed it again.Person 3, after the task")
    await expect(first.locator('.rr-chip')).toHaveText(['Person 3 · 00:58', 'Person 4 · 00:41'])
    await expect(first.locator('.rr-fix')).toHaveText('On press, change the button to "Invited sam@acme.co" and disable it.')
    await expect(first.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p3.webm#t=58')
    await expect(first.locator('.rr-secs')).toHaveText('00:58')
    await expect(report.locator('.rr-clip')).toHaveCount(4)
    // The viewer is gone: no sticky pane, no selected row, no "Copy as an issue".
    await expect(report.locator('.rr-pane, .rr-row, .is-sel, .rr-copy')).toHaveCount(0)
    await expect(report.getByRole('button', { name: 'Copy as an issue' })).toHaveCount(0)
    // A moment chip plays that person's clip in its card, from that second.
    const share = report.locator('#problem-3')
    await expect(share.locator('.rr-chip')).toHaveText(['Person 1 · 00:04', 'Person 2 · 00:06', 'Person 3 · 00:03', 'Person 5 · 00:09'])
    await expect(share.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p1.webm#t=4')
    await share.getByRole('button', { name: 'Person 5 · 00:09', exact: true }).click()
    await expect(share.getByRole('button', { name: 'Person 5 · 00:09', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(share.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p5.webm#t=9')
    await expect(first.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p3.webm#t=58')
    const video = share.locator('.rr-clip video')
    await share.getByRole('button', { name: /^Play Person 5 · 00:09/ }).click()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(9)
    await share.getByRole('button', { name: /^Pause Person 5 · 00:09/ }).click()
    // The people in a strip under the cards, each linking to their attempt.
    const strip = report.locator('.rr-strip a')
    await expect(strip).toHaveText([/^Person 1Reached the goal0:57 · ease 4 of 7 · Pressed Done$/, /^Person 2Did not reach it0:53 · ease 2 of 7 · Pressed I couldn't do this$/, /^Person 3Did not reach it1:03 · ease 3 of 7 · Pressed Done$/, /^Person 4Did not reach it0:47 · ease 4 of 7 · Pressed Done$/, /^Person 5Reached the goal0:52 · ease 5 of 7 · Pressed Done$/])
    for (let n = 1; n <= 5; n++) await expect(strip.nth(n - 1)).toHaveAttribute('href', `/r/k2m9/p${n}`)
    const [lastCard, firstPerson] = await Promise.all([cards.last().boundingBox(), strip.first().boundingBox()])
    expect(firstPerson!.y).toBeGreaterThan(lastCard!.y + lastCard!.height)
    // The closing line: the study-wide answers, the first look, who took part, the environment and the caveat.
    await expect(report.locator('.rr-foot')).toHaveText('After the goal: would it help them 4 of 5 · easy to use 2 of 5 · First look: named the purpose 4 of 5, first click on your path 3 of 5 · Who took part: 5 people from a paid panel (Prolific, CloudResearch Connect), screened as signed up for a planning tool this week · desktop Chromium, 1280×800 · Found automatically from what people did; it can miss problems. Watch the clips.')
    expect(offences(await report.innerText(), shown)).toEqual([])

    const [text, clip] = await Promise.all([first.locator('.rr-text').boundingBox(), first.locator('.rr-clip').boundingBox()])
    const people = await strip.evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().y)))
    if (width === 1440) {
      // The clip on the right of its card, 300px wide; the five people in one row.
      expect(clip!.x).toBeGreaterThan(text!.x + text!.width)
      expect(Math.round(clip!.width)).toBe(300)
      expect(new Set(people).size).toBe(1)
    } else {
      // On a phone the clip goes under the card's text and the strip takes two columns.
      expect(clip!.y).toBeGreaterThanOrEqual(text!.y + text!.height - 1)
      expect(new Set(people).size).toBe(3)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    expect(errors).toEqual([])
  })
}

test('the check links open the problem at the moment; each person opens their attempt; the share link is signed and white-labelled', async ({ page, context }) => {
  // The check's moment link opens its card, in view, with that person's clip from that second.
  await page.goto('/r/k2m9#problem-3&t=9')
  const card = page.locator('#problem-3')
  await expect(card.locator('.rr-clip video')).toHaveAttribute('src', '/sessions/p5.webm#t=9')
  await expect(card.getByRole('button', { name: 'Person 5 · 00:09', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(card).toBeInViewport()
  await page.goto('/r/k2m9#problem-2&t=49')
  await expect(page.locator('#problem-2 .rr-clip video')).toHaveAttribute('src', '/sessions/p2.webm#t=49')
  // Each person links to their attempt, where everything about that person lives.
  await page.locator('.rr-strip a').nth(3).click()
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
  await expect(page.locator('.rr-strip a').first()).toHaveAttribute('href', `/r/k2m9/p1?s=${sign('/r/k2m9/p1')}`)
  expect((await page.request.get(`/r/k2m9/p1?s=${sign('/r/k2m9/p1')}`)).status()).toBe(200)
  // An altered or foreign signature, and an unknown run, are not found.
  for (const route of ['/r/k2m9?s=forged', `/r/k2m9/p1?s=${sign('/r/k2m9')}`, '/r/zzzz', '/r/k2m9/p9']) expect((await page.request.get(route)).status(), route).toBe(404)
})

for (const width of [1440, 375]) test(`the attempt page /r/k2m9/p3 renders the attempt view with no empty block at ${width}px`, async ({ page }) => {
  const errors = await open(page, '/r/k2m9/p3', width)
  const view = page.locator('[data-artefact="attempt-view"]')
  await expect(view.locator('.attempt-headline')).toHaveText('Person 3 did not reach the goal.')
  // Issue #46, item 5: the guide's `.track` rule gave each clip's scrub line a 96px margin and 48px padding, an empty grey block
  // over the second moment's heading at 375. The scrub line stays a 2px line inside its own strip, under the clip.
  for (const card of await view.locator('.moment-card').all()) {
    const [scrub, track] = await Promise.all([card.locator('.moment-scrub').boundingBox(), card.locator('.moment-scrub .track').boundingBox()])
    expect(track!.height).toBe(2)
    expect(track!.y).toBeGreaterThanOrEqual(scrub!.y)
    expect(track!.y + track!.height).toBeLessThanOrEqual(scrub!.y + scrub!.height)
  }
  // Nothing grey sits over the second moment's heading.
  const heading = view.locator('#moment-2 .moment-text h3')
  await heading.scrollIntoViewIfNeeded()
  const covered = await heading.evaluate(node => {
    const r = node.getBoundingClientRect(), hits: string[] = []
    for (let y = r.top + 2; y < r.bottom; y += 6) for (let x = r.left + 2; x < r.right; x += 20) { const top = document.elementFromPoint(x, y); if (top && !node.contains(top)) hits.push(top.className) }
    return hits
  })
  expect(covered).toEqual([])
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(errors).toEqual([])
})
