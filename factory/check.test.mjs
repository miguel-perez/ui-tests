import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { install } from './install.mjs';
import { check } from './check.mjs';
import { factoryDir, managedPaths } from './lib.mjs';

function installed(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'factory-check-')));
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  install({ root, prefix: 'factory', log() {} });
  return root;
}

test('a freshly installed consumer passes', t => {
  assert.deepEqual(check({ root: installed(t), prefix: 'factory' }), []);
});

test('drifted, missing files and missing scripts are each reported', t => {
  const root = installed(t);
  writeFileSync(join(root, '.coderabbit.yaml'), 'language: fr\n');
  unlinkSync(join(root, '.github/workflows/review-event.yml'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  delete pkg.scripts['automation:stop'];
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  const problems = check({ root, prefix: 'factory' });
  assert.deepEqual(problems.sort(), [
    'drifted: .coderabbit.yaml',
    'missing npm script: automation:stop',
    'missing: .github/workflows/review-event.yml',
  ]);
});

test('seeded files are consumer-owned and never reported', t => {
  const root = installed(t);
  writeFileSync(join(root, '.archon/config.yaml'), 'assistant: claude\n');
  writeFileSync(join(root, 'AGENTS.md'), '# mine\n');
  assert.deepEqual(check({ root, prefix: 'factory' }), []);
});

test('the CLI exits 1 and prints problems', t => {
  const root = installed(t);
  writeFileSync(join(root, '.coderabbit.yaml'), 'x\n');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), '--prefix', 'factory'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /drifted: \.coderabbit\.yaml/);
  install({ root, prefix: 'factory', log() {} });
  const ok = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), '--prefix', 'factory'], { cwd: root, encoding: 'utf8' });
  assert.equal(ok.status, 0);
});

test('the managed manifest is required, must match the payload, and flags stale leftovers', t => {
  const root = installed(t);
  const manifestPath = join(root, '.archon/factory-managed.json');
  unlinkSync(manifestPath);
  assert.deepEqual(check({ root, prefix: 'factory' }), ['missing: .archon/factory-managed.json']);
  writeFileSync(manifestPath, JSON.stringify(managedPaths()));
  assert.deepEqual(check({ root, prefix: 'factory' }), ['drifted: .archon/factory-managed.json']);
  const old = '.github/workflows/retired.yml';
  writeFileSync(manifestPath, JSON.stringify([...managedPaths(), old, '.archon/workflows/absent.yaml'].sort(), null, 2) + '\n');
  writeFileSync(join(root, old), 'name: retired\n');
  assert.deepEqual(check({ root, prefix: 'factory' }).sort(), ['drifted: .archon/factory-managed.json', `stale: ${old}`]);
  writeFileSync(manifestPath, 'not json');
  assert.deepEqual(check({ root, prefix: 'factory' }), ['drifted: .archon/factory-managed.json']);
});

test('the CLI still runs when invoked through a symlinked factory directory', t => {
  const root = installed(t);
  writeFileSync(join(root, '.coderabbit.yaml'), 'x\n');
  const links = mkdtempSync(join(tmpdir(), 'factory-link-'));
  t.after(() => rmSync(links, { recursive: true, force: true }));
  symlinkSync(factoryDir, join(links, 'factory'), 'dir');
  const result = spawnSync(process.execPath, [join(links, 'factory/check.mjs'), '--prefix', 'factory'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /drifted: \.coderabbit\.yaml/);
});
