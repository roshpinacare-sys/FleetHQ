#!/usr/bin/env node
// office-3d-bake.mjs — אופה את החדר התלת-ממדי לחלון הציבורי (Task 11-a).
// ---------------------------------------------------------------------------
// מה שקורה כאן, לפי-הסדר:
//  1. קורא את יומן-הפורמן האמיתי (receipts/office-state-mirror.json) ומעתיק
//     אותו אל public/office-state.json (לא-עקוב בגיט) — זה ה-feed שהאפליקציה
//     ניזונה ממנו במצב-מראה (NEXT_PUBLIC_OFFICE_FEED).
//  2. בונה את האפליקציה עם אותו-env (bun run build), ומרימה את שרת-ה-standalone
//     על פורט 3210 (לעולם לא 3000 — תפוס בסנדבוקס).
//  3. כרום-חסר-ראש עם WebGL (swiftshader), ממתין לפריים האמיתי הראשון
//     (RoomReadiness — draw-calls>6, נמדד מהרנדרר עצמו — לא שעון-עצר).
//  4. מנווט את מצלמת-הבמאי לאותן פוזות של הסיור (אירועי hq-camera-preset —
//     אותן תצפיות מדויקות של CAMERA_PRESETS) ומצלם: פריים-גיבור רחב + 5 פוזות.
//  5. כותב office-window/dist/3d/frame-*.png + meta.json {capturedAt,
//     sourceSavedAt, mode:"mirror", honest:true} + מצביע receipts/office-3d/.
// חוק-הכנות: כל כשל → רשומת-כשל כנה ב-log.jsonl + exit 1. אין פריימי-מקום,
// אין ירוק-מזויף; אם WebGL נכשל — החלון נשאר עם התוכן הקודם שלו (כנה).

import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const args = process.argv.slice(2);
const SKIP_BUILD = args.includes('--skip-build');
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3210);
const OUT_DIR = resolve(args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? join(REPO, 'office-window', 'dist', '3d'));
const MIRROR = join(REPO, 'receipts', 'office-state-mirror.json');
const LOG = join(REPO, 'receipts', 'office-3d', 'log.jsonl');
const LATEST = join(REPO, 'receipts', 'office-3d', 'latest.json');
const URL_BASE = `http://127.0.0.1:${PORT}`;

const t0 = Date.now();
function log(entry) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
}
function fail(stage, error) {
  console.error(`[office-3d-bake] FAIL at ${stage}: ${error}`);
  log({ ok: false, stage, error: String(error?.message ?? error), durationMs: Date.now() - t0 });
  process.exit(1);
}

// ─── 1. היומן האמיתי ──────────────────────────────────────────────────────────
if (!existsSync(MIRROR)) fail('mirror', `office-state-mirror.json missing at ${MIRROR} — there is nothing honest to bake`);
let journal;
try {
  journal = JSON.parse(readFileSync(MIRROR, 'utf8'));
  if (journal?.v !== 1 || !Array.isArray(journal?.tasks)) throw new Error('schema: expected {v:1,tasks:[…]}');
} catch (e) {
  fail('mirror', `office-state-mirror.json invalid: ${e.message}`);
}
const sourceSavedAt = journal.savedAt;
if (typeof sourceSavedAt !== 'number') fail('mirror', 'journal.savedAt missing — cannot stamp the mirror honestly');
console.log(`[office-3d-bake] journal: v1 · savedAt=${new Date(sourceSavedAt).toISOString()} · tasks=${journal.tasks.length}`);

// ─── 2. public/office-state.json + build ─────────────────────────────────────
try {
  cpSync(MIRROR, join(REPO, 'public', 'office-state.json'));
} catch (e) {
  fail('copy-public', e.message);
}
if (!SKIP_BUILD) {
  console.log('[office-3d-bake] building (NEXT_PUBLIC_OFFICE_FEED=/office-state.json)…');
  try {
    execFileSync('bun', ['run', 'build'], {
      cwd: REPO,
      stdio: 'inherit',
      timeout: 15 * 60_000,
      env: { ...process.env, NEXT_PUBLIC_OFFICE_FEED: '/office-state.json', NEXT_TELEMETRY_DISABLED: '1' },
    });
  } catch (e) {
    fail('build', e.message);
  }
} else {
  console.log('[office-3d-bake] --skip-build: assuming an existing standalone build');
}
const SERVER = join(REPO, '.next', 'standalone', 'server.js');
if (!existsSync(SERVER)) fail('standalone', `${SERVER} missing — build did not produce the standalone output`);

