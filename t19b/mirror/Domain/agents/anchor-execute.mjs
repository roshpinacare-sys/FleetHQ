#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────
// Z-15 · anchor-execute.mjs — the one-command end of T-RELAY-GAS-READY
//
// The R132 chain: trigger FIRES (demand, hourly, public) → pipeline.json
// holds readyToSign calldata (supply, in the book) → THIS FILE is the
// execution: verify-then-sign against the ownerless Relay.
//
// Doctrine (fleet law, zero exceptions):
//   · keyless pre-flight runs everywhere — RPC measurement only
//   · the private key lives in env EVM_ANCHOR_PK at runtime ONLY
//     (never in git, never in logs, never on disk)
//   · HARD GATE: the key must derive the sovereign EOA in the book
//   · without a key this is an honest DRYRUN — it never pretends to sign
//
// Usage:
//   DRY (default):  node agents/anchor-execute.mjs
//   FIRE:           EVM_ANCHOR_PK=0x… CHAIN=OPTIMISM node agents/anchor-execute.mjs
// Env: CHAIN (OPTIMISM|BASE|ETHEREUM, default OPTIMISM — cheapest per book),
//      PIPELINE_URL (default: the live book on Console main),
//      RECEIPT_OUT (default: stdout only; CI writes the receipt file).
// ─────────────────────────────────────────────────────────────────────
import { createRequire } from "node:module";
import path from "node:path";

