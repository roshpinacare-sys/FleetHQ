#!/usr/bin/env node
// intake.mjs — צינור-הקליטה התפעולי של הצי (ops-intake v1)
//
// SENSE  — כל הריפו בארגון (ציבורי ופרטי), כל וורקפלו והריצה האחרונה שלו,
//          סיווג לפי החוקים הנמדדים (חומת-דקות, וורקפלו שבור, רצף כשלים, cron).
//          מכ"ם ארטיפקטים — טריות הפידים שהממשקים צורכים. בדיקת-אתרים — סטטוס HTTP של עמודי ה-Pages.
// DECIDE — תור עבודות מדודר (ops/QUEUE.json) לפי חוקים המקודדים כנתונים, P0 ראשון,
//          עם readyPrompt מלא לכל סדר-עבודה, דה-דופליקציה בין-ריצות וסגירת פתורים.
// RECORD — QUEUE.json + QUEUE.md + SPACE-MAP.md + קבלת-ריצה (ops/intake-state.json),
//          כתיבה עם אימות sha וניסיון-חוזר במקרה מירוץ.
// ESCALATE — כל P0 חדש → שורת-סוכן אחת ל-FleetHQ office/state/operator-inbox.jsonl.
//
// אין סודות בפלטים. משתנה-סביבה GH_PAT. אפס תלות. Node 20.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const TOKEN = process.env.GH_PAT || '';
const DRYRUN = process.env.INTAKE_DRYRUN === '1';
const ORG = 'roshpinacare-sys';
const REPO = 'ops-intake';
const NOW = new Date().toISOString();
const RUN_DAY = NOW.slice(0, 10).replace(/-/g, '');
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ops-intake-v1',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let apiCalls = 0;
let pausedForQuota = false;

const gh = async (path, opts = {}, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      apiCalls++;
      const r = await fetch(`https://api.github.com${path}`, { headers: H, ...opts });
      const rem = Number(r.headers.get('x-ratelimit-remaining') || '9999');
      if (rem < 200 && !pausedForQuota) { pausedForQuota = true; console.error(`rate-limit low (${rem}) — pausing 60s`); await sleep(60000); }
      if (r.status === 409 || r.status >= 500) { await sleep(800 * (i + 1)); continue; }
      return { status: r.status, ok: r.ok, data: r.status === 204 ? null : await r.json().catch(() => null), headers: r.headers };
    } catch (e) { if (i === tries - 1) return { status: 0, ok: false, data: null, err: String(e.message).slice(0, 80) }; await sleep(800); }
  }
  return { status: 0, ok: false, data: null };
};

// קריאת קובץ גולמי (raw) — מחזיר טקסט ולא JSON
const ghRaw = async (org, repo, path, ref = 'main') => {
  for (let i = 0; i < 2; i++) {
    try {
      apiCalls++;
      const r = await fetch(`https://api.github.com/repos/${org}/${repo}/contents/${encodeURI(path)}?ref=${ref}`, {
        headers: { ...H, Accept: 'application/vnd.github.raw' },
      });
      if (r.status >= 500) { await sleep(700); continue; }
      const text = r.status === 200 ? await r.text() : null;
      return { status: r.status, ok: r.ok, text };
    } catch { if (i === 1) return { status: 0, ok: false, text: null }; await sleep(700); }
  }
  return { status: 0, ok: false, text: null };
};

const ageMs = (ts) => { const t = Date.parse(ts || ''); return isNaN(t) ? null : Date.now() - t; };
const ageMin = (ts) => { const a = ageMs(ts); return a == null ? null : Math.round(a / 60000); };
const ageH = (ts) => { const a = ageMs(ts); return a == null ? null : Math.round((a / 3600000) * 10) / 10; };
const blobSha = (content) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex');
const sha16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

// ---------- מכ"ם-פידים: רשימת הפידים הגלויים שהצי מפרסם ----------
// visibility: public-ui = פיד שמזין עמוד גלוי למבקר, sovereignty = ערוץ פנימי-ריבוני
const FEEDS = [
  { repo: 'Domain', path: 'public/pulse.json', label: 'דופק ציבורי', ui: 'דף הבית של Domain', visibility: 'public-ui' },
  { repo: 'Domain', path: 'office/world-state.json', label: 'מצב-עולם המשרד', ui: 'המשרד התלת-ממד', visibility: 'public-ui' },
  { repo: 'Domain', path: 'office/data.json', label: 'נתוני-משרד', ui: 'המשרד התלת-ממד', visibility: 'public-ui' },
  { repo: 'FleetHQ', path: 'office/state/office-state.json', label: 'מצב-משרד מאוחד', ui: 'FleetHQ', visibility: 'public-ui' },
  { repo: 'GridWatch', path: 'state/fleet-health.json', label: 'בריאות-צי', ui: 'שער-הכניסה ועמוד הבקרה', visibility: 'public-ui' },
  { repo: 'Sandbox', path: 'ops/sovereign/OWNER-CHANNEL/inbox.jsonl', label: 'ערוץ-הבעלים', ui: 'ריבונות (פרטי)', visibility: 'sovereignty', private: true },
  { repo: 'saos-runtime', path: 'state/grid-status.json', label: 'מצב-רשת', ui: 'רשת-האמת', visibility: 'public-ui' },
  { repo: 'saos-runtime', path: 'state/watchdog-actions.json', label: 'פעולות-שומר', ui: 'רשת-האמת', visibility: 'public-ui' },
];
const PAGES_SITES = [
  { url: 'https://roshpinacare-sys.github.io/', name: 'שער-הכניסה', frontDoor: true },
  { url: 'https://roshpinacare-sys.github.io/Domain/', name: 'Domain', frontDoor: true },
  { url: 'https://roshpinacare-sys.github.io/Console/', name: 'Console', frontDoor: true },
  { url: 'https://roshpinacare-sys.github.io/FleetHQ/', name: 'FleetHQ', frontDoor: true },
  { url: 'https://roshpinacare-sys.github.io/GridWatch/', name: 'GridWatch', frontDoor: false },
];

// חילוץ חותמת-זמן מתוך JSON של פיד — רק מפתחות זמן ידועים, ללא ניחושים
const TS_KEYS = ['generatedAt', 'capturedAt', 'updatedAt', 'timestamp', 'generated', 'ts', 'lastRun', 'startedAt', 't', 'at'];
function extractTs(v, depth = 0) {
  if (v == null || depth > 4) return null;
  if (typeof v === 'number') return v > 1e9 ? v : v * 1000; // epoch שניות או מילי
  if (typeof v === 'string') {
    const p = Date.parse(v);
    return isNaN(p) ? null : p;
  }
  if (Array.isArray(v)) { for (let i = v.length - 1; i >= 0; i--) { const r = extractTs(v[i], depth + 1); if (r != null) return r; } return null; }
  if (typeof v === 'object') {
    for (const k of TS_KEYS) if (k in v) { const r = extractTs(v[k], depth + 1); if (r != null) return r; }
  }
  return null;
}

