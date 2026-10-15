#!/usr/bin/env node
// Trusted default-branch entrypoint. It never reads event-provided code/paths.
import { client, trustedComment, parseComment, publish } from './delivery-status.mjs';

export async function reconcile(repo, api = client()) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) throw new Error('Invalid repository');
  const failures = [];
  for (const issue of (await api.issues(repo)).filter(issue => issue.comments > 0)) {
    try {
      const comments = await api.comments(repo, issue.number);
      const managed = comments.filter(comment => trustedComment(comment, repo));
      if (!managed.length) continue;
      for (const comment of managed) parseComment(comment, repo, issue.number);
      await publish({ repo, issue: issue.number, githubOnly: true }, null, api);
    } catch (error) { failures.push(`#${issue.number}: ${error.message}`); }
  }
  if (failures.length) throw new Error(`Reconciliation failed for ${failures.join('; ')}`);
}
if (process.argv[1]?.endsWith('/reconcile-status.mjs')) {
  try { await reconcile(process.env.GITHUB_REPOSITORY); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
