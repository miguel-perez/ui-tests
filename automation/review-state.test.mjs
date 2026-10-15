import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { enableAutoMerge, evaluate, latestReview } from './review-state.mjs';

const pr = { state: 'open', draft: false, head: { sha: 'current', repo: { full_name: 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } };
const review = { id: 1, user: { login: 'coderabbitai[bot]', type: 'Bot' }, submitted_at: '2026-10-13T00:00:00Z', state: 'APPROVED', commit_id: 'current' };
const ci = { id: 1, head_sha: 'current', name: 'Automation CI', app: { slug: 'github-actions' }, started_at: '2026-10-13T00:00:00Z', status: 'completed', conclusion: 'success' };
const comments = [
  { ...review, id: 2, state: 'COMMENTED', submitted_at: '2026-10-13T00:01:00Z', body: '' },
  { ...review, id: 3, state: 'COMMENTED', submitted_at: '2026-10-13T00:02:00Z', body: 'Review evidence requiring ordinary handling' },
];
const approvedWithComments = [review, ...comments];

test('five-round review graph and correction fixture retain cumulative policy and protected merge path', () => {
  const graph = readFileSync(new URL('../payload/.archon/workflows/automation/review/autonomous-review.yaml', import.meta.url), 'utf8');
  assert.match(graph, /max_iterations: 5\b/);
  assert.match(graph, /five total cumulative correction rounds across\s+runs and continuations without reset \(never a sixth\)/);
  assert.match(graph, /provider: opencode\s+model: openai\/gpt-6\.1-sol/);
  assert.match(graph, /until_bash: test \$verify.output.state = "approved" \|\| test \$verify.output.state = "merged"/);
  assert.match(graph, /script: enable-auto-merge/);
  assert.match(graph, /depends_on: \[review-loop\]/);
  const fixture = readFileSync(new URL('../payload/.archon/workflows/automation/deliver/fixtures/correction.stubs.yaml', import.meta.url), 'utf8');
  assert.match(fixture, /Correction 4\/5 after historical 3\/3, leaving at most one further correction/);
  assert.match(fixture, /continuation does not reset prior usage and no sixth correction/);
  assert.match(fixture, /reached: \[implement, resolve, observe, repair, verify, review__merge\]/);
});

test('requires an affirmative current-head bot review and successful CI', () => {
  assert.equal(evaluate(pr, [review], [ci]).state, 'approved');
  assert.equal(evaluate(pr, [], [ci]).state, 'pending');
  assert.equal(evaluate(pr, [{ ...review, commit_id: 'old' }], [ci]).state, 'pending');
  assert.equal(evaluate(pr, [{ ...review, user: { login: 'coderabbitai[bot]', type: 'User' } }], [ci]).state, 'pending');
  assert.equal(evaluate(pr, [review], []).state, 'pending');
});

test('dismissed approval cannot fall back; ordinary comments preserve approval', () => {
  assert.equal(evaluate(pr, [{ ...review, state: 'DISMISSED' }], [ci]).state, 'pending');
  assert.equal(evaluate(pr, approvedWithComments, [ci]).state, 'approved');
  assert.equal(evaluate(pr, comments, [ci]).state, 'pending');
});

test('decision chronology uses time then ID, regardless of page or input order', () => {
  for (const state of ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED', 'UNKNOWN']) {
    const decision = { ...review, id: 4, state };
    for (const rows of [[review, decision, ...comments], [...comments, decision, review]]) {
      assert.equal(latestReview(rows), decision);
      assert.equal(evaluate(pr, rows, [ci]).state, state === 'APPROVED' ? 'approved' : state === 'CHANGES_REQUESTED' ? 'fix' : 'pending');
    }
  }
  const newer = { ...review, id: 0, state: 'DISMISSED', submitted_at: '2026-10-13T00:03:00Z' };
  assert.equal(latestReview([newer, ...approvedWithComments]), newer);
  // The REST reader flattens pages before evaluation; comments on either side
  // of the boundary must not replace the decision.
  for (const pages of [[Array(100).fill(comments[0]), [review, comments[1]]],
    [[review, ...Array(99).fill(comments[0])], [comments[1]]]]) {
    assert.equal(evaluate(pr, pages.flat(), [ci]).state, 'approved');
  }
});

test('CI failure needs repair; skipped CI never passes', () => {
  for (const conclusion of ['failure', 'skipped', 'neutral']) {
    assert.equal(evaluate(pr, approvedWithComments, [ci, { ...ci, id: 2, conclusion }]).state, 'fix');
  }
  assert.equal(evaluate(pr, approvedWithComments, [{ ...ci, app: { slug: 'other-app' } }]).state, 'pending');
  assert.equal(evaluate(pr, approvedWithComments, [{ ...ci, status: 'in_progress', conclusion: null }]).state, 'pending');
  assert.equal(evaluate(pr, approvedWithComments, [{ ...ci, head_sha: 'old' }]).state, 'pending');
  const queued = { ...ci, id: 2, started_at: null, status: 'queued', conclusion: null };
  assert.equal(evaluate(pr, approvedWithComments, [ci, queued]).state, 'pending');
  assert.equal(evaluate({ ...pr, head: { ...pr.head, sha: 'changed' } }, approvedWithComments, [ci]).state, 'pending');
});

test('current requested changes enter the repair loop, stale findings wait', () => {
  assert.equal(evaluate(pr, [{ ...review, state: 'CHANGES_REQUESTED' }], [ci]).state, 'fix');
  assert.equal(evaluate(pr, [{ ...review, state: 'CHANGES_REQUESTED', commit_id: 'old' }], [ci]).state, 'pending');
});

test('unresolved current CodeRabbit threads hold approval', () => {
  const thread = { isResolved: false, isOutdated: false, comments: { nodes: [{ author: { login: 'coderabbitai', __typename: 'Bot' } }] } };
  assert.equal(evaluate(pr, approvedWithComments, [ci], [thread]).state, 'pending');
  assert.equal(evaluate(pr, approvedWithComments, [ci], [{ ...thread, isResolved: true }]).state, 'approved');
  const spoof = { ...thread, comments: { nodes: [{ author: { login: 'coderabbitai', __typename: 'User' } }] } };
  assert.equal(evaluate(pr, [review], [ci], [spoof]).state, 'approved');
});

test('a PR that already auto-merged is successful completion', () => {
  assert.equal(evaluate({ ...pr, state: 'closed', merged: true }, [], []).state, 'merged');
});

test('closed, draft and fork PRs cannot enter automatic merging', () => {
  assert.equal(evaluate({ ...pr, state: 'closed' }, approvedWithComments, [ci]).state, 'blocked');
  assert.equal(evaluate({ ...pr, draft: true }, approvedWithComments, [ci]).state, 'blocked');
  assert.equal(evaluate({ ...pr, head: { ...pr.head, repo: { full_name: 'other/fork' } } }, approvedWithComments, [ci]).state, 'blocked');
});

test('another reviewer requesting changes prevents automatic completion', () => {
  const other = { ...review, id: 3, user: { login: 'other' }, state: 'CHANGES_REQUESTED' };
  assert.equal(evaluate(pr, [...approvedWithComments, other, { ...other, id: 4, state: 'COMMENTED' }], [ci]).state, 'blocked');
  assert.equal(evaluate(pr, [...approvedWithComments, other, { ...other, id: 4, state: 'APPROVED', submitted_at: '2026-10-13T00:02:00Z' }], [ci]).state, 'approved');
});

function mergeRace(read, overrides = {}) {
  let elapsed = 0;
  return enableAutoMerge({
    sha: 'current',
    request: () => { throw new Error('Merge already in progress'); },
    read,
    now: () => elapsed,
    wait: async milliseconds => { elapsed += milliseconds; },
    timeoutMs: 2500,
    ...overrides,
  });
}

test('a successful merge request needs no recovery read', async () => {
  assert.equal(await mergeRace(() => { throw new Error('Unexpected read'); }, { request: () => {} }), 'merge-enabled');
});

test('a concurrent merge succeeds only after GitHub confirms the same revision', async () => {
  let reads = 0;
  const result = await mergeRace(remaining => {
    assert.ok(remaining > 0 && remaining <= 2500);
    return ++reads === 1 ? pr : { ...pr, state: 'closed', merged: true };
  });
  assert.equal(result, 'merged');
  assert.equal(reads, 2);
});

test('an existing squash auto-merge request is successful recovery', async () => {
  assert.equal(await mergeRace(() => ({ ...pr, auto_merge: { merge_method: 'squash' } })), 'merge-enabled');
});

test('a merge race cannot accept a changed head, closed PR, or draft', async () => {
  await assert.rejects(mergeRace(() => ({ ...pr, head: { ...pr.head, sha: 'changed' }, merged: true })), /head changed/);
  await assert.rejects(mergeRace(() => ({ ...pr, state: 'closed', merged: false })), /Merge already in progress/);
  await assert.rejects(mergeRace(() => ({ ...pr, draft: true, auto_merge: { merge_method: 'squash' } })), /Merge already in progress/);
});

test('an unreadable merge result remains an error', async () => {
  await assert.rejects(mergeRace(() => { throw new Error('GitHub API unavailable'); }), /GitHub API unavailable/);
});

test('an unconfirmed or different merge method expires with the original failure', async () => {
  let reads = 0;
  await assert.rejects(mergeRace(() => {
    reads += 1;
    return { ...pr, auto_merge: { merge_method: 'rebase' } };
  }), /Merge already in progress/);
  assert.equal(reads, 3);
});

const cliPr = { ...pr, number: 95, merged: false, html_url: 'https://github.com/owner/repo/pull/95',
  head: { ...pr.head, ref: 'archon/issue-95' }, base: { ...pr.base, ref: 'main', sha: 'base-before' } };
const cliMerged = { ...cliPr, state: 'closed', merged: true, base: { ...cliPr.base, sha: 'base-after' } };
async function reviewCli(t, fresh, overrides = {}, command = 'merge') {
  const root = resolve('.archon/runtime/tests/review-cli');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(root + '/case-');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const transport = await readFile(new URL('./review-cli-fixture.mjs', import.meta.url), 'utf8');
  for (const name of ['gh', 'git']) await writeFile(resolve(directory, name), '#!/usr/bin/env node\n' + transport, { mode: 0o700 });
  const file = resolve(directory, 'data.json');
  await writeFile(file, JSON.stringify({ prs: [cliPr, fresh], reads: 0, calls: [],
    branch: cliPr.head.ref, sha: cliPr.head.sha, reviews: [review], checks: [ci], threads: [],
    protection: { required_status_checks: { checks: ['Automation CI', 'CodeRabbit approval'].map(context => ({ context, app_id: 15368 })) }, enforce_admins: { enabled: true } },
    ...overrides }));
  const result = spawnSync(process.execPath, [resolve('automation/review-state.mjs'), command, '--repo', 'owner/repo', '--pr', '95', '--timeout-seconds', '1'],
    { encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: directory + ':' + process.env.PATH, REVIEW_CLI_FIXTURE: file } });
  assert.ifError(result.error);
  const data = JSON.parse(await readFile(file, 'utf8'));
  return { ...result, data, mutations: data.calls.filter(call => call[0] === 'gh' && call[1] !== 'api' && call[1] !== 'variable') };
}

