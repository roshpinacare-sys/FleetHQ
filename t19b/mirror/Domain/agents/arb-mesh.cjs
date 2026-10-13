'use strict';
/**
 * arb-mesh.cjs — R41 THE MESH MARKET (CR-0071 / feat-066 / E64, suite v1.49.0 → v1.50.0)
 *
 * Owner directive (2026-10-04, Hebrew, trace 1a1…c3a5): "לפתח שוק ארביטראז רישתי
 * עבור הסוכנים והחיילים זאת אומרת שנסחר גם פה וגם שם וגם שם... נוכל לייצר כמות מאוד רחבה
 * של עסקאות ורווחים על הרשת שלנו... ראוטרים שנוכל לקבל ולהחליף גם כבר סכומים גדולים".
 *
 * R39 built the ROUTER (venue graph + honest verdicts). R40 built the CORE (atomic
 * settlement + the real-value vault). R41 builds the MESH — the demand side: the agents
 * and the soldiers THEMSELVES trading on our own network, here and there and everywhere:
 *
 *  - MANDATE LAW (deterministic, from the books, zero magic numbers): for every live
 *    pool-side edge row (verdict CANDIDATE-FOK, the R39/R40 FLOOR law inherited) the mesh
 *    drafts intents for the roster (headcorner + soldiers from persona-slots): the operator
 *    commands 40% of the row's budget, the soldiers split 60% equally. The row budget is the
 *    catalog quote size (~1% of first-hop depth of the input asset) — a fill that IS the
 *    book is slippage theater.
 *  - DIRECTION LAW: pool mid > fair ⇒ the pool's base is RICH ⇒ agents SELL the base into
 *    the pool (from base to quote); mid < fair ⇒ the reverse. Edge is captured by trading
 *    TOWARD the fair, never against it.
 *  - WIRE LAW (the smart-treasury behavior): an agent who cannot cover his mandate is
 *    armed by a MESH-WIRE from the treasury's free claims — capped at 10% of free per
 *    batch, partial wires shrink the fill, conservation moves claims and never creates
 *    them. No capital ⇒ the honest GATED-WIRE verdict, never a fake trade.
 *  - SETTLEMENT: the mesh writes the intents queue (atomic tmp+rename) and the CORE
 *    settles it in a fresh process (`dex-core.cjs settle-intents`) — atomic all-or-nothing
 *    hops, minOut guard, batch-idempotent, conservation asserted per fill. Judge separation
 *    everywhere: drafting (mesh, keyless) and settling (core, pure BigInt) are two rooms.
 *  - EDGE ACCOUNTING (honest or null): PEG legs mark 1:1; STEEM/SBD marks to the
 *    CEX-implied fair when the feed is fresh; anything else books edge=null — P&L is
 *    measured, never guessed.
 *  - GRID GATE: the pool-side counter-grids stay PLAN-POOL-GATED-NOT-BROADCAST — the mesh
 *    NEVER fires grid rungs without the owner's gate. The gate is the owner's, not the mesh's.
 *  - SIZE LADDER (the "large sums" law): for every live pair, exact BigInt quotes at
 *    0.1% / 1% / 5% of input-side depth with honest slippage — the capability measurement
 *    the owner asked for, recomputable by any node.
 *  - STASIS: halt-before-read (FATE-DEFENSE law 3). Fail-soft exit 0 always.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const dc = require('./dex-core.cjs'); // the engine — required, never re-implemented
const AG = __dirname;
const CORE_BOOK = path.join(AG, 'dex-core.json');
const ROUTER_BOOK = path.join(AG, 'dex-router.json');
const ROSTER_FILE = path.join(AG, 'persona-slots.json');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const OUT_JSON = path.join(AG, 'arb-mesh.json');
const OUT_MD = path.join(AG, 'arb-mesh.md');
const OUT_HISTORY = path.join(AG, 'arb-mesh-history.jsonl');
const INTENTS_FILE = path.join(AG, 'dex-intents.json');

const PROTOCOL = 'SAOS-ARB-MESH/1';
const VERSION = 'arb-mesh v1.0.0 (R41 MESH MARKET, CR-0071)';

const ub = (s) => { try { return BigInt(String(s)); } catch (_) { return 0n; } };
const mu = (z) => z.toString();
const NANO = dc.NANO, BPS = dc.BPS;

const OPERATOR_SHARE_BPS = 4000n;   // headcorner commands 40% of a row's budget
const MESH_MAX_SLIP_BPS = 50n;      // minOut guard: quote −0.5% between drafting and settlement
const LADDER_SIZES_BPS = [10n, 100n, 500n]; // 0.1% / 1% / 5% of input-side depth
const CORE_STALE_HOURS = 30;        // a core book older than this is stale — the mesh reports, never guesses

// ── laws (pure, deterministic, eval-recomputable) ───────────────────────────

/** roster: headcorner first, soldiers sorted (the law never depends on file order). */
function meshRoster() {
  let soldiers = [];
  try {
    const p = require('./persona-store.cjs').slots(); // T3: doctrine sealed (persona-store)
    soldiers = Object.keys(p.soldiers || {}).sort();
  } catch (_) { /* honest: operator-only mesh */ }
  return ['headcorner', ...soldiers];
}

