export { CARD_FOOTER, START_TASK } from '../copy.ts'

/** The words the player adds around the study's own questions. */
export const AGREE = 'I agree and continue'
export const CONTINUE = 'Continue'
export const SUBMIT = 'Submit'
export const CONSENT_TITLE = 'Before you start'
export const CARD_TITLE = 'Your task'
export const THANKS_TITLE = 'Thank you'
export const THANKS_BODY = 'That is everything. You can close this page.'
export const SCREENER_TITLE = 'A few questions about you first'
export const EASE_ENDS = { low: 'Very difficult', high: 'Very easy' } as const
export const USEFUL_ENDS = { low: 'Not at all useful', high: 'Very useful' } as const
export const AGREEMENT_ENDS = { low: 'Strongly disagree', high: 'Strongly agree' } as const
export const CONFIDENCE_ENDS = { low: 'Not at all confident', high: 'Completely confident' } as const
export const TEXT_LABEL = 'Your answer'
export const POWERED_BY = 'Powered by ui-tests'

/** "about 5 minutes" for the consent screen. */
export const duration = (minutes: number) => `This takes about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`
export const RECORDING = {
  events: 'What you do on the page is recorded: clicks, scrolling and typing. Your screen is not filmed.',
  video: 'What you do on the page is recorded, and so is your screen, as a video.',
} as const
export const contact = (who: string) => `Questions about this study? Ask ${who}.`
export const WITHDRAW = 'Stop and delete my recording'
export const WITHDRAWN_TITLE = 'Your recording is deleted'
export const WITHDRAWN_BODY = 'Nothing more is needed from you. You can close this page.'
