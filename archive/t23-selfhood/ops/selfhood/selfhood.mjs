#!/usr/bin/env node
/**
 * SELFHOOD — עצמיות-הרשת · Autonomy · עצמאי לחלוטין מסנדבוקסים (Node 20, אפס-תלות).
 * -----------------------------------------------------------------------------
 * למה: הבעלים בונה ומעדכן כל-הזמן — והרשת לא-הייתה מודעת לזה, לא בודקת את-עצמה,
 * ולא מודעת ליכולות-הריבונות-האוטונומיות שלה. וגם: פניות-אל-המפעיל נערמו ללא-מענה.
 *
 * המחזור (כל-הרצה):
 *   1. DISCOVERY    — סריקת-כל-הריפו (פומבי+פרטי): חדשים/שינויים מאז-הזיכרון הקודם.
 *   2. CAPABILITIES — מפת-יכולות נמדדת: אילו-איברים באמת-רצו (הצלחות-7ימים),
 *                     פידים-חיים וגילם, אתרים 200, מצב-החישוב (פומבי/פרטי).
 *   3. CLAIMS       — פניות-אל-הריבונות (owner-claim מהאפליקציה + דוחות-סוכנים
 *                     מ-OWNER-CHANNEL) מקבלות הכרעה-אינטליגנטית: מוח-LLM
 *                     (fail-closed) + חוקי-אמת, ותשובה-מפורסמת-חזרה.
 *   4. COMMIT+VERIFY— דחיפה + קריאה-חזרה לכל-קובץ (blob-sha) · יציאה-רועשת-בכשל.
 *
 * חוקים: מדידה-בלבד (כל-מספר עם-מקור) · אפס-סודות-בפלטים (redact) ·
 *        המוח לא-מחליף-מדידה — הוא מנסח-הכרעה על-גבי-מדידה בלבד · כנות-מלאה.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const OWNER = 'roshpinacare-sys';
const REPO = 'Autonomy';
const BRANCH = 'main';
const DIR = 'state/selfhood';
const API = 'https://api.github.com';
const UA = { 'User-Agent': 'selfhood-organ', Accept: 'application/vnd.github+json' };
const PAT = (process.env.SBX_FLEET_PAT || process.env.GITHUB_TOKEN || '').trim();
const AI = (() => { try { return process.env.SBX_AI_CONFIG ? JSON.parse(process.env.SBX_AI_CONFIG) : null; } catch { return null; } })();
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function redact(s) {
  return String(s ?? '')
    .replace(/ghp_[A-Za-z0-9]{16,}/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{16,}/g, '[REDACTED]')
    .replace(/[A-Za-z0-9+/=]{96,}/g, '[REDACTED]');
}
function tryJson(t) { try { return JSON.parse(t); } catch { return null; } }
/** git blob sha — אימות-קבלה דטרמיניסטי מול-השרת (עמיד ל-lag של קריאה-חזרה) */
function gitBlobSha(content) {
  const buf = Buffer.concat([Buffer.from(`blob ${Buffer.byteLength(content)}\0`, 'utf8'), Buffer.from(content, 'utf8')]);
  return createHash('sha1').update(buf).digest('hex');
}

async function gh(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...UA, Authorization: `Bearer ${PAT}`, ...(opts.headers || {}) },
  });
  if (res.status === 409 || res.status >= 500) { await sleep(1500); return gh(path, opts); }
  const txt = await res.text();
  const j = txt ? tryJson(txt) : null;
  if (!res.ok) return { __err: res.status, ...(j ? { j } : {}) };
  return j;
}

async function rawRead(repo, path, ref = BRANCH) {
  const res = await fetch(`${API}/repos/${OWNER}/${repo}/contents/${path}?ref=${ref}`, {
    headers: { ...UA, Authorization: `Bearer ${PAT}`, Accept: 'application/vnd.github.raw' },
  });
  if (!res.ok) return null;
  return res.text();
}

