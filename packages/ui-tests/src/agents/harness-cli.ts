import { spawn } from 'node:child_process'
import { accessSync, constants, cpSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import type { Harness, ToolSpec } from './model.ts'
import type { LocalPackage } from './pack.ts'
import { diffFiles, fingerprintFiles, makeTempWorkspace, removeWorkspace, workspaceAt } from './workspace.ts'

/** How long one command may run before it is stopped. */
export const CLI_TIMEOUT_MS = 120_000
/** How much of stdout and of stderr the agent is shown, each. */
export const CLI_OUTPUT_CAP = 64 * 1024
/** The programs a trial may run besides the target's own: npm and npx, in the strict forms `npmArgv` accepts. */
const NPM_PROGRAMS = ['npm', 'npx']
/** The one package a trial may install and run through npm. */
export const TRIAL_PACKAGE = 'ui-tests'
const INSTALL = new Set(['install', 'i', 'ci'])
const SAVE_DEV = new Set(['-D', '--save-dev'])

/**
 * The argv for an `npm` or `npx` line, or why it is refused. Only these forms run:
 * `npm install|i [-D|--save-dev] [ui-tests]`, `npm ci`, and `npx ui-tests …` (which runs the project's installed
 * `node_modules/.bin/ui-tests` with the rest as its arguments). No other subcommand and no other flag: npm's own flags
 * would override the trial's settings (`--offline=false`, `--registry`, `--prefix`) or run a shell (`exec -c`, `run`,
 * `pkg set scripts`). The harness appends the settings itself, after the agent's words.
 */
export function npmArgv(line: string, trial: { npm: string; work: string; home: string; registry?: string }): { argv: string[] } | { error: string } {
  const words = splitWords(line)
  const refuse = (why: string) => ({ error: `tried to run \`${line}\`, but ${why}` })
  if (words[0] === 'npx') {
    if (words[1] !== TRIAL_PACKAGE) return refuse(`npx runs only \`npx ${TRIAL_PACKAGE} …\` here, with no npx options`)
    const bin = join(trial.work, 'node_modules', '.bin', TRIAL_PACKAGE)
    if (!existsSync(bin)) return refuse(`${TRIAL_PACKAGE} is not installed in this project; install it with \`npm i -D ${TRIAL_PACKAGE}\``)
    return { argv: [bin, ...words.slice(2)] }
  }
  const [, sub, ...rest] = words
  if (!sub || !INSTALL.has(sub)) return refuse(`npm runs only \`npm install ${TRIAL_PACKAGE}\`, \`npm i -D ${TRIAL_PACKAGE}\` and \`npm ci\` here`)
  const flags = rest.filter(word => word.startsWith('-'))
  const packages = rest.filter(word => !word.startsWith('-'))
  const bad = flags.find(flag => sub === 'ci' || !SAVE_DEV.has(flag))
  if (bad) return refuse(`the option \`${bad}\` is not allowed here`)
  if (sub === 'ci' ? packages.length : packages.some(name => name !== TRIAL_PACKAGE) || packages.length > 1) return refuse(`only \`${TRIAL_PACKAGE}\` can be installed here`)
  return {
    argv: [
      trial.npm, sub, ...rest,
      '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-update-notifier',
      `--prefix=${trial.work}`, `--userconfig=${join(trial.home, '.npmrc')}`, `--cache=${join(trial.home, '.npm')}`,
      ...(trial.registry ? [`--registry=${trial.registry}`] : []),
    ],
  }
}

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
  /** Starts a command; tests pass a recorder. Default: `child_process.spawn`. */
  spawn?: typeof spawn
}

/**
 * The cli harness: the agent gets the scenario, a fresh minimal npm project per trial (its working directory, with its
 * own home and an offline npm cache holding the local package), and one tool, `run`. It runs exactly these: the
 * configured command (`target.cli`) with the arguments the agent adds, and the npm forms `npmArgv` accepts. No shell. Each run is stopped
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
  const npm = which('npm', path, base)
  // A target that is npm or npx itself (`npx ui-tests`) gets the npm rules, not free arguments.
  const targetIsNpm = NPM_PROGRAMS.includes(configured[0])
  const spawnChild = options.spawn ?? spawn
  let trial: { root: string; work: string; home: string; env: Record<string, string> } | undefined
  let before = new Map<string, string>()

  const tools: ToolSpec[] = [{
    name: 'run',
    description: `Runs a command in your working directory, a new npm project, and returns its exit code and output. You can run ${targetIsNpm ? '' : `\`${command}\` with the arguments you choose, `}\`npm i -D ${TRIAL_PACKAGE}\` (or \`npm install\`, \`npm ci\`) and \`npx ${TRIAL_PACKAGE} …\`; npm works offline${options.localPackage ? `, and \`${options.localPackage.name}\` is in its cache` : ''}. No other npm commands or options, and no shell. Each run is stopped after ${limit}.`,
    input: { type: 'object', properties: { command: { type: 'string', description: `The command line, starting with \`${command}\`, \`npm\` or \`npx\`` } }, required: ['command'] },
  }]

  function start() {
    // The real path: npm compares --prefix with the directory it runs in, and /var is /private/var on macOS.
    const root = realpathSync(makeTempWorkspace())
    const dirs = { work: join(root, 'work'), home: join(root, 'home'), tmp: join(root, 'tmp') }
    for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
    writeFileSync(join(dirs.work, 'package.json'), '{\n  "name": "trial",\n  "version": "1.0.0",\n  "private": true\n}\n')
    if (options.localPackage) cpSync(options.localPackage.cacheSeed, join(dirs.home, '.npm'), { recursive: true })
    trial = { root, work: dirs.work, home: dirs.home, env: trialEnv(env, dirs, options.localPackage?.registry) }
    before = fingerprintFiles(dirs.work)
    return trial
  }

  async function run(line: string): Promise<{ output: string; error?: string }> {
    const words = splitWords(line)
    const current = trial ?? start()
    const { work, env: childEnv } = current
    let argv: string[]
    if (NPM_PROGRAMS.includes(words[0])) {
      if (!npm) return { output: '', error: `tried to run \`${line}\`, but npm is not installed here` }
      const parsed = npmArgv(line, { npm, work, home: current.home, ...(options.localPackage && { registry: options.localPackage.registry }) })
      if ('error' in parsed) return { output: '', error: parsed.error }
      argv = parsed.argv
    } else if (!targetIsNpm && configured.every((word, i) => words[i] === word)) argv = [...program, ...words.slice(configured.length)]
    else return { output: '', error: `tried to run \`${line}\`, but only ${targetIsNpm ? '' : `\`${command} …\`, `}\`npm i -D ${TRIAL_PACKAGE}\` and \`npx ${TRIAL_PACKAGE} …\` can be run here` }
    return new Promise(done => {
      let stdout = '', stderr = '', timedOut = false, settled = false
      const finish = (result: { output: string; error?: string }) => { if (!settled) { settled = true; done(result) } }
      const child = spawnChild(argv[0], argv.slice(1), { cwd: work, env: childEnv, shell: false, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
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
