import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync, createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/** This package's own directory (`packages/ui-tests` in the repository, or where it is installed). */
export const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
/** Top-level entries of the package that are not shipped into a trial. */
const LEFT_OUT = new Set(['node_modules', 'test'])

/**
 * The local `ui-tests` package, packed once per run for the cli harness: a tarball with every dependency bundled, and an
 * npm cache that already holds it, so a trial resolves `npm i -D ui-tests` and `npx ui-tests` to this code with
 * `npm_config_offline=true` and never reaches a registry. `registry` is the address the cache entries are keyed by;
 * nothing listens on it once the cache is made.
 */
export type LocalPackage = { name: string; version: string; tarball: string; registry: string; cacheSeed: string; dispose(): void }

/** Where `name` resolves from `from`, the way Node resolves a bare import: the nearest `node_modules` up the tree. */
function findPackage(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}

type Manifest = { name: string; version: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; [key: string]: unknown }
const manifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

/**
 * Every package the CLI needs at run time, found from where this package is installed: dependencies, optional
 * dependencies that are present, and peers that are present (React renders the trace). Top level by name; a package
 * that sits inside another's own `node_modules` travels with that one.
 */
function closure(root: string): Map<string, string> {
  const top = new Map<string, string>()
  const seen = new Set<string>()
  const walk = (dir: string) => {
    const pkg = manifest(dir)
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      const found = findPackage(name, dir)
      if (!found || seen.has(found)) continue
      seen.add(found)
      const nested = [...top.values()].some(parent => found.startsWith(`${parent}${sep}node_modules${sep}`))
      if (!nested && !top.has(name)) top.set(name, found)
      walk(found)
    }
  }
  walk(root)
  return top
}

const run = promisify(execFile)

/** Packs the package with its dependencies bundled and fills an npm cache with it, through a registry that lives only for that. */
export async function packLocalPackage(packageDir = PACKAGE_DIR): Promise<LocalPackage> {
  const work = mkdtempSync(join(tmpdir(), 'ui-tests-pack-'))
  try {
    const staging = join(work, 'package')
    mkdirSync(staging)
    for (const entry of readdirSync(packageDir)) {
      if (!LEFT_OUT.has(entry)) cpSync(join(packageDir, entry), join(staging, entry), { recursive: true, dereference: true })
    }
    const bundled = closure(packageDir)
    for (const [name, dir] of bundled) cpSync(dir, join(staging, 'node_modules', name), { recursive: true, dereference: true })
    // An optional dependency for another platform (esbuild's) is not in the bundle; left listed, `npm ci` reads it as missing.
    for (const name of bundled.keys()) {
      const file = join(staging, 'node_modules', name, 'package.json')
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as Manifest
      if (!pkg.optionalDependencies) continue
      const present = Object.fromEntries(Object.entries(pkg.optionalDependencies).filter(([dep]) => bundled.has(dep)))
      writeFileSync(file, `${JSON.stringify({ ...pkg, optionalDependencies: present }, null, 2)}\n`)
    }
    const original = manifest(packageDir)
    const { peerDependencies: _peers, peerDependenciesMeta: _meta, devDependencies: _dev, scripts: _scripts, ...rest } = original
    const staged: Manifest = {
      ...rest,
      dependencies: Object.fromEntries([...bundled].map(([name, dir]) => [name, manifest(dir).version])),
      bundleDependencies: [...bundled.keys()],
    }
    writeFileSync(join(staging, 'package.json'), `${JSON.stringify(staged, null, 2)}\n`)
    const env = { PATH: process.env.PATH ?? '', HOME: join(work, 'home'), npm_config_cache: join(work, 'pack-cache'), npm_config_update_notifier: 'false' }
    const { stdout } = await run('npm', ['pack', '--pack-destination', work, '--silent'], { cwd: staging, env, maxBuffer: 64 * 1024 * 1024 })
    const tarball = join(work, stdout.trim().split('\n').at(-1)!)
    const bytes = readFileSync(tarball)
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
    const shasum = createHash('sha1').update(bytes).digest('hex')
    rmSync(staging, { recursive: true, force: true })

    // A registry for one name, up only while the cache is filled: install requests what a trial will ask for, and the cache keeps it.
    let base = ''
    const server = createServer((req, res) => {
      const file = `${staged.name}-${staged.version}.tgz`
      if (req.url === `/${staged.name}`) {
        const version = { ...staged, dist: { tarball: `${base}/${staged.name}/-/${file}`, integrity, shasum } }
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ name: staged.name, 'dist-tags': { latest: staged.version }, versions: { [staged.version]: version } }))
      } else if (req.url === `/${staged.name}/-/${file}`) {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length })
        createReadStream(tarball).pipe(res)
      } else res.writeHead(404).end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const registry = `${base}/`
    const cacheSeed = join(work, 'cache')
    const project = join(work, 'seed')
    mkdirSync(project)
    writeFileSync(join(project, 'package.json'), '{"name":"seed","version":"1.0.0","private":true}\n')
    try {
      await run('npm', ['install', '--save-dev', staged.name, '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: project, maxBuffer: 64 * 1024 * 1024,
        env: { ...env, npm_config_cache: cacheSeed, npm_config_registry: registry, npm_config_userconfig: join(work, 'home', '.npmrc') },
      })
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      rmSync(project, { recursive: true, force: true })
    }
    return { name: staged.name, version: staged.version, tarball, registry, cacheSeed, dispose: () => rmSync(work, { recursive: true, force: true }) }
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    throw error
  }
}
