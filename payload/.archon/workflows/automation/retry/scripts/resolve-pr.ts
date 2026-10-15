import { execFileSync } from 'node:child_process';

const number = process.env.INPUTS_PR ?? '';
if (!/^[1-9][0-9]*$/.test(number)) throw new Error('Supply --input pr=<number>.');
const pr = JSON.parse(execFileSync('gh', [
  'pr', 'view', number, '--json', 'number,url,headRefName,headRefOid,state,isDraft,isCrossRepository',
], { encoding: 'utf8', timeout: 30000 }));
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (!['OPEN', 'MERGED'].includes(pr.state) || pr.isDraft || pr.isCrossRepository || pr.headRefName !== branch) {
  throw new Error('Retry requires a ready or merged PR from this repository on its exact branch.');
}
const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (localHead !== pr.headRefOid) {
  // A fresh Archon retry worktree starts from main. Bring its clean branch to
  // the verified PR revision, including after GitHub deletes a merged branch.
  const changes = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (changes) throw new Error('Retry cannot update a worktree with uncommitted changes.');
  execFileSync('git', ['fetch', 'origin', `refs/pull/${number}/head`], { encoding: 'utf8', timeout: 60000 });
  const fetchedHead = execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim();
  if (fetchedHead !== pr.headRefOid) throw new Error('The PR revision changed while preparing the retry.');
  // Fast-forward a stale PR branch. A fresh worktree started from main may have
  // diverged from the PR head, so reset it only when every local commit is
  // already part of the remote default branch (nothing would be discarded).
  const isAncestor = (a: string, b: string) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore', timeout: 30000 });
      return true;
    } catch { return false; }
  };
  if (isAncestor('HEAD', fetchedHead)) {
    execFileSync('git', ['merge', '--ff-only', fetchedHead], { encoding: 'utf8', timeout: 30000 });
  } else {
    execFileSync('git', ['fetch', 'origin', 'main'], { encoding: 'utf8', timeout: 60000 });
    const base = execFileSync('git', ['rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim();
    if (!isAncestor('HEAD', base)) throw new Error('Retry cannot discard local commits outside the base history.');
    execFileSync('git', ['reset', '--hard', fetchedHead], { encoding: 'utf8', timeout: 30000 });
  }
  const updatedHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (updatedHead !== pr.headRefOid) throw new Error('Retry worktree does not match the PR revision.');
}
console.log(JSON.stringify({ number: pr.number, url: pr.url, branch }));
