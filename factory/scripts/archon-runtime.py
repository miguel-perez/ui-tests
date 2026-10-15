#!/usr/bin/env python3
"""Build and verify the repository-local pinned Archon repair. Never install a host."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

PIN = 'aa095446cf1915901e777433e043b8b8b77dfbe1'
UPSTREAM = 'https://github.com/coleam00/Archon.git'
RUNTIME_FILE = 'packages/providers/src/community/opencode/runtime.ts'
SOURCE_SHA = '9215677784e9fa6cead35168f7d5ee69c6833099414c805da44d0781637db19d'
LOCK_SHA = '41fae3b4afeadc7d5d2c9d50cb352b17c394bd66e1bc92aaf2e5c6a9416f26b4'
BUN_VERSION = '1.3.11'  # no bytecode; matches the verified local build toolchain
HERE = Path(__file__).resolve().parent


def repo_root():
    """Consumer repository root: ARCHON_REPO_ROOT, else the enclosing git work tree, else the parent of this directory."""
    configured = os.environ.get('ARCHON_REPO_ROOT')
    if configured:
        path = Path(configured).resolve()
        if not path.is_dir():
            raise RuntimeError('ARCHON_REPO_ROOT is not a directory: ' + configured)
        return path
    try:
        top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=HERE, capture_output=True, text=True, timeout=10)
        if top.returncode == 0 and top.stdout.strip():
            return Path(top.stdout.strip()).resolve()
    except (OSError, subprocess.SubprocessError):
        pass
    return HERE.parent


ROOT = repo_root()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patch_source(text):
    if hashlib.sha256(text.encode()).hexdigest() != SOURCE_SHA:
        raise RuntimeError('Pinned runtime source drift; refusing to patch')
    start = text.index('function findProcessByPort(')
    end = text.index('function errorText(', start)
    replacement = """function killProcess(pid: number): void {
  try {
    killListenerProcess(pid);
  } catch (error) {
    getLog().warn({ err: error, pid }, 'opencode.process_kill_failed');
  }
}

