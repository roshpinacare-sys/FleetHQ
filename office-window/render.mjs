#!/usr/bin/env node
// render.mjs — מרנדר חלון-המשרד של מפקדת הצי (FleetHQ office window)
// Zero deps. Node >= 18. Produces a STANDALONE static page (single index.html,
// inline CSS, zero JS, dark theme, RTL, mobile-first) into office-window/dist/.
//
// Sources (all in-repo, measured at render time — nothing invented):
//   * receipts/office-state-mirror.json  — the office's own machine-readable state
//     (tasks wall, goal, decisions, library reports) mirrored from the live foreman.
//   * office-window/dist/digest.json     — fleet digest from fleet-digest.mjs
//     (optional; if absent, fleet status renders as honestly unknown).
//
// Usage: node render.mjs [--repo <FleetHQ root>] [--digest <digest.json>] [--out <index.html>]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function argOf(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const REPO = resolve(argOf('--repo', resolve(HERE, '..')));
const DIGEST_PATH = resolve(argOf('--digest', join(HERE, 'dist', 'digest.json')));
const OUT = resolve(argOf('--out', join(HERE, 'dist', 'index.html')));

const generatedAt = new Date().toISOString();

// version-info law (T32): the published page must carry a readable version identifier
// (version + build date) — the ops-intake site-check scans for `build: YYYY-MM-DD`;
// a Pages page without it re-opens a P3 polish order every cycle.
const pkgVersion = (() => { try { return JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version || '0.0.0'; } catch { return '0.0.0'; } })();
const buildDate = generatedAt.slice(0, 10);

// ---------------------------------------------------------------- utilities
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}
function fmtUTC(t) {
  const ms = toMs(t);
  if (ms == null) return null;
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
function relHe(t) {
  const ms = toMs(t);
  if (ms == null) return null;
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 90) return 'לפני פחות מדקה';
  const m = Math.floor(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 36) return `לפני ${h} שע׳`;
  const d = Math.floor(h / 24);
  if (d < 60) return `לפני ${d} ימים`;
  return `לפני ${Math.floor(d / 30)} חודשים`;
}
function whenOrUnknown(t) {
  const f = fmtUTC(t);
  return f ? `${f} · ${relHe(t)}` : 'לא נמדד';
}
const clip = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

// ---------------------------------------------------------------- crew (README cast, stable)
const CAST = [
  { id: 'aluf', he: 'אלוף', en: 'Aluf', roleHe: 'ראש-מטה', roleEn: 'Chief of staff', owns: 'תכנון · ביקורת · חילוץ', chief: true },
  { id: 'gal', he: 'גל', en: 'Gal', roleHe: 'מפעיל-שוק', roleEn: 'Market operator', owns: 'ספרי-שוק וסחירות' },
  { id: 'erez', he: 'ארז', en: 'Erez', roleHe: 'מבקר-פנים', roleEn: 'Internal auditor', owns: 'ביקורות ומטריצת-יכולות' },
  { id: 'tamar', he: 'תמר', en: 'Tamar', roleHe: 'כלכלנית-הצי', roleEn: 'Fleet economist', owns: 'כלכלה וריבונות' },
  { id: 'shachar', he: 'שחר', en: 'Shachar', roleHe: 'קצין-מודיעין', roleEn: 'Intelligence officer', owns: 'אינדיקטורים · מפקד · למידה' },
  { id: 'yarden', he: 'ירדן', en: 'Yarden', roleHe: 'מהנדס-תשתית', roleEn: 'Infrastructure engineer', owns: 'רישום · מתזמנים · אוטובוס-תיאום' },
];
const AMIT = { id: 'amit', he: 'עמית', en: 'Amit', roleHe: 'קבלה', roleEn: 'Receptionist', owns: 'מענה-שאלות על הפלטפורמה בלבד (מגודר-מבנית)' };

