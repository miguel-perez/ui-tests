import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { findProcessByPort, killProcess } from './listener-cleanup.mjs';

test('listener-only commands, self rejection and kill boundary on both platforms', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    let calls = 0;
    const exec = (file, args) => {
      calls++;
      if (platform === 'win32') {
        assert.equal(file, 'powershell.exe');
        assert.match(args.at(-1), /-LocalPort 43210 -State Listen/);
      } else {
        assert.equal(file, 'lsof');
        assert.deepEqual(args, ['-nP', '-iTCP:43210', '-sTCP:LISTEN', '-t']);
      }
      return '123\n';
    };
    assert.equal(findProcessByPort(43210, { platform, exec, selfPid: 123 }), undefined);
    assert.equal(findProcessByPort(43210, { platform, exec, selfPid: 456 }), 123);
    assert.equal(calls, 2);
    const forbidden = () => assert.fail('self/invalid PID must never reach OS kill');
    for (const pid of [123, -1, 0, NaN, 1.5]) {
      killProcess(pid, { platform, selfPid: 123, exec: forbidden, kill: forbidden });
    }
    const killed = [];
    killProcess(456, { platform, selfPid: 123,
      exec: (file, args) => killed.push([file, args]),
      kill: (pid, signal) => killed.push([pid, signal]) });
    assert.deepEqual(killed, platform === 'win32'
      ? [['taskkill', ['/F', '/PID', '456']]] : [[456, 'SIGKILL']]);
  }
});

test('lookup failure has no broad fallback; ambiguous or malformed owners rejected', () => {
  let calls = 0;
  assert.equal(findProcessByPort(43210, { exec: () => { calls++; throw new Error('no lsof'); } }), undefined);
  assert.equal(calls, 1);
  for (const result of ['123\n456', '123junk', '', '-1', '0']) {
    assert.equal(findProcessByPort(43210, { exec: () => result }), undefined);
  }
});

test('real shared port: original query includes workflow client, repair selects only listener',
  { skip: process.platform === 'win32' }, async () => {
    // Listener is our child, client is this runner. Never use real process.kill in this test.
    const child = spawn(process.execPath, ['-e', `
      const net = require('node:net');
      const server = net.createServer(() => {});
      server.listen(0, '127.0.0.1', () => console.log(server.address().port));
      process.stdin.resume();
      process.stdin.on('end', () => { server.close(); process.exit(0); });
    `], { stdio: ['pipe', 'pipe', 'inherit'] });
    let client;
    try {
      const [data] = await once(child.stdout, 'data');
      const port = Number(data.toString().trim());
      client = net.connect(port, '127.0.0.1');
      await once(client, 'connect');
      const broad = execFileSync('lsof', [`-ti:${port}`], { encoding: 'utf8' })
        .trim().split(/\s+/).map(Number);
      assert.ok(broad.includes(process.pid), 'original lookup must expose the self-kill bug');
      assert.ok(broad.includes(child.pid));
      // Reproduce the unsafe first-PID choice regardless of platform-specific lsof ordering.
      const original = parseInt([process.pid, ...broad.filter(pid => pid !== process.pid)].join('\n'), 10);
      assert.equal(original, process.pid);
      assert.equal(findProcessByPort(port), child.pid);
      const kills = [];
      killProcess(findProcessByPort(port), { kill: (pid, signal) => kills.push([pid, signal]) });
      assert.deepEqual(kills, [[child.pid, 'SIGKILL']]);
    } finally {
      client?.destroy();
      child.stdin.end();
      await once(child, 'exit');
    }
  });
