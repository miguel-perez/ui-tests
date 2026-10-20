export const NEED_BANDS = ['In the past week', 'In the past month', 'Earlier this year', "I haven't"] as const
export const MATTERS = ['Not at all', 'A little', 'Quite a bit', 'A great deal'] as const
export const FIT_IDS = { need: 'screener.need', today: 'screener.today', matters: 'screener.matters' } as const

export type Fit = { recency: 0 | 1 | 2 | 3; solving: 0 | 1; importance: 0 | 1 | 2 | 3; total: number }

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const nothing = /^(nothing|none|n\/a|no|i don'?t|i do not|not really)\b/i

/**
 * How well a person fits the purpose, from the three fit questions: how recently they needed it (week 3, month 2, earlier this year 1,
 * never 0), whether they already do something about it (an answer that says what, 1), and how much it matters (0 to 3). `answers` is
 * keyed by question id.
 */
export function fitScore(answers: Record<string, unknown>): Fit {
  const recency = (3 - NEED_BANDS.indexOf(text(answers[FIT_IDS.need]) as (typeof NEED_BANDS)[number])) as number
  const solving = text(answers[FIT_IDS.today]) && !nothing.test(text(answers[FIT_IDS.today])) ? 1 : 0
  const importance = Math.max(0, MATTERS.indexOf(text(answers[FIT_IDS.matters]) as (typeof MATTERS)[number]))
  const r = (recency > 3 ? 0 : recency) as Fit['recency']
  const i = importance as Fit['importance']
  return { recency: r, solving, importance: i, total: r + solving + i }
}
