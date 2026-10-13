// keyverify.mjs — verify the owner-attached key (headcorner.txt) against live STEEM + BLURT authorities.
// Memory-safe: never prints the WIF; only fingerprints + booleans.
import * as crypto from "node:crypto";
import * as secp from "@noble/secp256k1";

const RAW_KEY = "P5KQGnQ3GWx7NPF9YSip2FBztEqYBnbsJyaFYWMQMCt6grcScU4G"; // from upload/headcorner.txt
const ACCOUNT = "headcorner";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("bad-b58-char:" + c);
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16).padStart(2, "0");
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex");
  let pad = 0;
  for (const c of s) { if (c === "1") pad++; else break; }
  return Buffer.concat([Buffer.alloc(pad), buf]);
}
function b58encode(buf) {
  let n = 0n;
  for (const x of buf) n = n * 256n + BigInt(x);
  let s = "";
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x === 0) s = "1" + s; else break; }
  return s;
}
function ripemd160(b) { return crypto.createHash("ripemd160").update(b).digest(); }
function sha256(b) { return crypto.createHash("sha256").update(b).digest(); }

// --- Step 1: WIF normalize + checksum verify ---
let wif = RAW_KEY.trim();
let hadPrefix = false;
if (wif.startsWith("P") && wif.length === 52) { wif = wif.slice(1); hadPrefix = true; }
const dec = b58decode(wif);
const payload = dec.slice(0, dec.length - 4);
const checksum = dec.slice(dec.length - 4);
const calc = sha256(sha256(payload)).slice(0, 4);
const wifValid = calc.equals(checksum);
const version = payload[0];
const priv = payload.slice(1);
console.log(JSON.stringify({
  keyInputLen: RAW_KEY.length, hadPrefix, wifValid,
  versionByteHex: version.toString(16), privLen: priv.length,
  fingerprint: "P" + wif.slice(0, 4) + "…" + wif.slice(-4),
}, null, 1));
if (!wifValid) { console.log("VERDICT: WIF-CHECKSUM-INVALID"); process.exit(0); }

// --- Step 2: derive compressed pubkey + graphene display form for both prefixes ---
const pub33 = Buffer.from(secp.getPublicKey(priv, true));
function graphenePub(pub33, prefix) {
  const pre = Buffer.concat([pub33, ripemd160(sha256(pub33)).slice(0, 4)]);
  const chainPre = ripemd160(sha256(Buffer.from(prefix))).slice(0, 4);
  return b58encode(Buffer.concat([chainPre, pre]));
}
const stmPub = graphenePub(pub33, "STM");
const bltPub = graphenePub(pub33, "BLT");
console.log("derived STM:", stmPub);
console.log("derived BLT:", bltPub);

// --- Step 3: query both chains for the account ---
async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(url + " " + JSON.stringify(j.error).slice(0, 200));
  return j.result;
}
const STEEM = "https://api.steemit.com";
const BLURT = "https://blurt-rpc.saboin.com";
let steemAcc = null, blurtAcc = null, errs = [];
try { const r = await rpc(STEEM, "condenser_api.get_accounts", [[ACCOUNT]]); steemAcc = r[0] ?? null; } catch (e) { errs.push("steem:" + e.message); }
try { const r = await rpc(BLURT, "condenser_api.get_accounts", [[ACCOUNT]]); blurtAcc = r[0] ?? null; } catch (e) { errs.push("blurt:" + e.message); }

const roles = ["posting", "active", "owner", "memo"];
function judge(label, acc) {
  if (!acc) return { label, exists: false };
  const out = { label, exists: true, created: acc.created, sp: acc.vesting_shares, matches: {} };
  for (const role of roles) {
    if (role === "memo") out.matches[role] = acc.memo_key === stmPub ? "STM" : acc.memo_key === bltPub ? "BLT" : false;
    else {
      const keys = (acc[role]?.key_auths ?? []).map((k) => k[0]);
      out.matches[role] = keys.includes(stmPub) ? "STM" : keys.includes(bltPub) ? "BLT" : false;
    }
  }
  out.jsonMetaSample = (acc.json_metadata || "").slice(0, 120);
  return out;
}
console.log("STEEM:", JSON.stringify(judge("steem", steemAcc), null, 1));
console.log("BLURT:", JSON.stringify(judge("blurt", blurtAcc), null, 1));
if (errs.length) console.log("RPC-ERRORS:", errs.join(" | "));
