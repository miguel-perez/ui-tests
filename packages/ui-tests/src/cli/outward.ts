import { loadConfig } from '../config.ts'
import { deliverResult } from '../github/check.ts'
import { restGitHub } from '../github/rest.ts'
import type { GitHubClient } from '../github/types.ts'
import type { ResultHook } from '../runner/progress.ts'
import type { UiTestsConfig } from '../types.ts'
import type { Io } from './main.ts'

/** The GitHub the command talks to: the one a test passed, else the REST API when `GITHUB_TOKEN` is set. */
export function githubFor(io: Io): GitHubClient | undefined {
  if (io.deps?.github) return io.deps.github
  const token = io.env.GITHUB_TOKEN
  return token ? restGitHub(token, io.deps?.fetch) : undefined
}

/** The hook `refreshRun` calls when a run has a result: it completes the check, updates the comment and calls the webhook. Failures are reported on stderr, never thrown. */
export function reporterFor(io: Io): ResultHook {
  let config: UiTestsConfig | undefined
  return async (run, store) => {
    // A config that cannot be read fails the delivery: nothing is recorded as told, so a later run from the right place tells it with the right block_on.
    config ??= await loadConfig(io.cwd).then(c => c.config, error => { throw new Error(`cannot tell GitHub or the webhook: ${error instanceof Error ? error.message : String(error)}`) })
    const github = githubFor(io)
    const failures = await deliverResult({
      store, run, config, ...(github && { github }), ...(io.env.UI_TESTS_SHARE_SECRET && { shareSecret: io.env.UI_TESTS_SHARE_SECRET }),
      ...(io.deps?.webhookBackoffMs !== undefined && { webhook: { backoffMs: io.deps.webhookBackoffMs } }),
    })
    for (const failure of failures) io.stderr.write(`${run.run}: ${failure}\n`)
  }
}
