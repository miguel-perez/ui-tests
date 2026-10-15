#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cliPrefix, payloadDir, render, requiredScripts, seedDir, templateVars, topLevel, walk } from './lib.mjs';

export function install({ root = topLevel(), prefix = cliPrefix([], root), log = console.log } = {}) {
  const vars = templateVars(root, prefix);
  const report = { written: [], unchanged: [], seeded: [], skipped: [], ignores: [], scripts: [] };
  for (const rel of walk(payloadDir)) {
    const target = join(root, rel);
    const content = render(readFileSync(join(payloadDir, rel), 'utf8'), vars);
    if (existsSync(target) && readFileSync(target, 'utf8') === content) { report.unchanged.push(rel); continue; }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    report.written.push(rel);
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = topLevel();
  install({ root, prefix: cliPrefix(process.argv.slice(2), root) });
}
