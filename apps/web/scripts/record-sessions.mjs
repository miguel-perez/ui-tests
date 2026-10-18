// Records the example run's five attempts on the light Weekboard demo app, under the participant chrome of
// design/artefacts/player-chrome.html: the inverse of Weekboard with its mint accent, the bar reading Done and I couldn't do this.
// Run from the repo root with Playwright's bundled browsers inside this worktree:
//   PLAYWRIGHT_BROWSERS_PATH=0 node apps/web/scripts/record-sessions.mjs
//
// Person 3 is the attempt in design/artefacts/attempt-view.html, timestamp for timestamp. Output in apps/web/public/sessions:
// p1-p5.webm and their posters, p3's card posters (p3-03.jpg, p3-23.jpg, p3-58.jpg), the four problem reels and their
// posters, and sessions.json: the run, each attempt in the words of docs/discovery/reporting-schema-research.md, and
// Person 3's three moments as the attempt view shows them. Flags: --p3 records Person 3 only; --reels re-cuts the reels.

import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync, copyFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const publicDir = join(root, 'apps/web/public');
const demoPath = join(publicDir, 'demo/weekboard.html');
const outDir = join(publicDir, 'sessions');
const tmpDir = join(outDir, '.tmp');
if (!resolve(chromium.executablePath()).startsWith(root + '/')) throw new Error('Set PLAYWRIGHT_BROWSERS_PATH=0 and install bundled Chromium inside this worktree.');

const SIZE = { width: 1280, height: 800 };
const EMAIL = 'sam@acme.example';

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
  const cache = join(root, 'node_modules/playwright-core/.local-browsers');
  const dirs = readdirSync(cache).filter(d => d.startsWith('ffmpeg-')).sort().reverse();
  for (const d of dirs) {
    const file = readdirSync(join(cache, d)).find(f => f.startsWith('ffmpeg'));
    if (file) return join(cache, d, file);
  }
  throw new Error('Install Playwright bundled FFmpeg inside this worktree.');
}

function videoDuration(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null;
}

/** The run: one goal, five people from a paid panel, the path you wrote and what the check expects. */
const run = {
  label: 'Example run',
  run: 'k2m9',
  goal: 'invite a colleague',
  date: '14 Oct 2026',
  people: 5,
  yourPath: ['/board', '/settings/members'],
  check: "expect(invitations.map(i => i.email)).toContain(setup.email)",
  expects: 'an invitation for Sam',
};
/** Who each person is, how their attempt ended and what they answered. The moments are what the recording below captures. */
const people = {
  p1: { today: 'Trello', reached: 'yes', ended: 'done', time: 57, sure: 6, ease: 4, afterGoals: { help: 4, easy: 4 }, consent: { screen: true, voice: false, camera: false }, words: 'I figured it would find them.', endState: '1 invitation pending' },
  p2: { today: 'email', reached: 'no', ended: "couldn't do this", time: 53, sure: 4, ease: 2, afterGoals: { help: 4, easy: 2 }, consent: { screen: true, voice: false, camera: false }, words: 'It looked switched off.', endState: 'no invitation' },
  p3: { today: 'a spreadsheet', reached: 'yes', ended: 'done', time: 63, sure: 6, ease: 3, afterGoals: { help: 4, easy: 2 }, consent: { screen: true, voice: true, camera: false }, words: "Share seemed like the place for people. When I found it I wasn't sure the first Add did anything, so I pressed it again.", wordsWhere: 'Said aloud after the questions. Nothing was said during the attempt.', endState: '2 invitations pending' },
  p4: { today: 'Notion', reached: 'yes', ended: 'done', time: 47, sure: 4, ease: 4, afterGoals: { help: 4, easy: 2 }, consent: { screen: true, voice: false, camera: false }, words: "I wasn't sure the first one did anything.", endState: '2 invitations pending' },
  p5: { today: 'a whiteboard', reached: 'yes', ended: 'done', time: 52, sure: 6, ease: 5, afterGoals: { help: 4, easy: 4 }, consent: { screen: true, voice: false, camera: false }, words: 'Share is where you add people.', endState: '1 invitation pending' },
};
/** One attempt's record: the person, the result, the setup and consent, then the recording and its moments. */
const attempt = (id, extra) => ({
  id, number: Number(id.slice(1)), person: `Person ${id.slice(1)}`, source: 'paid panel',
  device: 'Desktop', browser: 'Chromium', window: '1280×800', ...people[id],
  video: `/sessions/${id}.webm`, poster: `/sessions/${id}.jpg`, ...extra,
});
/**
 * Person 3's three moments as the attempt view shows them, worst first: the impact on this attempt, the problem it is an
 * instance of (its rank in the run), the seconds the clip plays, the sentence about the design, where, the words tied to the
 * moment and the smallest change.
 */
