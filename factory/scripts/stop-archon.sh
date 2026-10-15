#!/bin/bash
# Stop only this repository's launch agent and supervised child processes.
set -euo pipefail
ARCHON_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
archon_repo_root() {
    if [ -n "${ARCHON_REPO_ROOT:-}" ]; then
        (cd "$ARCHON_REPO_ROOT" && pwd)
    elif top="$(git -C "$ARCHON_SCRIPTS_DIR" rev-parse --show-toplevel 2>/dev/null)" && [ -n "$top" ]; then
        printf '%s\n' "$top"
    else
        (cd "$ARCHON_SCRIPTS_DIR/.." && pwd)
    fi
}
ARCHON_REPO_ROOT="$(archon_repo_root)"
exec /usr/bin/python3 - "$ARCHON_REPO_ROOT" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
runtime = root / ".archon/runtime"
suffix = hashlib.sha256(str(root).encode()).hexdigest()[:8]
label = "com.archon." + root.name.replace(" ", "-") + "." + suffix
service = "gui/" + str(os.getuid()) + "/" + label
if subprocess.run(["launchctl", "print", service], capture_output=True).returncode == 0:
    subprocess.run(["launchctl", "bootout", service], check=True)
state_file = runtime / "supervisor.json"
if state_file.exists():
    state = json.loads(state_file.read_text())
    pid = int(state["pid"])
    started = subprocess.run(["/bin/ps", "-p", str(pid), "-o", "lstart="], capture_output=True, text=True).stdout.strip()
    if state.get("repo") == str(root) and started and started == state.get("started"):
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        for _ in range(45):
            if not state_file.exists():
                break
            time.sleep(1)
        else:
            sys.exit("Stop requested, but shutdown is still pending; inspect .archon/runtime/service.log.")
print("Archon stopped for " + root.name + ". The installed service starts again at login.")
PY
