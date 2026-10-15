import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const payload = fileURLToPath(new URL('./payload', import.meta.url));
const seed = join(payload, 'seed');

function managed(dir = payload) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (full === seed) continue;
    if (entry.isDirectory()) files.push(...managed(full));
    else files.push(relative(payload, full));
  }
  return files.sort();
}

test('managed payload references factory code only through the {{FACTORY}} token', () => {
  const files = managed();
  assert.ok(files.includes('.github/workflows/merge-gate.yml'));
  assert.ok(files.includes('.archon/workflows/automation/review/scripts/wait-for-review.ts'));
  for (const rel of files) {
    const text = readFileSync(join(payload, rel), 'utf8');
    const bare = text.match(/(?<!\{\{FACTORY\}\}\/)(?<!workflows\/)\bautomation\//g);
    assert.equal(bare, null, `${rel} references automation/ without {{FACTORY}}: ${bare}`);
    assert.doesNotMatch(text, /ui-tests/, `${rel} names the old repository`);
  }
});

test('the status marker names the factory, not a repository', async () => {
  const { marker } = await import('./automation/delivery-status.mjs');
  assert.equal(marker, '<!-- archon-factory-delivery-status:v1 -->');
});