"""
    patched = text[:start] + replacement + text[end:]
    patched = patched.replace("import { execSync } from 'node:child_process';",
        "import { findProcessByPort, killProcess as killListenerProcess } from './listener-cleanup.mjs';")
    return patched


def verify_binary(root, binary, manifest):
    if binary.is_symlink() or not binary.is_file() or not os.access(binary, os.X_OK):
        raise RuntimeError('Missing/not executable local repaired binary; run npm run automation:build')
    try:
        data = json.loads(manifest.read_text())
        if (data['pin'] != PIN or data['source_sha256'] != SOURCE_SHA
                or data['lock_sha256'] != LOCK_SHA or data['bun'] != BUN_VERSION
                or data['repair_sha256'] != sha(HERE / 'listener-cleanup.mjs')
                or data['builder_sha256'] != sha(Path(__file__).resolve())
                or data['binary_sha256'] != sha(binary)):
            raise ValueError('identity mismatch')
    except (OSError, ValueError, KeyError) as error:
        raise RuntimeError('Wrong/unverified local binary; rebuild with npm run automation:build') from error
    return binary


def select_binary(root=ROOT):
    runtime = root / '.archon/runtime'
    return verify_binary(root, runtime / 'bin/archon-repaired', runtime / 'bin/archon-repaired.json')


def isolated_env():
    # Do not inherit a live host's database or Docker state-directory selection.
    return dict(os.environ, ARCHON_HOME=str(ROOT / '.archon/runtime/home'),
                DATABASE_URL='', ARCHON_DOCKER='false', WORKSPACE_PATH='')


def run(args, cwd, env):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def publish_candidate(candidate, binary):
    manifest = binary.with_suffix('.json')
    candidate_sha = sha(candidate)
    # Preserve a valid previous pair. An interrupted swap may already have put
    # this candidate in place; recover its manifest without backing up a bad pair.
    if binary.exists() and manifest.exists():
        previous_data = json.loads(manifest.read_text())
        binary_sha = sha(binary)
        if previous_data.get('pin') != PIN:
            raise RuntimeError('Previous binary identity drift; refusing to overwrite')
        if previous_data.get('binary_sha256') == binary_sha:
            shutil.copy2(binary, binary.with_suffix('.previous'))
            shutil.copy2(manifest, manifest.with_suffix('.previous.json'))
        elif binary_sha != candidate_sha:
            raise RuntimeError('Previous binary identity drift; refusing to overwrite')
    candidate.chmod(0o700)
    manifest_tmp = manifest.with_suffix('.json.candidate')
    manifest_tmp.write_text(json.dumps(dict(pin=PIN, source_sha256=SOURCE_SHA, lock_sha256=LOCK_SHA,
        bun=BUN_VERSION, repair_sha256=sha(HERE / 'listener-cleanup.mjs'),
        builder_sha256=sha(Path(__file__).resolve()), binary_sha256=candidate_sha), indent=2) + '\n')
    candidate.replace(binary)
    manifest_tmp.replace(manifest)


def build():
    runtime = ROOT / '.archon/runtime'
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Keep Bun cache, temp downloads and upstream dependencies in ignored storage.
    cache = runtime / 'cache'
    temp = runtime / 'tmp'
    for path in (cache, temp, runtime / 'source', runtime / 'bin'):
        path.mkdir(parents=True, exist_ok=True)
    env = dict(isolated_env(), BUN_INSTALL_CACHE_DIR=str(cache), TMPDIR=str(temp), HUSKY='0')
    bun = shutil.which('bun')
    if not bun or subprocess.check_output([bun, '--version'], text=True).strip() != BUN_VERSION:
        raise RuntimeError('Build requires existing Bun ' + BUN_VERSION + '; no global installer is run')
    source = runtime / 'source/archon'
    if not source.exists():
        run(['git', 'clone', '--no-checkout', UPSTREAM, str(source)], ROOT, env)
        run(['git', 'checkout', '--detach', PIN], source, env)
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if head != PIN:
        raise RuntimeError('Source checkout does not match pinned commit')
    pristine = subprocess.check_output(['git', 'show', f'{PIN}:{RUNTIME_FILE}'], cwd=source, text=True)
    cleanup = (HERE / 'listener-cleanup.mjs').read_text()
    patched = patch_source(pristine)
    target = source / RUNTIME_FILE
    if target.read_text() not in (pristine, patched):
        raise RuntimeError('Runtime working source drift; refusing to overwrite')
    module = target.with_name('listener-cleanup.mjs')
    if module.exists() and module.read_text() != cleanup:
        raise RuntimeError('Cleanup module drift; refusing to overwrite')
    if sha(source / 'bun.lock') != LOCK_SHA:
        raise RuntimeError('Pinned dependency lock drift')
    # All other tracked source must still match the pin.
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=source, text=True).splitlines()
    if any(path != RUNTIME_FILE for path in changed):
        raise RuntimeError('Upstream working tree drift: ' + ', '.join(changed))
    target.write_text(patched)
    module.write_text(cleanup)
    run([bun, 'install', '--frozen-lockfile'], source, env)
    run([bun, 'run', 'scripts/generate-bundled-defaults.ts'], source, env)
    constants = source / 'packages/paths/src/bundled-build.ts'
    original = constants.read_text()
    candidate = runtime / 'bin/archon-repaired.candidate'
    try:
        constants.write_text("export const BUNDLED_IS_BINARY = true;\n"
            # serve uses this version for the public release URL and web-dist cache.
            # Local repair identity is recorded separately in the verified manifest.
            "export const BUNDLED_VERSION = '0.11.1';\n"
            f"export const BUNDLED_GIT_COMMIT = '{PIN}';\n"
            "export const BUNDLED_WEB_DIST_SHA256 = '';\n")
        run([bun, 'build', '--compile', '--minify', '--outfile', str(candidate), 'packages/cli/src/cli.ts'], source, env)
        run([str(candidate), '--version'], ROOT, env)
    finally:
        constants.write_text(original)
    binary = runtime / 'bin/archon-repaired'
    publish_candidate(candidate, binary)
    print('Built and verified: ' + str(select_binary()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'verify', 'exec', 'rollback', 'uninstall'])
    parser.add_argument('args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    os.umask(0o077)
    if args.action == 'build':
        build()
    elif args.action == 'verify':
        print(select_binary())
    elif args.action == 'exec':
        binary = select_binary()
        os.execve(str(binary), [str(binary), *args.args], os.environ.copy())
    elif args.action == 'uninstall':
        # No service commands, source deletion, global binaries or credentials touched.
        for name in ('archon-repaired', 'archon-repaired.json', 'archon-repaired.previous',
                     'archon-repaired.previous.json', 'archon-repaired.candidate',
                     'archon-repaired.json.candidate'):
            (ROOT / '.archon/runtime/bin' / name).unlink(missing_ok=True)
    else:
        binary = ROOT / '.archon/runtime/bin/archon-repaired'
        previous = binary.with_suffix('.previous')
        previous_manifest = binary.with_suffix('.previous.json')
        if not previous.is_file() or not previous_manifest.is_file():
            raise RuntimeError('No previous local build to roll back to')
        verify_binary(ROOT, previous, previous_manifest)
        shutil.copy2(previous, binary)
        shutil.copy2(previous_manifest, binary.with_suffix('.json'))
        print(select_binary())


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
