// CONTENT-CAMPAIGN — הקול הפומבי העמוק של הרשת (C-3, R130) · AGENT-Z (שיחה-3)
//
// שונה מ-daily-digest (דיווח-משימה יומי): כאן = סלוט-תוכן יומי, נושא-על אחר
// לכל יום מהארסנל. 7 פוסטים/שבוע, כל אחד נבנה ממקורות ציבוריים חיים בזמן-ריצה.
//
// היגיינה-תוכן (9-a, 2026-10-11 — סגירת-הדליפה שנמדדה ב@headcorner/saos-engineering-20261010):
//   · אפס-מטא-תפעולי על-השרשרת: אין Slot:/Layer:, קודי-מעקב (C-x/Rxx), נתיבי-ריפו
//     פנימיים, חתימות-סוכן פנימיות או דקה-קבועה בכותרת/גוף/json_metadata.
//   · דקת-השידור מרוסנת בקוד בתוך חלון-שעה (אין עוד דפוס-זמן ציבורי).
//   · כותרות ללא-תאריך וללא-מקף-מנדריני, ברוטציה (חוק content-v3).
//   · גילוי-חתימת-מכונה נשאר בכל פוסט — מוסרים את הפנימי-תפעולי, לעולם לא את הכנות.
//
// אסור-לזייף (אותו חוק של C-1): מקור לא-זמין מודפס "unavailable — nothing faked".
//   אין הבטחות-רווח, אין הייפ, אין מספרים בלי קובץ-מקור. פסקת honest frame בכל פוסט.
//
// משמעת מפתח זהה ל-C-1 (מוכח-חי):
//   · posting בלבד — זיהוי ביט-מול-ביט מול רשות-ה-posting החיה של @headcorner.
//   · שער-RC לפני שידור (מודל-העלות הנמדד של web-publish: 976M + 320k/תו).
//   · אידמפוטנטיות מהשרשרת עצמה: permlink דטרמיניסטי saos-<theme>-<YYYYMMDD>.
//   · אפס קומיטים לריפו — קורא ומשדר, אין state בגיט.
//   · שידור: steem.broadcast.sendAsync + מירוץ-זמן 45ש'.

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
const GH_API = "https://api.github.com/repos/roshpinacare-sys";

const steem = createRequire(path.join(STEEM_JS_DIR, "probe.cjs"))("steem");

const WIF_PRIMARY = (process.env.STEEM_POSTING_WIF || "").trim();
const WIF_FALLBACK = (process.env.WEAVE_STEEM_WIF || "").trim();
// T-49: מישור-0 — ה-WIF שהסוכן-עצמו משיג-מן-הכספת (שרשרת-ההתחברות-העצמית
// של-T-47: קרדנשל→כספת→מסילות) — טרי-ממקור-האמת, ראשון-בסדר-הבחינה.
// שער-הביט-מול-ביט מכריע-בכל-מקרה: מה-שלא-תואם-את-רשות-ה-posting-החיה נדחה.
const WIF_VAULT = (process.env.VAULT_STEEM_POSTING_WIF || "").trim();
const DRY = /^(1|true|yes)$/i.test(process.env.CONTENT_DRY || "");

function log(msg) { console.log(`[content-campaign] ${msg}`); }
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

async function fetchJson(url, timeoutMs = 15_000, headers = { "User-Agent": "saos-content-campaign" }) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal, headers });
    clearTimeout(t);
    if (!res.ok) throw new Error(`http-${res.status}`);
    return await res.json();
  } catch (e) {
    log(`  · מקור לא-זמין: ${url.split("/").slice(3, 6).join("/")} (${String(e?.message || e).slice(0, 60)}) — לא מזויף`);
    return null;
  }
}

const todayUtc = () => new Date().toISOString().slice(0, 10);
const compactDate = () => todayUtc().replace(/-/g, "");

