'use strict';
/**
 * fleet-census.cjs — THE FLEET CENSUS (R14, CR-0040) — the estate-wide capability,
 * sovereignty, blocker and wiring map, measured from the REAL 16-repo estate on disk.
 *
 * Answers the owner's directive (2026-10-03) mechanically, offline, keyless:
 *   · מה יש לנו            — per-lane capability inventory from real artifact markers
 *   · ריבונות (sovereignty) — keyless surfaces, owner-gated gates, STASIS brake coverage,
 *                             vault ceremony, offline desks, test coverage — counted, not claimed
 *   · מה חוסם אותנו        — a blockers registry with LIVE-READ evidence (fee-doctrine drift
 *                             re-measured from the sources, cadence-series maturity, TVM absence,
 *                             operator-gated capital/authority)
 *   · חיבור (wiring)       — the composition arcs of the fleet, each verified by its endpoints
 *
 * COMPOSITION (no duplication, the second-mover law honored):
 *   one-bloc.cjs        measures REACH (16/16 tokenReach)   — this desk measures CAPABILITY;
 *   capability-matrix.cjs measures CHAIN AUTHORITIES (network) — this desk is OFFLINE;
 *   cross-layer.cjs     measures the 4 grid/market layers  — this desk is the WHOLE estate.
 *
 * Doctrine: offline · keyless · deterministic (stable payload byte-stable; only the book's
 * `at` stamp moves) · fail-soft exit 0 always · zero secret material in output (metadata only).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ESTATE = process.env.FLEET_CENSUS_ESTATE || path.resolve(ROOT, '..');
const AG = path.join(ROOT, 'agents');
const OUT_JSON = path.join(AG, 'fleet-census.json');
const OUT_MD = path.join(AG, 'fleet-census.md');
const OUT_ARTIFACT = path.join(AG, 'fleet-census.artifact.json');

/** FATE-DEFENSE law #1 — the breaker file: estate Domain lane first, then this repo. */
function stasisSource() {
  for (const p of [path.join(ESTATE, 'Domain', 'agents', 'STASIS.json'), path.join(ROOT, 'agents', 'STASIS.json')]) {
    if (exists(p)) return p;
  }
  return null;
}

/** the desk-side brake: an ACTIVE breaker halts the census BEFORE any lane read (E32-proven). */
function stasisHalt() {
  const src = stasisSource();
  if (!src) return { active: false, source: null };
  try {
    const active = JSON.parse(readSafe(src) || 'null');
    if (active && active.active === true) return { active: true, source: path.relative(ROOT, src) || src };
  } catch (_) {}
  return { active: false, source: path.relative(ROOT, src) || src };
}

// ---------- pure helpers (E31 white-box surface) ----------

/** spread series over history rows for one market label prefix: exact n/min/max/last. */
function spreadSeries(rows, marketPrefix) {
  const vals = [];
  for (const r of rows || []) {
    for (const s of (r && r.spreads) || []) {
      if (s && typeof s.market === 'string' && s.market.startsWith(marketPrefix) && typeof s.spreadPct === 'number') vals.push(s.spreadPct);
    }
  }
  if (!vals.length) return { n: 0, min: null, max: null, last: null };
  return { n: vals.length, min: Math.min(...vals), max: Math.max(...vals), last: vals[vals.length - 1] };
}

/** first integer after a key token in source text (FEE_BPS = 30 -> 30); null if absent. */
function extractFirstInt(text, key) {
  if (typeof text !== 'string' || !key) return null;
  const m = text.match(new RegExp(key + '\\s*=\\s*(\\d+)'));
  return m ? parseInt(m[1], 10) : null;
}

const sha256 = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; } };
const readSafe = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch (_) { return false; } };
const globCount = (dir, re) => { try { return fs.readdirSync(dir).filter((f) => re.test(f)).length; } catch (_) { return 0; } };

// ---------- lane registry (every marker verified on the estate before booking) ----------

