/**
 * The study file the landing shows, with the Weekboard example filled in: what
 * `npx ui-tests init` would write, per docs/prd/01-dx-contract.md.
 */
export const exampleFileName = 'ui-tests/invite.ui.test.ts'
export const exampleFile = `import { study, setup, task, outcome, expect } from 'ui-tests'

study('invite flow', {
  users: {
    are: 'people who plan work with a team in a shared tool',
    did: 'used a shared tool to plan work with a team',
    within: '3 months',
    uses: ['Trello', 'Asana', 'Notion', 'Linear'],
    not: ['I have used Weekboard'],
  },
  purpose: 'plan the week together without emailing screenshots around',
  sample: { affecting: 1 / 3, confidence: 0.85 }, // five people
  record: 'video',
  firstLook: { page: '/' }, // the start comes from setup, behind a sign-in: tour the public home page
}, () => {
  // Each attempt gets its own signed-in board. A .example address is never delivered.
  setup(async ({ request }) => {
    const board = await (await request.post('/api/test/boards', { data: { cards: 'sample-week' } })).json()
    return { start: board.signInUrl, board: board.id, colleague: 'Sam', email: 'sam@acme.example' }
  })
  task('invite a colleague', {
    path: ['/board', '/settings/members'],
    timeLimit: '3 min',
  }, () => {
    outcome(async ({ request, setup }) => {
      const invitations = await (await request.get(\`/api/test/boards/\${setup.board}/invitations\`)).json()
      expect(invitations.map(i => i.email)).toContain(setup.email)
    })
  })
})`
