#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { MANIFEST, cliPrefix, isMain, managedPaths, manifestText, payloadDir, readManifest, render, requiredScripts, resolveRepoName, safeRelative, seedDir, templateVars, topLevel, walk } from './lib.mjs';

const PRUNABLE = ['.archon/workflows', '.github/workflows'];

export function install({ root = topLevel(), prefix = cliPrefix([], root), log = console.log } = {}) {
  const vars = templateVars(root, prefix);
  const repo = resolveRepoName(root);
  if (!repo.fromRemote) log(`warning: no usable origin remote; {{REPO}} falls back to "${repo.name}". Run \`git remote add origin git@github.com:OWNER/NAME.git\` and reinstall.`);
  const report = { written: [], removed: [], unchanged: [], seeded: [], skipped: [], ignores: [], scripts: [] };
  const managed = managedPaths();
  const previous = readManifest(root) || [];
  for (const rel of managed) {
    const target = join(root, rel);
    const content = render(readFileSync(join(payloadDir, rel), 'utf8'), vars);
    if (existsSync(target) && readFileSync(target, 'utf8') === content) { report.unchanged.push(rel); continue; }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    report.written.push(rel);
  }
  const current = new Set(managed);
  for (const rel of [...new Set(previous)].sort()) {
    if (current.has(rel) || !safeRelative(rel) || !existsSync(join(root, rel))) continue;
    unlinkSync(join(root, rel));
    report.removed.push(rel);
    for (let dir = dirname(rel); PRUNABLE.some(base => dir.startsWith(base + '/')); dir = dirname(dir)) {
      if (readdirSync(join(root, dir)).length) break;
      rmdirSync(join(root, dir));
    }
  }
  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText(managed)) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, manifestText(managed));
    report.written.push(MANIFEST);
  }
  for (const rel of walk(seedDir)) {
    if (rel === 'gitignore.lines') continue;
    const target = join(root, rel);
    if (existsSync(target)) { report.skipped.push(rel); continue; }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, render(readFileSync(join(seedDir, rel), 'utf8'), vars));
    report.seeded.push(rel);
  }
  const ignorePath = join(root, '.gitignore');
  const existing = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  const present = new Set(existing.split('\n').map(line => line.trim()));
  const wanted = readFileSync(join(seedDir, 'gitignore.lines'), 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
  report.ignores = wanted.filter(line => !present.has(line));
  if (report.ignores.length) {
    const head = existing === '' || existing.endsWith('\n') ? existing : existing + '\n';
    writeFileSync(ignorePath, head + report.ignores.join('\n') + '\n');
  }
  const pkgPath = join(root, 'package.json');
  const fresh = !existsSync(pkgPath);
  const pkg = fresh ? { name: basename(root), version: '0.0.0', private: true, type: 'module', scripts: {} } : JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.scripts ??= {};
  for (const [name, command] of Object.entries(requiredScripts(vars.FACTORY))) {
    if (!(name in pkg.scripts)) { pkg.scripts[name] = command; report.scripts.push(name); }
  }
  if (fresh || report.scripts.length) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  for (const [kind, items] of Object.entries(report)) if (items.length) log(`${kind}: ${items.join(', ')}`);
  return report;
}

if (isMain(import.meta.url)) {
  const root = topLevel();
  install({ root, prefix: cliPrefix(process.argv.slice(2), root) });
}
