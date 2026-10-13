/**
 * keys-census — THE one-shot key truth tool. Owner law: "אני לא רוצה לשמוע על זה יותר".
 *
 * WHY: rounds burned on key archaeology because material arrives in many formats
 * (uncompressed WIF 37B, compressed WIF 38B, P-prefixed WIF, password-derivation)
 * and files arrive MISLABELED ("בלורט.evm" was actually HEAD_CORNER_MASTER).
 * This tool measures EVERYTHING in one pass and writes a receipt. Zero secret
 * material in output or receipt — fingerprints and labels only.
 *
 * What it proves (fail-loud):
 *  1. Every decodable secret on this machine → which live account/role it controls (STEEM+HIVE).
 *  2. HEAD_CORNER_MASTER → sha256(name+role+pass) derivation vs live headcorner authorities (steemit.com login proof).
 *  3. Gate credential → salt+sha256 match vs /home/z/.operator/config.json (operator gate proof).
 *
 * Run:  bun /home/z/estate/Domain/agents/keys-census.mjs   (exit 0 always, verdict inside)
 */
import { readFileSync, readdirSync, mkdirSync, appendFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { createECDH } from "crypto";

// ---------- tiny base58 (no deps) ----------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let num = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("char"); num = num * 58n + BigInt(i); }
  let hex = num.toString(16); if (hex.length % 2) hex = "0" + hex;
  let bytes = Buffer.from(hex, "hex");
  let zeros = 0; for (const c of s) { if (c === "1") zeros++; else break; }
  return Buffer.concat([Buffer.alloc(zeros), bytes]);
}
function b58encode(buf) {
  let num = BigInt("0x" + buf.toString("hex"));
  let out = "";
  while (num > 0n) { out = B58[Number(num % 58n)] + out; num /= 58n; }
  for (const b of buf) { if (b === 0) out = "1" + out; else break; }
  return out;
}
const sha256b = (b) => createHash("sha256").update(b).digest();
const fp = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// ---------- pubkey derivation (noble via known-good estate install) ----------
let _secp = null;
for (const p of ["@noble/secp256k1", "file:///home/z/estate/steem/mini-services/saos-engine/node_modules/@noble/secp256k1/index.js"]) {
  try { _secp = await import(p); break; } catch {}
}
if (!_secp) { console.log("FATAL: no secp256k1 library available — install @noble/secp256k1"); process.exit(0); }
function stp(sec) { // compressed 33-byte pubkey
  return new Uint8Array(_secp.getPublicKey(Buffer.from(sec), true));
}
function chainPub(sec, prefix = "STM") {
  const pub = stp(sec);
  const chk = createHash("ripemd160").update(Buffer.from(pub)).digest().slice(0, 4);
  return prefix + b58encode(Buffer.concat([Buffer.from(pub), chk]));
}

// ---------- universal WIF decode (37B uncompressed + 38B compressed + P-prefix) ----------
function decodeAny(t) {
  const clean = t.trim();
  const body = clean.startsWith("P") && clean.length >= 51 ? clean.slice(1) : clean;
  if (!/^[15HJKNL][1-9A-HJ-NP-Za-km-z]{48,52}$/.test(body)) return null;
  let raw; try { raw = b58decode(body); } catch { return null; }
  if ((raw.length !== 37 && raw.length !== 38) || raw[0] !== 0x80) return null;
  const payload = raw.slice(0, raw.length - 4);
  if (!sha256b(sha256b(payload)).slice(0, 4).equals(raw.slice(raw.length - 4))) return null;
  return raw.slice(1, 33);
}

// ---------- chain RPC ----------
async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "user-agent": "keys-census" }, body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 60));
  return j.result;
}