const LANES = [
  { id: 'Domain', role: 'L0 observer + convergence hub: desks, evals, cron cadence, judge/pulse books', markers: [
    { tag: 'marketGrid', file: 'agents/market-grid.cjs' },
    { tag: 'marketExec', file: 'agents/market-exec.cjs' },
    { tag: 'fillLedger', file: 'agents/fill-ledger.cjs' },
    { tag: 'marketCycle', file: 'agents/market-cycle.cjs' },
    { tag: 'crossLayer', file: 'agents/cross-layer.cjs' },
    { tag: 'oneBloc', file: 'agents/one-bloc.cjs' },
    { tag: 'capabilityMatrix', file: 'agents/capability-matrix.cjs' },
    { tag: 'econDesk', file: 'agents/econ-desk.cjs' },
    { tag: 'measureLearn', file: 'agents/measure-learn.cjs' },
    { tag: 'evoWindows', file: 'agents/evo-windows.cjs' },
    { tag: 'stasis', file: 'agents/STASIS.json' },
    { tag: 'evals', file: 'agents/evals/run-evals.cjs' },
    { tag: 'skillGate', file: 'agents/skill-library-gate.cjs' },
    { tag: 'cadenceCron', file: '.github/workflows/market-grid-cron.yml' },
    { tag: 'gridHistory', file: 'agents/market-grid-history.jsonl' },
    { tag: 'gridPaper', file: 'agents/market-grid-paper.jsonl' },
  ] },
  { id: 'saos-dex', role: 'L1 DEX kernel: integer-floor AMM + maker grid + ledger', markers: [
    { tag: 'kernel', file: 'audit-package/src/kernel.ts', grep: 'FEE_BPS' },
    { tag: 'amm', file: 'audit-package/src/amm.ts' },
    { tag: 'mm', file: 'audit-package/src/mm.ts' },
    { tag: 'gridBeat', file: 'grid-beat.ts' },
    { tag: 'gridLedger', file: 'db/grid-ledger.json' },
    { tag: 'dexCredits', file: 'db/dex-credits.json' },
    { tag: 'dexGridCron', file: '.github/workflows/dex-grid.yml' },
    { tag: 'gridTrigger', file: '.github/workflows/grid-trigger.yml' },
  ] },
  { id: 'steem', role: 'L2 chain agents + HE executor ladder (taker)', markers: [
    { tag: 'heLadder', file: 'agent/he_ladder.cjs', grep: 'CROSS_PCT' },
    { tag: 'liveGate', file: 'agent/gate-state.json' },
    { tag: 'ladderRefresh', file: 'agent/ladder_refresh.cjs' },
    { tag: 'anchor', file: 'agent/anchor.cjs' },
    { tag: 'chainAttest', file: 'agent/chain_attest.cjs' },
  ] },
  { id: 'saos-sovereign-platform', role: 'L3 EVM mesh contracts + red-team suite', markers: [
    { tag: 'exchange', file: 'contracts/mesh/SAOSExchange.sol', grep: 'FEE_BPS' },
    { tag: 'ledger', file: 'contracts/mesh/SAOSLedger.sol' },
    { tag: 'bridge', file: 'contracts/mesh/SAOSBridge.sol' },
    { tag: 'meshHub', file: 'contracts/mesh/SAOSMeshHub.sol' },
    { tag: 'identity', file: 'contracts/mesh/SAOSIdentity.sol' },
  ] },
  { id: 'Console', role: 'witness mirror + keyless chain read (weave console)', markers: [
    { tag: 'acidEngine', file: 'acid-engine.js' },
    { tag: 'fleetLog', file: 'FLEET-LOG.md' },
    { tag: 'agentDir', file: 'agent' },
  ] },
  { id: 'Defi', role: 'trigger mesh + fleet supervision keeper', markers: [
    { tag: 'triggerChain', file: 'TRIGGER-CHAIN.md' },
    { tag: 'doctrine', file: 'DOCTRINE.md' },
    { tag: 'fleet', file: 'fleet' },
    { tag: 'registry', file: 'registry' },
  ] },
  { id: 'Zip', role: 'sovereign key vault (r180 ECDH sealed transfer) + anchors', markers: [
    { tag: 'vaultKeyring', file: 'scripts/vault-keyring.mjs', grep: 'stdin' },
    { tag: 'vaultRunbook', file: 'sovereign/vault/README.md' },
    { tag: 'weaveAnchor', file: 'scripts/weave-anchor.ts' },
    { tag: 'networkEvolution', file: 'NETWORK-EVOLUTION.md' },
  ] },
  { id: 'Saosmartwallet', role: 'smart-wallet controls + fleet health', markers: [
    { tag: 'controls', file: 'CONTROLS-THAT-EXIST.md' },
    { tag: 'fleetHealth', file: 'FLEET-HEALTH.md' },
  ] },
  { id: 'Sdk', role: 'SDK surface', markers: [ { tag: 'readme', file: 'README.md' } ] },
  { id: 'Adsmarket', role: 'ads/claims lane', markers: [
    { tag: 'claimsAudit', file: 'CLAIMS-AUDIT-2026-09-12.md' },
    { tag: 'agentDir', file: 'agent' },
  ] },
  { id: 'Project-files', role: 'archive keeper', markers: [ { tag: 'readme', file: 'README.md' } ] },
  { id: 'anchor-baseline', role: 'baseline integrity', markers: [ { tag: 'readme', file: 'README.md' } ] },
  { id: 'roshpina', role: 'controls audit lane', markers: [
    { tag: 'controls', file: 'CONTROLS-THAT-EXIST.md' },
    { tag: 'briefing', file: 'AGENT-BRIEFING.md' },
  ] },
  { id: 'saos-control-center', role: 'control center build + caddy edge', markers: [
    { tag: 'caddy', file: 'Caddyfile' },
    { tag: 'fleetNote', file: 'FLEET-NOTE.md' },
  ] },
  { id: 'saos-jummper', role: 'notary/jumpper tests', markers: [ { tag: 'readme', file: 'README.md' } ] },
  { id: 'saos-sovereign-foundry', role: 'foundry ops (port law :3100)', markers: [
    { tag: 'briefing', file: 'AGENT-BRIEFING.md' },
    { tag: 'controls', file: 'CONTROLS-THAT-EXIST.md' },
    { tag: 'broadcasts', file: 'broadcasts' },
    { tag: 'agentDir', file: 'agent' },
  ] },
];

