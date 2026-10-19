// Run with `node --import tsx`: loads the throwing fixture outside Vitest and prints the error's file and line.
import { bundleStudyFile, loadBundle } from '../../src/load.ts'

const file = new URL('./throws.ui.test.ts', import.meta.url).pathname
const { code } = await bundleStudyFile(file)
const error = await loadBundle(code, file).catch(e => e)
console.log(JSON.stringify({ name: error.name, file: error.file, line: error.line }))
