import { execFileSync } from 'node:child_process';
try {
  const result = execFileSync('node', ['{{FACTORY}}/automation/workflow-status.mjs'], { encoding: 'utf8', timeout: 120000 });
  console.log(result.trim());
} catch {
  console.log(JSON.stringify({ state: 'unavailable', reason: 'Status publication failed; inspect automation:status or explicitly register recovery.' }));
}