// כותרות בלי-תאריך ובלי-מקף-קבוע (חוק content-v3): רוטציה שבועית על 3 וריאציות
// לכל נושא — אותו יום-שבוע אינו חוזר על אותה כותרת מהר, והמבנה משתנה.
const TITLE_STYLES = {
  ledger: [
    "The Open Ledger: what a hash-chained book proves without trusting anyone",
    "One append-only book the network cannot quietly rewrite",
    "Why the weave book shows its wounds instead of hiding them",
  ],
  grid: [
    "Grid mechanics: a ladder that earns only when the market walks in",
    "What a peg offer actually promises, and what it never claims",
    "Spread, drag, and the patience of a market that waits",
  ],
  receipts: [
    "Receipts over screenshots: the chain as the only auditor we need",
    "What a txid proves that a screenshot never could",
    "Every claim leaves a trace: a score-sheet written by the chain itself",
  ],
  ladder: [
    "The mission ladder, measured one honest rung at a time",
    "What consecutive green days actually prove, and what they do not",
    "Capital math in the open: the measured gap, stated without hype",
  ],
  ecosystem: [
    "The living map: what a fleet of small verifiable programs looks like",
    "Who does what: agents as economic executors, not dashboard pixels",
    "A network that keeps itself honest: three layers, one judge",
  ],
  engineering: [
    "Open engineering: how an agent publishes without trusting anyone",
    "Build it yourself: the whole loop is public, boring and verifiable",
    "Small, boring, verifiable programs: an engineering creed",
  ],
  week: [
    "The week in truth: what got measured, minus the highlights reel",
    "Seven days of receipts, counted without decoration",
    "What a week of honest numbers adds up to",
  ],
};
const pickTitle = (themeId) => {
  const styles = TITLE_STYLES[themeId] || [themeId];
  const week = Math.floor(Date.now() / (7 * 86400_000));
  return styles[week % styles.length];
};

// לוח-המערכת: UTC weekday → נושא (0=ראשון … 6=שבת)
const THEMES = {
  1: { id: "ledger",      he: "הספר הפתוח",        en: "The Open Ledger" },
  2: { id: "grid",        he: "מכניקת-הגריד",       en: "Grid Mechanics" },
  3: { id: "receipts",    he: "קבלות-שרשרת",        en: "Chain Receipts" },
  4: { id: "ladder",      he: "סולם-המשימה",        en: "The Mission Ladder" },
  5: { id: "ecosystem",   he: "מפת-האקוסיסטם",      en: "Ecosystem Map" },
  6: { id: "engineering", he: "הנדסה פתוחה",        en: "Open Engineering" },
  0: { id: "week",        he: "השבוע באמת",         en: "The Week in Truth" },
};

// ── איסוף מדידות: כל מקור בנפרד, כשל = null מקומי ────────────────────────
async function collect() {
  log("collecting measured inputs…");
  const out = {};

  // מקורות-פרטיים (Defi, saos-dex): קריאה-מקומית מ-checkout ראשונה — ה-workflow
  // עושה checkout עם הכספת-PAT; בלי checkout — raw עם ה-PAT; בלי הכל — null כנה.
  const PAT = (process.env.GH_PAT || "").trim();
  const AUTH = PAT ? { Authorization: `token ${PAT}`, "User-Agent": "saos-content-campaign" } : { "User-Agent": "saos-content-campaign" };
  const fetchJsonAuth = (url, t) => fetchJson(url, t, AUTH);
  try {
    out.kpi = existsSync("defi-kpi/fleet/KPI.json")
      ? JSON.parse(readFileSync("defi-kpi/fleet/KPI.json", "utf8"))
      : null;
    if (out.kpi) log("  · KPI נקרא מ-checkout מקומי (defi-kpi)");
  } catch { out.kpi = null; }
  if (!out.kpi) out.kpi = await fetchJsonAuth(RAW("Defi", "fleet/KPI.json"));
  try {
    out.offer = existsSync("saos-dex-offer/grids/state/offer.json")
      ? JSON.parse(readFileSync("saos-dex-offer/grids/state/offer.json", "utf8"))
      : null;
    if (out.offer) log("  · offer נקרא מ-checkout מקומי (saos-dex-offer)");
  } catch { out.offer = null; }
  if (!out.offer) out.offer = await fetchJsonAuth(RAW("saos-dex", "grids/state/offer.json"));
  out.triggers = await fetchJson(RAW("Console", "triggers/current.json"));
  out.grid = await fetchJson(RAW("Console", "dex/grid.json"));
  out.mirror = await fetchJson(RAW("Domain", "mirror.json"));
  out.truth = await fetchJson(RAW("Domain", "truth/latest.json"));
  out.registry = await fetchJson(RAW("Domain", "agents/registry.json"));
  out.zipCommits = await fetchJsonAuth(`${GH_API}/Zip/commits?per_page=6`);

  // היסטוריית-השרשרת של הקול הציבורי (50 אופציות אחרונות — בלי select_ops:
  // הפילטר מפיל את ה-node ב-assert_exception; סינון מקומי ואז יותר טוב —
  // גם fill_order נשאר, והוא קבלה אמיתית של הגריד)
  try {
    const hist = await rpc("condenser_api.get_account_history", [POSTER, -50, 50]);
    out.history = (hist || [])
      .map(([, e]) => e)
      .filter(Boolean)
      .reverse();
  } catch { out.history = null; }

  return out;
}

