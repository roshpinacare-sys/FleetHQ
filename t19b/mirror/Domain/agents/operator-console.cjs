'use strict';
/**
 * operator-console.cjs — הצד-המקבל של פס-הפקודות-המפעיל (the missing half).
 * ═══════════════════════════════════════════════════════════════════════════
 * gate.html משדר כבר custom_json (id saos.weave.ops.v1, רשות-posting) — אף-צרכן
 * לא קיים היה (נמדד 2026-10-12: אפס-התאמות-בכל-האחוזה). המודול-הזה סוגר-את-הלולאה:
 *
 *   מפעיל (דפדפן, מפתח-מנהל-לא-עוזב-אותו) → שידור custom_json חתום → השרשרת-הציבורית
 *   → פעימה-זו קוראת את-ההיסטוריה → מאמתת-חתימה-עקיפה (op-קיים-בשרשרת = חתום-ע"י
 *   רשות-ה-posting-של-החשבון, אין-דרך-אחרת-שהוא-שם) → מאותו-רגע הפקודה היא דיבור-בעלים
 *   עם-provenance-קריפטוגרפי (txid) → נכתבת-לשרשרת-הנחיות-הבעלים (owner-directives) →
 *   המסילות-צורכות-כרגיל.
 *
 * אפס-סודות: המודול קורא-רק-נתונים-ציבוריים (RPC + קבצי-גיט). האימות-הוא-השרשרת-עצמה.
 * מיפוי-סמנטי: "open:X" → staged-open(lanes=X) · כל-השאר → owner-note.
 * selftest מקומי (בלי-רשת): בניית-שרשרת-זמנית + הוספה + אימות — שער-כניסה-fail-closed.
 */
const fs = require("fs");
const path = require("path");
const chain = require("./directivesChain.cjs");

const OP_ID = "saos.weave.ops.v1"; // זהה-ל-gate.html (הצד-השולח) — שינוי-צריך-שני-צדדים
// זהות-העוגן — זהות-ציבורית-מפורסמת (כמו ב-beacon/landing); המסלול-המנהלי-עצמו לא-נחשף-כאן
const ANCHOR = (process.env.OPERATOR_ANCHOR || "headcorner").trim();
const RPCS = ["https://api.steemit.com", "https://api.justyy.com"]; // 61bts dead (measured 2026-10-12: returns non-JSON error page)
const DIR = path.join(__dirname, "operator");
const CURSOR = path.join(DIR, "cursor.json");
const RECEIPT = path.join(DIR, "receipt.json");
const LOG = path.join(DIR, "log.jsonl");
const LOOKBACK_H = 48;

