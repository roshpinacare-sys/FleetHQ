// keyverify2.mjs — round 2: correct graphene display + key_references + multi-node blurt
import * as crypto from "node:crypto";
import * as secp from "@noble/secp256k1";

const RAW_KEY = "P5KQGnQ3GWx7NPF9YSip2FBztEqYBnbsJyaFYWMQMCt6grcScU4G";
const ACCOUNT = "headcorner";
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
const payload = dec.slice(0, -4);
const priv = payload.slice(1);
const pub33 = Buffer.from(secp.getPublicKey(priv, true));
const ck = ripemd160(sha256(pub33)).slice(0, 4);
const pubB58 = b58encode(Buffer.concat([pub33, ck]));
const STM = "STM" + pubB58;
const BLT = "BLT" + pubB58;
console.log("derived STM form:", STM);
console.log("derived BLT form:", BLT);

async function rpc(url, method, params, t = 15000) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(t),
  });
  const txt = await r.text();
  try { const j = JSON.parse(txt); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 150)); return j.result; }
  catch (e) { if (e instanceof SyntaxError) throw new Error("nonjson:" + txt.slice(0, 80)); throw e; }
}
const STEEM = "https://api.steemit.com";
const BLURT_NODES = ["https://rpc.blurt.world", "https://blurt.blkctracker.com", "https://api.blurt.buzz", "https://blurt-rpc.saboin.com"];

// key references on steem
try {
  const refs = await rpc(STEEM, "condenser_api.get_key_references", [[STM]]);
  console.log("STEEM key_references(STM):", JSON.stringify(refs));
} catch (e) { console.log("STEEM key_references err:", e.message); }

// steem account authorities with correct compare
const sa = (await rpc(STEEM, "condenser_api.get_accounts", [[ACCOUNT]]))[0];
if (sa) {
  const m = {};
  for (const role of ["posting", "active", "owner"]) {
    const keys = (sa[role]?.key_auths ?? []).map((k) => k[0]);
    m[role] = keys.map((k) => (k === STM ? "MATCH" : k.slice(0, 8) + "…" + k.slice(-4)));
  }
  m.memo = sa.memo_key === STM ? "MATCH" : sa.memo_key.slice(0, 8) + "…" + sa.memo_key.slice(-4);
  console.log("STEEM headcorner authorities vs this key:", JSON.stringify(m));
}

// blurt: try each node
let blurtAcc = null, workingNode = null;
for (const n of BLURT_NODES) {
  try {
    const r = await rpc(n, "condenser_api.get_accounts", [[ACCOUNT]]);
    blurtAcc = r?.[0] ?? null; workingNode = n; break;
  } catch (e) { console.log("blurt node fail:", n, "->", e.message.slice(0, 100)); }
}
console.log("BLURT working node:", workingNode, "exists:", !!blurtAcc);
if (blurtAcc) {
  const m = {};
  for (const role of ["posting", "active", "owner"]) {
    const keys = (blurtAcc[role]?.key_auths ?? []).map((k) => k[0]);
    m[role] = keys.map((k) => (k === STM || k === BLT ? "MATCH" : k.slice(0, 8) + "…" + k.slice(-4)));
  }
  m.memo = blurtAcc.memo_key === STM || blurtAcc.memo_key === BLT ? "MATCH" : blurtAcc.memo_key.slice(0, 8) + "…";
  console.log("BLURT headcorner authorities vs this key:", JSON.stringify(m));
  try {
    const refs = await rpc(workingNode, "condenser_api.get_key_references", [[BLT]]);
    console.log("BLURT key_references(BLT):", JSON.stringify(refs));
  } catch (e) { console.log("BLURT key_references err:", e.message); }
}
