// Transport-only subprocess fixture for the real review-state CLI.
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.env.REVIEW_CLI_FIXTURE;
const data = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
data.calls.push([process.argv[1].split('/').at(-1), ...args]);
let result;
if (process.argv[1].endsWith('/git')) {
  if (args.join(' ') === 'branch --show-current') result = data.branch;
  else if (args.join(' ') === 'rev-parse HEAD') result = data.sha;
} else if (args[0] === 'api') {
  if (args[1] === 'repos/owner/repo/pulls/95') {
    result = data.prs[data.reads++];
  } else if (args.includes('graphql')) result = [{ data: { repository: { pullRequest: { reviewThreads: { nodes: data.threads } } } } }];
  else if (args.some(arg => arg.includes('/reviews?'))) result = [data.reviews];
  else if (args.some(arg => arg.includes('/check-runs?'))) result = [{ check_runs: data.checks }];
  else if (args[1]?.endsWith('/protection')) result = data.protection;
} else if (args[0] === 'variable') result = 'true';
else if (args[0] === 'pr' && args[1] === 'merge') result = '';
writeFileSync(file, JSON.stringify(data));
if (result === undefined || result?.apiFailure) {
  console.error('GitHub API unavailable or unexpected transport call');
  process.exit(1);
}
console.log(typeof result === 'string' ? result : JSON.stringify(result));
