// Executed as gh/archon by status integration tests. No real API/worker mutation.
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.env.STATUS_FIXTURE;
const data = JSON.parse(readFileSync(path, 'utf8'));
const args = process.argv.slice(2), kind = process.argv[1].split('/').at(-1);
data.calls ??= []; data.calls.push([kind, ...args]);
let result;
if (kind === 'gh') {
  if (args[0] === 'repo') result = { nameWithOwner: 'owner/repo' };
  else if (args[0] === 'pr') {
    data.prReads = (data.prReads ?? 0) + 1;
    result = args[1] === 'list' ? (data.pr ? [{ number: data.pr.number, headRefName: data.pr.headRefName }] : []) :
      data.prs?.[Math.min(data.prReads - 1, data.prs.length - 1)] ?? data.pr;
  } else if (args.includes('--method')) {
    const body = args.at(-1).slice(5), endpoint = args[args.indexOf('--method') + 2];
    const id = Number(endpoint.split('/').at(-1));
    if (args.includes('PATCH')) data.comments.find(comment => comment.id === id).body = body;
    else data.comments.push({ id: 100 + data.comments.length, body, user: { login: 'owner', type: 'User' } });
    result = {};
  } else if (args.some(arg => arg.includes('issues?state=all'))) result = [data.issues ?? [{ number: 66, comments: data.comments.length }]];
  else result = [data.comments];
} else if (kind === 'git') result = data.branch ?? 'archon/task';
else if (args[1] === 'runs') result = { runs: Object.values(data.runs ?? {}) };
else result = data.runs?.[args[2]];
writeFileSync(path, JSON.stringify(data));
if (data.hang) await new Promise(resolve => setTimeout(resolve, 10000));
if (data.error) process.exit(1);
if (data.malformed) console.log('{truncated');
else if (!result) process.exit(1);
else console.log(kind === 'git' ? result : JSON.stringify(result));