// ---------- measured pieces ----------

function gitHead(laneDir) {
  const h = spawnSync('git', ['-C', laneDir, 'log', '-1', '--format=%h %ad %s', '--date=iso-strict'], { timeout: 20000, encoding: 'utf8' });
  if (h.status !== 0 || !h.stdout) return { head: null, commits: null, subject: null };
  const c = spawnSync('git', ['-C', laneDir, 'rev-list', '--count', 'HEAD'], { timeout: 20000, encoding: 'utf8' });
  const line = String(h.stdout).trim();
  const sp = line.indexOf(' ');
  const sp2 = line.indexOf(' ', sp + 1);
  return {
    head: line.slice(0, sp) || null,
    at: line.slice(sp + 1, sp2) || null,
    subject: (line.slice(sp2 + 1) || '').slice(0, 140) || null,
    commits: c.status === 0 ? parseInt(String(c.stdout).trim(), 10) || null : null,
  };
}

function laneInventory() {
  return LANES.map((lane) => {
    const dir = path.join(ESTATE, lane.id);
    if (!exists(dir)) return { id: lane.id, role: lane.role, status: 'MISSING', head: null, commits: null, subject: null, capabilities: [], capabilityCount: 0, extras: {} };
    const caps = [];
    for (const m of lane.markers) {
      const p = path.join(dir, m.file);
      if (!exists(p)) continue;
      if (m.grep && !String(readSafe(p) || '').includes(m.grep)) continue; // grep-hit required, never assumed
      caps.push(m.tag);
    }
    const extras = {};
    const agentDir = path.join(dir, 'agent');
    if (exists(agentDir) && lane.id === 'steem') extras.chainAgents = globCount(agentDir, /\.cjs$/);
    const meshDir = path.join(dir, 'contracts', 'mesh');
    if (exists(meshDir) && lane.id === 'saos-sovereign-platform') {
      extras.meshContracts = globCount(meshDir, /\.sol$/);
      extras.meshTests = globCount(path.join(dir, 'test'), /\.t\.sol$/);
    }
    const wfDir = path.join(dir, '.github', 'workflows');
    if (exists(wfDir)) extras.workflows = globCount(wfDir, /\.ya?ml$/);
    const agDir = path.join(dir, 'agents');
    if (exists(agDir) && lane.id === 'Domain') extras.desks = globCount(agDir, /\.cjs$/);
    return { id: lane.id, role: lane.role, status: 'PRESENT', ...gitHead(dir), capabilities: caps, capabilityCount: caps.length, extras };
  });
}

