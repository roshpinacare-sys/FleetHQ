#!/usr/bin/env node
/**
 * potential.mjs — לוח הפוטנציאל והגיוס של הריבונות (measured, zero invented values).
 *
 * חוקי אמת:
 *  - כל ערך מגיע ממקור אמיתי עם חותמת זמן + URL. מה שלא נמדד = "unknown" (מוצג כך).
 *  - אין מפתחות, אין סודות, אפס תלות (Node 20 stdlib בלבד).
 *  - הרפאים נבדקים חי (re-verify) — לא נניח שמשהו נשבר/נפתר בלי מדידה עדכנית.
 *
 * קלט:
 *  --digest office-window/dist/digest.json   (מדידת הצי מאותו ריצה)
 *  --dist  office-window/dist                (תיקיית פלט)
 * מקורות רשת (public raw/Pages, fail→unknown):
 *  - Sandbox ops/flow/flow-map.json   (יתומים, רפאים, תיאטרון, התראות)
 *  - FleetHQ Pages digest.json        (אימות-חי של יעד הרפא הידוע)
 *
 * פלט: potential.json + potential.html (RTL, zero-JS, dark, self-contained)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
function argOf(flag, dflt) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
}
const DIGEST = path.resolve(ROOT, argOf("--digest", "office-window/dist/digest.json"));
const DIST = path.resolve(ROOT, argOf("--dist", "office-window/dist"));

const FLOW_URL = "https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/flow/flow-map.json";
const RECRUIT_URL = "https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/agents/recruitment.json";
const DIGEST_LIVE_URL = "https://roshpinacare-sys.github.io/FleetHQ/digest.json";
const VALUE_MAP_URL = "https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/ops/plans/revival-value-map-2026-10-11.md";

const now = new Date().toISOString();
const provenance = [];
function prov(name, source, extra) {
  provenance.push({ name, source, at: now, ...(extra || {}) });
}
function unknown(x) { return x === undefined || x === null ? "unknown" : x; }

async function fetchJson(url, timeoutMs = 15000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "user-agent": "fleet-potential/1 (roshpinacare-sys)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
async function fetchOk(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, method: "GET", headers: { "user-agent": "fleet-potential/1 (roshpinacare-sys)" } });
    return { status: r.status, ok: r.ok };
  } catch (e) { return { status: 0, ok: false, err: String(e && e.message || e) }; }
  finally { clearTimeout(to); }
}
function hoursSince(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 36e5;
}
function ageHe(h) {
  if (h == null) return "unknown";
  if (h < 1) return Math.max(1, Math.round(h * 60)) + " דק׳";
  if (h < 48) return h.toFixed(1) + " שע׳";
  return Math.round(h / 24) + " ימ׳";
}

/* ── 1) digest (same-run measured fleet) ── */
let digest = null;
if (existsSync(DIGEST)) {
  try { digest = JSON.parse(readFileSync(DIGEST, "utf8")); } catch { digest = null; }
}
prov("digest.json", "local:" + path.relative(ROOT, DIGEST), digest ? { generatedAt: digest.generatedAt } : { note: "missing → fleet rendered unknown" });

/* ── 2) GOVERNANCE (local real files) ── */
let graph = null, claims = [];
try {
  graph = JSON.parse(readFileSync(path.join(ROOT, "GOVERNANCE/FLEET-GRAPH.json"), "utf8"));
  prov("FLEET-GRAPH.json", "local:GOVERNANCE/FLEET-GRAPH.json", { updatedAt: graph.updatedAt });
} catch { prov("FLEET-GRAPH.json", "local:GOVERNANCE/FLEET-GRAPH.json", { note: "missing" }); }
try {
  const lines = readFileSync(path.join(ROOT, "GOVERNANCE/write-log.jsonl"), "utf8").split("\n").filter(Boolean);
  for (const ln of lines) { try { claims.push(JSON.parse(ln)); } catch { /* skip torn line */ } }
  prov("write-log.jsonl", "local:GOVERNANCE/write-log.jsonl", { claims: claims.length });
} catch { prov("write-log.jsonl", "local:GOVERNANCE/write-log.jsonl", { note: "missing" }); }

/* ── 3) network measured inputs ── */
let flow = null;
try { flow = await fetchJson(FLOW_URL); prov("flow-map.json", FLOW_URL, { generatedAt: flow.generatedAt }); }
catch (e) { prov("flow-map.json", FLOW_URL, { note: "fetch failed → flags unknown (" + (e && e.message || e) + ")" }); }

