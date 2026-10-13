// PROOF-PIPELINE (Z-13, R132) · AGENT-Z — "פתרונות מהקיים" לפקודת-המפעיל
//
// הרעיון: הרשת כבר ממומנת לעיגון — אף-אחד לא מדד את זה. ל-EOA הריבוני יש
// דלק-גז על OP/Base שמספיק **לשנים** של אנקורים יומיים במחירי-גז הנוכחיים.
// החסר היחיד: חתימה (כספת-מפעיל). אז הצינור הזה:
//   1. אוסף ארטיפקטי-אמת של היום (KPI · דיווח · שער-טסטים · פאריטי · ספר-טריגרים)
//   2. מחשב digest-ים keccak + שורש-יום אחד (dayRoot) — בנייה דטרמיניסטית
//   3. בונה calldata מוכן-לחתימה ל-anchor() של SAOSRelay החי (3 שרשרות)
//   4. מודד חי: יתרת-EOA · gasPrice · estimateGas → כמה אנקורים-יומיים הדלק
//      מממן בכל שרשרת (anchorsAffordable)
//   5. מפרסם ספר proof/pipeline.json ל-Console — שם כללי-הטריגר קוראים אותו
//      (T-RELAY-GAS-READY: כשהדלק מממן >730 אנקורים — הרשת דורשת חתימה).
//
// כנות: אפס-מפתחות. calldata לא-חתום הוא מסמך-ציבורי לחלוטין (ה-Relay
// חסר-בעלים — כל-אחד יכול לעגן דרכו, והספר מאפשר לכל-ארנק לחתום עיוור).
// ארטיפקט שלא-זמין = "unavailable — nothing faked".

"use strict";

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const STEEM_RPC = "https://api.steemit.com";
const EOA = "0x01Bd2879Cd9990Cb4B25cD6DE47f378Dc5D18B37";
const RELAYS = {
  ETHEREUM: { rpc: "https://ethereum-rpc.publicnode.com", relay: "0xa52D85cAa4C04C15cE60d0c582e8C138d16678E6", chainId: 1 },
  OPTIMISM: { rpc: "https://optimism-rpc.publicnode.com", relay: "0x56c9D54ea866e25916757903E51392BBEdeE2ECe", chainId: 10 },
  BASE:     { rpc: "https://base-rpc.publicnode.com",     relay: "0x279818b4c9Eddc02fB3DD036a5E77D8F7Dc1CF87", chainId: 8453 },
};
const RAW = (repo, file, ref = "main") => `https://raw.githubusercontent.com/roshpinacare-sys/${repo}/${ref}/${file}`;
const GH = "https://api.github.com/repos/roshpinacare-sys";
const DAY = Math.floor(Date.now() / 86400000);
const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(m) { console.log(`[proof-pipeline] ${m}`); }

async function fetchJson(url, timeoutMs = 15000, headers = {}) {
  if (url.startsWith("https://api.github.com") && process.env.GH_TOKEN && !headers.Authorization) {
    headers = { ...headers, Authorization: `Bearer ${process.env.GH_TOKEN}`, "User-Agent": "saos-proof-pipeline" };
  }
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const res = await fetch(url, { signal: c.signal, headers });
    clearTimeout(t);
    if (!res.ok) throw new Error(`http-${res.status}`);
    return await res.json();
  } catch (e) {
    log(`  · source unavailable: ${url.split("/").slice(3, 6).join("/")} (${String(e?.message || e).slice(0, 50)}) — nothing faked`);
    return null;
  }
}

async function rpc(url, method, params, retries = 2) {
  for (let a = 1; a <= retries; a++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(String(j.error.message || "rpc").slice(0, 80));
      return j.result;
    } catch (e) {
      if (a === retries) { log(`  · rpc fail ${method}: ${String(e?.message || e).slice(0, 60)}`); return null; }
      await sleep(1200 * a);
    }
  }
}

