import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { render, requiredScripts, topLevel, repoName } from './lib.mjs';
import { install } from './install.mjs';

function consumer(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'factory-consumer-')));
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:owner/name.git']);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('render substitutes known tokens and rejects unknown ones', () => {
  assert.equal(render('a {{FACTORY}}/b {{REPO}}', { FACTORY: 'factory', REPO: 'o/n' }), 'a factory/b o/n');
  assert.throws(() => render('{{NOPE}}', { FACTORY: 'x' }), /Unknown template variable \{\{NOPE\}\}/);
});

test('topLevel and repoName read the consumer git repository from any subdirectory', t => {
  const root = consumer(t);
  mkdirSync(join(root, 'deep/er'), { recursive: true });
  assert.equal(topLevel(join(root, 'deep/er')), root);
  assert.equal(repoName(root), 'owner/name');
});

test('fresh install writes rendered managed files, seeds, ignores and scripts', t => {
  const root = consumer(t);
  const report = install({ root, prefix: 'factory', log() {} });
  const gate = readFileSync(join(root, '.github/workflows/merge-gate.yml'), 'utf8');
  assert.match(gate, /run: python3 factory\/automation\/merge_gate\.py/);
  assert.doesNotMatch(gate, /\{\{[A-Z]+\}\}/);
  const wait = readFileSync(join(root, '.archon/workflows/automation/review/scripts/wait-for-review.ts'), 'utf8');
  assert.match(wait, /'factory\/automation\/review-state\.mjs'/);
  assert.ok(existsSync(join(root, '.coderabbit.yaml')));
  assert.ok(existsSync(join(root, '.archon/config.yaml')));
  const opencode = JSON.parse(readFileSync(join(root, 'opencode.json'), 'utf8'));
  assert.ok(Object.keys(opencode.permission.external_directory).includes('~/.archon/workspaces/owner/name/artifacts/**'));
  assert.ok(Object.keys(opencode.permission.external_directory).includes(`${root}/artifacts/**`));
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\/\.archon\/runtime\/$/m);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['automation:status'], 'node factory/automation/status.mjs');
  assert.equal(pkg.scripts['factory:check'], 'node factory/check.mjs');
  assert.deepEqual(Object.keys(requiredScripts('factory')).sort(), report.scripts.sort());
  assert.ok(report.written.includes('.github/workflows/merge-gate.yml'));
  assert.ok(report.seeded.includes('AGENTS.md'));
  assert.ok(!report.written.includes('seed/AGENTS.md'));
});

test('a second install changes nothing', t => {
  const root = consumer(t);
  install({ root, prefix: 'factory', log() {} });
  const before = readFileSync(join(root, 'package.json'), 'utf8');
  const report = install({ root, prefix: 'factory', log() {} });
  assert.deepEqual([report.written, report.seeded, report.ignores, report.scripts], [[], [], [], []]);
  assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
});

test('seeds, customized scripts and existing ignore lines are preserved', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  writeFileSync(join(root, '.archon/config.yaml'), 'assistant: claude\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n/docs/\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', scripts: { validate: 'true', 'automation:status': 'custom' } }));
  const report = install({ root, prefix: 'factory', log() {} });
  assert.equal(readFileSync(join(root, '.archon/config.yaml'), 'utf8'), 'assistant: claude\n');
  assert.ok(report.skipped.includes('.archon/config.yaml'));
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['automation:status'], 'custom');
  assert.equal(pkg.scripts.validate, 'true');
  assert.equal(pkg.scripts['automation:build'], 'python3 factory/scripts/archon-runtime.py build');
  const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
  assert.equal(ignore.match(/^node_modules\/$/gm).length, 1);
  assert.match(ignore, /^\/docs\/$/m);
});

test('install run from a subdirectory still targets the git top level', t => {
  const root = consumer(t);
  mkdirSync(join(root, 'factory'));
  const previous = process.cwd();
  process.chdir(join(root, 'factory'));
  t.after(() => process.chdir(previous));
  install({ prefix: 'factory', log() {} });
  assert.ok(existsSync(join(root, '.coderabbit.yaml')));
  assert.ok(!existsSync(join(root, 'factory/.coderabbit.yaml')));
});

test('an empty prefix renders factory paths as ./', t => {
  const root = consumer(t);
  install({ root, prefix: '', log() {} });
  assert.match(readFileSync(join(root, '.github/workflows/merge-gate.yml'), 'utf8'), /python3 \.\/automation\/merge_gate\.py/);
});
