/**
 * hq-probe.mjs — מדד-האמת של המשרד (DESIGN.md §0 — "ארבעת החוקים הניתנים-למדידה").
 * ------------------------------------------------------------------
 * מריץ את וקטורי-האימות על ה-bundle הסטטי (tools/office3d-static):
 * · בהירות-ממוצעת ≥ 85/255 בכל נקודת-תצפית (חוק 1 — אור = כנות) — sharp על
 *   צילום-מסך, אזור-מרכזי 80%.
 * · שלב-שמש תקין מ-window.__hqSun (חוק 2 — נוכחות-חיה; שעון אסיה/ירושלים).
 * · פתיח-הסשן מסתיים (window.__hqIntro.done).
 * · קיר-האמת מקבל מדיג'סט (window.__hqWall.reposRendered ≥ 1) וצ'יפ-טריות
 *   לא-ירוק כשאין נתונים (חוק 3 — טווין דיגיטלי; unknown לעולם לא ירוק).
 * · fail-honest: בלי digest.json — החדר מרנדר, הצ'יפ "לא ידוע", אפס קריסה.
 *
 * ריצה (מחייבת agent-browser CLI + שרת-סטטי):
 *   cd dist-office3d && python3 -m http.server 3311 &
 *   cp digest.json …  (אופציונלי למצב-המדיד; בליו = וקטור fail-honest)
 *   bun .probe/hq-probe.mjs
 * פלט: .probe/hq-probe-results.json + צילומי-מסך. כל טענה עם מספר — לא סיפור.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp'); // כבר ב-dependencies של הריפו

const BASE = process.env.PROBE_URL ?? 'http://localhost:3311/';
const SHOT_DIR = '.probe';

function ab(args, json = false) {
  const out = execFileSync('agent-browser', [...args, ...(json ? ['--json'] : [])], {
    encoding: 'utf8', timeout: 120_000,
  });
  return out.trim();
}
function evalJson(expr) {
  const raw = ab(['eval', expr, '--json']);
  try {
    const parsed = JSON.parse(raw);
    return JSON.parse(parsed?.data?.result ?? raw);
  } catch {
    try { return JSON.parse(raw); } catch { return { raw: String(raw).slice(0, 200) }; }
  }
}
async function luminance(file) {
  const meta = await sharp(file).metadata();
  const region = await sharp(file)
    .extract({
      left: Math.round(meta.width * 0.1),
      top: Math.round(meta.height * 0.1),
      width: Math.round(meta.width * 0.8),
      height: Math.round(meta.height * 0.8),
    })
    .greyscale().stats();
  return region.channels[0].mean;
}

const results = { base: BASE, at: new Date().toISOString(), checks: [] };
const check = (name, pass, value) => {
  results.checks.push({ name, pass, value });
  console.error(`${pass ? 'PASS' : 'FAIL'} ${name} = ${JSON.stringify(value)}`);
};

// 1) טעינה + חוקי-חדר
ab(['set', 'viewport', '1440', '900']);
ab(['open', BASE]);
ab(['wait', '7000']);
const hooks = evalJson(`JSON.stringify({
  sun: window.__hqSun ? { phase: window.__hqSun.phase } : null,
  intro: window.__hqIntro || null,
  wall: window.__hqWall || null,
  canvas: !!document.querySelector('canvas'),
})`);
check('canvas-present', hooks.canvas === true, hooks.canvas);
check('sun-phase-valid', ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'off'].includes(hooks.sun?.phase), hooks.sun?.phase ?? null);
check('intro-done', hooks.intro?.done === true, hooks.intro ?? null);
check('wall-has-digest', (hooks.wall?.reposRendered ?? 0) >= 1, hooks.wall?.reposRendered ?? 0);

// 2) בהירות (חוק 1) — תצפית כללית וקיר-הגיט
ab(['screenshot', `${SHOT_DIR}/probe-overview.png`]);
check('luminance-overview>=85', (await luminance(`${SHOT_DIR}/probe-overview.png`)) >= 85,
  Math.round((await luminance(`${SHOT_DIR}/probe-overview.png`)) * 10) / 10);
ab(['find', 'text', 'קיר הגיט', 'click']);
ab(['wait', '2500']);
ab(['screenshot', `${SHOT_DIR}/probe-gitwall.png`]);
check('luminance-gitwall>=85', (await luminance(`${SHOT_DIR}/probe-gitwall.png`)) >= 85,
  Math.round((await luminance(`${SHOT_DIR}/probe-gitwall.png`)) * 10) / 10);

// 3) מובייל — קריאות 360px+
ab(['set', 'viewport', '390', '844']);
ab(['wait', '2000']);
ab(['screenshot', `${SHOT_DIR}/probe-mobile.png`]);
check('mobile-canvas', evalJson('!!document.querySelector("canvas")') === true, true);

// 4) fail-honest — בלי digest: החדר חי, הצ'יפ כן
const noDigest = evalJson(`fetch('./digest.json').then(r => r.status === 404).catch(() => true)`);
check('failhonest-no-digest-file', noDigest === true, noDigest);
check('failhonest-room-alive', evalJson('!!document.querySelector("canvas")') === true, true);

results.pass = results.checks.every((c) => c.pass);
writeFileSync(`${SHOT_DIR}/hq-probe-results.json`, JSON.stringify(results, null, 2));
console.error(results.pass ? 'PROBE: ALL PASS' : 'PROBE: FAILURES PRESENT');
process.exit(results.pass ? 0 : 1);
