import { expect, outcome, participant, setup, study, task } from 'ui-tests'

study('verify fixture', { users: 'People who verify' }, () => {
  setup(async () => ({ start: '/', code: 'abc' }))
  task('Reach docs', { path: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
  })
  task('Use the request', () => {
    outcome(async ({ request }) => { expect((request as unknown as { baseURL: string }).baseURL).toBe('http://target.test') })
  })
  task('Use the setup', () => {
    outcome(async ({ setup }) => { expect(setup.code).toBe('abc') })
  })
  task('Find the banner', () => {
    outcome(async ({ page }) => { expect(page.textContent('#missing')).toBe('Hello') })
  })
  task('Two steps', () => {
    task('Open the menu', async ({ page }) => { expect(page.url()).toContain('/menu') })
    outcome(async ({ page }) => { expect(page.url()).toContain('/done') })
  })
  task('Name the plan', () => {
    participant.answer('Which plan was shown?', { expected: 'Team', distractors: ['Solo', 'Org'] })
  })
  task('Look around', { minutes: 2 }, () => {})
})