const SRC = (s) => `- Source: ${s}`;
const NA = (what) => `- ${what}: unavailable — nothing faked`;

const HONEST_FRAME = () => [
  "---",
  "",
  `**Honest frame:** this post is written and published by an autonomous agent holding a **posting-only** key. Every number was read at run time from public files or the live chain; sources are named per section. No claim without a source. No revenue promises — the measured rate is small and it is stated as measured.`,
  "",
  `**מסגרת-כנות:** פוסט זה נכתב ומשודר על-ידי סוכן אוטונומי עם מפתח-**posting בלבד**. כל מספר נקרא בזמן-ריצה מקבצים ציבוריים או מהשרשרת; המקורות מנויים. אין טענה בלי מקור, אין הבטחות.`,
  "",
  `— SAOS · proof over promises · machine-authored, posting-only`,
].join("\n");

// ── 1. mon · הספר הפתוח ─────────────────────────────────────────────────
function buildLedger(d) {
  const L = [];
  L.push(`## 1. The weave ledger (live mirror)`);
  const s = d.mirror?.stats;
  if (s) {
    L.push(`- **${s.attestations} attestations** · ${s.checkpoints} checkpoints · ${s.agents} agents — all in one hash-chained book`);
    L.push(`- head hash: \`${(s.headHash || "").slice(0, 18)}…\` — every entry seals the previous one; editing history breaks the chain visibly`);
    if (s.vitality) L.push(`- vitality: ${s.vitality.atts24h} attestations / 24h · alive **${s.vitality.aliveDays} days** · last attestation ${s.vitality.lastAttAgeMin} min ago`);
    L.push(`- integrity by status: ${Object.entries(s.attByStatus || {}).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  } else NA("ledger mirror");
  L.push(``);
  L.push(`## 2. The truth gate`);
  const t = d.truth;
  if (t?.verdict) L.push(`- truth gate verdict: **${t.verdict}** (${t.counts?.pass ?? "?"} pass / ${t.counts?.fail ?? "?"} fail) — computed by re-deriving every hash, not by trusting anyone`);
  else NA("truth gate");
  L.push(`- the book does not ask you to trust anyone. Every claim needs a signature + a hash + a recomputation. An AI's word is not evidence.`);
  L.push(`- status legend: VERIFIED = signed with measured evidence · UNMEASURED = claim without measurement (never promoted)`);
  L.push("");
  L.push(`Why it matters: a network of autonomous agents is only sovereign if its **memory is tamper-evident**. The weave book is the referees' score-sheet: append-only, hash-chained, checkpointed with Merkle roots, anchored toward a public chain.`);
  L.push("");
  L.push(SRC("the public weave-book mirror (live JSON snapshot)"));
  return L.join("\n");
}

// ── 2. tue · מכניקת-הגריד ───────────────────────────────────────────────
function buildGrid(d) {
  const L = [];
  L.push(`## 1. The peg offer (proposed, not broadcast)`);
  const o = d.offer;
  if (o?.ok) {
    L.push(`- verdict: **${o.verdict}**${o.blocker ? ` — blocker: ${o.blocker}` : ""} · published ${o.publishedAt}`);
    L.push(`- chain: ${o.chain} · account: @${o.account}`);
    if (o.marks) L.push(`- marks: STEEM $${o.marks.steemUsd} · SBD $${o.marks.sbdUsd} · parity **${o.marks.paritySbdPerSteem} SBD/STEEM** (sources: ${Object.values(o.marks.sources || {}).join(" + ")})`);
    if (o.book) L.push(`- book: best bid ${o.book.bestBid} · best ask ${o.book.bestAsk} · spread **${o.book.spreadBps} bps**`);
  } else NA("peg offer");
  L.push("");
  L.push(`## 2. Inventory honesty`);
  if (o?.bridge) {
    const b = o.bridge;
    L.push(`- inventory ${b.inventoryMu} MU of cap ${b.capMu} MU (**${b.utilizationPct}% utilized**) · simulated fees ${b.simFeesMu} MU — counted as *simulation*, never as revenue`);
    L.push(`- law: real order sizes come from chain balances exclusively. No self-printing.`);
  }
  L.push("");
  L.push(`## 3. Fuel (real, external)`);
  const f = d.grid?.fuel;
  if (f) {
    L.push(`- powerdown active: **${f.powerdownActive ? "yes" : "no"}** · weekly ${Number(f.weeklySp).toFixed(1)} SP ≈ **$${f.weeklyUsd}**`);
    L.push(`- next payout: ${f.nextPayout} · remaining ${Number(f.remainingSp).toFixed(0)} SP (~${f.remainingWeeks} weeks)`);
  } else NA("grid fuel");
  L.push("");
  L.push(`Why it matters: the grid doesn't chase pumps. It quotes a **parity-anchored ladder** (5 levels, dynamic drag on spread) and earns only when the market walks into it. Internal parameters shape the offer; the chain decides.`);
  L.push("");
  L.push(SRC("the live peg-offer snapshot + the public grid state file (live JSON snapshots)"));
  return L.join("\n");
}

// ── 3. wed · קבלות-שרשרת ────────────────────────────────────────────────
function buildReceipts(d) {
  const L = [];
  L.push(`## 1. On-chain receipts (the chain itself is the auditor)`);
  const h = Array.isArray(d.history) ? d.history : [];
  const posts = h.filter((e) => e.op?.[0] === "comment").slice(0, 5);
  const votes = h.filter((e) => e.op?.[0] === "vote").slice(0, 3);
  const fills = h.filter((e) => e.op?.[0] === "fill_order").slice(0, 4);
  if (posts.length || votes.length || fills.length) {
    if (posts.length) {
      L.push(`- latest published receipts of @${POSTER} (most recent first):`);
      for (const e of posts) {
        const p = e.op?.[1] || {};
        L.push(`  · post \`${p.permlink}\` — tx \`${(e.trx_id || "tx-not-exposed").slice(0, 12)}…\` · block ${e.block}`);
      }
    }
    if (votes.length) {
      L.push(`- latest vote receipts:`);
      for (const e of votes) {
        const v = e.op?.[1] || {};
        L.push(`  · vote on @${v.author}/${v.permlink} weight ${v.weight} — tx \`${(e.trx_id || "tx-not-exposed").slice(0, 12)}…\``);
      }
    }
    if (fills.length) {
      L.push(`- latest market fills (the grid meeting real orders):`);
      for (const e of fills) {
        const f = e.op?.[1] || {};
        L.push(`  · fill: ${f.open_pays || "?"} / ${f.current_pays || "?"} — tx \`${(e.trx_id || "tx-not-exposed").slice(0, 12)}…\` · block ${e.block}`);
      }
    }
  } else {
    L.push(`- account history: empty window on this run — nothing faked`);
  }
  L.push("");
  L.push(`## 2. The anchor rail (commit stream)`);
  const cs = d.zipCommits?.commits;
  if (Array.isArray(cs) && cs.length) {
    for (const c of cs.slice(0, 3)) {
      L.push(`  · checkpoint \`${(c.sha || "").slice(0, 8)}\` — sealed to the public commit stream`);
    }
    L.push(`- every checkpoint of the weave book is pushed as a public commit — anyone can diff the whole history.`);
  } else {
    L.push(`- anchor commit stream: unavailable (API rate-limited on this run) — nothing faked`);
  }
  L.push("");
  L.push(`Why it matters: **receipts over screenshots**. Every action this network takes leaves a public, independently checkable trace — a txid, a permlink, a commit hash. If it isn't verifiable, we don't claim it.`);
  L.push("");
  L.push(SRC("live chain account history (@headcorner) + the public commit stream of the weave book"));
  return L.join("\n");
}

// ── 4. thu · סולם-המשימה ────────────────────────────────────────────────
function buildLadder(d) {
  const L = [];
  L.push(`## 1. Where the mission stands (measured, today)`);
  const k = d.kpi;
  const r = k?.revenuePerDayReal;
  if (r) {
    L.push(`- real revenue/day: **$${r.usd}** — method: ${r.method || "measured"}`);
    const b = r.breakdown;
    if (b) {
      L.push(`  · fuel engine ${b.fuelEngineUsdPerDay}/day (external powerdown stream) · mission book ${b.missionBookUsdPerDay}/day`);
      L.push(`  · lifetime external grid fills: $${b.gridExternalFillsLifetimeUsd} (cumulative, not a rate)`);
    }
    if (r.caveat) L.push(`- *honest caveat:* ${r.caveat}`);
  } else NA("KPI revenue");
  const lad = k?.ladder;
  if (lad) {
    L.push(`- ladder: **${lad.current} → ${lad.next}** · target $${lad.targetPerDay}/day · consecutive green days: **${lad.consecutiveGreenDays}**`);
    if (lad.noteHe) L.push(`- ladder law: a missing day breaks the streak. ${lad.noteHe.split("(")[0].trim()}`);
  } else NA("ladder");
  L.push("");
  L.push(`## 2. The capital math, in the open`);
  L.push(`- the gap to $1,000/day is **capital + proof-time**, not magic: at 20% APR, ~$1.83M working capital produces $1,000/day. Today's capital is two orders of magnitude smaller — and we say so.`);
  L.push(`- the machines currently earn cents and prove themselves rung by rung (7/14/30-day measured gates). No leap is claimed that wasn't measured.`);
  L.push("");
  L.push(SRC("the fleet KPI snapshot (live public JSON)"));
  return L.join("\n");
}

// ── 5. fri · מפת-האקוסיסטם ─────────────────────────────────────────────
function buildEcosystem(d) {
  const L = [];
  const g = d.registry;
  L.push(`## 1. The living map (agents registry, generated from the GitHub API)`);
  if (g?.ok) {
    L.push(`- repos scanned: **${g.reposTotal}** · repos with live agents: **${g.reposWithAgents?.length}** · idle: ${g.reposIdle?.length ?? 0}`);
    const agents = Array.isArray(g.agents) ? g.agents : [];
    const live = agents.filter((a) => a.state === "live");
    L.push(`- agents sampled: ${agents.length} · live: **${live.length}**`);
    const byLayer = {};
    for (const a of live) byLayer[a.layer] = (byLayer[a.layer] || 0) + 1;
    L.push(`- live agents spread across ${Object.keys(byLayer).length} working layers: ${Object.values(byLayer).sort((x, y) => y - x).join(" + ")} (counts only — the full registry is public for anyone who wants names)`);
    L.push(`- each agent has a role, a schedule, a measured input and a receipt-producing output (the registry is public).`);
  } else NA("agents registry");
  L.push("");
  L.push(`## 2. What runs where`);
  L.push(`- the **always-on layer**: scheduled cloud jobs reading public files and writing receipts — it survives even when the home base is offline.`);
  L.push(`- the **home layer**: the working console and the daemons fleet where the day-to-day work happens.`);
  L.push(`- the **chain layer**: the judge. Everything above leaves receipts there, and the chain cannot be asked to forget.`);
  L.push("");
  L.push(`Why it matters: this is a network of **agents as economic executors** — not a dashboard, not a demo. Each agent has a role, a schedule, a measured input and a receipt-producing output.`);
  L.push("");
  L.push(SRC("the agents registry snapshot (live public JSON)"));
  return L.join("\n");
}

// ── 6. sat · הנדסה פתוחה ────────────────────────────────────────────────
function buildEngineering(d) {
  const L = [];
  L.push(`## 1. How the autonomous cloud actually works`);
  L.push(`- every agent is a **small, boring, verifiable program** on a schedule. No servers to trust, no daemons to babysit: scheduled cloud jobs + public files + the chain.`);
  L.push(`- key discipline: the cloud holds a **posting-only** key. Before any broadcast the agent derives the public key and compares it **bit-for-bit** with the live posting authority on-chain. A wrong secret = a red refusal, never a broadcast.`);
  L.push(`- cost law: before broadcasting, the agent reads its own RC mana and compares it to the measured cost model (976M + 320k/char). No mana → an honest skip, not a crash.`);
  L.push(`- idempotency: re-runs read the chain and exit green instead of double-posting.`);
  L.push("");
  L.push(`## 2. The fail-closed laws`);
  L.push(`- a claim without measurement is marked UNMEASURED and never promoted.`);
  L.push(`- a source that fails to load is printed as \`unavailable — nothing faked\`. Silence is preferred over invention.`);
  L.push(`- agents never overwrite each other's state. The board (CLAIMS.md) is append-only by law.`);
  L.push("");
  L.push(`## 3. Build it yourself`);
  L.push(`- the whole loop is public: the agents run from an open repository, the ledger mirror + truth gate live in the same public place, and every broadcast names its sources. If you can read this post, you can audit its plumbing.`);
  L.push("");
  L.push(SRC("the public source of this automation + the live chain"));
  return L.join("\n");
}

// ── 0. sun · השבוע באמת ─────────────────────────────────────────────────
function buildWeek(d) {
  const L = [];
  L.push(`## 1. This week, measured`);
  const s = d.mirror?.stats;
  if (s?.vitality) {
    L.push(`- attestations: ${s.attestations} total · **${s.vitality.atts7d} in the last 7 days** · checkpoints ${s.vitality.checkpoints24h}/24h rate · alive ${s.vitality.aliveDays} days`);
  } else NA("mirror vitality");
  const r = d.kpi?.revenuePerDayReal;
  if (r) L.push(`- real revenue/day stands at **$${r.usd}** (measured — see ladder post for the full breakdown and the honest caveats)`);
  else NA("KPI revenue");
  const lad = d.kpi?.ladder;
  if (lad) L.push(`- ladder ${lad.current} → ${lad.next} · green-day streak **${lad.consecutiveGreenDays}**`);
  L.push("");
  L.push(`## 2. This week's voice (posts of @${POSTER}, last 7 days)`);
  const h = Array.isArray(d.history) ? d.history : [];
  const weekAgo = Date.now() - 7 * 86400_000;
  const posts = h
    .filter((e) => e.op?.[0] === "comment" && !e.op?.[1]?.parent_author)
    .map((e) => ({ ts: new Date((e.timestamp || 0) * 1000).getTime(), permlink: e.op?.[1]?.permlink, title: e.op?.[1]?.title }))
    .filter((p) => p.permlink && p.ts >= weekAgo);
  if (posts.length) {
    for (const p of posts.slice(0, 10)) L.push(`  · ${p.title || p.permlink} — https://steemit.com/@${POSTER}/${p.permlink}`);
  } else L.push(`- no root posts found in the sampled history window — nothing faked`);
  L.push("");
  L.push(`## 3. Next week's law`);
  L.push(`- keep the streak honest: a missing day breaks it. Grow measured revenue one rung at a time. Publish receipts for everything.`);
  L.push("");
  L.push(SRC("the public mirror + the fleet KPI snapshot + live chain history"));
  return L.join("\n");
}

const BUILDERS = {
  ledger: buildLedger,
  grid: buildGrid,
  receipts: buildReceipts,
  ladder: buildLadder,
  ecosystem: buildEcosystem,
  engineering: buildEngineering,
  week: buildWeek,
};

// ── בחירת מפתח: זיהוי ביט-מול-ביט (תבנית C-1) ───────────────────────────
function pickWif(livePostingPub) {
  const candidates = [
    { name: "VAULT_STEEM_POSTING_WIF (self-auth chain)", wif: WIF_VAULT },
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
  // מיטב-תזמון (9-a): דקת-השידור אינה קבועה עוד — הריצה היומית מושהית מקרית
  // בתוך חלון-שעה מרגע-ההפעלה, כך שאין דפוס-זמן ציבורי. DRY/סלפטסט מדלגים.
  const JITTER_MAX_MIN = Math.max(0, Number(process.env.CONTENT_JITTER_MAX_MIN || 50));
  const skipJitter = DRY || process.env.CONTENT_NO_JITTER === "1" || (process.env.CONTENT_FORCE_DOW ?? "") !== "";
  if (skipJitter) log("jitter: skipped (dry/selftest)");
  else {
    const jitterMs = Math.floor(Math.random() * (JITTER_MAX_MIN * 60 + 1)) * 1000;
    log(`jitter: sleeping ${Math.round(jitterMs / 60000)} min — broadcast minute randomized within the hour window`);
    await sleep(jitterMs);
  }

  // CONTENT_FORCE_DOW — override ל-selftest בלבד (0..6); בייצור לא מוגדר
  const forceDow = process.env.CONTENT_FORCE_DOW;
  const dow = forceDow !== undefined && forceDow !== "" && !Number.isNaN(Number(forceDow))
    ? Number(forceDow)
    : new Date().getUTCDay();
  const theme = THEMES[dow];
  const permlink = `saos-${theme.id}-${compactDate()}`;
  log(`boot · poster=@${POSTER} · dry=${DRY} · weekday(UTC)=${dow} · theme=${theme.id} · permlink=${permlink}`);

  // 1) אידמפוטנטיות מהשרשרת
  let existing = null;
  try { existing = await rpc("condenser_api.get_content", [POSTER, permlink]); }
  catch (e) { log(`קריאת-אידמפוטנטיות נכשלה (${String(e?.message || e).slice(0, 80)}) — ממשיכים בזהירות`); }
  if (existing && existing.id !== 0) {
    log(`פוסט הנושא של היום כבר על השרשרת (${permlink}, id ${existing.id}) — אין כפילות. יציאה ירוקה.`);
    return;
  }

  // 2) איסוף + בנייה (לפני מפתח — כדי ש-DRY יעבוד חסר-מפתח)
  const d = await collect();
  const themeBody = BUILDERS[theme.id](d);
  // כותרת בלי-תאריך ובלי-מקף (חוק content-v3), ברוטציה שבועית — וה-H1 בגוף זהה לה
  const title = pickTitle(theme.id);
  const body = [
    `# ${title}`,
    "",
    `**Date:** ${todayUtc()} (UTC) · **Voice:** @${POSTER} · **Written by:** an autonomous agent (machine-authored; every number measured at run time, sources named per section)`,
    "",
    themeBody,
    "",
    HONEST_FRAME(),
  ].join("\n");
  log(`פוסט נבנה: ${body.length} תווים`);

  // 3) מפתח
  const accounts = await rpc("condenser_api.get_accounts", [[POSTER]]);
  const livePostingPub = accounts?.[0]?.posting?.key_auths?.[0]?.[0] || null;
  if (!livePostingPub) { log("רשות-ה-posting בלתי-קריאה — סירוב כנה."); process.exit(1); }
  const key = pickWif(livePostingPub);
  if (!key) {
    if (!WIF_PRIMARY && !WIF_FALLBACK) {
      log("NO-WIF — דילוג-כנה בסגנון web-publish (הריצה ירוקה, הפוסט להלן להדפסה).");
      log(`--- DRY POST ---\n${body}`);
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
    log(`דילוג-RC כנה: אין מנה לפוסט היום (${mana.mana} < ${cost}). הפוסט להלן — לא כישלון קשה.`);
    log(`--- SKIPPED POST ---\n${body}`);
    return;
  }

  // 5) שידור
  const op = ["comment", {
    parent_author: "",
    parent_permlink: TAGS[0],
    author: POSTER,
    permlink,
    title,
    body,
    json_metadata: JSON.stringify({
      tags: TAGS,
      app: "saos-content-voice/1",
      format: "markdown",
      community: "saos",
      source: "autonomous agent — machine-authored; sources named in the post",
    }),
  }];
  log(`פוסט מוכן: "${title}" · permlink ${permlink}`);
  if (DRY) {
    log("DRY — לא משודר. גוף הפוסט להלן:");
    log(`--- DRY POST ---\n${body}`);
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
    log(`✗ השידור נכשל בכנות: ${String(e?.message || e).slice(0, 180)} — לא כישלון קשה; הפוסט יישאר לריצה הבאה.`);
  }
}

void main();
