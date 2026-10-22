import { expect, outcome, study, task } from 'ui-tests'

study('screener fixture', {
  users: { are: 'people who plan work with a team', did: 'used a shared tool to plan work', within: '3 months', uses: ['Trello', 'Asana'], not: ['I have used Weekboard'] },
  purpose: 'plan the week together',
  firstLook: false,
}, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
