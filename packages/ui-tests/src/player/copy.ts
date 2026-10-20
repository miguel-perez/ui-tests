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
/** Said on the task card of a study that records the screen: the browser asks when the task opens, and no is fine. */
export const SCREEN_PROMPT = 'When the task opens, your browser will ask whether to share your screen. You choose what to share, and if you say no you can still take part.'
export const contact = (who: string) => `Questions about this study? Ask ${who}.`
export const WITHDRAW = 'Stop and delete my recording'
export const WITHDRAWN_TITLE = 'Your recording is deleted'
export const WITHDRAWN_BODY = 'Nothing more is needed from you. You can close this page.'

export const PRACTICE_TITLE = 'A quick practice'
export const PRACTICE_INTRO = 'During the task a small bar stays on the page with two buttons. Try them here. Nothing you press on this screen is recorded.'
export const PRACTICE_DONE = 'Done'
export const PRACTICE_STUCK = "I couldn't do this"
export const PRACTICE_CONFIRM = 'Finished this task?'
export const PRACTICE_YES = 'Yes'
export const PRACTICE_NOT_YET = 'Not yet'
export const PRACTICE_DONE_NOTE = 'That is what Done does: it asks once, then moves on to a few questions.'
export const PRACTICE_STUCK_NOTE = "That is what I couldn't do this does: it ends the task at once, and it is always fine to press it."

/** The first look's last phase: the author's own page opens for one click. Says nothing of what the page is for. */
export const FIRST_CLICK_TITLE = 'Where would you click first?'
export const FIRST_CLICK_BODY = 'The page is opening. Click where you would start.'
export const OPEN_PAGE = 'Open the page'
/** The one line the bar shows on the page while the first click is taken. */
export const FIRST_CLICK_PROMPT = 'Click where you would start.'