// ---------- collect secrets (labels only; bytes stay in memory) ----------
const secrets = []; // {label, sec}
const rawCreds = []; // {label, val} — candidate passwords/tokens
const addFile = (label, txt) => {
  for (const tok of txt.split(/[^1-9A-HJ-NP-Za-km-z]+/)) {
    if (tok.length < 48 || tok.length > 55) continue;
    const sec = decodeAny(tok);
    if (sec) secrets.push({ label: label + ":wif", sec });
  }
};
const KEYS_DIR = "/home/z/.secrets/keys";
for (const f of existsSync(KEYS_DIR) ? readdirSync(KEYS_DIR) : []) {
  try { const txt = readFileSync(KEYS_DIR + "/" + f, "utf8"); addFile("file:" + f, txt); const t = txt.trim(); if (t && t.length <= 120 && !t.includes("\n")) rawCreds.push({ label: "file:" + f, val: t }); } catch {}
}
// vault walk
const VAULT = "/home/z/.secrets/vault-unsealed/agent/keys/vault.json";
let vaultAccounts = [];
try {
  const v = JSON.parse(readFileSync(VAULT, "utf8"));
  const walk = (o, p) => {
    if (typeof o === "string") {
      const sec = decodeAny(o);
      if (sec) secrets.push({ label: "vault:" + p, sec });
      else if (o.trim().length >= 8 && o.trim().length <= 120) rawCreds.push({ label: "vault:" + p, val: o.trim() });
    } else if (Array.isArray(o)) o.forEach((x, i) => walk(x, p + "[" + i + "]"));
    else if (o && typeof o === "object") for (const k of Object.keys(o)) walk(o[k], p ? p + "." + k : k);
  };
  walk(v, "");
  vaultAccounts = (v.accounts || []).map(a => a.username || a.name || "?");
} catch (e) { console.log("vault: UNREADABLE (" + e.message.slice(0, 40) + ")"); }
// .env.local scalar values
try {
  for (const ln of readFileSync("/home/z/estate/.env.local", "utf8").split(/\r?\n/)) {
    const m = ln.match(/^([A-Za-z_0-9]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].trim().replace(/^["']|["']$/, "");
    const sec = decodeAny(val);
    if (sec) secrets.push({ label: "env:" + m[1], sec });
    else if (val && val.length <= 120) rawCreds.push({ label: "env:" + m[1], val });
  }
} catch {}

// ---------- live authorities ----------
const CANDS = [...new Set(["headcorner", "hcsoldier", "hcsoldier1", "hcsoldier2", "hcsoldier3", "hcsoldier4", "hcsoldier5", "hcsoldier6", "cashmachine", "cornerstone", ...vaultAccounts.map(a => a.toLowerCase()).filter(a => /^[a-z0-9-]{3,20}$/.test(a))])];
const RPCS = { STEEM: "https://api.steemit.com", HIVE: "https://api.hive.blog" };
const live = {};
for (const [ch, url] of Object.entries(RPCS)) {
  live[ch] = {};
  try {
    const accs = await rpc(url, "condenser_api.get_accounts", [CANDS]);
    for (const a of accs.filter(Boolean)) live[ch][a.name] = {
      posting: a.posting.key_auths.map(k => k[0]), active: a.active.key_auths.map(k => k[0]),
      owner: a.owner.key_auths.map(k => k[0]), memo: [a.memo_key],
    };
  } catch (e) { console.log(ch + " RPC-ERR " + e.message.slice(0, 40)); }
}

// ---------- 1) held keys vs chain ----------
console.log("=== KEYS-CENSUS " + new Date().toISOString() + " ===");
console.log(`secrets decoded: ${secrets.length} | raw credential candidates: ${rawCreds.length} | vault accounts: ${vaultAccounts.length}`);
const matchLines = [];
for (const s of secrets) {
  const pub = chainPub(s.sec);
  const hits = [];
  for (const ch of Object.keys(live)) for (const acct of Object.keys(live[ch])) for (const role of Object.keys(live[ch][acct]))
    if (live[ch][acct][role].includes(pub)) hits.push(`${ch}:${acct}:${role}`);
  if (hits.length) matchLines.push(`${s.label} pub:${pub.slice(0, 12)}… → ${hits.join(", ")}`);
}
console.log(matchLines.length ? "HELD AUTHORITY:\n  " + matchLines.join("\n  ") : "HELD AUTHORITY: none of the decoded keys control any live account");

// ---------- 2) steemit login proof (HEAD_CORNER_MASTER law) ----------
const loginProofs = [];
for (const c of rawCreds) {
  for (const ch of Object.keys(live)) {
    if (!live[ch].headcorner) continue;
    const matched = [];
    for (const role of ["posting", "active", "owner", "memo"]) {
      const seed = sha256b(Buffer.from("headcorner" + role + c.val));
      if (live[ch].headcorner[role].includes(chainPub(seed))) matched.push(role);
    }
    if (matched.length) loginProofs.push(`STEEMIT-LOGIN ${c.label} → ${ch}:headcorner ${matched.join(",")} (law: sha256(name+role+password))`);
  }
}
console.log(loginProofs.length ? loginProofs.join("\n") : "STEEMIT-LOGIN: no candidate derives headcorner's live authorities");

// ---------- 3) operator gate proof ----------
let gateProof = "GATE: config missing";
try {
  const cfg = JSON.parse(readFileSync("/home/z/.operator/config.json", "utf8"));
  for (const c of rawCreds) {
    if (createHash("sha256").update(cfg.salt + c.val).digest("hex") === cfg.hash) {
      gateProof = `GATE ${c.label} → salted-sha256 MATCH (operator gate credential)`;
    }
  }
} catch {}
console.log(gateProof);

// ---------- receipt (no secret material) ----------
const receipt = {
  at: new Date().toISOString(),
  decodedSecrets: secrets.length,
  vaultAccounts,
  heldAuthority: matchLines,
  steemitLogin: loginProofs,
  gate: gateProof,
  chainsScanned: Object.fromEntries(Object.entries(live).map(([ch, m]) => [ch, Object.keys(m)])),
  note: "fingerprints/labels only — zero secret material, by owner law",
};
try {
  mkdirSync("/home/z/estate/Domain/agents/receipts", { recursive: true });
  const out = "/home/z/estate/Domain/agents/receipts/keys-census-" + new Date().toISOString().slice(0, 10) + ".json";
  const { writeFileSync } = await import("fs");
  writeFileSync(out, JSON.stringify(receipt, null, 2));
  console.log("receipt → " + out);
} catch {}
console.log("VERDICT: " + (matchLines.length || loginProofs.length ? "KEYS OPERATIONAL" : "NO OPERATIONAL KEYS — fail-loud"));
