#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { MANIFEST, cliPrefix, isMain, managedPaths, manifestText, payloadDir, readManifest, render, requiredScripts, resolveRepoName, safeRelative, seedDir, templateVars, topLevel, walk } from './lib.mjs';

const PRUNABLE = ['.archon/workflows', '.github/workflows'];

function insideRoot(realRoot, path) {
  return path === realRoot || path.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep);
}

export function install({ root = topLevel(), prefix = cliPrefix([], root), log = console.log } = {}) {
  const vars = templateVars(root, prefix);
  const repo = resolveRepoName(root);
  if (!repo.fromRemote) log(`warning: no usable origin remote; {{REPO}} falls back to "${repo.name}". Run \`git remote add origin git@github.com:OWNER/NAME.git\` and reinstall.`);
  const previous = readManifest(root);
  if (previous === undefined) throw new Error(`${MANIFEST} is not a JSON list of paths; repair or delete it, then reinstall.`);
  const report = { written: [], removed: [], unchanged: [], seeded: [], skipped: [], migrated: [], warnings: [], ignores: [], scripts: [] };
  const managed = managedPaths();
  for (const rel of managed) {
    const target = join(root, rel);
    const content = render(readFileSync(join(payloadDir, rel), 'utf8'), vars);
    if (existsSync(target) && readFileSync(target, 'utf8') === content) { report.unchanged.push(rel); continue; }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    report.written.push(rel);
  }
  const current = new Set(managed);
  const realRoot = realpathSync(root);
  for (const rel of [...new Set(previous || [])].sort()) {
    if (current.has(rel) || !safeRelative(rel) || !existsSync(join(root, rel))) continue;
    // Text checks cannot see symlinks: the real parent must stay inside the real root, and only files are removed.
    if (!insideRoot(realRoot, realpathSync(dirname(join(root, rel)))) || lstatSync(join(root, rel)).isDirectory()) {
      report.skipped.push(rel);
      continue;
    }
    unlinkSync(join(root, rel));
    report.removed.push(rel);
    for (let dir = dirname(rel); PRUNABLE.some(base => dir.startsWith(base + '/')); dir = dirname(dir)) {
      if (!lstatSync(join(root, dir)).isDirectory() || readdirSync(join(root, dir)).length) break;
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
  // The managed workflows bind '@implementer', and Archon throws on an undefined alias, so an
  // existing config gains the alias without losing anything it already says. Only the root-level
  // `aliases` mapping counts: a key elsewhere, or in a comment, does not define an alias.
  const configRel = '.archon/config.yaml';
  if (report.skipped.includes(configRel)) {
    const configPath = join(root, configRel);
    const text = readFileSync(configPath, 'utf8');
    const seed = render(readFileSync(join(seedDir, configRel), 'utf8'), vars);
    const block = seed.slice(seed.indexOf('# Code-writing nodes'));
    const entry = block.slice(block.indexOf("  '@implementer':"));
    const defined = /^[ \t]+['"]?@implementer['"]?[ \t]*:/m;
    const heading = /^aliases:[ \t]*([^\n]*)$/m.exec(text);
    if (!heading) {
      writeFileSync(configPath, text.replace(/\n*$/, '\n\n') + block);
      report.migrated.push(configRel);
    } else if (/^\{/.test(heading[1].trim())) {
      // An inline mapping cannot be extended by text; the alias has to be added by hand.
      const inline = text.slice(heading.index).split('\n')[0];
      if (!/['"]?@implementer['"]?[ \t]*:/.test(inline)) {
        report.warnings.push(`${configRel}: add the '@implementer' alias to the inline aliases mapping by hand; the managed workflows bind it.`);
        log(`warning: ${report.warnings.at(-1)}`);
      }
    } else {
      const bodyStart = heading.index + heading[0].length + 1;
      const rest = text.slice(bodyStart);
      const next = /^(?![ \t#\n])/m.exec(rest);
      const body = next ? rest.slice(0, next.index) : rest;
      if (!defined.test(body)) {
        writeFileSync(configPath, text.slice(0, bodyStart) + entry + rest);
        report.migrated.push(configRel);
      }
    }
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