async function rpc(method, params) {
  let lastErr = null;
  for (const node of RPCS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(node, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "operator-console-receiver" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!res.ok) throw new Error("http " + res.status);
      const j = await res.json();
      if (j.error) throw new Error("rpc-error " + JSON.stringify(j.error).slice(0, 120));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  // rate-limits from datacenter IPs are transient — one slow backoff round before honest FAIL
  await new Promise((r) => setTimeout(r, 4000));
  for (const node of RPCS) {
    try {
      const ctrl = new AbortController();
      const tm = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(node, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "operator-console-receiver" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      if (!res.ok) throw new Error("http " + res.status);
      const j = await res.json();
      if (j.error) throw new Error("rpc-error " + JSON.stringify(j.error).slice(0, 120));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("all-rpc-nodes-failed");
}

function parseLanes(cmd) {
  const m = /#([a-z0-9-_,\s*]+)$/i.exec(cmd.trim());
  if (m) {
    const lanes = m[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (lanes.length) return lanes;
  }
  return ["general"];
}

function toEntry(payload, meta, i, prevHash) {
  const cmd = String(payload.cmd || "").trim().slice(0, 300);
  const openMatch = /^open:(.+)$/i.exec(cmd);
  const e = {
    i,
    at: meta.timestamp,
    type: openMatch ? "staged-open" : "owner-note",
    trace: meta.trx_id,
    source: "operator-console (on-chain custom_json, posting-auth)",
    lanes: openMatch ? openMatch[1].split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : parseLanes(cmd),
    note: cmd + (payload.note ? " — " + String(payload.note).slice(0, 180) : "") + ` [op ${meta.opIndex} · block ${meta.block}]`,
  };
  if (openMatch && !e.lanes.length) e.lanes = ["general"];
  e.hash = chain.entryHash(prevHash, e);
  return e;
}

async function selftest() {
  // בלי-רשת: שרשרת-זמנית genesis+1 → הוספה-דרך-toEntry → verifyChain ירוק → טמפרור-נתפס
  const tmp = fs.mkdtempSync("/tmp/opchain-");
  const f = path.join(tmp, "chain.jsonl");
  const g = { i: 0, at: "2026-01-01T00:00:00Z", type: "genesis", note: "SAOS-DIRECTIVES-CHAIN/1" };
  g.hash = chain.entryHash("", g);
  fs.writeFileSync(f, JSON.stringify(g) + "\n");
  const v1 = chain.verifyChain(f);
  if (!v1.ok) throw new Error("selftest: genesis chain fails: " + v1.reason);
  const e1 = toEntry({ cmd: "open:grid,general", ts: "t" }, { timestamp: "2026-01-01T01:00:00Z", trx_id: "abc123", opIndex: 7, block: 1 }, 1, g.hash);
  fs.appendFileSync(f, JSON.stringify(e1) + "\n");
  const v2 = chain.verifyChain(f);
  if (!v2.ok) throw new Error("selftest: staged-open append fails: " + v2.reason);
  if (e1.type !== "staged-open" || JSON.stringify(e1.lanes) !== '["grid","general"]') throw new Error("selftest: lane mapping wrong: " + JSON.stringify(e1.lanes));
  const e2 = toEntry({ cmd: "תדווחו על מצב הגריד #grid", ts: "t" }, { timestamp: "2026-01-01T02:00:00Z", trx_id: "def456", opIndex: 8, block: 2 }, 2, e1.hash);
  fs.appendFileSync(f, JSON.stringify(e2) + "\n");
  const v3 = chain.verifyChain(f);
  if (!v3.ok) throw new Error("selftest: owner-note append fails: " + v3.reason);
  if (JSON.stringify(e2.lanes) !== '["grid"]') throw new Error("selftest: #lane parse wrong");
  // טמפרור: שינוי-שורה-אמצעית → verify חייב-ליפול
  const lines = fs.readFileSync(f, "utf8").trim().split("\n");
  const mid = JSON.parse(lines[1]); mid.note = "TAMPERED";
  lines[1] = JSON.stringify(mid);
  fs.writeFileSync(f, lines.join("\n") + "\n");
  const v4 = chain.verifyChain(f);
  if (v4.ok) throw new Error("selftest: tamper NOT caught");
  fs.rmSync(tmp, { recursive: true, force: true });
}

async function main() {
  const arg = process.argv[2] || "";
  if (arg === "selftest") { await selftest(); console.log("SELFTEST PASS (chain-format, lane-mapping, tamper-evident)"); return; }
  await selftest(); // שער-כניסה-תמיד

  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(path.dirname(chain.CHAIN_FILE), { recursive: true });
  const v = chain.verifyChain();
  if (!v.ok) throw new Error("chain corrupt before append: " + v.reason + " @ " + v.breakAt);
  const knownTraces = new Set(v.entries.map((e) => e.trace).filter(Boolean));
  let cursor = { lastIndex: 0, lastTs: null, at: null };
  try { cursor = JSON.parse(fs.readFileSync(CURSOR, "utf8")); } catch (_) { /* first run */ }

  const hist = await rpc("condenser_api.get_account_history", [ANCHOR, -1, 100]); // node cap measured: limit>~100 silently returns 0 entries
  const entries = (hist || []).map((h) => ({ opIndex: h[0], ev: h[1] }));
  entries.sort((a, b) => a.opIndex - b.opIndex);
  const cutoff = Date.now() - LOOKBACK_H * 3600 * 1000;
  const candidates = entries.filter(({ opIndex, ev }) => {
    if (!ev || ev.op === undefined) return false;
    const op = ev.op;
    if (!Array.isArray(op) || op[0] !== "custom_json") return false;
    const body = op[1] || {};
    if (body.id !== OP_ID) return false;
    if (!(body.required_posting_auths || []).includes(ANCHOR)) return false;
    if (opIndex <= (cursor.lastIndex || 0)) return false;
    const ts = Date.parse((ev.timestamp || "").replace(" ", "T") + "Z");
    if (Number.isFinite(ts) && ts < cutoff) return false;
    return true;
  });

  let appended = [];
  let chainRaw = fs.readFileSync(chain.CHAIN_FILE, "utf8");
  let prevHash = v.entries[v.entries.length - 1].hash;
  let nextI = v.entries.length;
  for (const { opIndex, ev } of candidates) {
    let payload;
    try { payload = JSON.parse(ev.op[1].json || "{}"); } catch (_) { continue; }
    if (payload.v !== 1 || !String(payload.cmd || "").trim()) continue;
    if (knownTraces.has(ev.trx_id)) continue; // כבר-בשרשרת (idempotency)
    const e = toEntry(payload, { timestamp: ev.timestamp, trx_id: ev.trx_id, opIndex, block: ev.block }, nextI, prevHash);
    const nextRaw = chainRaw + JSON.stringify(e) + "\n";
    fs.writeFileSync(chain.CHAIN_FILE, nextRaw);
    const vv = chain.verifyChain();
    if (!vv.ok) { fs.writeFileSync(chain.CHAIN_FILE, chainRaw); throw new Error("post-append verify failed — reverted: " + vv.reason); }
    chainRaw = nextRaw; prevHash = e.hash; nextI = e.i + 1; knownTraces.add(ev.trx_id);
    appended.push({ i: e.i, type: e.type, lanes: e.lanes, txid: e.trace, cmd: String(payload.cmd).slice(0, 120) });
    console.log("directive appended: i=" + e.i + " type=" + e.type + " lanes=" + JSON.stringify(e.lanes) + " txid=" + e.trace);
  }

  const last = entries[entries.length - 1];
  const newCursor = { lastIndex: last ? last.opIndex : (cursor.lastIndex || 0), lastTs: last ? last.ev.timestamp : null, at: new Date().toISOString() };
  fs.writeFileSync(CURSOR, JSON.stringify(newCursor, null, 2) + "\n");
  const receipt = {
    at: new Date().toISOString(),
    overall: "PASS",
    anchor: "(on-chain posting authority)",
    opId: OP_ID,
    scanned: entries.length,
    appended: appended.length,
    directives: appended,
    cursor: newCursor,
    chainLength: nextI,
  };
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  fs.appendFileSync(LOG, JSON.stringify({ at: receipt.at, overall: "PASS", scanned: receipt.scanned, appended: receipt.appended }) + "\n");
  console.log("RECEIPT PASS · scanned=" + receipt.scanned + " appended=" + receipt.appended);
}

main().then(() => process.exit(0)).catch((e) => {
  const msg = String((e && e.message) || e).slice(0, 300);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(RECEIPT, JSON.stringify({ at: new Date().toISOString(), overall: "FAIL", reason: msg }, null, 2) + "\n");
    fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), overall: "FAIL", reason: msg }) + "\n");
  } catch (_) {}
  console.error("operator-console FAIL — " + msg);
  process.exit(1);
});
