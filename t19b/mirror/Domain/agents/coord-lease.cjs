#!/usr/bin/env node
/**
 * coord-lease.cjs — RESERVATIONS.JSONL COLLISION LEASES (fleet Rung 19, CR-0048)
 * Booked by agents/sovereign-convergence.md §4.3: "RESERVATIONS.jsonl collision
 * leases". The fleet's desks and lanes increasingly share scarce resources — publish
 * slots, ladder rungs, anchor lines, the sovereign's 900s broadcast gap. Until now
 * collisions were resolved by luck and later-mover renames. This desk makes the lease
 * EXPLICIT: an append-only reservation stream whose resolved state is computable by
 * anyone, anywhere, keyless.
 *
 * LAWS (in code):
 *  1. APPEND-ONLY: rows are never rewritten or deleted. A release APPENDS a row —
 *     the audit trail is the lease history (composing with the house ADD-ONLY law).
 *  2. LAST-CLAIM-WINS per resource, resolved in stream order: a claim sets the lease,
 *     a release by the same holder clears it, expiry makes it inert. resolveLeases()
 *     is the pure reducer — the file is the coordination point.
 *  3. COLLISION LAW — claimDecision() is a reason-code machine, never silent:
 *        free / released / no lease          → GRANT
 *        expired foreign lease               → TAKEOVER-EXPIRED (grant, evidence kept)
 *        own active lease                    → GRANT-RENEW (extends)
 *        foreign ACTIVE lease                → REFUSE (evidence: holder + expiresAt)
 *  4. NO IMMORTAL LEASES: a claim without a positive finite ttl is REFUSED-NO-TTL.
 *     Every lease dies by default — a crashed desk cannot lock the fleet forever.
 *  5. KEYLESS + OFFLINE: pure file desk, zero network, zero keys. Cross-machine races
 *     are resolved one layer up (git rebase-push twins) — this file makes them VISIBLE.
 *  6. FAIL-SOFT EXIT 0, FAIL-LOUD RECEIPT; single writer: this desk writes ONLY the
 *     RESERVATIONS.jsonl (validate-then-append in one tick). RESERVATIONS_SKIP=1 is
 *     the eval off-switch.
 *
 * CLI:
 *   node coord-lease.cjs claim  <resource> <holder> <ttlSec>
 *   node coord-lease.cjs release <resource> <holder>
 *   node coord-lease.cjs list
 *
 * Env:
 *   RESERVATIONS_JSONL    stream path (default agents/RESERVATIONS.jsonl)
 *   RESERVATIONS_SKIP=1   eval off-switch
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSONL = process.env.RESERVATIONS_JSONL || path.join(ROOT, 'agents', 'RESERVATIONS.jsonl');

// ── pure core (exported for E37) ─────────────────────────────────────────────

/** read the stream → rows (tolerant: blank/garbage lines skipped, never a crash). */
function readRows(p) {
  let txt = '';
  try { txt = fs.readFileSync(p, 'utf8'); } catch (_) { return []; }
  const rows = [];
  for (const line of txt.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { const j = JSON.parse(s); if (j && typeof j === 'object') rows.push(j); } catch (_) {}
  }
  return rows;
}

/**
 * THE REDUCER: stream rows (in order) → { resource: {holder, acquiredAt, expiresAt,
 * releasedAt, expiredAtNow} }. A release without a matching live holder is a no-op
 * (you cannot release someone else's lease). Expired = expiresAt <= now and not released.
 */
function resolveLeases(rows, now) {
  const state = {};
  for (const r of (Array.isArray(rows) ? rows : [])) {
    if (!r || typeof r !== 'object' || !r.resource) continue;
    const cur = state[r.resource];
    if (r.kind === 'claim') {
      if (cur && !cur.releasedAt && String(cur.holder) !== String(r.holder) && cur.expiresAt > r.at) continue; // stale race row: the active lease wins
      state[r.resource] = { holder: String(r.holder), acquiredAt: r.at, expiresAt: r.expiresAt, releasedAt: null };
    } else if (r.kind === 'release') {
      if (cur && !cur.releasedAt && String(cur.holder) === String(r.holder)) cur.releasedAt = r.at || r.expiresAt;
    }
  }
  for (const k of Object.keys(state)) {
    const s = state[k];
    s.expiredAtNow = !s.releasedAt && s.expiresAt <= now;
  }
  return state;
}