/** edge candidates from the CORE book (pool-side rows only — the mesh trades OUR pools).
 *  Direction law: mid > fair ⇒ sell the base into the pool; mid < fair ⇒ buy it out. */
function meshCandidates(coreBook, now) {
  const rows = [];
  for (const r of (coreBook.arb || [])) {
    if (r.verdict !== 'CANDIDATE-FOK') continue;
    if (!r.poolMidNano || !r.fairNano) continue;
    const mid = ub(r.poolMidNano), fair = ub(r.fairNano);
    if (mid <= 0n || fair <= 0n) continue;
    // our-pool law: the row must name our own treasury rail (no keyed rails for a keyless mesh)
    const rail = String(r.railOwner || '');
    if (!/treasury/i.test(rail)) continue;
    const isP3 = /STEEM\/SBD/.test(String(r.name || '')) || r.id === 'A1';
    if (!isP3) continue; // the volatile pair is the edge pair; peg guards never CANDIDATE (their own halt law)
    rows.push({
      id: r.id, name: r.name, poolMidNano: mu(mid), fairNano: mu(fair),
      netBps: r.netBps, thresholdBps: r.thresholdBps,
      from: mid > fair ? 'STEEM' : 'SBD',  // sell the rich side into the pool
      to: mid > fair ? 'SBD' : 'STEEM',
      railOwner: rail, source: 'dex-core.json (our pool — atomic, no bridge)', at: now,
    });
  }
  return rows;
}

/** mandates: deterministic split of the row budget across the roster.
 *  Row budget = ~1% of first-hop depth of the input asset (the catalog quote law, R40). */
function meshMandates(candidate, coreBook, roster) {
  const from = candidate.from;
  let depth = 0n;
  for (const p of (coreBook.pools || [])) {
    if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue;
    if (p.a === from) depth = depth === 0n ? ub(p.ra) : (ub(p.ra) < depth ? ub(p.ra) : depth);
    if (p.b === from) depth = depth === 0n ? ub(p.rb) : (ub(p.rb) < depth ? ub(p.rb) : depth);
  }
  if (depth <= 0n) return { depth: '0', rowBudget: '0', split: [], why: 'NO-DEPTH (no live pool holds the input asset)' };
  const rowBudget = depth * 100n / BPS; // 1% of first-hop depth
  const opBudget = rowBudget * OPERATOR_SHARE_BPS / BPS;
  const soldiers = roster.slice(1);
  const per = soldiers.length ? (rowBudget - opBudget) / BigInt(soldiers.length) : 0n;
  const split = roster.map((a, i) => ({
    agent: a,
    budgetMu: mu(i === 0 ? opBudget : per),
    share: i === 0 ? 'OPERATOR-40%' : `SOLDIER-${(Number(OPERATOR_SHARE_BPS) / 100 / soldiers.length).toFixed(1)}%`,
  }));
  return { depth: mu(depth), rowBudget: mu(rowBudget), split, why: null };
}