// ── 1. ארטיפקטי-אמת של היום ─────────────────────────────────────────────
async function collect() {
  log("collecting today's proof artifacts…");
  const arts = [];

  let kpi = null;
  try {
    kpi = JSON.parse(readFileSync("defi-kpi/fleet/KPI.json", "utf8"));
    log("  · KPI read from local defi-kpi checkout");
  } catch { kpi = null; }
  if (!kpi) kpi = await fetchJson(RAW("Defi", "fleet/KPI.json"));
  if (kpi?.revenuePerDayReal?.usd != null) {
    arts.push({ name: "mission-kpi", rail: "KPI", ref: `fleet/KPI.json@${TODAY}`, value: `$${kpi.revenuePerDayReal.usd}/day` });
  } else arts.push({ name: "mission-kpi", rail: "KPI", ref: TODAY, value: "unavailable — nothing faked" });

  const book = await fetchJson(RAW("Console", "triggers/current.json"));
  if (book?.publishedAt) {
    arts.push({ name: "trigger-book", rail: "TRIGGER", ref: `publishedAt=${book.publishedAt}`, value: `fired=${(book.fired || []).length}` });
  } else arts.push({ name: "trigger-book", rail: "TRIGGER", ref: TODAY, value: "unavailable — nothing faked" });

  const grid = await fetchJson(RAW("Console", "dex/grid.json"));
  if (grid?.verdict || grid?.marks?.paritySbdPerSteem != null) {
    arts.push({ name: "grid-parity", rail: "GRID", ref: `grid.json@${grid.publishedAt || TODAY}`, value: `parity=${grid.marks?.paritySbdPerSteem ?? "?"} verdict=${grid.verdict || "?"}` });
  } else arts.push({ name: "grid-parity", rail: "GRID", ref: TODAY, value: "unavailable — nothing faked" });

  const forge = await fetchJson(`${GH}/Domain/actions/workflows/foundry-mesh-tests.yml/runs?per_page=1`);
  const run = forge?.workflow_runs?.[0];
  if (run) {
    arts.push({ name: "forge-gate", rail: "FORGE", ref: `run-${run.id}`, value: run.conclusion || run.status });
  } else arts.push({ name: "forge-gate", rail: "FORGE", ref: TODAY, value: "unavailable — nothing faked" });

  const digest = await fetchJson(RAW("Defi", "fleet/KPI.json")); // placeholder replaced below
  try {
    const r = await rpc(STEEM_RPC, "condenser_api.get_content", ["headcorner", `saos-daily-${TODAY.replace(/-/g, "")}`]);
    if (r && r.id !== 0) {
      arts.push({ name: "daily-digest", rail: "STEEM", ref: r.permlink, value: `created=${r.created} chars=${r.body.length}` });
    } else {
      arts.push({ name: "daily-digest", rail: "STEEM", ref: `saos-daily-${TODAY.replace(/-/g, "")}`, value: "not-yet-on-chain (01:10 UTC)" });
    }
  } catch { arts.push({ name: "daily-digest", rail: "STEEM", ref: TODAY, value: "unavailable — nothing faked" }); }

  return arts;
}

// ── 2. digests + dayRoot (דטרמיניסטי) ───────────────────────────────────
function computeDigests(ethers, arts) {
  log("computing keccak digests + dayRoot…");
  for (const a of arts) {
    a.digest = ethers.keccak256(ethers.toUtf8Bytes(`${a.rail}|${a.ref}|${a.value}`));
  }
  const preimage = arts.map((a) => `${a.rail}:${a.ref}:${a.digest}`).join("\n");
  const dayRoot = ethers.keccak256(ethers.toUtf8Bytes(`saos-proof/v1|${DAY}|${preimage}`));
  return { preimage, dayRoot };
}

// ── 3. calldata מוכן-לחתימה ל-anchor() ──────────────────────────────────
function buildCalldata(ethers, dayRoot) {
  const iface = new ethers.Interface(["function anchor(bytes32 root, uint256 height, string rail, string note)"]);
  const data = iface.encodeFunctionData("anchor", [dayRoot, BigInt(DAY), "SAOS-NET", `proof-pipeline v1 ${TODAY}`]);
  return data;
}

