import type { CompiledStudy } from './schema/compiled.ts'
import { recordingMultiplier } from './derive/incentive.ts'
import { rules, type RuleContext, type Severity } from './lint-rules.ts'

export type LintFinding = { rule: string; severity: Severity; message: string; reason: string; source: string; fix?: string; file: string; line: number }

/** Checks a study against every rule; each finding carries the rule's reason and where the advice comes from. */
export function lint(input: RuleContext): LintFinding[] {
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
    ? `Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive ${recordingMultiplier('video')}×)`
    : 'Recording: event replay (what people do on the page)'
  return [
    `Study: ${compiled.name}`,
    `People: ${compiled.users.are}`,
    ...(compiled.purpose ? [`Purpose: ${compiled.purpose}`] : []),
    `Sample: ${compiled.sample.n} people. ${compiled.sample.sentence}`,
    ...(compiled.groups.length > 1 ? [`Groups: ${compiled.groups.map(g => `${g.name} ${g.quota}`).join(', ')}, each reported on its own`] : []),
    ...compiled.goals.map(g => `Task ${g.index + 1}: ${g.name} (up to ${minutesOf(g.timeout.seconds)})`),
    // Each task question with its choices in the order shown, so the author reviews the distractors beside the right answer.
    ...compiled.goals.flatMap(g => g.answer ? [`Task ${g.index + 1} asks ${JSON.stringify(g.answer.question)}: ${g.answer.choices.map(c => c === g.answer!.expected ? `${c} (expected)` : c).join(', ')}${g.answer.choices.length < 2 ? '; no distractors yet, ui-tests lint -u drafts them' : ''}`] : []),
    ...(compiled.actors.includes('human') ? [`Screener: ${compiled.screener.length} ${compiled.screener.length === 1 ? 'screen' : 'screens'} before consent${compiled.draft ? ' (draft: the snapshot is missing or out of date; ui-tests lint -u drafts it)' : ''}`] : []),
    `First look: ${compiled.impression.on ? `a tour of ${compiled.impression.page}, coded against ${compiled.impression.says === null ? 'what the page says (not read yet)' : `"${compiled.impression.says}" (${compiled.impression.source})`}` : 'off'}`,
    recording,
  ]
}
