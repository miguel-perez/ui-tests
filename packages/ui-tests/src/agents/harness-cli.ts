import { spawn } from 'node:child_process'
import { accessSync, constants, cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import type { Harness, ToolSpec } from './model.ts'
import type { LocalPackage } from './pack.ts'
import { diffFiles, fingerprintFiles, makeTempWorkspace, removeWorkspace, workspaceAt } from './workspace.ts'

/** How long one command may run before it is stopped. */
export const CLI_TIMEOUT_MS = 120_000
/** How much of stdout and of stderr the agent is shown, each. */
export const CLI_OUTPUT_CAP = 64 * 1024
/** The programs a trial may run besides the target's own: npm and npx, against the trial's private, offline cache. */
const NPM_PROGRAMS = ['npm', 'npx']

/** PATH with only its absolute entries: a relative one would resolve inside the trial's directory. */
export function absolutePath(path: string | undefined): string {
  return (path ?? '').split(delimiter).filter(entry => entry && isAbsolute(entry)).join(delimiter)
}

/** Where `program` is on `path`, as an absolute file; a path given with a slash is resolved against `base`. */
function which(program: string, path: string, base: string): string | undefined {
  if (program.includes('/')) return resolve(base, program)
  for (const dir of path.split(delimiter)) {
    const candidate = join(dir, program)
    try { accessSync(candidate, constants.X_OK); return candidate } catch { /* not here */ }
  }
  return undefined
}

/**
 * The environment a trial's command sees: only what a CLI needs to run (absolute PATH entries, locale, terminal, CI), with
 * HOME, TMPDIR, the XDG directories and npm's cache and user config inside the trial, and npm offline. Nothing else from
 * the operator's environment passes, so no credential, no NODE_OPTIONS and not the real home.
 */
export function trialEnv(env: Record<string, string | undefined>, dirs: { home: string; tmp: string }, registry?: string): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && (name === 'LANG' || name === 'TERM' || name === 'CI' || name.startsWith('LC_'))) kept[name] = value
  }
  return {
    ...kept,
    PATH: absolutePath(env.PATH),
    HOME: dirs.home,
    TMPDIR: dirs.tmp,
    XDG_CONFIG_HOME: join(dirs.home, '.config'),
    XDG_CACHE_HOME: join(dirs.home, '.cache'),
    XDG_DATA_HOME: join(dirs.home, '.local', 'share'),
    npm_config_cache: join(dirs.home, '.npm'),
    npm_config_userconfig: join(dirs.home, '.npmrc'),
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    ...(registry && { npm_config_registry: registry }),
  }
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
  /** The environment the allowed names are taken from. Default: the process's. */
  env?: Record<string, string | undefined>
  /** The local package, packed once per run, put in each trial's npm cache so `npm i -D ui-tests` installs it offline. */
  localPackage?: LocalPackage
}

/**
 * The cli harness: the agent gets the scenario, a fresh minimal npm project per trial (its working directory, with its
 * own home and an offline npm cache holding the local package), and one tool, `run`. It runs exactly these programs:
 * the configured command (`target.cli`) with the arguments the agent adds, `npm` and `npx`. No shell. Each run is stopped
 * after 120 s, its output is capped, and its environment holds nothing of the operator's but PATH, locale and terminal.
 * The working directory, home, environment, time and output are controlled; the file system outside them is not.
 */