/** minOut law: quote −0.5% — the guard against drift between drafting and settlement. */
function minOutFor(coreBook, from, to, amountIn) {
  const pools = (coreBook.pools || []).map((p) => ({ ...p }));
  const route = dc.routeBest(pools, from, to, ub(amountIn));
  if (!route) return { quote: null, minOut: null };
  const quote = route.out;
  return { quote: mu(quote), minOut: mu(quote - (quote * MESH_MAX_SLIP_BPS / BPS)) };
}

/** draft the intents queue (deterministic: same books in → byte-identical queue out). */
function draftIntents(coreBook, now) {
  const roster = meshRoster();
  const candidates = meshCandidates(coreBook, now);
  const intents = [];
  for (const c of candidates) {
    const m = meshMandates(c, coreBook, roster);
    if (m.why) continue;
    for (const s of m.split) {
      const budget = ub(s.budgetMu);
      if (budget < dc.MESH_DUST) continue; // dust is noise — an honest skip, never padded
      const held = ub(((coreBook.accounts || {})[s.agent] || { claims: {} }).claims[c.from] || '0');
      const size = held >= budget ? budget : budget; // the CORE's wire law funds the shortfall — the mesh never invents size
      const g = minOutFor(coreBook, c.from, c.to, size);
      if (g.minOut == null) continue; // no route → no intent (honest absence)
      intents.push({
        agent: s.agent, from: c.from, to: c.to, amountIn: mu(size),
        minOut: g.minOut, quote: g.quote, rowId: c.id,
        share: s.share, heldMu: mu(held), wireExpected: held >= size ? '0' : mu(size - held),
      });
    }
  }
  // deterministic batch id: hour bucket + state hash — a replayed identical hour settles nothing twice
  const hourBucket = new Date(now).toISOString().slice(0, 13);
  const stateHash = crypto.createHash('sha256')
    .update(JSON.stringify({ coreSeq: coreBook.seq, candidates: candidates.map((c) => [c.from, c.netBps]), intents }))
    .digest('hex').slice(0, 8);
  return { batch: `MESH-${hourBucket.replace(/[-:T]/g, '')}-${stateHash}`, at: now, roster, candidates, intents };
}

/** size ladder: exact BigInt quotes at fixed depth fractions — the "large sums" capability. */
function sizeLadder(coreBook) {
  const ladder = [];
  for (const p of (coreBook.pools || [])) {
    if (p.planned || (ub(p.ra) <= 0n || ub(p.rb) <= 0n)) continue;
    const ra = ub(p.ra), rb = ub(p.rb);
    const midNano = rb * NANO / ra; // price of a in b
    const rungs = [];
    for (const bps of LADDER_SIZES_BPS) {
      const sizeIn = ra * bps / BPS;
      const pools2 = [{ ...p }];
      const sw = dc.poolSwap(pools2[0], p.a, p.b, sizeIn, null);
      if (!sw || sw.error) { rungs.push({ sizeBps: Number(bps), sizeIn: mu(sizeIn), out: null, why: sw ? sw.error : 'EMPTY' }); continue; }
      const execNano = sw.out * NANO / sizeIn;
      const slipBps = Number((execNano - midNano) * BPS / midNano) / 1; // signed: negative = price impact against the trader
      rungs.push({ sizeBps: Number(bps), sizeIn: mu(sizeIn), out: mu(sw.out), execPrice: +(Number(execNano) / 1e9).toFixed(8), slipBps: +(Number(slipBps) / 100).toFixed(2) });
    }
    ladder.push({ pool: p.id, pair: p.pair, kind: p.kind, feeBps: p.feeBps, mid: +(Number(midNano) / 1e9).toFixed(8), unit: p.b, rungs });
  }
  return ladder;
}

