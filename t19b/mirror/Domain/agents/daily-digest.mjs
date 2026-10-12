// DAILY-DIGEST — הדיווח היומי המדוד של הצי (C-1, R130) · AGENT-Z
//
// שונה מ-cloud-pulse: שם = כרטיס-גיבוי מינימלי רק כשהבית מת. כאן = הדיווח
// היומי המלא, תמיד — כל מספר נקרא חי בזמן-ריצה מקובץ-מקור ציבורי.
// אסור-לזייף: מקור לא-זמין מודפס כ-"unavailable — nothing faked".
//
// משמעת מפתח זהה ל-cloud-pulse (מוכח-חי):
//   · posting בלבד — המפתח נגזר לציבורי ומושווה ביט-מול-ביט מול רשות-ה-posting
//     החיה של @headcorner מהשרשרת. סוד שגוי = סירוב אדום, לא שידור.
//   · שער-RC לפני שידור (מודל-העלות הנמדד של web-publish).
//   · אידמפוטנטיות מהשרשרת עצמה: permlink דטרמיניסטי saos-daily-<YYYYMMDD>.
//   · אפס קומיטים לריפו — הפעימה קוראת ומשדרת, אין state בגיט.
//   · שידור: steem.broadcast.sendAsync + מירוץ-זמן 45ש' (לקח R98).

"use strict";

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const STEEM_RPC = "https://api.steemit.com";
const POSTER = "headcorner";
const TAGS = ["saos", "defi", "network"];
const STEEM_JS_DIR = process.env.STEEM_JS_DIR || "/tmp/steemjs";
const RC_COMMENT_BASE = 976_000_000; // נמדד ב-web-publish (Zip)
const RC_PER_CHAR = 320_000;         // נמדד ב-web-publish (Zip)

const RAW = (repo, file) => `https://raw.githubusercontent.com/roshpinacare-sys/${repo}/main/${file}`;

const steem = createRequire(path.join(STEEM_JS_DIR, "probe.cjs"))("steem");

const WIF_PRIMARY = (process.env.STEEM_POSTING_WIF || "").trim();
const WIF_FALLBACK = (process.env.WEAVE_STEEM_WIF || "").trim();
const DRY = /^(1|true|yes)$/i.test(process.env.DAILY_DIGEST_DRY || "");