const blockers = [
  { n: 1, problem: 1, impact: 'confused', from: 58, to: 63, poster: '/sessions/p3-58.jpg', title: 'Pressed Add, saw nothing change, pressed it again. Two invitations went out.', where: '/settings/members · the Add button', said: { when: 'after', text: "I wasn't sure the first Add did anything, so I pressed it again." }, change: 'On press, change the button to "Invited sam@acme.example" and disable it.' },
  { n: 2, problem: 3, impact: 'slowed', from: 3, to: 19, poster: '/sessions/p3-03.jpg', title: 'Looked for Invite in the Share menu and found only link options.', where: '/board · the Share menu', said: { when: 'after', text: 'Share seemed like the place for people.' }, change: 'Put "Invite a colleague" at the top of the Share menu.' },
  { n: 3, problem: 4, impact: 'confused', from: 23, to: 36, poster: '/sessions/p3-23.jpg', title: "Typed the colleague's email into the board search.", where: '/board · Search cards', said: null, change: 'When a search matches no cards, offer "Invite someone with this email".' },
];

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

  const moments = [], pending = [];
  let t0 = 0;
  const now = () => (Date.now() - t0) / 1000;
  const until = async (s) => { const ms = t0 + s * 1000 - Date.now(); if (ms > 0) await sleep(ms); };
  // A moment in the words of the attempt view: what happened, then the rest of its row, the page and the problem it shows.
  const moment = (timestamp, kind, what, rest, extra = {}) => {
    const entry = { timestamp: mmss(timestamp), seconds: timestamp, kind, what, ...(rest ? { rest } : {}), ...extra };
    moments.push(entry);
    // Where the cursor was, as a fraction of the 1280 × 800 frame: the hero draws its in-context sensor there.
    pending.push(page.evaluate(() => window.__cursor.pos()).then(({ x, y }) => { entry.at = [+(x / 1280).toFixed(3), +(y / 800).toFixed(3)]; }));
    console.log(`${mmss(timestamp)}  ${kind.padEnd(10)} ${what}${rest ?? ''}   (actual ${now().toFixed(2)}s)`);
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

  // 00:00 scenario card dismissed
  await glideTo(await target('#scenarioStart', -6, 1), 700);
  await sleep(200);
  t0 = Date.now();
  await press();
  moment(0, 'start', 'Started', ' · scenario card dismissed', { route: '/board' });

  // 00:03 click Share
  await clickAt(3, '#shareBtn', { dx: 4 });
  moment(3, 'click', 'Clicked Share', ' · menu open', { route: '/board', issue: 3 });

  // 00:05 poster frame, then 7 s on the menu
  await until(5.05);
  await page.screenshot({ path: join(outDir, 'p3.jpg'), type: 'jpeg', quality: 82 });
  moment(5, 'stopped', 'Stopped 7 s', ' on the menu', { route: '/board' });
  await hoverAt(6.4, '#copyLink', 1100, -30, 0);
  await hoverAt(8.3, '#embed', 1000, -20, 0);
  await hoverAt(10.3, '#manageLink', 1000, -24, 0);

  // 00:12 click Manage link: off the path you wrote
  await clickAt(12, '#manageLink', { lead: 0.5, dx: -24 });
  moment(12, 'off-path', 'Off your path', ' · opened Link settings', { route: '/board/link' });
  await hoverAt(14, '#view-link select', 1400, -40, 0);
  await hoverAt(16.5, '#view-link .btn', 1300, 0, 0);

  // 00:19 went back to the board
  await clickAt(19, '#linkBack', { lead: 1.0, dx: -10 });
  moment(19, 'went-back', 'Went back', ' to the board', { route: '/board' });

  // 00:23 type the email into the search
  await clickAt(23, '#search', { lead: 1.2, dx: -60 });
  await page.keyboard.type(EMAIL, { delay: 85 });
  moment(23, 'type', `Typed ${EMAIL}`, ' into Search', { route: '/board', issue: 4 });

  // 00:27 stopped 9 s on 'No cards match'
  await until(27);
  moment(27, 'stopped', 'Stopped 9 s', ' on "No cards match"', { route: '/board' });
  await hoverAt(29.5, '#empty b', 1600, 60, 10);
  await hoverAt(34.2, '#search', 1100, 30, 0);
  await page.locator('#search').focus();

  // 00:36 press Enter, nothing happens
  await until(36);
  await page.keyboard.press('Enter');
  moment(36, 'no-effect', 'Pressed Enter, nothing happened', '', { route: '/board' });

  // 00:41 click the avatar, then Settings
  await clickAt(41, '#avatarBtn', { lead: 1.1 });
  await clickAt(42.3, '#settingsItem', { lead: 0.9, dx: -30 });
  moment(41, 'click', 'Clicked the avatar', ', then Settings', { route: '/settings' });

  // 00:46 click Members
  await clickAt(46, '#tab-members', { lead: 1.0, dx: -30 });
  moment(46, 'click', 'Clicked Members', '', { route: '/settings/members' });
  await hoverAt(48.5, '.member:nth-child(2)', 1500, -120, 0);
  await hoverAt(52, '.invite h2', 1300, 20, 0);

  // 00:58 type the email, press Add
  await clickAt(55, '#inviteEmail', { lead: 0.8, dx: -120 });
  await page.keyboard.type(EMAIL, { delay: 80 });
  await clickAt(58, '#inviteAdd', { lead: 0.9 });
  moment(58, 'press', 'Typed the email, pressed Add', ' · 1 invitation pending', { route: '/settings/members', issue: 1 });

  // 01:01 press Add again
  await until(60.2);
  await glideTo(await target('#inviteAdd', 8, 4), 500);
  await clickAt(61, '#inviteAdd', { lead: 0.4, dx: 2, dy: 1 });
  moment(61, 'press', 'Pressed Add again', ' · 2 invitations pending', { route: '/settings/members', issue: 1 });

  // 01:03 pressed Done: how it ended
  await clickAt(63, '#done', { lead: 1.0 });
  // Done asks "Finished this task?" in place; the person confirms.
  await page.locator('#doneYes').click();
  moment(63, 'ended', 'Pressed Done', ' · the check ran and passed: Sam has an invitation, sent twice', { route: '/settings/members' });

  await sleep(1200);
  await Promise.all(pending);
  const closedAt = Date.now();
  const video = page.video();
  await page.close();
  const rawPath = await video.path();
  await context.close();
  await browser.close();

  return { rawPath, pageCreated, t0, closedAt, moments };
}