/** דחיפת-קובץ עם sha-cache + קריאה-חזרה; מחזיר {ok, sha} */
async function putVerified(repo, path, content, message) {
  let head = await gh(`/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`);
  let sha = head && !head.__err ? head.sha : undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const body = { message, content: Buffer.from(content, 'utf8').toString('base64'), branch: BRANCH, ...(sha ? { sha } : {}) };
    const r = await gh(`/repos/${OWNER}/${repo}/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
    if (r && r.content && r.content.sha) {
      // אימות-קבלה: ה-sha שהשרת חישב מהתוכן שלנו === git-blob-sha מקומי (דטרמיניסטי)
      if (r.content.sha === gitBlobSha(content)) {
        const back = await rawRead(repo, path); // קריאה-חזרה מרחמת (lag אפשרי) — לא-קובעת
        return { ok: true, sha: r.content.sha, readback: back !== null && redact(back) === redact(content) };
      }
    }
    if (r && r.__err === 409) {
      head = await gh(`/repos/${OWNER}/${repo}/contents/${path}?ref=${BRANCH}`);
      sha = head && !head.__err ? head.sha : undefined;
    }
    await sleep(1500 * attempt);
  }
  return { ok: false, path };
}

/* ────────────────────────── 1. DISCOVERY ────────────────────────── */
async function listRepos() {
  const out = []; let page = 1;
  while (true) {
    const rs = await gh(`/user/repos?per_page=100&page=${page}&sort=pushed`);
    if (!Array.isArray(rs)) break;
    out.push(...rs.map((r) => ({ name: r.name, private: r.private, pushedAt: r.pushed_at, desc: redact(r.description || '') })));
    if (rs.length < 100) break; page++;
  }
  return out;
}
async function repoSignature(repo, branch) {
  const tree = await gh(`/repos/${OWNER}/${repo}/git/trees/${branch}`);
  const wfs = await gh(`/repos/${OWNER}/${repo}/actions/workflows?per_page=100`);
  const topBlobs = tree && tree.tree ? tree.tree.filter((t) => t.type === 'blob').map((t) => t.path).sort() : [];
  const wf = wfs && wfs.workflows ? wfs.workflows.map((w) => `${w.name}:${w.state}`).sort() : [];
  return { topBlobs, topHash: tree && tree.sha ? tree.sha.slice(0, 12) : null, workflows: wf };
}

async function discovery(memory) {
  const repos = await listRepos();
  const discoveries = [];
  const newMemory = { schema: 'selfhood.memory/1', updatedAt: now(), repos: {} };
  for (const r of repos) {
    const branch = 'main';
    let sig = { topBlobs: [], topHash: null, workflows: [] };
    try { sig = await repoSignature(r.name, branch); } catch { /* ריפו-ריק — כנות */ }
    const prev = memory.repos?.[r.name];
    const entry = { pushedAt: r.pushedAt, topHash: sig.topHash, workflows: sig.workflows, topBlobs: sig.topBlobs.slice(0, 40), desc: r.desc };
    newMemory.repos[r.name] = entry;
    if (!prev) {
      discoveries.push({ kind: 'repo-new', repo: r.name, at: r.pushedAt, note: `ריפו-${r.private ? 'פרטי' : 'פומבי'} באחוזה · ${sig.topBlobs.length} קבצים-עליונים · ${sig.workflows.length} איברי-חישוב` });
    } else {
      const prevWf = new Set(prev.workflows || []);
      for (const w of sig.workflows) if (!prevWf.has(w)) discoveries.push({ kind: 'workflow-changed', repo: r.name, at: r.pushedAt, note: `איבר-חישוב השתנה/נוסף: ${w}` });
      if (prev.topHash && sig.topHash && prev.topHash !== sig.topHash) discoveries.push({ kind: 'files-changed', repo: r.name, at: r.pushedAt, note: `קבצי-על חדשים/שונים (${(prev.topBlobs || []).length}→${sig.topBlobs.length} עליונים)` });
      if (r.desc && r.desc !== prev.desc) discoveries.push({ kind: 'desc-changed', repo: r.name, at: r.pushedAt, note: `תיאור עודכן: ${r.desc}` });
    }
  }
  for (const name of Object.keys(memory.repos || {})) {
    if (!newMemory.repos[name]) discoveries.push({ kind: 'repo-gone', repo: name, at: now(), note: 'ריפו-נעלם מהאחוזה (נמחק/הופך)' });
  }
  return { repos, discoveries, newMemory };
}

/* ────────────────────────── 2. CAPABILITIES ────────────────────────── */
const FEEDS = [
  ['Domain', 'office/world-state.json', 'משרד-חי'],
  ['Autonomy', 'state/network-state.json', 'פעימת-ריבונות'],
  ['Autonomy', 'ops/flow/flow-map.json', 'מפת-זרימה'],
  ['ops-intake', 'ops/QUEUE.json', 'תור-עבודה'],
  ['ops-forge', 'ops/RECEIPTS.jsonl', 'קבלות-ביצוע'],
  ['saos-dex', 'grids/state/state.json', 'גריד-DEX'],
  ['saos-dex', 'db/dex-metrics.json', 'מדדי-DEX'],
  ['Pulse', 'state/network.json', 'דופק-ציבורי'],
  ['GridWatch', 'state/fleet-health.json', 'בריאות-צי'],
];
const SITES = [
  'https://roshpinacare-sys.github.io/',
  'https://roshpinacare-sys.github.io/Domain/',
  'https://roshpinacare-sys.github.io/GridWatch/',
  'https://roshpinacare-sys.github.io/ops-forge/',
  'https://roshpinacare-sys.github.io/FleetHQ/',
];
async function headStatus(url) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 8000);
    const res = await fetch(url, { method: 'GET', signal: c.signal, headers: { 'User-Agent': 'selfhood-organ' } });
    clearTimeout(t); return res.status;
  } catch { return 0; }
}
async function capabilities(repos) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const organs = [];
  for (const r of repos) {
    const runs = await gh(`/repos/${OWNER}/${r.name}/actions/runs?per_page=40&created=>${since}`);
    if (!runs || !runs.workflow_runs) continue;
    const byName = {};
    for (const run of runs.workflow_runs) {
      const b = (byName[run.name] ||= { success: 0, failure: 0, lastSuccess: null, lastRun: null });
      b.lastRun = b.lastRun || run.created_at;
      if (run.conclusion === 'success') { b.success++; b.lastSuccess = b.lastSuccess || run.created_at; }
      if (run.conclusion === 'failure') b.failure++;
    }
    for (const [name, b] of Object.entries(byName)) {
      const ageH = b.lastSuccess ? ((Date.now() - Date.parse(b.lastSuccess)) / 3600000) : null;
      organs.push({ repo: r.name, workflow: name, success7d: b.success, failure7d: b.failure, lastSuccess: b.lastSuccess, lastSuccessAgeH: ageH === null ? null : Math.round(ageH * 10) / 10, private: r.private });
    }
  }
  organs.sort((a, b) => (b.lastSuccess || '').localeCompare(a.lastSuccess || ''));
  const feeds = [];
  for (const [repo, path, label] of FEEDS) {
    const txt = await rawRead(repo, path);
    let ageH = null; let stamp = null;
    if (txt) {
      const j = tryJson(txt);
      const t = j ? (j.generatedAt || j.updatedAt || j.at || j.savedAt || (j.keeper && j.keeper.lastTick)) : null;
      if (t) { stamp = t; ageH = Math.round(((Date.now() - Date.parse(t)) / 3600000) * 10) / 10; }
    }
    feeds.push({ repo, path, label, alive: !!txt, stamp, ageH });
  }
  const sites = [];
  for (const u of SITES) sites.push({ url: u, status: await headStatus(u) });
  const activePrivate = [];
  for (const r of repos.filter((x) => x.private)) {
    const wfs = await gh(`/repos/${OWNER}/${r.name}/actions/workflows?per_page=100`);
    if (wfs && wfs.workflows) for (const w of wfs.workflows) if (w.state === 'active') activePrivate.push(`${r.name}/${w.name}`);
  }
  return { organs: organs.slice(0, 80), feeds, sites, compute: { activePrivateWorkflows: activePrivate, publicOrgans: organs.filter((o) => !o.private).length }, measuredAt: now() };
}

/* ────────────────────────── 3. BRAIN + CLAIMS ────────────────────────── */
const SYSTEM_PROMPT = [
  'אתה המוח-המנסח של ריבונות אוטונומית (Autonomy) של האחוזה roshpinacare-sys.',
  'חוקים בלתי-נפסעים:',
  '1. ההכרעה נשענת רק על המדידות שבהקשר — אסור להמציא מספרים או להניח דברים שלא נמדדו.',
  '2. כנות-מלאה: אין-מידע מספיק → אומרים זאת במפורש ומציעים איזו-מדידה תכריע.',
  '3. אפס-סודות, אפס-מפתחות, אפס-שמות-פרטיים-של-אנשים בתשובה.',
  '4. הריבונות היא המפעיל: פנייה שהופנתה אל-המפעיל מגיעה אליך — עליך להכריע או לסמן בדיוק מה-חסר-להכרעה.',
  '5. מבנה-תשובה חובה (JSON בלבד, ללא טקסט סביב):',
  '{"verdictHe":"...","stepsHe":["..."],"confidence":"high|medium|low","needMore":true|false}',
].join('\n');

async function callOpenAiCompat(url, apiKey, extraHeaders, model, system, user) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: redact(user) }], thinking: { type: 'disabled' }, temperature: 0.2 }),
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, why: `http-${res.status}` };
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content ?? '';
    const m = String(txt).match(/\{[\s\S]*\}/);
    const v = m ? tryJson(m[0]) : null;
    if (!v || !v.verdictHe) return { ok: false, why: 'unparseable' };
    return { ok: true, verdict: v, engine: `llm:${model}` };
  } catch (e) { clearTimeout(t); return { ok: false, why: redact(String(e?.message || e)).slice(0, 120) }; }
}

/** שרשרת-מוח: z-ai (config) → GROQ → GEMINI → fail-closed. השדרוג = מפתח-בעלים חדש, אפס-קוד. */
async function brain(userContent) {
  if (AI && AI.baseUrl && AI.apiKey) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(`${AI.baseUrl}/chat/completions`, {
        method: 'POST', signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI.apiKey}`,
          'X-Z-AI-From': 'Z',
          ...(AI.chatId ? { 'X-Chat-Id': AI.chatId } : {}),
          ...(AI.userId ? { 'X-User-Id': AI.userId } : {}),
          ...(AI.token ? { 'X-Token': AI.token } : {}),
        },
        body: JSON.stringify({ messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: redact(userContent) }], thinking: { type: 'disabled' } }),
      });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json();
        const txt = j?.choices?.[0]?.message?.content ?? '';
        const m = String(txt).match(/\{[\s\S]*\}/);
        const v = m ? tryJson(m[0]) : null;
        if (v && v.verdictHe) return { ok: true, verdict: v, engine: 'llm:z-ai' };
      }
    } catch { clearTimeout(t); /* נמשיך לספק-הבא — כנות בפלט */ }
  }
  const groq = (process.env.GROQ_API_KEY || '').trim();
  if (groq) {
    const r = await callOpenAiCompat('https://api.groq.com/openai/v1/chat/completions', groq, {}, process.env.BRAIN_MODEL_GROQ || 'llama-3.3-70b-versatile', SYSTEM_PROMPT, userContent);
    if (r.ok) return r;
  }
  const gem = (process.env.GEMINI_API_KEY || '').trim();
  if (gem) {
    const r = await callOpenAiCompat('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', gem, {}, process.env.BRAIN_MODEL_GEMINI || 'gemini-2.0-flash', SYSTEM_PROMPT, userContent);
    if (r.ok) return r;
  }
  return { ok: false, why: AI ? 'providers-unreachable' : 'no-config' };
}

