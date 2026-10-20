#!/usr/bin/env node
/**
 * public-pulse.cjs — PUBLIC PULSE DESK (r147-c): the Domain side of the money.html
 * differentiation. Keyless, fail-soft, exit 0.
 *
 * Why this exists (measured 2026-10-02): Console/money.html and Domain/money.html
 * served IDENTICAL text (5-gram text Jaccard 1.0). The differentiation law (r147-c):
 *   · Domain/money.html becomes the only public page carrying the network pulse:
 *     measured truth numbers + audience resonance + scout market eyes, each number
 *     stamped with its own measurement time.
 *   · The canonical feed lives on the home platform at GET /api/public/pulse
 *     (keyless). Where that URL is reachable, this agent refreshes from it and says
 *     so. Where it is not (e.g. CI), it composes from the committed books in THIS
 *     repository and labels the snapshot honestly. It never fakes freshness.
 *
 * Writes:
 *   public/pulse.json  — the public truth-pulse book (truth / audience / scout / moment)
 *   about/team.json    — the desks roster (personas + measured capability data)
 *   agents/receipts/public-pulse-receipt.json
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PULSE_URL = process.env.PULSE_URL || '';
const OUT = process.env.RECEIPT_OUT || path.join(ROOT, 'agents', 'receipts', 'public-pulse-receipt.json');

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (_) { return null; } };
const nowIso = () => new Date().toISOString();

async function fetchLiveFeed() {
  if (!PULSE_URL) return { status: 'NO-URL-CONFIGURED', at: nowIso() };
  try {
    const r = await fetch(PULSE_URL, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return { status: 'HTTP-' + r.status, at: nowIso() };
    const j = await r.json();
    if (!j || j.ok !== true) return { status: 'BAD-SHAPE', at: nowIso() };
    return { status: 'FRESH', at: nowIso(), payload: j };
  } catch (e) {
    return { status: 'UNREACHABLE', at: nowIso(), msg: String(e.message || e).slice(0, 90) };
  }
}

function composePulse(live) {
  const tb = readJson('agents/truth-baseline.json');
  const aud = readJson('audience/latest.json');
  const scout = readJson('agents/scout-latest.json');
  const moment = readJson('moment/moment.json');
  const m = (tb && tb.measured) || {};
  const t = (aud && aud.totals) || {};
  const topics = (aud && aud.topics) || [];
  const top = topics.length ? topics[0] : null;
  const sIns = (scout && scout.insights) || [];
  const priceIns = sIns.find(i => i && i.id && String(i.id).includes('MKT')) || null;
  const sTracks = (scout && scout.tracks) || [];

  // live feed wins where it answers; each field keeps its own measuredAt either way
  const truth = {
    realizedSbd: live && live.payload ? live.payload.pnl.realizedSbd : m.realizedSbd,
    realizedUsd: live && live.payload ? live.payload.pnl.realizedUsd : m.realizedUsd,
    trips: live && live.payload ? live.payload.pnl.trips : m.trips,
    fillsTotal: live && live.payload ? live.payload.pnl.fillsTotal : m.fillsTotal,
    usdPerDay7dAvg: live && live.payload ? live.payload.mission.usdPerDay7dAvg : m.usdPerDay7dAvg,
    measuredAt: live && live.payload ? live.payload.pnl.measuredAt : (tb && tb.takenAt) || null,
    source: live && live.payload ? 'home GET /api/public/pulse (live at fetch time)' : 'agents/truth-baseline.json (committed snapshot; takenAt inside)',
  };
  // R22 (CR-0051) — THE DAY BOOK JOINS THE TRUTH, scope-labeled, never laundered into
  // lifetime: the baseline snapshot lags (it is a taken-at-once capture) while the
  // fill-ledger walk commits every 30 minutes. The public page now carries BOTH, each
  // stamped with its own scope + measuredAt. A day number never becomes a lifetime
  // number; a lifetime number never hides a day number. (The owner's roast: the proof
  // surface showed yesterday's P&L while fresh books existed — a staleness that reads
  // as a lie even when it is only a lag.)
  let dayTruth = null;
  const fl = readJson('agents/fill-ledger.json');
  if (Array.isArray(fl) && fl.length) {
    const last = fl[fl.length - 1];
    const inv = (last && last.inventory) || {};
    dayTruth = {
      realizedSbdToday: typeof inv.realized === 'number' ? +(inv.realized / 1e6).toFixed(6) : null,
      fillsToday: last.total_fills != null ? last.total_fills : null,
      newFillsLastWalk: Array.isArray(last.new_fills) ? last.new_fills.length : null,
      mode: last.mode || null,
      measuredAt: last.ts || null,
      source: 'agents/fill-ledger.json (last committed walk — DAY scope, since 00:00Z)',
    };
  }
  truth.day = dayTruth;
  const audience = {
    runAt: (aud && aud.runAt) || null,
    postsMeasured: t.postsMeasured || 0,
    externalVotesTotal: t.externalVotesTotal || 0,
    repliesTotal: t.repliesTotal || 0,
    externalRepliersTotal: t.externalRepliersTotal || 0,
    conversationSharePct: (aud && aud.conversationSharePct) || null,
    topTopic: top ? top.tag : null,
    topTopicExternalVotes: top ? top.externalVotes : 0,
    source: 'audience/latest.json (audience-analyst daily 05:37Z, keyless chain reads)',
  };
  const scoutBook = {
    at: (scout && scout.at) || null,
    week: (scout && scout.week) || null,
    seq: (scout && scout.seq) || null,
    tracks: sTracks.map(x => ({ id: x.id, status: x.status, sources: (x.sources || []).length })),
    steemQuotes: priceIns ? priceIns.numbers : null,
    insights: sIns.map(i => ({ id: i.id, text: i.text, numbers: i.numbers || null })),
    source: 'agents/scout-latest.json (verbatim public copy of the home scout-market digest; public URLs only)',
  };
  const momentBook = moment ? {
    publishedAt: moment.publishedAt || null,
    steemUsd: moment.market && moment.market.steemUsd,
    regime: (moment.call && moment.call.regime) || (moment.regime) || null,
    source: 'moment/moment.json (moment-watch, every 30 minutes)',
  } : null;

  return {
    format: 'public-pulse-v1',
    generatedAt: nowIso(),
    generator: 'Domain/agents/public-pulse.cjs (keyless, fail-soft)',
    refresh: {
      policy: 'daily via public-pulse workflow; live home feed attempted first, committed books otherwise; every number carries its own measuredAt',
      liveFeed: { requested: PULSE_URL || null, status: live ? live.status : 'NOT-REQUESTED', at: live ? live.at : null }, // R22: compose must stay pure-safe for E42 (live may be null)
    },
    truth,
    audience,
    scout: scoutBook,
    moment: momentBook,
    law: 'no secrets, no fabricated numbers: a number without a measurement time is not published here',
  };
}

/**
 * THE COORDINATION PROOF WIRE (Rung 19, CR-0048 — sovereign-convergence §4.3):
 * the public page proves the fleet's coordination surface, composed from the
 * committed books of THIS repository only — keyless, fail-soft, public-safe
 * (no keys, no authorities, no trading amounts). Every number carries its own
 * measurement time; honesty over freshness-faking, this page's own law.
 */
