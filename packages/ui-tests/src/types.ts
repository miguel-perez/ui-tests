import type { APIRequestContext } from 'playwright-core'

/** Who the study is for: a plain description, or the screening fields (`are` is required). */
export type Users = string | { are: string; did?: string; within?: string; often?: string; role?: string | string[]; uses?: string[]; not?: string[]; where?: string | string[]; language?: string; age?: string | { min?: number; max?: number } }
/** Where the product under test runs. `description` is what an agent is told about it, such as an API's description. */
export type Target = { url?: string; cli?: string; mcp?: string; http?: string; description?: string }
/** What a hook can read of the stored end state of an attempt. */
export type SnapshotPage = { url(): string; textContent(selector: string): string | null; query(selector: string): Element | null; state(): unknown }
/**
 * The files an agent attempt left behind. `file(glob)` is the text of the first matching file; `null` when the workspace
 * was read and nothing matches (a failed `toExist`), `undefined` when there is no workspace to read (missing evidence).
 */
export type Workspace = { file(glob: string): string | null | undefined; root: string }
/** Runs in the runner once per invite slot; `start` is where the participant lands. */
export type SetupFn = (args: { request: APIRequestContext }) => Promise<{ start?: string } & Record<string, unknown>>
/** The arguments an outcome or step check receives. */
export type HookArgs = { request: APIRequestContext; setup: Record<string, unknown>; page: SnapshotPage; workspace: Workspace }
/** An outcome or step check executed by the runner against stored evidence, never in the app. */
export type Hook = (args: HookArgs) => void | Promise<void>
/** Study options. */
export type StudyOptions = {
  users: Users
  purpose?: string
  environment?: string
  sample?: { affecting: number; confidence: number }
  record?: 'video'
  firstLook?: false | { page: string }
  independent?: boolean
  actors?: string[]
  target?: Target
  [legacy: string]: unknown
}
/** Task options. */
export type TaskOptions = {
  path?: string[]
  timeLimit?: string
  firstLook?: false | { page: string }
  start?: string
  minutes?: number
  primary?: boolean
  scenario?: string
  trials?: number
  reliability?: 'all' | 'any'
  target?: Target
  [legacy: string]: unknown
}
export type { AgentConfig } from './agents/config.ts'
import type { AgentConfig } from './agents/config.ts'
/** The shape of `ui-tests.config.ts`; every key is optional. */
export type UiTestsConfig = {
  target?: Target
  /** The ui-tests server: the collector, the player and the tag's script. Rehearsal starts one here when it is on this machine and none answers. */
  server?: { url?: string }
  participants?: { sources?: ('link' | 'prolific' | 'connect')[]; budget?: { max: number; currency: string }; link?: { amount?: number } }
  check?: { block_on?: 'problems'; comment?: boolean }
  ci?: { on?: string[] }
  reporters?: ('default' | 'github-actions' | 'json')[]
  actor?: 'human' | 'agent'
  agents?: AgentConfig
  product?: string
  author?: string
  /** What participants see instead of ours: the name, logo, colours and font of the author. The name defaults to `author`, then `product`. */
  brand?: { name?: string; logo?: string; accent?: string; background?: string; text?: string; font?: { family: string; url?: string } }
  webhook?: { url: string; secret?: string }
  consent?: { workflows?: boolean }
}
