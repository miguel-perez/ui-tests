import { spawn } from 'node:child_process';
import { readFile, mkdir, rename, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export const marker = '<!-- archon-factory-delivery-status:v1 -->';
const terminal = new Set(['completed', 'failed', 'cancelled', 'canceled', 'abandoned']);
const statuses = new Set([...terminal, 'running', 'pending', 'paused', 'unknown', 'unavailable']);
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;
const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const shaPattern = /^[a-f0-9]{40}$/;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = value => Number.isSafeInteger(value) && value > 0;
export const isTerminal = state => terminal.has(state);

// No shell, transcript reads, worker/PID inference, or unbounded child processes.
export function command(program, args, { timeout = 15000, signal } = {}) {
  return new Promise((accept, reject) => {
    if (signal?.aborted) { reject(new Error('Observation interrupted')); return; }
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', size = 0, expired = false;
    const stop = () => { expired = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeout);
    signal?.addEventListener('abort', stop, { once: true });
    child.stdout.on('data', data => {
      size += data.length;
      if (size > 2 * 1024 * 1024) stop();
      else stdout += data;
    });
    child.stderr.on('data', () => {}); // Do not reproduce credentials/private diagnostics.
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      if (expired || code !== 0) reject(new Error(`${program} read failed${expired ? ' (timeout/interruption/output limit)' : ''}`));
      else {
        try { accept(JSON.parse(stdout)); }
        catch { reject(new Error(`${program} returned malformed/truncated JSON`)); }
      }
    });
  });
}

export function validateLink(link) {
  if (!link || link.version !== 1 || !repoPattern.test(link.repo) || !positive(link.issue) ||
      typeof link.branch !== 'string' || !/^[a-zA-Z0-9._/-]{1,200}$/.test(link.branch) ||
      link.branch.includes('..') || (link.pr !== null && !positive(link.pr)) ||
      !Array.isArray(link.runs) || link.runs.length > 100 ||
      link.runs.some(id => typeof id !== 'string' || !idPattern.test(id)) ||
      new Set(link.runs).size !== link.runs.length) throw new Error('Invalid delivery linkage');
  return { version: 1, repo: link.repo, issue: link.issue, branch: link.branch, pr: link.pr, runs: link.runs };
}