export function cliHarness(command: string, options: CliHarnessOptions = {}): Harness {
  const base = options.cwd ?? process.cwd()
  const configured = splitWords(command)
  if (!configured.length) throw new Error('The cli target has no command')
  const env = options.env ?? process.env
  const path = absolutePath(env.PATH)
  const timeoutMs = options.timeoutMs ?? CLI_TIMEOUT_MS
  const cap = options.outputCap ?? CLI_OUTPUT_CAP
  const limit = timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`
  // Programs are found once, here, as absolute files: the trial cannot put its own `npm` or `node` first.
  // A relative path in the configured command names a file of the project, not of the trial's directory.
  const program = [which(configured[0], path, base) ?? configured[0], ...configured.slice(1).map(word => /^\.\.?\//.test(word) ? resolve(base, word) : word)]
  const npm = Object.fromEntries(NPM_PROGRAMS.map(name => [name, which(name, path, base)]))
  let trial: { root: string; work: string; env: Record<string, string> } | undefined
  let before = new Map<string, string>()

  const tools: ToolSpec[] = [{
    name: 'run',
    description: `Runs a command in your working directory, a new npm project, and returns its exit code and output. You can run \`${command}\` with the arguments you choose, \`npm\` and \`npx\`; npm works offline${options.localPackage ? `, and \`${options.localPackage.name}\` is in its cache` : ''}. There is no shell. Each run is stopped after ${limit}.`,
    input: { type: 'object', properties: { command: { type: 'string', description: `The command line, starting with \`${command}\`, \`npm\` or \`npx\`` } }, required: ['command'] },
  }]

  function start() {
    const root = makeTempWorkspace()
    const dirs = { work: join(root, 'work'), home: join(root, 'home'), tmp: join(root, 'tmp') }
    for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dirs.work, 'package.json'), '{\n  "name": "trial",\n  "version": "1.0.0",\n  "private": true\n}\n')
    if (options.localPackage) cpSync(options.localPackage.cacheSeed, join(dirs.home, '.npm'), { recursive: true })
    trial = { root, work: dirs.work, env: trialEnv(env, dirs, options.localPackage?.registry) }
    before = fingerprintFiles(dirs.work)
    return trial
  }

  async function run(line: string): Promise<{ output: string; error?: string }> {
    const words = splitWords(line)
    let argv: string[]
    if (configured.every((word, i) => words[i] === word)) argv = [...program, ...words.slice(configured.length)]
    else if (NPM_PROGRAMS.includes(words[0])) {
      const found = npm[words[0]]
      if (!found) return { output: '', error: `tried to run \`${line}\`, but ${words[0]} is not installed here` }
      argv = [found, ...words.slice(1)]
    } else return { output: '', error: `tried to run \`${line}\`, but only \`${command} …\`, \`npm …\` and \`npx …\` can be run here` }
    const { work, env: childEnv } = trial ?? start()
    return new Promise(done => {
      let stdout = '', stderr = '', timedOut = false, settled = false
      const finish = (result: { output: string; error?: string }) => { if (!settled) { settled = true; done(result) } }
      const child = spawn(argv[0], argv.slice(1), { cwd: work, env: childEnv, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      const kill = () => { try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') } catch { /* already gone */ } }
      const report = (code: number | null) => [`exit ${timedOut ? 'stopped' : code}`, capped(stdout, cap), stderr && `stderr:\n${capped(stderr, cap)}`].filter(Boolean).join('\n')
      const timer = setTimeout(() => {
        timedOut = true
        kill()
        // A process that left the group can hold the pipes open; the trial does not wait for it.
        setTimeout(() => finish({ output: report(null), error: `ran \`${line}\`, which ran past ${limit} and was stopped` }), 1000).unref()
      }, timeoutMs)
      child.stdout.on('data', (chunk: string) => { if (stdout.length <= cap) stdout += chunk })
      child.stderr.on('data', (chunk: string) => { if (stderr.length <= cap) stderr += chunk })
      child.on('error', error => {
        clearTimeout(timer)
        finish({ output: '', error: `ran \`${line}\`, which could not start: ${error.message}` })
      })
      child.on('close', code => {
        clearTimeout(timer)
        if (timedOut) finish({ output: report(code), error: `ran \`${line}\`, which ran past ${limit} and was stopped` })
        else if (code !== 0) finish({ output: report(code), error: `ran \`${line}\`, which exited ${code}${oneLine(stderr) ? `: ${oneLine(stderr)}` : ''}` })
        else finish({ output: report(code) })
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
      const { work } = trial ?? start()
      return { workspace: workspaceAt(work), sideEffects: diffFiles(before, fingerprintFiles(work)) }
    },
    async reset() {
      removeWorkspace(trial?.root)
      start()
    },
    async dispose() {
      removeWorkspace(trial?.root)
      trial = undefined
    },
  }
}
