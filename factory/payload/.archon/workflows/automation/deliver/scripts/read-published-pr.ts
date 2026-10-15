import { execFileSync } from 'node:child_process';

const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const localSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!branch) throw new Error('Publication requires an attached task branch.');
const prs = JSON.parse(execFileSync('gh', [
  'pr', 'list', '--head', branch, '--state', 'all', '--json',
  'number,url,headRefName,headRefOid,state,isDraft,isCrossRepository',
], { encoding: 'utf8', timeout: 30000 }));
const pr = Array.isArray(prs)
  ? prs.find((candidate: { headRefName: string; headRefOid: string }) => candidate.headRefName === branch && candidate.headRefOid === localSha)
  : undefined;
if (
  !pr || !['OPEN', 'MERGED'].includes(pr.state) || pr.isDraft || pr.isCrossRepository ||
  pr.headRefName !== branch || pr.headRefOid !== localSha
) {
  throw new Error('Publication requires a ready or already merged PR from this repository at the exact local branch commit.');
}
if (!Number.isInteger(pr.number) || pr.number < 1 || typeof pr.url !== 'string') {
  throw new Error('GitHub returned an invalid pull request identity.');
}
console.log(JSON.stringify({ number: pr.number, url: pr.url, branch }));
