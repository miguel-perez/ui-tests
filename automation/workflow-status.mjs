#!/usr/bin/env node
// Existing DAG bridge: obtain only supported structured CLI context. Never wait
// for this workflow to become terminal, and never mutate its database record.
import { execFileSync } from 'node:child_process';
import { client, publish, linkedIssueForPR } from './delivery-status.mjs';

try {
  const api = client({ deadlineAt: Date.now() + 90000 });
  const repo = await api.repo();
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', timeout: 15000 }).trim();
  const rows = await api.runs();
  if (!Array.isArray(rows?.runs)) throw new Error('Invalid workflow runs response');
  const candidates = rows.runs.filter(row => row.working_path === process.cwd() && row.status === 'running' &&
    ['autonomous-delivery', 'autonomous-pr-retry'].includes(row.workflow_name));
  if (candidates.length !== 1) throw new Error('Current workflow identity unavailable or ambiguous');
  const run = candidates[0];
  if (run.codebase_name !== repo) throw new Error('Registered project context mismatch');
  const dispatch = run.platform_type === 'github' ? run.worker_platform_id?.match(/^([^#]+)#([1-9][0-9]*)$/) : null;
  const requestedPR = process.env.INPUTS_PR || run.metadata?.inputs?.pr;
  const rawIssue = process.env.INPUTS_ISSUE || run.metadata?.inputs?.issue ||
    (requestedPR && /^[1-9][0-9]*$/.test(String(requestedPR)) ? await linkedIssueForPR(repo, Number(requestedPR), api) : null) ||
    (dispatch?.[1] === repo ? dispatch[2] : null);
  if (!/^[1-9][0-9]*$/.test(String(rawIssue))) throw new Error('Issue context unavailable; supply --input issue=N or register recovery explicitly');
  const issue = Number(rawIssue);
  let pr = null;
  if (requestedPR) {
    if (!/^[1-9][0-9]*$/.test(String(requestedPR))) throw new Error('Invalid PR input');
    pr = Number(requestedPR);
  } else {
    const prs = JSON.parse(execFileSync('gh', ['pr', 'list', '--repo', repo, '--head', branch, '--state', 'all', '--json', 'number,headRefName'],
      { encoding: 'utf8', timeout: 15000 }));
    if (!Array.isArray(prs) || prs.length > 1) throw new Error('Ambiguous branch PR linkage');
    pr = prs[0]?.number ?? null;
  }
  const summary = await publish({ repo, issue }, { version: 1, repo, issue, branch, pr, runs: [run.id] }, api);
  console.log(JSON.stringify({ state: summary.delivery, issue, run: run.id, pr }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