/** מנוע-הכרעה דטרמיניסטי (v1) — אינטליגנציה-אמיתית-בלי-מוח: סיווג + ראיות-מדודות + צעדים.
 *  חוק: אסור-להמציא — כל-משפט נשען על המדידות שבהקשר בלבד. */
function reasonDeterministic(claimText, cap, journalTail) {
  const t = String(claimText || '');
  const alive = cap.feeds.filter((f) => f.alive);
  const dead = cap.feeds.filter((f) => !f.alive);
  const wallBroken = cap.compute.activePrivateWorkflows.filter((w) => !w.endsWith('/pages-build-deployment')).length;
  const q = /\?|למה|איך|מתי|מה\s|כמה|איפה/.test(t);
  const complaint = /לא\sעובד|קרס|שקט|נשבר|תקוע|נפל|בעיה|כשל/.test(t);
  const directive = /בצע|הפעל|תקן|בנה|הוסיף|שנה|הפסק/.test(t);
  const mention = (word) => dead.find((f) => (f.label + f.repo).includes(word)) || alive.find((f) => (f.label + f.repo).includes(word));
  const hit = ['משרד', 'גריד', 'דקס', 'דופק', 'צי', 'בריאות', 'פעימה', 'זרימה', 'תור', 'קבלות'].map(mention).find(Boolean);
  const steps = [];
  let verdictHe;
  if (hit) {
    verdictHe = hit.alive
      ? `${hit.label} (${hit.repo}) נמדד חי · גיל-פעימה ${hit.ageH ?? '?'}h — המקור הקנוני עובד ומפרסם.`
      : `${hit.label} (${hit.repo}/${hit.path}) לא-זמין במדידה זו — זהו-כשל-אמיתי של האיבר-המזין, לא-עמדת-הרשת.`;
    if (!hit.alive) steps.push(`לבדוק את ה-workflow המזין את ${hit.repo}/${hit.path} ב-Actions (רץ? איזה-שלב נפל?)`);
  } else if (complaint || q) {
    verdictHe = `המדידה-הטרייה: ${alive.length}/${cap.feeds.length} פידי-אמת חיים · ${cap.sites.filter((s) => s.status === 200).length}/${cap.sites.length} אתרים 200 · חוק-עצירת-הדימום ${wallBroken === 0 ? 'מקויף (0 וורקפלו-פרטי-פעיל)' : `נשבר (${wallBroken} פעילים)`}. התשובה-המדויקת לפנייה דורשת מדידה-ממוקדת שלא-בוצעה-עדיין.`;
  } else {
    verdictHe = `הפנייה נרשמה ונקראה. המדידה-הטרייה: ${alive.length}/${cap.feeds.length} פידים חיים · ${cap.organs.length} איברים-נמדדו ב-7 ימים. אין-בכוחי-הדטרמיניסטי לבצע-פעולה — הפנייה עוברת-לתור-העבודה (ops-intake/QUEUE) לביצוע-מנותב.`;
  }
  if (wallBroken > 0) {
    const realBreak = cap.compute.activePrivateWorkflows.filter((w) => !w.endsWith('/pages-build-deployment'));
    steps.push(realBreak.length === 0
      ? `חוק-עצירת-הדימום מקויף (${cap.compute.activePrivateWorkflows.length} פעילים = חריג-Pages-מערכתי-מתועד בלבד)`
      : `חוק-עצירת-הדימום נשבר: ${realBreak.length} וורקפלו-פעילים בריפו-פרטי (${realBreak.join(', ')}) — להשבית (מייצרים אימיילי-כשל)`);
  }
  if (dead.length) steps.push(`פידים-לא-זמינים: ${dead.map((f) => f.label).join(', ')} — ראוי לחקירת-מקור`);
  steps.push('לאמת-עצמאית: לקרוא state/selfhood/capabilities.json מהריפו הציבורי ולהשוות לפנייה');
  return { verdictHe, stepsHe: steps, confidence: hit ? 'high' : 'medium', needMore: !hit, engine: 'deterministic-v1' };
}

