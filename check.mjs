#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cliPrefix, payloadDir, render, requiredScripts, templateVars, topLevel, walk } from './lib.mjs';

export function check({ root = topLevel(), prefix = cliPrefix([], root) } = {}) {
  const vars = templateVars(root, prefix);
  const problems = [];
  for (const rel of walk(payloadDir)) {
    const target = join(root, rel);
    if (!existsSync(target)) { problems.push(`missing: ${rel}`); continue; }
    const expected = render(readFileSync(join(payloadDir, rel), 'utf8'), vars);
    if (readFileSync(target, 'utf8') !== expected) problems.push(`drifted: ${rel}`);
  }
  const pkgPath = join(root, 'package.json');
  const scripts = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}) : {};
  for (const name of Object.keys(requiredScripts(vars.FACTORY))) {
    if (!(name in scripts)) problems.push(`missing npm script: ${name}`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = topLevel();
  const problems = check({ root, prefix: cliPrefix(process.argv.slice(2), root) });
  if (problems.length) {
    console.error('Factory root copies are out of date. Edit the files under the factory payload, run `node <prefix>/install.mjs`, and commit:');
    for (const problem of problems) console.error('  ' + problem);
    process.exit(1);
  }
  console.log('Factory root copies match the payload.');
}