/** is the resolved lease ACTIVE at now? (not released, not expired) */
function isActive(lease, now) { return !!(lease && !lease.releasedAt && lease.expiresAt > now); }

/**
 * THE COLLISION LAW: what happens to a claim by `holder` on `resource` at `now`?
 * Returns { decision, evidence } — GRANT / GRANT-RENEW / TAKEOVER-EXPIRED /
 * REFUSE / REFUSE-NO-TTL. Never silent, never a throw.
 */
function claimDecision(rows, resource, holder, now, ttlMs) {
  if (!resource || !holder) return { decision: 'REFUSE', evidence: { reason: 'missing resource or holder' } };
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return { decision: 'REFUSE-NO-TTL', evidence: { ttlMs: ttlMs ?? null } };
  const state = resolveLeases(rows, now);
  const cur = state[resource];
  if (!cur) return { decision: 'GRANT', evidence: { resource } };
  if (cur.releasedAt) return { decision: 'GRANT', evidence: { resource, releasedAt: cur.releasedAt } };
  if (cur.expiresAt <= now) return { decision: 'TAKEOVER-EXPIRED', evidence: { resource, prevHolder: cur.holder, expiredAt: cur.expiresAt } };
  if (String(cur.holder) === String(holder)) return { decision: 'GRANT-RENEW', evidence: { resource, prevExpiresAt: cur.expiresAt } };
  return { decision: 'REFUSE', evidence: { resource, holder: cur.holder, expiresAt: cur.expiresAt } };
}

/** append one row atomically-enough for one tick (validate-then-append, fsync'd). */
function appendRow(p, row) {
  const line = JSON.stringify(row) + '\n';
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fd = fs.openSync(p, 'a');
  try { fs.writeSync(fd, line); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

// ── cli ──────────────────────────────────────────────────────────────────────

function main() {
  const [cmd, resource, holder, ttlSec] = process.argv.slice(2);
  if (process.env.RESERVATIONS_SKIP === '1') { console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'SKIP' })); return; }
  const now = new Date().toISOString();
  const rows = readRows(OUT_JSONL);

  if (cmd === 'list') {
    const state = resolveLeases(rows, now);
    const active = Object.entries(state).filter(([, s]) => isActive(s, now));
    console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'LIST', at: now, activeLeases: active.length, leases: Object.fromEntries(active) }, null, 1));
    return;
  }

  if (cmd === 'claim') {
    const ttlMs = parseFloat(ttlSec) * 1000;
    const d = claimDecision(rows, resource, holder, now, ttlMs);
    if (d.decision === 'GRANT' || d.decision === 'GRANT-RENEW' || d.decision === 'TAKEOVER-EXPIRED') {
      const row = { kind: 'claim', resource, holder, at: now, expiresAt: new Date(Date.now() + ttlMs).toISOString(), host: process.env.HOSTNAME || null, pid: process.pid };
      appendRow(OUT_JSONL, row);
      console.log(JSON.stringify({ agent: 'coord-lease', verdict: d.decision, at: now, resource, holder, expiresAt: row.expiresAt }));
      return;
    }
    console.log(JSON.stringify({ agent: 'coord-lease', verdict: d.decision, at: now, resource, holder, evidence: d.evidence }));
    return; // REFUSE: nothing appended — the existing lease stands
  }

  if (cmd === 'release') {
    const state = resolveLeases(rows, now);
    const cur = state[resource];
    if (cur && !cur.releasedAt && String(cur.holder) === String(holder)) {
      appendRow(OUT_JSONL, { kind: 'release', resource, holder, at: now });
      console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'RELEASED', at: now, resource, holder }));
      return;
    }
    console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'NOT-YOURS', at: now, resource, holder, evidence: cur ? { holder: cur.holder, releasedAt: cur.releasedAt } : { absent: true } }));
    return;
  }

  console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'USAGE', usage: 'claim <resource> <holder> <ttlSec> | release <resource> <holder> | list' }));
}

if (require.main === module) { try { main(); } catch (e) { console.log(JSON.stringify({ agent: 'coord-lease', verdict: 'ERROR', error: String(e.message || e).slice(0, 120) })); process.exit(0); } }

module.exports = { readRows, resolveLeases, isActive, claimDecision, appendRow };