const ffmpeg = findFfmpeg();
const metadataFile = join(outDir, 'sessions.json');
/** The committed run, with every attempt recorded so far; a fresh one when the file predates the attempt vocabulary. */
function readMetadata() {
  const saved = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) : {};
  return { ...run, attempts: saved.attempts ?? [] };
}
function save(metadata, entry) {
  metadata.attempts = metadata.attempts.filter(a => a.id !== entry.id).concat(entry).sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
}
/** Still frames from a published recording, through the bundled browser: the frame at each second, as a JPEG poster. */
async function stills(file, frames) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: SIZE });
    await page.goto(pathToFileURL(demoPath).href);
    await page.setContent('<style>body{margin:0}</style><video style="width:1280px;height:800px;display:block" muted></video>');
    await page.locator('video').evaluate(async (video, url) => { video.src = url; await new Promise(resolve => video.addEventListener('loadeddata', resolve, { once: true })); }, pathToFileURL(file).href);
    for (const [seconds, output] of frames) {
      await page.locator('video').evaluate(async (video, t) => { video.currentTime = t; await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true })); }, seconds);
      // A seeked frame can reach the screen a moment after the event; give it time to paint.
      await page.waitForTimeout(400);
      await page.screenshot({ path: output, type: 'jpeg', quality: 82 });
    }
  } finally { await browser.close(); }
}

async function publishP3() {
  const { rawPath, pageCreated, t0, closedAt, moments } = await recordP3();

  // Trim the lead-in so 00:00 is the scenario dismissal, and encode small.
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
    rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Encoding failed; the recording was not published because its metadata assumes the trimmed time origin.');
  }
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // Each card's poster is the recording half a second into its clip, so the card shows what the clip starts on.
  await stills(finalPath, blockers.map(blocker => [blocker.from + 0.5, join(publicDir, blocker.poster)]));
  const finalDuration = videoDuration(ffmpeg, finalPath);
  save(readMetadata(), attempt('p3', { posterAt: '00:05', videoSeconds: finalDuration ? Math.round(finalDuration * 100) / 100 : null, moments, blockers }));

  const size = statSync(finalPath).size;
  console.log(`wrote ${finalPath} (${(size / 1024 / 1024).toFixed(2)} MB, ${finalDuration?.toFixed(2)}s)`);
  if (size > 3 * 1024 * 1024) console.warn('Warning: p3.webm is over 3 MB.');
}

