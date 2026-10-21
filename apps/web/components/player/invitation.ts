/** The visitor invitation's words: one string here and in PRD 03. */
export const invitation = { title: 'This page seems to be giving you trouble.', body: 'Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you.', accept: 'Sure', decline: 'No thanks' } as const
/** The invitation's words as one sentence pair, as PRD 03 and the demo carry them. */
export const invitationText = `${invitation.title} ${invitation.body}`
