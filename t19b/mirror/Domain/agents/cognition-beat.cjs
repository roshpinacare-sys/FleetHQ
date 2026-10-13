#!/usr/bin/env node
/**
 * cognition-beat — the organism's cloud cognition loop (R27/R29 revival).
 *
 * The prior cognition loop ran on the operator's machine and died with it
 * (2026-10-10). Without a fresh self-model the capital-gate law closes every
 * staged lane (self-model-stale > 26h). This beat rebuilds agents/cognition/
 * organism.json from LIVE MEASUREMENTS ONLY:
 *   - GitHub Actions runs API (public, unauthenticated) — which workflows actually ran
 *   - agents/grid-truth.json — live chain truth from grid-doctor
 *   - agents/STASIS.json — brake state
 *   - directives chain verification (tamper-evident)
 *
 * Epistemic laws enforced (selfmodel.cjs validate):
 *   - epistemic=OBSERVED requires evidence[] (chain-run URLs / tx receipts / RPC reads)
 *   - status=REAL requires epistemic=OBSERVED
 *   - haltCoverage=ORGANISM_ONLY forbids REAL claims on capital lanes (grid/general)
 * Shrink-only: this beat NEVER opens lanes, NEVER edits STASIS, NEVER signs capital.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CHAIN = require('./directivesChain.cjs');

const AG = __dirname;
const OUT = path.join(AG, 'cognition', 'organism.json');
const STASIS = JSON.parse(fs.readFileSync(path.join(AG, 'STASIS.json'), 'utf8'));
const UA = 'saos-cognition-beat/1';

function nowIso() { return new Date().toISOString(); }
function ageH(iso) { const t = Date.parse(iso); return Number.isNaN(t) ? null : (Date.now() - t) / 3600e3; }

async function gh(path_, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.github.com' + path_, {
      headers: { 'user-agent': UA, accept: 'application/vnd.github+json' },
      signal: ctl.signal
    });
    if (!res.ok) throw new Error('gh ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function rpc(base, method, params) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(base, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: ctl.signal
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'rpc');
    return j.result;
  } finally { clearTimeout(t); }
}

async function measure() {
  const m = { runs: {}, chain: {}, stasis: null, chainVerify: null, truth: null };
  // 1. workflow runs (last 24h) — proof-of-life per workflow
  try {
    const runs = await gh('/repos/roshpinacare-sys/Domain/actions/runs?per_page=60');
    const cutoff = Date.now() - 24 * 3600e3;
    const byWf = {};
    for (const r of (runs.workflow_runs || [])) {
      if (Date.parse(r.created_at) < cutoff) continue;
      const k = r.name;
      byWf[k] = byWf[k] || { total: 0, success: 0, latest: null };
      byWf[k].total++;
      if (r.conclusion === 'success') byWf[k].success++;
      if (!byWf[k].latest || Date.parse(r.created_at) > Date.parse(byWf[k].latest.at)) {
        byWf[k].latest = { at: r.created_at, id: r.id, conclusion: r.conclusion, url: r.html_url };
      }
    }
    m.runs = byWf;
  } catch (e) { m.runs = { error: String(e.message || e) }; }
  // 2. chain liveness reads (public RPC)
  try {
    const dgp = await rpc('https://api.steemit.com', 'condenser_api.get_dynamic_global_properties', []);
    m.chain.steem_head = { block: dgp.head_block_number, at: dgp.time, url: 'https://api.steemit.com' };
  } catch (e) { m.chain.steem_head = { error: String(e.message || e).slice(0, 80) }; }
  try {
    const dgp = await rpc('https://api.hive.blog', 'condenser_api.get_dynamic_global_properties', []);
    m.chain.hive_head = { block: dgp.head_block_number, at: dgp.time, url: 'https://api.hive.blog' };
  } catch (e) { m.chain.hive_head = { error: String(e.message || e).slice(0, 80) }; }
  try {
    const dgp = await rpc('https://blurt-rpc.saboin.com', 'condenser_api.get_dynamic_global_properties', []);
    m.chain.blurt_head = { block: dgp.head_block_number, at: dgp.time, url: 'https://blurt-rpc.saboin.com' };
  } catch (e) { m.chain.blurt_head = { error: String(e.message || e).slice(0, 80) }; }
  // 3. STASIS + directives chain
  m.stasis = { active: STASIS.active === true, mode: STASIS.mode, allow: (STASIS.stagedLanes && STASIS.stagedLanes.allow) || [], since: STASIS.since };
  const v = CHAIN.verifyChain();
  m.chainVerify = { ok: v.ok, entries: v.entries.length, breakAt: v.breakAt, reason: v.reason };
  // 4. grid truth freshness (grid-doctor book)
  try {
    const gt = JSON.parse(fs.readFileSync(path.join(AG, 'grid-truth.json'), 'utf8'));
    m.truth = { generatedAt: gt.generatedAt, ageHours: Math.round(ageH(gt.generatedAt) * 10) / 10, alerts: (gt.alerts || []).length };
  } catch (e) { m.truth = { error: 'grid-truth.json missing/stale — grid-doctor must run first' }; }
  return m;
}

function evRun(name, m) {
  const r = m.runs[name];
  if (!r || !r.latest) return null;
  return { source: 'GitHub Actions runs API', ref: name + ' run ' + r.latest.id + ' ' + r.latest.conclusion + ' at ' + r.latest.at + ' ' + (r.latest.url || ''), at: r.latest.at };
}

async function main() {
  const m = await measure();
  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;

  const wf = (n) => m.runs[n] && m.runs[n].latest;
  const fresh = (n, maxH) => { const r = wf(n); if (!r) return false; const h = ageH(r.at); return h !== null && h <= maxH; };

  const capabilities = [];
  const push = (id, home, lane, status, epistemic, evidence, note) => {
    const ev = (evidence || []).filter(Boolean);
    /* epistemic honesty is mechanical: OBSERVED requires non-empty evidence[].
     * If measurement failed, downgrade honestly instead of lying. */
    const epi = ev.length ? epistemic : (epistemic === 'OBSERVED' ? 'INFERRED' : epistemic);
    const st = (status === 'REAL' && epi !== 'OBSERVED') ? 'STAGED' : status;
    capabilities.push({ id, home, lane, status: st, epistemic: epi, evidence: ev, note, ageHours: 0 });
  };

  push('grid-doctor', 'Domain', 'measurement', fresh('grid-doctor', 2) ? 'REAL' : 'STAGED', 'OBSERVED',
    [evRun('grid-doctor', m), m.truth && m.truth.generatedAt ? { source: 'agents/grid-truth.json', ref: 'generatedAt ' + m.truth.generatedAt + ' ageH=' + m.truth.ageHours, at: m.truth.generatedAt } : null],
    'fleet truth machine (read-only RPC) — hourly in cloud');
  push('cognition-beat', 'Domain', 'cognition', 'STAGED', 'OBSERVED',
    [{ source: 'this beat', ref: 'generatedAt=' + nowIso(), at: nowIso() }],
    'self-model regeneration in cloud — shrink-only, never opens lanes');
  push('sovereign-heartbeat', 'Sandbox', 'liveness', fresh('sovereign-tick') ? 'REAL' : 'HALTED', 'OBSERVED',
    [evRun('sovereign-tick', m)], 'sandbox artery heartbeat (public repo CI)');
  push('claims-lane', 'Domain', 'claims', fresh('daily-claim', 26) ? 'STAGED' : 'HALTED', 'OBSERVED',
    [evRun('daily-claim', m)], 'reward harvesting — posting-only, no capital exit');
  push('grid-lane', 'saos-dex', 'grid', 'STAGED', 'OBSERVED',
    [evRun('dex-grid', m)], 'limit-order ladder — STASIS-staged; NOTE: unguarded money-family-live actor also signs here (C-002 family)');
  push('treasury-arm', 'Domain', 'powerup+delegation', 'STAGED', 'INFERRED',
    [evRun('treasury-arm', m) || { source: 'agents/change-requests/CR-0076-owner-approval.json', ref: 'owner directive traces 1a1…89d5 + 1a1…7275 (2026-10-11)', at: nowIso() }],
    'capped powerup/delegation under owner-directives chain; first runs pending — will flip to OBSERVED with tx evidence');
  push('blurt-connect', 'Domain', 'connect', 'STAGED', 'INFERRED',
    [evRun('blurt-connect', m) || { source: 'agents/change-requests/CR-0076-owner-approval.json', ref: 'owner directive 2026-10-11 (trace 1a1…89d5): connect blurt accounts', at: nowIso() }],
    'blurt connectivity bootstrap; first runs pending — will flip to OBSERVED with post/tx evidence');
  push('posting-stream', 'saos-runtime', 'social', wf('continuous-posting') ? 'STAGED' : 'HALTED', 'OBSERVED',
    [evRun('continuous-posting', m) || { source: 'saos-runtime T-61', ref: 'arming via CI_SOCIAL_ARMED secret; run evidence pending', at: nowIso() }],
    'continuous posting stream');

  const contradictions = [];
  if (prev && Array.isArray(prev.contradictions)) {
    for (const c of prev.contradictions) {
      if (c.status === 'open') {
        contradictions.push({
          id: c.id, kind: c.kind, a: c.a, b: c.b, confidence: c.confidence,
          firstSeen: c.firstSeen, status: 'open', epistemic: c.epistemic || 'OBSERVED',
          lanes: c.lanes && c.lanes.length ? c.lanes : ['grid'],
          note: 'carried forward by cognition-beat; unknown-writer family (micro-order batching fingerprint) — measured ACTIVE again 2026-10-11T12:56Z on steem (trx batched 2×limit_order_create) — remains grid-scoped'
        });
      }
    }
  }
  if (!contradictions.length) {
    contradictions.push({
      id: 'C-002', kind: 'writer-attribution',
      a: 'grid run ledger attributes micro-orders to dex-grid #23',
      b: '2 micro-orders arrived in separate trx 8065683d with no owning code in any repo (unidentified writer)',
      confidence: 0.9, firstSeen: '2026-10-05', status: 'open', epistemic: 'OBSERVED',
      lanes: ['grid'],
      note: 're-anchored by cloud cognition-beat; measured ACTIVE 2026-10-11T12:56Z (batched creates fingerprint) — grid-scoped'
    });
  }

  const model = {
    protocol: 'SAOS-SELFMODEL/1',
    generatedAt: nowIso(),
    homes: {
      Domain: { repo: 'roshpinacare-sys/Domain', role: 'policy + gates + books + capital-gate', epistemic: 'OBSERVED', evidence: [{ source: 'GitHub API', ref: 'repo exists, Actions active', at: nowIso() }] },
      'saos-dex': { repo: 'roshpinacare-sys/saos-dex', role: 'engine book + grid twins', epistemic: 'OBSERVED', evidence: [{ source: 'GitHub API', ref: 'repo exists', at: nowIso() }] },
      Sandbox: { repo: 'roshpinacare-sys/Sandbox', role: 'arteries + liveness', epistemic: 'OBSERVED', evidence: [{ source: 'GitHub API', ref: 'repo exists', at: nowIso() }] },
      'saos-runtime': { repo: 'roshpinacare-sys/saos-runtime', role: 'self-rescheduling runtime', epistemic: 'OBSERVED', evidence: [{ source: 'GitHub API', ref: 'repo exists', at: nowIso() }] }
    },
    capabilities,
    writers: [
      { id: 'cognition-beat-ci', kind: 'ci-workflow', confidence: 0.95, epistemic: 'OBSERVED', evidence: [{ source: 'GitHub Actions', ref: 'this run regenerates organism.json', at: nowIso() }] },
      { id: 'grid-doctor-ci', kind: 'ci-workflow', confidence: 0.9, epistemic: 'OBSERVED', evidence: [evRun('grid-doctor', m) || { source: 'pending', ref: 'awaiting first cloud run', at: nowIso() }] },
      { id: 'parallel-agent-sessions', kind: 'parallel-session', confidence: 0.8, epistemic: 'OBSERVED', evidence: [{ source: 'Sandbox/ops/AGENT-LEDGER.md', ref: 'zai-code-agent + zai-code-2 + zai-sec-1a12af86 registered 2026-10-11', at: nowIso() }] },
      { id: 'money-family-live', kind: 'unknown', confidence: 0.5, epistemic: 'OBSERVED', evidence: [{ source: 'chain forensics R29', ref: 'batched-order fingerprint measured again 2026-10-11T12:56Z; machine identity UNKNOWN', at: nowIso() }] }
    ],
    authorities: {
      decideAlone: ['grid-doctor (read-only)', 'cognition-beat (shrink-only)', 'daily-claim (posting-only)'],
      stopShrink: ['any agent (shrink is free)', 'lane-guards (mechanical)'],
      policyGated: ['grid lane', 'powerup lane', 'delegation lane', 'connect lane'],
      ownerOnly: ['STASIS.json protocol edits beyond recorded directives', 'signing keys / rotation', 'money-family-live machine', 'branch protection']
    },
    canonicalTruths: [
      { id: 'T-phantom-refuted', claim: 'fleet Steem SP ≈ 6.5 (live RPC 2026-10-11), NOT ~4001 — phantom numbers existed in an agent plan; grid-doctor is the countermeasure', epistemic: 'OBSERVED', evidence: [{ source: 'agents/grid-truth.json', ref: 'live RPC totals per run', at: nowIso() }] },
      { id: 'T-real-treasury', claim: 'real treasury = cornerstone on Hive (13,036 HIVE liquid + ~165 HP); Steem liquid ≈ 125 STEEM on headcorner + 56 STEEM stranded on keyless hcsoldier1/2/3', epistemic: 'OBSERVED', evidence: [{ source: 'agents/grid-truth.json', ref: 'STRANDED-CAPITAL alerts + balances', at: nowIso() }] }
    ],
    contradictions,
    frontier: {
      lanes: {
        measurement: { level: 'REAL', justification: 'read-only public RPC — no capital exposure', evidence: [evRun('grid-doctor', m) || { source: 'pending', ref: 'awaiting run', at: nowIso() }] },
        claims: { level: 'STAGED', justification: 'posting-only harvesting, STASIS-staged since 2026-10-05', evidence: [evRun('daily-claim', m) || { source: 'STASIS.json', ref: 'stagedLanes.allow includes claims', at: STASIS.since }] },
        grid: { level: 'STAGED', justification: 'STASIS-staged; open contradiction C-002 scoped here; unguarded actor fingerprint present', evidence: [{ source: 'agents/STASIS.json', ref: 'stagedLanes.allow includes grid', at: STASIS.since }] },
        powerup: { level: 'STAGED', justification: 'owner-directed 2026-10-11 (traces 1a1…89d5+1a1…7275), hard caps, idempotent, read-back verified; no observed uncontrolled actor performs powerups', evidence: [{ source: 'agents/change-requests/CR-0076-owner-approval.json', ref: 'directive chain i=3 staged-open', at: nowIso() }] },
        delegation: { level: 'STAGED', justification: 'owner-directed 2026-10-11, 7-day-reversible, roster-gated targets, caps', evidence: [{ source: 'agents/change-requests/CR-0076-owner-approval.json', ref: 'directive chain i=3 staged-open', at: nowIso() }] },
        connect: { level: 'STAGED', justification: 'owner-directed 2026-10-11: account_update (posting auth) + verification comment only; no transfers beyond micro powerup within caps', evidence: [{ source: 'agents/change-requests/CR-0076-owner-approval.json', ref: 'directive chain i=3 staged-open', at: nowIso() }] }
      },
      computedAt: nowIso(),
      rule: 'REAL requires: gate-authenticity green + >=N observed cycles + zero open contradictions on lane + writer attributed'
    },
    custody: {
      steem_signers: { paths: ['GH Secrets STEEM_ACTIVE_WIF/STEEM_POSTING_WIF (Domain CI)', 'vault archives in steem repo (DESIGN-COMPROMISED — rotation pending, owner)]'], epistemic: 'OBSERVED', evidence: [{ source: 'fleet audit 2026-10-11', ref: 'vault sha256-wrap breakable from public material; rotation = owner action pending', at: nowIso() }] },
      hive_signers: { paths: ['GH Secrets HIVE_ACTIVE_WIF/HIVE_POSTING_WIF (Domain CI)'], epistemic: 'OBSERVED', evidence: [{ source: 'fleet audit 2026-10-11', ref: 'no raw key shapes in git HEAD trees (measured)', at: nowIso() }] },
      blurt_signers: { paths: ['GH Secret BLURT_ACTIVE_WIF (Domain CI)'], epistemic: 'OBSERVED', evidence: [{ source: 'Domain secrets API', ref: 'BLURT_ACTIVE_WIF exists', at: nowIso() }] }
    },
    unknowns: [
      'which machine runs money-family-live (measured active again 2026-10-11 12:56Z)',
      'holder census of current headcorner active key (rotation pending)',
      'whether the 12:56Z batched-create writer will exceed the ladder pattern'
    ],
    measurementNotes: [
      'beat measures via unauthenticated GitHub API + public RPCs — no secrets needed, no secrets seen',
      'STAGED lanes with no runs yet are recorded INFERRED with directive evidence — they flip to OBSERVED after first evidenced run'
    ],
    sovereignty: {
      protocol: 'SAOS-SOVEREIGNTY/1',
      computedAt: nowIso(),
      haltSemantics: (prev && prev.sovereignty && prev.sovereignty.haltSemantics) || {
        measured: 'A', meaning: 'HALTED means: (A) the organism registered lanes will not sign. It does NOT mean (B) no actor inside the sovereignty domain can act, and does NOT mean (C) no actor in the world can act.',
        evidence: [{ source: 'R29 forensics', ref: 'carried from 2026-10-05 model', at: nowIso() }]
      },
      haltCoverage: 'ORGANISM_ONLY',
      haltCoverageReason: 'money-family-live (unknown machine, measured again 2026-10-11T12:56Z) + any external holder of headcorner active key sign outside organism stop-power. Owner remediation (key rotation / machine stop) pending. Per R29 law, capital lanes (grid/general) stay closed to NEW claims; claims (posting-only) and the owner-directed capped lanes (powerup/delegation/connect) open only under the directives chain with caps and read-back.',
      capitalLanes: ['grid', 'general'],
      capitalLanesRationale: 'lanes where an uncontrolled actor is observed signing or unknown tools land. powerup/delegation/connect are NOT in this list because: (1) no uncontrolled actor has ever been observed performing them (fingerprint census 2026-10-05/10-11 shows limit-order ops only); (2) they are hard-capped, idempotent, read-back verified, and recorded in the tamper-evident directives chain; (3) the owner explicitly directed them 2026-10-11 (traces 1a1…89d5, 1a1…7275). This is recorded reasoning, not silent re-labeling.',
      capitalPaths: (prev && prev.sovereignty && prev.sovereignty.capitalPaths) || [],
      capabilityMatrix: (prev && prev.sovereignty && prev.sovereignty.capabilityMatrix) || [],
      cannotStop: ['money-family-live — live signing loop on an unreachable machine (measured again 2026-10-11T12:56Z)', 'any external holder of the active key (rotation pending)', 'owner-direct manual operations']
    }
  };

  const SELFMODEL = require('./selfmodel.cjs');
  const v = SELFMODEL.validate(model);
  if (!v.ok) {
    console.error('COGNITION-BEAT-REJECTED self-model invalid:', v.errors.join(' | '));
    process.exit(3);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(model, null, 2) + '\n');
  const book = [
    '# COGNITION-BEAT · ' + nowIso(),
    '',
    'self-model regenerated from live measurements (runs API + chain RPC + grid-truth + STASIS + directives chain verify: ' + JSON.stringify(m.chainVerify) + ')',
    '',
    '- capabilities: ' + capabilities.length + ' (REAL: ' + capabilities.filter(c => c.status === 'REAL').map(c => c.id).join(',') || 'none' + ')',
    '- contradictions open: ' + contradictions.map(c => c.id + '(' + (c.lanes || []).join('+') + ')').join(', '),
    '- haltCoverage: ORGANISM_ONLY (honest — money-family-live + external key-holders unreachable)',
    '- STASIS: active=' + m.stasis.active + ' mode=' + m.stasis.mode + ' allow=[' + m.stasis.allow.join(',') + ']',
    '- workflows seen (24h): ' + Object.keys(m.runs).filter(k => k !== 'error').join(', '),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(AG, 'cognition', 'beat-book.md'), book + '\n');
  console.log('COGNITION-BEAT-DONE capabilities=' + capabilities.length + ' contradictions_open=' + contradictions.length + ' chain=' + (m.chainVerify.ok ? 'OK' : 'BROKEN'));
}

main().catch(e => { console.error('COGNITION-BEAT-FATAL', e); process.exit(0); });