function contextFor(cap, journalTail) {
  const aliveFeeds = cap.feeds.filter((f) => f.alive).map((f) => `${f.label}(${f.repo}): גיל ${f.ageH ?? '?'}h`).join(' · ');
  const deadFeeds = cap.feeds.filter((f) => !f.alive).map((f) => f.label).join(', ');
  const topOrgans = cap.organs.slice(0, 12).map((o) => `${o.repo}/${o.workflow} ✓${o.success7d}✗${o.failure7d}`).join(' · ');
  return [
    '=== הקשר נמדד (עדכני להרצה זו) ===',
    `פידים-חיים: ${aliveFeeds || 'אין'}`,
    `פידים-לא-זמינים: ${deadFeeds || 'אין'}`,
    `איברים-פעילים (7 ימים): ${topOrgans}`,
    `אתרים: ${cap.sites.map((s) => `${s.url.replace('https://roshpinacare-sys.github.io', '')}=${s.status}`).join(' ')}`,
    `חישוב-פרטי-פעיל (אמור-להיות-0): ${cap.compute.activePrivateWorkflows.length}`,
    `יומן-גילויים אחרון: ${journalTail.join(' | ')}`,
  ].join('\n');
}

async function loadJsonl(repo, path, cap = 400) {
  const txt = await rawRead(repo, path);
  if (!txt) return { lines: [], all: 0 };
  const lines = txt.trim() ? txt.trim().split('\n').filter(Boolean) : [];
  return { lines: lines.slice(-cap), all: lines.length };
}

