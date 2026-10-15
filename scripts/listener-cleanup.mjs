// Shared by the pinned build and regression tests. No name-based kill or fuser fallback.
import { execFileSync } from 'node:child_process';

export function findProcessByPort(port, options = {}) {
  const { platform = process.platform, exec = execFileSync, selfPid = process.pid } = options;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  try {
    const result = platform === 'win32'
      ? exec('powershell.exe', ['-NoProfile', '-Command',
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`],
      { encoding: 'utf8', timeout: 5000 })
      : exec('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
        { encoding: 'utf8', timeout: 5000 });
    const pids = [...new Set(result.trim().split(/\s+/).map(Number))];
    // Ambiguous owners are not safe cleanup targets. Never select this workflow client.
    if (pids.length !== 1) return undefined;
    const [pid] = pids;
    return Number.isSafeInteger(pid) && pid > 0 && pid !== selfPid ? pid : undefined;
  } catch {
    return undefined;
  }
}

export function killProcess(pid, options = {}) {
  const { platform = process.platform, exec = execFileSync,
    kill = process.kill.bind(process), selfPid = process.pid } = options;
  // Defense in depth: also guard the kill boundary, including Windows taskkill.
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === selfPid) return;
  if (platform === 'win32') exec('taskkill', ['/F', '/PID', String(pid)], { timeout: 5000 });
  else kill(pid, 'SIGKILL');
}
