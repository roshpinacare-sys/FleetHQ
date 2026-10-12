#!/usr/bin/env node
// blurt-connector — P0-5 (master plan T7, 2026-10-11)
// One-shot revival rail for the 12 pre-fork BLURT bodies already under custody.
// Modes:
//   health  — probe every node in blurt-nodes.json, report liveness+latency (no keys)
//   dry     — key-fit (WIF→derived pubkey ≡ chain posting authority) + BYTE-LAW:
//             our tx serialization must equal condenser_api.get_transaction_hex
//             from the node. NO broadcast. Cryptographic proof without spending.
//   post    — dry checks + broadcast. Refuses unless CI_BLURT_ENABLED === "true"
//             (owner DecisionQueue law: GEN-2 rotation first, then flip).
// Secrets: CI_BLURT_POSTING_WIF (preferred) or CI_ADOPT_WIF_POSTING fallback.
// Prints a receipt JSON to stdout. Exit 0 = mode succeeded.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const secp = require("@noble/secp256k1");
const { sha256 } = require("@noble/hashes/sha256");

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(s) {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16).padStart(2, "0");
  if (hex.length % 2) hex = "0" + hex;
  let bytes = Buffer.from(hex, "hex");
  for (const c of s) { if (c === "1") bytes = Buffer.concat([Buffer.from([0]), bytes]); else break; }
  return bytes;
}
function b58checkDecode(s) {
  const raw = b58decode(s);
  const body = raw.subarray(0, raw.length - 4);
  const checksum = raw.subarray(raw.length - 4);
  const h = Buffer.from(sha256(sha256(body))).subarray(0, 4);
  if (!h.equals(checksum)) throw new Error("base58 checksum mismatch");
  return body;
}
function b58checkEncode(bytes) {
  const h = Buffer.from(sha256(sha256(bytes))).subarray(0, 4);
  const all = Buffer.concat([bytes, h]);
  let n = BigInt("0x" + all.toString("hex"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of all) { if (b === 0) out = "1" + out; else break; }
  return out;
}
// steem-family pubkey string = PREFIX + base58check(pubkeyBytes)
function pubString(prefix, bytes) { return prefix + b58checkEncode(bytes); }
function pubBody(pubStr) { return pubStr.replace(/^[A-Z]+/, ""); }

async function rpc(url, method, params, ms = 6000) {
  const r = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(ms),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result;
}

// ── minimal binary serializer (steem-family pre-fork layout) ─────────────
function varint(n) { const out = []; let v = n >>> 0; do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; out.push(b); } while (v); return Buffer.from(out); }
function serString(s) { const b = Buffer.from(s, "utf8"); return Buffer.concat([varint(b.length), b]); }
function serU16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n & 0xffff); return b; }
function serU32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
function serI32(n) { const b = Buffer.alloc(4); b.writeInt32LE(n | 0); return b; }
function serOp(op) {
  const [id, body] = op;
  if (id === 0) { // vote
    return Buffer.concat([serU32(0), serString(body.voter), serString(body.author), serString(body.permlink), serI32(body.weight)]);
  }
  throw new Error("serializer: unsupported op " + id);
}
function serTx(tx) {
  return Buffer.concat([serU16(tx.ref_block_num), serU32(tx.ref_block_prefix), serU32(tx.expiration),
    varint(tx.operations.length), ...tx.operations.map(serOp), varint(0)]);
}

