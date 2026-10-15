#!/bin/bash
# Run in the foreground, or install the launchd service for login persistence.
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
export ARCHON_REPO_ROOT
export PATH="${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
# Verify before creating supervisor state or launching any service. No PATH fallback.
ARCHON_LOCAL_BINARY="$(python3 "$ARCHON_SCRIPTS_DIR/archon-runtime.py" verify)"
export ARCHON_LOCAL_BINARY
exec /usr/bin/python3 - "$ARCHON_REPO_ROOT" "$ARCHON_SCRIPTS_DIR" <<'PY'
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time

root = Path(sys.argv[1]).resolve()
scripts_dir = Path(sys.argv[2]).resolve()
runtime = root / ".archon/runtime"
os.umask(0o077)
runtime.mkdir(parents=True, exist_ok=True)
runtime.chmod(0o700)
lock = (runtime / "supervisor.lock").open("w")
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit("Archon supervisor is already running for this repository.")

stopping = False
children = []
handles = []

def stop(_sig, _frame):
    global stopping
    stopping = True

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)

def log(message):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), message, flush=True)

def atomic_write(path, text):
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(text)
    temp.chmod(0o600)
    temp.replace(path)

def run(command, **kwargs):
    return subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=30, **kwargs)

def launch(command, name, env, truncate=False):
    handle = (runtime / name).open("w" if truncate else "a")
    handles.append(handle)
    child = subprocess.Popen(command, cwd=root, env=env, stdin=subprocess.DEVNULL,
                             stdout=handle, stderr=subprocess.STDOUT, start_new_session=True)
    children.append(child)
    return child

