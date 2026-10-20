import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { originalPosition } from './sourcemap.ts'
import type { AuthoredStudy } from './authoring.ts'

process.setSourceMapsEnabled(true)

/** A study file that does not parse or throws when evaluated; carries the file and, when known, the line. */
export class StudyLoadError extends Error {
  file: string
  line?: number
  constructor(message: string, file: string, line?: number, cause?: unknown) {
    super(`${file}${line ? `:${line}` : ''}: ${message}`, { cause })
    this.name = 'StudyLoadError'
    this.file = file
    this.line = line
  }
}

/** Bundles one study file (ESM, inline sourcemap) so the runner can evaluate it away from the app. */
export async function bundleStudyFile(file: string): Promise<{ code: string; hash: string }> {
  try {
    const result = await build({
      entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', sourcemap: 'inline', sourceRoot: `${dirname(file)}/`,
      external: ['ui-tests', 'playwright-core'], outfile: file.replace(/\.ts$/, '.mjs'), logLevel: 'silent',
    })
    const code = result.outputFiles[0].text
    return { code, hash: createHash('sha256').update(code).digest('hex') }
  } catch (error) {
    const first = (error as { errors?: { text: string; location?: { file: string; line: number } | null }[] }).errors?.[0]
    if (first) throw new StudyLoadError(first.text, first.location?.file ?? file, first.location?.line)
    throw error
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The line of the first stack frame in the bundle (mapped back) or already mapped into the study file. */
function lineIn(error: unknown, bundle: string, study: string): number | undefined {
  const stack = error instanceof Error ? error.stack ?? '' : ''
  const match = new RegExp(`(${escape(bundle)}|${escape(study)}):(\\d+):(\\d+)`).exec(stack)
  if (!match) return undefined
  return match[1] === bundle ? originalPosition(bundle, Number(match[2]), Number(match[3])).line : Number(match[2])
}

let counter = 0
/**
 * Evaluates a bundle under `<cwd>/node_modules/.cache/ui-tests/` (so `ui-tests` resolves) and returns the studies it declares.
 * The studies are read through the bundle's own `ui-tests` import, so it works whichever module loader owns this file.
 */
export function loadBundle(code: string, file: string, cwd = process.cwd()): Promise<AuthoredStudy[]> {
  // Loads share one studies registry, so they run one at a time.
  const run = queue.then(() => evaluate(code, file, cwd))
  queue = run.catch(() => undefined)
  return run
}
let queue: Promise<unknown> = Promise.resolve()
async function evaluate(code: string, file: string, cwd: string): Promise<AuthoredStudy[]> {
  const dir = join(cwd, 'node_modules', '.cache', 'ui-tests')
  await mkdir(dir, { recursive: true })
  const base = join(dir, `${createHash('sha1').update(file).digest('hex').slice(0, 8)}-${process.pid}-${counter++}`)
  const reset = `${base}-reset.mjs`
  const temp = `${base}.mjs`
  await writeFile(reset, "import { resetStudies } from 'ui-tests'\nresetStudies()\n")
  // The footer goes before the trailing sourcemap comment, which must stay last to be honoured.
  const mapAt = code.lastIndexOf('//# sourceMappingURL=')
  const footer = "export { getStudies as __getStudies } from 'ui-tests'\n"
  await writeFile(temp, mapAt < 0 ? `${code}\n${footer}` : `${code.slice(0, mapAt)}${footer}${code.slice(mapAt)}`)
  try {
    await import(/* @vite-ignore */ pathToFileURL(reset).href)
    const loaded = await import(/* @vite-ignore */ pathToFileURL(temp).href) as { __getStudies: () => AuthoredStudy[] }
    return [...loaded.__getStudies()]
  } catch (error) {
    throw new StudyLoadError(error instanceof Error ? error.message : String(error), file, lineIn(error, temp, file), error)
  } finally {
    await Promise.all([rm(reset, { force: true }), rm(temp, { force: true })])
  }
}