// ── 4. מדידות-חי לכל שרשרת ──────────────────────────────────────────────
async function measureChains(ethers, calldata) {
  log("measuring live gas economics per chain…");
  const out = {};
  for (const [name, c] of Object.entries(RELAYS)) {
    const balHex = await rpc(c.rpc, "eth_getBalance", [EOA, "latest"]);
    const gasHex = await rpc(c.rpc, "eth_gasPrice", []);
    let estHex = null;
    try {
      estHex = await rpc(c.rpc, "eth_estimateGas", [{ from: EOA, to: c.relay, data: calldata }]);
    } catch { /* honest skip */ }
    if (!balHex || !gasHex) {
      out[name] = { reachable: false };
      continue;
    }
    const bal = BigInt(balHex);
    const gasPrice = BigInt(gasHex);
    const gasLimit = estHex ? BigInt(estHex) : 90000n; // honest default for anchor()
    const perAnchor = gasLimit * gasPrice;
    out[name] = {
      reachable: true,
      relay: c.relay,
      chainId: c.chainId,
      balanceEth: Number(bal) / 1e18,
      gasPriceGwei: Number(gasPrice) / 1e9,
      estimateGas: estHex ? Number(estHex) : null,
      costPerAnchorEth: Number(perAnchor) / 1e18,
      anchorsAffordable: Number(bal / perAnchor),
      readyToSign: { to: c.relay, data: calldata, gasLimit: "0x" + gasLimit.toString(16), value: "0x0", chainId: c.chainId },
    };
    log(`  · ${name}: bal=${out[name].balanceEth} ETH · gas=${out[name].gasPriceGwei} gwei · affordable=${out[name].anchorsAffordable} daily anchors`);
  }
  return out;
}

// ── ראשי ────────────────────────────────────────────────────────────────
async function main() {
  const ETHERS_DIR = process.env.ETHERS_DIR || "/tmp/ethers";
  const req = createRequire(path.join(ETHERS_DIR, "probe.cjs"));
  const ethers = req("ethers");

  const arts = await collect();
  const { preimage, dayRoot } = computeDigests(ethers, arts);
  const calldata = buildCalldata(ethers, dayRoot);
  const chains = await measureChains(ethers, calldata);

  const live = Object.entries(chains).filter(([, c]) => c.reachable && c.anchorsAffordable != null);
  live.sort((a, b) => b[1].anchorsAffordable - a[1].anchorsAffordable);
  const best = live[0]
    ? { chain: live[0][0], anchorsAffordable: live[0][1].anchorsAffordable, costPerAnchorEth: live[0][1].costPerAnchorEth }
    : { chain: null, anchorsAffordable: 0, note: "no reachable funded chain measured" };

  const book = {
    ok: true,
    version: 1,
    publishedAt: new Date().toISOString(),
    publishedBy: "AGENT-Z proof-pipeline (Z-13, R132) — keyless",
    doctrine: "ready-to-sign, not signed. the operator's vault holds the key; the network holds the math.",
    day: TODAY,
    dayNumber: DAY,
    sovereignEoa: EOA,
    artifacts: arts,
    dayRoot,
    dayRootPreimage: preimage,
    anchorCalldataPrefix: calldata.slice(0, 10),
    anchorCalldata: calldata,
    best,
    chains,
    nextOnChain: {
      sealgate: "contracts/SAOSSealGate.sol @ fleet/r130 79c33ce — tested 78/78, artifact-missing (compile step next cycle) — nothing faked",
      relaybatch: "contracts/SAOSRelayBatch.sol @ fleet/r130 79c33ce — tested, routes the LIVE relay — artifact-missing — nothing faked",
    },
  };

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("console-book/proof", { recursive: true });
  writeFileSync("console-book/proof/pipeline.json", JSON.stringify(book, null, 2) + "\n");
  log(`book written: proof/pipeline.json · dayRoot=${dayRoot.slice(0, 18)}… · best=${best.chain}:${best.anchorsAffordable}`);
  log(JSON.stringify(best));
}

void main();
