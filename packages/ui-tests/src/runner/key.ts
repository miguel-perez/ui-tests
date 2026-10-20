import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/** The key a repeated `recruit` for the same build, study and actor shares: `${commit}:${contextId}:${actor}`, or `pr-${pr}:…` for a pull request. */
export function idempotencyKey(input: { commit?: string; pr?: number; contextId: string; actor: 'human' | 'agent' }): string {
  const build = input.pr !== undefined ? `pr-${input.pr}` : input.commit ?? 'local'
  return `${build}:${input.contextId}:${input.actor}`
}

/** The commit checked out in `cwd`; `local` outside a git repository, so a key can always be made. */
export async function gitCommit(cwd: string): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd })
    return stdout.trim() || 'local'
  } catch { return 'local' }
}
