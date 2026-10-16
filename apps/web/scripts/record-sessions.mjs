// Records the example-run sessions on the Weekboard demo app.
// Run from the repo root: node apps/web/scripts/record-sessions.mjs
//
// P3 is the trace in docs/design/landing-content-v3.md, block 2, timestamp for
// timestamp. Output: apps/web/public/sessions/p3.webm, p3.jpg (poster at 00:05)
// and sessions.json (moments and metadata).

import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const publicDir = join(root, 'apps/web/public');
const demoPath = join(publicDir, 'demo/weekboard.html');
const outDir = join(publicDir, 'sessions');
const tmpDir = join(outDir, '.tmp');

const SIZE = { width: 1280, height: 800 };
const EMAIL = 'sam@acme.co';

mkdirSync(outDir, { recursive: true });
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Drawn pointer: an SVG arrow in a fixed overlay, moved with eased motion by
// the script. The real mouse follows so hover states show. A ring flashes on click.
const CURSOR_INIT = `
(() => {
  if (window.__cursor) return;
  const el = document.createElement('div');
  el.id = '__cursor';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;will-change:transform;';
  el.innerHTML = \`
    <div class="__ring" style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid #fff;opacity:0;"></div>
    <svg width="22" height="26" viewBox="0 0 22 26" style="position:absolute;left:-2px;top:-2px;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.6))">
      <path d="M2.5 2.5 L2.5 20 L7.3 15.6 L10.4 22.5 L13.6 21.1 L10.6 14.4 L17 14.4 Z" fill="#fff" stroke="#1a1a1a" stroke-width="1.4" stroke-linejoin="round"/>
    </svg>\`;
  document.body.appendChild(el);
  const ring = el.querySelector('.__ring');
  let x = 700, y = 470;
  const set = (nx, ny) => { x = nx; y = ny; el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
  set(x, y);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const moveTo = (nx, ny, dur) => new Promise((res) => {
    const sx = x, sy = y, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / Math.max(1, dur));
      const e = ease(p);
      set(sx + (nx - sx) * e, sy + (ny - sy) * e);
      if (p < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  const flash = () => {
    ring.animate(
      [{ transform: 'scale(.35)', opacity: .95 }, { transform: 'scale(1.5)', opacity: 0 }],
      { duration: 460, easing: 'cubic-bezier(.2,.7,.3,1)' }
    );
  };
  window.__cursor = { moveTo, flash, pos: () => ({ x, y }) };
})();`;

function findFfmpeg() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => d.startsWith('ffmpeg-')).sort().reverse();
    for (const d of dirs) {
      const files = readdirSync(join(cache, d)).filter((f) => f.startsWith('ffmpeg'));
      if (files.length) return join(cache, d, files[0]);
    }
  }
  return 'ffmpeg';
}

function videoDuration(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
}

