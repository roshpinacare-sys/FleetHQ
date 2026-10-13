// keyverify4.mjs — definitive: which fleet account does the owner-attached key open? + headcorner recent ops
import * as crypto from "node:crypto";
import * as secp from "@noble/secp256k1";
import * as fs from "node:fs";

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
const STM = "STM" + pubB58;
console.log("target pubkey:", STM, "len:", STM.length);

// collect candidate accounts from fleet files
const names = new Set(["headcorner"]);
function harvest(node, prefix) {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "account" || k === "author" || k === "account_name") && typeof v === "string" && /^[a-z0-9\-\.]{3,16}$/.test(v)) names.add(v);
      harvest(v, prefix);
    }
  } else if (Array.isArray(node)) node.forEach((x) => harvest(x, prefix));
}
for (const f of ["tmp/t8/army-custody.json", "tmp/t8/social-sent.jsonl", "tmp/t8/content-ops.json", "tmp/t11/recon-summary.json", "tmp/t11/headcorner-ops-today.json", "tmp/t8/blurt-jobs.json", "tmp/t8/delegation-last.json"]) {
  try {
    const p = "/home/z/my-project/" + f;
    if (!fs.existsSync(p)) continue;
    if (f.endsWith(".jsonl")) { for (const line of fs.readFileSync(p, "utf8").split("\n").filter(Boolean)) harvest(JSON.parse(line), f); }
    else harvest(JSON.parse(fs.readFileSync(p, "utf8")), f);
  } catch { }
}
// also known gen names pattern
["cashmachine", "cornerstone", "tamar", "sovereign"].forEach((x) => names.add(x));
console.log("candidate accounts:", [...names].join(", "));

async function rpc(url, method, params, t = 20000) {
  const r = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(t),
  });
  const txt = await r.text();
  try { const j = JSON.parse(txt); if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 100)); return j.result; }
  catch (e) { if (e instanceof SyntaxError) throw new Error("nonjson"); throw e; }
}
const NODES = ["https://api.justyy.com", "https://api.steemit.com"];
let accs = [];
for (const n of NODES) {
  try { accs = await rpc(n, "condenser_api.get_accounts", [[...names]]); break; } catch (e) { console.log("get_accounts fail", n); }
}
console.log("accounts fetched:", accs.length);
let opened = [];
for (const a of accs) {
  const hit = [];
  for (const role of ["posting", "active", "owner"]) {
    for (const [k] of a[role]?.key_auths ?? []) if (k === STM) hit.push(role);
  }
  if (a.memo_key === STM) hit.push("memo");
  if (hit.length) opened.push({ account: a.name, roles: hit, created: a.created });
  // also record headcorner authorities in full for length sanity
  if (a.name === "headcorner") {
    console.log("headcorner on-chain keys:", JSON.stringify({
      posting: (a.posting?.key_auths ?? []).map((x) => x[0]),
      active: (a.active?.key_auths ?? []).map((x) => x[0]),
      owner: (a.owner?.key_auths ?? []).map((x) => x[0]),
      memo: a.memo_key,
      postingThreshold: a.posting?.weight_threshold,
    }));
  }
}
console.log("KEY-OPENS:", JSON.stringify(opened));

// headcorner last 100 ops
try {
  const hist = await rpc("https://api.justyy.com", "condenser_api.get_account_history", ["headcorner", -1, 100]);
  const kinds = {};
  for (const [, op] of hist) kinds[op.op[0]] = (kinds[op.op[0]] || 0) + 1;
  console.log("headcorner last100 op kinds:", JSON.stringify(kinds));
  for (const [idx, op] of hist.slice(-8)) console.log(`  ${op.timestamp.slice(5, 16)} ${op.op[0]}`);
  const ups = hist.filter(([, op]) => op.op[0] === "account_update" || op.op[0] === "account_update2");
  for (const [idx, op] of ups) console.log("AUTH-OP:", idx, op.timestamp, JSON.stringify(op.op[1]).slice(0, 250));
} catch (e) { console.log("hist err:", e.message); }
