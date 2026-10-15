#!/usr/bin/env python3
"""Real provider smoke; retain proof in ignored runtime without starting the host."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

spec = importlib.util.spec_from_file_location('runtime', Path(__file__).with_name('archon-runtime.py'))
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
ROOT = runtime.ROOT


def check_evidence(detail, rows):
    if detail.get('status') != 'completed' or detail.get('terminal_record', {}).get('status') != 'completed':
        raise RuntimeError('No completed persisted terminal record')
    complete = [row for row in rows if row.get('type') == 'node_complete' and row.get('step') == 'smoke']
    if len(complete) != 1:
        raise RuntimeError('Expected one persisted smoke node_complete')
    attempt = complete[0]['execution']
    binding = attempt['binding']
    if (binding['provider'] != 'opencode' or binding['model']['requested'] != 'openai/gpt-6.1-sol'
            or binding['model']['resolved'] != {'source': 'provider', 'value': 'gpt-6.1-sol'}
            or attempt['spend']['stopReason'] != {'source': 'provider', 'value': 'stop'}
            or attempt['lifecycle']['status'] != 'completed'):
        raise RuntimeError('Terminal provider/model/stop provenance did not match Sol')
    # The provider may also echo the prompt as an assistant event. Validate the
    # final persisted reply, rather than matching the expected text anywhere.
    replies = [row.get('content') for row in rows if row.get('type') == 'assistant']
    if not replies or replies[-1] != 'SOL_RUNTIME_SMOKE_OK':
        raise RuntimeError('Persisted assistant reply did not match SOL_RUNTIME_SMOKE_OK')
    return attempt


def main():
    os.umask(0o077)
    binary = runtime.select_binary()
    name = 'sol-runtime-smoke-' + uuid.uuid4().hex
    evidence = ROOT / '.archon/runtime/evidence' / name
    workflows = evidence / 'source/.archon/workflows'
    workflows.mkdir(parents=True)
    (workflows / 'smoke.yaml').write_text(f'''name: {name}
description: |
  Verify issue 63 runtime cleanup now, because the old lookup could kill its
  workflow client before terminal persistence. Acceptance: real exact Sol
  response, persisted node_complete and completed terminal record. No product
  edits, process changes or permission changes; retain proof in ignored runtime.
provider: opencode
model: openai/gpt-6.1-sol
worktree:
  enabled: false
nodes:
  - id: smoke
    context: fresh
    prompt: |
      This is a minimal runtime persistence diagnostic for issue 63. Do not use
      tools, modify files, run commands or inspect the computer. Reply exactly:
      SOL_RUNTIME_SMOKE_OK
''')
    env = runtime.isolated_env()
    def cli(*args):
        return subprocess.run([str(binary), 'workflow', *args], cwd=ROOT, env=env,
                              capture_output=True, text=True, timeout=180)
    result = cli('run', name, '--workflow-source', str(evidence / 'source'), '--no-worktree')
    (evidence / 'run.log').write_text(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError('Sol smoke failed; inspect ' + str(evidence / 'run.log'))
    runs = cli('runs', '--json')
    runs.check_returncode()
    matching = [run for run in json.loads(runs.stdout)['runs'] if run['workflow_name'] == name]
    if len(matching) != 1:
        raise RuntimeError('Cannot uniquely identify persisted smoke run')
    run_id = matching[0]['id']
    response = cli('get', run_id, '--json', '--events')
    response.check_returncode()
    (evidence / 'terminal.json').write_text(response.stdout)
    detail = json.loads(response.stdout)
    transcript = Path(detail['transcript_path']).resolve()
    if not transcript.is_relative_to(ROOT / '.archon/runtime'):
        raise RuntimeError('Transcript escaped repository runtime')
    text = transcript.read_text()
    (evidence / 'transcript.jsonl').write_text(text)
    attempt = check_evidence(detail, [json.loads(line) for line in text.splitlines()])
    summary = dict(run_id=run_id, status=detail['status'], terminal_record=detail['terminal_record']['status'],
                   node_complete=True, binding=attempt['binding'], stop_reason=attempt['spend']['stopReason'],
                   binary_sha256=runtime.sha(binary), manifest=json.loads(binary.with_suffix('.json').read_text()))
    (evidence / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    print('Evidence: ' + str(evidence))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.SubprocessError, KeyError, ValueError) as error:
        sys.exit(str(error))