async function recordP3() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir: tmpDir, size: SIZE },
  });
  const page = await context.newPage();
  const pageCreated = Date.now();

  await page.goto(pathToFileURL(demoPath).href + '?scenario=1');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(CURSOR_INIT);
  await sleep(1300);

  const moments = [];
  let t0 = 0;
  const now = () => (Date.now() - t0) / 1000;
  const until = async (s) => { const ms = t0 + s * 1000 - Date.now(); if (ms > 0) await sleep(ms); };
  const moment = (timestamp, kind, detail, extra = {}) => {
    moments.push({ timestamp: mmss(timestamp), seconds: timestamp, kind, detail, ...extra });
    console.log(`${mmss(timestamp)}  ${kind.padEnd(10)} ${detail}   (actual ${now().toFixed(2)}s)`);
  };

  async function target(selector, dx = 0, dy = 0) {
    const box = await page.locator(selector).first().boundingBox();
    if (!box) throw new Error(`No box for ${selector}`);
    return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
  }
  async function glideTo(pt, dur) {
    await page.evaluate(([x, y, d]) => window.__cursor.moveTo(x, y, d), [pt.x, pt.y, dur]);
    await page.mouse.move(pt.x, pt.y);
  }
  async function press() {
    await page.evaluate(() => window.__cursor.flash());
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
  }
  // Arrive a little early, click on the timestamp.
  async function clickAt(ts, selector, { lead = 0.8, dx = 0, dy = 0 } = {}) {
    await until(ts - lead);
    await glideTo(await target(selector, dx, dy), lead * 1000 - 120);
    await until(ts);
    await press();
  }
  async function hoverAt(ts, selector, dur = 900, dx = 0, dy = 0) {
    await until(ts);
    await glideTo(await target(selector, dx, dy), dur);
  }

  // 00:00 scenario dismissed
  await glideTo(await target('#scenarioStart', -6, 1), 700);
  await sleep(200);
  t0 = Date.now();
  await press();
  moment(0, 'start', 'scenario dismissed', { route: '/board' });

  // 00:03 click Share
  await clickAt(3, '#shareBtn', { dx: 4 });
  moment(3, 'click', 'click "Share"', { route: '/board', note: 'menu open', issue: 1 });

  // 00:05 poster frame, then 7 s reading the menu
  await until(5.05);
  await page.screenshot({ path: join(outDir, 'p3.jpg'), type: 'jpeg', quality: 82 });
  moment(5, 'pause', 'pause · 7 s reading the menu', { route: '/board' });
  await hoverAt(6.4, '#copyLink', 1100, -30, 0);
  await hoverAt(8.3, '#embed', 1000, -20, 0);
  await hoverAt(10.3, '#manageLink', 1000, -24, 0);

  // 00:12 click Manage link
  await clickAt(12, '#manageLink', { lead: 0.5, dx: -24 });
  moment(12, 'deviation', 'click "Manage link"', { route: '/board/link' });
  await hoverAt(14, '#view-link select', 1400, -40, 0);
  await hoverAt(16.5, '#view-link .btn', 1300, 0, 0);

  // 00:19 back
  await clickAt(19, '#linkBack', { lead: 1.0, dx: -10 });
  moment(19, 'backtrack', 'back', { route: '/board' });

  // 00:23 type the email into the search
  await clickAt(23, '#search', { lead: 1.2, dx: -60 });
  await page.keyboard.type(EMAIL, { delay: 85 });
  moment(23, 'type', `type "${EMAIL}" into Search`, { route: '/board', issue: 3 });

  // 00:27 pause 9 s on 'No cards match'
  await until(27);
  moment(27, 'pause', 'pause · 9 s on "No cards match"', { route: '/board' });
  await hoverAt(29.5, '#empty b', 1600, 60, 10);
  await hoverAt(34.2, '#search', 1100, 30, 0);
  await page.locator('#search').focus();

  // 00:36 press Enter, nothing happens
  await until(36);
  await page.keyboard.press('Enter');
  moment(36, 'dead-click', 'press Enter', { route: '/board' });

  // 00:41 click the avatar, click Settings
  await clickAt(41, '#avatarBtn', { lead: 1.1 });
  await clickAt(42.3, '#settingsItem', { lead: 0.9, dx: -30 });
  moment(41, 'click', 'click the avatar, click "Settings"', { route: '/settings' });

  // 00:46 click Members
  await clickAt(46, '#tab-members', { lead: 1.0, dx: -30 });
  moment(46, 'click', 'click "Members"', { route: '/settings/members' });
  await hoverAt(48.5, '.member:nth-child(2)', 1500, -120, 0);
  await hoverAt(52, '.invite h2', 1300, 20, 0);

  // 00:58 type the email, press Add
  await clickAt(55, '#inviteEmail', { lead: 0.8, dx: -120 });
  await page.keyboard.type(EMAIL, { delay: 80 });
  await clickAt(58, '#inviteAdd', { lead: 0.9 });
  moment(58, 'press', 'type the email, press "Add"', { route: '/settings/members', note: '1 invitation pending', issue: 2 });

  // 01:01 press Add again
  await until(60.2);
  await glideTo(await target('#inviteAdd', 8, 4), 500);
  await clickAt(61, '#inviteAdd', { lead: 0.4, dx: 2, dy: 1 });
  moment(61, 'press', 'press "Add" again', { route: '/settings/members', note: '2 invitations pending', issue: 2 });

  // 01:03 I'm done
  await clickAt(63, '#done', { lead: 1.0 });
  moment(63, 'done', "I'm done", { route: '/settings/members' });

  await sleep(1200);
  const closedAt = Date.now();
  const video = page.video();
  await page.close();
  const rawPath = await video.path();
  await context.close();
  await browser.close();

  return { rawPath, pageCreated, t0, closedAt, moments };
}

const { rawPath, pageCreated, t0, closedAt, moments } = await recordP3();

// Trim the lead-in so 00:00 is the scenario dismissal, and encode small.
const ffmpeg = findFfmpeg();
const rawDuration = videoDuration(ffmpeg, rawPath) ?? (closedAt - pageCreated) / 1000;
const lag = Math.max(0, (closedAt - pageCreated) / 1000 - rawDuration);
const offset = Math.max(0, (t0 - pageCreated) / 1000 - lag);
const finalPath = join(outDir, 'p3.webm');
console.log(`raw ${rawDuration.toFixed(2)}s, lag ${lag.toFixed(2)}s, trimming ${offset.toFixed(2)}s`);

const enc = spawnSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', offset.toFixed(3), '-i', rawPath,
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '2',
  '-row-mt', '1', '-pix_fmt', 'yuv420p', '-an', finalPath,
], { encoding: 'utf8' });
if (enc.status !== 0) {
  console.error(enc.stderr);
  console.error('Encoding failed; keeping the untrimmed recording.');
  copyFileSync(rawPath, finalPath);
}
rmSync(tmpDir, { recursive: true, force: true });

const finalDuration = videoDuration(ffmpeg, finalPath);
const sessions = {
  label: 'Example run',
  run: 'k2m9',
  goal: 'invite a colleague',
  sessions: [
    {
      id: 'p3',
      person: 'P3',
      source: 'panel',
      device: 'MacBook',
      browser: 'Chrome',
      viewport: '1280×800',
      duration: '1:03',
      outcome: 'incorrect',
      ease: 3,
      easeOf: 7,
      words: "Share seemed like the place for people. When I found it I wasn't sure the first Add did anything, so I pressed it again.",
      video: '/sessions/p3.webm',
      poster: '/sessions/p3.jpg',
      posterAt: '00:05',
      videoSeconds: finalDuration ? Math.round(finalDuration * 100) / 100 : null,
      moments,
    },
  ],
};
writeFileSync(join(outDir, 'sessions.json'), JSON.stringify(sessions, null, 2) + '\n');

const size = statSync(finalPath).size;
console.log(`wrote ${finalPath} (${(size / 1024 / 1024).toFixed(2)} MB, ${finalDuration?.toFixed(2)}s)`);
console.log(`wrote ${join(outDir, 'p3.jpg')}`);
console.log(`wrote ${join(outDir, 'sessions.json')}`);
if (size > 3 * 1024 * 1024) console.warn('Warning: p3.webm is over 3 MB.');
