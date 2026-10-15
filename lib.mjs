import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const factoryDir = dirname(fileURLToPath(import.meta.url));
export const payloadDir = join(factoryDir, 'payload');
export const seedDir = join(payloadDir, 'seed');

export function topLevel(cwd = process.cwd()) {
  const out = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return resolve(out);
}

export function walk(dir, base = dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (full === seedDir) continue;
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

export function render(text, vars) {
  return text.replace(/\{\{([A-Z]+)\}\}/g, (match, key) => {
    if (!(key in vars)) throw new Error(`Unknown template variable ${match}`);
    return vars[key];
  });
}

export function repoName(root) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/);
    if (match) return match[1];
  } catch {}
  return basename(root);
}

export function templateVars(root, prefix) {
  return { FACTORY: prefix || '.', REPO: repoName(root), ROOT: root };
}

export function requiredScripts(factory) {
  const runtime = `python3 ${factory}/scripts/archon-runtime.py`;
  return {
    'automation:build': `${runtime} build`,
    'automation:verify-sol': `python3 ${factory}/scripts/verify-archon-sol.py`,
    'automation:verify-serve': `python3 ${factory}/scripts/verify-archon-serve.py`,
    'automation:deliver': `${runtime} exec workflow run autonomous-delivery`,
    'automation:repair': `${runtime} exec workflow run autonomous-pr-retry`,
    'automation:status': `node ${factory}/automation/status.mjs`,
    'automation:start': `bash ${factory}/scripts/start-archon.sh`,
    'automation:stop': `bash ${factory}/scripts/stop-archon.sh`,
    'factory:check': `node ${factory}/check.mjs`,
    'factory:test': `npm --prefix ${factory} run validate`,
  };
}

export function cliPrefix(argv, root) {
  const index = argv.indexOf('--prefix');
  if (index !== -1) return argv[index + 1] ?? '';
  const rel = relative(root, factoryDir);
  return rel.startsWith('..') ? 'factory' : rel;
}
