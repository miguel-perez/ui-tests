import { rules } from '../lint-rules.ts'

/** The lint rules as the skill lists them, one line each with the reason; a test holds SKILL.md to this text (`npm --prefix packages/ui-tests run skill` rewrites it). */
export function skillRules(): string {
  return rules.map(r => `- \`${r.id}\` (${r.severity}): ${r.reason} Source: ${r.source}.`).join('\n')
}