// declared consumer of the Domain office's own recruiting artifact (union, not duplication)
let recruitment = null;
try { recruitment = await fetchJson(RECRUIT_URL); prov("recruitment.json", RECRUIT_URL, { at: recruitment.at }); }
catch (e) { prov("recruitment.json", RECRUIT_URL, { note: "fetch failed → office roles unknown" }); }

// [zai-12] second recruiting source: the LOCAL measurement engine (office-recruit :3041 →
// receipts/recruitment/live.json) — evidence-bound roles derived from real estate git signals.
// Union law: both sources surface side-by-side, neither overwrites the other.
const LOCAL_RECRUIT_PATH = path.join(ROOT, "receipts", "recruitment", "live.json");
let localRecruitment = null;
try {
  localRecruitment = JSON.parse(readFileSync(LOCAL_RECRUIT_PATH, "utf8"));
  prov("recruitment-live.json", "receipts/recruitment/live.json (local engine)", {
    at: localRecruitment.generatedAt, sha16: (localRecruitment.sha256 || "").slice(0, 16),
    roles: localRecruitment.totals ? localRecruitment.totals.roles : null,
  });
} catch (e) {
  prov("recruitment-live.json", "receipts/recruitment/live.json (local engine)", {
    note: "absent → local recruitment engine has not scanned yet (" + (e && e.code || e && e.message || e) + ")",
  });
}

// self-verify the known ghost target live — measured resolution, never assumed
const digestLive = await fetchOk(DIGEST_LIVE_URL);
prov("digest-live-check", DIGEST_LIVE_URL, { status: digestLive.status, ok: digestLive.ok });

/* ── 4) synthesis: open work + recruiting ── */
const queuedEdges = (graph && Array.isArray(graph.edges)) ? graph.edges.filter(e => e.status === "queued") : [];
const liveEdges = (graph && graph.summary && graph.summary.live) != null ? graph.summary.live : null;
const graphActive = (graph && graph.summary && graph.summary.reposActive24h) || null;

// claims normalization: repo → latest claim per lane
const claimsByLane = new Map();
for (const c of claims) {
  if (!c || c.kind !== "claim" || !c.lane) continue;
  const k = c.lane.split(" ")[0];
  const prev = claimsByLane.get(k);
  if (!prev || (c.ts && prev.ts && c.ts > prev.ts)) claimsByLane.set(k, c);
}

const orphans = (flow && Array.isArray(flow.orphans)) ? flow.orphans : null;
const ghosts = (flow && Array.isArray(flow.ghosts)) ? flow.ghosts : null;
const stale = (flow && Array.isArray(flow.stale)) ? flow.stale : null;
const alerts = (flow && Array.isArray(flow.alerts)) ? flow.alerts : null;
const driftAlerts = alerts ? alerts.filter(a => String(a.law || "").includes("content-divergence")) : null;

// ghost resolution — re-measured right now
const ghostResolved = ghosts ? ghosts.some(g => /FleetHQ:digest\.json$/.test(g.target || "")) && digestLive.ok : null;

/* opportunities: every item = measured evidence + expected value + first step + claim status */
const openWork = [];
for (const e of queuedEdges) {
  const laneKey = String(e.artifact || "").toLowerCase().includes("sdk") ? "sdk-build"
    : String(e.artifact || "").toLowerCase().includes("anchor") ? "truthrail-anchor"
    : String(e.artifact || "").toLowerCase().includes("fee") ? "fee-engine-armed" : null;
  const claim = laneKey ? claimsByLane.get(laneKey) : null;
  openWork.push({
    kind: "queued-edge", id: (e.from || "?") + "→" + (e.to || "?"),
    title: e.artifact || "unknown", mode: e.mode || "unknown",
    evidence: e.evidence || "unknown",
    source: "GOVERNANCE/FLEET-GRAPH.json@" + unknown(graph && graph.updatedAt),
    claimedBy: claim ? (claim.agent + " · " + (claim.ts || "unknown")) : null,
    status: claim ? "claimed-in-service" : "open-for-recruiting",
    expectedValue: "קשת חיה נוספת בגרף הריבונות — הכל משתמש בהכל",
    firstStep: claim ? (claim.why || "בוצע לפי הטענה") : "לתבוע את הקשת לפי FLEET-ROLES ולרשום claim ב-write-log"
  });
}
if (orphans) for (const o of orphans) {
  const key = String(o.key || "unknown");
  const short = key.split(":").pop() || key;
  openWork.push({
    kind: "orphan-book", id: short, title: short,
    evidence: "מפיק קיים, אף צרכן חי לא קורא (feeds=" + unknown(o.feeds) + ")",
    source: "ops/flow/flow-map.json@" + unknown(flow && flow.generatedAt),
    claimedBy: null, status: "open-for-recruiting",
    expectedValue: "ספר שמייצר ערך ואף אחד לא קורא = בזבוז; חיבור צרכן = ערך מיידי ללא ייצור חדש",
    firstStep: "לחבר צרכן חי (פאנל/חדר/פרוצדורה) או לרשום פרישה מתועדת — אסור שריפה"
  });
}
if (stale) for (const s of stale) {
  openWork.push({
    kind: "stale-consumer", id: String(s.target || "unknown").split(":").pop() || "unknown",
    title: "צרכן על מפיק ישן-מעבר-חוק",
    evidence: "ageH=" + unknown(s.ageH) + " (" + ageHe(s.ageH) + ") · consumer=" + unknown(s.consumer),
    source: "ops/flow/flow-map.json@" + unknown(flow && flow.generatedAt),
    claimedBy: null, status: "flagged-lane-dex",
    expectedValue: "שער-hash לפני קומיט — חיסול תיאטרון הקומיטים בשורש",
    firstStep: "ליין dex: לחבר את dex-router.cjs למקור חי או להשבית במפורש"
  });
}

