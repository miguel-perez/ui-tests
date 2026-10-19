import type { CompiledConsent } from '../schema/compiled.ts'

export type Purpose = 'analysis by the author' | 'model-assisted analysis of the trace' | 'sharing the record with an automated workflow'

/** "You can stop at any time and still be paid $7.50." or the unpaid line. `minor` is in integer minor units. */
export function payoutLine(amount?: { minor: number; currency: string }): string {
  if (!amount) return 'You can stop at any time. This is unpaid.'
  const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: amount.currency })
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2
  return `You can stop at any time and still be paid ${format.format(amount.minor / 10 ** digits)}.`
}

/** What the participant is asked to agree to: the purposes in order, their sentences, retention and the payout line. */
export function consentText(study: { product: string; author: string }, options: { workflows: boolean; amount?: { minor: number; currency: string } }): CompiledConsent {
  const purposes: Purpose[] = ['analysis by the author', 'model-assisted analysis of the trace']
  if (options.workflows) purposes.push('sharing the record with an automated workflow')
  const who = study.author || `the team behind ${study.product}`
  const sentence: Record<Purpose, string> = {
    'analysis by the author': `${who} will watch your recording and read what you say to learn where ${study.product} is hard to use.`,
    'model-assisted analysis of the trace': 'A model may read the trace of your attempt to help find those places.',
    'sharing the record with an automated workflow': 'The record of your attempt may be passed to an automated workflow that files what was found.',
  }
  const retentionDays = 90
  const payout = payoutLine(options.amount)
  return {
    workflows: options.workflows,
    retentionDays,
    purposes,
    text: [...purposes.map(p => sentence[p]), `Your recording is kept for ${retentionDays} days. If you withdraw, it is deleted.`, payout],
    payout,
  }
}
