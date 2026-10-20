import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Screen } from '../src/player/flow.ts'
import { PlayerScreen } from '../src/player/screens.tsx'
import type { ParticipantView } from '../src/server/view.ts'
import { view } from './player-fixtures.ts'

const render = (v: ParticipantView, screen: Screen, answers: Record<string, unknown> = {}) =>
  renderToString(createElement(PlayerScreen, { view: v, screen, answers, onAnswer: () => {}, onNext: () => {}, onStart: () => {}, onWithdraw: () => {} }))
const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0

const screens = (v: ParticipantView): [string, Screen][] => [
  ['consent', { kind: 'consent' }],
  ['card', { kind: 'card' }],
  ['ease', { kind: 'ease' }],
  ['difficulty', { kind: 'difficulty' }],
  ['confidence', { kind: 'confidence' }],
  ['uxlite', { kind: 'uxlite', item: 1 }],
  ['comment', { kind: 'comment' }],
  ['thanks', { kind: 'thanks' }],
  ['withdrawn', { kind: 'withdrawn' }],
  ...(v.answer ? ([['answer', { kind: 'answer' }]] as [string, Screen][]) : []),
]

describe('consent', () => {
  const v = view()
  const html = render(v, { kind: 'consent' })

  it('shows the payout line, every purpose sentence, the recording level, the duration and a contact line', () => {
    expect(html).toContain(v.consent.payout)
    for (const line of v.consent.text) expect(html).toContain(line)
    expect(html).toContain('Your screen is not filmed')
    expect(html).toContain('about 4 minutes')
    expect(html).toContain('Questions about this study? Ask Acme.')
  })

  it('says it records video when the run does', () => {
    expect(render(view({ record: 'video' }), { kind: 'consent' })).toContain('as a video')
  })

  it('names no ui-tests anywhere unless poweredBy is on', () => {
    for (const [, screen] of screens(view({ answer: { question: 'Which plan?', choices: ['A', 'B'] } }))) {
      expect(render(view({ answer: { question: 'Which plan?', choices: ['A', 'B'] } }), screen).toLowerCase()).not.toContain('ui-tests')
    }
    expect(render(view({ brand: { poweredBy: true } }), { kind: 'consent' })).toContain('Powered by ui-tests')
  })
})

describe('card', () => {
  it('shows the filled scenario, the footer and Start task', () => {
    const html = render(view(), { kind: 'card' })
    expect(html).toContain('You owe Dana 40 dollars. Send her an invoice.')
    expect(html).toContain("When you think you&#x27;ve finished, press Done. If you get stuck, press I couldn&#x27;t do this.")
    expect(html).toContain('Start task')
  })
})

describe('questions', () => {
  it('shows the ease as seven radios with none checked', () => {
    const html = render(view(), { kind: 'ease' })
    expect(count(html, /type="radio"/g)).toBe(7)
    expect(html).not.toContain('checked')
    expect(html).toContain('Overall, how difficult or easy did you find this task?')
  })

  it('checks only what was answered', () => {
    expect(count(render(view(), { kind: 'ease' }, { 'goal0.ease': 3 }), /checked=""/g)).toBe(1)
  })

  it('shows the choices of an answer question unchecked', () => {
    const html = render(view({ answer: { question: 'Which plan was shown?', choices: ['Team', 'Solo', 'Org'] } }), { kind: 'answer' })
    expect(count(html, /type="radio"/g)).toBe(3)
    expect(html).not.toContain('checked')
  })

  it('has one h1 and labelled controls on every screen', () => {
    const v = view({ status: 'consented', answer: { question: 'Which plan was shown?', choices: ['Team', 'Solo'] }, questions: [...view().questions, { id: 'goal0.confidence', text: 'How confident are you that you finished the task?', type: 'scale', points: 7 }] })
    for (const [name, screen] of screens(v)) {
      const html = render(v, screen)
      expect(count(html, /<h1[ >]/g), name).toBe(1)
      const ids = new Set([...html.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]))
      const labelled = (html.match(/<label\b[^>]*>[^]*?<\/label>/g) ?? []).join('')
      for (const control of html.match(/<(?:textarea|input|[a-z]+ role="(?:radiogroup|group)")[^>]*>/g) ?? []) {
        const refs = /aria-labelledby="([^"]*)"/.exec(control)?.[1]?.split(' ')
        const named = refs ? refs.every((id) => id && ids.has(id)) : /aria-label="[^"]+"/.test(control) || labelled.includes(control)
        expect(named, `${name}: ${control}`).toBe(true)
      }
      for (const ref of html.matchAll(/aria-describedby="([^"]*)"/g)) expect(ids.has(ref[1]!), `${name} describedby`).toBe(true)
    }
  })
})

describe('withdrawing', () => {
  const withdraw = 'Stop and delete my recording'
  it('is offered on every screen after consent, and not before', () => {
    expect(render(view({ status: 'consented' }), { kind: 'card' })).toContain(withdraw)
    expect(render(view({ status: 'questions' }), { kind: 'ease' })).toContain(withdraw)
    expect(render(view({ status: 'finished' }), { kind: 'thanks' })).toContain(withdraw)
    expect(render(view(), { kind: 'consent' })).not.toContain(withdraw)
  })

  it('confirms with its own screen that offers no further withdrawal', () => {
    const html = render(view({ status: 'finished' }), { kind: 'withdrawn' })
    expect(html).toContain('Your recording is deleted')
    expect(html).not.toContain(withdraw)
  })
})

describe('the first look', () => {
  const v = view({ impression: { page: '/', flashMs: 500, question: 'What was that page for?', asked: false, click: true } })
  it('flashes an image served by the collector, not a frame of the page', () => {
    const html = render(v, { kind: 'impression', phase: 'flash' })
    expect(html).toContain('<img')
    expect(html).toContain('/api/ui-tests/?run=r_01&amp;shot=first-look')
    expect(html).not.toContain('<iframe')
  })
  it('asks the question with nothing about the purpose, then sends the person to the real page, with no picture to click on', () => {
    expect(render(v, { kind: 'impression', phase: 'question' })).toContain('What was that page for?')
    const click = render(v, { kind: 'impression', phase: 'click' })
    expect(click).toContain('Where would you click first?')
    expect(click).toContain('Open the page')
    expect(click).not.toContain('<img')
  })
})
