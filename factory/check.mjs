#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST, cliPrefix, isMain, managedPaths, manifestText, payloadDir, readManifest, render, requiredScripts, safeRelative, templateVars, topLevel } from './lib.mjs';

export function check({ root = topLevel(), prefix = cliPrefix([], root) } = {}) {
  const vars = templateVars(root, prefix);
  const problems = [];
  const managed = managedPaths();
  for (const rel of managed) {
    const target = join(root, rel);
    if (!existsSync(target)) { problems.push(`missing: ${rel}`); continue; }
    const expected = render(readFileSync(join(payloadDir, rel), 'utf8'), vars);
    if (readFileSync(target, 'utf8') !== expected) problems.push(`drifted: ${rel}`);
  }
  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath)) problems.push(`missing: ${MANIFEST}`);
  else if (readFileSync(manifestPath, 'utf8') !== manifestText(managed)) problems.push(`drifted: ${MANIFEST}`);
  const current = new Set(managed);
  for (const rel of readManifest(root) || []) {
    if (!current.has(rel) && safeRelative(rel) && existsSync(join(root, rel))) problems.push(`stale: ${rel}`);
  }
  const pkgPath = join(root, 'package.json');
  const scripts = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}) : {};
  for (const name of Object.keys(requiredScripts(vars.FACTORY))) {
    if (!(name in scripts)) problems.push(`missing npm script: ${name}`);
  }
  return problems;
}

if (isMain(import.meta.url)) {
  const root = topLevel();
  const problems = check({ root, prefix: cliPrefix(process.argv.slice(2), root) });
  if (problems.length) {
    console.error('Factory root copies are out of date. Edit the files under the factory payload, run `node <prefix>/install.mjs`, and commit:');
    for (const problem of problems) console.error('  ' + problem);
    process.exit(1);
  }
  console.log('Factory root copies match the payload.');
}
