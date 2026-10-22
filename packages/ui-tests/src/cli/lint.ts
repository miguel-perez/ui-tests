import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { AuthoredStudy } from '../authoring.ts'
import { compileWithSnapshot, type Compiled } from '../compile.ts'
import { loadConfig, discoverStudyFiles } from '../config.ts'
import { draftSnapshot, type NotDrafted } from '../derive/draft.ts'
import { toThirdPerson } from '../derive/person.ts'
import { readUsers } from '../derive/screener.ts'
import { readSnapshotFile, snapshotFileOf, writeSnapshotFile, type SnapshotFile, type StudySnapshot } from '../derive/snapshot.ts'
import { formatFindings, lint, planLines, type LintFinding } from '../lint.ts'
import { bundleStudyFile, loadBundle, StudyLoadError } from '../load.ts'
import { textModelFrom } from '../model.ts'
import type { UiTestsConfig } from '../types.ts'
import type { Command, Io } from './main.ts'

function hostname(url: string) { try { return new URL(url).hostname } catch { return url } }

/** The config with `product` defaulted to the target hostname, so the product-name rules have a name to look for. */
export function withProduct(config: UiTestsConfig): UiTestsConfig {
  return { ...config, product: config.product ?? hostname(config.target?.url ?? 'http://localhost:3000') }
}

export type LoadedStudy = Compiled & { file: string; study: AuthoredStudy; sourceText: string; code: string; snapshotFile: string; entry?: StudySnapshot }

/**
 * Loads and compiles every study in the given files, or all `*.ui.test.ts` under cwd, each with its snapshot when the file has one.
 * Throws StudyLoadError with file:line.
 */
export async function loadStudies(cwd: string, files: string[], config: UiTestsConfig): Promise<LoadedStudy[]> {
  const targets = files.length ? files.map(f => isAbsolute(f) ? f : join(cwd, f)) : await discoverStudyFiles(cwd)
  if (!targets.length) throw new Error('no study files found (*.ui.test.ts)')
  const loaded: LoadedStudy[] = []
  for (const file of targets) {
    const { code } = await bundleStudyFile(file)
    const studies = await loadBundle(code, file, cwd)
    const sourceText = await readFile(file, 'utf8')
    const snapshotFile = snapshotFileOf(file)
    let snapshot: SnapshotFile | undefined
    try { snapshot = await readSnapshotFile(snapshotFile) } catch (error) { throw new StudyLoadError(error instanceof Error ? error.message : String(error), snapshotFile) }
    for (const study of studies) {
      const entry = snapshot?.studies[study.name]
      loaded.push({ file, study, sourceText, code, snapshotFile, ...(entry && { entry }), ...compileWithSnapshot(study, config, entry) })
    }
  }
  return loaded
}

/**
 * The reason a run cannot be recruited for this study yet, naming its snapshot: missing, not fully drafted, or out of date. Undefined
 * when it is current, or when only agents take the study.
 */
export function snapshotRefusal(chosen: LoadedStudy, cwd: string): string | undefined {
  if (chosen.snapshot.state === 'current') return undefined
  const file = relative(cwd, chosen.snapshotFile) || chosen.snapshotFile
  return `${file}: the screener snapshot of "${chosen.study.name}" is ${chosen.snapshot.state} (${chosen.snapshot.reasons.join('; ')}). Run ui-tests lint -u, review the file and commit it.`
}

/**
 * Drafts and writes the snapshot of every study that people take, file by file: what still holds is kept, the rest is drafted, the
 * screens are rendered from the result, and studies no longer in the file are dropped. Returns each study recompiled, with what was not drafted.
 */
