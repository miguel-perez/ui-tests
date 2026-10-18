/**
 * The file `npx ui-tests init` writes, with the Weekboard example filled in (design/artefacts/compile-section.html). The landing
 * section, the getting-started guide and the README show this same text, so what a visitor reads is what init creates.
 */
export const exampleFileName = 'ui-tests/invite.ui.test.ts'
export const exampleFile = `import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', {
  users: {
    are: 'people who plan work with a team in a shared tool',
    did: 'used a shared tool to plan work with a team',
    within: '3 months',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['has used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
    firstLook: { page: '/' },
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(\`/api/test/boards/\${setup.board}/invitations\`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})`
/** The config `init` writes. The recording hint is a comment: nothing written records event replay; `record: 'video'` on a study adds the screen. */
export const configFile = `import { defineConfig } from 'ui-tests'

// Every attempt records what the person does on your page: where they click, what they type (never its value), which pages they open.
// Add \`record: 'video'\` to a study to record their screen as a video too: the browser asks them first, and the incentive is 1.5×.
// To add the paid panel (Prolific and CloudResearch Connect), set a cap per run: budget: { max: 70, currency: 'USD' } holds five people and the reserve.
// In CI, \`npx ui-tests check\` puts a neutral check on the pull request. check: { block_on: 'problems' } makes it fail when problems are found; check: { comment: false } turns off its one comment.
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })
`
