#!/usr/bin/env node
// office-3d-bake.mjs — אופה את החדר התלת-ממדי v4 לחלון הציבורי.
// ---------------------------------------------------------------------------
// (כתיבה-מחדש על-דירקטיבת-הבעלים "וודא שהחלפת שלא יעלה שוב" — הבייק הישן
//  בנה את כל-אפליקציית-ה-Next וצילם את חדר-ה-r3f הישן; החדר-הישן הוחלף.)
// מה שקורה כאן, לפי-הסדר:
//  1. קורא את יומן-הפורמן האמיתי (receipts/office-state-mirror.json) — עוגן-האמת
//     של sourceSavedAt. אין יומן → אין בייק (fail-closed, כמו-תמיד).
//  2. בונה את החדר עצמו (bun run office3d:build → vite → dist-office3d) —
//     המנוע-היחיד-שחי: v4, מה שמוגש ב-Domain וב-office-pages.
//  3. מרים שרת-סטטי קטן על פורט 3210 (לעולם לא 3000 — תפוס בסנדבוקס).
//  4. כרום-חסר-ראש עם WebGL (swiftshader), ממתין לפריים האמיתי הראשון
//     (__hqRoomReady — draw-calls>6, נמדד מהרנדרר עצמו — לא שעון-עצר).
//  5. מנווט את מצלמת-הבמאי באירועי hq-camera-preset (אותן תצפיות של הסיור)
//     ומצלם: פריים-גיבור רחב + 5 פוזות.
//  6. כותב office-window/dist/3d/frame-*.png + meta.json {capturedAt,
//     sourceSavedAt, mode:"mirror", honest:true} + מצביע receipts/office-3d/.
// חוק-הכנות: כל כשל → רשומת-כשל כנה ב-log.jsonl + exit 1. אין פריימי-מקום,
// אין ירוק-מזויף; אם WebGL נכשל — החלון נשאר עם התוכן הקודם שלו (כנה).

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const args = process.argv.slice(2);
const SKIP_BUILD = args.includes('--skip-build');
const PORT = Number(args.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 3210);
const OUT_DIR = resolve(args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? join(REPO, 'office-window', 'dist', '3d'));
const MIRROR = join(REPO, 'receipts', 'office-state-mirror.json');
const DIST = join(REPO, 'dist-office3d');
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

// ─── 1. היומן האמיתי (עוגן-האמת של המציאות-הנמדדת) ───────────────────────────
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

// ─── 2. בניית-החדר (vite — המנוע-היחיד-שחי) ──────────────────────────────────
if (!SKIP_BUILD) {
  console.log('[office-3d-bake] building the room (vite → dist-office3d)…');
  try {
    execFileSync('bun', ['run', 'office3d:build'], { cwd: REPO, stdio: 'inherit', timeout: 10 * 60_000, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  } catch (e) {
    fail('build', e.message);
  }
} else {
  console.log('[office-3d-bake] --skip-build: assuming an existing dist-office3d');
}
if (!existsSync(join(DIST, 'index.html'))) fail('dist', `${DIST}/index.html missing — the room build did not produce an entry`);

// ─── 3. שרת-סטטי על 3210 ─────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let fp = join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!fp.startsWith(DIST)) { res.writeHead(403); res.end(); return; }
  if (existsSync(fp) && statSync(fp).isDirectory()) fp = join(fp, 'index.html');
  if (!existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(fp)] ?? 'application/octet-stream' });
  res.end(readFileSync(fp));
});
server.listen(PORT, '127.0.0.1');
const killServer = () => { try { server.close(); } catch { /* already gone */ } };
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
  fail(what, `timeout waiting for ${url}`);
}
await waitHttp('server', URL_BASE, 30_000);
console.log(`[office-3d-bake] serving on ${URL_BASE}`);

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
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 });
} catch (e) {
  fail('navigate', e.message);
}

// הפריים האמיתי הראשון — __hqRoomReady (נמדד מהרנדרר); גיבוי: draw-calls מתוך __hq
console.log('[office-3d-bake] waiting for the first real frame (__hqRoomReady)…');
try {
  await page.waitForFunction(
    () => window.__hqRoomReady === true || (window.__hq && window.__hq.gl && window.__hq.gl.info.render.calls > 6),
    { timeout: 300_000, polling: 500 },
  );
} catch (e) {
  fail('readiness', `first real frame never arrived (WebGL/shader compile): ${e.message}`);
}
await new Promise((r) => setTimeout(r, 3000)); // התיישבות-תאורה ופידים אחרי הפריים הראשון

const webglInfo = await page.evaluate(() => {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  } catch { return 'unknown'; }
});
const roomState = await page.evaluate(() => {
  try { return window.__hqState ? window.__hqState() : null; } catch { return null; }
});

// ─── 5. פוזות הבמאי + צילום ──────────────────────────────────────────────────
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
  await new Promise((r) => setTimeout(r, 2800)); // ההחלקה מתייצבת (~99.9%)
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
  room: 'office3d-v4',
  appUrl: URL_BASE,
  viewport: { width: 1600, height: 900 },
  webglRenderer: webglInfo,
  roomState,
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
  room: 'office3d-v4',
  frames: frames.map((f) => f.file),
}) + '\n');
killServer();
log({ ok: true, room: 'office3d-v4', frames: frames.length, sourceSavedAt, webgl: webglInfo, durationMs: Date.now() - t0 });
console.log(`[office-3d-bake] OK — ${frames.length} frames + meta.json in ${OUT_DIR} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
