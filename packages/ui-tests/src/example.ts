/**
 * The file `npx ui-tests init` writes, with the Weekboard example filled in (design/artefacts/compile-section.html). The landing
 * section, the getting-started guide and the README show this same text, so what a visitor reads is what init creates.
 */
export const exampleFileName = 'ui-tests/invite.ui.test.ts'
export const exampleFile = `import { context, beforeEach, goal, outcome, expect } from 'ui-tests'

context({
  users: {
    are: 'people who signed up this week and want a colleague on their board',
    did: 'signed up for a tool to plan work with a team',
    within: '7 days',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  video: true,
}, () => {
  beforeEach(async () => ({ colleague: 'Sam', email: 'sam@acme.co' }))
  goal('invite a colleague', {
    happyPath: ['/board', '/settings/members'],
    catch: { affecting: '1 in 3', confidence: 0.85 },
  }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})`
/** The config `init` writes. The recording hint is a comment: nothing written records event replay; `video: true` on a context adds the screen. */
export const configFile = `import { defineConfig } from 'ui-tests'

// Every attempt records what the person does on your page: where they click, what they type (never its value), which pages they open.
// Add \`video: true\` to a context to record their screen as a video too: the browser asks them first, and the incentive is 1.5×.
// To add the paid panel (Prolific and CloudResearch Connect), set a cap per run: budget: { max: 70, currency: 'USD' } holds five people and the reserve.
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })
`