/* recruiting board: roles derived ONLY from measured open items */
const roles = [];
if (orphans && orphans.length) roles.push({
  role: "מחבר-ספרים (Book Connector)", count: orphans.length,
  mission: "לחבר כל ספר-יתום לצרכן חי או להוציאו משירות בתיעוד",
  value: "הרשת תמדוד 0 יתומים — כל בייט מיוצר יקבל קורא",
  law: "צרכן-או-פרישה-מתועדת, אסור-שריפה (F-ledger zai-code-3)"
});
if (driftAlerts && driftAlerts.length) roles.push({
  role: "שומר-הגשר (Commit-Hash Gate)", count: driftAlerts.length,
  mission: "שער hash לפני קומיט בליין dex — אסור לדחוף תוכן ישן כקומיט חדש",
  value: "אמון הציבור בקבלות — אפס תיאטרון",
  law: "חוק האמת: מה שמוצג חייב להיות נמדד (G-law)"
});
roles.push({
  role: "שומר-טריות (V-FLEETHQ-FRESH)", count: 1,
  mission: "שער טריות: receipts ירוקים חייבים להוכיח שהמקור הפנימי טרי (R1 ממפת הערך)",
  value: "fail-soft לא יסתיר עוד מקור קפוא",
  law: "ערך פתוח מ-ops/plans/revival-value-map-2026-10-11.md"
});

const fleet = digest ? {
  reposSeen: unknown(digest.fleet && digest.fleet.reposSeen),
  publicCount: unknown(digest.fleet && digest.fleet.publicCount),
  privateCount: unknown(digest.fleet && digest.fleet.privateCount),
  digestGeneratedAt: digest.generatedAt || null,
  topRepos: (digest.repos || []).slice(0, 8).map(r => ({
    name: r.name, pushedAt: r.pushedAt || null,
    commits7d: typeof r.commits7d === "number" ? r.commits7d : unknown(null),
    lastRun: r.lastRun ? (r.lastRun.conclusion || r.lastRun.status || "unknown") : "unknown"
  }))
} : null;

const potential = {
  schema: "roshpinacare.potential/1",
  generatedAt: now,
  motto: "כל ערך נמדד — לא נוצר. מה שלא נמדד מוצג כ-unknown.",
  fleetGraph: graph && graph.summary ? {
    nodes: graph.summary.nodes, edges: graph.summary.edges,
    live: graph.summary.live, policy: graph.summary.policy,
    queued: graph.summary.queued, reposActive24h: graph.summary.reposActive24h,
    updatedAt: graph.updatedAt,
    queuedEdges: queuedEdges.map(e => ({ from: e.from, to: e.to, artifact: e.artifact, status: e.status, evidence: e.evidence }))
  } : null,
  openWork,
  recruiting: { roles, claimedLanes: [...claimsByLane.keys()].sort() },
  officeRecruitment: recruitment ? {
    at: recruitment.at || null, agent: recruitment.agent || null,
    rolesCount: Array.isArray(recruitment.roles) ? recruitment.roles.length : "unknown",
    roles: Array.isArray(recruitment.roles) ? recruitment.roles.slice(0, 10) : [],
    note: "declared consumer — FleetHQ/potential aggregates the Domain office board (no duplication)"
  } : null,
  fleet,
  ghostsVerification: ghosts ? {
    measured: ghosts.length,
    resolvedNow: ghostResolved ? ghosts.filter(g => /FleetHQ:digest\.json$/.test(g.target || "")).map(g => g.target) : [],
    evidence: "digest.json live check = HTTP " + digestLive.status + " @ " + now
  } : null,
  theater: driftAlerts ? { count: driftAlerts.length, items: driftAlerts.slice(0, 10).map(a => a.detail) } : null,
  deepDive: { valueMap: VALUE_MAP_URL, flowMap: FLOW_URL },
  provenance
};