def cleanup():
    for child in children:
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.monotonic() + 8
    for child in children:
        try:
            child.wait(timeout=max(0.1, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
    children.clear()
    for handle in handles:
        handle.close()
    handles.clear()

def port_open(port):
    with socket.socket() as connection:
        connection.settimeout(0.5)
        return connection.connect_ex(("127.0.0.1", port)) == 0

def wait_port(port):
    for _ in range(120):
        if stopping or any(child.poll() is not None for child in children):
            raise RuntimeError("A local service stopped before becoming ready; inspect its runtime log.")
        if port_open(port):
            return
        time.sleep(1)
    raise RuntimeError("Local service startup timed out; inspect the runtime logs.")

WEBHOOK_EVENTS = ["check_run", "issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment"]

def sync_webhook(repository, url, hook_id, secret, env):
    """Point the saved hook at url, creating one when none is saved. Returns the hook id, or None to retry."""
    config = {"url": url + "/webhooks/github", "content_type": "json", "secret": secret, "insecure_ssl": "0"}
    if hook_id.isdigit():
        result = run([gh, "api", "--method", "PATCH", "repos/" + repository + "/hooks/" + hook_id, "--input", "-"],
                     input=json.dumps({"config": config, "active": True}), env=env)
        return hook_id if result.returncode == 0 else None
    result = run([gh, "api", "--method", "POST", "repos/" + repository + "/hooks", "--input", "-"],
                 input=json.dumps({"name": "web", "active": True, "events": WEBHOOK_EVENTS, "config": config}), env=env)
    if result.returncode != 0:
        return None
    try:
        created = str(json.loads(result.stdout)["id"])
    except (ValueError, KeyError, TypeError):
        return None
    if not created.isdigit():
        return None
    atomic_write(runtime / "webhook-id", created + "\n")
    return created

archon = os.environ["ARCHON_LOCAL_BINARY"]
gh = shutil.which("gh")
cloudflared = runtime / "bin/cloudflared"
if not archon or not gh or not cloudflared.is_file():
    sys.exit("Required: verified local Archon, authenticated gh, and .archon/runtime/bin/cloudflared.")
secret_path = runtime / "webhook-secret"
if not secret_path.exists():
    with secret_path.open("x") as handle:
        handle.write(secrets.token_hex(32) + "\n")
secret_path.chmod(0o600)
secret = secret_path.read_text().strip()
if len(secret) < 32:
    sys.exit("Webhook secret must contain at least 32 characters.")

started = run(["/bin/ps", "-p", str(os.getpid()), "-o", "lstart="]).stdout.strip()
atomic_write(runtime / "supervisor.json", json.dumps({"pid": os.getpid(), "started": started, "repo": str(root)}))
try:
    while not stopping:
        try:
            if port_open(3090) or port_open(3091):
                raise RuntimeError("Port 3090 or 3091 is already in use; refusing to expose an unrelated server.")
            auth = run([gh, "auth", "token", "--hostname", "github.com"])
            if auth.returncode or not auth.stdout.strip():
                raise RuntimeError("GitHub authentication unavailable. Run gh auth login, then restart.")
            env = os.environ.copy()
            env.update({"GITHUB_TOKEN": auth.stdout.strip(), "WEBHOOK_SECRET": secret,
                        "GITHUB_BOT_MENTION": "archon", "HOST": "127.0.0.1"})
            allowed = os.environ.get("ARCHON_ALLOWED_USERS", "").strip()
            if not allowed:
                login = run([gh, "api", "user", "--jq", ".login"], env=env)
                allowed = login.stdout.strip() if login.returncode == 0 else ""
            if not re.fullmatch(r"[A-Za-z0-9-]+(,[A-Za-z0-9-]+)*", allowed):
                raise RuntimeError("Cannot resolve allowed GitHub users; set ARCHON_ALLOWED_USERS to comma-separated logins.")
            env["GITHUB_ALLOWED_USERS"] = allowed
            repo_file = runtime / "repository"
            if repo_file.exists():
                repository = repo_file.read_text().strip()
            else:
                info = run([gh, "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], env=env)
                repository = info.stdout.strip() if info.returncode == 0 else ""
            if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
                raise RuntimeError("Cannot resolve GitHub repository; set .archon/runtime/repository to owner/name.")
            launch([archon, "serve", "--cwd", str(root), "--port", "3090", "--quiet"], "server.log", env)
            wait_port(3090)
            proxy_env = os.environ.copy()
            for key in ("GITHUB_TOKEN", "GH_TOKEN", "WEBHOOK_SECRET"):
                proxy_env.pop(key, None)
            launch([sys.executable, str(scripts_dir / "archon-webhook-proxy.py"), "--secret-file", str(secret_path)], "proxy.log", proxy_env)
            wait_port(3091)
            # Cloudflare receives no GitHub credential or webhook secret in its environment.
            tunnel_env = os.environ.copy()
            for key in ("GITHUB_TOKEN", "GH_TOKEN", "WEBHOOK_SECRET"):
                tunnel_env.pop(key, None)
            (runtime / "tunnel-url").unlink(missing_ok=True)
            launch([str(cloudflared), "tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:3091"], "tunnel.log", tunnel_env, True)
            url = None
            registered = None
            retry_at = 0
            tunnel_deadline = time.monotonic() + 120
            while not stopping and all(child.poll() is None for child in children):
                if url is None:
                    matches = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", (runtime / "tunnel.log").read_text(errors="replace"))
                    matches = [item for item in matches if item != "https://api.trycloudflare.com"]
                    if matches:
                        url = matches[0]
                        atomic_write(runtime / "tunnel-url", url + "\n")
                        log("Archon is ready locally; webhook-only tunnel is connected.")
                    elif time.monotonic() > tunnel_deadline:
                        raise RuntimeError("Tunnel startup timed out; retrying.")
                hook_file = runtime / "webhook-id"
                hook_id = hook_file.read_text().strip() if hook_file.exists() else ""
                if url and registered != (url, hook_id) and time.monotonic() >= retry_at:
                    synced = sync_webhook(repository, url, hook_id, secret, env)
                    if synced:
                        registered = (url, synced)
                        log("GitHub webhook " + synced + " now points at this tunnel.")
                    else:
                        log("Could not create or update the GitHub webhook; retrying in 30 seconds.")
                        retry_at = time.monotonic() + 30
                time.sleep(1)
            if not stopping:
                log("A local service exited; restarting the service group.")
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            # Only our diagnostic text is printed; captured API responses never enter logs.
            log(str(error) if isinstance(error, RuntimeError) else "Local service operation failed; retrying.")
        finally:
            cleanup()
        for _ in range(15):
            if stopping:
                break
            time.sleep(1)
finally:
    cleanup()
    (runtime / "supervisor.json").unlink(missing_ok=True)
    (runtime / "tunnel-url").unlink(missing_ok=True)
    log("Archon service stopped.")
PY