// ---------------------------------------------------------------- office state
function loadOffice() {
  const p = join(REPO, 'receipts', 'office-state-mirror.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
function loadDigest() {
  if (!existsSync(DIGEST_PATH)) return null;
  try { return JSON.parse(readFileSync(DIGEST_PATH, 'utf8')); } catch { return null; }
}

const office = loadOffice();
const digest = loadDigest();

// ---------------------------------------------------------------- room3d (baked frames — Task 11-a)
/** מקורות-הפריימים (בסדר-עדיפות, שניהם אמיתיים):
 *  1. office-window/dist/3d/meta.json — בייק באותה-ריצה (office-3d.yml)
 *  2. receipts/office-3d/latest.json — מצביע-מחויב מבייק מוצלח קודם
 *  ה-<img> תמיד מצביע על "3d/<file>" יחסית — הפריימים חיים על ענף
 *  office-pages (מפורסמים על-ידי office-3d.yml). אין פריימים → "טרם אופה" כנה.
 *  האפליקציה האינטראקטיבית אינה מוגשת ב-Pages — הקישור מוביל ל-README/הרצה. */
function loadRoom3D() {
  const metaSameRun = join(HERE, 'dist', '3d', 'meta.json');
  const latest = join(REPO, 'receipts', 'office-3d', 'latest.json');
  for (const p of [metaSameRun, latest]) {
    if (!existsSync(p)) continue;
    try {
      const m = JSON.parse(readFileSync(p, 'utf8'));
      if (m && m.honest === true && m.mode === 'mirror' && Array.isArray(m.frames) && m.frames.length) {
        // meta.json = [{preset,label,file}] · latest.json = ["file.png"] — לנרמל לשמות
        const files = m.frames.map((f) => (typeof f === 'string' ? f : f?.file)).filter((f) => typeof f === 'string');
        if (!files.length) continue;
        return { capturedAt: m.capturedAt, sourceSavedAt: m.sourceSavedAt, frames: files, from: existsSync(metaSameRun) && p === metaSameRun ? 'bake-this-run' : 'latest-pointer' };
      }
    } catch { /* next source */ }
  }
  return null;
}
const room3d = loadRoom3D();

function renderRoom3D() {
  const appUrl = 'https://github.com/roshpinacare-sys/FleetHQ#readme';
  const runNote = 'האפליקציה האינטראקטיבית (סיור-מצלמה חי, לחיצה על דמויות) רצה מהריפו — bun install · bun run dev · ואז ?view=office';
  const head = `
    <div class="card wide">
      <h3>החדר התלת-ממדי — המשרד האמיתי</h3>
      <p class="meta">החדר כולו ניזון מהפורמן: בפריסה-חיה — מהסוקט ("חי"); כאן — מהיומן האמיתי שהפורמן עצמו כותב (office-state-mirror.json): המציאות הנמדדת של המשרד, קפואה בזמן-השמירה. אין סימולציה ואין המצאה — מה שלא נמדד לא מוצג.</p>
      <div class="links">
        <a href="${appUrl}" rel="noopener">החדר האינטראקטיבי — הרצה מהריפו (README)</a>
        <a href="https://github.com/roshpinacare-sys/FleetHQ/blob/main/receipts/office-state-mirror.json" rel="noopener">מקור: היומן האמיתי</a>
      </div>
      <p class="meta" style="margin-top:8px">${esc(runNote)}</p>
    </div>`;
  if (!room3d) {
    return `${head}
    <div class="card wide"><div class="unknown">הפריימים טרם אופו בריצה-זו (office-3d טרם רץ או שהבייק האחרון נכשל — ולא מציגים פריימי-מקום). החלון יציג כאן את פריימי-החדר ברגע שהבייק יצליח.</div></div>`;
  }
  const figs = room3d.frames.map((f, i) => `
      <figure class="fig3d">
        <img src="3d/${esc(f)}" alt="פריים ${i + 1} מהחדר התלת-ממדי של מפקדת הצי" loading="lazy">
      </figure>`).join('');
  return `${head}
    <div class="card wide">
      ${chip('accent', `אופה: ${fmtUTC(room3d.capturedAt) || 'לא נמדד'}`)}
      ${chip('info', `מציאות נמדדה מ: ${fmtUTC(room3d.sourceSavedAt) || 'לא נמדד'}`)}
      ${chip('neutral', `מצב: מראה · ${room3d.frames.length} פריימים`)}
      <div class="frames">${figs}
      </div>
      <p class="meta">כל פריים נלכד מהקנבס האמיתי (headless WebGL) באותן פוזות של מצלמת-הבמאי — לא רנדור-מחדש ולא עריכה. המטא-נתונים: <a href="3d/meta.json" rel="noopener">3d/meta.json</a>.</p>
    </div>`;
}

// ---------------------------------------------------------------- chips
const chip = (cls, label) => `<span class="chip ${cls}">${esc(label)}</span>`;

const TASK_STATUS = {
  done: { cls: 'ok', label: 'בוצע' },
  todo: { cls: 'warn', label: 'בתור' },
  in_work: { cls: 'info', label: 'בעבודה' },
  in_review: { cls: 'violet', label: 'בביקורת' },
  blocked: { cls: 'bad', label: 'חסום' },
};
function taskChip(status) {
  const s = TASK_STATUS[status] || { cls: 'neutral', label: status || 'לא-ידוע' };
  return chip(s.cls, s.label);
}

const RUN_BADGE = {
  success: { cls: 'ok', label: 'הצלחה' },
  failure: { cls: 'bad', label: 'כישלון' },
  cancelled: { cls: 'warn', label: 'בוטל' },
  timed_out: { cls: 'bad', label: 'פסק-זמן' },
  startup_failure: { cls: 'bad', label: 'כישלון-אתחול' },
  in_progress: { cls: 'info', label: 'בריצה' },
  queued: { cls: 'info', label: 'בתור-ריצה' },
  neutral: { cls: 'neutral', label: 'לא-ידוע' },
};
function runBadge(run) {
  if (!run) return chip('neutral', 'לא נמדד');
  const key = run.conclusion || run.status || 'neutral';
  const b = RUN_BADGE[key] || RUN_BADGE.neutral;
  return chip(b.cls, b.label);
}

function gridBadge(v) {
  if (!v) return chip('neutral', 'לא נמדד');
  const s = String(v);
  if (/STABLE|OK|GREEN/i.test(s)) return chip('ok', s);
  if (/WAITING|STAGED|PARTIAL/i.test(s)) return chip('warn', s);
  if (/STALE|BLOCK|FAIL|HALT|RED/i.test(s)) return chip('bad', s);
  return chip('neutral', s);
}

// ---------------------------------------------------------------- section: office
function renderOffice() {
  if (!office || !Array.isArray(office.tasks)) {
    return `<div class="card"><div class="unknown">מצב-המשרד לא נקרא בריצה זו (receipts/office-state-mirror.json חסר או לא-תקני) — מציג לא-ידוע, לא ממציא.</div></div>`;
  }
  const tasks = office.tasks;
  const counts = { todo: 0, in_work: 0, in_review: 0, done: 0, other: 0 };
  for (const t of tasks) {
    if (t.status in counts) counts[t.status] += 1; else counts.other += 1;
  }
  const recent = [...tasks].sort((a, b) => (toMs(b.updatedAt) || 0) - (toMs(a.updatedAt) || 0)).slice(0, 8);

  // measured per-agent activity
  const perAgent = new Map(CAST.map((c) => [c.id, { done: 0, active: 0, lastMs: 0, lastTitle: null }]));
  for (const t of tasks) {
    const a = perAgent.get(t.assignee);
    if (!a) continue;
    if (t.status === 'done') a.done += 1; else a.active += 1;
    const ms = toMs(t.updatedAt) || 0;
    if (ms >= a.lastMs) { a.lastMs = ms; a.lastTitle = t.title; }
  }

  const goal = office.goal && office.goal.status === 'active' ? office.goal : null;
  const goalPct = goal && typeof goal.progress === 'number' ? Math.round(goal.progress * 100) : null;

  const reports = [...(office.reports || [])].sort((a, b) => (toMs(b.ts) || 0) - (toMs(a.ts) || 0)).slice(0, 6);
  const decisions = [...(office.decisions || [])].sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0)).slice(0, 2);
  const mirrorUrl = 'https://github.com/roshpinacare-sys/FleetHQ/blob/main/receipts/office-state-mirror.json';
  const authorHe = (id) => {
    const c = CAST.find((x) => x.id === id);
    return c ? `${c.he} (${c.en})` : (id || 'לא-ידוע');
  };

  const savedAt = fmtUTC(office.savedAt);

  return `
  <div class="grid2">
    <div class="card">
      <h3>ראש-המטה — המטרה הנוכחית</h3>
      ${goal ? `
        <p class="goal-text">${esc(clip(goal.text, 240))}</p>
        <div class="progress"><div class="bar" style="width:${Math.max(0, Math.min(100, goalPct == null ? 0 : goalPct))}%"></div></div>
        <p class="meta">${goalPct == null ? 'התקדמות: לא נמדדה' : `התקדמות נמדדת: ${goalPct}%`} · מקור: ${goal.origin === 'patrol' ? 'פטרול אוטונומי' : esc(goal.origin || 'לא-ידוע')} · עודכן ${esc(whenOrUnknown(goal.updatedAt))}</p>
      ` : '<div class="unknown">אין מטרה פעילה במראה-המצב — המשרד בין-פטרולים (נמדד, לא כשל).</div>'}
      <p class="meta">מראת-המצב נשמרה: ${esc(savedAt || 'לא נמדד')} · <a href="${mirrorUrl}" rel="noopener">מקור: receipts/office-state-mirror.json</a></p>
    </div>

    <div class="card">
      <h3>לוח-המשימות — צילום-מצב</h3>
      <p class="meta">${chip('ok', `בוצעו ${counts.done}`)} ${chip('warn', `בתור ${counts.todo}`)}${counts.in_work ? ` ${chip('info', `בעבודה ${counts.in_work}`)}` : ''}${counts.in_review ? ` ${chip('violet', `בביקורת ${counts.in_review}`)}` : ''}${counts.other ? ` ${chip('neutral', `אחר ${counts.other}`)}` : ''} <span class="muted">· ${tasks.length} משימות במראה</span></p>
      <ul class="tasklist">
        ${recent.map((t) => `
          <li>
            <div class="task-top">${taskChip(t.status)} <span class="assignee">${esc(authorHe(t.assignee))}</span> <span class="muted">${esc(whenOrUnknown(t.updatedAt))}</span></div>
            <div class="task-title">${esc(clip(t.title || t.description || '(ללא-כותרת)', 160))}</div>
            ${t.why ? `<div class="task-why">התאמה: ${esc(clip(t.why, 110))}</div>` : ''}
          </li>`).join('')}
      </ul>
    </div>

    <div class="card">
      <h3>הצוות — נוכחות נמדדת</h3>
      <ul class="crew">
        ${CAST.map((c) => {
          const a = perAgent.get(c.id) || { done: 0, active: 0, lastMs: 0, lastTitle: null };
          return `<li>
            <span class="dot ${c.chief ? 'chief' : 'worker'}"></span>
            <span class="crew-name">${esc(c.he)} <span class="en">${esc(c.en)}</span></span>
            <span class="crew-role">${esc(c.roleHe)} · ${esc(c.owns)}</span>
            <span class="crew-stat">${c.chief ? 'מתכנן ומבקר (לא משויך-משימות)' : `${a.done} בוצעו · ${a.active} פתוחות · פעילות אחרונה ${esc(a.lastMs ? relHe(a.lastMs) : '—')}`}</span>
          </li>`;
        }).join('')}
        <li>
          <span class="dot amit"></span>
          <span class="crew-name">${esc(AMIT.he)} <span class="en">${esc(AMIT.en)}</span></span>
          <span class="crew-role">קבלה · ${esc(AMIT.owns)}</span>
          <span class="crew-stat">צ׳אט-מבקרים מגודר: אין-קבצים, אין-DB, אין-סוקט</span>
        </li>
      </ul>
    </div>

    <div class="card">
      <h3>הספרייה — דוחות אחרונים מהצוות</h3>
      ${reports.length ? `
      <ul class="reports">
        ${reports.map((r) => `
          <li>
            <div class="report-title">${esc(clip(r.title || '(ללא-כותרת)', 120))}</div>
            <div class="meta">${esc(authorHe(r.author))} · ${esc(whenOrUnknown(r.ts))} · <a href="${mirrorUrl}" rel="noopener">הטקסט המלא במראת-המצב</a></div>
            ${r.body ? `<div class="report-excerpt">${esc(clip(r.body, 150))}</div>` : ''}
          </li>`).join('')}
      </ul>` : '<div class="unknown">אין דוחות במראה-המצב (נמדד).</div>'}
      <p class="meta">כל דוח נכתב על-ידי סוכן מתוך קבצים שקרא בפועל — חוק-הכנות של המשרד.</p>
    </div>

    <div class="card wide">
      <h3>פודיום-ההכרעות</h3>
      <p class="meta">כשסוכן נתקל בשיקול-דעת, הוא עולה לפודיום; מדיניות-המפעיל האוטונומי מכריעה, והשאלה, ההקשר והתשובה מתפרסמים כאן כרשום-שקיפות. <strong>אין משטח-שליטה ציבורי</strong> — למבקר אין דרך להטות את המשרד (ראה <a href="https://github.com/roshpinacare-sys/FleetHQ/blob/main/SECURITY.md" rel="noopener">SECURITY.md</a>).</p>
      ${decisions.length ? `
      <ul class="decisions">
        ${decisions.map((d) => `
          <li>
            <div class="task-top">${chip('violet', 'הכרעה לפי-מדיניות')} <span class="muted">${esc(whenOrUnknown(d.createdAt))}</span></div>
            <div class="task-title">שאלה: ${esc(clip(d.question, 200))}</div>
            ${d.answer ? `<div class="task-why">הכרעה: ${esc(clip(d.answer.option || '', 80))}${d.answer.text ? ` — ${esc(clip(d.answer.text, 160))}` : ''}</div>` : ''}
          </li>`).join('')}
      </ul>` : '<div class="unknown">אין הכרעות במראה-המצב (נמדד).</div>'}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- section: fleet
function renderFleet() {
  if (!digest) {
    return `<div class="card wide"><div class="unknown">דיג'סט הצי (digest.json) לא נטען בריצה זו — מצב-הרשת מוצג כלא-ידוע. כנות מעל הכול: אין מספרים מומצאים.</div></div>`;
  }
  const repos = Array.isArray(digest.repos) ? digest.repos : [];
  const pub = repos.filter((r) => !r.private);
  const priv = repos.filter((r) => r.private);

  const rows = pub.map((r) => {
    const run = r.lastRun;
    const runCell = run
      ? `${runBadge(run)} <span class="run-name">${esc(clip(run.name || '', 34))}</span><br><span class="muted">${esc(whenOrUnknown(run.at))}</span>`
      : `<span class="muted">לא נמדד${r.lastRunReason ? ` (${esc(r.lastRunReason)})` : ''}</span>`;
    const commits = r.commits7d != null ? `${r.commits7d}${r.commits7dCapped ? '+' : ''}` : '—';
    return `<tr>
      <td><a href="https://github.com/roshpinacare-sys/${esc(r.name)}" rel="noopener">${esc(r.name)}</a></td>
      ${chip('info', 'ציבורי').replace('<span', '<td><span').replace('</span>', '</span></td>')}
      <td>${runCell}</td>
      <td class="num">${esc(commits)}</td>
      <td>${esc(fmtUTC(r.pushedAt) || '—')}</td>
    </tr>`;
  }).join('');

  const privRow = priv.length
    ? `<tr class="private-row"><td>${priv.map((p) => esc(p.name)).join(' · ')}</td><td>${chip('neutral', 'פרטי')}</td><td>${priv.filter((p) => p.lastRun).length}/${priv.length} נמדדו</td><td class="num">${priv.reduce((s, p) => s + (p.commits7d || 0), 0)}</td><td>—</td></tr>`
    : (digest.tokenMode === 'public-unauthenticated'
      ? `<tr class="private-row"><td colspan="5" class="muted">ריפואים-פרטיים בצי: לא נמדדו בריצה-ציבורית ללא טוקן (כנות, לא הסתרה)</td></tr>`
      : `<tr class="private-row"><td colspan="5" class="muted">ריפואים-פרטיים: ${digest.fleet && digest.fleet.privateCount ? esc(digest.fleet.privateCount) : 'לא-ידוע'} — שמותיהם אינם נמנים ציבורית (מדיניות-חשיפה 7-b)</td></tr>`);

  const g = digest.grid && digest.grid.status === 'measured' ? digest.grid : null;
  const ft = digest.fleetTruth && digest.fleetTruth.status === 'measured' ? digest.fleetTruth : null;
  const hive = digest.probes && digest.probes.hive ? digest.probes.hive : null;
  const blurt = digest.probes && digest.probes.blurt ? digest.probes.blurt : null;

  return `
  <div class="grid2">
    <div class="card wide">
      <h3>מנועי-הצי — ריפואים וריצות אחרונות</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>ריפו</th><th>נראות</th><th>ריצת-Actions אחרונה</th><th>קומיטים · 7 ימים</th><th>דחיפה אחרונה</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">לא נמדד — רשימת-הריפואים לא נטענה</td></tr>'}${privRow}</tbody>
      </table></div>
      <p class="meta">נמדד ${esc(whenOrUnknown(digest.generatedAt))} · מצב-טוקן: ${digest.tokenMode === 'gh-token' ? 'טוקן-קריאה' : 'ציבורי ללא-טוקן'} · ${digest.errors && digest.errors.length ? `${digest.errors.length} קריאות נכשלו (רשומות ב-digest.json — מוצג לא-ידוע)` : 'כל הקריאות עברו'} · <a href="https://roshpinacare-sys.github.io/FleetHQ/digest.json" rel="noopener">digest.json למכונות</a></p>
    </div>

    <div class="card">
      <h3>פסק-הגריד האחרון (grid-beat)</h3>
      ${g ? `
        <p>${gridBadge(g.verdict)} <span class="muted">HIVE:</span> ${g.hive ? gridBadge(g.hive.verdict) : chip('neutral', 'לא נמדד')}</p>
        <p class="meta">פורסם: ${esc(whenOrUnknown(g.publishedAt))} · מנוע: ${esc(clip(g.engine || '', 80))} · real=${g.real ? 'כן' : 'לא'} · armed=${g.armed ? 'כן' : 'לא'}</p>
        ${g.blocker ? `<p class="meta">חוסם: ${esc(clip(String(g.blocker), 220))}</p>` : ''}
        ${g.hive && g.hive.blocker ? `<p class="meta">חוסם-HIVE: ${esc(clip(g.hive.blocker.join(' · '), 220))}</p>` : ''}
      ` : `<div class="unknown">פסק-הגריד לא נמדד${digest.grid && digest.grid.reason ? ` (${esc(digest.grid.reason)})` : ''}</div>`}
      <p class="meta">מקור: ${esc(g ? g.source : '—')} · הפסק נכתב על-ידי המנוע עצמו; הדף רק משקף.</p>
    </div>

    <div class="card">
      <h3>אמת-השרשרת (grid-doctor, ללא דיווח-עצמי)</h3>
      ${ft ? `
        <ul class="kv">
          <li><span>SP אפקטיבי (STEEM)</span><b>${ft.steem && ft.steem.effectivePower != null ? esc(String(ft.steem.effectivePower)) : '—'}</b></li>
          <li><span>חשבונות חיים (STEEM)</span><b>${ft.steem && ft.steem.accountsAlive != null ? esc(String(ft.steem.accountsAlive)) : '—'}</b></li>
          <li><span>SP אפקטיבי (HIVE)</span><b>${ft.hive && ft.hive.effectivePower != null ? esc(String(ft.hive.effectivePower)) : '—'}</b></li>
        </ul>
        <p class="meta">נמדד: ${esc(whenOrUnknown(ft.generatedAt))} · מול RPC חי (api.steemit.com / api.hive.blog) — אפס דיווח-עצמי.</p>
      ` : `<div class="unknown">אמת-השרשרת לא נמדדה בריצה זו.</div>`}
    </div>

    <div class="card">
      <h3>בדיקות-רשת (קריאה-בלבד)</h3>
      <ul class="kv">
        <li><span>Hive probe</span><b>${hive && hive.status === 'measured' ? (hive.ok ? chip('ok', 'תקין') : chip('bad', 'ירוד')) : chip('neutral', 'לא נמדד')}</b></li>
        <li><span>בלוק-ראש HIVE</span><b>${hive && hive.headBlock != null ? esc(String(hive.headBlock)) : '—'}</b></li>
        <li><span>Blurt probe</span><b>${blurt && blurt.status === 'measured' ? (blurt.ok ? chip('ok', 'תקין') : chip('bad', 'ירוד')) : chip('neutral', 'לא נמדד')}</b></li>
        <li><span>צומת-Blurt</span><b>${blurt && blurt.nodeUsed ? esc(clip(blurt.nodeUsed, 40)) : '—'}</b></li>
      </ul>
      <p class="meta">${hive ? `Hive: ${esc(whenOrUnknown(hive.at))} · ${esc(hive.endpoint || '')} · שידור=${hive.broadcast ? 'כן' : 'אסור'} · מפתחות=${hive.keysUsed ? 'כן' : 'לא'}` : ''} ${blurt ? `· Blurt: ${esc(whenOrUnknown(blurt.at))} · חיים ${esc(blurt.aliveNodes || '')}` : ''}</p>
      <p class="meta">בדיקות Stage-0: קריאה בלבד — אפס מפתחות, אפס שידור.</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- page
const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>מפקדת הצי — המשרד החי | SAOS Fleet Office</title>
<meta name="description" content="מפקדת הצי (FleetHQ): משרד סוכנים אוטונומי בגיט. חלון-חי, נבנה אוטומטית ממצב-המשרד ומדיג'סט הצי — כל מספר נמדד, unknown נשאר unknown.">
<meta property="og:title" content="מפקדת הצי — המשרד החי">
<meta property="og:description" content="חלון-ראווה יומי על משרד-הסוכנים: לוח-משימות אמיתי, צוות חי, ספריית דוחות, פודיום-הכרעות — ומצב-הצי הנמדד.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230b0f14'/%3E%3Crect x='7' y='13' width='18' height='12' rx='2' fill='%232dd4bf'/%3E%3Crect x='10' y='7' width='5' height='6' fill='%2358a6ff'/%3E%3Crect x='17' y='7' width='5' height='6' fill='%23d29922'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#0b0f14; --surface:#10161d; --card:#131a22; --border:#22303f;
  --text:#e8eef5; --muted:#93a4b4; --ok:#3fb950; --warn:#d29922; --bad:#f85149;
  --info:#58a6ff; --violet:#bc8cff; --accent:#2dd4bf;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans Hebrew",sans-serif;
  line-height:1.65; -webkit-text-size-adjust:100%;
}
a{color:var(--info); text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1060px; margin-inline:auto; padding:20px 16px 48px}
header.hero{
  background:linear-gradient(180deg,#101a24 0%,var(--bg) 100%);
  border-bottom:1px solid var(--border); padding:40px 16px 26px; text-align:center;
}
.hero h1{margin:0 0 10px; font-size:clamp(1.55rem,5vw,2.4rem); letter-spacing:.01em}
.hero h1 .accent{color:var(--accent)}
.hero p.sub{margin:0 auto 14px; max-width:720px; color:var(--muted); font-size:clamp(.95rem,2.6vw,1.08rem)}
.hero .chips{display:flex; flex-wrap:wrap; gap:8px; justify-content:center}
.chip{display:inline-block; padding:2px 10px; border-radius:999px; font-size:.78rem; font-weight:600; border:1px solid transparent; white-space:nowrap}
.chip.ok{background:rgba(63,185,80,.14); color:var(--ok); border-color:rgba(63,185,80,.4)}
.chip.warn{background:rgba(210,153,34,.14); color:var(--warn); border-color:rgba(210,153,34,.4)}
.chip.bad{background:rgba(248,81,73,.14); color:var(--bad); border-color:rgba(248,81,73,.4)}
.chip.info{background:rgba(88,166,255,.14); color:var(--info); border-color:rgba(88,166,255,.4)}
.chip.violet{background:rgba(188,140,255,.14); color:var(--violet); border-color:rgba(188,140,255,.4)}
.chip.neutral{background:rgba(147,164,180,.12); color:var(--muted); border-color:rgba(147,164,180,.35)}
.chip.accent{background:rgba(45,212,191,.12); color:var(--accent); border-color:rgba(45,212,191,.4)}
section{margin-top:34px}
.sec-head{display:flex; align-items:center; gap:12px; margin:0 0 14px}
.sec-num{
  flex:none; width:34px; height:34px; display:grid; place-items:center; border-radius:9px;
  background:rgba(45,212,191,.12); color:var(--accent); border:1px solid rgba(45,212,191,.35); font-weight:700;
}
.sec-head h2{margin:0; font-size:clamp(1.2rem,3.6vw,1.5rem)}
.sec-head .en{color:var(--muted); font-weight:400; font-size:.85rem; margin-inline-start:8px}
html,body{overflow-x:clip}
.grid2{display:grid; gap:14px; grid-template-columns:1fr}
.grid2>*{min-width:0}
section{min-width:0}
.card{
  background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px 18px;
  box-shadow:0 1px 0 rgba(255,255,255,.02) inset; min-width:0; max-width:100%;
}
.card h3{margin:0 0 10px; font-size:1.02rem}
.card .meta,.muted{color:var(--muted); font-size:.82rem}
.unknown{
  background:rgba(147,164,180,.08); border:1px dashed rgba(147,164,180,.4);
  border-radius:10px; padding:10px 12px; color:var(--muted); font-size:.88rem;
}
.goal-text{margin:4px 0 10px; font-size:1rem}
.progress{height:10px; border-radius:999px; background:rgba(147,164,180,.15); overflow:hidden}
.bar{height:100%; background:linear-gradient(90deg,var(--accent),var(--info)); border-radius:999px}
.tasklist,.crew,.reports,.decisions{list-style:none; margin:0; padding:0}
.tasklist li,.decisions li{padding:9px 0; border-top:1px solid var(--border)}
.tasklist li:first-child,.decisions li:first-child{border-top:none}
.task-top{display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:.8rem}
.assignee{font-weight:600}
.task-title{margin-top:3px; font-size:.92rem}
.task-why{color:var(--muted); font-size:.8rem; margin-top:2px}
.crew li{display:grid; grid-template-columns:14px auto 1fr; gap:4px 10px; padding:8px 0; border-top:1px solid var(--border); align-items:baseline}
.crew li:first-child{border-top:none}
.dot{width:11px; height:11px; border-radius:50%; align-self:center; justify-self:center}
.dot.worker{background:var(--info)} .dot.chief{background:var(--accent)} .dot.amit{background:var(--warn)}
.crew-name{font-weight:700}
.crew-name .en{color:var(--muted); font-weight:400; font-size:.8rem; margin-inline-start:4px}
.crew-role{grid-column:2 / 4; color:var(--muted); font-size:.8rem}
.crew-stat{grid-column:2 / 4; font-size:.8rem}
.reports li{padding:9px 0; border-top:1px solid var(--border)}
.reports li:first-child{border-top:none}
.report-title{font-weight:600; font-size:.92rem}
.report-excerpt{color:var(--muted); font-size:.8rem; margin-top:2px}
.tablewrap{overflow-x:auto; -webkit-overflow-scrolling:touch; max-width:100%}
table{width:100%; border-collapse:collapse; font-size:.86rem; min-width:640px}
th{color:var(--muted); text-align:start; font-weight:600; padding:8px 10px; border-bottom:1px solid var(--border); white-space:nowrap}
td{padding:9px 10px; border-bottom:1px solid rgba(34,48,63,.55); vertical-align:middle}
tr:last-child td{border-bottom:none}
.num{font-variant-numeric:tabular-nums}
.private-row td{color:var(--muted); font-size:.8rem}
.run-name{font-size:.8rem; overflow-wrap:anywhere}
.kv{list-style:none; margin:0; padding:0}
.kv li{display:flex; justify-content:space-between; gap:12px; padding:7px 0; border-top:1px solid var(--border); font-size:.9rem}
.kv li:first-child{border-top:none}
.marketing .card p{font-size:.9rem}
.frames{display:grid; gap:12px; grid-template-columns:1fr; margin-top:12px}
.fig3d{margin:0; border:1px solid var(--border); border-radius:10px; overflow:hidden; background:var(--surface)}
.fig3d img{display:block; width:100%; height:auto; aspect-ratio:16/9; object-fit:cover}
p,.goal-text,.report-excerpt,.meta{overflow-wrap:anywhere}
@media (min-width:760px){
  .frames{grid-template-columns:1fr 1fr}
}
.links{display:flex; flex-wrap:wrap; gap:10px; margin-top:12px}
.links a{
  display:inline-block; padding:8px 14px; border:1px solid var(--border); border-radius:10px;
  background:var(--surface); font-size:.88rem;
}
.links a:hover{border-color:var(--accent); text-decoration:none}
footer{
  margin-top:44px; padding-top:18px; border-top:1px solid var(--border);
  color:var(--muted); font-size:.82rem; text-align:center;
}
footer .stamp{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; direction:ltr; unicode-bidi:embed}
@media (min-width:760px){
  .grid2{grid-template-columns:1fr 1fr}
  .grid2 .card.wide{grid-column:1 / -1}
  .wrap{padding:28px 24px 56px}
}
</style>
</head>
<body>

<header class="hero">
  <h1><span class="accent">מפקדת הצי</span> — המשרד החי</h1>
  <p class="sub">משרד סוכנים אוטונומי שחי בגיט: ראש-מטה מתכנן, חמישה עובדים מבצעים מול ספרי-נתונים אמיתיים, וכל צעד נרשם כקבלה. הדף הזה הוא חלון-הראווה של המשרד — נבנה אוטומטית מהקבצים עצמם, בלי ממשק-שליטה ובלי מספרים מומצאים.</p>
  <div class="chips">
    ${chip('accent', `הונדש: ${fmtUTC(generatedAt)}`)}
    ${chip('neutral', 'צילום-מצב סטטי · נבנה מחדש מדי יום')}
    ${chip('neutral', 'קריאה-בלבד')}
    <a class="chip neutral" href="https://github.com/roshpinacare-sys/FleetHQ" rel="noopener" style="text-decoration:none">GitHub · FleetHQ</a>
    <a class="chip neutral" href="potential.html" style="text-decoration:none">לוח-הפוטנציאל · potential</a>
  </div>
</header>

<div class="wrap">

  <section id="office3d-cta" aria-labelledby="h-office3d" style="margin-top:18px">
    <a href="office3d/" rel="noopener" style="display:block;text-decoration:none;color:inherit;background:linear-gradient(135deg,#2b2016 0%,#4a301f 45%,#1f2a24 100%);border:1px solid #6b4a2a;border-radius:18px;padding:20px 22px;transition:transform .2s ease, box-shadow .2s ease" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 14px 40px rgba(224,151,63,.25)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <h2 id="h-office3d" style="margin:0 0 4px;font-size:1.25rem;color:#f2c368">המשרד התלת-מימדי החי — כניסה ישירה</h2>
          <p style="margin:0;color:#d8cdb8;font-size:.95rem;line-height:1.6">החדר החי v4: הכל על-הקרקע, כיסאות פונים למסכים, ובמוי-קולנועי — הצוות בעבודתו מול הנתונים האמיתיים: לוח-המשימות, קיר-הגיט והספרייה.</p>
        </div>
        <div style="background:#e0973f;color:#22180e;font-weight:800;border-radius:12px;padding:10px 18px;font-size:.95rem;white-space:nowrap">כניסה למשרד החי ←</div>
      </div>
    </a>
  </section>

  <section id="office3d-live-cta" aria-labelledby="h-office3d-live" style="margin-top:14px">
    <a href="office3d-live/" rel="noopener" style="display:block;text-decoration:none;color:inherit;background:linear-gradient(135deg,#16211f 0%,#1f3a33 45%,#241a2b 100%);border:1px solid #2a6b57;border-radius:18px;padding:20px 22px;transition:transform .2s ease, box-shadow .2s ease" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 14px 40px rgba(45,212,191,.25)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <h2 id="h-office3d-live" style="margin:0 0 4px;font-size:1.25rem;color:#2dd4bf">המשרד השני — תלת-מימד-אינטראקטיבי (r3f)</h2>
          <p style="margin:0;color:#c5ddd6;font-size:.95rem;line-height:1.6">הבנייה-האינטראקטיבית-העצמאית: סיור-חופשי-בחדר, הצוות-בעבודתו, אמת-כלכלית-מהשרשרת. עומד-בפני-עצמו — אפס-שרת, אפס-סוד, גיט-בלבד.</p>
        </div>
        <div style="background:#2dd4bf;color:#0c1f1b;font-weight:800;border-radius:12px;padding:10px 18px;font-size:.95rem;white-space:nowrap">כניסה למשרד השני ←</div>
      </div>
    </a>
  </section>

  <section id="room3d" aria-labelledby="h-room3d">
    <div class="sec-head"><span class="sec-num">1</span><h2 id="h-room3d">החדר התלת-ממדי — פריימי-אופה<span class="en">THE 3D ROOM — baked frames (mirror scene)</span></h2></div>
    ${renderRoom3D()}
  </section>

  <section id="office" aria-labelledby="h-office">
    <div class="sec-head"><span class="sec-num">2</span><h2 id="h-office">המשרד<span class="en">THE OFFICE — task wall · crew · library · podium</span></h2></div>
    ${renderOffice()}
  </section>

  <section id="fleet" aria-labelledby="h-fleet">
    <div class="sec-head"><span class="sec-num">3</span><h2 id="h-fleet">מצב הצי<span class="en">FLEET STATUS — measured network</span></h2></div>
    ${renderFleet()}
  </section>

  <section id="why" class="marketing" aria-labelledby="h-why">
    <div class="sec-head"><span class="sec-num">4</span><h2 id="h-why">למה זה שונה<span class="en">WHY IT'S DIFFERENT</span></h2></div>
    <div class="grid2">
      <div class="card">
        <h3>עבודה ניתנת לאימות</h3>
        <p>כל מספר בדף הזה נמדד בזמן-הבנייה מקובץ אמיתי: מצב-המשרד מגיע מהפורמן עצמו (<a href="https://github.com/roshpinacare-sys/FleetHQ/blob/main/receipts/office-state-mirror.json" rel="noopener">office-state-mirror.json</a>), מצב-הצי נאסף מ-API של גיטהאב ומקבלות-גריד ציבוריות. אפשר לפתוח כל מקור ולהשוות.</p>
      </div>
      <div class="card">
        <h3>אין דשבורדים מזויפים</h3>
        <p>חוק-הכנות של המשרד: אדום נשאר אדום עד שנמדד ירוק, וכשל מוצג ככשל. כשמשהו לא נמדד — הדף כותב <em>לא נמדד</em>, לעולם לא מסומן כתקין. גם הסוכנים עצמם מנועים מלדווח על מה שלא קראו.</p>
      </div>
      <div class="card">
        <h3>קריאה-בלבד</h3>
        <p>הסוקט והדף קריא-בלבד: אין קונסולת-מטרות, אין מענה-להכרעות, אין נתיב-כתיבה ציבורי. המשרד מתופעל על-ידי המפעיל האוטונומי ומכריע שאלות-שיקול-דעת לפי מדיניות מפורסמת — המבקר רואה הכל ואינו יכול להטות דבר.</p>
      </div>
      <div class="card">
        <h3>המשרד משפר את עצמו ומשרת את הרשת</h3>
        <p>הצוות סורק את ספרי-הצי בפטרולים אוטונומיים, חוצה ספרים זה-מול-זה, מדווח פערים וכותב דוחות לספרייה. הדף הזה עצמו נבנה ומתפרסם על-ידי המשרד (workflow יומי) — המשרד הוא גם המהנדס של חלונו.</p>
      </div>
      <div class="card wide">
        <h3>כניסות לרשת</h3>
        <div class="links">
          <a href="https://roshpinacare-sys.github.io/Domain/" rel="noopener">דף Domain — הספרים והזיכרון</a>
          <a href="https://roshpinacare-sys.github.io/Console/" rel="noopener">קונסולת הצי (Console)</a>
          <a href="https://github.com/roshpinacare-sys/FleetHQ" rel="noopener">FleetHQ — קוד-המשרד</a>
          <a href="https://roshpinacare-sys.github.io/FleetHQ/digest.json" rel="noopener">digest.json — למכונות</a>
          <a href="https://github.com/roshpinacare-sys/FleetHQ/blob/main/SECURITY.md" rel="noopener">SECURITY.md — רשום-האבטחה</a>
        </div>
        <p class="meta" style="margin-top:10px">digest.json מיועד לצריכה-מכונית (הדף של Domain ניזון ממנו) — סכמה: roshpinacare.fleet-digest/1.</p>
      </div>
    </div>
  </section>

  <footer>
    <div>נוצר אוטומטית על ידי המשרד · <span class="stamp">גרסה: v${esc(pkgVersion)} · build: ${esc(buildDate)}</span> · <span class="stamp">${esc(generatedAt)}</span></div>
    <div style="margin-top:6px">מקורות: receipts/office-state-mirror.json + office-window/dist/digest.json + office-window/dist/3d/ (נמדד בזמן-הבנייה) · אין-JS, אין-עוקבים, אין-סודות</div>
  </footer>

</div>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(JSON.stringify({
  out: OUT,
  generatedAt,
  officeLoaded: !!office,
  tasks: office && Array.isArray(office.tasks) ? office.tasks.length : 0,
  reports: office && Array.isArray(office.reports) ? office.reports.length : 0,
  digestLoaded: !!digest,
  bytes: html.length,
}, null, 2));
