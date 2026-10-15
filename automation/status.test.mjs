import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { marker, commentBody, project } from './delivery-status.mjs';
import { reconcile } from './reconcile-status.mjs';

const repo = 'owner/repo', sha = 'a'.repeat(40), mergeSha = 'b'.repeat(40);
const pr = { number: 71, url: `https://github.com/${repo}/pull/71`, state: 'OPEN', headRefName: 'archon/task',
  isDraft: false,
  headRefOid: sha, isCrossRepository: false, mergedAt: null, mergeCommit: null, autoMergeRequest: null,
  reviewDecision: 'REVIEW_REQUIRED', statusCheckRollup: [] };
const merged = { ...pr, state: 'MERGED', mergedAt: '2026-10-14T16:58:06Z', mergeCommit: { oid: mergeSha } };
const link = { version: 1, repo, issue: 66, branch: 'archon/task', pr: 71, runs: ['original', 'recovery'] };
function run(id, status, started = '2026-10-14T16:00:00Z') {
  return { id, status, started_at: started, codebase_name: repo,
    ...(status === 'running' ? { current_step_name: 'implement' } : {
      terminal_record: { run_id: id, status, returns: { value: { state: 'merge-enabled' } } } }) };
}
function initial() {
  return { pr, comments: [], runs: { original: run('original', 'failed'), recovery: run('recovery', 'completed', '2026-10-14T16:30:00Z') } };
}
async function fixture(t, data = initial()) {
  const root = resolve('.archon/runtime/status-tests'); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(root + '/case-');
  const source = await readFile(resolve('automation/status-fixture.mjs'), 'utf8');
  for (const name of ['gh', 'archon', 'git']) await writeFile(resolve(directory, name), '#!/usr/bin/env node\n' + source, { mode: 0o700 });
  const file = resolve(directory, 'state.json'); await writeFile(file, JSON.stringify(data));
  // Isolated cwd/receipts, fixture subprocess API, actual repository CLI code.
  const cwd = resolve(directory, 'checkout'); await mkdir(cwd);
  const env = { ...process.env, PATH: directory + ':' + process.env.PATH, STATUS_FIXTURE: file };
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { file, cwd, env, async data() { return JSON.parse(await readFile(file, 'utf8')); },
    cli(...args) { const result = spawnSync(process.execPath, [resolve('automation/status.mjs'), '--repo', repo, '--json', ...args],
      { cwd, env, encoding: 'utf8', timeout: 12000 });
      assert.ifError(result.error);
      return { ...result, rows: result.stdout.trim() ? result.stdout.trim().split('\n').map(line => JSON.parse(line)) : [] }; } };
}
function managed(linkage = link) {
  return { id: 1, user: { login: 'owner', type: 'User' }, body: commentBody(linkage,
    project({ repo, issue: 66, link: linkage, pr, observedAt: '2026-10-14T16:00:00Z' })) };
}

