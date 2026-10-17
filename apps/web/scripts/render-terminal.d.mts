/** Types for the terminal capture script, so tests can use its converter. */
export function ansiToHtml(frame: string): string
export function capture(props: Record<string, unknown>): Promise<{ frame: string; html: string }>
export const surfaces: Record<string, Record<string, unknown>>
export const exampleReport: { people: number; reached: number; pressedDoneFailed: number; seenBy: number; selectedRank: number; problems: { title: string; people: number }[] }
