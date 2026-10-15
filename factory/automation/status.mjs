#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
import { observe, human, publish, isTerminal } from './delivery-status.mjs';

const { values } = parseArgs({ options: {
  issue: { type: 'string' }, pr: { type: 'string' }, run: { type: 'string' }, repo: { type: 'string' },
  json: { type: 'boolean' }, 'github-only': { type: 'boolean' }, watch: { type: 'string' },
  deadline: { type: 'string' }, interval: { type: 'string' }, timeout: { type: 'string' },
  'expected-head': { type: 'string' }, publish: { type: 'boolean' }, register: { type: 'boolean' },
  branch: { type: 'string' }, help: { type: 'boolean' },
} });
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
function numeric(value, name, fallback) {
  if (value === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid ${name}`);
  return Number(value);
}
function print(summary, exit) {
  console.log(values.json ? JSON.stringify({ ...summary, ...(exit ? { watchExit: exit } : {}) }) :
    `${human(summary)}${exit ? `\nWatch exit: ${exit}` : ''}`);
}
try {
  if (values.help) {
    console.log('status --issue N [--pr N] [--run ID] [--repo owner/repo] [--json] [--github-only]\n' +
      'Watch: --watch run|pr --deadline SECONDS [--interval SECONDS] [--expected-head SHA]\n' +
      'Explicit writes: --publish; --register --publish --issue N --branch BRANCH [--pr N] [--run ID]');
  } else {
    const options = { issue: numeric(values.issue, 'issue'), pr: numeric(values.pr, 'PR'), run: values.run,
      repo: values.repo, githubOnly: values['github-only'], signal: controller.signal,
      timeout: numeric(values.timeout, 'timeout', 15) * 1000 };
    if (!options.issue && !options.pr && !options.run) throw new Error('Select an issue, PR or run');
    if (options.run && !/^[a-zA-Z0-9-]{1,80}$/.test(options.run)) throw new Error('Invalid run ID');
    if (values.watch && !['run', 'pr'].includes(values.watch)) throw new Error('Watch selector must be run or pr');
    if (values.watch === 'run' && (!options.run || options.githubOnly)) throw new Error('Run watch requires --run and local runtime');
    if (values.watch && !values.deadline) throw new Error('Watch requires an explicit deadline');
    if (values.watch && (values.publish || values.register)) throw new Error('Watch is read-only');
    if (values.register && !values.publish) throw new Error('Registration requires explicit --publish');
    if (values['expected-head'] && !/^[a-f0-9]{40}$/.test(values['expected-head'])) throw new Error('Invalid expected head');
    if (values.publish) {
      const registration = values.register ? { branch: values.branch, pr: options.pr ?? null, runs: options.run ? [options.run] : [] } : null;
      print(await publish(options, registration));
    } else {
      const end = Date.now() + numeric(values.deadline, 'deadline', 1) * 1000;
      if (values.watch) options.deadlineAt = end;
      const interval = numeric(values.interval, 'interval', 10) * 1000;
      let last = '', heartbeat = 0, failures = 0, pinned = values['expected-head'];
      while (true) {
        if (values.watch) options.timeout = Math.min(options.timeout, Math.max(1, end - Date.now()));
        let summary;
        try { summary = (await observe(options)).summary; }
        catch (error) { summary = { repo: options.repo ?? 'unavailable', delivery: 'unknown', stage: 'unavailable',
          observedAt: new Date().toISOString(), attempts: [], blockers: [error.message], observationErrors: [error.message], localExecution: 'unavailable' }; }
        if (!values.watch) { print(summary); if (summary.blockers.length) process.exitCode = 2; break; }
        pinned ??= summary.pr?.head;
        let exit;
        if (controller.signal.aborted) exit = 'interrupted';
        else if (pinned && summary.pr && pinned !== summary.pr.head) exit = 'changed-target';
        else if (values.watch === 'run' && summary.attempts.some(row => row.id === options.run && row.terminal && isTerminal(row.status))) exit = 'run-terminal';
        else if (values.watch === 'pr' && ['merged', 'closed-unmerged'].includes(summary.delivery)) exit = summary.delivery;
        else if (Date.now() >= end) exit = 'deadline';
        else if (summary.observationErrors.some(error => error !== 'Local execution status unavailable (GitHub-only mode)') && ++failures >= 3) exit = 'observation-unavailable';
        else if (!summary.observationErrors.some(error => error !== 'Local execution status unavailable (GitHub-only mode)')) failures = 0;
        const meaningful = JSON.stringify({ ...summary, observedAt: undefined,
          attempts: summary.attempts.map(row => ({ ...row, observedAt: undefined })) });
        if (exit || meaningful !== last || Date.now() - heartbeat >= 60000) {
          print(summary, exit); last = meaningful; heartbeat = Date.now();
        }
        if (exit) { if (!['run-terminal', 'merged', 'closed-unmerged'].includes(exit)) process.exitCode = exit === 'interrupted' ? 130 : 2; break; }
        try { await sleep(Math.min(interval, Math.max(1, end - Date.now())), undefined, { signal: controller.signal }); }
        catch { /* Abort is reported through the same projection on next iteration. */ }
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = controller.signal.aborted ? 130 : 1; }
finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