test('CLI recognizes exact-identity second-read actual merge with advanced base and zero mutations', async t => {
  const result = await reviewCli(t, cliMerged);
  assert.equal(result.data.reads, 2);
  assert.deepEqual(result.mutations, []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, 'merged');
  assert.equal(JSON.parse(result.stdout).head_sha, cliPr.head.sha);
});

test('CLI wait stops on a second-read closed unmerged PR without requesting review', async t => {
  const result = await reviewCli(t, { ...cliMerged, merged: false }, {}, 'wait');
  assert.equal(result.data.reads, 2);
  assert.deepEqual(result.mutations, []);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stderr.trim(), 'The pull request is closed.');
});

for (const [label, fresh] of [
  ['changed PR number', { ...cliMerged, number: 96 }],
  ['changed head', { ...cliMerged, head: { ...cliMerged.head, sha: 'changed' } }],
  ['changed source branch', { ...cliMerged, head: { ...cliMerged.head, ref: 'other' } }],
  ['changed source repository', { ...cliMerged, head: { ...cliMerged.head, repo: { full_name: 'other/repo' } } }],
  ['changed target branch', { ...cliMerged, base: { ...cliMerged.base, ref: 'other' } }],
  ['changed target repository', { ...cliMerged, base: { ...cliMerged.base, repo: { full_name: 'other/repo' } } }],
  ['closed unmerged', { ...cliMerged, merged: false }],
  ['unconfirmed merge', { ...cliMerged, merged: null }],
  ['truthy malformed merge', { ...cliMerged, merged: 'true' }],
  ['inconsistent open merge', { ...cliMerged, state: 'open' }],
  ['missing source repository', { ...cliMerged, head: { ...cliMerged.head, repo: null } }],
  ['missing target branch', { ...cliMerged, base: { ...cliMerged.base, ref: null } }],
  ['missing PR number', { ...cliMerged, number: undefined }],
  ['unavailable second read', { apiFailure: true }],
  ['changed open base', { ...cliPr, base: cliMerged.base }],
  ['changed open draft', { ...cliPr, draft: true }],
]) {
  test(`CLI blocks ${label} without merge mutation`, async t => {
    const result = await reviewCli(t, fresh);
    assert.equal(result.data.reads, 2);
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(result.mutations, []);
  });
}