function receiptPath(issue) {
  if (!positive(issue)) throw new Error('Invalid issue');
  return resolve('.archon/runtime/delivery-status', `${issue}.json`);
}
export async function readReceipt(issue) {
  try { return validateLink(JSON.parse(await readFile(receiptPath(issue), 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export async function locked(key, work) {
  const directory = resolve('.archon/runtime/delivery-status');
  await mkdir(directory, { recursive: true });
  const lock = resolve(directory, `${key}.lock`);
  try { await mkdir(lock); }
  catch { throw new Error('Status write already in progress (or interrupted lock needs explicit inspection)'); }
  try { return await work(); }
  finally { await rm(lock, { recursive: true }); }
}
export async function saveReceipt(link) {
  link = validateLink(link);
  const file = receiptPath(link.issue), temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(link) + '\n', { mode: 0o600, flag: 'wx' });
  try { await rename(temp, file); }
  finally { await rm(temp, { force: true }); }
}

export function trustedComment(comment, repo) {
  return comment?.body?.startsWith(marker + '\n') &&
    (comment.user?.login === repo.split('/')[0] ||
      (comment.user?.login === 'github-actions[bot]' && comment.user?.type === 'Bot'));
}
export function parseComment(comment, repo, issue) {
  if (!trustedComment(comment, repo)) return null;
  const match = comment.body.match(/\n<!-- linkage:(\{[^\n]+\}) -->\n/);
  if (!match) throw new Error('Managed comment has malformed linkage');
  const link = validateLink(JSON.parse(match[1]));
  if (link.repo !== repo || link.issue !== issue) throw new Error('Managed comment identity mismatch');
  return link;
}

function historicalAttempts(comment) {
  const match = comment.body.match(/\n<!-- attempts:(\[[^\n]*\]) -->\n/);
  if (!match) return [];
  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows) || rows.length > 100 || rows.some(row => !row || typeof row.id !== 'string' || !idPattern.test(row.id) ||
      !statuses.has(row.status) || !date(row.observedAt) || (row.startedAt && !date(row.startedAt)) ||
      typeof row.terminal !== 'boolean')) throw new Error('Malformed managed attempt snapshot');
  return rows.map(row => ({ id: row.id, status: row.status, observedAt: row.observedAt,
    startedAt: row.startedAt ?? null, terminal: row.terminal, lastKnown: true, liveExecution: 'unverified' }));
}

export function client({ timeout = 15000, signal, deadlineAt } = {}) {
  const run = (program, args) => command(program, args, {
    timeout: deadlineAt ? Math.min(timeout, Math.max(1, deadlineAt - Date.now())) : timeout, signal });
  return {
    repo: async () => {
      const data = await run('gh', ['repo', 'view', '--json', 'nameWithOwner']);
      if (!repoPattern.test(data?.nameWithOwner)) throw new Error('Invalid repository response');
      return data.nameWithOwner;
    },
    comments: async (repo, issue) => {
      const data = await run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/issues/${issue}/comments?per_page=100`]);
      if (!Array.isArray(data) || data.some(page => !Array.isArray(page))) throw new Error('Invalid comments response');
      return data.flat();
    },
    issues: async repo => {
      const data = await run('gh', ['api', '--paginate', '--slurp', `repos/${repo}/issues?state=all&per_page=100`]);
      if (!Array.isArray(data) || data.some(page => !Array.isArray(page)) || data.flat().length > 1000) {
        throw new Error('Issue enumeration invalid or exceeds bounded reconciliation limit');
      }
      return data.flat().filter(issue => !issue.pull_request);
    },
    pr: (repo, number) => run('gh', ['pr', 'view', String(number), '--repo', repo, '--json',
      'number,url,state,isDraft,headRefName,headRefOid,isCrossRepository,mergedAt,mergeCommit,autoMergeRequest,reviewDecision,statusCheckRollup']),
    runs: () => run('archon', ['workflow', 'runs', '--json', '--limit', '100']),
    run: id => run('archon', ['workflow', 'get', id, '--json']),
    write: (repo, issue, id, body) => run('gh', ['api', '--method', id ? 'PATCH' : 'POST',
      id ? `repos/${repo}/issues/comments/${id}` : `repos/${repo}/issues/${issue}/comments`, '-f', `body=${body}`]),
  };
}

export function attempt(detail, id, observedAt) {
  if (!detail || detail.id !== id || !statuses.has(detail.status) || !date(detail.started_at)) {
    throw new Error('Invalid run response');
  }
  const record = detail.terminal_record;
  if (record && (!terminal.has(record.status) || record.run_id !== id || record.status !== detail.status)) {
    throw new Error('Inconsistent terminal record');
  }
  // Persisted running != verified live worker. Never interpret execution_owner PID.
  return { id, startedAt: detail.started_at, observedAt, status: detail.status,
    terminal: terminal.has(detail.status), liveExecution: 'unverified',
    stage: /^[a-zA-Z0-9_-]{1,100}$/.test(record?.first_failed_node ?? detail.current_step_name ?? '') ?
      (record?.first_failed_node ?? detail.current_step_name) : null };
}

export function project({ repo, issue, link, pr, attempts = [], errors = [], observedAt }) {
  let delivery = 'unknown', stage = 'unknown';
  const sorted = [...attempts].sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '') || a.id.localeCompare(b.id));
  const latest = sorted.at(-1);
  if (latest?.status === 'running' && latest.stage) {
    stage = /review|merge/.test(latest.stage) ? 'reviewing' : /implement|resolve/.test(latest.stage) ? 'implementing' : latest.stage;
  }
  if (latest?.status === 'failed') stage = 'failed-attempt';
  if (['paused', 'cancelled', 'canceled', 'abandoned'].includes(latest?.status)) stage = 'blocked';
  if (!pr && ['implementing', 'reviewing', 'failed-attempt', 'blocked'].includes(stage)) delivery = stage;
  let evidence = null;
  if (pr) {
    if (pr.state === 'MERGED') {
      delivery = 'merged'; stage = 'merged';
      evidence = { at: pr.mergedAt, sha: pr.mergeCommit.oid };
    } else if (pr.state === 'CLOSED') { delivery = 'closed-unmerged'; stage = delivery; }
    else if (pr.isDraft) { delivery = 'blocked'; stage = 'draft'; }
    else if (pr.autoMergeRequest) { delivery = 'awaiting-merge'; stage = delivery; }
    else if (pr.reviewDecision === 'CHANGES_REQUESTED') { delivery = 'blocked'; stage = 'reviewing'; }
    else if (pr.statusCheckRollup.some(check => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.conclusion ?? check.state))) {
      delivery = 'blocked'; stage = 'waiting-for-checks';
    }
    else if (pr.statusCheckRollup.some(check => ['QUEUED', 'IN_PROGRESS', 'PENDING', 'EXPECTED'].includes(check.status ?? check.state))) {
      delivery = 'waiting-for-checks'; stage = delivery;
    } else { delivery = 'reviewing'; stage = delivery; }
  }
  const blockers = [...errors];
  if (pr?.state === 'OPEN') {
    if (pr.isDraft) blockers.push('PR is draft');
    if (pr.reviewDecision === 'CHANGES_REQUESTED') blockers.push('GitHub reports requested changes');
    if (pr.statusCheckRollup.some(check => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(check.conclusion ?? check.state))) {
      blockers.push('GitHub reports unsuccessful checks');
    }
    if (pr.statusCheckRollup.some(check => ['QUEUED', 'IN_PROGRESS', 'PENDING', 'EXPECTED'].includes(check.status ?? check.state))) {
      blockers.push('GitHub checks are pending');
    }
  }
  if (errors.length && delivery !== 'merged' && delivery !== 'closed-unmerged') delivery = 'unknown';
  return { version: 1, repo, issue: issue ?? null, branch: link?.branch ?? pr?.headRefName ?? null,
    observedAt, stage, delivery, pr: pr ? { number: pr.number, url: pr.url, head: pr.headRefOid } : null,
    merge: evidence, blockers,
    attempts: sorted, localExecution: attempts.some(row => !row.lastKnown && row.status !== 'unavailable') ? 'persisted evidence; live execution unverified' : 'unavailable',
    acceptance: 'Software delivery does not establish deployment or human acceptance; issue closure is not managed here.' };
}

export function validatePR(pr, repo, number, link) {
  if (!pr || pr.number !== number || !['OPEN', 'CLOSED', 'MERGED'].includes(pr.state) ||
      !shaPattern.test(pr.headRefOid) || typeof pr.headRefName !== 'string' || pr.isCrossRepository !== false ||
      pr.url !== `https://github.com/${repo}/pull/${number}` || !Array.isArray(pr.statusCheckRollup) ||
      (link && pr.headRefName !== link.branch) ||
      (pr.state === 'MERGED' && (!date(pr.mergedAt) || !shaPattern.test(pr.mergeCommit?.oid)))) {
    throw new Error('Invalid PR response or changed repository/branch identity');
  }
  return pr;
}

export async function observe(options, api = client(options)) {
  const observedAt = new Date().toISOString(), errors = [], attempts = [];
  const repo = options.repo ?? await api.repo();
  if (!repoPattern.test(repo)) throw new Error('Invalid repository');
  let link = null, managed = [], comments = [];
  if (options.issue) {
    try {
      comments = await api.comments(repo, options.issue);
      managed = comments.filter(comment => trustedComment(comment, repo));
      const links = managed.map(comment => parseComment(comment, repo, options.issue));
      const receipt = await readReceipt(options.issue);
      if (receipt && receipt.repo !== repo) throw new Error('Receipt repository mismatch');
      link = links[0] ?? receipt;
      if (links.some(candidate => JSON.stringify(candidate) !== JSON.stringify(link)) ||
          (receipt && link && (receipt.branch !== link.branch || (receipt.pr && link.pr && receipt.pr !== link.pr)))) {
        throw new Error('Ambiguous delivery linkage; explicit reconciliation required');
      }
      if (receipt && link) link = { ...link, pr: link.pr ?? receipt.pr, runs: [...new Set([...link.runs, ...receipt.runs])] };
    } catch (error) { errors.push(`Linkage observation failed: ${error.message}`); }
  }
  if (link?.pr && options.pr && link.pr !== options.pr) { errors.push('Explicit PR conflicts with issue linkage'); link = null; }
  if (options.issue && !link && !options.pr) errors.push('Delivery linkage unavailable');
  let number = errors.length ? null : options.pr ?? link?.pr;
  let pr = null;
  if (number) {
    try { pr = validatePR(await api.pr(repo, number), repo, number, link); }
    catch (error) { errors.push(error.message); }
  }
  if (options.githubOnly) {
    errors.push('Local execution status unavailable (GitHub-only mode)');
    for (const id of link?.runs ?? []) attempts.push({ id, status: 'unavailable', terminal: false, observedAt });
  }
  else {
    try {
      const rows = await api.runs();
      if (!Array.isArray(rows?.runs) || rows.runs.length > 100 || rows.runs.some(row => !row || typeof row.id !== 'string' || !idPattern.test(row.id))) throw new Error('Invalid runs response');
      // Exact dispatch identity or declared numeric issue input, never prompt text.
      const selected = new Set([...(link?.runs ?? []), ...(options.run ? [options.run] : [])]);
      for (const row of rows.runs) {
        if (options.issue && row.codebase_name === repo &&
            (row.platform_type === 'github' && row.worker_platform_id === `${repo}#${options.issue}` ||
             String(row.metadata?.inputs?.issue) === String(options.issue))) selected.add(row.id);
      }
      // The supported adoption relation is explicit linkage, not prompt inference.
      for (let round = 0; round < rows.runs.length; round++) {
        for (const row of rows.runs) {
          if (row.codebase_name === repo && selected.has(row.adopted_from_run_id)) selected.add(row.id);
        }
      }
      // Explicit adoption links retain failures, without reading arbitrary artifact paths.
      for (let round = 0; round < 100 && attempts.length < selected.size; round++) {
        const id = [...selected].find(id => !attempts.some(row => row.id === id));
        try {
          const detail = await api.run(id);
          if (detail.adopted_from_run_id && (typeof detail.adopted_from_run_id !== 'string' || !idPattern.test(detail.adopted_from_run_id))) {
            throw new Error('Invalid adoption identity');
          }
          attempts.push(attempt({ ...detail, current_step_name: detail.current_step_name ?? rows.runs.find(row => row.id === id)?.current_step_name }, id, observedAt));
          if (detail.adopted_from_run_id) {
            selected.add(detail.adopted_from_run_id);
          }
        } catch (error) { errors.push(`${id}: ${error.message}`); attempts.push({ id, status: 'unavailable', observedAt, terminal: false }); }
      }
      if (selected.size > 100) errors.push('Attempt history exceeds bounded observation limit');
    } catch (error) { errors.push(`Local execution status unavailable: ${error.message}`); }
  }
  try {
    for (const comment of managed) {
      for (const historical of historicalAttempts(comment)) {
        if (!link?.runs.includes(historical.id)) throw new Error('Managed attempt snapshot conflicts with linkage');
        const index = attempts.findIndex(row => row.id === historical.id);
        if (index < 0) attempts.push(historical);
        else if (attempts[index].status === 'unavailable' ||
            (attempts[index].lastKnown && attempts[index].observedAt < historical.observedAt)) attempts[index] = historical;
      }
    }
  } catch (error) { errors.push(`Managed attempt observation failed: ${error.message}`); }
  // Runtime absence does not erase independently verified GitHub state.
  const summary = project({ repo, issue: options.issue, link, pr, attempts,
    errors: errors.filter(error => !error.startsWith('Local execution status unavailable')), observedAt });
  summary.blockers = [...new Set([...summary.blockers, ...errors])];
  summary.observationErrors = errors;
  return { summary, link, managed, comments };
}

function safe(text) { return String(text).replace(/[<>`\r\n]/g, ' ').slice(0, 240); }
export function human(summary) {
  return [`${summary.repo}${summary.issue ? ` issue #${summary.issue}` : ''}: ${summary.delivery} (${summary.stage})`,
    summary.pr ? `${summary.pr.url} head ${summary.pr.head}` : 'PR unavailable / not published',
    summary.merge ? `Merged ${summary.merge.at} commit ${summary.merge.sha}` : 'No observed merge evidence',
    `Local: ${summary.localExecution}`,
    ...summary.attempts.map(row => `Attempt ${row.id}: ${row.status}${row.terminal ? ' (authoritative terminal)' : ' (persisted/unverified)'}; ${row.startedAt ?? 'start unavailable'}${row.lastKnown ? `; last known ${row.observedAt}` : ''}`),
    ...summary.blockers.map(text => `Observation/blocker: ${safe(text)}`), summary.acceptance].join('\n');
}

export function commentBody(link, summary) {
  const attempts = summary.attempts.map(row => ({ id: row.id, status: row.status, observedAt: row.observedAt,
    startedAt: row.startedAt ?? null, terminal: row.terminal }));
  return `${marker}\n<!-- linkage:${JSON.stringify(validateLink(link))} -->\n<!-- attempts:${JSON.stringify(attempts)} -->\n## Automation delivery status\n\n${human(summary)}\n\nObserved: ${summary.observedAt}\n`;
}

export async function publish(options, registration, api = client(options)) {
  if (!options.issue) throw new Error('Publishing requires an explicit issue');
  return locked(options.issue, async () => {
    let observation = await observe(options, api);
    const repo = observation.summary.repo;
    let link = registration ? validateLink({ ...registration, repo, issue: options.issue, version: 1 }) : observation.link;
    if (!link) throw new Error('Publishing requires schema-validated registration');
    if (observation.summary.blockers.some(error => !(registration && error === 'Delivery linkage unavailable') &&
        /linkage|comments response|gh read|repository mismatch|Managed attempt/i.test(error))) {
      throw new Error('Cannot publish with unavailable/ambiguous current linkage');
    }
    const prior = observation.link;
    if (prior && (prior.branch !== link.branch || (prior.pr && link.pr && prior.pr !== link.pr))) throw new Error('Conflicting registration');
    link = validateLink({ ...link, pr: link.pr ?? prior?.pr ?? null, runs: [...new Set([...(prior?.runs ?? []), ...link.runs])] });
    link = validateLink({ ...link, runs: [...new Set([...link.runs, ...observation.summary.attempts.map(row => row.id)])] });
    if (link.pr) validatePR(await api.pr(repo, link.pr), repo, link.pr, link);
    await saveReceipt(link);
    // Reread immediately before writing; old attempt updates cannot replace current delivery state.
    observation = await observe({ ...options, pr: link.pr ?? undefined }, api);
    if (link.pr && !observation.summary.pr) throw new Error('Current PR observation failed; no status write');
    const body = commentBody(link, observation.summary);
    const owned = observation.managed.sort((a, b) => a.id - b.id);
    const canonical = owned[0];
    // A published merge is monotonic. Even a lagging/racing GitHub snapshot
    // cannot replace it with an earlier attempt or awaiting-merge result.
    if (owned.some(comment => /\nMerged [^\n]+ commit [a-f0-9]{40}\n/.test(comment.body)) && observation.summary.delivery !== 'merged') {
      throw new Error('PR changed while reading a previously observed merge; retry current GitHub state');
    }
    const stable = text => text?.replace(/\nObserved: [^\n]+\n$/, '\n').replace(/"observedAt":"[^"]+"/g, '"observedAt":"observation"');
    if (stable(canonical?.body) !== stable(body)) await api.write(repo, options.issue, canonical?.id, body);
    // A crash after POST is recovered by the next reread. Duplicates are owned-only
    // and get the same current state, without deleting any human comments.
    for (const duplicate of owned.slice(1)) {
      const retired = `${marker}\n<!-- linkage:${JSON.stringify(link)} -->\nSuperseded status comment; see issue comment ${canonical.id}.\n`;
      if (duplicate.body !== retired) await api.write(repo, options.issue, duplicate.id, retired);
    }
    // A merge can race the write itself. Recheck the immutable terminal evidence
    // and heal the same canonical comment, rather than reporting observer loss.
    if (link.pr && !['merged', 'closed-unmerged'].includes(observation.summary.delivery)) {
      const current = validatePR(await api.pr(repo, link.pr), repo, link.pr, link);
      if (['MERGED', 'CLOSED'].includes(current.state)) {
        const fresh = await observe({ ...options, pr: link.pr }, api);
        if (!['merged', 'closed-unmerged'].includes(fresh.summary.delivery)) throw new Error('PR changed while rereading terminal delivery state');
        const latest = fresh.managed.sort((a, b) => a.id - b.id)[0];
        if (!latest) throw new Error('Published status comment missing after write');
        await api.write(repo, options.issue, latest.id, commentBody(link, fresh.summary));
        observation = fresh;
      }
    }
    return observation.summary;
  });
}

export async function linkedIssueForPR(repo, number, api = client()) {
  const matches = new Set();
  for (const issue of await api.issues(repo)) {
    if (!issue.comments) continue;
    for (const comment of await api.comments(repo, issue.number)) {
      const link = parseComment(comment, repo, issue.number);
      if (link?.pr === number) matches.add(issue.number);
    }
  }
  if (matches.size !== 1) throw new Error('PR issue linkage unavailable or ambiguous; supply explicit issue input');
  return [...matches][0];
}