function composeCoordination() {
  const nowIsoNow = nowIso();
  // 1. the keyless coordination bus (chain-read saos.* custom_json ops)
  const bus = readJson('agents/coord-bus.json');
  const busSection = bus ? {
    namespaces: bus.namespaces ? Object.keys(bus.namespaces) : [],
    messageCount: bus.messageCount || 0,
    fingerprint: bus.fingerprint || null,
    measuredAt: bus.at || null,
    source: 'agents/coord-bus.json (keyless chain read of saos.* custom_json ops, split-brain guarded)',
  } : { status: 'NO-BUS-BOOK', source: 'agents/coord-bus.json (the bus reader has not booked yet)' };
  // 2. collision leases (the append-only RESERVATIONS.jsonl stream, resolved state)
  let leases = { status: 'NO-LEASES-FILE' };
  try {
    const cl = require('./coord-lease.cjs');
    const rows = cl.readRows(path.join(ROOT, 'agents', 'RESERVATIONS.jsonl'));
    const state = cl.resolveLeases(rows, nowIsoNow);
    const active = Object.entries(state).filter(([, s]) => cl.isActive(s, nowIsoNow));
    leases = { activeLeases: active.length, resources: active.map(([r]) => r), measuredAt: nowIsoNow };
  } catch (_) {}
  // 3. the fleet identity surface (ERC-8004-shaped registry)
  let registry = { identities: null, measuredAt: null };
  try {
    const reg = readJson('agents/agent-registry.json');
    const ids = reg && reg.identity ? Object.keys(reg.identity).filter((k) => /^\d+$/.test(k)) : [];
    registry = { identities: ids.length, measuredAt: (reg && reg.at) || null };
  } catch (_) {}
  return {
    bus: busSection,
    leases,
    registry,
    law: 'coordination proof page: composed from committed books only, every number stamped with its own measurement time, no keys, no trading amounts',
  };
}

