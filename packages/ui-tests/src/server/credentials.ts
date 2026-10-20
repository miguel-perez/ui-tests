/** How long a handoff code may wait to be redeemed. */
export const HANDOFF_TTL_MS = 60_000

/** How long an attempt key lasts: the longest an attempt may take. */
export const ATTEMPT_KEY_TTL_MS = 7_200_000

/** The query parameter that carries a handoff code to the app. */
export const HANDOFF_PARAM = 'ui-tests'