/** הכרעה = מוח (LLM אם-זמין) → מנוע-דטרמיניסטי (תמיד-עובד). הכל על-גבי-מדידות. */
async function decide(claimText, ctx, cap, journalTail) {
  const b = await brain(`${ctx}\n\n=== פנייה/דוח ===\n${redact(claimText)}`);
  if (b.ok) return { brainUsed: true, brainWhy: null, engine: b.engine || 'llm', verdict: { verdictHe: redact(b.verdict.verdictHe), stepsHe: (b.verdict.stepsHe || []).map(redact), confidence: b.verdict.confidence, needMore: !!b.verdict.needMore } };
  const d = reasonDeterministic(claimText, cap, journalTail);
  return { brainUsed: false, brainWhy: b.why, engine: d.engine, verdict: d };
}

async function processClaims(cap, journalTail) {
  const processed = await loadJsonl(REPO, `${DIR}/claims-processed.jsonl`);
  const seen = new Set(processed.lines.map((l) => { const j = tryJson(l); return j ? j.key : null; }).filter(Boolean));
  const local = await loadJsonl(REPO, `${DIR}/claims.jsonl`, 50);
  const ctx = contextFor(cap, journalTail);
  const jTail = journalTail;
  const out = [];
  const replies = [];

  // מקור-א — פניות-מקומיות (האפליקציה של-הבעלים / כל-סוכן שפותח-PR)
  for (const l of local.lines) {
    const c = tryJson(l); if (!c || !c.text) continue;
    const key = `claim:${(c.at || '') + '|' + String(c.text).slice(0, 60)}`;
    if (seen.has(key)) continue;
    const d = await decide(String(c.text), ctx, cap, jTail);
    out.push({ key, at: now(), claimAt: c.at, from: c.role || c.source || 'unknown', claim: redact(String(c.text)).slice(0, 400), brainUsed: d.brainUsed, brainWhy: d.brainWhy, engine: d.engine, verdict: d.verdict, evidence: { feedsAlive: cap.feeds.filter((f) => f.alive).length, sitesOk: cap.sites.filter((s) => s.status === 200).length + '/' + cap.sites.length } });
    replies.push({ replyTo: key, text: out[out.length - 1].verdict.verdictHe });
  }

  // מקור-ב — דוחות-סוכנים בערוץ-המפעיל (פניות-אל-המפעיל → מנותבות-לריבונות)
  const inboxTxt = await rawRead('Sandbox', 'ops/sovereign/OWNER-CHANNEL/inbox.jsonl');
  if (inboxTxt) {
    const lines = inboxTxt.trim().split('\n').filter(Boolean).slice(-8);
    for (const l of lines) {
      const e = tryJson(l); if (!e) continue;
      if (e.role === 'autonomy') continue; // תשובה-שלנו — לא-פנייה
      const key = `owner-channel:${e.at}|${String(e.source || '')}`;
      if (seen.has(key)) continue;
      const d = await decide(String(e.text || JSON.stringify(e).slice(0, 500)), ctx, cap, jTail);
      out.push({ key, at: now(), claimAt: e.at, from: e.source || 'agent', claim: redact(String(e.text || JSON.stringify(e).slice(0, 300))).slice(0, 400), brainUsed: d.brainUsed, brainWhy: d.brainWhy, engine: d.engine, verdict: d.verdict, evidence: { source: 'OWNER-CHANNEL' } });
      replies.push({ replyTo: key, text: out[out.length - 1].verdict.verdictHe });
    }
    // תשובה-חזרה לערוץ (dedup לפי replyTo)
    if (replies.length) {
      const newLines = replies.map((r) => JSON.stringify({ at: now(), role: 'autonomy', source: 'selfhood', replyTo: r.replyTo, engine: 'route', text: redact(r.text).slice(0, 500) }));
      await putVerified('Sandbox', 'ops/sovereign/OWNER-CHANNEL/inbox.jsonl', inboxTxt.trimEnd() + '\n' + newLines.join('\n') + '\n', `selfhood: ${replies.length} הכרעות-ריבונות לפניות (role autonomy, dedup)`);
    }
  }
  return { processed: [...processed.lines, ...out.map((o) => JSON.stringify(o))].slice(-200), newCount: out.length, replies: replies.length };
}