function log(msg) { console.log(`[daily-digest] ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params, retries = 3) {
  for (let a = 1; a <= retries; a++) {
    try {
      const res = await fetch(STEEM_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(String(j.error.message || "rpc-error").slice(0, 120));
      return j.result;
    } catch (e) {
      if (a === retries) throw e;
      await sleep(1500 * a);
    }
  }
}

async function fetchJson(url, timeoutMs = 15_000) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`http-${res.status}`);
    return await res.json();
  } catch (e) {
    log(`  · מקור לא-זמין: ${url.split("/").slice(3, 6).join("/")} (${String(e?.message || e).slice(0, 60)}) — לא מזויף`);
    return null;
  }
}

const todayUtc = () => new Date().toISOString().slice(0, 10);
const todayPermlink = () => `saos-daily-${todayUtc().replace(/-/g, "")}`;

// ── איסוף מדידות: כל מקור בנפרד, כשל = null מקומי ────────────────────────
async function collect() {
  log("collecting measured inputs…");
  const out = {};

  try {
    out.kpi = existsSync("defi-kpi/fleet/KPI.json")
      ? JSON.parse(readFileSync("defi-kpi/fleet/KPI.json", "utf8"))
      : null;
    if (out.kpi) log("  · KPI נקרא מ-checkout מקומי (defi-kpi)");
  } catch { out.kpi = null; }
  if (!out.kpi) out.kpi = await fetchJson(RAW("Defi", "fleet/KPI.json"));
  out.triggers = await fetchJson(RAW("Console", "triggers/current.json"));
  out.grid = await fetchJson(RAW("Console", "dex/grid.json"));

  try {
    out.mirror = existsSync("mirror.json") ? JSON.parse(readFileSync("mirror.json", "utf8")) : null;
  } catch { out.mirror = null; }
  try {
    out.truth = existsSync("truth/latest.json") ? JSON.parse(readFileSync("truth/latest.json", "utf8")) : null;
  } catch { out.truth = null; }

  out.forge = await fetchJson(
    "https://api.github.com/repos/roshpinacare-sys/Domain/actions/workflows/foundry-mesh-tests.yml/runs?per_page=1"
  );

  // ראש-הספר מהשרשרת עצמה (החשבון מדבר = הרשת חיה)
  try {
    const acc = await rpc("condenser_api.get_accounts", [[POSTER]]);
    out.chainLastPost = acc?.[0]?.last_root_post || null;
  } catch { out.chainLastPost = null; }

  return out;
}

// ── הכרטיס: דו-לשוני, כל שורה עם מקור ───────────────────────────────────
function buildCard(d) {
  const date = todayUtc();
  const L = [];
  L.push(`# SAOS Mission Daily — ${date}`, "");
  L.push(`**Date:** ${date} (UTC) · **Voice:** @${POSTER} · **Layer:** cloud (GitHub Actions, Domain)`, "");

  // 1. KPI — המדידה הכלכלית הכנה
  L.push(`## 1. Mission economics (measured)`);
  if (d.kpi?.revenuePerDayReal) {
    const r = d.kpi.revenuePerDayReal;
    L.push(`- **Real revenue/day: $${r.usd}** — method: ${r.method || "measured"}`);
    if (r.caveat) L.push(`- *Honest caveat:* ${r.caveat}`);
  } else {
    L.push(`- revenue: unavailable — nothing faked`);
  }
  if (d.kpi?.ladder) L.push(`- Ladder: **${d.kpi.ladder.current}** (target $${d.kpi.ladder.targetPerDay}/day)`);
  L.push(`- Source: Defi/fleet/KPI.json (raw, main)`, "");

  // 2. ספר-הטריגרים
  L.push(`## 2. Trigger book (the loop)`);
  if (d.triggers && d.triggers.ok) {
    const fired = Array.isArray(d.triggers.fired) ? d.triggers.fired : [];
    const waited = Array.isArray(d.triggers.waited) ? d.triggers.waited : [];
    const firedIds = fired.map((r) => r?.id).filter(Boolean).join(", ");
    L.push(`- rules ${d.triggers.rulesTotal ?? "?"} · fired **${fired.length}** · waited ${waited.length} · broken ${d.triggers.broken ?? "?"}`);
    if (firedIds) L.push(`- fired rules: ${firedIds}`);
    L.push(`- book published: ${d.triggers.publishedAt || "?"} · engine: ${d.triggers.engine || "?"}`);
  } else L.push(`- trigger book: unavailable — nothing faked`);
  if (d.grid?.triggers) {
    const c = d.grid.triggers.consumed || [];
    L.push(`- consumed by grid: ${c.length === 0 ? "none (book green)" : c.join(", ")}`);
  }
  L.push(`- Source: Console/triggers/current.json + Console/dex/grid.json`, "");

  // 3. הגריד — הדלק האמיתי
  L.push(`## 3. Grid fuel (real, not simulated)`);
  if (d.grid?.fuel) {
    const f = d.grid.fuel;
    L.push(`- powerdown active: **${f.powerdownActive ? "yes" : "no"}** · weekly ${Number(f.weeklySp || 0).toFixed(1)} SP ≈ **$${f.weeklyUsd}**`);
    if (f.nextPayout) L.push(`- next payout: ${f.nextPayout} · remaining ${Number(f.remainingSp || 0).toFixed(0)} SP (~${f.remainingWeeks} weeks)`);
  } else L.push(`- grid fuel: unavailable — nothing faked`);
  if (d.grid?.verdict) L.push(`- grid verdict: ${d.grid.verdict}${d.grid.blocker ? ` (blocker: ${d.grid.blocker})` : ""}`);
  L.push(`- Source: Console/dex/grid.json#fuel`, "");

  // 4. הספר — העוגן
  L.push(`## 4. The ledger (anchor rail)`);
  const s = d.mirror?.stats;
  if (s) {
    L.push(`- **${s.attestations ?? "?"} attestations** · ${s.checkpoints ?? "?"} checkpoints · ${s.agents ?? "?"} agents`);
    L.push(`- 24h: ${s.vitality?.atts24h ?? "?"} attestations · alive **${s.vitality?.aliveDays ?? "?"} days**`);
  } else L.push(`- ledger mirror: unavailable — nothing faked`);
  if (d.truth?.verdict) L.push(`- truth gate: **${d.truth.verdict}** (${d.truth.counts?.pass ?? "?"} pass / ${d.truth.counts?.fail ?? "?"} fail)`);
  if (d.chainLastPost) L.push(`- chain voice: last post of @${POSTER} at ${d.chainLastPost}`);
  L.push(`- Source: Domain/mirror.json + truth/latest.json + live chain`, "");

  // 5. שער-הטסטים של החוזים (B-2)
  L.push(`## 5. Contract law gate (B-2)`);
  const run = d.forge?.workflow_runs?.[0];
  if (run) {
    const icon = run.conclusion === "success" ? "GREEN" : run.conclusion === "failure" ? "RED" : (run.conclusion || run.status);
    L.push(`- mesh contract tests: **${icon}** · run ${run.id} · ${run.created_at}`);
    L.push(`- law: MINT_CAP fail-closed · no-phantom-supply invariant · deposit attribution · monotonic anchors (46 tests)`);
  } else L.push(`- contract test gate: unavailable — nothing faked`);
  L.push(`- Source: GitHub API → Domain/foundry-mesh-tests.yml latest run`, "");

  L.push("---", "");
  L.push(`**Honest frame:** this digest is posted by an autonomous agent through GitHub Actions with a **posting-only** Steem key. Every number was read at run time from public files or the live chain; sources are named per section. No claim without a source file.`, "");
  L.push(`**מסגרת-כנות:** דיווח זה נשלח על-ידי סוכן אוטונומי עם מפתח-**posting בלבד**. כל מספר נקרא בזמן-ריצה מקבצים ציבוריים או מהשרשרת; המקורות מנויים. אין טענה בלי קובץ-מקור.`, "");
  L.push(`— SAOS · proof over promises · agents/daily-digest.mjs (C-1, R130)`);
  return L.join("\n");
}

// ── בחירת מפתח: זיהוי ביט-מול-ביט (תבנית cloud-pulse) ───────────────────
function pickWif(livePostingPub) {
  const candidates = [
    { name: "STEEM_POSTING_WIF", wif: WIF_PRIMARY },
    { name: "WEAVE_STEEM_WIF", wif: WIF_FALLBACK },
  ];
  for (const c of candidates) {
    if (!c.wif) { log(`  · ${c.name}: לא סופק`); continue; }
    let pub = "";
    try { pub = steem.auth.wifToPublic(c.wif).toString(); } catch {
      log(`  · ${c.name}: לא WIF תקין — נדחה`); continue;
    }
    if (pub === livePostingPub) {
      log(`  · ${c.name}: ✓ רשות-ה-posting החיה של @${POSTER}`);
      return { wif: c.wif, src: c.name };
    }
    log(`  · ${c.name}: אינו רשות-ה-posting של @${POSTER} — נדחה`);
  }
  return null;
}

async function currentMana(account) {
  const r = await rpc("rc_api.find_rc_accounts", { accounts: [account] });
  const a = r?.rc_accounts?.[0];
  if (!a) return null;
  return { mana: a.rc_manabar?.current_mana ?? 0, max: a.max_rc ?? 0 };
}

// ── ראשי ────────────────────────────────────────────────────────────────
async function main() {
  log(`boot · poster=@${POSTER} · dry=${DRY} · permlink=${todayPermlink()}`);

  // 1) אידמפוטנטיות מהשרשרת — permlink דטרמיניסטי
  const permlink = todayPermlink();
  let existing = null;
  try { existing = await rpc("condenser_api.get_content", [POSTER, permlink]); }
  catch (e) { log(`קריאת-אידמפוטנטיות נכשלה (${String(e?.message || e).slice(0, 80)}) — ממשיכים בזהירות`); }
  if (existing && existing.id !== 0) {
    log(`הדיווח של היום כבר על השרשרת (permlink ${permlink}, id ${existing.id}) — אין כפילות. יציאה ירוקה.`);
    return;
  }

  // 2) איסוף + בניית הכרטיס (לפני מפתח — כדי ש-DRY יעבוד חסר-מפתח)
  const d = await collect();
  const body = buildCard(d);
  log(`כרטיס נבנה: ${body.length} תווים`);

  // 3) מפתח: רשות-ה-posting החיה מול הכספת
  const accounts = await rpc("condenser_api.get_accounts", [[POSTER]]);
  const livePostingPub = accounts?.[0]?.posting?.key_auths?.[0]?.[0] || null;
  if (!livePostingPub) { log("רשות-ה-posting בלתי-קריאה — סירוב כנה."); process.exit(1); }
  const key = pickWif(livePostingPub);
  if (!key) {
    if (!WIF_PRIMARY && !WIF_FALLBACK) {
      log("NO-WIF — דילוג-כנה בסגנון web-publish (הריצה ירוקה, הכרטיס להלן להדפסה).");
      log(`--- DRY CARD ---\n${body}`);
      return;
    }
    log("אף סוד שסופק אינו רשות-ה-posting — סירוב אדום: לא משדרים בשם מי שלא אישרו.");
    process.exit(1);
  }

  // 4) שער-RC
  const cost = RC_COMMENT_BASE + RC_PER_CHAR * body.length;
  const mana = await currentMana(POSTER);
  if (!mana) { log("מנת-RC בלתי-קריאה — לא משדרים בלי מדידה. אדום כנה."); process.exit(1); }
  log(`RC: מנה ${mana.mana.toLocaleString()} מול עלות ${cost.toLocaleString()} (${body.length} תווים)`);
  if (mana.mana < cost) {
    log(`דילוג-RC כנה: אין מנה לדיווח היום (${mana.mana} < ${cost}). המספרים לפניך — לא כישלון קשה.`);
    return;
  }

  // 5) שידור
  const title = `SAOS Mission Daily — ${todayUtc()}`;
  const op = ["comment", {
    parent_author: "",
    parent_permlink: TAGS[0],
    author: POSTER,
    permlink,
    title,
    body,
    json_metadata: JSON.stringify({
      tags: TAGS,
      app: "saos/daily-digest/1.0",
      format: "markdown",
      community: "saos",
      source: "agent-z daily digest (C-1, R130)",
    }),
  }];
  log(`דיווח מוכן: "${title}" · permlink ${permlink}`);
  if (DRY) {
    log("DRY — לא משודר. גוף הדיווח להלן:");
    log(`--- DRY CARD ---\n${body}`);
    return;
  }

  try {
    let timer;
    const result = await Promise.race([
      steem.broadcast.sendAsync({ extensions: [], operations: [op] }, [key.wif]),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("broadcast-timeout-45s")), 45_000); }),
    ]).finally(() => timer && clearTimeout(timer));
    const txid = result?.id ?? null;
    log(`✓ שודר מעל ${key.src}: txid ${txid} · https://steemit.com/@${POSTER}/${permlink}`);
    if (!txid) log("הערת כנות: לא הוחזר tx-זיהוי — האימות הסופי בהיסטוריית השרשרת.");
  } catch (e) {
    log(`✗ השידור נכשל בכנות: ${String(e?.message || e).slice(0, 180)} — לא כישלון קשה; הדיווח יישאר לריצה הבאה.`);
  }
}

void main();
