/**
 * `ui-tests host [--panel prolific|connect]` (docs/prd/01-dx-contract.md; docs/discovery/hosting-decision.md): the no-repo path, a
 * one-command deploy the author owns. The contract ships first; the deploy itself is issue #59, so until then the command prints
 * what it will do and where, and exits 2 with the caveat.
 */
export const hostIssue = 'https://github.com/miguel-perez/ui-tests/issues/59'
export const hostCaveat = `host: not shipped yet; see ${hostIssue}`
export const hostAccounts = ['prolific', 'connect'] as const
export type HostAccount = typeof hostAccounts[number]

export const hostHelp = `Usage: ui-tests host [--panel prolific|connect]

Deploys the collector, the player and the store to a free tier in your own account
(first provider: Cloudflare Workers with R2 and D1; the contract is provider-agnostic:
a container plus a bucket), then prints the collector and player URLs, the store name,
the paid panel's state, and the one line to paste on your live site.

Idempotent: run it again to update the deploy.

Options:
  --panel prolific|connect   add your own paid panel token or key to the deploy
  --help                     print this help

Not shipped yet: the deploy itself is ${hostIssue}.
Until then the command prints what it will do and exits 2.`

/** What `host` will do and where, for the given paid panel account; printed before the caveat. */
export function hostPlan(account?: HostAccount) {
  return [
    'ui-tests host will:',
    '  deploy      the collector, the player and the store to a free tier in your account (Cloudflare Workers, R2, D1)',
    '  print       the collector URL, the player URL (/t), the store name and the paid panel\'s state',
    `  paid panel  ${account ? `ask for your ${account === 'prolific' ? 'Prolific token' : 'CloudResearch Connect key'} and keep it on the deploy` : 'none yet; add one with ui-tests host --panel prolific'}`,
    '  paste       <script src="https://<your deploy>/s.js" async></script> on your live site',
  ].join('\n')
}

/** Parses `host`'s arguments: `--help`, or an optional `--panel` with one of the two paid panels. */
export function hostArgs(args: readonly string[]): { help: true } | { help: false; account?: HostAccount } {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const unknown = args.filter((arg, i) => arg !== '--panel' && args[i - 1] !== '--panel')
  if (unknown.length) throw new Error(`host takes --panel prolific|connect; unknown: ${unknown.join(' ')}`)
  if (!args.includes('--panel')) return { help: false }
  const account = args[args.indexOf('--panel') + 1]
  if (!hostAccounts.includes(account as HostAccount)) throw new Error('--panel takes one of: prolific, connect')
  return { help: false, account: account as HostAccount }
}