/* ────────────────────────── MAIN ────────────────────────── */
async function main() {
  const t0 = Date.now();
  if (!PAT) { console.error('FATAL: אין-אמצעי-קריאה (SBX_FLEET_PAT/GITHUB_TOKEN)'); process.exit(1); }
  const memTxt = await rawRead(REPO, `${DIR}/memory.json`);
  const memory = (memTxt && tryJson(memTxt)) || { schema: 'selfhood.memory/1', repos: {} };
  const prevJournal = await loadJsonl(REPO, `${DIR}/journal.jsonl`, 400);

  console.log('[selfhood] 1/4 DISCOVERY…');
  const { repos, discoveries, newMemory } = await discovery(memory);
  console.log(`  repos=${repos.length} discoveries=${discoveries.length}`);

  console.log('[selfhood] 2/4 CAPABILITIES…');
  const cap = await capabilities(repos);
  console.log(`  organs=${cap.organs.length} feedsAlive=${cap.feeds.filter((f) => f.alive).length}/${cap.feeds.length} sitesOk=${cap.sites.filter((s) => s.status === 200).length}/${cap.sites.length}`);

  console.log('[selfhood] 3/4 CLAIMS…');
  const journalNewLines = discoveries.slice(-40).map((d) => JSON.stringify({ at: now(), ...d }));
  const journal = [...prevJournal.lines, ...journalNewLines].slice(-400);
  const claims = await processClaims(cap, journal.slice(-6).map((l) => { const j = tryJson(l); return j ? `${j.kind}:${j.repo}` : '?'; }));
  console.log(`  processed=${claims.newCount} replies=${claims.replies} brainConfig=${AI ? 'on' : 'off'}`);

  console.log('[selfhood] 4/4 COMMIT+VERIFY…');
  const results = {};
  results['memory.json'] = await putVerified(REPO, `${DIR}/memory.json`, JSON.stringify(newMemory, null, 1), 'selfhood: זיכרון-גילוי עודכן (מדוד)');
  results['journal.jsonl'] = await putVerified(REPO, `${DIR}/journal.jsonl`, journal.join('\n') + '\n', `selfhood: יומן-מודעות +${journalNewLines.length} (מדוד)`);
  const capsObj = { schema: 'selfhood.capabilities/1', ...cap };
  results['capabilities.json'] = await putVerified(REPO, `${DIR}/capabilities.json`, JSON.stringify(capsObj, null, 1), 'selfhood: מפת-יכולות נמדדה');
  const md = [
    `# מפת-יכולות הרשת — נמדד ${now()}`,
    '',
    '> כל-מספר כאן נמדד בהרצה זו מול הגיט והאתרים. אין-שאיפות — רק מציאות.',
    `> מחזור: DISCOVERY ${discoveries.length} גילויים · CLAIMS ${claims.newCount} הכרעות (מוח ${AI ? 'מחובר' : 'כבוי-fail-closed'})`,
    '',
    '## איברי-חישוב שרצו-בפועל (7 ימים, עיקריים)',
    ...cap.organs.slice(0, 20).map((o) => `- ${o.repo}/${o.workflow} — ✓${o.success7d} ✗${o.failure7d} · הצלחה-אחרונה לפני ${o.lastSuccessAgeH ?? '?'}h ${o.private ? '· פרטי' : ''}`),
    '',
    '## פידי-אמת חיים',
    ...cap.feeds.map((f) => `- ${f.label} (${f.repo}/${f.path}) — ${f.alive ? `חי · גיל ${f.ageH ?? '?'}h` : 'לא-זמין'}`),
    '',
    '## אתרים',
    ...cap.sites.map((s) => `- ${s.url} — HTTP ${s.status}`),
    '',
    '## חישוב',
    `- איברים-פומביים פעילים: ${cap.compute.publicOrgans}`,
    `- וורקפלו-פעילים בריפו-פרטי (אמור-להיות-0, חוק-עצירת-הדימום): ${cap.compute.activePrivateWorkflows.length}${cap.compute.activePrivateWorkflows.length ? ' — ' + cap.compute.activePrivateWorkflows.join(', ') : ''}`,
    '',
  ].join('\n');
  results['CAPABILITIES.md'] = await putVerified(REPO, `${DIR}/CAPABILITIES.md`, md, 'selfhood: מפת-יכולות (MD נמדד)');
  results['claims-processed.jsonl'] = await putVerified(REPO, `${DIR}/claims-processed.jsonl`, claims.processed.join('\n') + (claims.processed.length ? '\n' : ''), `selfhood: ${claims.newCount} פניות-הוכרעו (כנות+מדידה)`);
  const selfCheck = { schema: 'selfhood.self-check/1', at: now(), durationMs: Date.now() - t0, commits: results, allVerified: Object.values(results).every((r) => r.ok), discoveries: discoveries.length, claimsProcessed: claims.newCount, brain: { chain: [AI ? 'z-ai' : null, process.env.GROQ_API_KEY ? 'groq' : null, process.env.GEMINI_API_KEY ? 'gemini' : null].filter(Boolean), wired: !!(AI || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY), note: 'z-ai זמין-רק-מרשת-פנימית; מפתח-ציבורי (GROQ/GEMINI) משדרג-אוטומטית' } };
  results['self-check.json'] = await putVerified(REPO, `${DIR}/self-check.json`, JSON.stringify(selfCheck, null, 1), 'selfhood: בדיקה-עצמית (קריאה-חזרה לכל-קובץ)');
  const failed = Object.entries(results).filter(([, r]) => !r.ok);
  if (failed.length) { console.error('VERIFY FAILED:', failed.map(([k]) => k).join(',')); process.exit(1); }
  console.log(`[selfhood] OK · ${Date.now() - t0}ms · כל-${Object.keys(results).length}-הקבצים נקראו-חזרה ואומתו`);
}
main().catch((e) => { console.error('SELFHOOD FATAL:', redact(String(e && e.stack || e)).slice(0, 400)); process.exit(1); });
