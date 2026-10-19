import type { UiTestsConfig } from './types.ts'

export { study, setup, task, outcome, participant, resetStudies, getStudies } from './authoring.ts'
export type { AuthoredStudy, AuthoredTask } from './authoring.ts'
export { expect, AssertionFailure, MissingEvidence } from './expect.ts'
export type * from './types.ts'
/** Identity helper that types `ui-tests.config.ts`. */
export function defineConfig<T extends UiTestsConfig>(config: T): T { return config }
