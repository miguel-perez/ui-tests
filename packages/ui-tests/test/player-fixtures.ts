import type { ParticipantView } from '../src/server/view.ts'

/** A view as the collector would send it for the first goal of a one-goal study with an outcome. */
export function view(overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    run: 'r_01',
    attempt: 'a_01',
    author: 'Acme',
    product: 'Acme Invoices',
    brand: { poweredBy: false },
    consent: {
      text: ['Acme will watch your recording to learn where Acme Invoices is hard to use.', 'A model may read the trace of your attempt to help find those places.', 'Your recording is kept for 90 days. If you withdraw, it is deleted.', 'You can stop at any time and still be paid $7.50.'],
      purposes: ['analysis by the author', 'model-assisted analysis of the trace'],
      payout: 'You can stop at any time and still be paid $7.50.',
    },
    screener: [],
    practice: false,
    minutes: 4,
    goal: { index: 0, name: 'Send an invoice', scenario: 'You owe Dana 40 dollars. Send her an invoice.', start: '/invoices', steps: [], timeoutSeconds: 180 },
    sequence: { position: 0, of: 1 },
    hasVerification: true,
    questions: [
      { id: 'goal0.ease', text: 'Overall, how difficult or easy did you find this task?', type: 'scale', points: 7 },
      { id: 'goal0.difficulty', text: 'What made it difficult?', type: 'open', askIf: { id: 'goal0.ease', atOrBelow: 4 } },
      { id: 'useful', text: 'Would Acme Invoices be useful to you?', type: 'scale', points: 7 },
      { id: 'easy', text: 'Acme Invoices is easy to use.', type: 'scale', points: 7 },
      { id: 'anything', text: 'Anything you want to tell Acme Invoices?', type: 'open' },
    ],
    status: 'created',
    record: 'events',
    rehearsal: false,
    ...overrides,
  }
}
