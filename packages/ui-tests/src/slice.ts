/**
 * What the landing promises and this slice does not ship yet (issue #68): each command's one line, with its issue, the way `host`
 * points at #59. The landing keeps the designed contract; the guide, the README, the docs and the CLI say what runs today.
 */
export const checkIssue = 'https://github.com/miguel-perez/ui-tests/issues/69'
export const checkCaveat = `check: starting the run from CI is not shipped yet; today npx ui-tests check run.json publishes the check from a run summary you pass it. See ${checkIssue}`
export const recruitIssue = 'https://github.com/miguel-perez/ui-tests/issues/71'
export const recruitCaveat = `recruit: runs with people are not shipped yet; today it prints the plan and stops. See ${recruitIssue}`
export const agentIssue = 'https://github.com/miguel-perez/ui-tests/issues/72'
export const agentCaveat = `--actor agent: agent runs are not shipped yet; today it prints the plan and stops. See ${agentIssue}`
