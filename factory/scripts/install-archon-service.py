#!/usr/bin/env python3
"""Install this repository's Archon host as a macOS user launch agent."""

import argparse
import hashlib
import importlib.util
import os
from pathlib import Path
import plistlib
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Print the plist without installing or starting it")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("This installer requires macOS launchd")
    here = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location("runtime", here / "archon-runtime.py")
    runtime_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runtime_module)
    root = runtime_module.ROOT
    runtime = root / ".archon/runtime"
    # Fail before touching launchd, even for --dry-run, if the repair is absent/stale.
    subprocess.run([sys.executable, str(here / "archon-runtime.py"), "verify"], check=True,
                   stdout=subprocess.DEVNULL)
    suffix = hashlib.sha256(str(root).encode()).hexdigest()[:8]
    label = "com.archon." + root.name.replace(" ", "-") + "." + suffix
    target = Path.home() / "Library/LaunchAgents" / (label + ".plist")
    service = "gui/" + str(os.getuid()) + "/" + label
    plist = {
        "Label": label,
        "ProgramArguments": ["/bin/bash", str(here / "start-archon.sh")],
        "WorkingDirectory": str(root),
        "RunAtLoad": True,
        "KeepAlive": {"SuccessfulExit": False},
        "ThrottleInterval": 30,
        "ExitTimeOut": 45,
        "ProcessType": "Background",
        "StandardOutPath": str(runtime / "service.log"),
        "StandardErrorPath": str(runtime / "service-error.log"),
        "EnvironmentVariables": {"PATH": str(Path.home() / ".bun/bin") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"},
    }
    plist["EnvironmentVariables"]["ARCHON_REPO_ROOT"] = str(root)
    # launchd does not inherit the installing shell's production state selection.
    # Leave absent values absent so Archon's existing defaults still apply.
    for key in ("ARCHON_HOME", "DATABASE_URL", "ARCHON_DOCKER", "WORKSPACE_PATH", "ARCHON_ALLOWED_USERS"):
        if key in os.environ:
            plist["EnvironmentVariables"][key] = os.environ[key]
    contents = plistlib.dumps(plist)
    if args.dry_run:
        sys.stdout.buffer.write(contents)
        return
    os.umask(0o077)
    runtime.mkdir(parents=True, exist_ok=True)
    runtime.chmod(0o700)
    target.parent.mkdir(parents=True, exist_ok=True)
    if subprocess.run(["launchctl", "print", service], capture_output=True).returncode == 0:
        subprocess.run(["launchctl", "bootout", service], check=True)
    target.write_bytes(contents)
    target.chmod(0o600)
    (runtime / "service-label").write_text(label + "\n")
    subprocess.run(["launchctl", "enable", service], check=True)
    subprocess.run(["launchctl", "bootstrap", "gui/" + str(os.getuid()), str(target)], check=True)
    print("Installed and started " + label)
    print("Logs: " + str(runtime / "service.log"))


if __name__ == "__main__":
    main()
