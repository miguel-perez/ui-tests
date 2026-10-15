#!/usr/bin/env python3
"""Prove official web assets and isolated host readiness; never manage production."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import uuid

spec = importlib.util.spec_from_file_location('runtime', Path(__file__).with_name('archon-runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
ROOT = runtime.ROOT


def boot_env(home):
    # Allowlist only: no platform credentials, webhook/trigger config or .env cwd.
    env = dict(HOME=os.environ.get('HOME') or os.environ['USERPROFILE'], PATH=os.environ['PATH'],
                ARCHON_HOME=str(home), HOST='127.0.0.1', DATABASE_URL='',
                ARCHON_DOCKER='false', WORKSPACE_PATH='', ARCHON_TELEMETRY_DISABLED='1',
                CLAUDE_USE_GLOBAL_AUTH='true')  # startup posture only; no model execution
    if sys.platform == 'win32':
        for key in ('SystemRoot', 'WINDIR', 'USERPROFILE'):
            if key in os.environ:
                env[key] = os.environ[key]
    return env


def listener_owners(port):
    if sys.platform == 'win32':
        command = ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                   f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction Stop | "
                   'Select-Object -ExpandProperty OwningProcess']
    else:
        command = ['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN', '-t']
    return subprocess.check_output(command, text=True, timeout=10).split()


def stop_child(child):
    if child.poll() is not None:
        return
    if sys.platform == 'win32':
        # Target only the spawned server's tree, never all processes by image name.
        try:
            subprocess.run(['taskkill.exe', '/PID', str(child.pid), '/T', '/F'],
                           check=True, capture_output=True, timeout=10)
        finally:
            # Even a failed/timed-out tree lookup must not leave our server alive.
            if child.poll() is None:
                child.kill()
            child.wait(timeout=10)
        return
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=15)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait(timeout=10)


def main():
    os.umask(0o077)
    binary = runtime.select_binary()
    evidence = ROOT / '.archon/runtime/evidence' / ('serve-boot-' + uuid.uuid4().hex)
    cwd = evidence / 'cwd'
    home = evidence / 'home'
    cwd.mkdir(parents=True)
    home.mkdir()
    env = boot_env(home)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    command = [str(binary), 'serve', '--port', str(port), '--quiet']
    child = None
    try:
        with (evidence / 'serve.log').open('w') as log:
            child = subprocess.Popen(command, cwd=cwd, env=env, stdout=log,
                                     stderr=subprocess.STDOUT,
                                     start_new_session=sys.platform != 'win32')
            deadline = time.monotonic() + 180
            while True:
                if child.poll() is not None:
                    raise RuntimeError(f'Isolated serve exited {child.returncode}; inspect {evidence}')
                try:
                    with urlopen(f'http://127.0.0.1:{port}/health', timeout=2) as response:
                        if response.status == 200:
                            break
                except (URLError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError(f'Isolated serve readiness timed out; inspect {evidence}')
                time.sleep(0.25)
            owners = listener_owners(port)
            if set(owners) != {str(child.pid)}:
                raise RuntimeError('Readiness listener is not exclusively owned by isolated child')
            responses = {}
            for endpoint in ('/health', '/health/db', '/api/health', '/'):
                with urlopen(f'http://127.0.0.1:{port}{endpoint}', timeout=10) as response:
                    body = response.read().decode()
                    responses[endpoint] = dict(status=response.status,
                                               content_type=response.headers.get('Content-Type'),
                                               body=body)
                    if response.status != 200:
                        raise RuntimeError('Unhealthy endpoint: ' + endpoint)
            (evidence / 'http.json').write_text(json.dumps(responses, indent=2) + '\n')
            health = json.loads(responses['/api/health']['body'])
            if (json.loads(responses['/health']['body']) != {'status': 'ok'}
                    or json.loads(responses['/health/db']['body']) != {'status': 'ok', 'database': 'connected'}
                    or health['status'] != 'ok' or health['activePlatforms'] != ['Web']
                    or health['runningWorkflows'] != 0 or health['concurrency']['active'] != 0
                    or health['version'] != '0.11.1' or health['is_docker']):
                raise RuntimeError('Expected healthy official-version Web-only idle host')
            if '<html' not in responses['/']['body'].lower():
                raise RuntimeError('Root did not serve web UI HTML')
    finally:
        # Only our child tree/group; no host start/stop/install scripts.
        if child is not None:
            stop_child(child)
    log_text = (evidence / 'serve.log').read_text()
    cache = home / 'web-dist/0.11.1'
    if (not (cache / 'index.html').is_file() or 'release v0.11.1' not in log_text
            or 'Checksum verified.' not in log_text):
        raise RuntimeError('Fresh official asset download/checksum/cache not proven')
    # Reuse the newly populated isolated cache only, proving the second path too.
    cached = subprocess.run([str(binary), 'serve', '--download-only', '--quiet'],
                            cwd=cwd, env=env, capture_output=True, text=True, timeout=30)
    (evidence / 'cache.log').write_text(cached.stdout + cached.stderr)
    cached.check_returncode()
    if 'downloading from release' in cached.stdout or str(cache) not in cached.stdout:
        raise RuntimeError('Official asset cache reuse not proven')
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError('Isolated listener still present after child shutdown')
    summary = dict(binary_sha256=runtime.sha(binary),
                   manifest=json.loads(binary.with_suffix('.json').read_text()),
                   command=command, cwd=str(cwd), env=env, pid=child.pid, port=port,
                   listener_owners=owners, health=health, endpoints=list(responses),
                   asset_version='0.11.1', asset_index_sha256=runtime.sha(cache / 'index.html'),
                   fresh_download_checksum_verified=True, cache_reused=True,
                   child_returncode=child.returncode, listener_stopped=True)
    (evidence / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    print('Evidence: ' + str(evidence))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError, OSError, KeyError, ValueError) as error:
        sys.exit(str(error))