// ── book writing ────────────────────────────────────────────────────────────
function stasisCheck() {
  try { const s = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')); return s && s.active ? s : null; } catch (_) { return null; }
}
function writeBook(obj) {
  const tmp = OUT_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, OUT_JSON);
}
function writeMd(b) {
  const L = [];
  L.push(`# arb-mesh — THE MESH MARKET (R41, CR-0071)\n`);
  L.push(`At: ${b.at} · Verdict: **${b.verdict}** · batch: ${b.batch || '—'} · protocol: ${b.protocol}\n`);
  L.push(`Roster: ${b.roster.length} accounts (headcorner + ${b.roster.length - 1} soldiers) · Edge candidates: ${b.candidates.length} · Intents drafted: ${b.intentsDrafted} · Fills settled: ${b.fills.length} · Refusals: ${b.rejects.length}\n`);
  if (b.candidates.length) {
    L.push(`\n| Edge row | Direction | Net bps | Floor | Source |`);
    L.push(`|---|---|---|---|---|`);
    for (const c of b.candidates) L.push(`| ${c.id} ${c.name} | ${c.from}→${c.to} (sell the rich side) | ${c.netBps} | ${c.thresholdBps} | ${c.source} |`);
  }
  if (b.fills.length) {
    L.push(`\n| Agent | Fill | Route | Out | Edge (marked) | Fees |`);
    L.push(`|---|---|---|---|---|---|`);
    for (const f of b.fills) L.push(`| ${f.agent} | ${f.from} ${f.amountIn}µ → ${f.to} | ${f.routeIds.join('→')} | ${f.amountOut}µ ${f.to} | ${f.edgeMu == null ? 'null (unavailable, honest)' : f.edgeMu + 'µ'} (${f.fairUsed}) | ${f.feesMu}µ |`);
  }
  if (b.rejects.length) {
    L.push(`\n| Agent | Refusal | Why |`);
    L.push(`|---|---|---|`);
    const seen = new Set();
    for (const r of b.rejects) { const k = `${r.agent}|${r.why}`; if (seen.has(k)) continue; seen.add(k); L.push(`| ${r.agent} | ${r.amountIn}µ ${r.from}→${r.to} | ${r.why} |`); }
  }
  L.push(`\n## Size ladder (the large-sums law — exact BigInt, honest slippage)\n`);
  for (const l of b.sizeLadder) {
    L.push(`\n**${l.pool} ${l.pair}** (mid ${l.mid} ${l.unit}/${l.a || ''}, fee ${l.feeBps}bps):`);
    L.push(`\n| Size (% depth) | In | Out | Exec price | Slippage |`);
    L.push(`|---|---|---|---|---|`);
    for (const r of l.rungs) L.push(`| ${r.sizeBps / 100}% | ${r.sizeIn}µ | ${r.out == null ? '—' : r.out + 'µ'} | ${r.execPrice == null ? '—' : r.execPrice} | ${r.slipBps == null ? '—' : r.slipBps + 'bps'} |`);
  }
  L.push(`\n## Mesh P&L (lifetime, from the ledger — the core book is the source of truth)\n`);
  L.push(`Fills: ${b.meshPnl.lifetime.fills} · Volume in: ${b.meshPnl.lifetime.volumeInMu}µ · Edge captured: ${b.meshPnl.lifetime.edgeMu}µ · Fees paid (LP revenue): ${b.meshPnl.lifetime.feesMu}µ`);
  for (const [a, r] of Object.entries(b.meshPnl.lifetime.byAgent || {})) L.push(`- ${a}: ${r.fills} fills · vol ${r.volumeInMu}µ · edge ${r.edgeMu}µ · fees ${r.feesMu}µ`);
  L.push(`\nLaws: ${b.laws.map((x, i) => `L${i + 1}`).join(' ')} · Gate law: the counter-grid gate follows CR-0074 (open = GATED-ARMED-BROADCAST-READY, closed = PLAN-POOL-GATED-NOT-BROADCAST) — the mesh never fires a keyed rail either way.\n`);
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
}
function appendHistory(rows) {
  if (!rows.length) return;
  fs.appendFileSync(OUT_HISTORY, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// ── tick ────────────────────────────────────────────────────────────────────
function nowIso() {
  if (process.env.ARB_MESH_NOW) { const t = Date.parse(process.env.ARB_MESH_NOW); if (isFinite(t)) return new Date(t).toISOString(); }
  return new Date().toISOString();
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } }

async function tick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    if (stasis) {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, roster: [], candidates: [], intentsDrafted: 0, fills: [], rejects: [], sizeLadder: [], meshPnl: { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } }, errors: [] });
      console.log(`STASIS-HALT arb-mesh · ${now}`);
      return 0;
    }
    const coreBook = readJson(CORE_BOOK);
    const routerBook = readJson(ROUTER_BOOK);
    if (!coreBook || coreBook.protocol !== 'SAOS-DEX-CORE/1' || !coreBook.genesisDone) {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'DRY (no core ledger — the exchange core has not born yet)', coreStale: true, roster: meshRoster(), candidates: [], intentsDrafted: 0, fills: [], rejects: [], sizeLadder: [], meshPnl: { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } }, errors: [] });
      console.log(`arb-mesh: DRY (no core) · ${now}`);
      return 0;
    }
    const coreAgeH = (Date.now() - Date.parse(coreBook.at)) / 3600000;
    const candidates = meshCandidates(coreBook, now);
    const roster = meshRoster();
    // keyed-rail rows from the ROUTER book are visible but never fired by the keyless mesh — honest PLAN rows
    const keyedRows = ((routerBook || {}).arb || []).filter((r) => r.verdict === 'CANDIDATE-FOK' && !/treasury/i.test(String(r.railOwner || '')));

    let batch = null, queueDraft = null;
    if (candidates.length) {
      queueDraft = draftIntents(coreBook, now);
      batch = queueDraft.batch;
      // write the queue (atomic) — the mesh owns the queue; the core consumes + clears it
      try {
        fs.writeFileSync(INTENTS_FILE + '.tmp', JSON.stringify({ batch, at: now, intents: queueDraft.intents }, null, 1) + '\n');
        fs.renameSync(INTENTS_FILE + '.tmp', INTENTS_FILE);
      } catch (_) { queueDraft = null; }
    }
    let fills = [], rejects = [], meshPnl = null, settledBatch = null, wires = 0;
    if (queueDraft && queueDraft.intents.length) {
      const r = spawnSync(process.execPath, [path.join(AG, 'dex-core.cjs'), 'settle-intents'], { encoding: 'utf8', timeout: 60000 });
      const after = readJson(CORE_BOOK);
      if (after && after.protocol === 'SAOS-DEX-CORE/1' && after.meshPnl) {
        meshPnl = after.meshPnl;
        settledBatch = (after.summary || {}).meshBatch || null;
        for (const o of (after.opsThisTick || [])) {
          if (o.type === 'AGENT_FILL') fills.push(o);
          else if (o.type === 'AGENT_REJECT') rejects.push(o);
          else if (o.type === 'MESH-WIRE') wires += 1;
        }
      }
      if (!after) console.log('arb-mesh: the core did not answer the settle (booked honestly)');
    } else {
      meshPnl = coreBook.meshPnl || { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } };
    }

    // verdict law — honest, five branches
    let verdict;
    if (!candidates.length) verdict = ((coreBook.arb || []).length || keyedRows.length) ? 'NO-EDGE (every row below the floor — the machinery waits, the floor law protects the P&L)' : 'DRY';
    else if (fills.length) verdict = 'MESH-LIVE';
    else if (rejects.some((r) => r.why === 'GATED-WIRE-NO-CAPITAL') || (queueDraft && !queueDraft.intents.length)) verdict = 'GATED-WIRE (edge above floor but no free capital to arm the agents — named, never faked)';
    else if (settledBatch === null) verdict = 'SETTLE-PENDING (queue written, the core did not settle this run)';
    else verdict = 'MESH-NO-FILL';

    const ladderRows = sizeLadder(coreBook);
    const book = {
      protocol: PROTOCOL, at: now, agent: VERSION, mode: 'KEYLESS-MESH-DEMAND',
      stasisHalted: false,
      laws: dc.LAWS,
      verdict, batch, settledBatch,
      coreLedger: { seq: coreBook.seq, at: coreBook.at, ageHours: +coreAgeH.toFixed(2), conservationOk: coreBook.conservationOk, attestation: coreBook.attestation, feedFresh: !!(coreBook.feed && coreBook.feed.fresh) },
      routerSeen: routerBook ? { at: routerBook.at, arbRows: (routerBook.arb || []).length } : null,
      roster, candidates,
      keyedRailPlans: keyedRows.map((r) => ({ id: r.id, name: r.name, railOwner: r.railOwner, verdict: 'PLAN-KEYED-RAIL (the signing desks own this rail — the keyless mesh never signs)' })),
      intentsDrafted: queueDraft ? queueDraft.intents.length : 0,
      intents: queueDraft ? queueDraft.intents : [],
      wires, fills, rejects, sizeLadder: ladderRows,
      meshPnl: meshPnl || { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } },
      gridGate: dc.counterGridGate().open
        ? `GATED-ARMED-BROADCAST-READY (CR-0074 open — the kernel arms the opposing grids; the mesh still never fires a keyed rail)`
        : 'PLAN-POOL-GATED-NOT-BROADCAST — counter-grid rungs fire only behind the owner gate; the mesh waits',
      errors: [],
    };
    writeBook(book); writeMd(book);
    appendHistory([{ at: now, verdict, batch, candidates: candidates.length, intents: book.intentsDrafted, fills: fills.length, rejects: rejects.length, wires, edgeMu: meshPnl && meshPnl.batch ? meshPnl.batch.edgeMu : '0' }]);
    console.log(`ARB-MESH-TICK verdict=${verdict.split(' ')[0]} batch=${batch || '—'} candidates=${candidates.length} intents=${book.intentsDrafted} fills=${fills.length} rejects=${rejects.length} wires=${wires}`);
    return 0;
  } catch (e) {
    try {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'ERROR (booked honestly, exit 0)', stasisHalted: false, roster: [], candidates: [], intentsDrafted: 0, fills: [], rejects: [], sizeLadder: [], meshPnl: { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } }, errors: [String(e.message).slice(0, 300)] });
    } catch (_) {}
    console.log(`arb-mesh: ERROR (booked honestly, exit 0) ${e.message}`);
    return 0;
  }
}

