const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The scenario card text: who the person is, why, and the goal. Never the path or the outcome. Setup values
 * (everything but `start`) become details to use, in key order.
 */
export function scenarioTemplate(input: { are: string; purpose: string; goal: string; values: Record<string, unknown> }): string {
  const goal = capitalise(input.goal.trim().replace(/[.!]+$/, ''))
  const lead = input.purpose.trim() ? `As one of the ${input.are}, you want to ${input.purpose.trim().replace(/[.!]+$/, '')}.` : `You are one of the ${input.are}.`
  const details = Object.entries(input.values).filter(([key]) => key !== 'start').map(([key, value]) => `${key} ${String(value)}`)
  return `${lead} ${goal}.${details.length ? ` Use these details: ${details.join(', ')}.` : ''}`
}

/** Fills `{key}` placeholders in scenario text with setup values; unknown keys are left as written. */
export function fillScenario(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => key in values ? String(values[key]) : whole)
}
