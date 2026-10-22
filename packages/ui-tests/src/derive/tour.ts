/** The home page tour's one open prompt, after an untimed look at the live start page (Krug). */
export const TOUR_PROMPT = "What do you make of that page? Say what it is, whose it is, what you can do there, and what it's for."
/** The four parts an answer is coded on, each against what the page says: what it is, who it is from, an action, its purpose. */
export const TOUR_PARTS = ['what', 'who', 'action', 'purpose'] as const
export type TourPart = (typeof TOUR_PARTS)[number]
export const PART_LABELS: Record<TourPart, string> = { what: 'identified it', who: 'identified who it is from', action: 'named an action', purpose: 'named its purpose' }
