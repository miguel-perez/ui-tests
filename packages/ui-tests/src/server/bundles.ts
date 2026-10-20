import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'esbuild'

/** What the server sends to browsers: built once, from source, when the process first needs it. */
export type Bundles = {
  /** The body of `/ui-tests.js`: it imports the loader's asset and starts it with its own address. */
  loader: string
  /** Every asset by its file name (`<name>-<hash>.js`, `chunk-<hash>.js`), served under `/ui-tests/assets/`. */
  assets: Map<string, string>
  /** The asset names of the player's page and the report's replay. */
  player: string
  replay: string
}

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** The replay's entry has no file of its own: it is the trace's replay, mounted with rrweb-player's stylesheet as text. */
const REPLAY_ENTRY = 'ui-tests:replay'
const replayEntry: Plugin = {
  name: 'replay-entry',
  setup(plugin) {
    plugin.onResolve({ filter: /^ui-tests:replay$/ }, () => ({ path: REPLAY_ENTRY, namespace: 'replay-entry' }))
    plugin.onLoad({ filter: /.*/, namespace: 'replay-entry' }, () => ({
      contents: `import css from 'rrweb-player/dist/style.css'\nimport { mountReplays } from './replay.tsx'\nmountReplays(document, css)`,
      resolveDir: here('../trace/'),
      loader: 'tsx',
    }))
  },
}

let bundles: Promise<Bundles> | undefined

/**
 * The loader, the player and the replay, in one build that shares their chunks. The loader's own asset stays small: the bar, React and
 * the recorder are a chunk it imports only once there is an attempt to show. Names carry a hash of their content, so they are cached for
 * ever. A failed build is not kept: the next request tries again.
 */
export function getBundles(): Promise<Bundles> {
  bundles ??= build({
    entryPoints: { 'ui-tests': here('../browser/loader.ts'), player: here('../player/client.tsx'), replay: REPLAY_ENTRY },
    plugins: [replayEntry],
    bundle: true, splitting: true, write: false, absWorkingDir: here('../../'), outdir: 'assets' /* names only: nothing is written */, format: 'esm', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic',
    entryNames: '[name]-[hash]', chunkNames: 'chunk-[hash]',
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  }).then((result) => {
    const assets = new Map(result.outputFiles.map((file) => [file.path.split(/[\\/]/).pop()!, file.text]))
    const entry = (name: string) => {
      const found = [...assets.keys()].find((file) => new RegExp(`^${name}-[A-Z0-9]+\\.js$`).test(file))
      if (!found) throw new Error(`The ${name} bundle was not built`)
      return found
    }
    return { loader: `import { start } from './ui-tests/assets/${entry('ui-tests')}'; start(import.meta.url)`, assets, player: entry('player'), replay: entry('replay') }
  })
  bundles.catch(() => { bundles = undefined })
  return bundles
}