function composeTeam() {
  const personas = require('./persona-store.cjs').personas(); // T3: doctrine sealed (persona-store)
  const cap = readJson('agents/capability-matrix.json');
  const chains = (cap && cap.chains) || {};
  const steem = chains.steem || {};
  const aud = readJson('audience/latest.json');
  const t = (aud && aud.totals) || {};
  const desks = personas.map(p => {
    const meas = steem[p.account] || {};
    return {
      account: p.account,
      desk: p.desk,
      brief: p.brief,
      measured: {
        effectiveStakeSp: meas.effStake || null,
        votingPowerPct: typeof meas.votingPower === 'number' ? meas.votingPower : null,
        measuredAt: (cap && cap.at) || null,
      },
    };
  });
  return {
    format: 'community-desks-v1',
    generatedAt: nowIso(),
    source: 'agents/personas.json (desk briefs) + agents/capability-matrix.json (chain-measured stake/power) + audience/latest.json (48h engagement)',
    law: 'public data only: no keys, no authorities, no private state; each desk speaks in its own voice on its own page',
    community: {
      desks: desks.length,
      windowHours: (aud && aud.windowHours) || 48,
      externalVotes: t.externalVotesTotal || 0,
      repliesFromOutside: t.repliesTotal || 0,
      externalRepliers: t.externalRepliersTotal || 0,
      measuredAt: (aud && aud.runAt) || null,
    },
    desks,
  };
}

async function main() {
  const receipt = { at: nowIso(), tool: 'public-pulse.cjs', version: 1, wrote: [] };
  const live = await fetchLiveFeed();
  receipt.liveFeed = { status: live.status, at: live.at };
  const pulse = composePulse(live);
  pulse.coordination = composeCoordination();
  const team = composeTeam();
  try {
    fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'public', 'pulse.json'), JSON.stringify(pulse, null, 1) + '\n');
    receipt.wrote.push('public/pulse.json');
    // P0-1 fix (master-plan T6, 2026-10-11): the 11-account desk roster is
    // "internal operating procedures" per hub/disclosure-policy.html — no longer
    // published. Only the aggregate desk count is reported.
    receipt.summary = {
      truthMeasuredAt: pulse.truth.measuredAt,
      audienceRunAt: pulse.audience.runAt,
      scoutAt: pulse.scout.at,
      desks: team.desks.length,
      liveFeedStatus: live.status,
    };
  } catch (e) {
    receipt.error = String(e.message || e).slice(0, 140);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: receipt.error ? 'partial' : 'ok', wrote: receipt.wrote, live: live.status }));
  process.exit(0);
}

module.exports = { composePulse }; // R22 — exported for E42 white-box (require no longer executes the desk)
if (require.main === module) main().catch(() => process.exit(0));
