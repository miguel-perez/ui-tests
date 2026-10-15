import importlib.util
import json
import os
from pathlib import Path
import tempfile
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('runtime', Path(__file__).with_name('archon-runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
(runtime.ROOT / '.archon/runtime').mkdir(parents=True, exist_ok=True)


class RuntimeTests(unittest.TestCase):
    def test_serve_boot_environment_is_allowlisted_and_fresh(self):
        serve_spec = importlib.util.spec_from_file_location('serve', Path(__file__).with_name('verify-archon-serve.py'))
        serve = importlib.util.module_from_spec(serve_spec)
        serve_spec.loader.exec_module(serve)
        with patch.dict(os.environ, dict(HOME='/actual/home', PATH='/actual/path',
                        GITHUB_TOKEN='must-not-leak', ARCHON_HOME='/production',
                        DATABASE_URL='postgres://production', ARCHON_DOCKER='true',
                        WORKSPACE_PATH='/registered', ARCHON_WEBHOOK_SECRET='must-not-leak'), clear=True):
            env = serve.boot_env(Path('/fresh/ignored/home'))
        self.assertEqual(env, dict(HOME='/actual/home', PATH='/actual/path',
                         ARCHON_HOME='/fresh/ignored/home', HOST='127.0.0.1', DATABASE_URL='',
                         ARCHON_DOCKER='false', WORKSPACE_PATH='', ARCHON_TELEMETRY_DISABLED='1',
                         CLAUDE_USE_GLOBAL_AUTH='true'))

    def test_build_uses_official_web_asset_version_and_restores_constants(self):
        # Capture the actual compiler input, not just a version label in a fixture.
        # The old unpublished suffix would select a nonexistent GitHub release.
        import re
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            root = Path(temp)
            source = root / '.archon/runtime/source/archon'
            target = source / runtime.RUNTIME_FILE
            target.parent.mkdir(parents=True)
            target.write_text('pristine')
            (source / 'bun.lock').write_text('lock')
            constants = source / 'packages/paths/src/bundled-build.ts'
            constants.parent.mkdir(parents=True)
            constants.write_text('original constants')
            compiled = []
            def run(args, cwd, env):
                if args[1:3] == ['build', '--compile']:
                    version = re.search(r"BUNDLED_VERSION = '([^']+)'", constants.read_text()).group(1)
                    self.assertEqual(version, '0.11.1')
                    self.assertEqual(f'https://github.com/coleam00/Archon/releases/download/v{version}/archon-web.tar.gz',
                                     'https://github.com/coleam00/Archon/releases/download/v0.11.1/archon-web.tar.gz')
                    self.assertEqual(Path('web-dist') / version, Path('web-dist/0.11.1'))
                    compiled.append(version)
                    Path(args[args.index('--outfile') + 1]).write_text('compiled binary')
            def output(args, **kwargs):
                if args[-1] == '--version':
                    return runtime.BUN_VERSION + '\n'
                if args[1:3] == ['rev-parse', 'HEAD']:
                    return runtime.PIN + '\n'
                if args[1] == 'show':
                    return 'pristine'
                return ''
            with patch.object(runtime, 'ROOT', root), patch.object(runtime.shutil, 'which', return_value='/bun'), \
                    patch.object(runtime.subprocess, 'check_output', side_effect=output), \
                    patch.object(runtime, 'patch_source', return_value='patched'), \
                    patch.object(runtime, 'LOCK_SHA', runtime.sha(source / 'bun.lock')), \
                    patch.object(runtime, 'run', side_effect=run), patch.object(runtime, 'publish_candidate') as publish, \
                    patch.object(runtime, 'select_binary', return_value=root / 'binary'):
                runtime.build()
            self.assertEqual(compiled, ['0.11.1'])
            self.assertEqual(constants.read_text(), 'original constants')
            publish.assert_called_once()

    def test_isolated_state_does_not_inherit_live_database(self):
        with patch.dict(os.environ, DATABASE_URL='postgres://live', ARCHON_HOME='/live',
                        ARCHON_DOCKER='true', WORKSPACE_PATH='/workspace'):
            env = runtime.isolated_env()
        self.assertEqual(env['ARCHON_HOME'], str(runtime.ROOT / '.archon/runtime/home'))
        self.assertEqual(env['DATABASE_URL'], '')
        self.assertEqual(env['ARCHON_DOCKER'], 'false')
        self.assertEqual(env['WORKSPACE_PATH'], '')

    def test_exec_preserves_production_environment_and_default_home(self):
        production = dict(ARCHON_HOME='/production/home', DATABASE_URL='postgres://production',
                          ARCHON_DOCKER='true', WORKSPACE_PATH='/registered/source',
                          CALLER_SETTING='retained')
        for configured in (production, {'CALLER_SETTING': 'retained'}):
            with self.subTest(configured=configured), patch.dict(os.environ, configured, clear=True), \
                    patch.object(runtime, 'select_binary', return_value=Path('/verified/archon')), \
                    patch.object(runtime.sys, 'argv', ['runtime', 'exec', 'workflow', 'runs']), \
                    patch.object(runtime.os, 'execve') as execute:
                runtime.main()
                execute.assert_called_once_with('/verified/archon',
                                                ['/verified/archon', 'workflow', 'runs'], configured)

    def test_host_launch_preserves_production_state_without_starting_services(self):
        # Execute the real supervisor through its serve launch boundary, intercepting
        # all process/network calls. No live host, registration or service is touched.
        class LaunchCaptured(BaseException):
            pass

        script = (runtime.ROOT / 'scripts/start-archon.sh').read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
        production = dict(ARCHON_HOME='/production/home', DATABASE_URL='postgres://production',
                          ARCHON_DOCKER='true', WORKSPACE_PATH='/registered/source',
                          CALLER_SETTING='retained', ARCHON_LOCAL_BINARY='/verified/archon')
        allowed = dict(production, ARCHON_ALLOWED_USERS='alice,bob')
        for configured in (production, {'ARCHON_LOCAL_BINARY': '/verified/archon'}, allowed):
            with self.subTest(configured=configured), tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
                root = Path(temp)
                storage = root / '.archon/runtime'
                (storage / 'bin').mkdir(parents=True)
                (storage / 'bin/cloudflared').write_text('never executed')
                (storage / 'repository').write_text('miguel-perez/ui-tests')
                with patch.dict(os.environ, configured, clear=True), \
                        patch('sys.argv', ['supervisor', str(root), str(runtime.HERE)]), \
                        patch('signal.signal'), patch('shutil.which', return_value='/fake/gh'), \
                        patch('socket.socket') as socket, \
                        patch('subprocess.run', return_value=SimpleNamespace(stdout='test-token', returncode=0)), \
                        patch('subprocess.Popen', side_effect=LaunchCaptured) as launch:
                    socket.return_value.__enter__.return_value.connect_ex.return_value = 1
                    namespace = {}
                    try:
                        with self.assertRaises(LaunchCaptured):
                            exec(compile(script, 'start-archon.sh', 'exec'), namespace)
                    finally:
                        namespace['lock'].close()
                    self.assertEqual(launch.call_args.args[0],
                                     ['/verified/archon', 'serve', '--cwd', str(root), '--port', '3090', '--quiet'])
                    env = launch.call_args.kwargs['env']
                    for key in ('ARCHON_HOME', 'DATABASE_URL', 'ARCHON_DOCKER', 'WORKSPACE_PATH', 'CALLER_SETTING'):
                        if key in configured:
                            self.assertEqual(env[key], configured[key])
                        else:
                            self.assertNotIn(key, env)
                    expected_users = configured.get('ARCHON_ALLOWED_USERS', 'test-token')
                    self.assertEqual(env['GITHUB_ALLOWED_USERS'], expected_users)
                    self.assertEqual(launch.call_args.kwargs['cwd'], root)
                    namespace['run'] = lambda command, **kwargs: SimpleNamespace(returncode=0, stdout='{"id": 42}')
                    self.assertEqual(namespace['sync_webhook']('owner/name', 'https://t.trycloudflare.com', '', 'x' * 32, {}), '42')
                    self.assertEqual((storage / 'webhook-id').read_text(), '42\n')
                    namespace['run'] = lambda command, **kwargs: SimpleNamespace(returncode=1, stdout='')
                    self.assertIsNone(namespace['sync_webhook']('owner/name', 'https://t.trycloudflare.com', '42', 'x' * 32, {}))
                    namespace['run'] = lambda command, **kwargs: SimpleNamespace(returncode=0, stdout='not json')
                    (storage / 'webhook-id').unlink()
                    self.assertIsNone(namespace['sync_webhook']('owner/name', 'https://t.trycloudflare.com', '', 'x' * 32, {}))
                    self.assertFalse((storage / 'webhook-id').exists())

    def test_service_plist_retains_configured_production_state(self):
        import io
        import plistlib
        installer_spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-archon-service.py'))
        installer = importlib.util.module_from_spec(installer_spec)
        installer_spec.loader.exec_module(installer)
        production = dict(ARCHON_HOME='/production/home', DATABASE_URL='postgres://production',
                          ARCHON_DOCKER='true', WORKSPACE_PATH='/registered/source', ARCHON_ALLOWED_USERS='alice,bob')
        for configured in (production, {}):
            output = SimpleNamespace(buffer=io.BytesIO())
            with self.subTest(configured=configured), patch.dict(os.environ, {**configured, 'ARCHON_REPO_ROOT': str(runtime.ROOT)}, clear=True), \
                    patch.object(installer.sys, 'platform', 'darwin'), \
                    patch.object(installer.sys, 'argv', ['installer', '--dry-run']), \
                    patch.object(installer.sys, 'stdout', output), patch.object(installer.subprocess, 'run') as run:
                installer.main()
                run.assert_called_once()  # binary verification only; no launchctl
            env = plistlib.loads(output.buffer.getvalue())['EnvironmentVariables']
            self.assertEqual({key: env[key] for key in production if key in env}, configured)

    def test_smoke_launch_isolated_from_production_environment(self):
        smoke_spec = importlib.util.spec_from_file_location('smoke', Path(__file__).with_name('verify-archon-sol.py'))
        smoke = importlib.util.module_from_spec(smoke_spec)
        smoke_spec.loader.exec_module(smoke)
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp, \
                patch.object(smoke, 'ROOT', Path(temp)), \
                patch.object(smoke.runtime, 'ROOT', Path(temp)), \
                patch.object(smoke.runtime, 'select_binary', return_value=Path('/verified/archon')), \
                patch.dict(os.environ, ARCHON_HOME='/production/home', DATABASE_URL='postgres://production',
                           ARCHON_DOCKER='true', WORKSPACE_PATH='/registered/source'), \
                patch.object(smoke.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='', stderr='test failure')) as run:
            with self.assertRaisesRegex(RuntimeError, 'Sol smoke failed'):
                smoke.main()
            env = run.call_args.kwargs['env']
            self.assertEqual(env['ARCHON_HOME'], str(Path(temp) / '.archon/runtime/home'))
            self.assertEqual(env['DATABASE_URL'], '')
            self.assertEqual(env['ARCHON_DOCKER'], 'false')
            self.assertEqual(env['WORKSPACE_PATH'], '')

    def test_patch_refuses_source_drift(self):
        with self.assertRaisesRegex(RuntimeError, 'source drift'):
            runtime.patch_source('changed upstream')

    def test_interrupted_publication_recovers_without_corrupting_previous_pair(self):
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            binary = Path(temp) / 'archon-repaired'
            candidate = Path(temp) / 'archon-repaired.candidate'
            manifest = binary.with_suffix('.json')
            binary.write_text('old verified build')
            old_manifest = json.dumps(dict(pin=runtime.PIN, binary_sha256=runtime.sha(binary)))
            manifest.write_text(old_manifest)
            candidate.write_text('new build')
            replace = Path.replace
            def interrupt_manifest(path, target):
                if path.name.endswith('.json.candidate'):
                    raise OSError('simulated interrupted manifest swap')
                return replace(path, target)
            with patch.object(Path, 'replace', interrupt_manifest):
                with self.assertRaisesRegex(OSError, 'interrupted'):
                    runtime.publish_candidate(candidate, binary)
            self.assertEqual(binary.read_text(), 'new build')
            self.assertEqual(manifest.read_text(), old_manifest)
            candidate.write_text('new build')
            runtime.publish_candidate(candidate, binary)
            self.assertEqual(binary.with_suffix('.previous').read_text(), 'old verified build')
            self.assertEqual(binary.with_suffix('.previous.json').read_text(), old_manifest)
            self.assertEqual(json.loads(manifest.read_text())['binary_sha256'], runtime.sha(binary))
            self.assertFalse(manifest.with_suffix('.json.candidate').exists())
            binary.write_text('unrelated replaced binary')
            candidate.write_text('new build')
            with self.assertRaisesRegex(RuntimeError, 'identity drift'):
                runtime.publish_candidate(candidate, binary)
            self.assertEqual(binary.read_text(), 'unrelated replaced binary')

    def test_installer_plist_points_at_sibling_start_script_and_root(self):
        import io
        import plistlib
        installer_spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-archon-service.py'))
        installer = importlib.util.module_from_spec(installer_spec)
        installer_spec.loader.exec_module(installer)
        output = SimpleNamespace(buffer=io.BytesIO())
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp, \
                patch.object(installer.sys, 'platform', 'darwin'), patch.object(installer.sys, 'argv', ['installer', '--dry-run']), \
                patch.object(installer.sys, 'stdout', output), patch.object(installer.subprocess, 'run') as run, \
                patch.dict(os.environ, ARCHON_REPO_ROOT=temp):
            installer.main()
            expected_root = str(Path(temp).resolve())
        verify_call = run.call_args.args[0]
        self.assertEqual(verify_call[1:], [str(runtime.HERE / 'archon-runtime.py'), 'verify'])
        plist = plistlib.loads(output.buffer.getvalue())
        self.assertEqual(plist['ProgramArguments'], ['/bin/bash', str(runtime.HERE / 'start-archon.sh')])
        self.assertEqual(plist['WorkingDirectory'], expected_root)
        self.assertEqual(plist['EnvironmentVariables']['ARCHON_REPO_ROOT'], expected_root)

    def test_shell_scripts_resolve_root_from_env_then_git(self):
        import subprocess as real_subprocess
        probe = "source /dev/stdin <<'EOF'\n" + \
            (runtime.HERE / 'start-archon.sh').read_text().split('# Verify before', 1)[0].replace('set -euo pipefail', '').replace('${BASH_SOURCE[0]:-.}', '.') + \
            "EOF\necho \"$ARCHON_REPO_ROOT\""
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            configured = real_subprocess.run(['bash', '-c', probe], capture_output=True, text=True,
                                             env=dict(os.environ, ARCHON_REPO_ROOT=temp))
            self.assertEqual(Path(configured.stdout.strip()).resolve(), Path(temp).resolve())
        env = dict(os.environ)
        env.pop('ARCHON_REPO_ROOT', None)
        detected = real_subprocess.run(['bash', '-c', probe], capture_output=True, text=True, env=env, cwd=runtime.HERE)
        self.assertEqual(Path(detected.stdout.strip()).resolve(), runtime.ROOT)

    def test_selection_fails_closed(self):
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            root = Path(temp)
            binary = root / '.archon/runtime/bin/archon-repaired'
            binary.parent.mkdir(parents=True)
            with self.assertRaisesRegex(RuntimeError, 'Missing/not executable'):
                runtime.select_binary(root)
            binary.write_text('wrong global binary')
            binary.chmod(0o600)
            with self.assertRaisesRegex(RuntimeError, 'Missing/not executable'):
                runtime.select_binary(root)
            binary.chmod(0o700)
            with self.assertRaisesRegex(RuntimeError, 'Wrong/unverified'):
                runtime.select_binary(root)
            data = dict(pin=runtime.PIN, source_sha256=runtime.SOURCE_SHA, lock_sha256=runtime.LOCK_SHA,
                        bun=runtime.BUN_VERSION, repair_sha256=runtime.sha(runtime.HERE / 'listener-cleanup.mjs'),
                        builder_sha256=runtime.sha(runtime.HERE / 'archon-runtime.py'), binary_sha256=runtime.sha(binary))
            manifest = binary.with_suffix('.json')
            manifest.write_text(json.dumps(data))
            self.assertEqual(runtime.select_binary(root), binary)
            binary.write_text('replaced binary')
            with self.assertRaisesRegex(RuntimeError, 'Wrong/unverified'):
                runtime.select_binary(root)
            binary.unlink()
            binary.symlink_to('/usr/bin/true')
            with self.assertRaisesRegex(RuntimeError, 'Missing/not executable'):
                runtime.select_binary(root)

    def test_startup_and_install_verify_before_host_side_effects(self):
        import subprocess
        # Use a scratch copy with the real scripts and no binary. A fake global archon
        # would leave a marker if startup silently fell back to PATH.
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            root = Path(temp)
            scripts = root / 'scripts'
            scripts.mkdir()
            for name in ['start-archon.sh', 'install-archon-service.py', 'archon-runtime.py']:
                (scripts / name).write_bytes((runtime.ROOT / 'scripts' / name).read_bytes())
            marker = root / 'global-called'
            fake = root / 'archon'
            fake.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\n')
            fake.chmod(0o700)
            binary = root / '.archon/runtime/bin/archon-repaired'
            for mode, message in [(None, b'Missing/not executable'), (0o600, b'Missing/not executable'),
                                  (0o700, b'Wrong/unverified')]:
                if mode is not None:
                    binary.parent.mkdir(parents=True, exist_ok=True)
                    binary.write_text('#!/bin/sh\nexit 0\n')
                    binary.chmod(mode)
                result = subprocess.run(['bash', str(scripts / 'start-archon.sh')], capture_output=True,
                                        env=dict(os.environ, PATH=str(root) + ':' + os.environ['PATH'],
                                                 ARCHON_REPO_ROOT=str(root)))
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertFalse(marker.exists())
                self.assertFalse((root / '.archon/runtime/supervisor.json').exists())
                self.assertFalse((root / '.archon/runtime/supervisor.lock').exists())
            installer_spec = importlib.util.spec_from_file_location('installer', scripts / 'install-archon-service.py')
            installer = importlib.util.module_from_spec(installer_spec)
            installer_spec.loader.exec_module(installer)
            with patch.object(installer.sys, 'platform', 'darwin'), patch.object(installer.sys, 'argv', ['install']), \
                    patch.dict(os.environ, ARCHON_REPO_ROOT=str(root)):
                with self.assertRaises(subprocess.CalledProcessError):
                    installer.main()

    def test_rollback_rejects_wrong_previous_before_replacing_current(self):
        with tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp:
            root = Path(temp)
            binary = root / '.archon/runtime/bin/archon-repaired'
            binary.parent.mkdir(parents=True)
            binary.write_text('current')
            binary.with_suffix('.previous').write_text('wrong previous')
            binary.with_suffix('.previous.json').write_text('{}')
            with patch.object(runtime, 'ROOT', root), patch.object(runtime.sys, 'argv', ['runtime', 'rollback']):
                with self.assertRaises(RuntimeError):
                    runtime.main()
            self.assertEqual(binary.read_text(), 'current')
            secret = root / '.archon/runtime/webhook-secret'
            secret.write_text('retained')
            with patch.object(runtime, 'ROOT', root), patch.object(runtime.sys, 'argv', ['runtime', 'uninstall']):
                runtime.main()
            self.assertFalse(binary.exists())
            self.assertFalse(binary.with_suffix('.previous').exists())
            self.assertEqual(secret.read_text(), 'retained')

    def test_smoke_proof_requires_real_terminal_provenance(self):
        smoke_spec = importlib.util.spec_from_file_location('smoke', Path(__file__).with_name('verify-archon-sol.py'))
        smoke = importlib.util.module_from_spec(smoke_spec)
        smoke_spec.loader.exec_module(smoke)
        detail = {'status': 'completed', 'terminal_record': {'status': 'completed'}}
        with self.assertRaisesRegex(RuntimeError, 'node_complete'):
            smoke.check_evidence(detail, [])
        attempt = dict(binding=dict(provider='opencode', model=dict(requested='openai/gpt-6.1-sol',
                       resolved={'source': 'provider', 'value': 'gpt-6.1-sol'})),
                       spend={'stopReason': {'source': 'provider', 'value': 'stop'}},
                       lifecycle={'status': 'completed'})
        rows = [dict(type='node_complete', step='smoke', execution=attempt),
                dict(type='assistant', content='SOL_RUNTIME_SMOKE_OK')]
        self.assertEqual(smoke.check_evidence(detail, rows), attempt)
        rows.append(dict(type='assistant', content='different reply'))
        with self.assertRaisesRegex(RuntimeError, 'assistant reply'):
            smoke.check_evidence(detail, rows)
        rows.pop()
        with self.assertRaisesRegex(RuntimeError, 'assistant reply'):
            smoke.check_evidence(detail, rows[:1])
        attempt['binding']['model']['resolved']['source'] = 'configured'
        with self.assertRaisesRegex(RuntimeError, 'provenance'):
            smoke.check_evidence(detail, rows)

    def test_repo_root_prefers_configured_then_git_then_parent(self):
        import subprocess as real_subprocess
        with patch.dict(os.environ, ARCHON_REPO_ROOT=str(runtime.HERE)):
            self.assertEqual(runtime.repo_root(), runtime.HERE)
        with patch.dict(os.environ, ARCHON_REPO_ROOT=str(runtime.HERE / 'missing')):
            with self.assertRaisesRegex(RuntimeError, 'not a directory'):
                runtime.repo_root()
        with patch.dict(os.environ):
            os.environ.pop('ARCHON_REPO_ROOT', None)
            top = real_subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=runtime.HERE, text=True).strip()
            self.assertEqual(runtime.repo_root(), Path(top).resolve())
            with patch.object(runtime.subprocess, 'run', side_effect=OSError('no git')):
                self.assertEqual(runtime.repo_root(), runtime.HERE.parent)


class ServeTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('serve', Path(__file__).with_name('verify-archon-serve.py'))
        self.serve = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.serve)

    def test_listener_lookup_is_bounded_and_listener_only_on_both_platforms(self):
        for platform in ('darwin', 'win32'):
            with self.subTest(platform=platform), patch.object(self.serve.sys, 'platform', platform), \
                    patch.object(self.serve.subprocess, 'check_output', return_value='123\n123\n') as lookup:
                self.assertEqual(self.serve.listener_owners(43210), ['123', '123'])
                self.assertEqual(lookup.call_args.kwargs, dict(text=True, timeout=10))
                command = lookup.call_args.args[0]
                if platform == 'win32':
                    self.assertEqual(command[:3], ['powershell.exe', '-NoProfile', '-NonInteractive'])
                    self.assertIn('-LocalPort 43210 -State Listen -ErrorAction Stop', command[-1])
                    self.assertIn('OwningProcess', command[-1])
                else:
                    self.assertEqual(command, ['lsof', '-nP', '-iTCP:43210', '-sTCP:LISTEN', '-t'])

    def test_lookup_timeout_still_stops_isolated_server_on_both_platforms(self):
        for platform in ('darwin', 'win32'):
            child = Mock(pid=123, returncode=0)
            child.poll.side_effect = [None, None, 0] if platform == 'win32' else [None, None]
            with self.subTest(platform=platform), tempfile.TemporaryDirectory(dir=runtime.ROOT / '.archon/runtime') as temp, \
                    patch.object(self.serve, 'ROOT', Path(temp)), \
                    patch.object(self.serve.sys, 'platform', platform), \
                    patch.object(self.serve.runtime, 'select_binary', return_value=Path('/verified/archon')), \
                    patch.object(self.serve.subprocess, 'Popen', return_value=child) as launch, \
                    patch.object(self.serve, 'urlopen') as request, \
                    patch.object(self.serve.subprocess, 'check_output', side_effect=subprocess.TimeoutExpired('lookup', 10)), \
                    patch.object(self.serve.os, 'killpg', create=True) as killpg, \
                    patch.object(self.serve.subprocess, 'run') as taskkill:
                request.return_value.__enter__.return_value.status = 200
                with self.assertRaises(subprocess.TimeoutExpired):
                    self.serve.main()
                self.assertEqual(launch.call_args.kwargs['start_new_session'], platform != 'win32')
                child.wait.assert_called_once()
                if platform == 'win32':
                    killpg.assert_not_called()
                    self.assertEqual(taskkill.call_args.args[0], ['taskkill.exe', '/PID', '123', '/T', '/F'])
                    self.assertEqual(taskkill.call_args.kwargs['timeout'], 10)
                else:
                    taskkill.assert_not_called()
                    killpg.assert_called_once_with(123, self.serve.signal.SIGTERM)

    def test_windows_failed_tree_cleanup_still_kills_and_reaps_child(self):
        child = Mock(pid=123)
        child.poll.return_value = None
        with patch.object(self.serve.sys, 'platform', 'win32'), \
                patch.object(self.serve.subprocess, 'run', side_effect=subprocess.TimeoutExpired('taskkill', 10)), \
                patch.object(self.serve.os, 'killpg', create=True) as killpg:
            with self.assertRaises(subprocess.TimeoutExpired):
                self.serve.stop_child(child)
        killpg.assert_not_called()
        child.kill.assert_called_once()
        child.wait.assert_called_once_with(timeout=10)

    def test_unix_shutdown_escalates_only_the_child_group(self):
        child = Mock(pid=123)
        child.poll.return_value = None
        child.wait.side_effect = [subprocess.TimeoutExpired('serve', 15), 0]
        with patch.object(self.serve.sys, 'platform', 'darwin'), \
                patch.object(self.serve.os, 'killpg', create=True) as killpg:
            self.serve.stop_child(child)
        self.assertEqual([call.args for call in killpg.call_args_list],
                         [(123, self.serve.signal.SIGTERM), (123, self.serve.signal.SIGKILL)])

    def test_windows_boot_env_preserves_only_required_os_settings(self):
        with patch.object(self.serve.sys, 'platform', 'win32'), \
                patch.dict(os.environ, dict(USERPROFILE='C:\\Users\\tester', PATH='C:\\bin',
                           SystemRoot='C:\\Windows', WINDIR='C:\\Windows',
                           GITHUB_TOKEN='must-not-leak', DATABASE_URL='production'), clear=True):
            env = self.serve.boot_env(Path('/fresh/home'))
        self.assertEqual(env['HOME'], 'C:\\Users\\tester')
        self.assertEqual(env['USERPROFILE'], env['HOME'])
        self.assertEqual(env['SystemRoot'], 'C:\\Windows')
        self.assertEqual(env['WINDIR'], 'C:\\Windows')
        self.assertEqual(env['DATABASE_URL'], '')
        self.assertNotIn('GITHUB_TOKEN', env)


if __name__ == '__main__':
    (runtime.ROOT / '.archon/runtime').mkdir(parents=True, exist_ok=True)
    unittest.main()
