// keyverify3.mjs — which account does this key open? was headcorner rotated recently? blurt node sweep.
import * as crypto from "node:crypto";
import * as secp from "@noble/secp256k1";

const RAW_KEY = "P5KQGnQ3GWx7NPF9YSip2FBztEqYBnbsJyaFYWMQMCt6grcScU4G";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad-b58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16).padStart(2, "0"); if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex"); let pad = 0;
  for (const c of s) { if (c === "1") pad++; else break; }
  return Buffer.concat([Buffer.alloc(pad), buf]);
}
function b58encode(buf) {
  let n = 0n; for (const x of buf) n = n * 256n + BigInt(x);
  let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x === 0) s = "1" + s; else break; }
  return s;
}
const ripemd160 = (b) => crypto.createHash("ripemd160").update(b).digest();
const sha256 = (b) => crypto.createHash("sha256").update(b).digest();

let wif = RAW_KEY.trim();
if (wif.startsWith("P") && wif.length === 52) wif = wif.slice(1);
const dec = b58decode(wif);
const priv = dec.slice(1, -4);
const pub33 = Buffer.from(secp.getPublicKey(priv, true));
const ck = ripemd160(sha256(pub33)).slice(0, 4);
const pubB58 = b58encode(Buffer.concat([pub33, ck]));
const STM = "STM" + pubB58, BLT = "BLT" + pubB58;

async function rpc(url, method, params, t = 20000) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(t),
  });
  const txt = await r.text();
  try { const j = JSON.parse(txt); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 120)); return j.result; }
  catch (e) { if (e instanceof SyntaxError) throw new Error("nonjson:" + txt.slice(0, 60)); throw e; }
}

// 1) key references across alternate steem nodes (both call shapes)
const STEEM_NODES = ["https://api.justyy.com", "https://api.steemit.com", "https://api.poa.steem-world.com", "https://steemapi.boylikegirl.club"];
for (const n of STEEM_NODES) {
  for (const [method, params] of [["condenser_api.get_key_references", [[STM]]], ["condenser_api.get_key_references", [[STM, BLT]]]]) {
    try {
      const refs = await rpc(n, method, params);
      console.log("KEY-REFS OK", n, method, JSON.stringify(refs).slice(0, 400));
    } catch (e) { /* silent */ }
  }
}

// 2) headcorner account history: any account_update ops in last 30 days?
const STEEM = "https://api.justyy.com";
try {
  let hist = await rpc(STEEM, "condenser_api.get_account_history", ["headcorner", -1, 500]);
  const updates = hist.filter(([, op]) => ["account_update", "account_update2", "create_claimed_account", "account_create"].includes(op.op[0]));
  console.log("headcorner history ops scanned:", hist.length, "authority ops:", updates.length);
  for (const [idx, op] of updates.slice(-10)) {
    console.log(`  [${idx}] ${op.timestamp} ${op.op[0]}:`, JSON.stringify(op.op[1]).slice(0, 300));
  }
  // recent ops summary (what the account did last)
  const recent = hist.slice(-12).map(([idx, op]) => `${op.timestamp.slice(5, 16)} ${op.op[0]}`);
  console.log("recent ops:", JSON.stringify(recent, null, 0));
} catch (e) { console.log("history err:", e.message); }

// 3) blurt node sweep (wider list, incl. latam)
const BLURT_NODES = ["https://rpc.blurt.world", "https://blurt.blkctracker.com", "https://api.blurt.buzz", "https://blurt-rpc.saboin.com", "https://blurtlatam.intinte.org", "https://rpc.blurtlatam.intinte.org", "https://blurt-rpc.latamgirl.xyz", "https://rpc.blurtcluster.com"];
for (const n of BLURT_NODES) {
  try {
    const r = await rpc(n, "condenser_api.get_accounts", [["headcorner"]], 12000);
    const a = r?.[0];
    if (a) {
      const m = {};
      for (const role of ["posting", "active", "owner"]) {
        m[role] = (a[role]?.key_auths ?? []).map((k) => k[0]).map((k) => (k === STM || k === BLT) ? "MATCH" : k.slice(0, 8) + "…" + k.slice(-4));
      }
      m.memo = (a.memo_key === STM || a.memo_key === BLT) ? "MATCH" : a.memo_key.slice(0, 8) + "…";
      console.log("BLURT OK", n, "created:", a.created, JSON.stringify(m));
    }
  } catch (e) { console.log("blurt fail:", n, "->", e.message.slice(0, 80)); }
}