// ---------- SENSE 1: ריפו ----------
const repos = [];
{
  let page = 1;
  for (;;) {
    const r = await gh(`/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner`);
    if (!r.ok) { console.error('repos fetch failed', r.status); break; }
    repos.push(...r.data);
    if (r.data.length < 100) break;
    page++;
  }
}
console.log(`repos: ${repos.length}`);

// ---------- מצב קודם (תור + מטמון-cron) ----------
let prevQueue = null; let prevQueueSha = null; let prevCronCache = {};
{
  const q = await gh(`/repos/${ORG}/${REPO}/contents/ops/QUEUE.json`);
  if (q.ok && q.data?.content) {
    prevQueueSha = q.data.sha;
    try { prevQueue = JSON.parse(Buffer.from(q.data.content, 'base64').toString()); } catch { prevQueue = null; }
  }
  const st = await gh(`/repos/${ORG}/${REPO}/contents/ops/intake-state.json`);
  if (st.ok && st.data?.content) {
    try { prevCronCache = (JSON.parse(Buffer.from(st.data.content, 'base64').toString()).cronCache) || {}; } catch { prevCronCache = {}; }
  }
}

// ---------- SENSE 2: וורקפלו + ריצות + cron לכל ריפו ----------
const cronCache = {};
async function cronOf(repoName, path, sha) {
  const key = `${repoName}::${path}`;
  const hit = prevCronCache[key];
  if (hit && hit.sha === sha) { cronCache[key] = hit; return hit.cron; }
  const r = await gh(`/repos/${ORG}/${repoName}/contents/${encodeURIComponent(path)}`);
  if (!r.ok) { const v = { sha, cron: null }; cronCache[key] = v; return null; }
  const txt = Buffer.from(r.data.content || '', 'base64').toString();
  const crons = [...txt.matchAll(/cron:\s*['"]?([^'"\n]+)/g)].map((m) => m[1].trim());
  const v = { sha, cron: crons[0] || null, all: crons };
  cronCache[key] = v;
  return v.cron;
}

const fleet = [];
let jobsProbeBudget = 80;
async function classifyRun(repo, ymlShas, wf, runs) {
  const last = runs[0] || null;
  let streak = 0;
  for (const r of runs) { if (r.conclusion === 'failure' || r.conclusion === 'startup_failure' || r.conclusion === 'timed_out') streak++; else break; }
  let cls = null; let note = '';
  if (wf.state === 'disabled_inactivity') { cls = 'dormant'; note = 'GitHub השבית (חוסר-פעילות)'; }
  else if (wf.state === 'disabled_manually') { cls = 'disabled'; note = 'הושבת ידנית'; }
  else if (!last) { cls = 'never-run'; note = 'אין ריצות מתועדות'; }
  else {
    const durS = last.updated_at && last.created_at ? Math.round((Date.parse(last.updated_at) - Date.parse(last.created_at)) / 1000) : null;
    if (streak >= 1 && durS != null && durS < 90) {
      // כשל מיידי — מדידת מספר-הצעדים: אפס צעדים בריפו פרטי = חומת-דקות; עם צעדים = וורקפלו שבור
      let steps = -1;
      if (jobsProbeBudget > 0) {
        jobsProbeBudget--;
        const jr = await gh(`/repos/${ORG}/${repo.name}/actions/runs/${last.id}/jobs?per_page=20`);
        if (jr.ok && Array.isArray(jr.data?.jobs)) steps = jr.data.jobs.reduce((s, j) => s + (Array.isArray(j.steps) ? j.steps.length : 0), 0);
        await sleep(60);
      }
      if (steps === 0) {
        if (repo.private) { cls = 'billing-blocked'; note = `כשל מיידי (${durS}s) עם אפס צעדים — חומת-דקות (חיוב)`; }
        else { cls = 'broken-workflow'; note = `כשל מיידי (${durS}s) עם אפס צעדים — פגם-תצורה`; }
      } else if (steps > 0) { cls = 'broken-workflow'; note = `כשל מיידי (${durS}s) לאחר ${steps} צעדים — וורקפלו שבור`; }
      else { cls = 'failing-streak'; note = `${streak} כשלים רצופים (כשל מיידי, מספר-צעדים לא נמדד)`; }
    } else if (streak >= 3) { cls = 'failing-streak'; note = `${streak} כשלים רצופים`; }
    else if (streak >= 1) { cls = 'failing-streak'; note = `${streak} כשלים רצופים (ריצה אחרונה ${Math.round(durS / 60)} דק)`; }
    else { cls = 'ok'; note = ''; }
  }
  const cron = last?.path ? await cronOf(repo.name, last.path, (ymlShas || {})[last.path] || null) : null;
  return { id: wf.id, name: wf.name, state: wf.state, cron: cron || null, class: cls, note, streak, lastRunAt: last?.created_at || null, lastConclusion: last?.conclusion || null, path: last?.path || wf.path || null };
}

for (const repo of repos) {
  const [wfs, runsR1, runsR2, dir] = await Promise.all([
    gh(`/repos/${ORG}/${repo.name}/actions/workflows?per_page=100`),
    gh(`/repos/${ORG}/${repo.name}/actions/runs?per_page=100&page=1&sort=created&direction=desc`),
    gh(`/repos/${ORG}/${repo.name}/actions/runs?per_page=100&page=2&sort=created&direction=desc`),
    gh(`/repos/${ORG}/${repo.name}/contents/.github/workflows`),
  ]);
  const wfList = wfs.ok ? (wfs.data.workflows || []) : [];
  const runList = [...(runsR1.ok ? (runsR1.data.workflow_runs || []) : []), ...(runsR2.ok ? (runsR2.data.workflow_runs || []) : [])];
  const byWf = new Map();
  for (const run of runList) {
    if (!byWf.has(run.workflow_id)) byWf.set(run.workflow_id, []);
    if (byWf.get(run.workflow_id).length < 6) byWf.get(run.workflow_id).push(run);
  }
  const ymlShas = {};
  if (dir.ok) for (const f of (dir.data || [])) if (/\.ya?ml$/.test(f.name)) ymlShas[f.path] = f.sha;
  const seen = new Set([...byWf.keys()]);
  for (const wf of wfList) if (!seen.has(wf.id)) {
    const r = await gh(`/repos/${ORG}/${repo.name}/actions/workflows/${wf.id}/runs?per_page=6`);
    if (r.ok && r.data?.workflow_runs?.length) byWf.set(wf.id, r.data.workflow_runs);
    await sleep(40);
  }
  const rows = [];
  for (const wf of wfList) rows.push(await classifyRun(repo, ymlShas, wf, byWf.get(wf.id) || []));
  fleet.push({
    name: repo.name, private: repo.private, pushedAt: repo.pushed_at, defaultBranch: repo.default_branch,
    workflows: rows.sort((a, b) => (a.class === 'ok' ? 1 : 0) - (b.class === 'ok' ? 1 : 0) || a.name.localeCompare(b.name)),
    wfCount: rows.length,
  });
  await sleep(60);
}
const billingRepos = fleet.filter((r) => r.private && r.workflows.some((w) => w.class === 'billing-blocked'));
const billingWfCount = billingRepos.reduce((s, r) => s + r.workflows.filter((w) => w.class === 'billing-blocked').length, 0);
console.log(`fleet scanned: ${fleet.length} repos, billing-wall repos: ${billingRepos.length} (${billingWfCount} workflows)`);

// ---------- SENSE 3: מכ"ם ארטיפקטים ----------
const radar = [];
for (const f of FEEDS) {
  const r = await ghRaw(ORG, f.repo, f.path, 'main');
  const entry = { ...f, status: r.status, fetched: true };
  if (r.ok && r.text != null) {
    let ts = null;
    entry.empty = r.text.trim() === '' || r.text.trim() === '{}' || r.text.trim() === '[]';
    if (!entry.empty) {
      if (f.path.endsWith('.jsonl')) {
        const lines = r.text.trimEnd().split('\n').filter((l) => l.trim());
        for (let i = lines.length - 1; i >= 0 && ts == null; i--) { try { ts = extractTs(JSON.parse(lines[i])); } catch { } }
      } else { try { ts = extractTs(JSON.parse(r.text)); } catch { ts = null; } }
    }
    const tsIso = ts != null ? new Date(ts).toISOString() : null;
    entry.ts = tsIso;
    entry.ageHours = tsIso ? ageH(tsIso) : null;
    entry.stale = entry.ageHours != null && entry.ageHours > 24;
    if (entry.ts != null && /-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|\b5[KJ][1-9A-HJ-NP-Za-km-z]{49,51}\b/.test(r.text)) entry.suspectKeys = true;
  } else if (r.status === 403) { entry.error = '403 — אין גישה (פרטי)'; }
  else { entry.error = `HTTP ${r.status}`; entry.missing = r.status === 404; }
  radar.push(entry);
  await sleep(40);
}
// טריות שער-הכניסה לפי תאריך-קומיט אחרון
const ghio = repos.find((r) => r.name === 'roshpinacare-sys.github.io');
const indexFresh = ghio ? { repo: 'roshpinacare-sys.github.io', path: '(index)', label: 'שער-הכניסה — קומיט אחרון', ui: 'שער-הכניסה', visibility: 'public-ui', status: 200, ts: ghio.pushed_at, ageHours: ageH(ghio.pushed_at), stale: (ageH(ghio.pushed_at) || 0) > 24 } : null;

// ---------- SENSE 4: בדיקת-אתרים + מידע-גרסה ----------
const sites = [];
for (const s of PAGES_SITES) {
  try {
    apiCalls++;
    const r = await fetch(s.url, { headers: { 'User-Agent': 'ops-intake-v1' }, redirect: 'follow' });
    const html = r.ok ? (await r.text()).slice(0, 200000) : '';
    const hasVersion = /version|v\d+\.\d+|build\s*#?\s*\d+|מספר-גרסה|גרסה\s*\d/i.test(html);
    sites.push({ ...s, http: r.status, ok: r.ok, hasVersion });
  } catch (e) { sites.push({ ...s, http: 0, ok: false, hasVersion: false, error: String(e.message).slice(0, 60) }); }
  await sleep(30);
}

// ---------- SENSE 5: README + יומן-עבודה לכל ריפו (למפת-המרחב) ----------
const repoMeta = {};
for (const repo of fleet) {
  let purpose = null;
  const rd = await ghRaw(ORG, repo.name, 'README.md', repo.defaultBranch);
  if (rd.ok && rd.text) { const m = rd.text.split('\n').find((l) => /^#\s+\S/.test(l)); purpose = m ? m.replace(/^#\s+/, '').trim() : null; }
  if (!purpose) { const rd2 = await ghRaw(ORG, repo.name, 'readme.md', repo.defaultBranch); if (rd2.ok && rd2.text) { const m = rd2.text.split('\n').find((l) => /^#\s+\S/.test(l)); purpose = m ? m.replace(/^#\s+/, '').trim() : null; } }
  const wl = await ghRaw(ORG, repo.name, 'worklog.md', repo.defaultBranch);
  repoMeta[repo.name] = { purpose: purpose || 'ללא README', hasWorklog: wl.ok, worklogStatus: wl.status };
  await sleep(30);
}

// ---------- מצב GridWatch (לחוק 5 — אל תשכפל ריפוי שכבר בטיפול) ----------
let gwHealth = null;
{
  const g = await ghRaw(ORG, 'GridWatch', 'state/fleet-health.json', 'main');
  if (g.ok && g.text) { try { gwHealth = JSON.parse(g.text); } catch { gwHealth = null; } }
}

// ---------- DECIDE: בניית סדרי-העבודה לפי חוקים המקודדים כנתונים ----------
const lawsBlock = () => [
  'חוקים מחייבים לכל סוכן',
  '- קרא קודם את worklog.md של הריפו-יעד ואת יומן-העבודה המקומי; רשום שם בעלות על המשימה לפני כתיבה ראשונה.',
  '- אנטי-זיוף — כל קביעה חייבת מדידה; אסור להציג מצב שלא אומתת בקריאה-חוזרת.',
  '- אסור לחשוף, להעתיק או להתחייב חומר-מפתח, טוקן או סוד בשום קובץ.',
  '- אחרי כל כתיבה — אמת בקריאה-חוזרה (תוכן הקובץ או סטטוס העמוד והשוואת sha).',
  '- עברית מקצועית בלבד, ללא מירכאות-קישוט וללא פניות אישיות.',
  '- גע רק בריפו-היעד; אם בעלות כבר רשומה ביומן-העבודה — עבור לסדר-העבודה הבא בתור.',
].join('\n');

const orders = [];
const addOrder = (order) => orders.push(order);
const fmtAge = (h) => (h == null ? 'לא נמדד' : `${h} שע`);

// חוק 1 — P0 קבוע — החלטת-בעלים — חומת דקות ה-Actions בריפו פרטיים (נשארת עד להסרת החומת)
if (billingRepos.length > 0) {
  const sample = billingRepos.slice(0, 5).map((r) => `${r.name} (${r.workflows.filter((w) => w.class === 'billing-blocked').length})`).join(', ');
  addOrder({
    kind: 'owner-decision', repo: ORG, severity: 'P0',
    title: 'חומת דקות Actions בריפו פרטיים — נדרשת החלטת-בעלים',
    why: `נמדד בריצה זו ${billingRepos.length} ריפו פרטיים שכל ריצות ה-Actions בהם נכשלות מיידית עם אפס צעדים (חתימת חיוב), סה"כ ${billingWfCount} וורקפלו חסומים. דוגמאות — ${sample}. מדידה — ${NOW}.`,
    readyPrompt: [
      `יעד — הכן תדריך-החלטה לבעלים על חומת דקות ה-Actions בריפו הפרטיים של הארגון ${ORG}. הסוכן אינו מבטל את החומת ואינו מעלה חיוב בעצמו.`,
      `ריפו — ${ORG} (בעייתיים במיוחד — ${sample}).`,
      'קריאות ראשונות — GridWatch/state/fleet-health.json (מצב-צי מלא), ops-intake ops/QUEUE.json (סדרי-עדיפויות), worklog.md המקומי.',
      `מה נמדד — ${billingRepos.length} ריפו פרטיים, ${billingWfCount} וורקפלו עם כשל מיידי ואפס צעדים. ריפו ציבוריים ממשיכים לרוץ חופשי.`,
      'המוצר הנדרש — תדריך בעברית עם המספרים בלבד: מה חסום, מה נפגע (ריפוי-עצמי, מחליט-ריבוני, ארטיפקטים שמחוללים בפרטי), ושתי חלופות — פתרון-חיוב אצל GitHub, או הרחבת מסלול-חישוב-ציבורי (הדפוס שהוכיח את עצמו ב-GridWatch flow-map — רץ ציבורי קורא פרטי עם PAT ומחייב חזרה).',
      'פרסום — שורת-סוכן אחת ל-Sandbox ops/sovereign/OWNER-CHANNEL/inbox.jsonl דרך contents API, תפקיד agent בלבד, לעולם לא role owner.',
      lawsBlock(),
    ].join('\n'),
  });
}

// חוק 2 — P0 — שער-כניסה או עמוד Domain מחזיר 404, או פיד מת מעל 24 שע המזין ממשק גלוי
for (const s of sites) {
  if (s.frontDoor && !s.ok) {
    addOrder({
      kind: 'front-door', repo: 'roshpinacare-sys.github.io', severity: 'P0',
      title: `עמוד שער-כניסה מחזיר HTTP ${s.http} — ${s.name}`,
      why: `נמדד בריצה זו — GET ${s.url} החזיר HTTP ${s.http} בשעה ${NOW}. העמוד חלק משער-הכניסה של הארגון.`,
      readyPrompt: [
        `יעד — שחזור העמוד ${s.url} (HTTP ${s.http} נמדד).`,
        `ריפו — ${s.name === 'שער-הכניסה' ? 'roshpinacare-sys.github.io' : s.name}.`,
        'קריאות ראשונות — worklog.md של הריפו-יעד, הגדרות Pages בריפו (GET /repos/' + ORG + '/{repo}/pages), ops-intake ops/QUEUE.json.',
        'פעולה צפויה — אם Pages כבוי הפעל בקשת Pages, אם קיים ושבור תקן index, אם הסתעפות שגויה תקן ל-default branch. אמת עם GET חוזר עד HTTP 200.',
        lawsBlock(),
      ].join('\n'),
    });
  }
}
for (const f of radar) {
  if (f.visibility !== 'public-ui') continue;
  const dead = (f.stale === true) || f.missing;
  if (dead) {
    addOrder({
      kind: 'dead-feed', repo: f.repo, severity: 'P0',
      title: `פיד מת המזין ממשק גלוי — ${f.label}`,
      why: f.missing
        ? `נמדד בריצה זו — ${f.repo}/${f.path} חסר (HTTP 404) בשעה ${NOW} ומזין את ${f.ui}.`
        : `נמדד בריצה זו — ${f.repo}/${f.path} בן ${fmtAge(f.ageHours)} (חותמת ${f.ts}) מול חוק 24 שע, ומזין את ${f.ui}. מדידה — ${NOW}.`,
      readyPrompt: [
        `יעד — החזרת הפיד ${f.repo}/${f.path} לחיים (טריות מתחת ל-24 שע) מבלי לזיים נתונים.`,
        `ריפו — ${f.repo}.`,
        'קריאות ראשונות — worklog.md של הריפו, הוורקפלו המחולל של הפיד תחת .github/workflows, GridWatch/state/fleet-health.json (האם המחולל אדום ומטופל), ops-intake ops/QUEUE.json.',
        'אבחון צפוי — אם המחולל רץ בריפו פרטי ונתקל בחומת-דקות, העבר את החילול למסלול-חישוב ציבורי (רץ ציבורי קורא פרטי עם PAT ומחייב חזרה — דפוס flow-map של GridWatch). אם הוורקפלו שבור — תקן את התצורה. אסור לכתוב נתונים שלא נמדדו.',
        'אימות — לאחר התיקון הפעל את המחולל, קרא את הפיד מחדש ואמת חותמת-זמן טרייה.',
        lawsBlock(),
      ].join('\n'),
    });
  }
}

// חוק 3 — P1 — רצף כשלים מעל 3 בוורקפלו שהארטיפקט שלו מזין עמוד גלוי
const feedOwners = new Set(radar.filter((f) => f.visibility === 'public-ui').map((f) => f.repo));
if (indexFresh) feedOwners.add('roshpinacare-sys.github.io');
for (const repo of fleet) {
  if (!feedOwners.has(repo.name)) continue;
  const bad = repo.workflows.filter((w) => w.class === 'failing-streak' && w.streak >= 3).slice(0, 3);
  for (const w of bad) {
    addOrder({
      kind: 'failing-streak', repo: repo.name, severity: 'P1',
      title: `רצף כשלים בוורקפלו המזין עמוד גלוי — ${w.name}`,
      why: `נמדד בריצה זו — ${repo.name}/${w.name} נכשל ${w.streak} ריצות רצופות, ריצה אחרונה ${w.lastRunAt} (${w.note}). הריפו מחזיק פידים גלויים.`,
      readyPrompt: [
        `יעד — אבחון ותיקון ${repo.name}/.github/workflows של הוורקפלו ${w.name} עד ריצה ירוקה.`,
        `ריפו — ${repo.name}.`,
        'קריאות ראשונות — worklog.md של הריפו, קובץ ה-yml של הוורקפלו, לוג הריצה האחרונה (runs/{id}/jobs), GridWatch/state/fleet-health.json, ops-intake ops/QUEUE.json.',
        `מה נמדד — ${w.streak} כשלים רצופים, ריצה אחרונה ${w.lastRunAt}, ${w.note}.`,
        'תיקון — תקן את שורש-הכשל בתצורה או בקוד, הפעל ריצה ידנית, ואמת ירוק ב-API לפני סיום. אל תכבה את הוורקפלו כדי להעלים אדום.',
        lawsBlock(),
      ].join('\n'),
    });
  }
}

// חוק 4 — P1 — ארטיפקטים מזדקנים (מעל 12 שע, עוד לא מתים) או טריות לא נמדדת (קובץ לא ריק)
for (const f of radar) {
  const warn = !f.empty && ((typeof f.ageHours === 'number' && f.ageHours > 12 && f.ageHours <= 24) || (f.ok && f.ts == null));
  if (!warn) continue;
  addOrder({
    kind: 'stale-artifact', repo: f.repo, severity: 'P1',
    title: `ארטיפקט מזדקן — ${f.label}`,
    why: f.ts == null
      ? `נמדד בריצה זו — ${f.repo}/${f.path} קיים (HTTP ${f.status}) אך ללא חותמת-זמן שניתנת לחילוץ. מדידה — ${NOW}.`
      : `נמדד בריצה זו — ${f.repo}/${f.path} בן ${fmtAge(f.ageHours)} (חותמת ${f.ts}), מעל סף-אזהרה 12 שע. מדידה — ${NOW}.`,
    readyPrompt: [
      `יעד — רענון מחזור-החיים של הפיד ${f.repo}/${f.path} לפני שהוא חוצה את חוק 24 השע.`,
      `ריפו — ${f.repo}.`,
      'קריאות ראשונות — worklog.md של הריפו, המחולל של הפיד וה-cron שלו, GridWatch/state/fleet-health.json, ops-intake ops/QUEUE.json.',
      'פעולה — אמת שהמחולל רץ בקצב המתוכנן, תקן תדר או תצורה לפי המדידה, ואמת חותמת טרייה בקריאה-חוזרת.',
      lawsBlock(),
    ].join('\n'),
  });
}

// חוק 5 — P2 — אדומים ש-GridWatch כבר מרפא — אזכור בלבד, אל תשכפל טיפול
if (gwHealth && Array.isArray(gwHealth.repos)) {
  const retried = new Set(Object.entries(gwHealth.autoRetries || {}).filter(([, v]) => v > 0 && v < 99).map(([k]) => k.split('::')[0]));
  for (const gr of gwHealth.repos.filter((r) => r.health === 'red').slice(0, 6)) {
    const redNames = (gr.workflows || []).filter((w) => w.health === 'red').map((w) => w.name).slice(0, 5).join(', ');
    const healing = retried.has(gr.name);
    if (!healing || !redNames) continue;
    addOrder({
      kind: 'gridwatch-owned', repo: gr.name, severity: 'P2',
      title: `אדומים בטיפול GridWatch — ${gr.name}`,
      why: `GridWatch מדווח ${gr.counts.red} וורקפלו אדומים בריפו זה (${redNames}) ומפעיל ריפוי-עצמי בניסיון-חוזר (autoRetries). נבדק מתוך fleet-health.json בשעה ${NOW}.`,
      readyPrompt: [
        `יעד — פיקוח בלבד. הריפוי נמצא בבעלות GridWatch (${gr.name}). אל תריץ ניסיונות-ריפוי מקבילים כדי שלא ליצור עומס-דחיפות.`,
        `ריפו — ${gr.name} (מעקב), GridWatch (מקור-האמת).`,
        'קריאות ראשונות — GridWatch/state/fleet-health.json (autoRetries, remediations, alerts), worklog.md של GridWatch, ops-intake ops/QUEUE.json.',
        'פעולה — בדוק אם אחרי 3 מחזורי GridWatch האדומים נותרו; רק אז פתח סדר-עבודה הנדסי חדש עם הוכחת-מדידה.',
        lawsBlock(),
      ].join('\n'),
    });
  }
}

// חוק 6 — P3 — ליטוש — עמודים ללא מידע-גרסה, ואתר Pages חסר ל-GridWatch
for (const s of sites) {
  if (s.ok && s.frontDoor && !s.hasVersion) {
    addOrder({
      kind: 'polish', repo: s.name === 'שער-הכניסה' ? 'roshpinacare-sys.github.io' : s.name, severity: 'P3',
      title: `אין מידע-גרסה בעמוד — ${s.name}`,
      why: `נמדד בריצה זו — GET ${s.url} החזיר 200 אך בתוכן לא נמצא מזהה-גרסה או build. מדידה — ${NOW}.`,
      readyPrompt: [
        `יעד — הוספת מזהה-גרסה קריא (גרסה + תאריך-בנייה) לעמוד ${s.url} בהתאם לשפת-העיצוב הקיימת.`,
        `ריפו — ${s.name === 'שער-הכניסה' ? 'roshpinacare-sys.github.io' : s.name}.`,
        'קריאות ראשונות — worklog.md של הריפו, קובץ ה-index הראשי, ops-intake ops/QUEUE.json.',
        'אימות — GET חוזר שמציג את מזהה-הגרסה, ובדיקה שהעמוד נשאר תקין (200, ללא שבירת פריסה).',
        lawsBlock(),
      ].join('\n'),
    });
  }
}
const gwSite = sites.find((s) => s.name === 'GridWatch');
if (gwSite && !gwSite.ok) {
  addOrder({
    kind: 'polish', repo: 'GridWatch', severity: 'P3',
    title: 'ל-GridWatch אין אתר Pages ציבורי',
    why: `נמדד בריצה זו — GET https://roshpinacare-sys.github.io/GridWatch/ החזיר HTTP ${gwSite.http}. הריפו מחזיק את קובץ-האמת של בריאות-הצי ואינו גלוי כעמוד. מדידה — ${NOW}.`,
    readyPrompt: [
      'יעד — הצגת עמוד מצב ציבורי פשוט ל-GridWatch (טבלת ריפו ובריאות מתוך state/fleet-health.json, ריענון צד-לקוח).',
      'ריפו — GridWatch.',
      'קריאות ראשונות — worklog.md של GridWatch, state/fleet-health.json, הגדרות Pages, ops-intake ops/QUEUE.json.',
      'אימות — GET לעמוד עד HTTP 200 ורינדור נתונים אמיתיים מהפיד.',
      lawsBlock(),
    ].join('\n'),
  });
}

// סריקת-בטיחות — חומר-מפתח חשוד בפיד שנסרק (דיווח ללא ציטוט-תוכן)
for (const f of radar) {
  if (f.suspectKeys) {
    addOrder({
      kind: 'security', repo: f.repo, severity: 'P0',
      title: `חומר-מפתח חשוד בפיד ציבורי — ${f.label}`,
      why: `נמדד בריצה זו — תבנית הדומה לחומר-מפתח זוהתה ב-${f.repo}/${f.path} (HTTP ${f.status}). התוכן אינו מצוטט כאן מכוון. מדידה — ${NOW}.`,
      readyPrompt: [
        `יעד — בדיקת-בטיחות דחופה של ${f.repo}/${f.path}: אימות האם מדובר בחומר-מפתח אמיתי, סריקת-gitleaks ממוקדת, והסרה או שינוי-מפתח אם נמצא אמיתי.`,
        `ריפו — ${f.repo}.`,
        'קריאות ראשונות — worklog.md של הריפו, הקובץ המדויק, .gitleaks.toml אם קיים, ops-intake ops/QUEUE.json.',
        'אסור לצטט את תוכן המפתח בשום פלט, דוח או קומיט. אם נמצא מפתח אמיתי — הסר, סובב את המפתח מול הבעלים דרך ערוץ-הריבונות בתפקיד agent, ותעד ביומן-העבודה ללא תוכן.',
        lawsBlock(),
      ].join('\n'),
    });
  }
}

// ---------- מיזוג עם התור הקודם — דה-דופליקציה, סגירת פתורים, תקרת 40 ----------
const SEV = { P0: 0, P1: 1, P2: 2, P3: 3 };
const keyOf = (o) => `${o.repo}|${o.kind}|${o.title}`;
const prevByKey = new Map((prevQueue?.orders || []).map((o) => [keyOf(o), o]));
const merged = [];
let newCount = 0; let carriedCount = 0;
for (const o of orders) {
  const key = keyOf(o);
  const prev = prevByKey.get(key);
  if (prev) {
    merged.push({ ...o, id: prev.id, firstSeen: prev.firstSeen, lastSeen: NOW, status: 'OPEN', isNew: false });
    prevByKey.delete(key);
    carriedCount++;
  } else {
    merged.push({ ...o, id: null, firstSeen: NOW, lastSeen: NOW, status: 'OPEN', isNew: true });
    newCount++;
  }
}
const resolved = [...prevByKey.values()].map((o) => ({ id: o.id, repo: o.repo, kind: o.kind, title: o.title, resolvedAt: NOW }));
merged.sort((a, b) => SEV[a.severity] - SEV[b.severity] || (a.lastSeen < b.lastSeen ? -1 : 1));
// הקצאת מזהים — שמירת מזהי-היום הקיימים, המשך-מונה לחדשים
let nextN = 1;
for (const m of merged) if (m.id) { const n = Number(m.id.slice(-2)); if (!isNaN(n) && n >= nextN) nextN = n + 1; }
for (const m of merged) { if (!m.id) { m.id = `QUEUE-${RUN_DAY}-${String(nextN).padStart(2, '0')}`; nextN++; } }
const capped = merged.slice(0, 40);
const overCap = merged.length - capped.length;
const finalOrders = capped;
const resolvedDropped = resolved.length + Math.max(0, overCap);

// ---------- QUEUE.md — מראה קריא לבן-אדם ----------
const qmd = [
  '# תור-העבודות התפעולי',
  '',
  `נוצר מתוך מדידה — ${NOW} · מקור-האמת — ops/QUEUE.json · מחזור — כל 30 דק.`,
  '',
  `סדרים פתוחים — ${finalOrders.length} · חדשים בריצה זו — ${newCount} · נישאים מהריצה הקודמת — ${carriedCount} · נסגרו או נפלו מהתקרה — ${resolvedDropped}.`,
  '',
  'חוזה-התור — בחר את סדר-העבודה הפתוח הראשון לפי סדר P0, P1, P2, P3, שהריפו שלו אינו בבעלות סוכן אחר כרגע — בדוק קודם את worklog.md של הריפו-יעד. אל תטפל בסדר שמסומן gridwatch-owned מעבר לפיקוח.',
  '',
  ...finalOrders.flatMap((o) => [
    `## ${o.id} · ${o.severity} · ${o.kind} · ${o.repo}`,
    '',
    `**${o.title}**`,
    '',
    `נמדד — ${o.why}`,
    '',
    `נצפה לראשונה — ${o.firstSeen} · אומת לאחרונה — ${o.lastSeen}`,
    '',
    'משימה מוכנה להרצה לסוכן —',
    '',
    '```',
    o.readyPrompt,
    '```',
    '',
  ]),
].join('\n');

// ---------- SPACE-MAP.md — מפת-המרחב ----------
const lane = (name) => ({
  Domain: 'חזית ציבורית — דפים, פידים, ריבוי-עורקים',
  Console: 'קונסולה — ממשק פנימי גלוי',
  FleetHQ: 'מפקדה — ממשק הבעלים, תיבת-מפעיל, החלטות',
  GridWatch: 'בקרת-צי — סנס, ריפוי-עצמי, קובץ-בריאות',
  Sandbox: 'מוח-הצי — ריבונות, מחליט, ערוץ-בעלים (פרטי)',
  'ops-intake': 'קליטה-תפעולית — תור, מפת-מרחב, מדידה',
  'roshpinacare-sys.github.io': 'שער-כניסה — הדף הראשון של הארגון',
  Pulse: 'עורקי-דופק — פרסום מחזורי',
  Autonomy: 'מחקר-אוטונומיה — ניתוח ומסמכי-מדיניות',
  'sovereign-beacon': 'משדר-ריבונות',
  'sovereign-lighthouse': 'מגדלור — איתות-סטטוס',
  'sovereign-runner-kit': 'ערכת-רץ — תשתית לסוכנים',
  'saos-runtime': 'ריצות-ריבונות — מצב-רשת, שומר, סבב-צי',
  'saos-dex': 'DEX — אוטומציית-מסחר',
  steem: 'בלוקציין — מטבע, פרסום, אימות-מפתחות',
  'roshpina': 'פרטי — פרויקט פנימי',
  'Project-files': 'פרטי — קבצי-עבודה',
  Zip: 'פרטי — ארכיון-הפעלה',
  TruthRail: 'פרטי — מסילת-אמת',
  'vault-home': 'פרטי — מטמון',
  negen: 'פרטי',
  Adsmarket: 'פרטי — שיווק',
  'sandbox-private': 'פרטי — סנדבוקס נוסף',
  Sdk: 'פרטי',
  Saosmartwallet: 'פרטי — ארנק',
  Defi: 'פרטי — דפיי',
  'saos-sovereign-platform': 'פרטי — פלטפורמה',
  'saos-sovereign-foundry': 'פרטי — יציקה',
  SovereignConsole: 'פרטי — קונסולה ריבונית',
  'anchor-baseline': 'פרטי — בסיס-עיגון',
  'saos-control-center': 'פרטי — מרכז-בקרה',
  'saos-agents': 'פרטי — סוכנים',
  'saos-jummper': 'פרטי',
}[name] || 'משמרת פרטית — ראה README של הריפו');

const fmtCrons = (repo) => {
  const crons = repo.workflows.map((w) => w.cron).filter(Boolean);
  const uniq = [...new Set(crons)];
  if (!uniq.length) return repo.wfCount ? `${repo.wfCount} וורקפלו, ללא cron מזוהה` : 'ללא וורקפלו';
  return `${crons.length}/${repo.wfCount} מתוזמנים · ${uniq.slice(0, 4).join(', ')}${uniq.length > 4 ? ' …' : ''}`;
};
const feedArts = (name) => radar.filter((f) => f.repo === name).map((f) => `${f.path} (${fmtAge(f.ageHours)})`).join(', ');
const spaceMap = [
  '# מפת-המרחב — roshpinacare-sys',
  '',
  `נוצר מתוך מדידה — ${NOW} · מחזור — כל 30 דק · כל הנתונים בטבלה נמדדו בריצה זו.`,
  '',
  '## אוריינטציה — איפה כל דבר חי',
  '',
  '- מוח-הצי — ריפו Sandbox תחת ops/ (המחליט הריבוני, עורקים, מצב). ריפו פרטי.',
  '- ניתוב-החלטות — Sandbox ops/sovereign/ (המחליט והרישומים) וערוץ-הבעלים ב-Sandbox ops/sovereign/OWNER-CHANNEL/inbox.jsonl. הסלמות תפעול של סוכנים — FleetHQ office/state/operator-inbox.jsonl.',
  '- יומן-עבודה — worklog.md בכל ריפו (עמודת יומן בטבלה מסמנת קיום) ועוד יומן מקומי בסביבת-העבודה של הסוכן. מי שנוגע בריפו חייב לרשום בעלות ביומן שלו קודם.',
  '- בקרת-הצי — GridWatch (בריאות כל וורקפלו כל 30 דק + ריפוי-עצמי). צינור-הקליטה — ops-intake (תור עבודות ומפת-מרחב זו). השניים משלימים — GridWatch מרפא ריצות, ops-intake מנדס את מה שדורש עבודה מכוונת.',
  '- סדר-קריאה לסוכן חדש — 1) יומן-העבודה המקומי, 2) מפת-מרחב זו, 3) ops/QUEUE.json ובחירת סדר-עבודה לפי החוזה, 4) ה-README וה-worklog.md של הריפו-יעד, 5) רק אז כתיבה ראשונה עם אימות-קריאה-חוזרת.',
  '',
  '## הטבלה — ריפו אחר ריפו',
  '',
  '| ריפו | מסלול | ייעוד (מתוך README) | נראות | ארטיפקטים נמדדים | דחיפה אחרונה | קצבים | יומן |',
  '|---|---|---|---|---|---|---|---|',
  ...fleet
    .slice()
    .sort((a, b) => Number(a.private) - Number(b.private) || a.name.localeCompare(b.name))
    .map((r) => {
      const pushH = ageH(r.pushedAt);
      return `| ${r.name} | ${lane(r.name)} | ${repoMeta[r.name]?.purpose || ''} | ${r.private ? 'פרטי' : 'ציבורי'} | ${feedArts(r.name) || '—'} | ${r.pushedAt} (${fmtAge(pushH)}) | ${fmtCrons(r)} | ${repoMeta[r.name]?.hasWorklog ? 'יש' : '—'} |`;
    }),
  '',
  `## סיכום-מדידה`,
  '',
  `- ריפו — ${fleet.length} (${fleet.filter((r) => !r.private).length} ציבוריים, ${fleet.filter((r) => r.private).length} פרטיים)`,
  `- וורקפלו — ${fleet.reduce((s, r) => s + r.wfCount, 0)} · חסומי-חומת-דקות — ${billingWfCount} ב-${billingRepos.length} ריפו פרטיים`,
  `- פידים נמדדו — ${radar.length} · מזדקנים מעל 24 שע — ${radar.filter((f) => f.stale).length}`,
  '- הפניה — עמודי Pages נבדקו בכל מחזור ומופיעים בתור כשהם 404 או ללא מידע-גרסה.',
].join('\n');

// ---------- קבלת-ריצה ----------
const rl = await gh('/rate_limit');
const quota = rl.ok && rl.data?.resources?.core ? { limit: rl.data.resources.core.limit, remaining: rl.data.resources.core.remaining, resetAt: new Date(rl.data.resources.core.reset * 1000).toISOString() } : null;
const receipt = {
  generatedAt: NOW,
  version: 1,
  cadenceMin: 30,
  durationSec: Math.round((Date.now() - Date.parse(NOW)) / 1000),
  reposScanned: fleet.length,
  publicRepos: fleet.filter((r) => !r.private).length,
  privateRepos: fleet.filter((r) => r.private).length,
  workflowsSeen: fleet.reduce((s, r) => s + r.wfCount, 0),
  billingWall: { repos: billingRepos.length, workflows: billingWfCount, reposList: billingRepos.map((r) => r.name) },
  feedsMeasured: radar.length + (indexFresh ? 1 : 0),
  feedsStale: radar.filter((f) => f.stale).length,
  feedsUnreachable: radar.filter((f) => f.error).map((f) => `${f.repo}/${f.path}: ${f.error}`),
  siteChecks: sites.map((s) => ({ name: s.name, http: s.http })),
  orders: { open: finalOrders.length, new: newCount, carried: carriedCount, resolvedOrDropped: resolvedDropped },
  escalations: [],
  apiCalls,
  apiQuota: quota,
  cronCache,
};

// ---------- RECORD — כתיבה עם אימות sha וניסיון-חוזר ----------
const files = [
  { path: 'ops/QUEUE.json', content: JSON.stringify({ generatedAt: NOW, cadenceMin: 30, contract: 'בחר את סדר-העבודה הפתוח הראשון לפי P0..P3 שהריפו שלו אינו בבעלות סוכן אחר — בדוק worklog.md של הריפו-יעד קודם', orders: finalOrders, resolved }, null, 1) },
  { path: 'ops/QUEUE.md', content: qmd },
  { path: 'ops/SPACE-MAP.md', content: spaceMap },
  { path: 'ops/intake-state.json', content: JSON.stringify(receipt, null, 1) },
];
const commitResults = [];
for (const f of files) {
  const b64 = Buffer.from(f.content).toString('base64');
  let done = null; let attempt = 0;
  for (attempt = 0; attempt < 3 && !done; attempt++) {
    const cur = await gh(`/repos/${ORG}/${REPO}/contents/${f.path}`);
    const body = { message: `ops-intake: ${f.path} @ ${NOW}`, content: b64 };
    if (cur.ok && cur.data?.sha) body.sha = cur.data.sha;
    const put = DRYRUN ? { status: 200, ok: true, data: { content: { sha: blobSha(f.content) } } } : await gh(`/repos/${ORG}/${REPO}/contents/${f.path}`, { method: 'PUT', body: JSON.stringify(body) });
    if (put.ok) {
      const got = put.data?.content?.sha;
      if (got && got === blobSha(f.content)) done = { status: put.status, sha: got, verifiedLocal: true };
      else done = { status: put.status, sha: got, verifiedLocal: false };
    } else if (put.status === 409) { await sleep(1200); continue; }
    else { done = { status: put.status, error: true }; break; }
  }
  commitResults.push({ path: f.path, ...done });
  console.log(`commit ${f.path}:`, done.status, 'blobShaMatch:', done.verifiedLocal);
}
// אימות כפול — קריאה-חוזרת מהשרת והשוואת sha מול הקומיט הטרי
let verified = false;
for (let i = 0; i < 4 && !verified; i++) {
  await sleep(2000);
  const v = await gh(`/repos/${ORG}/${REPO}/contents/ops/QUEUE.json`);
  if (v.ok && v.data?.content) {
    try { const j = JSON.parse(Buffer.from(v.data.content, 'base64').toString()); verified = j.generatedAt === NOW; } catch { verified = false; }
  }
  console.log('verify pass', i + 1, verified);
}
receipt.verified = verified;

// ---------- ESCALATE — כל P0 חדש → שורת-סוכן ל-FleetHQ operator-inbox ----------
const esc = [];
const newP0 = finalOrders.filter((o) => o.severity === 'P0' && o.isNew === true);
if (newP0.length && !DRYRUN) {
  const inboxPath = `/repos/${ORG}/FleetHQ/contents/office/state/operator-inbox.jsonl`;
  const cur = await gh(inboxPath);
  if (cur.ok) {
    const curTxt = Buffer.from(cur.data.content || '', 'base64').toString().trimEnd();
    const day = NOW.slice(0, 10);
    const lines = curTxt ? curTxt.split('\n') : [];
    const todayKeys = new Set(lines.map((l) => { try { const j = JSON.parse(l); return `${j.source || ''}|${j.kind || ''}|${j.repo || ''}|${String(j.at || '').slice(0, 10)}`; } catch { return ''; } }));
    let appended = 0;
    let nextTxt = curTxt;
    for (const o of newP0) {
      const dk = `zai-code-t20b|${o.kind}|${o.repo}|${day}`;
      if (todayKeys.has(dk)) continue;
      const text = `[ops-intake] P0 חדש בתור התפעול — ${o.title} (${o.repo}). הוכחת-מדידה — ${o.why.slice(0, 220)}. תור מלא ומשימות-מוכנות — ops-intake ops/QUEUE.json`;
      const line = JSON.stringify({ at: NOW, role: 'agent', source: 'zai-code-t20b', kind: o.kind, repo: o.repo, id: sha16(text + NOW), text, sha16: sha16(text) });
      nextTxt = nextTxt + '\n' + line;
      todayKeys.add(dk);
      appended++;
      esc.push({ id: o.id, repo: o.repo, kind: o.kind });
      await sleep(100);
    }
    if (appended > 0) {
      const put = await gh(inboxPath, { method: 'PUT', body: JSON.stringify({ message: `ops-intake: ${appended} סדרי-P0 חדשים להסלמה`, content: Buffer.from(nextTxt + '\n').toString('base64'), sha: cur.data.sha }) });
      console.log('inbox escalate put:', put.status);
      receipt.escalations = esc;
    }
  } else console.error('inbox read failed', cur.status);
}
receipt.escalations = esc;

// עדכון הקבלה עם סטטוס-האימות וכתיבה חוזרת אחת
if (!DRYRUN) {
  const f = files.find((x) => x.path === 'ops/intake-state.json');
  f.content = JSON.stringify(receipt, null, 1);
  const b64 = Buffer.from(f.content).toString('base64');
  const cur = await gh(`/repos/${ORG}/${REPO}/contents/${f.path}`);
  const body = { message: `ops-intake: receipt verified=${verified} @ ${NOW}`, content: b64 };
  if (cur.ok && cur.data?.sha) body.sha = cur.data.sha;
  const put = await gh(`/repos/${ORG}/${REPO}/contents/${f.path}`, { method: 'PUT', body: JSON.stringify(body) });
  console.log('receipt update put:', put.status);
}

// ---------- סיכום ----------
const summary = [
  `## ops-intake @ ${NOW}`,
  `- repos: ${fleet.length} (${fleet.filter((r) => !r.private).length} ציבוריים / ${fleet.filter((r) => r.private).length} פרטיים) · workflows: ${receipt.workflowsSeen}`,
  `- חומת-דקות — ${billingRepos.length} ריפו פרטיים, ${billingWfCount} וורקפלו`,
  `- פידים — ${receipt.feedsMeasured} נמדדו, ${receipt.feedsStale} מזדקנים מעל 24 שע`,
  `- עמודים — ${sites.map((s) => `${s.name}:${s.http}`).join(', ')}`,
  `- תור — ${finalOrders.length} פתוחים (${newCount} חדשים, ${carriedCount} נישאים, ${resolvedDropped} נסגרו/נפלו)`,
  `- הסלמות — ${esc.length} · אימות כפול — ${verified} · קריאות API — ${apiCalls} (נותרו ${quota?.remaining})`,
  '',
  ...finalOrders.map((o) => `- ${o.id} ${o.severity} ${o.kind} ${o.repo} — ${o.title}`),
].join('\n');
try { writeFileSync(process.env.GITHUB_STEP_SUMMARY || '/tmp/intake-summary.md', summary); } catch { }
console.log(summary.slice(0, 2000));
if (!verified) { console.error('VERIFY FAILED — קריאה-חוזרת לא אישרה את הקומיט'); process.exit(1); }
