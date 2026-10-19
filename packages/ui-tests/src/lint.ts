import type { AuthoredStudy } from './authoring.ts'
import type { CompiledStudy } from './schema/compiled.ts'
import type { UiTestsConfig } from './types.ts'
import { rules, type Severity } from './lint-rules.ts'

export type LintFinding = { rule: string; severity: Severity; message: string; reason: string; source: string; fix?: string; file: string; line: number }

/** Checks a study against every rule; each finding carries the rule's reason and where the advice comes from. */
export function lint(input: { study: AuthoredStudy; compiled: CompiledStudy; sourceText: string; config: UiTestsConfig; actor?: 'human' | 'agent' }): LintFinding[] {
  const findings: LintFinding[] = []
  for (const rule of rules) {
    rule.run(input, ({ message, severity, fix, line }) => findings.push({
      rule: rule.id, severity: severity ?? rule.severity, message, reason: rule.reason, source: rule.source,
      ...(fix !== undefined && { fix }), file: input.study.file, line: line ?? input.study.line,
    }))
  }
  return findings
}

/** Prints each finding as the rule, its reason, its source and the fix. */
export function formatFindings(findings: LintFinding[]): string {
  return findings.map(f => [`${f.severity}  ${f.rule}  ${f.message}`, `  why: ${f.reason}`, `  source: ${f.source}`, ...(f.fix ? [`  fix: ${f.fix}`] : [])].join('\n')).join('\n\n')
}

const minutesOf = (seconds: number) => `${Math.round(seconds / 6) / 10} min`

/** What a run would do, one line each, shown before anything is sent to people. */
export function planLines(compiled: CompiledStudy): string[] {
  const recording = compiled.record === 'video'
    ? "Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive 1.5×)"
    : 'Recording: event replay (what people do on the page)'
  return [
    `Study: ${compiled.name}`,
    `People: ${compiled.users.are}`,
    ...(compiled.purpose ? [`Purpose: ${compiled.purpose}`] : []),
    `Sample: ${compiled.sample.n} people. ${compiled.sample.sentence}`,
    ...compiled.goals.map(g => `Task ${g.index + 1}: ${g.name} (up to ${minutesOf(g.timeout.seconds)})`),
    `First look: ${compiled.impression.on ? `on, at ${compiled.impression.page}` : 'off'}`,
    recording,
  ]
}