// ─── 3. שרת על 3210 ──────────────────────────────────────────────────────────
const server = spawn('node', [SERVER], {
  cwd: join(REPO, '.next', 'standalone'),
  env: { ...process.env, PORT: String(PORT), HOSTNAME: '127.0.0.1', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const killServer = () => { try { server.kill('SIGKILL'); } catch { /* already gone */ } };
process.on('exit', killServer);
process.on('SIGINT', () => { killServer(); process.exit(130); });

async function waitHttp(what, url, timeoutMs) {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  fail(what, `timeout waiting for ${url}\n--- server log ---\n${serverLog.slice(-2000)}`);
}
await waitHttp('server', URL_BASE, 60_000);
console.log(`[office-3d-bake] serving on ${URL_BASE}`);
await waitHttp('office-state', `${URL_BASE}/office-state.json`, 15_000);
const served = await (await fetch(`${URL_BASE}/office-state.json`)).json();
if (served?.savedAt !== sourceSavedAt) fail('office-state', 'served office-state.json does not match the mirror (savedAt differs)');

// ─── 4. כרום חסר-ראש עם WebGL ────────────────────────────────────────────────
let browser;
try {
  const puppeteer = (await import('puppeteer')).default;
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
  ];
  try {
    browser = await puppeteer.launch({ headless: true, args: launchArgs });
  } catch (e) {
    console.warn(`[office-3d-bake] bundled launch failed (${e.message.split('\n')[0]}) — trying system Chrome`);
    browser = await puppeteer.launch({ headless: true, channel: 'chrome', args: launchArgs });
  }
} catch (e) {
  fail('chrome', e.message);
}

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
page.on('pageerror', (err) => console.warn('[office-3d-bake] page error:', String(err).split('\n')[0]));
try {
  await page.goto(`${URL_BASE}/?view=office&tour=off`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
} catch (e) {
  fail('navigate', e.message);
}

// הפריים האמיתי הראשון — RoomReadiness חושף __hqRoomReady (נמדד מהרנדרר);
// גיבוי: draw-calls מתוך hook ה-debug __hq.
console.log('[office-3d-bake] waiting for the first real frame (RoomReadiness)…');
try {
  await page.waitForFunction(
    () => window.__hqRoomReady === true || (window.__hq && window.__hq.gl && window.__hq.gl.info.render.calls > 6),
    { timeout: 300_000, polling: 500 },
  );
} catch (e) {
  fail('readiness', `first real frame never arrived (WebGL/shader compile): ${e.message}`);
}
await new Promise((r) => setTimeout(r, 3000)); // התיישבות-תאורה ומודלים אחרי הפריים הראשון

const webglInfo = await page.evaluate(() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  } catch { return 'unknown'; }
});

// ─── 5. פוזות הבמאי (אותן תצפיות של CAMERA_PRESETS) + צילום ─────────────────
const SHOTS = [
  { preset: 'overview', label: 'hero-wide' },
  { preset: 'crew', label: 'tour-crew' },
  { preset: 'podium', label: 'tour-podium' },
  { preset: 'wall', label: 'tour-wall' },
  { preset: 'git', label: 'tour-git' },
  { preset: 'library', label: 'tour-library' },
];
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const frames = [];
for (const shot of SHOTS) {
  await page.evaluate((preset) => {
    window.dispatchEvent(new CustomEvent('hq-camera-preset', { detail: preset }));
  }, shot.preset);
  await new Promise((r) => setTimeout(r, 2800)); // ההחלקה האקספוננציאלית מתייצבת (~99.9%)
  const file = `frame-${frames.length + 1}-${shot.label}.png`;
  await page.screenshot({ path: join(OUT_DIR, file) });
  frames.push({ preset: shot.preset, label: shot.label, file });
  console.log(`[office-3d-bake] captured ${file} (${shot.preset})`);
}
await browser.close();

// ─── 6. meta + מצביע כנה ────────────────────────────────────────────────────
const capturedAt = new Date().toISOString();
const meta = {
  capturedAt,
  sourceSavedAt,
  mode: 'mirror',
  honest: true,
  appUrl: `${URL_BASE}/?view=office&tour=off`,
  viewport: { width: 1600, height: 900 },
  webglRenderer: webglInfo,
  frames,
};
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 1) + '\n');
mkdirSync(dirname(LATEST), { recursive: true });
writeFileSync(LATEST, JSON.stringify({
  schema: 'office.3d/1',
  capturedAt,
  sourceSavedAt,
  mode: 'mirror',
  honest: true,
  frames: frames.map((f) => f.file),
}) + '\n');
killServer();
log({ ok: true, frames: frames.length, sourceSavedAt, webgl: webglInfo, durationMs: Date.now() - t0 });
console.log(`[office-3d-bake] OK — ${frames.length} frames + meta.json in ${OUT_DIR} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
