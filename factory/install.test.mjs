import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { managedPaths, render, requiredScripts, topLevel, repoName } from './lib.mjs';
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
  assert.deepEqual([report.written, report.removed, report.seeded, report.migrated, report.ignores, report.scripts], [[], [], [], [], [], []]);
  assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
});

test('seeds, customized scripts and existing ignore lines are preserved', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  writeFileSync(join(root, '.archon/config.yaml'), 'assistant: claude\n');
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n/docs/\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', scripts: { validate: 'true', 'automation:status': 'custom' } }));
  const report = install({ root, prefix: 'factory', log() {} });
  const config = readFileSync(join(root, '.archon/config.yaml'), 'utf8');
  assert.ok(config.startsWith('assistant: claude\n'));
  assert.match(config, /^aliases:\n  '@implementer':\n    provider: opencode\n    model: \S+$/m);
  assert.ok(report.skipped.includes('.archon/config.yaml'));
  assert.deepEqual(report.migrated, ['.archon/config.yaml']);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, []);
  assert.equal(readFileSync(join(root, '.archon/config.yaml'), 'utf8'), config);
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

test('install records the managed set and removes paths the payload no longer ships', t => {
  const root = consumer(t);
  const first = install({ root, prefix: 'factory', log() {} });
  assert.deepEqual(first.removed, []);
  const manifestPath = join(root, '.archon/factory-managed.json');
  const managed = managedPaths();
  assert.deepEqual(managed, [...managed].sort());
  assert.equal(readFileSync(manifestPath, 'utf8'), JSON.stringify(managed, null, 2) + '\n');
  // Simulate a payload rename: the previous install shipped a file the payload no longer has.
  const old = '.archon/workflows/renamed/old-step.yaml';
  mkdirSync(join(root, '.archon/workflows/renamed'), { recursive: true });
  writeFileSync(join(root, old), 'stale\n');
  writeFileSync(manifestPath, JSON.stringify([...managed, old, 'gone-already.yml'].sort(), null, 2) + '\n');
  const logged = [];
  const report = install({ root, prefix: 'factory', log: line => logged.push(line) });
  assert.deepEqual(report.removed, [old]);
  assert.ok(!existsSync(join(root, old)));
  assert.ok(!existsSync(join(root, '.archon/workflows/renamed')));
  assert.ok(existsSync(join(root, '.archon/workflows')));
  assert.ok(logged.includes(`removed: ${old}`));
  assert.equal(readFileSync(manifestPath, 'utf8'), JSON.stringify(managed, null, 2) + '\n');
});

test('manifest entries outside the consumer root are never deleted', t => {
  const root = consumer(t);
  install({ root, prefix: 'factory', log() {} });
  const outside = join(root, '..', `outside-${process.pid}.txt`);
  writeFileSync(outside, 'keep\n');
  t.after(() => rmSync(outside, { force: true }));
  writeFileSync(join(root, '.archon/factory-managed.json'), JSON.stringify([`../outside-${process.pid}.txt`, outside]));
  const report = install({ root, prefix: 'factory', log() {} });
  assert.deepEqual(report.removed, []);
  assert.ok(existsSync(outside));
});

test('install warns when {{REPO}} falls back to the directory name', t => {
  const root = consumer(t);
  execFileSync('git', ['-C', root, 'remote', 'remove', 'origin']);
  const logged = [];
  install({ root, prefix: 'factory', log: line => logged.push(line) });
  const fallback = root.split('/').pop();
  const warning = logged.find(line => line.startsWith('warning:'));
  assert.ok(warning, 'expected a fallback warning');
  assert.match(warning, new RegExp(`"${fallback}"`));
  assert.match(warning, /git remote add origin/);
  const quiet = [];
  install({ root: consumer(t), prefix: 'factory', log: line => quiet.push(line) });
  assert.ok(!quiet.some(line => line.startsWith('warning:')));
});

test('an unparsable manifest aborts install before anything changes', t => {
  const root = consumer(t);
  install({ root, prefix: 'factory', log() {} });
  const manifestPath = join(root, '.archon/factory-managed.json');
  const stale = '.archon/workflows/renamed/old-step.yaml';
  mkdirSync(join(root, '.archon/workflows/renamed'), { recursive: true });
  writeFileSync(join(root, stale), 'stale\n');
  writeFileSync(manifestPath, '{ not json');
  const gate = join(root, '.github/workflows/merge-gate.yml');
  writeFileSync(gate, 'edited\n');
  assert.throws(() => install({ root, prefix: 'factory', log() {} }), /\.archon\/factory-managed\.json/);
  assert.equal(readFileSync(manifestPath, 'utf8'), '{ not json');
  assert.equal(readFileSync(gate, 'utf8'), 'edited\n');
  assert.ok(existsSync(join(root, stale)));
  writeFileSync(manifestPath, JSON.stringify({ not: 'a list' }));
  assert.throws(() => install({ root, prefix: 'factory', log() {} }), /factory-managed\.json/);
});