async function main() {
  const mode = process.argv[2] || "health";
  const nodesCfg = JSON.parse(readFileSync(new URL("../blurt-nodes.json", import.meta.url), "utf8"));
  const PREFIX = nodesCfg.addressPrefix || "BLT";
  const receipt = { mode, at: new Date().toISOString(), nodes: [], verdict: "unknown" };

  // 1) health
  for (const url of nodesCfg.nodes) {
    const t0 = Date.now();
    try { const g = await rpc(url, "condenser_api.get_dynamic_global_properties", [], 5000); receipt.nodes.push({ url, live: true, ms: Date.now() - t0, head: g.head_block_number }); }
    catch (e) { receipt.nodes.push({ url, live: false, ms: Date.now() - t0, err: String(e).slice(0, 60) }); }
  }
  const live = receipt.nodes.filter((n) => n.live).sort((a, b) => a.ms - b.ms);
  if (!live.length) { receipt.verdict = "NO-LIVE-NODE"; console.log(JSON.stringify(receipt, null, 2)); process.exit(1); }
  const node = live[0].url;
  receipt.primaryNode = node;

  if (mode === "health") { receipt.verdict = `HEALTH-OK live=${live.length}/${receipt.nodes.length}`; console.log(JSON.stringify(receipt, null, 2)); return; }

  // 2) key-fit — derived pubkey must equal the chain's posting authority
  const wif = (process.env.CI_BLURT_POSTING_WIF || process.env.CI_ADOPT_WIF_POSTING || "").trim();
  if (!wif) { receipt.verdict = "DRY-REFUSED-NO-WIF (fail-closed by law)"; console.log(JSON.stringify(receipt, null, 2)); process.exit(1); }
  const account = (process.env.BLURT_ACCOUNT || "headcorner").trim();
  const chainIdHex = await rpc(node, "condenser_api.get_chain_id", []);
  const [acct] = await rpc(node, "condenser_api.get_accounts", [[account]]);
  if (!acct) { receipt.verdict = "ACCOUNT-ABSENT-ON-BLURT"; console.log(JSON.stringify(receipt, null, 2)); process.exit(1); }
  const expectedPub = acct.posting.key_auths[0][0];

  const privRaw = b58checkDecode(wif).subarray(1, 33); // strip 0x80 + checksum
  const pubBytes = Buffer.from(secp.getPublicKey(privRaw, true));
  const derived = pubString(PREFIX, pubBytes);
  receipt.keyFit = {
    account, chainId: chainIdHex,
    derivedBody: pubBody(derived),
    expectedBody: pubBody(expectedPub),
    match: pubBody(derived) === pubBody(expectedPub),
  };
  if (!receipt.keyFit.match) {
    receipt.verdict = "KEY-MISMATCH (this WIF does not open this blurt body — fail-closed)";
    console.log(JSON.stringify(receipt, null, 2)); process.exit(1);
  }

  // 3) BYTE-LAW: our serialization must equal the node's canonical hex
  const headBlock = live[0].head - 3;
  const head = await rpc(node, "condenser_api.get_block_header", [headBlock]);
  const blockId = head.previous || head.block_id;
  const tx = {
    ref_block_num: parseInt(blockId.slice(0, 8), 16) & 0xffff,
    ref_block_prefix: parseInt(blockId.slice(8, 16), 16) >>> 0,
    expiration: Math.floor(Date.now() / 1000) + 120,
    operations: [["vote", { voter: account, author: account, permlink: "blurt-revival-probe", weight: 0 }]],
    extensions: [],
  };
  const ours = serTx(tx).toString("hex");
  const expected = await rpc(node, "condenser_api.get_transaction_hex", [tx]);
  receipt.byteLaw = { exact: ours === String(expected).toLowerCase() };
  if (!receipt.byteLaw.exact) {
    receipt.verdict = "BYTE-LAW-MISMATCH (serializer divergence — refuse to sign)";
    receipt.byteLaw.ours = ours; receipt.byteLaw.expected = String(expected).toLowerCase();
    console.log(JSON.stringify(receipt, null, 2)); process.exit(1);
  }

  if (mode === "dry") { receipt.verdict = "DRY-OK key-fit + byte-law proven, zero broadcast"; console.log(JSON.stringify(receipt, null, 2)); return; }

  // 4) post — double-gated by law
  if (process.env.CI_BLURT_ENABLED !== "true") {
    receipt.verdict = "POST-REFUSED-NOT-ENABLED (CI_BLUT_ENABLED gate; owner DecisionQueue law)";
    console.log(JSON.stringify(receipt, null, 2)); process.exit(1);
  }
  const digest = Buffer.from(sha256(Buffer.concat([Buffer.from(chainIdHex, "hex"), serTx(tx)])));
  const sig = secp.sign(digest, privRaw, { prehash: false });
  const rHex = sig.r.toString(16).padStart(64, "0");
  const sHex = sig.s.toString(16).padStart(64, "0");
  const compact = Buffer.from(rHex + sHex, "hex");
  let recid = -1;
  for (let c = 0; c < 4; c++) {
    try {
      const rec = secp.recoverPublicKey(compact, digest, c, true);
      if (Buffer.from(rec).equals(pubBytes)) { recid = c; break; }
    } catch { /* next */ }
  }
  if (recid < 0) { receipt.verdict = "RECID-UNRESOLVED (refuse)"; console.log(JSON.stringify(receipt, null, 2)); process.exit(1); }
  const sigHex = Buffer.concat([Buffer.from([recid + 27 + 4]), compact]).toString("hex");
  const res = await rpc(node, "condenser_api.broadcast_transaction_synchronous", [tx, [sigHex]]);
  receipt.broadcast = { txid: res?.id || res?.tx?.transaction_id || null, block: res?.block_num || null };
  receipt.verdict = receipt.broadcast.txid ? `POSTED txid=${receipt.broadcast.txid}` : "POST-UNKNOWN-RESPONSE";
  console.log(JSON.stringify(receipt, null, 2));
}

main().catch((e) => { console.error(JSON.stringify({ mode: process.argv[2] || "health", verdict: "ERROR", err: String(e).slice(0, 200) }, null, 2)); process.exit(1); });