// The other four attempts follow the run's moments: each action at its second, in the words of the attempt view.
const scripts = [
  { id: 'p1', end: 58, actions: [
    { at: 4, target: '#shareBtn', kind: 'click', what: 'Clicked Share', rest: ' · menu open', route: '/board', issue: 3 },
    { at: 13, target: '#manageLink', kind: 'off-path', what: 'Off your path', rest: ' · opened Link settings', route: '/board/link' },
    { at: 22, target: '#linkBack', kind: 'went-back', what: 'Went back', rest: ' to the board', route: '/board' },
    { at: 30, target: '#search', kind: 'type', what: `Typed ${EMAIL}`, rest: ' into Search', route: '/board', issue: 4, text: EMAIL },
    { at: 39, target: '#avatarBtn', kind: 'click', what: 'Clicked the avatar', route: '/board' },
    { at: 40, target: '#settingsItem', kind: 'click', what: 'Clicked Settings', route: '/settings' },
    { at: 44, target: '#tab-members', kind: 'click', what: 'Clicked Members', route: '/settings/members' },
    { at: 49, target: '#inviteEmail', kind: 'type', what: 'Typed the email', route: '/settings/members', text: EMAIL },
    { at: 54, target: '#inviteAdd', kind: 'press', what: 'Pressed Add', rest: ' · 1 invitation pending', route: '/settings/members' },
    { at: 57, target: '#done', kind: 'ended', what: 'Pressed Done', rest: ' · the check ran and passed', route: '/settings/members' },
  ] },
  { id: 'p2', end: 55, actions: [
    { at: 6, target: '#shareBtn', kind: 'click', what: 'Clicked Share', rest: ' · menu open', route: '/board', issue: 3 },
    { at: 17, target: '#manageLink', kind: 'off-path', what: 'Off your path', rest: ' · opened Link settings', route: '/board/link' },
    { at: 25, target: '#linkBack', kind: 'went-back', what: 'Went back', rest: ' to the board', route: '/board' },
    { at: 34, target: '#avatarBtn', kind: 'click', what: 'Clicked the avatar', route: '/board' },
    { at: 35, target: '#settingsItem', kind: 'click', what: 'Clicked Settings', route: '/settings' },
    { at: 40, target: '#tab-members', kind: 'click', what: 'Clicked Members', route: '/settings/members' },
    { at: 45, target: '#inviteEmail', kind: 'type', what: 'Typed sam@', rest: ', an incomplete email', route: '/settings/members', text: 'sam@' },
    { at: 49, target: '#inviteAdd', kind: 'stopped', what: 'Stopped 4 s', rest: ' on a grey Add button', route: '/settings/members', issue: 2, hover: true },
    { at: 53, target: '#cant', kind: 'ended', what: "Pressed I couldn't do this", route: '/settings/members' },
  ] },
  { id: 'p4', end: 48, actions: [
    { at: 7, target: '#avatarBtn', kind: 'click', what: 'Clicked the avatar', route: '/board' },
    { at: 9, target: '#settingsItem', kind: 'click', what: 'Clicked Settings', route: '/settings' },
    { at: 19, target: '#tab-members', kind: 'click', what: 'Clicked Members', route: '/settings/members' },
    { at: 36, target: '#inviteEmail', kind: 'type', what: 'Typed the email', route: '/settings/members', text: EMAIL },
    { at: 41, target: '#inviteAdd', kind: 'press', what: 'Pressed Add', rest: ' · 1 invitation pending', route: '/settings/members', issue: 1 },
    { at: 44, target: '#inviteAdd', kind: 'press', what: 'Pressed Add again', rest: ' · 2 invitations pending', route: '/settings/members', issue: 1 },
    { at: 47, target: '#done', kind: 'ended', what: 'Pressed Done', rest: ' · the check ran and passed: Sam has an invitation, sent twice', route: '/settings/members' },
  ] },
  { id: 'p5', end: 53, actions: [
    { at: 9, target: '#shareBtn', kind: 'click', what: 'Clicked Share', rest: ' · menu open', route: '/board', issue: 3 },
    { at: 20, target: '#manageLink', kind: 'off-path', what: 'Off your path', rest: ' · opened Link settings', route: '/board/link' },
    { at: 28, target: '#linkBack', kind: 'went-back', what: 'Went back', rest: ' to the board', route: '/board' },
    { at: 34, target: '#avatarBtn', kind: 'click', what: 'Clicked the avatar', route: '/board' },
    { at: 35, target: '#settingsItem', kind: 'click', what: 'Clicked Settings', route: '/settings' },
    { at: 39, target: '#tab-members', kind: 'click', what: 'Clicked Members', route: '/settings/members' },
    { at: 45, target: '#inviteEmail', kind: 'type', what: 'Typed the email', route: '/settings/members', text: EMAIL },
    { at: 49, target: '#inviteAdd', kind: 'press', what: 'Pressed Add', rest: ' · 1 invitation pending', route: '/settings/members' },
    { at: 52, target: '#done', kind: 'ended', what: 'Pressed Done', rest: ' · the check ran and passed', route: '/settings/members' },
  ] },
];
function encode(input, output, start, duration) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', input, '-t', String(duration), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p', '-an', output], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  if (statSync(output).size > 2 * 1024 * 1024) throw new Error(`${output} exceeds 2 MB`);
}
async function recordAttempt(script) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmpDir, size: SIZE } });
  try {
    const page = await context.newPage();
    const created = Date.now();
    await page.goto(pathToFileURL(demoPath).href + '?scenario=1');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(CURSOR_INIT);
    await sleep(1000);
    const t0 = Date.now();
    await page.locator('#scenarioStart').click();
    const moments = [{ timestamp: '00:00', seconds: 0, kind: 'start', what: 'Started', rest: ' · scenario card dismissed', route: '/board' }];
    const until = async seconds => { await sleep(Math.max(0, t0 + seconds * 1000 - Date.now())); };
    for (const { at, target, kind, what, rest, route, issue, text, hover } of script.actions) {
      await until(at - 0.8);
      const box = await page.locator(target).boundingBox();
      if (!box) throw new Error(`Missing recording target ${target}`);
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await page.evaluate(([x, y]) => window.__cursor.moveTo(x, y, 600), [x, y]);
      await page.mouse.move(x, y);
      await until(at);
      const actualSeconds = (Date.now() - t0) / 1000;
      if (Math.abs(actualSeconds - at) > 0.1) throw new Error(`Timing drift: ${script.id} ${at} / ${actualSeconds}`);
      if (!hover) { await page.evaluate(() => window.__cursor.flash()); await page.mouse.click(x, y); }
      if (text) await page.keyboard.type(text, { delay: 65 });
      if (target === '#done') await page.locator('#doneYes').click();
      moments.push({ timestamp: mmss(at), seconds: at, actualSeconds, kind, what, ...(rest ? { rest } : {}), route, ...(issue ? { issue } : {}) });
      // The poster is the moment the person first met a problem: Share for most, the first Add for Person 4.
      if (issue === 3 || (script.id === 'p4' && issue === 1)) await page.screenshot({ path: join(outDir, `${script.id}.jpg`), type: 'jpeg', quality: 82 });
      console.log(`${script.id} ${mmss(at)} ${what}${rest ?? ''}`);
    }
    await until(script.end);
    const closed = Date.now();
    const video = page.video();
    await page.close();
    const raw = await video.path();
    const duration = videoDuration(ffmpeg, raw) ?? (closed - created) / 1000;
    const lag = Math.max(0, (closed - created) / 1000 - duration);
    encode(raw, join(outDir, `${script.id}.webm`), Math.max(0, (t0 - created) / 1000 - lag), script.end);
    return attempt(script.id, { videoSeconds: videoDuration(ffmpeg, join(outDir, `${script.id}.webm`)), moments });
  } finally { await context.close(); await browser.close(); }
}

if (!process.argv.includes('--reels')) await publishP3();
if (!process.argv.includes('--p3')) {
  const metadata = readMetadata();
  for (const script of process.argv.includes('--reels') ? [] : scripts) save(metadata, await recordAttempt(script));
  // The four problem reels in the run's rank: impact first, then how many people hit it.
  const reels = [['p3', 58, 6], ['p2', 45, 9], ['p3', 3, 9], ['p3', 23, 9]];
  for (const [index, [id, start, duration]] of reels.entries()) encode(join(outDir, `${id}.webm`), join(outDir, `problem-${index + 1}.webm`), start, duration);
  for (let index = 1; index <= reels.length; index++) await stills(join(outDir, `problem-${index}.webm`), [[0.2, join(outDir, `problem-${index}.jpg`)]]);
}
rmSync(tmpDir, { recursive: true, force: true });