test('CLI retains already-merged first read and local branch/commit binding', async t => {
  const result = await reviewCli(t, null, { prs: [cliMerged] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, 'merged');
  assert.equal(result.data.reads, 1);
  assert.deepEqual(result.mutations, []);
  for (const overrides of [{ branch: 'wrong' }, { sha: 'wrong' }]) {
    for (const prs of [[cliMerged], [cliPr, cliMerged]]) {
      const blocked = await reviewCli(t, null, { prs, ...overrides });
      assert.equal(blocked.status, 1);
      assert.match(blocked.stderr, /current local branch and committed revision/);
      assert.deepEqual(blocked.mutations, []);
    }
  }
});

test('CLI unchanged open approval uses only protected exact-head native auto-merge', async t => {
  const result = await reviewCli(t, cliPr);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).state, 'merge-enabled');
  assert.deepEqual(result.mutations, [['gh', 'pr', 'merge', '95', '--repo', 'owner/repo', '--auto', '--squash', '--match-head-commit', 'current']]);
});

for (const [label, overrides] of [
  ['missing review', { reviews: [] }],
  ['stale review', { reviews: [{ ...review, commit_id: 'old' }] }],
  ['dismissed review', { reviews: [{ ...review, state: 'DISMISSED' }] }],
  ['requested changes', { reviews: [{ ...review, state: 'CHANGES_REQUESTED' }] }],
  ['missing CI', { checks: [] }],
  ...['skipped', 'neutral', 'failure'].map(conclusion => [`${conclusion} CI`, { checks: [{ ...ci, conclusion }] }]),
  ['unresolved conversation', { threads: [{ isResolved: false, isOutdated: false, comments: { nodes: [{ author: { login: 'coderabbitai', __typename: 'Bot' } }] } }] }],
  ['missing protections', { protection: {} }],
  ['unavailable protections', { protection: { apiFailure: true } }],
  ['unavailable reviews', { reviews: { apiFailure: true } }],
]) {
  test(`CLI still blocks open PR with ${label}, even with auto-merge enabled`, async t => {
    const open = { ...cliPr, auto_merge: { merge_method: 'squash' } };
    const result = await reviewCli(t, open, { prs: [open, open], ...overrides });
    assert.equal(result.status, 1, result.stdout);
    assert.deepEqual(result.mutations, []);
  });
}
