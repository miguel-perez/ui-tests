import type { Clause, RunRecord } from './schema.ts'

/** What every record says about itself. */
export const EVIDENCE_STATEMENT =
  'This record is evidence for a claim the author makes about the clauses below; it is not a certificate, and it does not show more than it lists.'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * What the record shows for the ISO 9241-210 clauses that need people: 5.3, 5.4, 7.2, 7.3 and 7.5.4. Clause 7.5.6 (long-term
 * monitoring) is on the hosted track only and is not listed. Every line is read from the record itself.
 */
export function clauseEvidence(record: Omit<RunRecord, 'evidence' | 'evidenceStatement'>): Clause[] {
  const { compiled, attempts, measures, fit, issues, revisions, handle } = record
  const real = attempts.filter(a => !a.rehearsal)
  const consented = real.filter(a => a.purposes.length > 0)
  const withEnvironment = real.filter(a => Object.keys(a.environment).length > 0)
  const goalsWithCriteria = compiled.goals.filter(g => g.hasOutcome || g.answer)
  const byGoal = Object.values(measures.byGoal)
  const reached = byGoal.reduce((sum, g) => sum + g.effectiveness.reached, 0)
  const counted = byGoal.reduce((sum, g) => sum + g.effectiveness.n, 0)
  const timed = byGoal.filter(g => g.efficiency.medianAllMs !== undefined).length
  const rated = byGoal.filter(g => g.satisfaction.ease.length > 0).length
  return [
    {
      clause: '5.3', title: 'User involvement',
      shows: `${plural(fit.screened, 'person', 'people')} answered the screener and ${fit.matched} matched the stated users (${compiled.users.are}); ${plural(consented.length, 'attempt')} carry the purposes the person agreed to. ${fit.summary}`,
    },
    {
      clause: '5.4', title: 'User-centred evaluation drives and refines the design',
      shows: `This run is against build ${handle.build.commit || 'unknown'} and lists ${plural(issues.length, 'issue')} and ${plural(revisions.length, 'revision')}. Runs against successive builds are separate records; this one does not compare them.`,
    },
    {
      clause: '7.2', title: 'Context of use specified',
      shows: `Users: ${compiled.users.are}. Purpose: ${compiled.purpose}. Environment: ${compiled.environment}. Device, browser and assistive technology were recorded for ${withEnvironment.length} of ${real.length} attempts.`,
    },
    {
      clause: '7.3', title: 'User requirements',
      shows: `${goalsWithCriteria.length} of ${plural(compiled.goals.length, 'goal')} have a verified outcome as a measurable criterion: ${compiled.goals.map(g => g.name).join('; ') || 'none'}.`,
    },
    {
      clause: '7.5.4', title: 'User-based testing',
      shows: `${plural(real.length, 'attempt')} by people performing the goals themselves. Effectiveness: ${reached} of ${counted} counted attempts reached the verified outcome. Efficiency: time on goal for ${timed} of ${plural(compiled.goals.length, 'goal')}. Satisfaction: ease rated on ${rated} of ${plural(compiled.goals.length, 'goal')}.`,
    },
  ]
}
