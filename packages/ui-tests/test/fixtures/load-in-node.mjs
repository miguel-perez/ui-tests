// Run with `node --import tsx`: loads a bundle outside Vitest and prints the study names.
import { bundleStudyFile, loadBundle } from '../../src/load.ts'

const file = new URL('./ok.ui.test.ts', import.meta.url).pathname
const { code } = await bundleStudyFile(file)
const studies = await loadBundle(code, file, process.cwd())
console.log(JSON.stringify(studies.map(entry => ({ name: entry.name, file: entry.file, tasks: entry.tasks.length }))))