const EOA = "0x01Bd2879Cd9990Cb4B25cD6DE47f378Dc5D18B37";
const RELAYS = {
  ETHEREUM: { rpc: "https://ethereum-rpc.publicnode.com", rpc2: "https://rpc.ankr.com/eth", relay: "0xa52D85cAa4C04C15cE60d0c582e8C138d16678E6", chainId: 1 },
  OPTIMISM: { rpc: "https://optimism-rpc.publicnode.com", rpc2: "https://mainnet.optimism.io", relay: "0x56c9D54ea866e25916757903E51392BBEdeE2ECe", chainId: 10 },
  BASE:     { rpc: "https://base-rpc.publicnode.com",     rpc2: "https://mainnet.base.org",           relay: "0x279818b4c9Eddc02fB3DD036a5E77D8F7Dc1CF87", chainId: 8453 },
};
const PIPELINE_URL = process.env.PIPELINE_URL || "https://raw.githubusercontent.com/roshpinacare-sys/Console/main/proof/pipeline.json";
const SELECTOR = "0x8be975cf"; // anchor(...) — the book's own calldata prefix doubles as the sanity pin
const GAS_PRICE_CAP_GWEI = { 1: 30, 10: 0.5, 8453: 0.5 }; // refuse to fire into a gas spike (measured: OP 0.001)
const log = (m) => console.log(`[anchor-execute] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(url, method, params) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: c.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || "rpc error");
    return j.result;
  } finally { clearTimeout(t); }
}

async function loadPipeline() {
  if (PIPELINE_URL.startsWith("file://")) {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(new URL(PIPELINE_URL).pathname, "utf8"));
  }
  const res = await fetch(PIPELINE_URL, { headers: { "User-Agent": "saos-anchor-execute" } });
  if (!res.ok) throw new Error(`pipeline fetch HTTP ${res.status}`);
  const p = await res.json();
  if (!p || p.ok !== true || !p.dayRoot || !p.chains) throw new Error("pipeline book malformed (ok/dayRoot/chains)");
  return p;
}

// ── keyless pre-flight: measure everything, sign nothing ──
async function preflight(p, chainName) {
  const cfg = RELAYS[chainName];
  const c = p.chains[chainName];
  if (!c || !c.readyToSign) throw new Error(`book has no readyToSign for ${chainName}`);
  const sig = c.readyToSign;
  const checks = [];
  const add = (name, pass, detail) => { checks.push({ name, pass, detail }); if (!pass) throw new Error(`pre-flight FAIL ${name}: ${detail}`); };

  add("book-chainId", sig.chainId === cfg.chainId, `book ${sig.chainId} vs cfg ${cfg.chainId}`);
  add("book-relay", String(sig.to).toLowerCase() === cfg.relay.toLowerCase(), sig.to);
  add("calldata-selector", String(sig.data).toLowerCase().startsWith(SELECTOR), String(sig.data).slice(0, 10));
  add("calldata-carries-dayRoot", String(sig.data).toLowerCase().includes(String(p.dayRoot).toLowerCase().slice(2)), p.dayRoot);

  const netId = Number(await rpc(cfg.rpc, "eth_chainId"));
  add("rpc-chainId", netId === cfg.chainId, `rpc ${netId}`);
  const gasPrice = BigInt(await rpc(cfg.rpc, "eth_gasPrice"));
  const gasPriceGwei = Number(gasPrice) / 1e9; // wei → gwei
  add("gasPrice-sane", gasPriceGwei <= GAS_PRICE_CAP_GWEI[cfg.chainId], `${gasPriceGwei.toFixed(6)} gwei (cap ${GAS_PRICE_CAP_GWEI[cfg.chainId]})`);
  const nonce = await rpc(cfg.rpc, "eth_getTransactionCount", [EOA, "pending"]);
  const balance = BigInt(await rpc(cfg.rpc, "eth_getBalance", [EOA, "latest"]));
  const est = BigInt(sig.gasLimit);
  const cost = est * gasPrice;
  add("balance-covers", balance > cost, `${Number(balance) / 1e18} ETH vs cost ${Number(cost) / 1e18} ETH`);
  // the contract itself must accept this calldata right now — catches
  // "already anchored today", monotonic-height regressions, anything stale
  let estimate;
  try {
    estimate = await rpc(cfg.rpc, "eth_estimateGas", [{ from: EOA, to: sig.to, data: sig.data, value: sig.value || "0x0" }]);
  } catch (e) {
    add("contract-accepts", false, `estimateGas reverted: ${e.message}`);
    return { checks, cfg, sig, dry: true };
  }
  add("contract-accepts", true, `estimateGas ${BigInt(estimate)} (book ${est})`);
  return { checks, cfg, sig, dry: false, gasPrice, nonce, estimate: BigInt(estimate), balance, gasPriceGwei };
}

async function main() {
  const chainName = (process.env.CHAIN || "OPTIMISM").toUpperCase();
  if (!RELAYS[chainName]) throw new Error(`unknown CHAIN ${chainName}`);
  const pk = process.env.EVM_ANCHOR_PK || "";
  log(`chain=${chainName} mode=${pk ? "SIGN" : "DRYRUN"} book=${PIPELINE_URL.slice(0, 64)}…`);

  const p = await loadPipeline();
  const pre = await preflight(p, chainName);
  for (const c of pre.checks) log(`  ✓ ${c.name}: ${c.detail}`);

  if (pre.dry) { log("VERDICT: NOT-FIREABLE (contract refused the book calldata — honest stop, nothing signed)"); process.exit(1); }
  if (!pk) {
    log(`VERDICT: DRYRUN-READY · dayRoot ${p.dayRoot} · est cost ${Number(pre.estimate * pre.gasPrice) / 1e18} ETH`);
    log(`FIRE WITH:  EVM_ANCHOR_PK=<key> CHAIN=${chainName} node agents/anchor-execute.mjs`);
    log("nothing signed (no key in env — the gate is the operator's, this tool only waits for it)");
    process.exit(0);
  }

  // Z-18 hardening: dedup against the public book — if TODAY's dayRoot already
  // carries a verified receipt on THIS chain, the hourly demand is satisfied.
  try {
    const recUrl = "https://raw.githubusercontent.com/roshpinacare-sys/Console/main/proof/anchor-receipt.json";
    const rec = await (await fetch(recUrl, { headers: { "User-Agent": "saos-anchor-execute" } })).json();
    if (rec && rec.ok && rec.day === p.day && rec.chain === chainName && rec.readBack && rec.readBack.match === true) {
      log(`VERDICT: ALREADY-ANCHORED · ${chainName} · day ${p.day} · receipt ${rec.txHash} — no duplicate signature (honest skip)`);
      process.exit(0);
    }
  } catch { /* book unreadable — proceed honestly */ }

  // ── sign path: ethers is required only here ──
  const ETHERS_DIR = process.env.ETHERS_DIR || "/tmp/ethers/node_modules";
  let ethers;
  try {
    ethers = createRequire(path.join(ETHERS_DIR, "probe.cjs"))("ethers");
  } catch {
    log("ethers not found — run: npm install ethers@6.13.4 --prefix /tmp/ethers --omit=dev");
    process.exit(2);
  }
  const wallet = new ethers.Wallet(pk);
  const derived = wallet.address;
  // HARD GATE: one sovereign signer. A key that is not the book's EOA
  // never signs, no matter what it could afford.
  if (derived.toLowerCase() !== EOA.toLowerCase()) {
    log(`HARD GATE: key derives ${derived}, book EOA is ${EOA} — refusing to sign (verify-then-sign)`);
    process.exit(3);
  }
  log(`signer verified: ${derived} == book EOA ✓`);

  const provider = new ethers.JsonRpcProvider(pre.cfg.rpc, pre.cfg.chainId, { staticNetwork: true });
  const signer = await wallet.connect(provider);
  const gasLimit = (pre.estimate * 120n) / 100n;   // 20% headroom over live estimate
  const gasPrice = (pre.gasPrice * 110n) / 100n;   // 10% over gasPrice for inclusion
  const nonceFresh = await rpc(pre.cfg.rpc, "eth_getTransactionCount", [EOA, "pending"]);
  const tx = await signer.sendTransaction({ to: pre.sig.to, data: pre.sig.data, value: 0, gasLimit, gasPrice, nonce: Number(nonceFresh), chainId: pre.cfg.chainId, type: 0 });
  log(`broadcast: ${tx.hash}`);
  // Z-18 hardening: confirm on the chain-native node — some public providers
  // 403 receipt fetches ("archive requires token") even at tip; poll both.
  let receipt = null;
  for (let i = 0; i < 60 && !receipt; i++) {
    await sleep(3000);
    for (const node of [pre.cfg.rpc2, pre.cfg.rpc]) {
      try {
        const r = await rpc(node, "eth_getTransactionReceipt", [tx.hash]);
        if (r && r.blockNumber) { receipt = r; break; }
      } catch { /* honest retry — public nodes flap */ }
    }
  }
  if (!receipt) throw new Error(`receipt not seen in 180s — verify by hash: ${tx.hash}`);
  receipt = { blockNumber: Number(BigInt(receipt.blockNumber)), gasUsed: Number(BigInt(receipt.gasUsed)), status: Number(BigInt(receipt.status)) };
  if (receipt.status !== 1) throw new Error(`tx REVERTED on-chain: ${tx.hash}`);
  log(`ANCHORED: block ${receipt.blockNumber} · gas ${receipt.gasUsed} · ${tx.hash}`);

  // independent read-back from the second node: the chain says what we say
  const back = await rpc(pre.cfg.rpc2, "eth_getTransactionByHash", [tx.hash]);
  const readBackOk = back && back.to && back.to.toLowerCase() === pre.sig.to.toLowerCase() && (back.input || "").toLowerCase() === pre.sig.data.toLowerCase();
  log(`read-back (${new URL(pre.cfg.rpc2).hostname}): to✓ input✓ → ${readBackOk ? "MATCH" : "MISMATCH"}`);

  const out = {
    ok: readBackOk && receipt.status === 1,
    tool: "anchor-execute.mjs",
    doctrine: "verify-then-sign; key in runtime memory only; hard gate = book EOA",
    chain: chainName, chainId: pre.cfg.chainId,
    relay: pre.sig.to, dayRoot: p.dayRoot, day: p.day,
    eoa: EOA,
    txHash: tx.hash, block: receipt.blockNumber, gasUsed: String(receipt.gasUsed),
    gasPriceGwei: pre.gasPriceGwei,
    calldataPrefix: pre.sig.data.slice(0, 10),
    readBack: { node: new URL(pre.cfg.rpc2).hostname, match: readBackOk },
    anchoredAt: new Date().toISOString(),
  };
  const line = `anchor-execute: ANCHORED ${chainName} cp(day ${p.day}) root ${p.dayRoot.slice(0, 14)}… tx ${tx.hash.slice(0, 14)}… block ${receipt.blockNumber} readback=${readBackOk ? "MATCH" : "MISMATCH"}`;
  if (process.env.RECEIPT_OUT) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(process.env.RECEIPT_OUT), { recursive: true });
    writeFileSync(process.env.RECEIPT_OUT, JSON.stringify(out, null, 2) + "\n");
    log(`receipt written: ${process.env.RECEIPT_OUT}`);
  }
  log(line);
  process.exit(readBackOk ? 0 : 4);
}

main().catch((e) => { log(`FATAL: ${e && e.message ? e.message : e}`); process.exit(1); });