async function updateSnapshots(loaded: LoadedStudy[], config: UiTestsConfig, io: Io): Promise<{ loaded: LoadedStudy[]; notDrafted: Map<LoadedStudy, NotDrafted[]>; written: string[] }> {
  const model = io.deps?.model ?? textModelFrom(io.env)
  const notDrafted = new Map<LoadedStudy, NotDrafted[]>()
  const written: string[] = []
  const out: LoadedStudy[] = []
  const byFile = new Map<string, LoadedStudy[]>()
  for (const item of loaded) byFile.set(item.snapshotFile, [...(byFile.get(item.snapshotFile) ?? []), item])
  for (const [snapshotFile, items] of byFile) {
    const studies: SnapshotFile['studies'] = {}
    for (const item of items) {
      if (!item.compiled.actors.includes('human')) { out.push(item); continue }
      const did = readUsers(item.study.options.users).fields.did ?? ''
      const page = item.compiled.impression.on ? item.compiled.impression.page : undefined
      const { entry, notDrafted: missed } = await draftSnapshot({
        needs: item.needs, groups: item.groups, ...(item.entry && { previous: item.entry }), product: item.compiled.product, did: toThirdPerson(did),
        ...(page && item.needs.says !== undefined && { pageUrl: new URL(page, config.target?.url ?? 'http://localhost:3000').toString() }),
        ...(model && { model }), ...(io.deps?.fetch && { fetch: io.deps.fetch }),
      })
      // The screens come from the drafts: compile with them, then keep what compiling rendered.
      const recompiled = compileWithSnapshot(item.study, config, entry)
      entry.screens = recompiled.compiled.screener
      const final = { ...item, entry, ...compileWithSnapshot(item.study, config, entry) }
      studies[item.study.name] = entry
      if (missed.length) notDrafted.set(final, missed)
      out.push(final)
    }
    if (Object.keys(studies).length) {
      await writeSnapshotFile(snapshotFile, { version: 1, studies })
      written.push(snapshotFile)
    }
  }
  return { loaded: out, notDrafted, written }
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

/**
 * Prints each finding with its file:line, rule, reason and source; exits 1 on an error, 2 when a study cannot load. `-u` (`--update`)
 * first drafts or updates each study's screener snapshot and names what it could not draft. `--out <file>` also writes the JSON to a file.
 */
export const lintCommand: Command = async (args, io) => {
  const json = args.flags.has('json')
  const outFlag = args.flags.get('out')
  if (outFlag === true || (typeof outFlag === 'string' && !outFlag.trim())) { io.stderr.write('--out needs a file name\n'); return 2 }
  const show = (file: string) => relative(io.cwd, file) || file
  let config: UiTestsConfig
  let loaded: LoadedStudy[]
  let notDrafted = new Map<LoadedStudy, NotDrafted[]>()
  let written: string[] = []
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, args.positionals, config)
    if (args.flags.has('update')) ({ loaded, notDrafted, written } = await updateSnapshots(loaded, config, io))
  } catch (error) {
    const message = error instanceof StudyLoadError ? error.message.replace(error.file, show(error.file)) : error instanceof Error ? error.message : String(error)
    io.stderr.write(`${message}\n`)
    const failure = { error: { message, ...(error instanceof StudyLoadError && { file: show(error.file), line: error.line }) } }
    if (json) io.stdout.write(`${JSON.stringify(failure)}\n`)
    await writeOut(args, io, failure)
    return 2
  }
  const results = loaded.map(item => ({
    file: show(item.file), plan: planLines(item.compiled),
    findings: lint({ study: item.study, compiled: item.compiled, sourceText: item.sourceText, config, snapshot: { ...item.snapshot, file: basename(item.snapshotFile) } }) as LintFinding[],
    ...(notDrafted.has(item) && { notDrafted: notDrafted.get(item)!.map(n => ({ ...n, snapshot: show(item.snapshotFile) })) }),
  }))
  const failed = results.some(r => r.findings.some(f => f.severity === 'error'))
  const result = { studies: results.map(r => ({ ...r, findings: r.findings.map(f => ({ ...f, file: show(f.file) })) })), ...(written.length && { snapshots: written.map(show) }) }
  const out = await writeOut(args, io, result)
  if (json) {
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return failed ? 1 : 0
  }
  if (out) io.stdout.write(`wrote ${show(out)}\n`)
  for (const file of written) io.stdout.write(`wrote ${show(file)}\n`)
  for (const r of results) {
    io.stdout.write(`${r.plan.join('\n')}\n`)
    for (const n of r.notDrafted ?? []) io.stdout.write(`could not draft ${n.item}: ${n.reason}; write it into ${n.snapshot}\n`)
    if (!r.findings.length) io.stdout.write('No findings.\n')
    for (const f of r.findings) io.stdout.write(`\n${show(f.file)}:${f.line}\n${formatFindings([f])}\n`)
    io.stdout.write('\n')
  }
  return failed ? 1 : 0
}
