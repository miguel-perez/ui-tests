import type { APIRequestContext } from 'playwright-core'

/** How often a behaviour is done, for the frequency question. */
export type Often = 'daily' | 'weekly' | 'monthly' | 'yearly'
/**
 * What screens a person: what they did (`did`, past tense, about the category and never the product) and how recently (`within`), how
 * often, their role, the tools they use and who they are not. `role` as a list is one group; as `{ role: quota }` it is one group per role.
 */
export type Criteria = { did?: string; within?: string; often?: Often; role?: string[] | Record<string, number>; uses?: string[]; not?: string[] }
/** A group sampled on its own, with its quota (3 unless written). Only for groups that differ in more than one field. */
export type Group = { name: string; quota?: number } & Criteria
/**
 * Who the study is for: a plain sentence, or the screening fields. `did` is required in the object form; `are` is derived from it unless
 * written. `insiders` and `professionals` override the default exclusions; `where`, `language` and `age` filter a panel and are never asked.
 */
export type Users = string | (Criteria & {
  are?: string
  groups?: Group[]
  insiders?: 'exclude' | 'include'
  professionals?: 'exclude' | 'include'
  where?: string | string[]
  language?: string
  age?: string | { min?: number; max?: number }
})
/** The first look: the start page toured before the task. `page` defaults to the primary task's start; `says` to the page's description. */
export type FirstLook = false | { page?: string; says?: string }
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
  firstLook?: FirstLook
  independent?: boolean
  actors?: string[]
  target?: Target
  [legacy: string]: unknown
}
/** Task options. */
export type TaskOptions = {
  path?: string[]
  timeLimit?: string
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
