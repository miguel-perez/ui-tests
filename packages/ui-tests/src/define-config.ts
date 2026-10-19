import type { UiTestsConfig } from './types.ts'

export type { UiTestsConfig, AgentConfig } from './types.ts'
/** Identity helper that types `ui-tests.config.ts`. */
export function defineConfig<T extends UiTestsConfig>(config: T): T { return config }
