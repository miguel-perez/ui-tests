import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { client } from './delivery-status.mjs';

const workflow = await readFile(new URL('../payload/.github/workflows/delivery-status.yml', import.meta.url), 'utf8');

function permissionContract(source, fields) {
  // Deliberately fail closed if this small workflow's permission syntax changes.
  assert.equal(source.match(/^\s*permissions:/gm)?.length, 1, 'only one workflow-level permission declaration');
  const block = source.match(/^permissions:\n((?:  [a-z-]+: (?:read|write|none)\n)+)/m)?.[1];
  assert.ok(block, 'explicit workflow permissions');
  const entries = block.trim().split('\n').map(line => line.trim().split(': '));
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'no duplicate permissions');
  const permissions = Object.fromEntries(entries);
  const required = { contents: 'read', 'pull-requests': 'read', issues: 'write' };
  // gh's statusCheckRollup reads both CheckRun and StatusContext resources.
  // GitHub CLI v2.102.0 (the failed runner's version), api/query_builder.go,
  // StatusCheckRollupGraphQLWithoutCountByState also requests CheckRun's
  // checkSuite{workflowRun{workflow{name}}}; private-repo workflow metadata
  // requires Actions read in addition to Checks/Statuses read.
  // Source: https://github.com/cli/cli/blob/v2.102.0/api/query_builder.go
  // Keep this contract local/deterministic; do not fetch upstream during tests.
  assert.ok(fields.includes('statusCheckRollup'), 'exercise the actual client rollup query');
  required.checks = 'read';
  required.statuses = 'read';
  required.actions = 'read';
  for (const [resource, access] of Object.entries(required)) {
    assert.equal(permissions[resource], access, `${resource}: ${access} required by checkout/client resources`);
  }
  assert.deepEqual(permissions, required, 'no extra access; only issue comments are writable');
}

test('workflow permissions cover the actual gh PR rollup query with only narrow issue writes', async t => {
  const root = resolve('.archon/runtime/status-permission-tests');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(root + '/case-');
  const originalPath = process.env.PATH;
  t.after(async () => {
    process.env.PATH = originalPath;
    await rm(directory, { recursive: true, force: true });
  });
  // Capture the production client's arguments without using any GitHub credential.
  await writeFile(resolve(directory, 'gh'), '#!/usr/bin/env node\n' +
    'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n', { mode: 0o700 });
  process.env.PATH = directory + ':' + originalPath;
  const args = await client().pr('owner/repo', 75);
  assert.deepEqual(args.slice(0, 6), ['pr', 'view', '75', '--repo', 'owner/repo', '--json']);
  assert.equal(args.length, 7);
  const fields = args[6].split(',');
  permissionContract(workflow, fields);
  for (const resource of ['checks', 'statuses', 'actions']) {
    assert.throws(() => permissionContract(workflow.replace(`  ${resource}: read\n`, ''), fields),
      new RegExp(`${resource}: read required`), `missing ${resource} must fail`);
    assert.throws(() => permissionContract(workflow.replace(`  ${resource}: read`, `  ${resource}: write`), fields),
      new RegExp(`${resource}: read required`), `${resource} write must fail`);
  }
});

test('reconciliation keeps trusted runtime checkout, ordinary token, and serialized comment writes', () => {
  assert.match(workflow, /^  pull_request_target:\n    types: \[closed\]$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /^concurrency:\n  group: delivery-status-reconciliation\n  cancel-in-progress: false$/m);
  assert.equal(workflow.match(/uses: actions\/checkout@/g)?.length, 1);
  assert.match(workflow, /- uses: actions\/checkout@v4\n        with:\n          ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n          persist-credentials: false\n/);
  assert.match(workflow, /^          GH_TOKEN: \$\{\{ github\.token \}\}$/m);
  assert.doesNotMatch(workflow, /secrets\.|pull_request\.head|github\.head_ref/);
  assert.match(workflow, /^        run: node \{\{FACTORY\}\}\/automation\/reconcile-status\.mjs$/m);
});
