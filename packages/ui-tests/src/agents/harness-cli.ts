import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { Harness, ToolSpec } from './model.ts'
import { diffFiles, fingerprintFiles, makeTempWorkspace, removeWorkspace, workspaceAt } from './workspace.ts'

/** How long one command may run before it is stopped. */
export const CLI_TIMEOUT_MS = 120_000
/** How much of stdout and of stderr the agent is shown, each. */
export const CLI_OUTPUT_CAP = 64 * 1024

/** Environment names that may hold a secret; none of them reaches the command the agent runs. */
const SECRET = /SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|API_?KEY|PRIVATE|AUTH|COOKIE|SESSION|DATABASE_URL|_KEY$|^ANTHROPIC_|^UI_TESTS_|^VERCEL_|^GITHUB_|^AWS_|^NPM_CONFIG_/i

/** The environment without anything that looks like a secret or points at this machine's own ui-tests data. */
export function strippedEnv(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) if (value !== undefined && !SECRET.test(name)) kept[name] = value
  return kept
}

/** Splits a command line into words, honouring single and double quotes and backslashes; no shell features. */
export function splitWords(line: string): string[] {
  const words: string[] = []
  let word = '', quote: string | undefined, started = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = undefined
      else if (c === '\\' && quote === '"' && i + 1 < line.length) word += line[++i]
      else word += c
    } else if (c === '"' || c === "'") { quote = c; started = true }
    else if (c === '\\' && i + 1 < line.length) { word += line[++i]; started = true }
    else if (/\s/.test(c)) { if (started) { words.push(word); word = ''; started = false } }
    else { word += c; started = true }
  }
  if (started) words.push(word)
  return words
}

const oneLine = (text: string) => text.split('\n').map(l => l.trim()).find(Boolean)?.slice(0, 160)

function capped(text: string, cap: number) {
  return text.length > cap ? `${text.slice(0, cap)}\n[output cut at ${cap} characters]` : text
}

export type CliHarnessOptions = {
  /** Where relative paths in the configured command (`./bin.mjs`) point; the project directory. Default: the process's. */
  cwd?: string
  timeoutMs?: number
  outputCap?: number
  env?: Record<string, string | undefined>
}

/**
 * The cli harness: the agent gets the scenario, a fresh temporary working directory per trial, and one tool, `run`, that
 * runs the configured command (`target.cli`) with the arguments it chooses. Nothing else can be run: no shell, no other
 * program. Each run is stopped after 120 s, its output is capped, and its environment holds no secrets.
 */
export function cliHarness(command: string, options: CliHarnessOptions = {}): Harness {
  const base = options.cwd ?? process.cwd()
  const configured = splitWords(command)
  if (!configured.length) throw new Error('The cli target has no command')
  // A relative path in the configured command names a file of the project, not of the trial's empty directory.
  const program = configured.map(word => /^\.\.?\//.test(word) ? resolve(base, word) : word)
  const timeoutMs = options.timeoutMs ?? CLI_TIMEOUT_MS
  const cap = options.outputCap ?? CLI_OUTPUT_CAP
  const limit = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`
  const env = strippedEnv(options.env)
  let root: string | undefined
  let before = new Map<string, string>()

  const tools: ToolSpec[] = [{
    name: 'run',
    description: `Runs \`${command}\` with the arguments you give, in your working directory, and returns its exit code and output. Only this program can be run; write the whole command line, starting with \`${command}\`. Each run is stopped after ${limit}.`,
    input: { type: 'object', properties: { command: { type: 'string', description: `The command line, starting with \`${command}\`` } }, required: ['command'] },
  }]

  async function run(line: string): Promise<{ output: string; error?: string }> {
    const words = splitWords(line)
    const matches = configured.every((word, i) => words[i] === word)
    if (!matches) return { output: '', error: `tried to run \`${line}\`, but only \`${command} …\` can be run here` }
    if (!root) root = makeTempWorkspace()
    const args = [...program.slice(1), ...words.slice(configured.length)]
    return new Promise(done => {
      let stdout = '', stderr = '', timedOut = false
      const child = spawn(program[0], args, { cwd: root, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
      const kill = () => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* already gone */ } }
      const timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs)
      child.stdout.on('data', chunk => { if (stdout.length <= cap) stdout += chunk })
      child.stderr.on('data', chunk => { if (stderr.length <= cap) stderr += chunk })
      child.on('error', error => {
        clearTimeout(timer)
        done({ output: '', error: `ran \`${line}\`, which could not start: ${error.message}` })
      })
      child.on('close', code => {
        clearTimeout(timer)
        const output = [`exit ${timedOut ? 'stopped' : code}`, capped(stdout, cap), stderr && `stderr:\n${capped(stderr, cap)}`].filter(Boolean).join('\n')
        if (timedOut) done({ output, error: `ran \`${line}\`, which ran past ${limit} and was stopped` })
        else if (code !== 0) done({ output, error: `ran \`${line}\`, which exited ${code}${oneLine(stderr) ? `: ${oneLine(stderr)}` : ''}` })
        else done({ output })
      })
    })
  }

  return {
    tools: () => tools,
    async call(name, input) {
      if (name !== 'run') return { output: '', error: `called ${name}, which is not a tool here` }
      const line = (input as { command?: unknown } | undefined)?.command
      if (typeof line !== 'string' || !line.trim()) return { output: '', error: 'called run without a command' }
      return run(line.trim())
    },
    async endState() {
      if (!root) root = makeTempWorkspace()
      return { workspace: workspaceAt(root), sideEffects: diffFiles(before, fingerprintFiles(root)) }
    },
    async reset() {
      removeWorkspace(root)
      root = makeTempWorkspace()
      before = fingerprintFiles(root)
    },
    async dispose() {
      removeWorkspace(root)
      root = undefined
    },
  }
}
