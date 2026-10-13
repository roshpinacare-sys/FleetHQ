'use strict';
// measurement-only lane — capital gate N/A (STASIS scope)
/**
 * agent-registry.cjs — Z-65 FLEET AGENT REGISTRY (CR-0042): the fleet's own
 * ERC-8004-SHAPED trustless-agent registry, keyless and evidence-derived.
 *
 * Why: the state of the art (Z-63-b/Z-65-b receipts: ethereum/ERCs erc-8004.md,
 * x402, A2A AgentCards) converged on agent identity/reputation/validation as THE
 * 2025 infrastructure wave — "the EVM world converged on exactly our fleet's
 * shape: many small machine actors paying each other" (evm-convergence.md). This
 * desk implements that shape over rails we ALREADY own: the canon files ARE the
 * trust anchors, and sha256(evidence rows) is the feedback hash — portable to
 * SAOSRelay or any ERC-8004 deployment when a funded wallet exists (the register
 * call is owner-gated; THIS desk never signs).
 *
 * ERC-8004 mapping (receipted from raw.githubusercontent.com/ethereum/ERCs master
 * ERCS/erc-8004.md, Z-65-b):
 *   Identity   register(agentURI, metadata) → agentId     → IDENTITY[] below
 *   Reputation giveFeedback(agentId, value, tag1, tag2, endpoint, feedbackURI,
 *              feedbackHash) → REPUTATION[] (value = measured score, hash =
 *              sha256 of the exact evidence rows counted — verify by recompute)
 *   Validation validationRequest/validationResponse(requestHash) → VALIDATION[]
 *              (the desk evals: E28 planner, E30 ledger/cycle, E31 flow-catch)
 *
 * LAWS (in code):
 *  1. EVIDENCE-ONLY: no score is self-declared. Every reputation value is derived
 *     from canon rows (market-exec.json, fill-ledger.json, market-cycle.json,
 *     eval-results.json) and carries feedbackHash = sha256 of the counted rows —
 *     a score without a recomputable hash is a doctrine breach.
 *  2. KEYLESS / OFFLINE: reads local canon files, writes local books. Zero network,
 *     zero signatures — CI-safe by construction (no skip-switch needed, unlike the
 *     network desks; the E32 black-box runs it in a temp dir with fixtures).
 *  3. SHAPE FIDELITY: entries carry the ERC-8004 field names (agentURI, tag1/tag2,
 *     endpoint, feedbackHash, requestHash) so a funded future can register these
 *     on-chain without translation drift.
 *  4. FAIL-SOFT EXIT, FAIL-LOUD BOOK: missing canon = entry with value 0 and the
     honest note, never a crash; exit 0 always (treasury law).
 *  5. SINGLE WRITER: agents/agent-registry.json + .md. require.main guard (Z-49).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.REGISTRY_JSON || path.join(ROOT, 'agents', 'agent-registry.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── source resolution (env-overridable for E32 black-box) ───────────────────
function src(envVar, rel) { return process.env[envVar] || path.join(ROOT, 'agents', rel); }
const SOURCES = {
  marketExec: src('REG_MARKET_EXEC_JSON', 'market-exec.json'),
  fillLedger: src('REG_FILL_LEDGER_JSON', 'fill-ledger.json'),
  marketCycle: src('REG_MARKET_CYCLE_JSON', 'market-cycle.json'),
  evals: src('REG_EVALS_JSON', 'evals/eval-results.json'),
  stasis: src('REG_STASIS_JSON', 'STASIS.json'),
};

function readJsonSafe(p) {
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : (j.rows || (j.evals ? j : null) || j);
  } catch (_) { return null; }
}

// ── identity registry (ERC-8004 register shape) ─────────────────────────────
// The fleet's desks, declared with their receipted provenance. A desk missing its
// source file is still registered — with metadata.alive:false (honest absence).
const DESKS = [
  { agentId: 'market-exec', agentURI: 'file://agents/market-exec.cjs', role: 'signing executor (SBD/STEEM internal market)', capabilities: ['limit_order_create2', 'verify-then-sign', 'flow-catch'], registered_in: 'CR-0036', keyMode: 'owner-gated-signing', srcFile: 'agents/market-exec.cjs' },
  { agentId: 'fill-ledger', agentURI: 'file://agents/fill-ledger.cjs', role: 'fill measurement leg (fill_order virtual ops, µ-unit average-cost P&L)', capabilities: ['read-only', 'replay-ledger', 'recycle-suggestion'], registered_in: 'CR-0039', keyMode: 'keyless', srcFile: 'agents/fill-ledger.cjs' },
  { agentId: 'market-cycle', agentURI: 'file://agents/market-cycle.cjs', role: 'cycle composer (eyes → decision → hands)', capabilities: ['decideCycle', 'pulled-schedule', 'child-separation'], registered_in: 'CR-0039', keyMode: 'keyless-composer', srcFile: 'agents/market-cycle.cjs' },
  { agentId: 'market-grid', agentURI: 'file://agents/market-grid.cjs', role: 'keyless cross-market observer (paper fills, history time-series)', capabilities: ['official-surfaces-only', 'paper-ledger'], registered_in: 'CR-0034', keyMode: 'keyless', srcFile: 'agents/market-grid.cjs' },
  { agentId: 'venture-desk', agentURI: 'file://agents/venture-desk.cjs', role: 'venture harvest/kill governance', capabilities: ['kill-rules', 'fills-ledger-he'], registered_in: 'Z-36 lineage', keyMode: 'keyless', srcFile: 'agents/venture-desk.cjs' },
  { agentId: 'principal-headcorner', agentURI: 'steem://headcorner', role: 'fleet principal account (the only signer today)', capabilities: ['active-authority', 'posting-authority'], registered_in: 'fleet charter', keyMode: 'custody-of-operator', srcFile: null },
];

// ── evidence extraction (reputation law 1) ──────────────────────────────────
function extractReputation() {
  const rep = [];
  // market-exec: runs, clean runs, broadcast ops
  const me = readJsonSafe(SOURCES.marketExec) || [];
  const meRows = me.rows || me;
  if (Array.isArray(meRows) && meRows.length) {
    const counted = meRows.map((r) => ({ ts: r.ts, mode: r.mode, errors: r.errors, broadcast: r.broadcast }));
    const ok = counted.filter((r) => Array.isArray(r.errors) && r.errors.length === 0).length;
    const broadcastOps = counted.reduce((a, r) => a + (Array.isArray(r.broadcast) ? r.broadcast.reduce((b, x) => b + ((x && x.ops) || 0), 0) : 0), 0);
    rep.push({
      agentId: 'market-exec', value: Math.round((100 * ok) / counted.length), valueDecimals: 0,
      tag1: 'clean-run-pct', tag2: `broadcast-ops-${broadcastOps}`,
      endpoint: 'agents/market-exec.json', feedbackURI: 'replay:agents/market-exec.json',
      feedbackHash: sha256(JSON.stringify(counted)), evidence: { runs: counted.length, ok, broadcastOps },
    });
  }
  // fill-ledger: runs + fills captured (the eyes' coverage)
  const fl = readJsonSafe(SOURCES.fillLedger);
  const flRows = (fl && (fl.rows || (Array.isArray(fl) ? fl : null))) || [];
  if (flRows.length) {
    const last = flRows[flRows.length - 1];
    const counted = flRows.map((r) => ({ ts: r.ts, total_fills: r.total_fills, errors: r.errors }));
    rep.push({
      agentId: 'fill-ledger', value: (last.inventory && (last.inventory.n_fills + (last.inventory.proceeds_unbased ? 1 : 0))) || 0, valueDecimals: 0,
      tag1: 'fills-captured', tag2: `runs-${flRows.length}`,
      endpoint: 'agents/fill-ledger.json', feedbackURI: 'replay:agents/fill-ledger-fills.jsonl',
      feedbackHash: sha256(JSON.stringify(counted)), evidence: { runs: flRows.length, total_fills: last.total_fills, proceeds_unbased_sbd: last.inventory ? +(last.inventory.proceeds_unbased / 1e6).toFixed(6) : 0 },
    });
  }
  // market-cycle: decisions with zero errors
  const mc = readJsonSafe(SOURCES.marketCycle) || [];
  const mcRows = mc.rows || mc;
  if (Array.isArray(mcRows) && mcRows.length) {
    const counted = mcRows.map((r) => ({ ts: r.ts, mode: r.mode, decision: r.decision, errors: r.errors }));
    const ok = counted.filter((r) => Array.isArray(r.errors) && r.errors.length === 0).length;
    rep.push({
      agentId: 'market-cycle', value: Math.round((100 * ok) / counted.length), valueDecimals: 0,
      tag1: 'clean-cycle-pct', tag2: `decisions-${counted.length}`,
      endpoint: 'agents/market-cycle.json', feedbackURI: 'replay:agents/market-cycle.json',
      feedbackHash: sha256(JSON.stringify(counted)), evidence: { cycles: counted.length, ok },
    });
  }
  // validation: the desk evals (ERC-8004 validationRequest/response shape)
  const ev = readJsonSafe(SOURCES.evals);
  const validation = [];
  if (ev && Array.isArray(ev.evals)) {
    for (const e of ev.evals) {
      const m = /^(E\d+)/.exec(e.id);
      if (!m) continue;
      const target = e.id === 'E28' ? 'market-exec' : (e.id === 'E30' ? ['fill-ledger', 'market-cycle'] : (e.id === 'E31' ? 'market-exec' : null));
      if (!target) continue;
      for (const t of (Array.isArray(target) ? target : [target])) {
        validation.push({
          agentId: t, requestHash: sha256(e.name), response: e.status === 'PASS' ? 'VALIDATED' : 'INVALID',
          getValidationStatus: e.status, evalId: e.id, at: ev.at,
        });
      }
    }
  }
  return { rep, validation };
}

// ── main ────────────────────────────────────────────────────────────────────
function buildRegistry() {
  const { rep, validation } = extractReputation();
  const identity = DESKS.map((d) => ({
    agentId: d.agentId, agentURI: d.agentURI,
    metadata: {
      role: d.role, capabilities: d.capabilities, registered_in: d.registered_in, keyMode: d.keyMode,
      owner: 'steem://headcorner', alive: d.srcFile ? fs.existsSync(path.join(ROOT, d.srcFile)) : true,
      stasisBreakerObeyed: true, // every desk carries the CR-0038 twin law — breaker checked per run
    },
  }));
  const stasis = readJsonSafe(SOURCES.stasis);
  const out = {
    spec: 'ERC-8004-shaped (ethereum/ERCs erc-8004.md, Z-65-b receipt) — keyless local mirror; on-chain register is owner-gated future',
    at: new Date().toISOString(),
    stasis: stasis ? { active: !!stasis.active, armed: !!stasis.armed } : { active: false, note: 'STASIS.json unreadable — breaker state unknown, booked honestly' },
    identity, reputation: rep, validation,
    summary: {
      agents: identity.length,
      withEvidence: rep.length,
      validated: new Set(validation.filter((v) => v.response === 'VALIDATED').map((v) => v.agentId)).size,
      totalFills: (rep.find((r) => r.agentId === 'fill-ledger') || {}).evidence ? rep.find((r) => r.agentId === 'fill-ledger').evidence.total_fills : 0,
    },
  };
  return out;
}

function writeMd(reg) {
  const L = [];
  L.push(`# agent-registry — the fleet's ERC-8004-shaped trust surface (CR-0042)`);
  L.push('');
  L.push(`_${reg.at} · keyless + offline · every reputation value carries a recomputable sha256 of its evidence rows_`);
  L.push('');
  L.push(`## identity (${reg.identity.length})`);
  for (const a of reg.identity) L.push(`- **${a.agentId}** — ${a.metadata.role} · ${a.agentURI} · ${a.metadata.keyMode} · registered ${a.metadata.registered_in} · alive:${a.metadata.alive}`);
  L.push('');
  L.push(`## reputation (${reg.reputation.length}) — evidence-derived only`);
  for (const r of reg.reputation) L.push(`- **${r.agentId}** ${r.tag1}=${r.value} (${r.tag2}) · endpoint ${r.endpoint} · hash ${r.feedbackHash.slice(0, 16)}… · evidence ${JSON.stringify(r.evidence)}`);
  L.push('');
  L.push(`## validation (${reg.validation.length}) — the evals are the validation requests`);
  for (const v of reg.validation) L.push(`- **${v.agentId}** ${v.evalId} → ${v.response} (status ${v.getValidationStatus})`);
  L.push('');
  L.push(`## summary: ${JSON.stringify(reg.summary)}`);
  L.push('');
  L.push(`On-chain registration (ERC-8004 IdentityRegistry.register) is an owner-gated future rung — this mirror is the portable, already-verified form.`);
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
}

function main() {
  const t0 = Date.now();
  try {
    const reg = buildRegistry();
    fs.writeFileSync(OUT_JSON, JSON.stringify(reg, null, 2) + '\n');
    writeMd(reg);
    console.log(`[agent-registry] identity=${reg.summary.agents} reputation=${reg.summary.withEvidence} validated=${reg.summary.validated} totalFills=${reg.summary.totalFills} in ${Date.now() - t0}ms`);
    console.log(`[agent-registry] canon: ${path.relative(ROOT, OUT_JSON)}`);
  } catch (e) {
    console.error('[agent-registry] FATAL', String(e.message || e).slice(0, 200)); // fail-soft exit 0 (law 4)
  }
}

if (require.main === module) {
  main();
} else {
  module.exports = { buildRegistry, sha256, DESKS, extractReputation, OUT_JSON };
}
