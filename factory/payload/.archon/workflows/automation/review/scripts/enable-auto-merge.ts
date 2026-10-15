import { execFileSync } from 'node:child_process';

const number = process.env.INPUTS_NUMBER ?? '';
const branch = process.env.INPUTS_BRANCH ?? '';
if (!/^[1-9][0-9]*$/.test(number) || !branch) {
  throw new Error('The merge target must name a pull request number and branch.');
}
const current = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
if (current !== branch) {
  throw new Error(`Merge branch mismatch: expected ${branch}, observed ${current}.`);
}
const output = execFileSync('node', [
  '{{FACTORY}}/automation/review-state.mjs', 'merge', '--pr', number,
], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 110000 });
console.log(output.trim());
