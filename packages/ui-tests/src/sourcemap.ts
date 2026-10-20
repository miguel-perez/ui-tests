import { findSourceMap } from 'node:module'
import { fileURLToPath } from 'node:url'

/**
 * Maps a generated position back to its original source through the file's inline sourcemap.
 * Used instead of relying on `Error.stack` being remapped, which a test runner can disable.
 * Positions in files without a map are returned unchanged.
 */
export function originalPosition(file: string, line: number, column: number): { file: string; line: number } {
  try {
    const entry = findSourceMap(file)?.findEntry(line - 1, Math.max(column - 1, 0))
    if (entry && 'originalSource' in entry && entry.originalSource) {
      const source = entry.originalSource
      return { file: source.startsWith('file://') ? fileURLToPath(source) : source, line: entry.originalLine + 1 }
    }
  } catch { /* fall through to the unmapped position */ }
  return { file, line }
}
