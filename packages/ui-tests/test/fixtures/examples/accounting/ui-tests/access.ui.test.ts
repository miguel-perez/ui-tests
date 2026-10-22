import { study, setup, task, outcome, expect } from 'ui-tests'

// The accounting example of docs/discovery/screener-research.md: owners and bookkeepers, sampled as two groups.
study('read-only access', {
  users: {
    did: 'paid for accounting software for your own business',
    within: '1 year',
    often: 'monthly',
    role: { 'Business owner': 3, Bookkeeper: 2 },
    uses: ['QuickBooks', 'Xero', 'FreshBooks'],
  },
  purpose: 'give someone else read-only access to my books',
  firstLook: { page: '/' },
}, () => {
  setup(async ({ request }) => {
    const books = await (await request.post('/api/test/books')).json()
    return { start: books.signInUrl, books: books.id, accountant: 'Dana', email: 'dana@acme.example' }
  })
  task('give your accountant read-only access', { path: ['/books', '/settings/people'] }, () => {
    outcome(async ({ request, setup }) => {
      const people = await (await request.get(`/api/test/books/${setup.books}/people`)).json()
      expect(people.find(p => p.email === setup.email)?.access).toBe('read-only')
    })
  })
})