test('stale entries reached through a symlinked parent outside the root are skipped', t => {
  const root = consumer(t);
  install({ root, prefix: 'factory', log() {} });
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'factory-outside-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'victim.yml'), 'keep\n');
  symlinkSync(outside, join(root, '.github/workflows/linked'));
  const manifestPath = join(root, '.archon/factory-managed.json');
  const entry = '.github/workflows/linked/victim.yml';
  writeFileSync(manifestPath, JSON.stringify([...managedPaths(), entry].sort()));
  const report = install({ root, prefix: 'factory', log() {} });
  assert.deepEqual(report.removed, []);
  assert.ok(report.skipped.includes(entry));
  assert.equal(readFileSync(join(outside, 'victim.yml'), 'utf8'), 'keep\n');
});

test('stale entries that are directories are skipped, not removed', t => {
  const root = consumer(t);
  install({ root, prefix: 'factory', log() {} });
  const entry = '.archon/workflows/now-a-dir';
  mkdirSync(join(root, entry, 'inner'), { recursive: true });
  writeFileSync(join(root, entry, 'inner/file.txt'), 'keep\n');
  writeFileSync(join(root, '.archon/factory-managed.json'), JSON.stringify([...managedPaths(), entry].sort()));
  const report = install({ root, prefix: 'factory', log() {} });
  assert.deepEqual(report.removed, []);
  assert.ok(report.skipped.includes(entry));
  assert.ok(existsSync(join(root, entry, 'inner/file.txt')));
});


test('an existing aliases block gains @implementer without a duplicate key; a config that has it is untouched', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  const withAliases = "assistant: opencode\naliases:\n  '@cheap':\n    provider: opencode\n    model: x/y\n";
  writeFileSync(join(root, '.archon/config.yaml'), withAliases);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, ['.archon/config.yaml']);
  const config = readFileSync(join(root, '.archon/config.yaml'), 'utf8');
  assert.equal(config.match(/^aliases:$/gm).length, 1);
  assert.match(config, /^aliases:\n  '@implementer':\n    provider: opencode\n    model: \S+\n  '@cheap':\n/m);
  const pinned = "assistant: opencode\naliases:\n  '@implementer':\n    provider: opencode\n    model: mine/model\n";
  writeFileSync(join(root, '.archon/config.yaml'), pinned);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, []);
  assert.equal(readFileSync(join(root, '.archon/config.yaml'), 'utf8'), pinned);
});

test('aliases with a trailing comment are extended in place; an inline mapping is left alone with a warning', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  const commented = "assistant: opencode\naliases: # local models\n  '@cheap':\n    provider: opencode\n    model: x/y\ntiers:\n  small:\n    provider: opencode\n    model: a/b\n";
  writeFileSync(join(root, '.archon/config.yaml'), commented);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, ['.archon/config.yaml']);
  const config = readFileSync(join(root, '.archon/config.yaml'), 'utf8');
  assert.equal(config.match(/^aliases:/gm).length, 1);
  assert.match(config, /^aliases: # local models\n  '@implementer':\n    provider: opencode\n    model: \S+\n  '@cheap':\n/m);
  assert.match(config, /^tiers:\n  small:\n/m);
  const inline = "assistant: opencode\naliases: { '@cheap': { provider: opencode, model: x/y } }\n";
  writeFileSync(join(root, '.archon/config.yaml'), inline);
  const warned = [];
  const report = install({ root, prefix: 'factory', log: line => warned.push(line) });
  assert.deepEqual(report.migrated, []);
  assert.equal(report.warnings.length, 1);
  assert.ok(warned.some(line => line.includes('@implementer')));
  assert.equal(readFileSync(join(root, '.archon/config.yaml'), 'utf8'), inline);
});

test('an @implementer key outside the root aliases mapping does not count as migrated', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  const elsewhere = "assistant: opencode\n# '@implementer': mentioned in a comment\nassistants:\n  opencode:\n    model: openai/gpt-6.1-sol\n    '@implementer': not-an-alias\n";
  writeFileSync(join(root, '.archon/config.yaml'), elsewhere);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, ['.archon/config.yaml']);
  const config = readFileSync(join(root, '.archon/config.yaml'), 'utf8');
  assert.ok(config.startsWith(elsewhere));
  assert.match(config, /^aliases:\n  '@implementer':\n    provider: opencode\n    model: \S+$/m);
});

test('an aliases heading that ends the file without a newline still gets a well-formed entry', t => {
  const root = consumer(t);
  mkdirSync(join(root, '.archon'), { recursive: true });
  writeFileSync(join(root, '.archon/config.yaml'), 'assistant: opencode\naliases:');
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, ['.archon/config.yaml']);
  const config = readFileSync(join(root, '.archon/config.yaml'), 'utf8');
  assert.match(config, /^assistant: opencode\naliases:\n  '@implementer':\n    provider: opencode\n    model: \S+\n$/);
  assert.deepEqual(install({ root, prefix: 'factory', log() {} }).migrated, []);
});
