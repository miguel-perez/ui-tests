import { execFileSync } from 'node:child_process';

const number = process.env.INPUTS_NUMBER ?? '';
const branch = process.env.INPUTS_BRANCH ?? '';
if (!/^[1-9][0-9]*$/.test(number) || !branch) {
  throw new Error('The review target must name a pull request number and branch.');
}
const current = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (current !== branch) {
  throw new Error(`Review branch mismatch: expected ${branch}, observed ${current}.`);
}
const output = execFileSync('node', [
  '{{FACTORY}}/automation/review-state.mjs', 'wait', '--pr', number, '--timeout-seconds', '1800',
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 1830000 });
const state = JSON.parse(output);
if (!['approved', 'fix', 'merged', 'review'].includes(state.state)) {
  throw new Error('The deterministic review check returned an unsupported state.');
}
console.log(JSON.stringify(state));
