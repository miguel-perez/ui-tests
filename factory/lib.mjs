import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// Consumer-committed record of the managed paths the last install wrote, so renames can be cleaned up.
export const MANIFEST = '.archon/factory-managed.json';

export function managedPaths() {
  return walk(payloadDir).sort();
}

export function manifestText(paths) {
  return JSON.stringify([...paths].sort(), null, 2) + '\n';
}

// Returns the manifest's relative paths, null when absent, or undefined when unreadable.
export function readManifest(root) {
  const path = join(root, MANIFEST);
  if (!existsSync(path)) return null;
  try {
    const paths = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(paths) && paths.every(item => typeof item === 'string') ? paths : undefined;
  } catch {
    return undefined;
  }
}

// A manifest entry may only name a file inside the consumer root.
export function safeRelative(rel) {
  return rel !== '' && !isAbsolute(rel) && normalize(rel) === rel && !rel.split(/[\\/]/).includes('..');
}

export function render(text, vars) {
  return text.replace(/\{\{([A-Z]+)\}\}/g, (match, key) => {
    if (!(key in vars)) throw new Error(`Unknown template variable ${match}`);
    return vars[key];
  });
}

// { name, fromRemote }: owner/name from origin, else the directory name with fromRemote false.
export function resolveRepoName(root) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/);
    if (match) return { name: match[1], fromRemote: true };
  } catch {}
  return { name: basename(root), fromRemote: false };
}

export function repoName(root) {
  return resolveRepoName(root).name;
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

// True when metaUrl is the entry script; Node resolves symlinks for the main module, so argv[1] must too.
export function isMain(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  let entry = resolve(argv1);
  try { entry = realpathSync(entry); } catch {}
  return metaUrl === pathToFileURL(entry).href;
}