// ── selftest (fresh process, zero network, deterministic) ───────────────────
function selftest() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  const mkCore = () => ({
    protocol: 'SAOS-DEX-CORE/1', at: '2026-10-04T10:00:00.000Z', genesisDone: true, seq: 7,
    conservationOk: true, attestation: 'x',
    feed: { fresh: true, fairNano: '105446700' },
    accounts: { treasury: { claims: { STEEM: '12829575', SBD: '119670', WSTEEM: '388775', WSBD: '27450' } } },
    pools: [
      { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '388775', rb: '388775', feeMeter: '0', planned: false },
      { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: 2, ra: '27450', rb: '27450', feeMeter: '0', planned: false },
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1555100', rb: '163980', feeMeter: '0', planned: false },
    ],
    arb: [
      { id: 'A1', name: 'P3 STEEM/SBD pool mid vs CEX-implied fair', poolMidNano: '120000000', fairNano: '105446700', netBps: 1378, thresholdBps: 120, verdict: 'CANDIDATE-FOK', railOwner: 'treasury (our own pool — atomic, no bridge)' },
      { id: 'A-P1', name: 'P1 WSTEEM/STEEM peg guard', verdict: 'PEG-OK' },
    ],
    meshPnl: { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' } },
  });
  // roster: operator first, soldiers sorted (deterministic — the law never depends on file order)
  const rr = meshRoster();
  ok('roster-operator-first-soldiers-sorted', rr[0] === 'headcorner' && rr.slice(1).every((x, i, a) => i === 0 || a[i - 1] <= x));
  // candidates: only CANDIDATE-FOK pool-side rows; direction law mid > fair ⇒ sell base
  const cands = meshCandidates(mkCore(), '2026-10-04T10:00:00.000Z');
  ok('candidates-floor-law', cands.length === 1 && cands[0].id === 'A1');
  ok('direction-sell-the-rich-side', cands[0].from === 'STEEM' && cands[0].to === 'SBD');
  const inverted = mkCore(); inverted.arb[0] = { ...inverted.arb[0], poolMidNano: '90000000', netBps: 1500, verdict: 'CANDIDATE-FOK' };
  ok('direction-inverts', meshCandidates(inverted, '2026-10-04T10:00:00.000Z')[0].from === 'SBD');
  // keyed rails never become candidates
  const keyed = mkCore(); keyed.arb[0] = { ...keyed.arb[0], railOwner: 'headcorner (STEEM active — LIVE)' };
  ok('keyed-rails-excluded', meshCandidates(keyed, '2026-10-04T10:00:00.000Z').length === 0);
  // below-floor rows never become candidates
  const below = mkCore(); below.arb[0] = { ...below.arb[0], verdict: 'BELOW-FLOOR' };
  ok('below-floor-excluded', meshCandidates(below, '2026-10-04T10:00:00.000Z').length === 0);
  // mandates: operator 40%, soldiers split 60%; row budget = 1% of depth
  const roster = ['headcorner', 's1', 's2', 's3', 's4'];
  const m = meshMandates(cands[0], mkCore(), roster);
  const depth = ub(m.depth); // min over pools holding STEEM: P1 rb=388775 < P3 ra=1555100
  ok('mandate-depth-is-first-hop', depth === 388775n);
  ok('mandate-budget-1pct', ub(m.rowBudget) === depth * 100n / BPS);
  const opB = ub(m.split[0].budgetMu), solB = ub(m.split[1].budgetMu);
  ok('mandate-operator-40', opB === ub(m.rowBudget) * 4000n / BPS);
  ok('mandate-soldiers-split-60', solB === (ub(m.rowBudget) - opB) / 4n);
  // draft determinism + the dust law: at current depth the soldiers' shares are below dust — honestly skipped
  const d1 = draftIntents(mkCore(), '2026-10-04T10:00:00.000Z');
  const d2 = draftIntents(mkCore(), '2026-10-04T10:00:00.000Z');
  ok('draft-byte-deterministic', JSON.stringify(d1) === JSON.stringify(d2));
  ok('draft-dust-law-skips-honestly', d1.intents.length === 1 && d1.intents[0].agent === 'headcorner' && ub(d1.intents[0].amountIn) >= dc.MESH_DUST
    && d1.intents.every((i) => ub(i.amountIn) >= dc.MESH_DUST));
  // minOut guard: quote −0.5%
  const g = minOutFor(mkCore(), 'STEEM', 'SBD', '10000');
  ok('minout-guard-half-pct', g.quote != null && ub(g.minOut) === ub(g.quote) - (ub(g.quote) * 50n / BPS));
  // size ladder: slippage grows with size (concavity — honest depth), 0.1% ≈ fee-only
  const ladder = sizeLadder(mkCore());
  const p3 = ladder.find((l) => l.pool === 'P3');
  const s01 = p3.rungs.find((r) => r.sizeBps === 10), s5 = p3.rungs.find((r) => r.sizeBps === 500);
  ok('ladder-monotone-slippage', !!s01 && !!s5 && s5.slipBps < s01.slipBps && s01.slipBps <= 0);
  ok('ladder-out-grows', ub(s5.out) > ub(s01.out) * 10n);
  const pass = c.filter((x) => x.ok).length;
  console.log(`ARB-MESH-SELFTEST-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

if (require.main === module) {
  const arg = process.argv[2] || '';
  if (arg === 'selftest') process.exit(selftest());
  tick().then((rc) => process.exit(rc)).catch(() => process.exit(0));
}

module.exports = {
  meshRoster, meshCandidates, meshMandates, draftIntents, minOutFor, sizeLadder,
  selftest, PROTOCOL, VERSION, OPERATOR_SHARE_BPS, MESH_MAX_SLIP_BPS, LADDER_SIZES_BPS,
};
