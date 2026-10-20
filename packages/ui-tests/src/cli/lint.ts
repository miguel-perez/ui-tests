import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { compileStudy } from '../compile.ts'
import { loadConfig, discoverStudyFiles } from '../config.ts'
import { formatFindings, lint, planLines, type LintFinding } from '../lint.ts'
import { bundleStudyFile, loadBundle, StudyLoadError } from '../load.ts'
import type { UiTestsConfig } from '../types.ts'
import type { Command } from './main.ts'

function hostname(url: string) { try { return new URL(url).hostname } catch { return url } }

/** The config with `product` defaulted to the target hostname, so the product-name rules have a name to look for. */
export function withProduct(config: UiTestsConfig): UiTestsConfig {
  return { ...config, product: config.product ?? hostname(config.target?.url ?? 'http://localhost:3000') }
}

/** Loads and compiles every study in the given files, or all `*.ui.test.ts` under cwd. Throws StudyLoadError with file:line. */
export async function loadStudies(cwd: string, files: string[], config: UiTestsConfig) {
  const targets = files.length ? files.map(f => isAbsolute(f) ? f : join(cwd, f)) : await discoverStudyFiles(cwd)
  if (!targets.length) throw new Error('no study files found (*.ui.test.ts)')
  const loaded = []
  for (const file of targets) {
    const { code } = await bundleStudyFile(file)
    const studies = await loadBundle(code, file, cwd)
    const sourceText = await readFile(file, 'utf8')
    for (const study of studies) loaded.push({ file, study, sourceText, code, compiled: compileStudy(study, config) })
  }
  return loaded
}

/**
 * With `--out <file>` (relative to the project), also writes what `--json` prints to that file, so the result is a file a script, or an
 * agent study's outcome, can read. Returns the file it wrote, or why it could not.
 */
export async function writeOut(args: Parameters<Command>[0], io: Parameters<Command>[1], value: unknown): Promise<string | undefined> {
  const out = args.flags.get('out')
  if (out === undefined) return undefined
  if (out === true || !out.trim()) { io.stderr.write('--out needs a file name\n'); return undefined }
  const file = resolve(io.cwd, out)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

/** Prints each finding with its file:line, rule, reason and source; exits 1 on an error, 2 when a study cannot load. `--out <file>` also writes the JSON to a file. */
export const lintCommand: Command = async (args, io) => {
  const json = args.flags.has('json')
  if (args.flags.get('out') === true) { io.stderr.write('--out needs a file name\n'); return 2 }
  const show = (file: string) => relative(io.cwd, file) || file
  let config: UiTestsConfig
  let loaded: Awaited<ReturnType<typeof loadStudies>>
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, args.positionals, config)
  } catch (error) {
    const message = error instanceof StudyLoadError ? error.message.replace(error.file, show(error.file)) : error instanceof Error ? error.message : String(error)
    io.stderr.write(`${message}\n`)
    const failure = { error: { message, ...(error instanceof StudyLoadError && { file: show(error.file), line: error.line }) } }
    if (json) io.stdout.write(`${JSON.stringify(failure)}\n`)
    await writeOut(args, io, failure)
    return 2
  }
  const results = loaded.map(({ file, study, compiled, sourceText }) => ({
    file: show(file), plan: planLines(compiled), findings: lint({ study, compiled, sourceText, config }) as LintFinding[],
  }))
  const failed = results.some(r => r.findings.some(f => f.severity === 'error'))
  const result = { studies: results.map(r => ({ ...r, findings: r.findings.map(f => ({ ...f, file: show(f.file) })) })) }
  const written = await writeOut(args, io, result)
  if (json) {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return failed ? 1 : 0
  }
  if (written) io.stdout.write(`wrote ${show(written)}\n`)
  for (const r of results) {
    io.stdout.write(`${r.plan.join('\n')}\n`)
    if (!r.findings.length) io.stdout.write('No findings.\n')
    for (const f of r.findings) io.stdout.write(`\n${show(f.file)}:${f.line}\n${formatFindings([f])}\n`)
    io.stdout.write('\n')
  }
  return failed ? 1 : 0
}