function sovereignty(laneRows) {
  const domDir = path.join(ESTATE, 'Domain');
  const wfDir = path.join(domDir, '.github', 'workflows');
  const wfs = (() => { try { return fs.readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f)); } catch (_) { return []; } })();
  let ownerSecretWorkflows = 0;
  for (const f of wfs) {
    const t = readSafe(path.join(wfDir, f)) || '';
    if (/secrets\.(?!GITHUB_TOKEN)[A-Z_]+/.test(t)) ownerSecretWorkflows += 1;
  }
  const stasisRaw = readSafe(path.join(domDir, 'agents', 'STASIS.json'));
  let stasis = { present: !!stasisRaw, active: null, haltInCode: 0 };
  if (stasisRaw) { try { stasis.active = JSON.parse(stasisRaw).active === true; } catch (_) { stasis.active = null; } }
  for (const d of ['market-grid.cjs', 'market-exec.cjs', 'market-cycle.cjs']) {
    if (String(readSafe(path.join(domDir, 'agents', d)) || '').includes('STASIS-HALT')) stasis.haltInCode += 1;
  }
  const agDir = path.join(domDir, 'agents');
  const desks = (() => { try { return fs.readdirSync(agDir).filter((f) => /\.cjs$/.test(f)); } catch (_) { return []; } })();
  let gatedDesks = 0; const gatedNames = [];
  for (const d of desks) {
    const t = readSafe(path.join(agDir, d)) || '';
    if (/DRY_RUN|OWNER-GATED|_LIVE\s*=\s*['"]?1/.test(t)) { gatedDesks += 1; gatedNames.push(d.replace(/\.cjs$/, '')); }
  }
  let offlineDesks = 0; const offlineNames = [];
  for (const d of desks) {
    const head = String(readSafe(path.join(agDir, d)) || '').slice(0, 1200);
    if (/offline|keyless/i.test(head)) { offlineDesks += 1; offlineNames.push(d.replace(/\.cjs$/, '')); }
  }
  const vault = { keyring: !!String(readSafe(path.join(ESTATE, 'Zip', 'scripts', 'vault-keyring.mjs')) || '').length && exists(path.join(ESTATE, 'Zip', 'scripts', 'vault-keyring.mjs')), stdinIntake: String(readSafe(path.join(ESTATE, 'Zip', 'scripts', 'vault-keyring.mjs')) || '').includes('stdin'), runbook: exists(path.join(ESTATE, 'Zip', 'sovereign', 'vault', 'README.md')) };
  const platform = laneRows.find((l) => l.id === 'saos-sovereign-platform') || {};
  return {
    workflowsTotal: wfs.length,
    workflowsKeyless: wfs.length - ownerSecretWorkflows,
    workflowsOwnerSecret: ownerSecretWorkflows,
    stasis,
    gatedDesks, gatedNames: gatedNames.sort(),
    offlineDesks, offlineNames: offlineNames.sort(),
    vault,
    meshTests: (platform.extras && platform.extras.meshTests) || 0,
    estateCommits: laneRows.reduce((a, l) => a + (l.commits || 0), 0),
    estatePresent: laneRows.filter((l) => l.status === 'PRESENT').length,
  };
}

function blockers() {
  const kernelBps = extractFirstInt(readSafe(path.join(ESTATE, 'saos-dex', 'audit-package', 'src', 'kernel.ts')) || '', 'FEE_BPS');
  const exchangeBps = extractFirstInt(readSafe(path.join(ESTATE, 'saos-sovereign-platform', 'contracts', 'mesh', 'SAOSExchange.sol')) || '', 'FEE_BPS');
  const hist = readHistoryRows();
  let tvmMarkers = 0;
  try {
    const mesh = path.join(ESTATE, 'saos-sovereign-platform', 'contracts', 'mesh');
    for (const f of fs.readdirSync(mesh)) if (/\.sol$/.test(f) && /TVM|TRON/i.test(String(readSafe(path.join(mesh, f)) || ''))) tvmMarkers += 1;
  } catch (_) { tvmMarkers = null; }
  const execSrc = String(readSafe(path.join(ESTATE, 'Domain', 'agents', 'market-exec.cjs')) || '');
  const stasisRaw = readSafe(path.join(ESTATE, 'Domain', 'agents', 'STASIS.json'));
  let stasisActive = null; if (stasisRaw) { try { stasisActive = JSON.parse(stasisRaw).active === true; } catch (_) {} }
  return [
    { id: 'B1', title: 'fee-doctrine drift — same fleet, two prices (kernel vs SAOSExchange)', status: (kernelBps != null && exchangeBps != null && kernelBps === exchangeBps) ? 'RESOLVED' : 'OPEN', ownerGate: false, evidence: { kernelBps, exchangeBps } },
    { id: 'B2', title: 'cadence time-series too young for distribution verdicts (needs ~100+ rows)', status: hist.rows >= 100 ? 'RESOLVED' : 'OPEN', ownerGate: false, evidence: { historyRows: hist.rows, verdicts: hist.verdicts } },
    { id: 'B3', title: 'migration law ACTIVE — market-grid 40bps floor under-covers DEX round trips; any DEX bridge must re-space or stay maker-only', status: 'ACTIVE', ownerGate: false, evidence: { crossLayerDesk: exists(path.join(ESTATE, 'Domain', 'agents', 'cross-layer.cjs')), measuredBpsAtTenthPctDepth: 90 } },
    { id: 'B4', title: 'TVM absent — TRON exit = code+capital+authority, all operator-gated (X-1+X-2)', status: 'OPERATOR-GATED', ownerGate: true, evidence: { tvmContractMarkers: tvmMarkers } },
    { id: 'B5', title: 'binding constraint = capital+authority, not code — signing power stays the owner\'s by doctrine', status: 'OPERATOR-GATED', ownerGate: true, evidence: { dryRunDefault: /DRY_RUN/.test(execSrc), liveGate: /MARKET_EXEC_LIVE|MARKET_CYCLE_LIVE/.test(execSrc) } },
    { id: 'B6', title: 'STASIS breaker — fleet-wide halt state', status: stasisActive === true ? 'OPEN' : 'STANDING-BY', ownerGate: true, evidence: { active: stasisActive } },
  ];
}

function readHistoryRows() {
  const p = path.join(ESTATE, 'Domain', 'agents', 'market-grid-history.jsonl');
  const rows = [];
  const t = readSafe(p);
  if (t) for (const l of t.split('\n')) { if (!l.trim()) continue; try { rows.push(JSON.parse(l)); } catch (_) {} }
  const verdicts = {};
  for (const r of rows) verdicts[r.verdict || 'UNKNOWN'] = (verdicts[r.verdict || 'UNKNOWN'] || 0) + 1;
  return { rows: rows.length, verdicts, raw: rows };
}

function edgeSeries() {
  const hist = readHistoryRows();
  const paper = (() => { const t = readSafe(path.join(ESTATE, 'Domain', 'agents', 'market-grid-paper.jsonl')); return t ? t.split('\n').filter((l) => l.trim()).length : 0; })();
  const fillsLedger = (() => { try { const j = JSON.parse(readSafe(path.join(ESTATE, 'Domain', 'agents', 'fill-ledger-fills.jsonl')) || 'null'); return j; } catch (_) { return null; } })();
  let fillRows = 0;
  const flText = readSafe(path.join(ESTATE, 'Domain', 'agents', 'fill-ledger-fills.jsonl'));
  if (flText) fillRows = flText.split('\n').filter((l) => l.trim()).length;
  let dex = { version: null, orders: null, fills: null };
  try { const j = JSON.parse(readSafe(path.join(ESTATE, 'saos-dex', 'db', 'grid-ledger.json')) || 'null'); if (j) dex = { version: j.version || null, orders: (j.orders || []).length, fills: (j.fills || []).length }; } catch (_) {}
  return {
    internalMarketSpreads: {
      'HBD/HIVE': spreadSeries(hist.raw, 'HBD/HIVE'),
      'SBD/STEEM': spreadSeries(hist.raw, 'SBD/STEEM'),
    },
    historyRows: hist.rows,
    historyVerdicts: hist.verdicts,
    paperRows: paper,
    fillLedgerRows: fillRows,
    fillLedgerParsed: !!fillsLedger || fillRows > 0,
    dexGridLedger: dex,
  };
}

function wiringMap() {
  const dom = path.join(ESTATE, 'Domain');
  const arc = (id, law, fromRel, toRels, grepIn) => {
    const fromAbs = path.join(ESTATE, fromRel);
    const missing = [];
    if (!exists(fromAbs)) missing.push(fromRel);
    for (const t of toRels) if (!exists(path.join(ESTATE, t))) missing.push(t);
    let markerOk = true;
    if (grepIn && !missing.length) markerOk = String(readSafe(fromAbs) || '').includes(grepIn);
    return { id, law, from: fromRel, to: toRels, status: missing.length ? 'BROKEN(' + missing.join(',') + ')' : (markerOk ? 'WIRED' : 'WIRED(marker-missing)') };
  };
  return [
    arc('cadence-cron', 'keyless Actions cron 23,53 * * * * ticks the grid observer', 'Domain/.github/workflows/market-grid-cron.yml', ['Domain/agents/market-grid.cjs'], 'market-grid'),
    arc('grid-history', 'observer appends one history row per invocation (append-only law)', 'Domain/agents/market-grid.cjs', ['Domain/agents/market-grid-history.jsonl'], 'market-grid-history'),
    arc('stasis-brake', 'FATE-DEFENSE #1: an active STASIS halts desks in code before any read/write', 'Domain/agents/STASIS.json', ['Domain/agents/market-grid.cjs'], 'STASIS'),
    arc('fill-loop', 'eyes -> decision: fill-ledger measurement feeds the cycle composer', 'Domain/agents/fill-ledger.cjs', ['Domain/agents/market-cycle.cjs'], 'fill-ledger'),
    arc('cycle-hands', 'decision -> hands: cycle composer arms the verify-then-sign executor', 'Domain/agents/market-cycle.cjs', ['Domain/agents/market-exec.cjs'], 'market-exec'),
    arc('cross-layer-lens', 'the four-layer lens reads the DEX kernel and the platform exchange', 'Domain/agents/cross-layer.cjs', ['saos-dex/audit-package/src/kernel.ts', 'saos-sovereign-platform/contracts/mesh/SAOSExchange.sol']),
    arc('dex-grid-ledger', 'saos-dex grid heartbeat writes the DEX-side grid ledger', 'saos-dex/grid-beat.ts', ['saos-dex/db/grid-ledger.json']),
    arc('he-ladder-gate', 'the HE taker ladder is live-gated', 'steem/agent/he_ladder.cjs', ['steem/agent/gate-state.json']),
    arc('vault-ceremony', 'owner -> vault -> agents key ceremony with its permanent runbook', 'Zip/scripts/vault-keyring.mjs', ['Zip/sovereign/vault/README.md']),
    arc('census-map', 'this census maps all 16 lanes of the estate', 'Domain/agents/fleet-census.cjs', LANES.map((l) => l.id)),
  ];
}

function receipts() {
  const files = [
    'Domain/agents/market-grid.cjs', 'Domain/agents/market-grid-history.jsonl', 'Domain/.github/workflows/market-grid-cron.yml',
    'Domain/agents/market-exec.cjs', 'Domain/agents/fill-ledger.cjs', 'Domain/agents/market-cycle.cjs',
    'Domain/agents/cross-layer.cjs', 'Domain/agents/one-bloc.cjs', 'Domain/agents/STASIS.json',
    'Domain/agents/evals/run-evals.cjs', 'Domain/feature_list.json',
    'saos-dex/audit-package/src/kernel.ts', 'saos-dex/audit-package/src/amm.ts', 'saos-dex/db/grid-ledger.json',
    'steem/agent/he_ladder.cjs', 'saos-sovereign-platform/contracts/mesh/SAOSExchange.sol',
    'saos-sovereign-platform/contracts/mesh/SAOSLedger.sol', 'Zip/scripts/vault-keyring.mjs',
  ];
  const out = {};
  for (const f of files) { const h = sha256(path.join(ESTATE, f)); if (h) out[f] = h.slice(0, 16); }
  return out;
}

// ---------- stable payload (determinism law: byte-identical for the same tree) ----------

function censusStable() {
  const laneRows = laneInventory();
  const sov = sovereignty(laneRows);
  const blocks = blockers();
  const edges = edgeSeries();
  const wiring = wiringMap();
  const inventory = { lanes: laneRows, presentLanes: sov.estatePresent, totalLanes: LANES.length, estateCommits: sov.estateCommits };
  return {
    protocol: 'SAOS-FLEET-CENSUS/1',
    agent: 'fleet-census',
    estate: path.basename(ESTATE) === 'git-audit' ? '~/git-audit (16 lanes)' : ESTATE,
    inventory,
    sovereignty: {
      workflowsTotal: sov.workflowsTotal, workflowsKeyless: sov.workflowsKeyless, workflowsOwnerSecret: sov.workflowsOwnerSecret,
      stasis: sov.stasis, gatedDesks: sov.gatedDesks, gatedNames: sov.gatedNames,
      offlineDesks: sov.offlineDesks, offlineNames: sov.offlineNames,
      vault: sov.vault, meshTests: sov.meshTests,
    },
    blockers: blocks,
    edgeSeries: edges,
    wiring: wiring,
    receipts: receipts(),
    summary: {
      capabilities: laneRows.reduce((a, l) => a + l.capabilityCount, 0),
      wiringWired: wiring.filter((w) => w.status === 'WIRED').length,
      wiringArcs: wiring.length,
      blockersOpen: blocks.filter((b) => b.status === 'OPEN').length,
      blockersOperatorGated: blocks.filter((b) => b.status === 'OPERATOR-GATED').length,
      blockersLawsActive: blocks.filter((b) => b.status === 'ACTIVE').length,
    },
  };
}

function renderMd(c, at) {
  const L = [];
  L.push('# FLEET CENSUS — ' + at);
  L.push('');
  L.push('Offline · keyless · deterministic estate map (CR-0040). Answers: what do we hold, what limits us, how it wires.');
  L.push('');
  L.push('## Inventory — מה יש לנו (' + c.inventory.presentLanes + '/' + c.inventory.totalLanes + ' lanes present, ' + c.inventory.estateCommits + ' commits, ' + c.summary.capabilities + ' capability markers)');
  for (const l of c.inventory.lanes) {
    L.push('- **' + l.id + '** [' + l.status + '] ' + (l.head ? l.head + '@' + (l.at || '').slice(0, 10) : 'no-git') + ' · caps(' + l.capabilityCount + '): ' + (l.capabilities.join(', ') || '—') + (l.extras && Object.keys(l.extras).length ? ' · ' + Object.entries(l.extras).map(([k, v]) => k + '=' + v).join(' ') : ''));
  }
  L.push('');
  L.push('## Sovereignty — ריבונות');
  L.push('- workflows: ' + c.sovereignty.workflowsKeyless + ' keyless / ' + c.sovereignty.workflowsTotal + ' total (' + c.sovereignty.workflowsOwnerSecret + ' carry owner secrets)');
  L.push('- STASIS brake: present=' + c.sovereignty.stasis.present + ' active=' + c.sovereignty.stasis.active + ' halt-in-code desks=' + c.sovereignty.stasis.haltInCode);
  L.push('- gated desks (DRY/OWNER-GATED/LIVE env): ' + c.sovereignty.gatedDesks + ' — ' + c.sovereignty.gatedNames.join(', '));
  L.push('- offline/keyless desks: ' + c.sovereignty.offlineDesks + ' — ' + c.sovereignty.offlineNames.join(', '));
  L.push('- vault: keyring=' + c.sovereignty.vault.keyring + ' stdinIntake=' + c.sovereignty.vault.stdinIntake + ' runbook=' + c.sovereignty.vault.runbook + ' · mesh tests=' + c.sovereignty.meshTests);
  L.push('');
  L.push('## Blockers — מה חוסם אותנו (open=' + c.summary.blockersOpen + ', operator=' + c.summary.blockersOperatorGated + ', laws=' + c.summary.blockersLawsActive + ')');
  for (const b of c.blockers) L.push('- **' + b.id + '** [' + b.status + ']' + (b.ownerGate ? ' (owner)' : '') + ' ' + b.title + ' · evidence: ' + JSON.stringify(b.evidence));
  L.push('');
  L.push('## Edge series — measured (from our own ledgers)');
  L.push('- history rows: ' + c.edgeSeries.historyRows + ' ' + JSON.stringify(c.edgeSeries.historyVerdicts) + ' · paper rows: ' + c.edgeSeries.paperRows);
  for (const [k, v] of Object.entries(c.edgeSeries.internalMarketSpreads)) L.push('- ' + k + ' spread%: ' + (v.n ? 'n=' + v.n + ' min=' + v.min + ' max=' + v.max + ' last=' + v.last : 'no rows'));
  L.push('- dex grid ledger: ' + JSON.stringify(c.edgeSeries.dexGridLedger) + ' · fill-ledger rows: ' + c.edgeSeries.fillLedgerRows);
  L.push('');
  L.push('## Wiring — חיבור (' + c.summary.wiringWired + '/' + c.summary.wiringArcs + ' WIRED)');
  for (const w of c.wiring) L.push('- [' + w.status + '] ' + w.id + ' — ' + w.law);
  L.push('');
  L.push('## Receipts (sha256-16)');
  for (const [k, v] of Object.entries(c.receipts)) L.push('- ' + k + ' ' + v);
  L.push('');
  return L.join('\n') + '\n';
}

function main() {
  // FATE-DEFENSE law #1 — the desk-side gate: an ACTIVE STASIS halts in code BEFORE any
  // lane scan (zero reads beyond the breaker file itself), books the halt honestly, exit 0.
  const halt = stasisHalt();
  const at = new Date().toISOString();
  if (halt.active) {
    try {
      fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-FLEET-CENSUS/1', agent: 'fleet-census', verdict: 'STASIS-HALT', stasis: halt, ok: true, at }, null, 2) + '\n');
    } catch (_) {}
    console.log('STASIS-HALT fleet-census · breaker active (' + halt.source + ') — the map stands still by law, not by neglect.');
    process.exit(0);
  }
  // SINGLE-LANE-WORKSPACE LAW (R16, CR-0042 — found by the fleet-delta desk on its first
  // live run): a workspace where exactly ONE lane dir is visible is a CI CHECKOUT ARTIFACT
  // (actions/checkout brings this repo alone), never a real estate state. The desk books
  // the honest diminished receipt to agents/fleet-census.artifact.json — which is what the
  // CI-perspective artifact-vs-artifact delta series feeds on — and leaves the CANONICAL
  // 16-lane map UNTOUCHED: a partial view must never downgrade the canonical map, and the
  // perspective flip must never masquerade as estate drift (the no-noise law). A full or
  // partially-broken estate writes the canonical map as before — a REAL collapse is still
  // recorded; only the one-lane artifact view is quarantined.
  const visibleLanes = LANES.filter((l) => exists(path.join(ESTATE, l.id))).length;
  if (visibleLanes === 1) {
    try {
      const stable = censusStable();
      fs.writeFileSync(OUT_ARTIFACT, JSON.stringify({ ...stable, at, ok: true }, null, 2) + '\n');
      console.log('FLEET-CENSUS-ARTIFACT single-lane workspace (' + visibleLanes + '/' + LANES.length + ' lanes visible) — canonical map untouched; CI-perspective receipt -> agents/fleet-census.artifact.json');
    } catch (e) {
      console.log('FLEET-CENSUS-ARTIFACT-ERROR ' + String(e && e.message).slice(0, 160));
    }
    process.exit(0); // fail-soft law
  }
  try {
    const stable = censusStable();
    const book = { ...stable, at, ok: true };
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 2) + '\n');
    fs.writeFileSync(OUT_MD, renderMd(stable, at));
    console.log('FLEET-CENSUS ' + stable.inventory.presentLanes + '/' + stable.inventory.totalLanes + ' lanes · caps=' + stable.summary.capabilities + ' · wiring=' + stable.summary.wiringWired + '/' + stable.summary.wiringArcs + ' · blockers open=' + stable.summary.blockersOpen + ' operator=' + stable.summary.blockersOperatorGated + ' laws=' + stable.summary.blockersLawsActive);
  } catch (e) {
    try { fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-FLEET-CENSUS/1', agent: 'fleet-census', ok: false, error: String(e && e.message).slice(0, 200), at: new Date().toISOString() }, null, 2) + '\n'); } catch (_) {}
    console.log('FLEET-CENSUS-ERROR ' + String(e && e.message).slice(0, 160));
  }
  process.exit(0); // fail-soft law
}

if (require.main === module) main();
module.exports = { spreadSeries, extractFirstInt, censusStable, LANES, stasisHalt };
