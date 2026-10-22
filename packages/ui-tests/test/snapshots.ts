import { main, type Io } from '../src/cli/main.ts'
import type { TextModel } from '../src/model.ts'

/** A model that drafts plain decoys and says a behaviour is not repeated, so a test study's snapshot can be made without a key. */
export const stubModel: TextModel = { complete: async (prompt) => (/yes or no/.test(prompt) ? 'no' : '["Decoy one", "Decoy two"]') }
/** A start page that says what it is for, for the first look's `says`. */
export const stubPage = (async () => new Response('<html lang="en"><head><meta name="description" content="A page for tests."></head></html>')) as unknown as typeof fetch

/**
 * Drafts the screener snapshot of every study under `cwd` as `ui-tests lint -u` does, with the stub model and page, so a test can
 * recruit people for it: recruit and check refuse a study whose snapshot is missing or out of date.
 */
export async function draftSnapshots(cwd: string): Promise<number> {
  const io: Io = { stdout: { write: () => true }, stderr: { write: () => true }, cwd, env: {}, deps: { model: stubModel, fetch: stubPage } }
  return main(['lint', '-u'], io)
}