test('CLI retains failed attempt after merged recovery; stale earlier-run reads cannot regress merge', async t => {
  const data = initial(); data.pr = merged; data.comments = [managed()];
  const f = await fixture(t, data);
  const result = f.cli('--issue', '66'); assert.equal(result.status, 0);
  const summary = result.rows[0]; assert.equal(summary.delivery, 'merged'); assert.equal(summary.merge.sha, mergeSha);
  assert.deepEqual(summary.attempts.map(row => row.status), ['failed', 'completed']);
  const stale = f.cli('--issue', '66', '--run', 'original').rows[0]; assert.equal(stale.delivery, 'merged');
  assert.match(stale.acceptance, /does not establish/);
  assert.ok((await f.data()).calls.every(call => !call.includes('--method')));
});
test('completed merge-enabled run exits without transcript terminal event and shows awaiting merge; later true merge', async t => {
  const data = initial(); data.pr = { ...pr, autoMergeRequest: {} }; data.comments = [managed()];
  const f = await fixture(t, data);
  const result = f.cli('--issue', '66', '--run', 'recovery', '--watch', 'run', '--deadline', '4');
  assert.equal(result.status, 0); assert.equal(result.rows.at(-1).watchExit, 'run-terminal');
  assert.equal(result.rows.at(-1).delivery, 'awaiting-merge'); assert.equal(result.rows.at(-1).merge, null);
  assert.ok((await f.data()).calls.every(call => !call.includes('logs')));
  data.pr = merged; await writeFile(f.file, JSON.stringify(data));
  assert.equal(f.cli('--issue', '66').rows[0].delivery, 'merged');
});
test('failed concurrent-merge observer remains failed while GitHub-only state is merged', async t => {
  const data = initial(); data.pr = merged; data.comments = [managed()];
  const f = await fixture(t, data);
  assert.equal(f.cli('--issue', '66', '--run', 'original', '--watch', 'run', '--deadline', '3').rows.at(-1).delivery, 'merged');
  const only = f.cli('--issue', '66', '--github-only').rows[0];
  assert.equal(only.delivery, 'merged'); assert.ok(only.blockers.some(error => /unavailable/.test(error)));
});
test('PR watch exits closed-unmerged and changed target; approval/CI cannot fabricate merge', async t => {
  const data = initial(); data.pr = { ...pr, state: 'CLOSED' }; const f = await fixture(t, data);
  assert.equal(f.cli('--pr', '71', '--watch', 'pr', '--deadline', '3').rows.at(-1).watchExit, 'closed-unmerged');
  data.pr = { ...pr, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] };
  await writeFile(f.file, JSON.stringify(data));
  assert.equal(f.cli('--pr', '71', '--expected-head', mergeSha, '--watch', 'pr', '--deadline', '3').rows.at(-1).watchExit, 'changed-target');
  assert.notEqual(f.cli('--pr', '71').rows[0].delivery, 'merged');
});
test('ambiguous linkage, missing run, malformed/truncated and API failures stay explicit', async t => {
  const data = initial(); data.comments = [managed(), managed({ ...link, pr: 72 })];
  const f = await fixture(t, data);
  let result = f.cli('--issue', '66'); assert.equal(result.rows[0].delivery, 'unknown'); assert.match(result.rows[0].blockers.join(), /Ambiguous/);
  data.comments = []; await writeFile(f.file, JSON.stringify(data));
  result = f.cli('--run', 'missing'); assert.match(result.rows[0].blockers.join(), /missing/);
  for (const key of ['malformed', 'error']) {
    data[key] = true; await writeFile(f.file, JSON.stringify(data));
    assert.equal(f.cli('--pr', '71').rows[0].delivery, 'unknown'); delete data[key];
  }
});
test('missing runtime and unknown run cannot poll forever; deadline bounds hanging subprocess', async t => {
  const data = initial(); data.runs = {}; const f = await fixture(t, data);
  const result = f.cli('--run', 'missing', '--watch', 'run', '--deadline', '6', '--interval', '1');
  assert.equal(result.status, 2); assert.equal(result.rows.at(-1).watchExit, 'observation-unavailable');
  data.hang = true; await writeFile(f.file, JSON.stringify(data));
  const before = Date.now(); const deadline = f.cli('--pr', '71', '--watch', 'pr', '--deadline', '1');
  assert.equal(deadline.rows.at(-1).watchExit, 'deadline'); assert.ok(Date.now() - before < 2500);
});
test('interruption cleanly stops actual watcher and its child', async t => {
  const data = initial(); data.hang = true; const f = await fixture(t, data);
  const child = spawn(process.execPath, [resolve('automation/status.mjs'), '--repo', repo, '--pr', '71', '--json', '--watch', 'pr', '--deadline', '20'],
    { cwd: f.cwd, env: f.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', data => output += data);
  setTimeout(() => child.kill('SIGINT'), 250);
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 130); assert.equal(JSON.parse(output.trim()).watchExit, 'interrupted');
});
test('real publish/reconcile API calls deduplicate owned comments, reread concurrent merge and preserve humans / acceptance', async t => {
  const data = initial(); const human = { id: 5, user: { login: 'person' }, body: marker + '\nHuman content and instructions' };
  data.comments = [human]; data.prs = [pr, merged]; const f = await fixture(t, data);
  let result = f.cli('--issue', '66', '--pr', '71', '--branch', 'archon/task', '--run', 'recovery', '--register', '--publish');
  assert.equal(result.status, 0, result.stderr); assert.equal(result.rows[0].delivery, 'merged');
  let stored = await f.data(); assert.deepEqual(stored.comments[0], human); assert.equal(stored.comments.length, 2);
  result = f.cli('--issue', '66', '--publish'); assert.equal(result.status, 0, result.stderr);
  stored = await f.data(); assert.equal(stored.comments.length, 2);
  const writes = stored.calls.filter(call => call.includes('--method')).length;
  f.cli('--issue', '66', '--publish'); assert.equal((await f.data()).calls.filter(call => call.includes('--method')).length, writes);
  stored.comments.push({ ...stored.comments[1], id: 999 }); await writeFile(f.file, JSON.stringify(stored));
  assert.equal(f.cli('--issue', '66', '--publish').status, 0);
  stored = await f.data(); assert.match(stored.comments.at(-1).body, /Superseded/);
  assert.ok(stored.calls.filter(call => call.includes('--method')).every(call => call.at(-1).startsWith('body=')));
  assert.match(stored.comments[1].body, /does not establish deployment or human acceptance/);
});
test('spoofed marker never adopted; invalid merge evidence and managed metadata fail closed', async t => {
  const data = initial(); data.comments = [{ ...managed(), user: { login: 'attacker' } }];
  const f = await fixture(t, data);
  assert.match(f.cli('--issue', '66').rows[0].blockers.join(), /linkage unavailable/);
  data.pr = { ...merged, mergeCommit: null }; await writeFile(f.file, JSON.stringify(data));
  assert.equal(f.cli('--pr', '71').rows[0].delivery, 'unknown');
  data.comments = [{ ...managed(), body: marker + '\n<!-- linkage:{broken} -->\n' }];
  await writeFile(f.file, JSON.stringify(data)); assert.notEqual(f.cli('--issue', '66', '--publish').status, 0);
});
test('trusted reconciliation executes actual entrypoint, retains timestamped attempt history and does not spam', async t => {
  const data = initial(); data.comments = [managed()]; const f = await fixture(t, data);
  assert.equal(f.cli('--issue', '66', '--publish').status, 0);
  let stored = await f.data(); stored.pr = merged; await writeFile(f.file, JSON.stringify(stored));
  const reconcile = () => spawnSync(process.execPath, [resolve('automation/reconcile-status.mjs')],
    { cwd: f.cwd, env: { ...f.env, GITHUB_REPOSITORY: repo }, encoding: 'utf8', timeout: 10000 });
  let result = reconcile(); assert.equal(result.status, 0, result.stderr);
  stored = await f.data(); assert.match(stored.comments[0].body, /Merged/);
  assert.match(stored.comments[0].body, /Attempt original: failed/); assert.match(stored.comments[0].body, /last known/);
  const count = stored.calls.filter(call => call.includes('--method')).length;
  result = reconcile(); assert.equal(result.status, 0, result.stderr);
  assert.equal((await f.data()).calls.filter(call => call.includes('--method')).length, count);
});
test('reconciliation isolates comment-read, metadata and publish failures while updating later issues', async () => {
  const comments = new Map([
    [61, [{ ...managed(), body: marker + '\n<!-- linkage:{broken} -->\n' }]],
    [62, [managed({ ...link, issue: 62, pr: 72 })]],
    [66, [managed()]],
  ]);
  const visited = [], writes = [];
  const api = {
    issues: async () => [60, 61, 62, 66].map(number => ({ number, comments: 1 })),
    comments: async (repository, issue) => {
      assert.equal(repository, repo); visited.push(issue);
      if (issue === 60) throw new Error('Comment read unavailable');
      return comments.get(issue);
    },
    pr: async (repository, number) => {
      assert.equal(repository, repo);
      if (number === 72) throw new Error('PR read unavailable');
      assert.equal(number, 71); return merged;
    },
    write: async (repository, issue, id, body) => {
      assert.equal(repository, repo); writes.push(issue);
      comments.get(issue).find(comment => comment.id === id).body = body;
    },
  };
  await assert.rejects(reconcile(repo, api), error => {
    assert.match(error.message, /#60: Comment read unavailable/);
    assert.match(error.message, /#61:/);
    assert.match(error.message, /#62:.*PR read unavailable/);
    return true;
  });
  assert.ok(visited.includes(66));
  assert.deepEqual(writes, [66]);
  assert.match(comments.get(66)[0].body, /Merged/);
  assert.match(comments.get(66)[0].body, new RegExp(mergeSha));
});
test('workflow bridge captures ordinary structured dispatch before publication and registered PR retry', async t => {
  const data = initial(); data.pr = null;
  const f = await fixture(t, data);
  data.runs = { current: { ...run('current', 'running'), working_path: f.cwd, workflow_name: 'autonomous-delivery',
    platform_type: 'github', worker_platform_id: `${repo}#66` } };
  await writeFile(f.file, JSON.stringify(data));
  const bridge = env => spawnSync(process.execPath, [resolve('automation/workflow-status.mjs')],
    { cwd: f.cwd, env: { ...f.env, ...env }, encoding: 'utf8', timeout: 10000 });
  let result = bridge({}); assert.equal(result.status, 0, result.stderr);
  let stored = await f.data(); assert.match(stored.comments[0].body, /PR unavailable/); assert.match(stored.comments[0].body, /current/);
  stored.pr = pr; await writeFile(f.file, JSON.stringify(stored));
  assert.equal(f.cli('--issue', '66', '--pr', '71', '--branch', 'archon/task', '--run', 'current', '--register', '--publish').status, 0);
  stored = await f.data(); stored.runs.current = { ...stored.runs.current, workflow_name: 'autonomous-pr-retry', platform_type: 'cli',
    worker_platform_id: 'cli-worker', metadata: { inputs: { pr: '71' } } }; await writeFile(f.file, JSON.stringify(stored));
  result = bridge({ INPUTS_PR: '71' }); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).issue, 66);
});
test('authoritative cancellation without terminal record exits run watch; persisted active is never verified live', async t => {
  const data = initial(); data.runs.original = { ...run('original', 'running'), status: 'cancelled' };
  const f = await fixture(t, data);
  const result = f.cli('--run', 'original', '--watch', 'run', '--deadline', '3');
  assert.equal(result.rows.at(-1).watchExit, 'run-terminal');
  data.runs.original = run('original', 'running'); await writeFile(f.file, JSON.stringify(data));
  const active = f.cli('--run', 'original').rows[0]; assert.equal(active.attempts[0].liveExecution, 'unverified');
});
test('merge racing the comment write is reread and healed; missing publication permission is a visible failure', async t => {
  const data = initial(); data.comments = [managed()];
  // First observation and immediate prewrite read remain open; postwrite read sees merge.
  data.prs = [pr, pr, pr, merged]; const f = await fixture(t, data);
  const result = f.cli('--issue', '66', '--publish');
  assert.equal(result.status, 0, result.stderr); assert.equal(result.rows[0].delivery, 'merged');
  assert.match((await f.data()).comments[0].body, /Merged/);
  const stored = await f.data(); stored.error = true; await writeFile(f.file, JSON.stringify(stored));
  assert.notEqual(f.cli('--issue', '66', '--publish').status, 0);
  assert.deepEqual((await f.data()).comments, stored.comments);
});
test('enabled auto-merge still reports actual check/review blockers without treating them as API errors', async t => {
  const data = initial(); data.pr = { ...pr, autoMergeRequest: {}, reviewDecision: 'CHANGES_REQUESTED',
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] };
  const f = await fixture(t, data); const result = f.cli('--pr', '71').rows[0];
  assert.equal(result.delivery, 'awaiting-merge'); assert.equal(result.blockers.length, 2);
  assert.deepEqual(result.observationErrors, []); assert.equal(result.merge, null);
});