/* ── 5) emit json + html ── */
mkdirSync(DIST, { recursive: true });
const jsonPath = path.join(DIST, "potential.json");
writeFileSync(jsonPath, JSON.stringify(potential, null, 2) + "\n");

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function rows(items, cols) {
  if (!items || !items.length) return `<tr><td colspan="${cols}" class="unk">לא נמדד — אין נתונים</td></tr>`;
  return items.map(it =>
    `<tr>${cols.map(c => `<td>${esc(typeof c === "function" ? c(it) : (it[c] ?? "unknown"))}</td>`).join("")}</tr>`
  ).join("");
}
const html = `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>לוח הפוטנציאל והגיוס — ריבונות רושפינה</title>
<style>
 :root{--bg:#14110d;--s2:#26201a;--line:#3d342a;--ink:#f3ede2;--ink2:#c9bfae;--ink3:#8f8574;--ok:#2fae63;--warn:#d9a13b;--err:#d95c4a;--acc:#e0a458}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI","Noto Sans Hebrew",Arial,sans-serif;line-height:1.65}
 main{max-width:980px;margin:0 auto;padding:32px 18px 56px}
 h1{font-size:24px;margin:0 0 4px} h2{font-size:17px;margin:34px 0 10px;color:var(--acc)}
 .sub{color:var(--ink3);font-size:13px} .motto{background:var(--s2);border:1px solid var(--line);border-radius:12px;padding:10px 14px;font-size:13px;color:var(--ink2);margin:14px 0}
 .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0}
 .kpi{background:var(--s2);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
 .kpi .n{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}.kpi .l{font-size:11px;color:var(--ink3)}
 table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
 th{color:var(--ink3);text-align:right;font-size:11px;border-bottom:1px solid var(--line);padding:6px 8px}
 tbody td:first-child{font-weight:700;color:var(--ink)}
 td{padding:8px;border-bottom:1px dashed var(--line);vertical-align:top;color:var(--ink2)}
 td b{color:var(--ink)} .tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 9px;font-size:11px;margin-inline-start:6px}
 .tag.open{color:var(--warn);border-color:var(--warn)} .tag.claimed{color:var(--ok);border-color:var(--ok)} .tag.flag{color:var(--err);border-color:var(--err)}
 .unk{color:var(--ink3);font-style:italic}
 .foot{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);font-size:11px;color:var(--ink3)}
 .foot a{color:var(--acc)} .stamp{color:var(--ok)}
</style></head><body><main>
<h1>לוח הפוטנציאל והגיוס</h1>
<div class="sub">המשרד שואל תמיד: מה הפוטנציאל · מה פתוח · מה יכול לתת עוד ערך — במדידה, לא בהצהרה. נוצר ${esc(now)}</div>
<div class="motto">⚖️ ${esc(potential.motto)} כל שורה נושאת מקור + עדות + צעד ראשון. מגויסים: סוכנים ובני-אדם — אותן חוקים.</div>

<div class="kpis">
 <div class="kpi"><div class="n">${esc(potential.fleetGraph ? potential.fleetGraph.reposActive24h : "unknown")}</div><div class="l">ריפואים פעילים 24h (FLEET-GRAPH)</div></div>
 <div class="kpi"><div class="n">${esc(potential.fleetGraph ? potential.fleetGraph.live : "unknown")}</div><div class="l">קשתות חיות</div></div>
 <div class="kpi"><div class="n">${esc(potential.fleetGraph ? potential.fleetGraph.queued : "unknown")}</div><div class="l">קשתות בתור (עתיד בבנייה)</div></div>
 <div class="kpi"><div class="n">${esc(openWork.length)}</div><div class="l">פריטי עבודה פתוחים (נמדדו)</div></div>
 <div class="kpi"><div class="n">${esc(potential.theater ? potential.theater.count : "unknown")}</div><div class="l">תיאטרון-קומיטים (נמדד)</div></div>
 <div class="kpi"><div class="n">${esc(potential.ghostsVerification ? potential.ghostsVerification.measured : "unknown")}</div><div class="l">רפאים במפה (חי: ${potential.ghostsVerification && potential.ghostsVerification.resolvedNow && potential.ghostsVerification.resolvedNow.length ? "חודש ✓" : "unknown"})</div></div>
</div>

<h2>🧑‍🚀 לוח הגיוס — תפקידים פתוחים</h2>
<table><thead><tr><th>תפקיד</th><th>משימה</th><th>ערך צפוי</th><th>חוק</th></tr></thead>
<tbody>${rows(potential.recruiting.roles.map(r => ({ role: r.role, mission: r.mission, value: r.value, law: r.law })), ["role", "mission", "value", "law"])}</tbody></table>
<div class="sub">מסלולות תפוסים (write-log): ${esc(potential.recruiting.claimedLanes.join(" · ") || "אין טענות רשומות")}</div>
${potential.officeRecruitment ? `
<h3 style="font-size:14px;margin:18px 0 6px;color:var(--ink2)">תפקידי משרד-ה-Domain (צריכה מוצהרת של recruitment.json — איחוד, לא שכפול)</h3>
<table><thead><tr><th>תקציר</th><th>ערך</th></tr></thead>
<tbody><tr><td>${esc(String(potential.officeRecruitment.rolesCount))} תפקידים · agent=${esc(potential.officeRecruitment.agent || "unknown")} · at=${esc(potential.officeRecruitment.at || "unknown")}</td>
<td>${esc((potential.officeRecruitment.roles || []).map(r => typeof r === "string" ? r : (r.role || r.name || JSON.stringify(r).slice(0, 60))).join(" · ") || "ללא תפקידים פתוחים כרגע")}</td></tr></tbody></table>` : `<div class="sub">תפקידי משרד-ה-Domain: לא נמדדו (recruitment.json לא נשלף)</div>`}

<h2>🧱 עבודה פתוחה — מה הפוטנציאל, מה הצעד הראשון</h2>
<table><thead><tr><th>פריט</th><th>עדות נמדדת</th><th>מקור</th><th>מצב</th><th>ערך צפוי</th><th>צעד ראשון</th></tr></thead>
<tbody>${rows(openWork.map(w => ({
  id: w.id + " · " + w.status,
  evidence: w.evidence, source: w.source,
  status: w.claimedBy ? ("תובע: " + w.claimedBy) : w.status,
  expectedValue: w.expectedValue, firstStep: w.firstStep
})), ["id", "evidence", "source", "status", "expectedValue", "firstStep"])}</tbody></table>

<h2>📊 הצי הנמדד (digest אחרון)</h2>
<table><thead><tr><th>ריפו</th><th>דחיפות 7d</th><th>נדחף</th><th>CI אחרון</th></tr></thead>
<tbody>${rows(fleet ? fleet.topRepos.map(r => ({ name: r.name, commits7d: r.commits7d, pushedAt: r.pushedAt || "unknown", lastRun: r.lastRun })) : null, ["name", "commits7d", "pushedAt", "lastRun"])}</tbody></table>

<h2>🧾 פרובננציה — מאיפה כל ערך</h2>
<table><thead><tr><th>קלט</th><th>מקור</th><th>בזמן</th></tr></thead>
<tbody>${rows(provenance.map(p => ({ name: p.name, source: p.source, at: p.at })), ["name", "source", "at"])}</tbody></table>

<div class="foot">
 מנוע: FleetHQ/tools/potential.mjs · אפס תלות · אפס מפתחות · fail→unknown.
 עומק-ערך: <a href="${esc(VALUE_MAP_URL)}">מפת הערך ל-13 הריפואים</a> · זרימה: <a href="${esc(FLOW_URL)}">מפת הזרימה החיה</a>.
 אימות-רפאים: ${esc(potential.ghostsVerification ? potential.ghostsVerification.evidence : "unknown")} <span class="stamp">${potential.ghostsVerification && potential.ghostsVerification.resolvedNow && potential.ghostsVerification.resolvedNow.length ? "✓ חודש ואומת" : ""}</span>
</div>
</main></body></html>`;
const htmlPath = path.join(DIST, "potential.html");
writeFileSync(htmlPath, html);

console.log("potential: wrote", path.relative(ROOT, jsonPath), "and", path.relative(ROOT, htmlPath));
console.log("potential: openWork=" + openWork.length, "roles=" + roles.length, "ghosts=" + (ghosts ? ghosts.length : "unknown"), "digestLive=" + digestLive.status);
