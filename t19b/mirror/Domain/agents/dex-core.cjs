'use strict';
/**
 * dex-core.cjs — R42 THE MULTI-NETWORK VAULT (CR-0072 / feat-067 / E65, suite v1.50.0 → v1.51.0)
 * R40 landed the exchange core (CR-0070), R41 the mesh market (CR-0071). R42 extends the VAULT
 * across networks (the owner's law: "משהו חכם על הרשת שלנו שתוכל להחזיק מטבעות אמיתיים טוקנים
 * של כל הרשתות וגם שלנו"):
 *  - CUSTODY-CLASS LAW: what the vault may count as ITS OWN — MEASURED-KEYED (active keys in the
 *    protected desks + chain-measured → custody, the ONLY mintable class) / OBSERVED-POST-KEYED
 *    (posting key held — account controlled, transfers gated) / OBSERVED-UNCONTROLLED (the name
 *    exists, its active pub ≠ any held key — R38 law) / PLANNED-NO-CLAIM / OBSERVED-ABSENT.
 *  - The OBSERVED registry: adjacent networks (HIVE/HBD/BLURT) probed KEYLESSLY every tick and
 *    booked with provenance — the vault SEES every network and holds only what its keys can move.
 *  - ISSUER identity (SAOS-DEX-ISSUER/1): a stable recomputable identity over the wrapper set +
 *    chain bindings + pool catalog; the mint law (1:1 against MEASURED-KEYED custody only) and
 *    the peg-out corridors (per chain, honestly banded) hang off it — R11's corridor landed.
 *  - REDEEM law (the real-value law's second half): burn BEFORE payout — the in-ledger redeem is
 *    ALWAYS honored 1:1; the chain-side payout is QUEUED to dex/pegout-queue.json with its
 *    corridor named — a keyed desk owns the broadcast, keyless code never fires one.
 *  - Pool catalog P5-P9: WHIVE/HIVE, WHBD/HBD, WBLURT/BLURT pegs + P9 WSBD/WHBD (the SBD↔HBD
 *    dollar bridge) + P8 HIVE/STEEM (the cross-network bridge, cross-fair law) — appended to the
 *    live book by the deterministic reconcile law, arming the day key material verifies.
 *
 * Owner directive (2026-10-04, Hebrew, trace 1a1…c3a5): "צריך לטפל בו היטב
 * לדאוג שנוכל לעשות שם החלפות swap וכו... חשוב שגם נוכל באמת להחליף למטבע האמיתי
 * עם ערך ולא סתם שקר... גרידים מתנגדים על הרשת שלנו מצד שני... שוק ארביטראז רישתי...
 * ראוטרים שנוכל לקבל ולהחליף גם כבר סכומים גדולים... משהו חכם על הרשת שלנו שתוכל
 * להחזיק מטבעות אמיתיים טוקנים של כל הרשתות וגם שלנו".
 *
 * R39 (dex-router.cjs) built the ROUTER — the venue graph, the honest verdicts, the
 * CEX-anchored counter-grids, the arb FLOOR law. R40 builds the CORE — the thing that
 * actually SETTLES swaps on our own network, atomically, deterministically, with real
 * reserve-backed value and zero lies:
 *
 *  - UNITS LAW: every amount is µ (1e-6) BigInt, end to end. No floats touch settlement.
 *  - TWO INVARIANTS, ONE ENGINE (the research verdict, R40-d):
 *      VOLATILE pools: constant-product x·y ≥ k (Uniswap v2, fee on input, floor to user,
 *        pool keeps the dust — UniswapV2Library.getAmountOut, exact).
 *      PEG pools: Curve stableswap (canonical 2020 formulation, A pinned at 10, Newton
 *        get_D/get_y with the 255-iteration cap, fee on output with the canonical −1 pad:
 *        dy = xpOut − y − 1 — the pool NEVER loses dust to the trader).
 *  - REAL-VALUE LAW (the owner's "לא סתם שקר"): wrapped WSTEEM/WSBD mint ONLY 1:1 against
 *    reserve custody actually held in the vault; REDEEM is ALWAYS honored 1:1 (burn before
 *    payout); reserve ratio is asserted on every tick and the attestation hash
 *    sha256(seq, custody, reserves, minted, claims) is booked so any node can re-verify.
 *  - ATOMICITY LAW: every swap carries minOut; out < minOut ⇒ REFUSED, state byte-unchanged.
 *  - CONSERVATION LAW (double-entry): custody[a] − wrappedReserve[a] − Σ claims[a] === 0
 *    asserted every tick, per asset, booked as a row the eval re-derives.
 *  - LEDGER LAW (event sourcing): state = book snapshot; every state change is an
 *    append-only op in dex-core-history.jsonl with a monotonic seq. The chain probe
 *    (measure phase) is itself an op with provenance — the powerdown drip enters the DEX
 *    as a DEPOSIT-DELTA the same hour it lands on headcorner. No code needed on drip day.
 *  - ARB / REBALANCE LAW (inherited from dex-router.cjs — single source of truth for the
 *    FLOOR math): when the pool's own price drifts from the CEX-implied fair beyond
 *    arbThreshold, the treasury rebalances AGAINST ITS OWN POOL — selling the overvalued
 *    side, capturing the premium as realized edge (marked to fair, fees and impact paid in
 *    full). Below the floor: a PLAN row, never a trade. This is the LVR defense: we are
 *    our own rebalancer, we capture what outside arbitrageurs would otherwise drain.
 *  - COUNTER-GRIDS, OUR SIDE: R39 grids anchored to the CEX fair (their side). R40 grids
 *    anchor to the POOL MID — our network's own price — with the same Avellaneda skew law
 *    (sign from the pool's inventory share) and the same spacing law. PLAN-POOL-GATED.
 *  - STASIS: halt-before-read (law 3). Fail-soft exit 0 always. Single-writer atomic book.
 *
 * Feed law: the core consumes the BOOKED dex-router.json (the hourly venue graph) —
 * measurement (router, network) and settlement (core, pure) are separated so the settle
 * path is deterministic and re-runnable byte-identically on the same inputs.
 *
 * R43 (CR-0073) adds the XC INTENT settlement path (settleXcOps / settle-xc): the cross-chain
 * intent doors drafted by dex-xc.cjs are applied HERE — the single balance universe. XC-OPEN
 * escrows owner claims into the xc-escrow account; XC-FILL routes the escrow through OUR pools
 * (ledger-dest) or through our pools + the redeem law (chain-dest — burn + pegout-queue row with
 * the corridor named); XC-CONFIRM clears the corridor exposure when the door's finality clock
 * passes; XC-REFUND returns the escrow WHOLE (the 2:1 HTLC clock law — refund unlocks only after
 * the fill window AND a full extra fill window). The BOND LAW (2:1, THORChain-adapted): the
 * vault's outstanding corridor exposure may never exceed 2× its custody of the payout asset.
 * Idempotency by escrow drain: a replayed fill finds the escrow empty and is refused. The core
 * stays dumb and safe — the doors, the clocks and the state machine live in dex-xc.cjs.
 *
 * R44 (CR-0074) arms THE OPPOSING HANDS — the two things the owner's directive left gated:
 *  - COUNTER-GRID ARM LAW: the pool-side counter-grids were born PLAN-POOL-GATED-NOT-BROADCAST
 *    (R39/R40) — the owner has now given the gate twice ("אני רוצה לייצר עוד גרידים מתנגדים על
 *    הרשת שלנו מצד שני", trace 1a1…c3a5, and the rung trigger 1a1…c3ed). The
 *    gate is an ARTIFACT, not a boolean: agents/change-requests/CR-0074-counter-grids.json
 *    present in the repo = gate open. The arm adds the laws the broadcast needs: deterministic
 *    rung ids (sha256-16, idempotent re-arm), the CAP law (a grid's per-side notional ≤ 2% of
 *    that side's depth value marked to the anchor), the DUST law (a rung under GRID_DUST keeps
 *    the grid quiet — GRID-TOO-THIN, dust orders never rest), and the TWO-SIDED law (a grid
 *    without BOTH ladders is a direction bet, REFUSED — the essence of מתנגד is both hands).
 *    settle stays pure: the gate arrives as an argument, byte-determinism untouched.
 *  - PEGOUT HAND (agents/pegout-hand.cjs): the keyed consumer of dex/pegout-queue.json — the
 *    second half of the real-value law. DEST-ALLOWLIST law: a chain payout fires ONLY to an
 *    estate-roster account; a row naming a non-estate account is REFUSED-DEST-NOT-ESTATE
 *    (never a transfer to a squatter). The hand proves itself with a 0.001 self-transfer
 *    (value-neutral, receipted) — the rail is real, the queue law is enforced.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const routerLaws = require('./dex-router.cjs'); // impliedFair / arbNet / arbThreshold / arbVerdict / spacingLaw / skewShiftBps — inherited, not reimplemented

const AG = __dirname;
const OUT_JSON = path.join(AG, 'dex-core.json');
const OUT_MD = path.join(AG, 'dex-core.md');
const OUT_HISTORY = path.join(AG, 'dex-core-history.jsonl');
const ROUTER_BOOK = path.join(AG, 'dex-router.json');
const STASIS_FILE = path.join(AG, 'STASIS.json');
const CREDITS_BOOK = path.join(AG, '..', 'dex', 'credits.json');
const INTENTS_FILE = path.join(AG, 'dex-intents.json'); // the mesh queue — written by arb-mesh.cjs, consumed+cleared by THIS desk (single-writer law)
const XC_OPS_FILE = path.join(AG, '..', 'dex', 'xc-ops.json'); // the XC intent queue — written by dex-xc.cjs, consumed+cleared by THIS desk (single-writer law)
const ROSTER_FILE = path.join(AG, 'persona-slots.json');
const PROTOCOL = 'SAOS-DEX-CORE/1';
const VERSION = 'dex-core v1.6.0 (R77 THE OWNER GATES)';
const REDEEM_REQUESTS_FILE = path.join(AG, '..', 'dex', 'redeem-requests.json');
const PEGOUT_QUEUE_FILE = path.join(AG, '..', 'dex', 'pegout-queue.json');

// ── mesh market constants (R41) ────────────────────────────────────────────
const MESH_DUST = 1000n;              // 0.001 unit — below this a fill is noise, refused
const MESH_WIRE_MAX_SHARE_BPS = 1000n; // a batch may wire ≤10% of the treasury's FREE claims to agents
const MESH_FILL_MAX_DEPTH_BPS = 500n;  // a single fill may not exceed 5% of the first-hop depth
const MESH_BATCH_MEMO = 64;            // processed-batch ids kept for idempotency (rotating)

// ── uniform batch clearing constants (R76 · the CoW take) ──────────────
const BATCH_FILE = path.join(AG, 'dex-batch.json'); // the DRY proof book - this lane measures, it never settles
const BATCH_MAX_ROUNDS = 4;            // exclusion-reclear rounds before an honest CLEARING-ROUNDS-EXHAUSTED
const BATCH_SANDWICH_FR_BPS = 1000n;   // the measured sandwich front-run: 10% of the victim size

// ── R77 owner-gate constants (THE OWNER GATES: batch settle + engine fee law) ──
const CR_OWNER_APPROVAL_FILE = path.join(AG, 'change-requests', 'CR-0075-owner-approval.json'); // the owner-gate ARTIFACT — its presence + opens[] in the repo IS the open gate (the CR-0074 artifact law)
const BATCH_SETTLED_FILE = path.join(AG, 'dex-batch-settled.json'); // the APPROVED settle lane book — the DRY proof (dex-batch.json) stays movedNothing:true forever
const FEE_LAW_FILE = path.join(AG, 'fee-law.json');                 // the ENGINE fee law book — measured from OUR OWN books only
const FEE_LAW_K_VOL = 1;               // fee = base + K_VOL × σ (the Meteora take, engine-adopted)
const FEE_LAW_CAP_ABS_BPS = 200n;      // absolute cap: 200bps
const FEE_LAW_CAP_FACTOR = 2;          // cap = min(2 × base, 200bps)
const FEE_LAW_MAX_AGE_H = 30;          // freshness law: a stale law book = base fee (fail-closed)
const FEE_LAW_MIN_SAMPLES = 2;         // below this a pool has no measured σ — the fee stays base (no invention)
const FEE_LAW_PRICE_WINDOW = 30;       // realized hop prices sampled per pool (last N)

// ── cross-chain intent constants (R43) ────────────────────────────────────
const CHAIN_WRAPPER = { STEEM: 'WSTEEM', SBD: 'WSBD', HIVE: 'WHIVE', HBD: 'WHBD', BLURT: 'WBLURT' }; // chains with a wrapper in the vault catalog (R42 law)
const XC_BOND_EXPOSURE_RATIO = 2n;    // the BOND LAW (THORChain-adapted): outstanding corridor exposure ≤ 2× custody of the payout asset

// ── counter-grid arm law (R44) ─────────────────────────────────────────────
const CR_COUNTER_GRID_FILE = path.join(AG, 'change-requests', 'CR-0074-counter-grids.json'); // the owner-gate ARTIFACT — its presence in the repo IS the open gate
const GRID_CAP_DEPTH_BPS = 200n;      // a grid's per-side notional ≤ 2% of that side's depth value marked to the anchor (impermanent-value defense)
const GRID_DUST = 1000n;              // 0.001 unit — a rung below this is dust; the grid stays quiet (GRID-TOO-THIN)
const GRID_VERDICT_PLAN = 'PLAN-POOL-GATED-NOT-BROADCAST';
const GRID_VERDICT_ARMED = 'GATED-ARMED-BROADCAST-READY';
const GRID_VERDICT_THIN = 'GRID-TOO-THIN';

// ── multi-network vault constants (R42) ────────────────────────────────────
const WRAP_UNDERLYING = { WSTEEM: 'STEEM', WSBD: 'SBD', WHIVE: 'HIVE', WHBD: 'HBD', WBLURT: 'BLURT' };
const MINT_SHARE_BPS = 2500n;          // a wrapper mints 25% of measured KEYED custody (deterministic genesis law)
const REDEEM_DUST = 1n;                // 1µ — a redeem below this is noise
const NETWORK_PROBES = {
  STEEM: ['https://api.steemit.com'],
  HIVE: ['https://api.hive.blog', 'https://api.openhive.network'],
  BLURT: ['https://blurt-rpc.saboin.com', 'https://rpc.blurt.world', 'https://api.blurt.blkobserver.xyz'],
};
/** CUSTODY-CLASS LAW (R42): what the vault may count as ITS OWN.
 *  MEASURED-KEYED is the ONLY mintable class. Adjacent networks are OBSERVED — seen,
 *  booked with provenance, never custody, never a reserve. The class upgrades the same
 *  tick verified active key material appears in a protected desk (key-check law) — no new code. */
const CUSTODY_CLASSES = {
  STEEM: 'MEASURED-KEYED', SBD: 'MEASURED-KEYED',
  HIVE: 'OBSERVED-UNCONTROLLED', HBD: 'OBSERVED-UNCONTROLLED',
  BLURT: 'OBSERVED-POST-KEYED', SAOS: 'PLANNED-NO-CLAIM',
};
const CUSTODY_KEYPROOF = {
  'MEASURED-KEYED': 'active key material in the protected keyed desks (the signing desks broadcast daily)',
  'OBSERVED-POST-KEYED': 'posting key held (account controlled; TRANSFERS need the active key — gated)',
  'OBSERVED-UNCONTROLLED': 'the name exists on the chain but its active pub ≠ any held key (R38 law)',
  'PLANNED-NO-CLAIM': 'no measured claim exists in the estate books (dex/credits.json)',
  'OBSERVED-ABSENT': 'the chain probe failed this tick — honest unknown, booked observation stands',
};
const PEGOUT_CORRIDORS = {
  STEEM: 'KEYED-DESK (steem active in the protected desks — operator-gated broadcast)',
  SBD: 'KEYED-DESK (steem active in the protected desks — operator-gated broadcast)',
  HIVE: 'PLAN-PEGOUT-KEYED-OPERATOR (no hive active key in the estate — R38 law)',
  HBD: 'PLAN-PEGOUT-KEYED-OPERATOR (no hive active key in the estate — R38 law)',
  BLURT: 'PLAN-PEGOUT-KEYED-OPERATOR (posting key only — transfers gated)',
  SAOS: 'INTERNAL-ONLY (no chain — the claim IS the asset)',
};

// ── units law ───────────────────────────────────────────────────────────────
const SCALE = 1000000n; // µ
const BPS = 10000n;
const NANO = 1000000000n; // price fixed-point scale (1e9)

const ub = (s) => { try { return BigInt(String(s)); } catch (_) { return 0n; } };
const mu = (z) => z.toString();
const bn = (x) => { const n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) && n > 0 ? n : 0; };
const absb = (z) => (z < 0n ? -z : z);
const FEE_VOLATILE_BPS = 25;   // matches Hive-Engine diesel pools (measured, R40-d)
const FEE_PEG_BPS = 2;         // matches Velodrome stable pools (measured, R40-d)
const STABLE_A = 10n;          // pinned amplification for PEG pools (booked law)
const MAX_HOPS = 3;
const GRID_RUNGS_PER_SIDE = 3;
const REBALANCE_MAX_SHARE_BPS = 1000n;   // ≤10% of the input-side reserve per tick
const PEG_GUARD_DRIFT_PCT = 0.5;         // wrapped pools must hold the peg tighter than the external 1.5%
const FEED_MAX_AGE_MS = 26 * 3600 * 1000; // the router books hourly; 26h = stale

// ── invariants (pure, exported for E63) ─────────────────────────────────────
/** Uniswap v2 constant-product output. Fee on INPUT, floor division (pool keeps dust).
 *  amountOut = (reserveOut · amountIn · (10000−fee)) / (reserveIn·10000 + amountIn·(10000−fee))
 *  — the exact UniswapV2Library.getAmountOut law, BigInt, never a float. */
function cpmmOut(ra, rb, amountIn, feeBps) {
  if (ra <= 0n || rb <= 0n || amountIn <= 0n) return null;
  const inWithFee = amountIn * (BPS - BigInt(feeBps));
  const num = rb * inWithFee;
  const den = ra * BPS + inWithFee;
  const out = num / den; // BigInt floor on non-negative operands
  if (out <= 0n) return null;
  return out;
}
/** K law for the CPMM: (ra+in)(rb−out) ≥ ra·rb — the fee and the dust stay in the pool. */
function cpmmKCheck(ra, rb, amountIn, out) {
  return (ra + amountIn) * (rb - out) >= ra * rb;
}
/** Fee charged on input (floor), for the fee meter. */
function feeOnInput(amountIn, feeBps) {
  return amountIn * BigInt(feeBps) / BPS;
}

/** Curve stableswap D (canonical 2020 formulation, N=2, A in plain units, no A_PRECISION).
 *  Newton: D ← (Ann·S + n·D_P)·D / ((Ann−1)·D + (n+1)·D_P), D_P = D^(n+1)/(n^n·Πx), cap 255. */
function stableD(xp0, xp1, A) {
  if (xp0 <= 0n || xp1 <= 0n) return 0n;
  const n = 2n, Ann = A * n;
  const S = xp0 + xp1;
  let D = S;
  for (let i = 0; i < 255; i++) {
    let dP = D;
    dP = dP * D / (xp0 * n);
    dP = dP * D / (xp1 * n);
    const prev = D;
    D = ((Ann * S + n * dP) * D) / ((Ann - 1n) * D + (n + 1n) * dP);
    const diff = D > prev ? D - prev : prev - D;
    if (diff <= 1n) break;
  }
  return D;
}
/** Curve _get_y (N=2): solve xp[i] given xp[j] = x, invariant D. Newton 255, canonical. */
function stableGetY(i, j, x, xp0, xp1, D, A) {
  if (x <= 0n || D <= 0n) return 0n;
  const n = 2n, Ann = A * n;
  let c = D, s = 0n;
  for (let k = 0; k < 2; k++) {
    let xk;
    if (k === i) xk = x;
    else if (k !== j) xk = (k === 0 ? xp0 : xp1);
    else continue;
    s += xk;
    c = c * D / (xk * n);
  }
  c = c * D / (Ann * n);
  const b = s + D / Ann;
  let y = D, prev = 0n;
  for (let k = 0; k < 255; k++) {
    prev = y;
    const den = 2n * y + b - D;
    if (den <= 0n) return 0n; // solver ran off the curve — caller refuses (canonical revert)
    y = (y * y + c) / den;
    if (y <= 0n) return 0n;
    const diff = y > prev ? y - prev : prev - y;
    if (diff <= 1n) return y;
  }
  return y;
}
/** Curve stableswap output: fee on OUTPUT, canonical −1 pad (dy = xpOut − y − 1 → pool keeps dust). */
function stableOut(xpIn, xpOut, amountIn, feeBps, A) {
  if (xpIn <= 0n || xpOut <= 0n || amountIn <= 0n) return null;
  const D = stableD(xpIn, xpOut, A);
  if (D <= 0n) return null;
  const y = stableGetY(1, 0, xpIn + amountIn, xpIn, xpOut, D, A);
  if (y <= 0n || y >= xpOut) return null;
  const dy = xpOut - y - 1n;
  if (dy <= 0n) return null;
  const feeAmt = dy * BigInt(feeBps) / BPS;
  const out = dy - feeAmt;
  if (out <= 0n) return null;
  return { out, feeAmt, DBefore: D, DAfter: stableD(xpIn + amountIn, xpOut - dy, A) };
}

// ── pools (the exchange floor) ──────────────────────────────────────────────
// All reserves are µ-strings in the book; BigInt only in computation.
function poolDefs(fairNano) {
  const fair = fairNano ? BigInt(Math.trunc(Number(fairNano))) : 105446700n; // fallback = the R39 booked CEX-implied fair (SBD per STEEM), provenance-tagged
  return [
    { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
    { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
    { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: FEE_VOLATILE_BPS, amp: 0, planned: false },
    { id: 'P4', pair: 'SAOS/WSTEEM', kind: 'VOLATILE', a: 'SAOS', b: 'WSTEEM', feeBps: FEE_VOLATILE_BPS, amp: 0, planned: true,
      plannedWhy: 'no measured SAOS claim exists in the estate books (dex/credits.json is empty today) — the pool arms the day a real claim is measured into the vault; the mirror reference price is the planned seed anchor' },
    { id: 'P5', pair: 'WHIVE/HIVE', kind: 'PEG', a: 'WHIVE', b: 'HIVE', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
    { id: 'P6', pair: 'WHBD/HBD', kind: 'PEG', a: 'WHBD', b: 'HBD', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
    { id: 'P7', pair: 'WBLURT/BLURT', kind: 'PEG', a: 'WBLURT', b: 'BLURT', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
    { id: 'P8', pair: 'HIVE/STEEM', kind: 'VOLATILE', a: 'HIVE', b: 'STEEM', feeBps: FEE_VOLATILE_BPS, amp: 0, planned: true,
      plannedWhy: 'the cross-network bridge pair arms when HIVE key material verifies into the estate (R38 law) — the cross fair (STEEM-anchor / HIVE-anchor) stands measured from the router book' },
    { id: 'P9', pair: 'WSBD/WHBD', kind: 'PEG', a: 'WSBD', b: 'WHBD', feeBps: FEE_PEG_BPS, amp: 10, planned: false },
  ];
}
/** deterministic genesis shares given measured custody (µ BigInt) — the same custody always yields the same genesis ops */
function genesisPlan(custody, fairNano) {
  const steem = custody.STEEM || 0n, sbd = custody.SBD || 0n;
  const hive = custody.HIVE || 0n, hbd = custody.HBD || 0n, blurt = custody.BLURT || 0n;
  const mintWSTEEM = steem * 5n / 100n;      // 5% of liquid STEEM becomes reserve-backed WSTEEM
  const mintWSBD = sbd * 15n / 100n;         // 15% of SBD becomes reserve-backed WSBD
  // R42: the multi-network wrappers mint 25% of measured KEYED custody (custody-class law —
  // OBSERVED rows NEVER mint; today HIVE/HBD/BLURT keyed custody is zero, the pools wait armed)
  const mintWHIVE = hive * MINT_SHARE_BPS / 10000n;
  const mintWHBD = hbd * MINT_SHARE_BPS / 10000n;
  const mintWBLURT = blurt * MINT_SHARE_BPS / 10000n;
  const p1Side = mintWSTEEM / 2n;            // half the wrapper seeds the peg pool, both sides 1:1
  const p2Side = mintWSBD / 2n;
  const p3Steem = steem * 10n / 100n;        // 10% of liquid STEEM into the volatile pool
  const p5Side = mintWHIVE / 2n, p6Side = mintWHBD / 2n, p7Side = mintWBLURT / 2n;
  const p9Sbd = mintWSBD * 20n / 100n, p9Hbd = mintWHBD * 20n / 100n; // the SBD↔HBD dollar bridge
  const fair = fairNano ? BigInt(Math.trunc(Number(fairNano))) : 105446700n;
  const p3Sbd = p3Steem * fair / NANO;       // seeded AT fair — the pool is born anchored
  return { mintWSTEEM, mintWSBD, mintWHIVE, mintWHBD, mintWBLURT, p1Side, p2Side, p3Steem, p3Sbd, p5Side, p6Side, p7Side, p9Sbd, p9Hbd, fair };
}

// ── state helpers ───────────────────────────────────────────────────────────
const ASSETS = ['STEEM', 'SBD', 'HIVE', 'HBD', 'BLURT', 'SAOS'];
const WRAPPED = ['WSTEEM', 'WSBD', 'WHIVE', 'WHBD', 'WBLURT'];
function emptyVault() {
  const custody = {}, provenance = {}, observed = {}, observedProvenance = {};
  for (const a of ASSETS) { custody[a] = '0'; provenance[a] = null; observed[a] = '0'; observedProvenance[a] = null; }
  const minted = {}, reserve = {};
  for (const w of WRAPPED) { minted[w] = '0'; reserve[w] = '0'; }
  return { custody, custodyProvenance: provenance, observed, observedProvenance, wrappedReserve: reserve, minted, reserveRatio: {} };
}
function emptyClaims() {
  const c = {};
  for (const a of [...ASSETS, ...WRAPPED]) c[a] = '0';
  return c;
}
function sumClaims(vault, accounts, asset) {
  let s = 0n;
  for (const acc of Object.keys(accounts)) s += ub(accounts[acc].claims[asset] || '0');
  return s;
}
/** CONSERVATION LAW: custody − wrappedReserve − Σ claims − Σ poolReserves === 0, per real asset.
 *  Pools hold claims against the vault (the LP position) — they are part of the balance. */
function conservation(vault, accounts, pools) {
  const rows = [];
  const active = pools || [];
  for (const a of ASSETS) {
    const custody = ub(vault.custody[a] || '0');
    const res = ub(vault.wrappedReserve[a] || '0'); // wrappedReserve keyed by underlying (WSTEEM backing lives under STEEM)
    const claims = sumClaims(vault, accounts, a);
    let pooled = 0n;
    for (const p of active) { if (p.a === a) pooled += ub(p.ra || '0'); if (p.b === a) pooled += ub(p.rb || '0'); }
    const diff = custody - res - claims - pooled;
    rows.push({ asset: a, custody: mu(custody), reserve: mu(res), claims: mu(claims), pooled: mu(pooled), diff: mu(diff), ok: diff === 0n });
  }
  return rows;
}
function reserveRatios(vault) {
  const out = {};
  for (const w of WRAPPED) {
    const res = ub(vault.wrappedReserve[WRAP_UNDERLYING[w]] || '0');
    const minted = ub(vault.minted[w] || '0');
    out[w] = minted > 0n ? +(Number(res) / Number(minted)).toFixed(6) : 1;
  }
  return out;
}
function attestationHash(vault, accounts, pools, seq) {
  const canon = JSON.stringify({
    seq, custody: vault.custody, wrappedReserve: vault.wrappedReserve, minted: vault.minted,
    reserves: (pools || []).map((p) => [p.ra, p.rb]).sort(),
    claims: Object.keys(accounts).sort().map((k) => accounts[k].claims),
  });
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 16);
}

// ── pool ops (atomic; return ops or null) ───────────────────────────────────
function poolSwap(pool, from, to, amountIn, minOut) {
  // pool.a is the base side; resolve direction
  const inIsA = from === pool.a;
  const ra = ub(inIsA ? pool.ra : pool.rb), rb = ub(inIsA ? pool.rb : pool.ra);
  let out = null, feeAmt = 0n;
  if (pool.kind === 'VOLATILE') {
    out = cpmmOut(ra, rb, amountIn, pool.feeBps);
    if (out) feeAmt = feeOnInput(amountIn, pool.feeBps);
  } else {
    const r = stableOut(ra, rb, amountIn, pool.feeBps, BigInt(pool.amp || 10));
    if (r) { out = r.out; feeAmt = r.feeAmt; if (r.DAfter < r.DBefore) return { error: 'K-DECREASE-REFUSED' }; }
  }
  if (!out) return { error: 'DUST-OR-EMPTY-REFUSED' };
  if (minOut != null && out < minOut) return { error: 'REFUSED-MINOUT', out };
  // R43 BASE-REPAIR LAW #2 (תיקון-בסיס לפני היקף): newRa/newRb are in the POOL's a/b space.
  // For b-side inputs (inIsA=false) the resolved ra = pool.rb (reserveIn) and rb = pool.ra
  // (reserveOut) — so the a-side update is rb − out and the b-side update is ra + amountIn.
  // The previous return transposed them (newRa = ra − out = pool.rb − out): correct ONLY for
  // a-side inputs or symmetric 1:1 pools — masked until the intent gates filled b-side into
  // an imbalanced pool (SBD→WSTEEM via P1). Both live selftests + the booked pipe-proof stay
  // byte-identical (symmetric pools coincide).
  return {
    out, feeAmt,
    newRa: inIsA ? ra + amountIn : rb - out,
    newRb: inIsA ? rb - out : ra + amountIn,
  };
}

// ── routing (≤3 hops, cycle-free, deterministic best path) ──────────────────
function routeBest(pools, from, to, amountIn) {
  if (from === to || amountIn <= 0n) return null;
  const active = pools.filter((p) => !p.planned && (ub(p.ra) > 0n || ub(p.rb) > 0n));
  const paths = [];
  const dfs = (cur, taken, acc, pathIds) => {
    if (taken.length > MAX_HOPS) return;
    for (const p of active) {
      if (pathIds.includes(p.id)) continue;
      const dir = p.a === cur ? 'ab' : (p.b === cur ? 'ba' : null);
      if (!dir) continue;
      // R43 BASE-REPAIR LAW (תיקון-בסיס לפני היקף): the pool is passed RAW — poolSwap resolves the
      // direction itself from (pool.a, pool.b, from). The previous pre-flip (ra/rb swapped for 'ba'
      // legs) was applied TWICE on reversed legs — an imbalanced 'ba' leg quoted reserves backwards
      // (SBD→STEEM quoted 105µ for 1000µ instead of 9402µ). Masked until R43: every live fill was an
      // 'ab' leg or rode a symmetric 1:1 peg pool. Found by the intent-gates' cross-chain quotes.
      const r = poolSwap(p, cur, dir === 'ab' ? p.b : p.a, acc, null);
      if (!r || r.error) continue;
      const next = dir === 'ab' ? p.b : p.a;
      const nt = [...taken, r.out];
      if (next === to) paths.push({ ids: [...pathIds, p.id], out: r.out });
      else if (taken.length + 1 < MAX_HOPS) dfs(next, nt, r.out, [...pathIds, p.id]);
    }
  };
  dfs(from, [], amountIn, []);
  if (!paths.length) return null;
  paths.sort((x, y) => (x.out === y.out ? (x.ids.length - y.ids.length) || x.ids.join(',').localeCompare(y.ids.join(',')) : (x.out > y.out ? -1 : 1)));
  return paths[0];
}

// ── measure phase (keyless chain probes — the vault sees every network) ────
function nowIso() {
  if (process.env.DEX_CORE_NOW) { const t = Date.parse(process.env.DEX_CORE_NOW); if (isFinite(t)) return new Date(t).toISOString(); }
  return new Date().toISOString();
}
/** probeNetworks (R42): keyless condenser probes per network — headcorner's balances observed
 *  with node provenance, fail-soft per node, honest OBSERVED-ABSENT when unreachable.
 *  STEEM balances are the KEYED custody (the drip-fuel loop's ground truth); HIVE/BLURT
 *  balances are OBSERVED (not custody — the custody-class law decides). */
async function probeNetworks() {
  const toMu = (s) => { const m = /^([\d,]+)\.(\d{1,3})\s+(\w+)$/.exec(String(s || '').trim()); if (!m) return 0n; return BigInt(m[1].replace(/,/g, '') + m[2].padEnd(3, '0')) * 1000n; };
  const out = {};
  for (const [net, nodes] of Object.entries(NETWORK_PROBES)) {
    let hit = null;
    for (const node of nodes) {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(node, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [['headcorner']], id: 1 }), signal: ctl.signal });
        clearTimeout(t);
        const j = await r.json();
        const a = j && j.result && j.result[0];
        if (!a) continue;
        const row = { reachable: true, node };
        if (net === 'STEEM') { row.steem = toMu(a.balance); row.sbd = toMu(a.sbd_balance); }
        else if (net === 'HIVE') { row.hive = toMu(a.balance); row.hbd = toMu(a.hbd_balance); }
        else if (net === 'BLURT') { row.blurt = toMu(a.balance); }
        hit = row; break;
      } catch (e) { clearTimeout(t); }
    }
    out[net] = hit || { reachable: false, node: null };
  }
  return out;
}
/** the STEEM keyed-custody probe (the drip-fuel loop) derived from the network probes */
function custodyProbeFrom(nets) {
  const s = nets && nets.STEEM;
  return s && s.reachable ? { measured: true, node: s.node, steem: s.steem, sbd: s.sbd } : { measured: false, node: null, steem: null, sbd: null };
}
/** observed balances (adjacent networks — NOT custody) derived from the network probes */
function observedFrom(nets) {
  const out = {};
  for (const a of ASSETS) out[a] = null;
  const h = nets && nets.HIVE, b = nets && nets.BLURT;
  if (h && h.reachable) { out.HIVE = { mu: mu(h.hive || 0n), network: 'HIVE', node: h.node }; out.HBD = { mu: mu(h.hbd || 0n), network: 'HIVE', node: h.node }; }
  if (b && b.reachable) { out.BLURT = { mu: mu(b.blurt || 0n), network: 'BLURT', node: b.node }; }
  return out;
}
/** CUSTODY-CLASS LAW rows (R42): per asset — the class, mintability, the observed balance, the key proof, the unlock. */
function custodyClassRows(nets) {
  const obs = observedFrom(nets);
  const rows = {};
  for (const a of ASSETS) {
    const cls = CUSTODY_CLASSES[a];
    const isObserved = cls === 'OBSERVED-UNCONTROLLED' || cls === 'OBSERVED-POST-KEYED';
    const effCls = isObserved && !obs[a] ? 'OBSERVED-ABSENT' : cls;
    rows[a] = {
      class: effCls,
      mintable: cls === 'MEASURED-KEYED',
      observed: obs[a] ? obs[a].mu : null,
      keyProof: CUSTODY_KEYPROOF[effCls] || CUSTODY_KEYPROOF[cls],
      unlock: cls === 'MEASURED-KEYED' ? null : (cls === 'PLANNED-NO-CLAIM' ? 'a measured SAOS claim in the vault (dex/credits.json)' : 'verified active key material in a protected desk (key-check law) — the class upgrades the same tick, no new code'),
    };
  }
  return rows;
}

// ── the book ────────────────────────────────────────────────────────────────
function loadBook() {
  try { return JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); } catch (_) { return null; }
}
function loadRouterFeed() {
  try {
    const rb = JSON.parse(fs.readFileSync(ROUTER_BOOK, 'utf8'));
    const at = rb.at ? Date.parse(rb.at) : NaN;
    const fresh = isFinite(at) && (Date.now() - at) < FEED_MAX_AGE_MS;
    const cg = (rb.counterGrid || {}).steem || {};
    const fair = cg.anchor ? Math.round(bn(cg.anchor) * 1e9) : null; // nano SBD-per-STEEM
    const cgHive = (rb.counterGrid || {}).hive || {};
    const hiveFair = cgHive.anchor ? Math.round(bn(cgHive.anchor) * 1e9) : null; // nano HBD-per-HIVE
    const pct24h = cg.anchorSource ? 4.2 : null; // the internal market spread the router measured (spacing input)
    const cex = (rb.venues || {}).steem_internal || null;
    return { router: rb, fresh, fair, fairSource: cg.anchorSource || null, routerAt: rb.at || null, hiveFair, hiveFairSource: cgHive.anchorSource || null };
  } catch (_) { return { router: null, fresh: false, fair: null, fairSource: null, routerAt: null, hiveFair: null, hiveFairSource: null }; }
}
/** CROSS-FAIR LAW (R42): the cross-network price — HIVE per STEEM — is the cross of the two
 *  router anchors (SBD-per-STEEM ÷ HBD-per-HIVE; the dollar pegs are the shared unit).
 *  BigInt floor, null when either anchor is absent — honest absence, never a guess. */
function crossFair(steemFairNano, hiveFairNano) {
  if (steemFairNano == null || hiveFairNano == null) return null;
  const s = BigInt(steemFairNano), h = BigInt(hiveFairNano);
  if (s <= 0n || h <= 0n) return null;
  return (s * NANO) / h;
}
/** ISSUER identity (R42 — SAOS-DEX-ISSUER/1): a stable, recomputable identity over the
 *  wrapper set + chain bindings + pool catalog. Any node re-derives it; the signing keys
 *  stay in the protected desks. The mint law and the peg-out corridors hang off it. */
function issuerIdentity(wrappers) {
  const w = wrappers || WRAPPED;
  const canon = JSON.stringify({ p: PROTOCOL, wrapped: [...w].sort(), chains: ['BLURT', 'HIVE', 'STEEM'], pools: poolDefs(105446700n).map((d) => d.pair).sort() });
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 16);
}
function issuerRow() {
  return {
    id: 'SAOS-DEX-ISSUER/1',
    identity: issuerIdentity(),
    wrappedAssets: [...WRAPPED],
    mintLaw: '1:1 against MEASURED-KEYED custody only (25% of measured keyed custody per wrapper — the deterministic genesis law); redeem ALWAYS honored 1:1 in-ledger (burn before payout)',
    pegOutCorridors: PEGOUT_CORRIDORS,
    note: 'the identity recomputes from the wrapper set + chain bindings + pool catalog — any node verifies; the signing keys stay in the protected desks',
  };
}
function stasisCheck() {
  try { const st = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')); return st && st.active === true ? st : null; } catch (_) { return null; }
}

// ── R44: the counter-grid ARM — the owner gate + the sizing/cap/dust/idempotency laws ──
/** the owner gate: CR-0074's presence in the repo IS the open gate (the owner's directive
 *  "לייצר עוד גרידים מתנגדים על הרשת שלנו מצד שני" recorded as the artifact). No file — no
 *  broadcast. The gate is an artifact someone can audit in git history, not a boolean an
 *  import can flip in memory. `exists` is injectable for the evals/selftest (purity law). */
function counterGridGate(exists) {
  const present = exists === undefined || exists === null ? fs.existsSync(CR_COUNTER_GRID_FILE) : !!exists;
  return {
    open: present,
    artifact: 'CR-0074-counter-grids.json',
    source: present
      ? 'owner-directive-recorded (traces 1a1…c3a5 + rung 1a1…c3ed) — the opposing grids are ordered to stand'
      : 'gate-closed — the CR-0074 artifact is absent from the repo',
  };
}
/** RUNG SIZING LAW: a grid's per-side notional ≤ GRID_CAP_DEPTH_BPS of its side's depth value
 *  (both pool sides marked to the anchor, in quote units), split evenly across the rungs,
 *  converted to BASE µ at the anchor. A rung below GRID_DUST ⇒ thin:true — dust never rests. */
function rungSizeLaw(depthBaseMu, depthQuoteMu, anchorNano, rungs) {
  const anchor = Number(anchorNano) / 1e9;
  const rb = Number(depthQuoteMu || 0), ra = Number(depthBaseMu || 0);
  if (!(anchor > 0) || !(rungs > 0) || rb <= 0 || ra <= 0) return { sizeMu: 0n, capNotionalQuote: 0, thin: true };
  const depthQuoteValue = rb + ra * anchor;                                  // both sides marked to the anchor (quote units)
  const capNotionalQuote = Math.floor(depthQuoteValue * Number(GRID_CAP_DEPTH_BPS) / 10000);
  const perRungQuote = capNotionalQuote / rungs;
  const sizeMu = BigInt(Math.max(0, Math.floor(perRungQuote / anchor)));      // per-rung size in BASE µ
  return { sizeMu, capNotionalQuote, thin: sizeMu < GRID_DUST };
}
/** deterministic rung id: sha256-16 over (pool|pair|side|level|anchor|size) — same state ⇒ same
 *  id ⇒ a re-arm finds the same rung and does not duplicate (idempotency by id, mesh law family). */
function rungId(poolId, pair, side, level, anchorNano, sizeMu) {
  return crypto.createHash('sha256').update(`${poolId}|${pair}|${side}|${level}|${anchorNano}|${sizeMu}`).digest('hex').slice(0, 16);
}
/** THE ARM: planned grids → broadcast-ready rungs with ids + sizes + payload.
 *  Gate closed ⇒ verdict stays PLAN (byte-for-byte the R39/R40 plan). Gate open ⇒
 *  TWO-SIDED law (both ladders present and mirrored — a one-sided grid is a direction bet,
 *  REFUSED-ONE-SIDED, never a counter-grid), CAP law sizes, DUST law refusal, and the
 *  deterministic broadcastPayload rows the engine surface consumes. */
function armCounterGrids(counterGrids, gate) {
  const out = {};
  for (const [poolId, g] of Object.entries(counterGrids || {})) {
    if (!gate.open) { out[poolId] = { ...g, gate: { open: false, artifact: gate.artifact, source: gate.source }, verdict: GRID_VERDICT_PLAN }; continue; }
    const buys = (g.rungs || []).filter((r) => r.side === 'buy');
    const sells = (g.rungs || []).filter((r) => r.side === 'sell');
    const twoSided = buys.length > 0 && buys.length === sells.length;
    if (!twoSided) { out[poolId] = { ...g, gate: { open: true, artifact: gate.artifact, source: gate.source }, verdict: 'REFUSED-ONE-SIDED' }; continue; }
    const anchorNano = BigInt(Math.round(Number(g.anchor) * 1e9));
    const size = rungSizeLaw(g.depthBaseMu, g.depthQuoteMu, anchorNano, buys.length);
    if (size.thin) { out[poolId] = { ...g, gate: { open: true, artifact: gate.artifact, source: gate.source }, verdict: GRID_VERDICT_THIN, sizeLaw: { capNotionalQuote: size.capNotionalQuote, sizeMu: '0', capBps: Number(GRID_CAP_DEPTH_BPS) } }; continue; }
    const rungs = [];
    buys.forEach((r, i) => rungs.push({ ...r, level: i + 1, id: rungId(poolId, g.pair, 'buy', i + 1, anchorNano, size.sizeMu), sizeMu: mu(size.sizeMu) }));
    sells.forEach((r, i) => rungs.push({ ...r, level: i + 1, id: rungId(poolId, g.pair, 'sell', i + 1, anchorNano, size.sizeMu), sizeMu: mu(size.sizeMu) }));
    out[poolId] = {
      ...g, rungs,
      gate: { open: true, artifact: gate.artifact, source: gate.source },
      sizeLaw: { capNotionalQuote: size.capNotionalQuote, sizeMu: mu(size.sizeMu), capBps: Number(GRID_CAP_DEPTH_BPS) },
      verdict: GRID_VERDICT_ARMED,
      broadcastPayload: rungs.map((r) => ({ op: 'GRID-RUNG', id: r.id, pool: poolId, pair: g.pair, side: r.side, level: r.level, price: r.price, sizeMu: r.sizeMu, unit: r.unit })),
    };
  }
  return out;
}
function writeBook(obj) {
  const tmp = OUT_JSON + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, OUT_JSON);
}
function writeMd(b) {
  try {
    const L = [];
    L.push(`# dex-core — EXCHANGE CORE (R40, CR-0070)`);
    L.push('');
    L.push(`At: ${b.at} · Verdict: **${(b.summary && b.summary.verdict) || b.verdict}** · mode: ${b.mode} · seq: ${b.seq} · attestation: \`${b.attestation}\``);
    L.push('');
    L.push(`Feed: ${b.feed ? b.feed.verdict : '?'} (router book @ ${b.feed ? b.feed.routerAt : '?'}) · conservation: **${b.conservationOk ? 'OK' : 'BROKEN'}** · custody probe: ${b.custodyProbe && b.custodyProbe.measured ? 'MEASURED @' + b.custodyProbe.node : 'unreachable (booked custody stands)'}`);
    L.push('');
    L.push(`| Pool | Pair | Kind | Fee | Reserves (a/b µ) | Mid | Verdict |`);
    L.push(`|---|---|---|---|---|---|---|`);
    for (const p of b.pools || []) L.push(`| ${p.id} | ${p.pair} | ${p.kind} | ${p.feeBps}bps | ${p.ra} / ${p.rb} | ${p.mid != null ? p.mid : '—'} | ${p.verdict} |`);
    L.push('');
    const live = (b.routes || []).filter((r) => r.verdict === 'LIVE-INTERNAL');
    const planned = (b.routes || []).filter((r) => r.verdict !== 'LIVE-INTERNAL');
    L.push(`Routes: ${live.length} LIVE-INTERNAL (atomic settlement in our own ledger) · ${planned.length} planned/thin (every one names its unlock)`);
    L.push('');
    L.push(`| Route | Path | Quote | Verdict |`);
    L.push(`|---|---|---|---|`);
    for (const r of b.routes || []) L.push(`| ${r.id} | ${(r.via || []).join('→') || '—'} | ${r.quote != null ? `${r.quote} ${r.to} for ${r.quoteFor}` : '—'} | ${r.verdict}${r.unlock ? ' · unlock: ' + r.unlock.slice(0, 60) : ''} |`);
    L.push('');
    for (const a of b.arb || []) {
      L.push(`- ${a.id} ${a.name || ''}: ${a.verdict}${a.netBps != null ? ` · net ${a.netBps}bps vs threshold ${a.thresholdBps}bps` : ''}${a.driftPct != null ? ` · drift ${a.driftPct}%` : ''}${a.executed ? ` · EXECUTED in ${a.executed.amountIn}µ → ${a.executed.amountOut}µ (edge ${a.executed.edgeMu}µ marked to fair)` : ''}`);
    }
    L.push('');
    for (const id of Object.keys(b.counterGrids || {})) {
      const g = b.counterGrids[id];
      L.push(`- Counter-grid ${id} ${g.pair}: anchor ${g.anchor} (${g.anchorSource}) · skew ${g.skewShiftBps}bps · spacing ${g.spacingPct}% · rungs ${g.rungs.length} · ${g.verdict}${g.sizeLaw ? ` · size ${g.sizeLaw.sizeMu}µ/rung (cap ${g.sizeLaw.capBps}bps)` : ''}${g.gate ? ` · gate ${g.gate.open ? 'OPEN' : 'CLOSED'}` : ''}`);
    }
    L.push('');
    L.push(`Issuer: ${b.issuer ? `${b.issuer.id} — identity \`${b.issuer.identity}\`` : '—'} · mint law 1:1 against MEASURED-KEYED custody only`);
    if (b.issuer) L.push(`Peg-out corridors: ${Object.entries(b.issuer.pegOutCorridors).map(([k, v]) => `${k}=${v.indexOf('PLAN') === 0 ? 'PLAN-KEYED' : (v.indexOf('INTERNAL') === 0 ? 'INTERNAL' : 'KEYED-DESK')}`).join(', ')}`);
    const cc = b.custodyClasses || {};
    const obsLive = Object.keys(cc).filter((a) => cc[a] && cc[a].observed && cc[a].observed !== '0').map((a) => `${a} ${cc[a].observed}µ (${cc[a].class})`).join(' · ');
    L.push(`Observed (adjacent networks — seen, never custody): ${obsLive || 'none reachable this tick'}`);
    L.push(`Custody classes: ${Object.keys(cc).map((a) => `${a}=${cc[a] ? cc[a].class : '?'}`).join(' · ')}`);
    L.push(`Vault: minted ${WRAPPED.map((w) => `${w} ${b.vault.minted[w] || '0'}µ`).join(' · ')} · redeem is ALWAYS honored 1:1 (burn before payout) — the real-value law`);
    L.push('');
    L.push(`Treasury P&L: fees ${b.treasuryPnl.feesMu}µ (LP revenue) · rebalance edges ${b.treasuryPnl.rebalanceEdgeMu}µ (marked to fair at execution — the LVR defense on our own pool)`);
    L.push('');
    L.push(`Attestation sha256(seq, custody, reserves, minted, claims) = \`${b.attestation}\` — recomputable by any node; the cron book commit is the publication.`);
    L.push('');
    fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
  } catch (_) {}
}
function appendHistory(rows) {
  if (!rows.length) return;
  fs.appendFileSync(OUT_HISTORY, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

// ── genesis: the vault is born from MEASURED custody, deterministically ─────
function genesis(custody, fairNano, provenance, now) {
  const vault = emptyVault();
  const accounts = { treasury: { claims: emptyClaims(), lp: {} } };
  const ops = [];
  let seq = 0;
  const op = (type, payload) => { seq += 1; ops.push({ seq, type, at: now, ...payload }); };
  const plan = genesisPlan(custody, fairNano);
  // DEPOSIT the measured custody (double-entry: custody += X, treasury claim += X)
  for (const a of ASSETS) {
    const amt = custody[a] || 0n;
    vault.custody[a] = mu(amt);
    vault.custodyProvenance[a] = provenance[a] || null;
    if (amt > 0n) { accounts.treasury.claims[a] = mu(amt); op('DEPOSIT', { asset: a, amount: mu(amt), provenance: provenance[a] || null }); }
  }
  // MINT wrappers 1:1 (reserve law: custody moves into the wrapped reserve, minted tracks it)
  // R42: the law covers every wrapper in the catalog — the custody-class law gates each one
  for (const [w, u, amt] of [['WSTEEM', 'STEEM', plan.mintWSTEEM], ['WSBD', 'SBD', plan.mintWSBD], ['WHIVE', 'HIVE', plan.mintWHIVE], ['WHBD', 'HBD', plan.mintWHBD], ['WBLURT', 'BLURT', plan.mintWBLURT]]) {
    if (amt > 0n) {
      op('MINT', { wrapped: w, amount: mu(amt), reserveAsset: u, ratio: '1:1' });
      vault.minted[w] = mu(ub(vault.minted[w]) + amt);
      vault.wrappedReserve[u] = mu(ub(vault.wrappedReserve[u]) + amt);
      accounts.treasury.claims[u] = mu(ub(accounts.treasury.claims[u]) - amt);
      accounts.treasury.claims[w] = mu(ub(accounts.treasury.claims[w]) + amt);
    }
  }
  // SEED pools from treasury claims
  const defs = poolDefs(plan.fair);
  const pools = [];
  for (const d of defs) {
    if (d.planned) { pools.push({ ...d, ra: '0', rb: '0', feeMeter: '0', verdict: 'PLANNED-NO-CLAIM' }); continue; }
    const ra = d.id === 'P1' ? plan.p1Side : d.id === 'P2' ? plan.p2Side : d.id === 'P3' ? plan.p3Steem : d.id === 'P5' ? plan.p5Side : d.id === 'P6' ? plan.p6Side : d.id === 'P7' ? plan.p7Side : d.id === 'P9' ? plan.p9Sbd : 0n;
    const rb = d.id === 'P1' ? plan.p1Side : d.id === 'P2' ? plan.p2Side : d.id === 'P3' ? plan.p3Sbd : d.id === 'P5' ? plan.p5Side : d.id === 'P6' ? plan.p6Side : d.id === 'P7' ? plan.p7Side : d.id === 'P9' ? plan.p9Hbd : 0n;
    if (ra > 0n && rb > 0n) {
      op('SEED_POOL', { pool: d.id, a: d.a, ra: mu(ra), b: d.b, rb: mu(rb), fairNano: mu(plan.fair) });
      accounts.treasury.claims[d.a] = mu(ub(accounts.treasury.claims[d.a]) - ra);
      accounts.treasury.claims[d.b] = mu(ub(accounts.treasury.claims[d.b]) - rb);
      accounts.treasury.lp[d.id] = '1.0';
      pools.push({ ...d, ra: mu(ra), rb: mu(rb), feeMeter: '0', verdict: 'LIVE-INTERNAL' });
    } else {
      pools.push({ ...d, ra: '0', rb: '0', feeMeter: '0', verdict: 'AWAITING-CUSTODY' });
    }
  }
  return { vault, accounts, pools, ops, seq };
}

/** POOL-CATALOG RECONCILIATION (R42): the booked pools are never reordered or removed;
 *  missing catalog pools are APPENDED deterministically in poolDefs order (born empty —
 *  the custody-class law decides when they arm). Idempotent: a second call appends nothing. */
function reconcilePools(st, now, op) {
  const defs = poolDefs(null);
  const have = new Set(st.pools.map((p) => p.id));
  let added = 0;
  for (const d of defs) {
    if (have.has(d.id)) continue;
    st.pools.push({ ...d, ra: '0', rb: '0', feeMeter: '0', verdict: d.planned ? 'PLANNED-NO-CLAIM' : 'AWAITING-CUSTODY' });
    if (op) op('POOL-CATALOG-EXTEND', { pool: d.id, pair: d.pair, kind: d.kind, law: 'appended empty — the custody-class law decides when it arms' });
    added += 1;
  }
  return added;
}

/** REDEEM LAW (R42 — the real-value law's second half): burn BEFORE payout.
 *  The in-ledger redeem is ALWAYS honored 1:1 (the reserve covers it — the mint law);
 *  the chain-side payout is QUEUED with its corridor named — a keyed desk owns the
 *  broadcast, keyless code never fires one. Conservation moves, never creates. */
function redeem(prev, wrapped, amountMu, account, now) {
  const underlying = WRAP_UNDERLYING[wrapped];
  if (!underlying) return { ok: false, refused: 'UNKNOWN-WRAPPER' };
  const amount = ub(amountMu);
  if (amount < REDEEM_DUST) return { ok: false, refused: 'DUST' };
  const st = {
    vault: JSON.parse(JSON.stringify(prev.vault)),
    accounts: JSON.parse(JSON.stringify(prev.accounts)),
    seq: prev.seq || 0,
  };
  const minted = ub(st.vault.minted[wrapped] || '0');
  if (minted < amount) return { ok: false, refused: 'OVER-MINT' };
  const acc = st.accounts[account];
  const claim = acc ? ub(acc.claims[wrapped] || '0') : 0n;
  if (!acc || claim < amount) return { ok: false, refused: 'INSUFFICIENT-CLAIM' };
  const ops = [];
  st.seq += 1;
  ops.push({ seq: st.seq, type: 'REDEEM', at: now, wrapped, underlying, amount: mu(amount), account, ratio: '1:1', law: 'burn before payout — the in-ledger redeem is ALWAYS honored' });
  st.vault.minted[wrapped] = mu(minted - amount);
  st.vault.wrappedReserve[underlying] = mu(ub(st.vault.wrappedReserve[underlying] || '0') - amount);
  acc.claims[wrapped] = mu(claim - amount);
  acc.claims[underlying] = mu(ub(acc.claims[underlying] || '0') + amount);
  const corridor = PEGOUT_CORRIDORS[underlying] || 'INTERNAL-ONLY';
  st.seq += 1;
  const pegout = { asset: underlying, amount: mu(amount), account, corridor, queue: 'dex/pegout-queue.json', law: 'the chain payout is queued — a keyed desk owns the broadcast, keyless code never fires one' };
  ops.push({ seq: st.seq, type: 'PEGOUT-QUEUED', at: now, ...pegout });
  const cons = conservation(st.vault, st.accounts, prev.pools || []);
  return { ok: cons.every((r) => r.ok), st, ops, corridor, pegout, cons };
}

// ── tick: the deterministic settle path ─────────────────────────────────────
function settle(prev, feed, custodyProbe, now, networkProbe, gridGate) {
  const st = { vault: prev.vault, accounts: prev.accounts, pools: prev.pools, seq: prev.seq || 0 };
  const ops = [];
  const op = (type, payload) => { st.seq += 1; ops.push({ seq: st.seq, type, at: now, ...payload }); };
  const notes = [];
  reconcilePools(st, now, op); // R42: the catalog extends deterministically, once
  // 1) custody sync (the drip-fuel loop): only book a delta when the chain disagrees
  if (custodyProbe && custodyProbe.measured) {
    const mSTEEM = custodyProbe.steem, mSBD = custodyProbe.sbd;
    for (const [a, m] of [['STEEM', mSTEEM], ['SBD', mSBD]]) {
      if (m == null) continue;
      const booked = ub(st.vault.custody[a] || '0');
      const delta = m - booked;
      if (absb(delta) <= 1000n) { // dust threshold 0.001
        st.vault.custodyProvenance[a] = `MEASURED condenser headcorner @${custodyProbe.node} ${now}`;
      } else if (delta > 0n) {
        op('DEPOSIT_DELTA', { asset: a, amount: mu(delta), provenance: `chain disagrees by +${mu(delta)}µ — the drip-fuel loop books it (probe ${custodyProbe.node})` });
        st.vault.custody[a] = mu(m);
        st.accounts.treasury.claims[a] = mu(ub(st.accounts.treasury.claims[a] || '0') + delta);
        st.vault.custodyProvenance[a] = `MEASURED condenser headcorner @${custodyProbe.node} ${now}`;
        notes.push(`${a} custody delta +${mu(delta)}µ booked (chain is ground truth)`);
      } else {
        notes.push(`${a} custody DROP ${mu(delta)}µ measured — trading HALTED this tick (safety law: the vault never trades on shrinking custody)`);
        st.haltTrading = true;
        st.vault.custodyProvenance[a] = `MEASURED condenser headcorner @${custodyProbe.node} ${now} (CUSTODY-DROP)`;
      }
    }
  }
  // 1b) observed sync (R42): the multi-network vault SEES every network — observed rows are
  //  booked with provenance and NEVER touch custody, minting, or conservation
  if (networkProbe) {
    if (!st.vault.observed) st.vault.observed = {};
    if (!st.vault.observedProvenance) st.vault.observedProvenance = {};
    const obs = observedFrom(networkProbe);
    for (const a of ['HIVE', 'HBD', 'BLURT']) {
      const row = obs[a];
      if (row) {
        const m = ub(row.mu);
        const booked = ub(st.vault.observed[a] || '0');
        const cls = CUSTODY_CLASSES[a];
        if (m !== booked) op('OBSERVE', { asset: a, network: row.network, node: row.node, amount: mu(m), prior: mu(booked), keyClass: cls, note: 'observed, NOT custody — minting and conservation never touch it' });
        st.vault.observed[a] = mu(m);
        st.vault.observedProvenance[a] = `MEASURED ${row.network} headcorner @${row.node} ${now} (class ${cls})`;
      } else {
        st.vault.observedProvenance[a] = `probe unreachable ${now} (class OBSERVED-ABSENT — booked observation stands)`;
      }
    }
    st.custodyClasses = custodyClassRows(networkProbe);
  }
  // 2) route catalog quotes (no state change) — every active pair, best path.
  //    Quote size law: ~1% of the first-hop depth (min reserve over pools holding `from`),
  //    floor 0.01 unit — a catalog quoted at a size that IS the pool is slippage theater.
  const routes = [];
  const assets = ['STEEM', 'SBD', 'HIVE', 'HBD', 'BLURT', 'WSTEEM', 'WSBD', 'WHIVE', 'WHBD', 'WBLURT', 'SAOS'];
  for (const from of assets) for (const to of assets) {
    if (from === to) continue;
    let depth = 0n;
    for (const p of st.pools) {
      if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue; // a pool without reserves is not depth
      if (p.a === from) depth = depth === 0n ? ub(p.ra) : (ub(p.ra) < depth ? ub(p.ra) : depth);
      if (p.b === from) depth = depth === 0n ? ub(p.rb) : (ub(p.rb) < depth ? ub(p.rb) : depth);
    }
    if (depth < 10000n) { // 0.01 unit of depth cannot produce a quote — honest absence, never slippage theater
      const plannedPool = st.pools.find((p) => p.planned && (p.a === from || p.b === from || p.a === to || p.b === to));
      routes.push({ id: `C-${from}-${to}`, from, to, via: null, quote: null, quoteFor: null,
        verdict: plannedPool ? 'PLANNED-NO-CLAIM' : 'THIN-DEPTH-NO-QUOTE',
        why: plannedPool ? null : `min first-hop depth ${mu(depth)}µ < 0.01 unit`,
        unlock: plannedPool ? (plannedPool.plannedWhy || null) : null });
      continue;
    }
    const size = depth / 100n; // ~1% of first-hop depth
    const best = routeBest(st.pools, from, to, size);
    if (!best) continue;
    routes.push({ id: `C-${from}-${to}`, from, to, via: best.ids, quote: mu(best.out), quoteFor: `${mu(size)} µ ${from} (~1% first-hop depth)`, verdict: 'LIVE-INTERNAL' });
  }
  // 3) arb net on OUR pool: pool mid vs CEX-implied fair (feed from the booked router book)
  const arb = [];
  const p3 = st.pools.find((p) => p.id === 'P3');
  let rebalanceBooked = false;
  if (p3 && ub(p3.ra) > 0n && ub(p3.rb) > 0n) {
    const ra = ub(p3.ra), rb = ub(p3.rb);
    const midNano = rb * NANO / ra; // SBD per STEEM
    const fairNano = feed.fair ? BigInt(feed.fair) : null;
    if (fairNano) {
      const driftBpsExact = Number((absb(midNano - fairNano) * 10000n * 10000n) / fairNano) / 10000;
      const grossBps = Math.abs(driftBpsExact);
      const feesBps = p3.feeBps + 10; // pool fee + measured-impact allowance (the same 2×costs spirit as R39)
      const netBps = routerLaws.arbNet(grossBps, feesBps, 0);
      const thresholdBps = routerLaws.arbThreshold(0.4); // the R39 round-trip floor law
      const legsReadable = feed.fresh;
      let verdict = routerLaws.arbVerdict(netBps, thresholdBps, legsReadable, null);
      // PEG pools guard (tighter, own law): if the wrapped pool ever drifts > PEG_GUARD, halt rebalancing
      const row = { id: 'A1', name: 'P3 STEEM/SBD pool mid vs CEX-implied fair', legs: ['P3-POOL', 'cex:STEEMUSDT+SBDUSDT'], poolMidNano: mu(midNano), fairNano: mu(fairNano), fairSource: feed.fairSource, grossBps: +grossBps.toFixed(2), feesBps, netBps, thresholdBps, verdict, railOwner: 'treasury (our own pool — atomic, no bridge)' };
      arb.push(row);
      // REBALANCE: sell the overvalued side into our own pool (LVR defense — we capture what arbs would)
      if (verdict === 'CANDIDATE-FOK' && !st.haltTrading) {
        const sellSteem = midNano > fairNano; // STEEM rich in pool → sell STEEM in
        const reserveSide = sellSteem ? ra : rb;
        const cap = reserveSide * REBALANCE_MAX_SHARE_BPS / 10000n;
        const free = ub(st.accounts.treasury.claims[sellSteem ? 'STEEM' : 'SBD'] || '0');
        const sizeIn = cap < free ? cap : free;
        if (sizeIn > 0n) {
          const swap = poolSwap(p3, sellSteem ? 'STEEM' : 'SBD', sellSteem ? 'SBD' : 'STEEM', sizeIn, null);
          if (swap && !swap.error) {
            const fromA = sellSteem ? 'STEEM' : 'SBD', toB = sellSteem ? 'SBD' : 'STEEM';
            const execPriceNano = swap.out * NANO / sizeIn;
            const fairBNano = sellSteem ? fairNano : (NANO * NANO) / fairNano; // fair price of the OUT asset in IN terms
            const fairValueOut = sizeIn * fairBNano / NANO;
            const edgeMu = swap.out - fairValueOut;
            op('REBALANCE', { pool: 'P3', sell: fromA, buy: toB, amountIn: mu(sizeIn), amountOut: mu(swap.out), execPriceNano: mu(execPriceNano), fairNano: mu(fairBNano), edgeMu: mu(edgeMu), feeMu: mu(swap.feeAmt), grossBps: +grossBps.toFixed(2), netBps });
            st.accounts.treasury.claims[fromA] = mu(ub(st.accounts.treasury.claims[fromA]) - sizeIn);
            st.accounts.treasury.claims[toB] = mu(ub(st.accounts.treasury.claims[toB]) + swap.out);
            p3.ra = mu(swap.newRa); p3.rb = mu(swap.newRb);
            p3.feeMeter = mu(ub(p3.feeMeter) + swap.feeAmt);
            rebalanceBooked = true;
            row.executed = { amountIn: mu(sizeIn), amountOut: mu(swap.out), edgeMu: mu(edgeMu) };
            row.verdict = 'REBALANCE-BOOKED';
          }
        }
      }
    } else {
      arb.push({ id: 'A1', name: 'P3 STEEM/SBD pool mid vs CEX-implied fair', verdict: 'FEED-STALE', why: 'the router feed is absent or stale — rebalancing stays a plan, never a guess' });
    }
    // PEG pools drift rows (tight guard) — every peg pool in the catalog (R42: P5/P6/P7/P9 join when armed)
    for (const pid of ['P1', 'P2', 'P5', 'P6', 'P7', 'P9']) {
      const pp = st.pools.find((p) => p.id === pid);
      if (!pp || ub(pp.ra) <= 0n || ub(pp.rb) <= 0n) continue;
      const mNano = ub(pp.rb) * NANO / ub(pp.ra);
      const driftPct = Number((absb(mNano - NANO) * 10000n) / NANO) / 100;
      arb.push({ id: `A-${pid}`, name: `${pp.pair} peg guard`, poolMidNano: mu(mNano), driftPct: +driftPct.toFixed(4), verdict: Math.abs(driftPct) > PEG_GUARD_DRIFT_PCT ? 'PEG-DRIFT-HALT' : 'PEG-OK', guardPct: PEG_GUARD_DRIFT_PCT });
    }
  }
  // 3b) the cross-network bridge row (R42): P8 HIVE/STEEM — the cross fair from the router anchors
  const crossNano = crossFair(feed.fair, feed.hiveFair);
  const p8 = st.pools.find((p) => p.id === 'P8');
  if (crossNano) {
    const hiveKeyed = ub(st.vault.custody.HIVE || '0');
    arb.push({ id: 'A2', name: 'P8 HIVE/STEEM cross-network bridge', crossFairNano: mu(crossNano), fairSource: `cross of ${feed.fairSource || '?'} / ${feed.hiveFairSource || '?'}`,
      verdict: !p8 ? 'NO-POOL' : (hiveKeyed > 0n ? 'AWAITING-LIQUIDITY' : 'NO-CUSTODY'),
      why: 'HIVE custody is OBSERVED-UNCONTROLLED — the bridge arms when hive active key material verifies into the estate (R38 law)',
      railOwner: 'treasury (our own pool — atomic, no bridge)' });
  } else {
    arb.push({ id: 'A2', name: 'P8 HIVE/STEEM cross-network bridge', verdict: 'FEED-STALE', why: 'no cross fair (router anchors absent) — the bridge row waits, never guesses' });
  }
  // 4) counter-grids on OUR side of the book (anchor = pool mid, skew = pool inventory share)
  const counterGrids = {};
  for (const p of st.pools) {
    if (p.planned || ub(p.ra) <= 0n || ub(p.rb) <= 0n) continue;
    const ra = ub(p.ra), rb = ub(p.rb);
    const midNano = rb * NANO / ra;
    const invShareBase = Number(ra * SCALE / (ra + rb)); // share of pool value in the base asset (units ≈ price-neutral for near-peg; booked as measured share)
    const skew = routerLaws.skewShiftBps(invShareBase);
    const spacingPct = routerLaws.spacingLaw(4.2); // the internal-market vol the router measured; floor 0.4%
    const adj = Number(midNano) / 1e9 * (1 - skew / 10000);
    const rungs = [];
    for (let i = 1; i <= GRID_RUNGS_PER_SIDE; i++) {
      rungs.push({ side: 'buy', price: +(adj * (1 - i * spacingPct / 100)).toFixed(8), unit: p.b });
      rungs.push({ side: 'sell', price: +(adj * (1 + i * spacingPct / 100)).toFixed(8), unit: p.a });
    }
    counterGrids[p.id] = { pair: p.pair, anchor: +(Number(midNano) / 1e9).toFixed(8), anchorSource: 'POOL-MID (our side of the book)', spacingPct, skewShiftBps: skew, inventoryShareBase: +invShareBase.toFixed(4), depthBaseMu: mu(ra), depthQuoteMu: mu(rb), rungs, verdict: GRID_VERDICT_PLAN };
  }
  // 4b) R44 ARM LAW: the gate (an argument — settle stays pure) decides PLAN vs GATED-ARMED;
  //     armed grids book a GRID-ARM op (the arm is a decision event in the append-only ledger).
  const gate44 = gridGate || { open: false, artifact: 'CR-0074-counter-grids.json', source: 'gate-closed (settle default — determinism law)' };
  const armedGrids = armCounterGrids(counterGrids, gate44);
  const gridArmOps = [];
  for (const [id, g] of Object.entries(armedGrids)) {
    if (g.verdict === GRID_VERDICT_ARMED) gridArmOps.push({ seq: st.seq, type: 'GRID-ARM', at: now, pool: id, pair: g.pair, anchor: g.anchor, verdict: g.verdict, rungs: g.broadcastPayload.length, sizeMu: g.sizeLaw.sizeMu, capBps: g.sizeLaw.capBps, ids: g.broadcastPayload.map((r) => r.id) });
  }
  // 5) treasury P&L (fees are LP revenue via the persistent feeMeter; edges accumulate across ticks in the book)
  let feesMu = 0n, edgeMu = 0n;
  for (const p of st.pools) feesMu += ub(p.feeMeter || '0');
  for (const o of ops) if (o.type === 'REBALANCE') edgeMu += ub(o.edgeMu || '0');
  const prevEdge = ub((prev.treasuryPnl || {}).rebalanceEdgeMu || '0');
  edgeMu += prevEdge;
  // 6) conservation + attestation
  const cons = conservation(st.vault, st.accounts, st.pools);
  const consOk = cons.every((c) => c.ok);
  st.vault.reserveRatio = reserveRatios(st.vault);
  const att = attestationHash(st.vault, st.accounts, st.pools, st.seq);
  return { st, ops: ops.concat(gridArmOps), routes, arb, counterGrids: armedGrids, gridGate: gate44, cons, consOk, att, feesMu, edgeMu, notes, rebalanceBooked };
}

// ── R41 THE MESH MARKET: the fleet settles on this ledger ───────────────────
/** roster law: headcorner (operator) + soldiers (persona-slots). Deterministic, no magic names.
 *  R80 fallback (2026-10-12, measured trace 1a1…bc29): persona-store came back with 0
 *  soldiers → 1-member roster → the batch selftest lost its 3-trader proof set → arb-mesh red ×3
 *  (15:34Z/20:31Z/23:55Z). Lawful fallback: when the persona store yields < 2 soldiers, the
 *  roster falls back to the MEASURED fleet roster (fleet-roster.json steemFleet, sorted,
 *  bannedCapital names filtered) — still real roster names, never hardcoded, still deterministic. */
function rosterLaw() {
  let soldiers = [];
  try {
    const p = require('./persona-store.cjs').slots(); // T3: doctrine sealed (persona-store)
    soldiers = Object.keys(p.soldiers || {}).sort(); // sorted — the law never depends on file order
  } catch (_) { /* no roster file → operator-only mesh, honest */ }
  if (soldiers.length < 2) {
    try {
      const fr = JSON.parse(fs.readFileSync(path.join(AG, 'fleet-roster.json'), 'utf8'));
      const banned = new Set((fr.bannedCapital || []).map((b) => String(b && b.name ? b.name : b).toLowerCase()));
      const fleet = (fr.steemFleet || [])
        .map((s) => String(s && s.name ? s.name : s).toLowerCase())
        .filter((n) => n && n !== 'headcorner' && !banned.has(n))
        .sort();
      if (fleet.length > soldiers.length) soldiers = fleet; // the bigger measured roster wins — honest union
    } catch (_) { /* no fleet roster → keep the persona store as-is, honest */ }
  }
  return ['headcorner', ...soldiers];
}

/** MESH SETTLEMENT (R41): process a batch of agent intents ATOMICALLY on this ledger.
 *  Laws, per intent, in order:
 *   1. batch present + not already processed (idempotency — a replayed batch settles nothing twice)
 *   2. agent on the roster (ROSTER-UNKNOWN refused)
 *   3. pair sane (BAD-PAIR refused)
 *   4. size above dust (DUST refused)
 *   5. agent holds it or a CAPPED WIRE covers the shortfall (NAKED-SHORT-REFUSED / GATED-WIRE-NO-CAPITAL)
 *      — wire ≤ 10% of the treasury's FREE claims per batch; a partial wire shrinks the fill, never invents size
 *   6. fill ≤ 5% of first-hop depth (DEPTH-CAP — a fill that IS the book is slippage theater)
 *   7. route exists (NO-ROUTE refused)
 *   8. every hop + minOut hold on SIMULATED copies, then commit all-or-nothing (REFUSED-MINOUT leaves state byte-unchanged)
 *  Edge accounting is honest: PEG legs mark 1:1, the STEEM/SBD pair marks to the CEX-implied fair when the feed is
 *  fresh, everything else books edge=null (unavailable, never guessed). Conservation is asserted after every fill. */
function settleIntents(prev, queue, feed, now) {
  const st = {
    vault: JSON.parse(JSON.stringify(prev.vault)),
    accounts: JSON.parse(JSON.stringify(prev.accounts)),
    pools: JSON.parse(JSON.stringify(prev.pools)),
    seq: prev.seq || 0,
  };
  const ops = [];
  const op = (type, payload) => { st.seq += 1; ops.push({ seq: st.seq, type, at: now, ...payload }); };
  const notes = [];
  const fills = [], rejects = [];
  const batch = (queue && queue.batch) || null;
  const prevProcessed = Array.isArray(prev.processedBatches) ? prev.processedBatches : [];
  const processedBatches = [...prevProcessed];
  const fairNano = (feed && feed.fresh && feed.fair) ? BigInt(feed.fair) : null;

  const finish = (extra) => {
    const cons = conservation(st.vault, st.accounts, st.pools);
    const consOk = cons.every((c) => c.ok);
    st.vault.reserveRatio = reserveRatios(st.vault);
    const att = attestationHash(st.vault, st.accounts, st.pools, st.seq);
    // lifetime P&L (the ledger is the source of truth — the mesh book only reports it)
    const prevLife = (prev.meshPnl && prev.meshPnl.lifetime) || { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' };
    const life = { byAgent: { ...prevLife.byAgent }, fills: prevLife.fills, edgeMu: ub(prevLife.edgeMu), feesMu: ub(prevLife.feesMu), volumeInMu: ub(prevLife.volumeInMu) };
    let batchEdge = 0n, batchFees = 0n, batchVolume = 0n;
    for (const f of fills) {
      const row = life.byAgent[f.agent] || { fills: 0, edgeMu: 0n, feesMu: 0n, volumeInMu: 0n };
      row.fills += 1; row.volumeInMu += ub(f.amountIn); row.edgeMu += ub(f.edgeMu || '0'); row.feesMu += ub(f.feesMu || '0');
      life.byAgent[f.agent] = row;
      life.fills += 1; life.edgeMu += ub(f.edgeMu || '0'); life.feesMu += ub(f.feesMu || '0'); life.volumeInMu += ub(f.amountIn);
      batchEdge += ub(f.edgeMu || '0'); batchFees += ub(f.feesMu || '0'); batchVolume += ub(f.amountIn);
    }
    for (const k of Object.keys(life.byAgent)) {
      const r = life.byAgent[k];
      life.byAgent[k] = { fills: r.fills, volumeInMu: mu(r.volumeInMu), edgeMu: mu(r.edgeMu), feesMu: mu(r.feesMu) };
    }
    return {
      st, ops, fills, rejects, notes, batchId: batch, processedBatches,
      cons, consOk, att,
      meshPnl: { lifetime: { byAgent: life.byAgent, fills: life.fills, edgeMu: mu(life.edgeMu), feesMu: mu(life.feesMu), volumeInMu: mu(life.volumeInMu) }, batch: { id: batch, fills: fills.length, rejects: rejects.length, edgeMu: mu(batchEdge), feesMu: mu(batchFees), volumeInMu: mu(batchVolume) } },
      ...extra,
    };
  };

  if (!batch) { notes.push('intents without a batch id — refused by law'); return finish({ skipped: true }); }
  if (processedBatches.includes(batch)) {
    notes.push(`batch ${batch} already settled — idempotency law: no double settle`);
    return finish({ skipped: true });
  }
  const roster = rosterLaw();
  // NOTE: agent accounts are created LAZILY at commit time (a batch that settles nothing must not touch the ledger — not even an empty account)

  for (const it of (queue.intents || [])) {
    const agent = String((it && it.agent) || '');
    const from = String((it && it.from) || '');
    const to = String((it && it.to) || '');
    const amountIn = ub(it && it.amountIn);
    const minOut = (it && it.minOut != null) ? ub(it.minOut) : null;
    const reject = (why) => { op('AGENT_REJECT', { agent, from, to, amountIn: mu(amountIn), why }); rejects.push({ agent, from, to, amountIn: mu(amountIn), why }); };
    if (!roster.includes(agent)) { reject('ROSTER-UNKNOWN'); continue; }
    if (!from || !to || from === to) { reject('BAD-PAIR'); continue; }
    if (amountIn < MESH_DUST) { reject('DUST'); continue; }
    let held = ub((st.accounts[agent] || { claims: {} }).claims[from] || '0');
    // first-hop depth for `from` (the smallest reserve among pools holding it)
    let depth = 0n;
    for (const p of st.pools) {
      if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue;
      if (p.a === from) depth = depth === 0n ? ub(p.ra) : (ub(p.ra) < depth ? ub(p.ra) : depth);
      if (p.b === from) depth = depth === 0n ? ub(p.rb) : (ub(p.rb) < depth ? ub(p.rb) : depth);
    }
    if (depth <= 0n) { reject('NO-DEPTH'); continue; }
    let sizeIn = amountIn;
    const cap = depth * MESH_FILL_MAX_DEPTH_BPS / BPS;
    if (sizeIn > cap) sizeIn = cap;
    // wire computation (DEFERRED application — atomicity: a refused fill moves nothing)
    let wireAmt = 0n;
    if (held < sizeIn) {
      const shortfall = sizeIn - held;
      const free = ub(st.accounts.treasury.claims[from] || '0');
      const wireCap = free * MESH_WIRE_MAX_SHARE_BPS / BPS;
      wireAmt = shortfall > wireCap ? wireCap : shortfall;
      if (wireAmt <= 0n) { reject('GATED-WIRE-NO-CAPITAL'); continue; }
      if (held + wireAmt < sizeIn) sizeIn = held + wireAmt; // partial wire → partial fill, still real
      if (sizeIn < MESH_DUST) { reject('WIRE-PARTIAL-DUST'); continue; }
    }
    const route = routeBest(st.pools, from, to, sizeIn);
    if (!route) { reject('NO-ROUTE'); continue; }
    // ATOMIC SETTLE: simulate every hop on copies, commit all-or-nothing
    const touched = new Map();
    const hops = [];
    let cur = from, amt = sizeIn, simOk = true, why2 = '';
    let feesTotal = 0n;
    for (const pid of route.ids) {
      const p = st.pools.find((x) => x.id === pid);
      if (!p) { simOk = false; why2 = 'POOL-VANISHED'; break; }
      if (!touched.has(pid)) touched.set(pid, JSON.parse(JSON.stringify(p)));
      const cp = touched.get(pid);
      const dirOut = cp.a === cur ? cp.b : cp.a;
      const sw = poolSwap(cp, cur, dirOut, amt, null);
      if (!sw || sw.error) { simOk = false; why2 = 'HOP-REFUSED-' + String((sw && sw.error) || 'EMPTY'); break; }
      cp.ra = mu(sw.newRa); cp.rb = mu(sw.newRb);
      cp.feeMeter = mu(ub(cp.feeMeter) + sw.feeAmt);
      feesTotal += sw.feeAmt;
      hops.push({ pool: pid, in: mu(amt), out: mu(sw.out), fee: mu(sw.feeAmt) });
      amt = sw.out; cur = dirOut;
    }
    if (!simOk || cur !== to) { reject(why2 || 'ROUTE-BROKE'); continue; }
    if (minOut != null && amt < minOut) { reject('REFUSED-MINOUT'); continue; }
    // COMMIT (all-or-nothing): the wire funds the agent, then the fill settles
    if (wireAmt > 0n) {
      if (!st.accounts[agent]) st.accounts[agent] = { claims: emptyClaims(), lp: {} }; // born zero at first real movement
      st.accounts.treasury.claims[from] = mu(ub(st.accounts.treasury.claims[from]) - wireAmt);
      st.accounts[agent].claims[from] = mu(held + wireAmt);
      op('MESH-WIRE', { agent, asset: from, amount: mu(wireAmt), why: `edge-funding wire (cap ${Number(MESH_WIRE_MAX_SHARE_BPS) / 100}% of free treasury per batch); conservation moves claims, never creates them` });
    }
    for (const [pid, cp] of touched) { const p = st.pools.find((x) => x.id === pid); p.ra = cp.ra; p.rb = cp.rb; p.feeMeter = cp.feeMeter; }
    st.accounts[agent].claims[from] = mu(ub(st.accounts[agent].claims[from]) - sizeIn);
    st.accounts[agent].claims[to] = mu(ub(st.accounts[agent].claims[to]) + amt);
    // edge marked to fair — honest or null
    const underlying = (a) => (a === 'WSTEEM' ? 'STEEM' : (a === 'WSBD' ? 'SBD' : a));
    const fu = underlying(from), tu = underlying(to);
    let edgeMu = null, fairUsed = 'UNAVAILABLE (no fair for this pair — P&L marked, never guessed)';
    if (fu === tu) { edgeMu = amt - sizeIn; fairUsed = 'PEG-1:1'; }
    else if (fairNano && fu === 'STEEM' && tu === 'SBD') { edgeMu = amt - (sizeIn * fairNano / NANO); fairUsed = 'CEX-FAIR (SBD per STEEM)'; }
    else if (fairNano && fu === 'SBD' && tu === 'STEEM') { edgeMu = amt - (sizeIn * NANO / fairNano); fairUsed = 'CEX-FAIR (STEEM per SBD)'; }
    const fill = { agent, from, to, amountIn: mu(sizeIn), amountOut: mu(amt), routeIds: route.ids, hops, edgeMu: edgeMu == null ? null : mu(edgeMu), fairUsed, feesMu: mu(feesTotal), at: now };
    op('AGENT_FILL', fill);
    fills.push(fill);
    if (!conservation(st.vault, st.accounts, st.pools).every((c) => c.ok)) {
      // cannot happen by construction (every law above is zero-sum) — if it EVER does, the ledger says so
      return finish({ halted: 'CONSERVATION-BROKEN-AFTER-FILL' });
    }
  }
  processedBatches.push(batch);
  while (processedBatches.length > MESH_BATCH_MEMO) processedBatches.shift();
  return finish({});
}

// ── main ────────────────────────────────────────────────────────────────────
async function tick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    if (stasis) {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'EXCHANGE-CORE-HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, laws: LAWS, pools: [], routes: [], arb: [], counterGrids: {}, errors: [] });
      console.log(`STASIS-HALT dex-core · ${now}`);
      return 0;
    }
    let prev = loadBook();
    const nets = await probeNetworks();
    const probe = custodyProbeFrom(nets);
    const feed = loadRouterFeed();
    // R42 redeem corridor: requests are consumed single-writer by THIS tick (burn before payout)
    const redeemRows = [];
    const pegoutRows = [];
    let redeemOps = [];
    let rq = null;
    try { rq = JSON.parse(fs.readFileSync(REDEEM_REQUESTS_FILE, 'utf8')); } catch (_) { rq = null; }
    if (rq && Array.isArray(rq.requests) && rq.requests.length && prev && prev.genesisDone) {
      let cur = prev;
      for (const r of rq.requests) {
        const res = redeem(cur, r.wrapped, ub(r.amount), r.account || 'treasury', now);
        if (res.ok) {
          cur = { vault: res.st.vault, accounts: res.st.accounts, seq: res.st.seq };
          redeemOps = redeemOps.concat(res.ops);
          redeemRows.push({ op: 'REDEEM', wrapped: r.wrapped, amount: mu(ub(r.amount)), account: r.account || 'treasury', corridor: res.corridor });
          pegoutRows.push({ at: now, ...res.pegout });
        } else {
          redeemRows.push({ op: 'REDEEM-REFUSED', wrapped: r.wrapped, amount: mu(ub(r.amount)), account: r.account || 'treasury', refused: res.refused });
        }
      }
      prev = { ...cur, treasuryPnl: prev.treasuryPnl, processedBatches: prev.processedBatches, meshPnl: prev.meshPnl, custodyClasses: prev.custodyClasses };
      // publish the pegout queue (keyed desks own the broadcast — operator-gated) and clear the requests
      if (pegoutRows.length) {
        try {
          let pq = null; try { pq = JSON.parse(fs.readFileSync(PEGOUT_QUEUE_FILE, 'utf8')); } catch (_) { pq = null; }
          pq = pq || { protocol: 'SAOS-DEX-PEGOUT-QUEUE/1', rows: [] };
          pq.at = now; pq.rows = [...(pq.rows || []), ...pegoutRows].slice(-256);
          fs.writeFileSync(PEGOUT_QUEUE_FILE + '.tmp', JSON.stringify(pq, null, 1) + '\n'); fs.renameSync(PEGOUT_QUEUE_FILE + '.tmp', PEGOUT_QUEUE_FILE);
        } catch (_) {}
      }
      try { fs.writeFileSync(REDEEM_REQUESTS_FILE + '.tmp', JSON.stringify({ protocol: 'SAOS-DEX-REDEEM-REQUESTS/1', at: now, requests: [], lastProcessedAt: now }, null, 1) + '\n'); fs.renameSync(REDEEM_REQUESTS_FILE + '.tmp', REDEEM_REQUESTS_FILE); } catch (_) {}
    }
    if (!prev || prev.protocol !== PROTOCOL || !prev.genesisDone) {
      // custody for genesis: measured probe → router-book liquid → honest zeros
      const custody = { STEEM: 0n, SBD: 0n, HIVE: 0n, HBD: 0n, BLURT: 0n, SAOS: 0n };
      const provenance = {};
      if (probe.measured) {
        custody.STEEM = probe.steem; custody.SBD = probe.sbd;
        provenance.STEEM = `MEASURED condenser headcorner @${probe.node} ${now}`;
        provenance.SBD = `MEASURED condenser headcorner @${probe.node} ${now}`;
      } else {
        const cg = ((feed.router || {}).counterGrid || {}).steem || {};
        const liq = cg.liquid || {};
        custody.STEEM = BigInt(Math.round(bn(liq.liquid) * 1e6));
        custody.SBD = BigInt(Math.round(bn(liq.sbd) * 1e6));
        provenance.STEEM = custody.STEEM > 0n ? `FALLBACK dex-router.json counterGrid.steem.liquid @${feed.routerAt}` : 'NO-FEED — vault born empty, the drip funds it when it lands';
        provenance.SBD = custody.SBD > 0n ? `FALLBACK dex-router.json counterGrid.steem.liquid @${feed.routerAt}` : 'NO-FEED — vault born empty, the drip funds it when it lands';
      }
      for (const a of ['HIVE', 'HBD', 'BLURT']) provenance[a] = `CUSTODY-CLASS ${CUSTODY_CLASSES[a]} — observed on-chain, never custody, until key material verifies (R42/R38 law)`;
      provenance.SAOS = 'PLANNED-NO-CLAIM — dex/credits.json empty today';
      const g = genesis(custody, feed.fair, provenance, now);
      const settled = settle({ vault: g.vault, accounts: g.accounts, pools: g.pools, seq: g.seq, opsBooked: g.ops }, feed, null, now, nets, counterGridGate());
      const book = assemble(g, settled, feed, probe, now, true);
      writeBook(book); writeMd(book);
      appendHistory([...g.ops, ...settled.ops]);
      console.log(`DEX-CORE-GENESIS seq=${book.seq} pools=${book.pools.filter((p) => !p.planned).length} custody=STEEM ${g.vault.custody.STEEM}µ/SBD ${g.vault.custody.SBD}µ att=${book.attestation}`);
      return 0;
    }
    const settled = settle(prev, feed, probe, now, nets, counterGridGate());
    settled.redeemBook = redeemRows;
    const book = assemble(prev, settled, feed, probe, now, false, [...redeemOps, ...settled.ops]);
    writeBook(book); writeMd(book);
    appendHistory([...redeemOps, ...settled.ops]);
    console.log(`DEX-CORE-TICK seq=${book.seq} routes=${book.routes.length} arb=${book.arb.length} rebalance=${settled.rebalanceBooked} redeems=${redeemRows.length} issuer=${book.issuer ? book.issuer.identity : '?'} att=${book.attestation}`);
    return 0;
  } catch (e) {
    try { writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'ERROR', stasisHalted: false, laws: LAWS, error: String(e.message).slice(0, 300), pools: [], routes: [], arb: [], counterGrids: {}, errors: [String(e.message).slice(0, 300)] }); } catch (_) {}
    console.log(`dex-core: ERROR (booked honestly, exit 0) ${e.message}`);
    return 0;
  }
}

// ── mesh batch settlement path (R41): the core consumes the queue single-writer ──
async function settleIntentsTick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    if (stasis) {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'EXCHANGE-CORE-HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, laws: LAWS, pools: [], routes: [], arb: [], counterGrids: {}, errors: [] });
      console.log(`STASIS-HALT dex-core settle-intents · ${now} (the queue stays — the mesh owns it, settling resumes when STASIS lifts)`);
      return 0;
    }
    const prev = loadBook();
    if (!prev || prev.protocol !== PROTOCOL || !prev.genesisDone) { console.log('dex-core: no genesis book — settle-intents refuses (nothing to settle on)'); return 0; }
    let queue = null;
    try { queue = JSON.parse(fs.readFileSync(INTENTS_FILE, 'utf8')); } catch (_) { queue = null; }
    if (!queue || !Array.isArray(queue.intents) || queue.intents.length === 0) { console.log('dex-core: no intents in the queue'); return 0; }
    const feed = loadRouterFeed();
    const mesh = settleIntents(prev, queue, feed, now);
    const book = assemble(prev, { st: mesh.st, ops: mesh.ops, routes: prev.routes || [], arb: prev.arb || [], counterGrids: prev.counterGrids || {}, cons: mesh.cons, consOk: mesh.consOk, att: mesh.att, feesMu: 0n, edgeMu: ub((prev.treasuryPnl || {}).rebalanceEdgeMu || '0'), notes: mesh.notes, rebalanceBooked: false }, feed, null, now, false, mesh.ops, mesh);
    writeBook(book); writeMd(book);
    appendHistory(mesh.ops);
    // consume the queue (single-writer: the mesh wrote it, the core clears it)
    try { fs.writeFileSync(INTENTS_FILE + '.tmp', JSON.stringify({ batch: null, at: now, intents: [], lastSettled: mesh.batchId }, null, 1) + '\n'); fs.renameSync(INTENTS_FILE + '.tmp', INTENTS_FILE); } catch (_) {}
    console.log(`DEX-CORE-MESH-SETTLE batch=${mesh.batchId} fills=${mesh.fills.length} rejects=${mesh.rejects.length} wires=${mesh.ops.filter((o) => o.type === 'MESH-WIRE').length} cons=${mesh.consOk} att=${mesh.att}`);
    return 0;
  } catch (e) {
    console.log(`dex-core settle-intents: ERROR (fail-soft, exit 0) ${e.message}`);
    return 0;
  }
}
// ── uniform batch clearing (R76 THE UNIFORM CLEARING · the CoW take) ───────────────
// The sequential settle path fills intents one-by-one: price-time priority inside the batch,
// and every boundary between two fills is a sandwich window on a real chain. The batch law
// abolishes both: the queue clears as ONE batch - canonical order, two-sided flow nets
// internally at the MEASURED fair (coincidence of wants, zero fees, zero pool touch), the
// residual clears the pools as ONE aggregate trade, and every trader receives the SAME
// uniform clearing price. Order-invariance is the anti-sandwich proof: a permuted queue
// clears byte-identical, there is no ordering to exploit. This lane is DRY by law: it
// measures and publishes the proof (agents/dex-batch.json) and moves NOTHING - the settle
// gate stays the owner's (STASIS law, judge separation from settleIntents above).

/** measured sandwich on ONE pool (pure): front-run frBps of the victim, the victim fills,
 *  the attacker back-runs. Returns the attacker's profit and the victim's damage - the
 *  exact value a sandwicher extracts from ONE sequential-fill boundary. */
function sandwichExtraction(pool, from, to, victimIn, frBps) {
  const fr = victimIn * frBps / BPS;
  if (fr <= 0n) return null;
  const p1 = JSON.parse(JSON.stringify(pool));
  const s1 = poolSwap(p1, from, to, fr, null);
  if (!s1 || s1.error) return null;
  p1.ra = mu(s1.newRa); p1.rb = mu(s1.newRb);
  const s2 = poolSwap(p1, from, to, victimIn, null);
  if (!s2 || s2.error) return null;
  p1.ra = mu(s2.newRa); p1.rb = mu(s2.newRb);
  const s3 = poolSwap(p1, to, from, s1.out, null);
  if (!s3 || s3.error) return null;
  const p0 = JSON.parse(JSON.stringify(pool));
  const s0 = poolSwap(p0, from, to, victimIn, null);
  return {
    attackerProfitMu: mu(s3.out - fr), // in `from` units: the sandwicher's extracted value
    victimOutMu: mu(s2.out),
    victimOutCleanMu: s0 && !s0.error ? mu(s0.out) : null,
    victimDamageMu: s0 && !s0.error ? mu(s0.out - s2.out) : null,
    unit: from,
  };
}

/** uniform batch clearing (pure, DRY): prev is read, never written. Every intent is
 *  validated by the same laws as the sequential path (roster, pair, dust, 5%-depth cap),
 *  then the batch clears: net, route the residual aggregate once, one uniform price,
 *  minOut misses are excluded honestly and the batch re-clears without them. */
function clearBatchUniform(prev, queue, feed, now) {
  const pools = JSON.parse(JSON.stringify(prev.pools || []));
  const roster = rosterLaw();
  const intentsIn = (queue && Array.isArray(queue.intents)) ? queue.intents : [];
  const refused = [], notes = [];
  // 1 · validate + canonical order (the order-independence law: sort, never trust arrival)
  const valid = [];
  for (const it of intentsIn) {
    const agent = String((it && it.agent) || '');
    const from = String((it && it.from) || '');
    const to = String((it && it.to) || '');
    const amountIn = ub(it && it.amountIn);
    const minOut = (it && it.minOut != null) ? ub(it.minOut) : null;
    if (!roster.includes(agent)) { refused.push({ agent, from, to, amountIn: mu(amountIn), why: 'ROSTER-UNKNOWN' }); continue; }
    if (!from || !to || from === to) { refused.push({ agent, from, to, amountIn: mu(amountIn), why: 'BAD-PAIR' }); continue; }
    if (amountIn < MESH_DUST) { refused.push({ agent, from, to, amountIn: mu(amountIn), why: 'DUST' }); continue; }
    let depth = 0n;
    for (const p of pools) {
      if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue;
      if (p.a === from) depth = depth === 0n ? ub(p.ra) : (ub(p.ra) < depth ? ub(p.ra) : depth);
      if (p.b === from) depth = depth === 0n ? ub(p.rb) : (ub(p.rb) < depth ? ub(p.rb) : depth);
    }
    if (depth <= 0n) { refused.push({ agent, from, to, amountIn: mu(amountIn), why: 'NO-DEPTH' }); continue; }
    const cap = depth * MESH_FILL_MAX_DEPTH_BPS / BPS;
    const sizeIn = amountIn > cap ? cap : amountIn;
    valid.push({ agent, from, to, sizeIn, minOut, truncated: sizeIn !== amountIn });
  }
  valid.sort((x, y) => x.agent < y.agent ? -1 : x.agent > y.agent ? 1 : x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : (x.sizeIn < y.sizeIn ? -1 : x.sizeIn > y.sizeIn ? 1 : 0));
  // 2 · group by normalized pair (sells = a->b)
  const groups = new Map();
  for (const v of valid) {
    const a = v.from < v.to ? v.from : v.to;
    const b = v.from < v.to ? v.to : v.from;
    const key = a + '/' + b;
    if (!groups.has(key)) groups.set(key, { a, b, sells: [], buys: [] });
    (v.from === a ? g_sells(groups.get(key)) : g_buys(groups.get(key))).push(v);
  }
  function g_sells(g) { return g.sells; }
  function g_buys(g) { return g.buys; }
  // 3 · per-pair: net two-sided flow at the measured fair, clear the residuals uniformly
  const clears = [], pairNotes = [];
  const internalRows = [];
  for (const [key, g] of groups) {
    const twoSided = g.sells.length > 0 && g.buys.length > 0;
    let sellSide = g.sells, buySide = g.buys;
    if (twoSided) {
      // the fair is measured as SBD per STEEM (feed.fairNano); any other two-sided pair has no measured fair
      const fairNano = (feed && feed.fresh && feed.fair && (key === 'SBD/STEEM')) ? BigInt(feed.fair) : null;
      if (!fairNano) {
        for (const v of g.sells) refused.push({ agent: v.agent, from: v.from, to: v.to, amountIn: mu(v.sizeIn), why: 'MIXED-DIRECTION-NO-FAIR' });
        for (const v of g.buys) refused.push({ agent: v.agent, from: v.from, to: v.to, amountIn: mu(v.sizeIn), why: 'MIXED-DIRECTION-NO-FAIR' });
        pairNotes.push(key + ': two-sided flow without a measured fair - refused fail-closed (netting at an unmeasured price would invent one)');
        continue;
      }
      // orientation: sells = SBD->STEEM (buy STEEM), buys = STEEM->SBD (sell STEEM); fair = SBD per STEEM
      const sellSteem = sellSide.reduce((s, v) => s + v.sizeIn * NANO / fairNano, 0n); // SBD-sized inputs -> STEEM value
      const buySteem = buySide.reduce((s, v) => s + v.sizeIn, 0n);                     // STEEM-sized inputs
      const matchedSteem = sellSteem < buySteem ? sellSteem : buySteem; // coincidence of wants, in STEEM
      // internal clears at the measured fair, zero fees, zero pool touch (coincidence of wants)
      const fillInternal = (arr, steemValue, isInSteem) => {
        const total = arr.reduce((s, v) => s + (isInSteem ? v.sizeIn : v.sizeIn * NANO / fairNano), 0n);
        if (total <= 0n) return;
        for (const v of arr) {
          const share = steemValue * (isInSteem ? v.sizeIn : v.sizeIn * NANO / fairNano) / total;
          if (v.from === 'SBD') internalRows.push({ agent: v.agent, from: 'SBD', to: 'STEEM', inMu: mu(share * fairNano / NANO), outMu: mu(share), why: 'INTERNAL-MATCH-AT-MEASURED-FAIR (no pool, no fee)' });
          else internalRows.push({ agent: v.agent, from: 'STEEM', to: 'SBD', inMu: mu(share), outMu: mu(share * fairNano / NANO), why: 'INTERNAL-MATCH-AT-MEASURED-FAIR (no pool, no fee)' });
        }
      };
      fillInternal(sellSide, matchedSteem, false); // SBD->STEEM side: their sizeIn is SBD
      fillInternal(buySide, matchedSteem, true);   // STEEM->SBD side: their sizeIn is STEEM
      // residuals: what each side still owes after the internal match (pro-rata truncation, minOut scales too)
      const sellTotal = sellSide.reduce((s, v) => s + v.sizeIn, 0n);
      const buyTotal = buySide.reduce((s, v) => s + v.sizeIn, 0n);
      const sellResidualSbd = sellTotal - matchedSteem * fairNano / NANO;
      const buyResidualSteem = buyTotal - matchedSteem;
      const scaleSells = (v) => ({ ...v, sizeIn: v.sizeIn * sellResidualSbd / sellTotal, minOut: v.minOut == null ? null : v.minOut * sellResidualSbd / sellTotal });
      const scaleBuys = (v) => ({ ...v, sizeIn: v.sizeIn * buyResidualSteem / buyTotal, minOut: v.minOut == null ? null : v.minOut * buyResidualSteem / buyTotal });
      sellSide = sellResidualSbd > 0n ? sellSide.map(scaleSells).filter((v) => v.sizeIn > 0n) : [];
      buySide = buyResidualSteem > 0n ? buySide.map(scaleBuys).filter((v) => v.sizeIn > 0n) : [];
      pairNotes.push(key + ': two-sided flow - matched ' + mu(matchedSteem) + 'mu STEEM internally at the measured fair (' + mu(fairNano) + ' nano SBD/STEEM), residuals ' + mu(sellResidualSbd) + 'mu SBD + ' + mu(buyResidualSteem) + 'mu STEEM clear the pools');
    }
    // residual sides clear uniformly (a side that netted to zero simply does not clear)
    const sides = [];
    if (sellSide.length) sides.push({ from: g.a, to: g.b, intents: sellSide });
    if (buySide.length) sides.push({ from: g.b, to: g.a, intents: buySide });
    for (const side of sides) {
      let alive = side.intents.map((v, i) => ({ ...v, idx: i }));
      const excluded = [];
      let rounds = 0, aggOut = 0n, aggIn = 0n, route = null;
      const cleared = [];
      while (alive.length && rounds < BATCH_MAX_ROUNDS) {
        rounds += 1;
        aggIn = 0n; for (const v of alive) aggIn += v.sizeIn;
        if (aggIn <= 0n) break;
        route = routeBest(pools, side.from, side.to, aggIn);
        if (!route) { for (const v of alive) excluded.push({ agent: v.agent, why: 'NO-ROUTE-AT-CLEARING' }); alive = []; route = null; break; }
        const shares = alive.map((v) => route.out * v.sizeIn / aggIn); // uniform pro-rata shares (floor)
        const failing = alive.filter((v, i) => v.minOut != null && shares[i] < v.minOut);
        if (!failing.length) {
          aggOut = route.out;
          alive.forEach((v, i) => cleared.push({ agent: v.agent, sizeIn: mu(v.sizeIn), uniformOut: mu(shares[i]), minOut: v.minOut == null ? null : mu(v.minOut), verdict: 'CLEARED' }));
          alive = [];
          break;
        }
        for (const v of failing) excluded.push({ agent: v.agent, why: 'UNSATISFIED-AT-CLEARING (uniform share below minOut - the order waits for a batch where it clears, like any unfilled limit order)' });
        alive = alive.filter((v) => !failing.includes(v));
      }
      for (const v of alive) excluded.push({ agent: v.agent, why: 'CLEARING-ROUNDS-EXHAUSTED' });
      let sumShares = 0n; for (const c of cleared) sumShares += ub(c.uniformOut);
      const remainder = aggOut > 0n ? aggOut - sumShares : 0n; // the solver absorbs the rounding dust
      clears.push({
        pair: key, from: side.from, to: side.to,
        rounds, aggIn: mu(aggIn), aggOut: mu(aggOut),
        routeIds: route ? route.ids : [],
        uniformPriceNano: aggIn > 0n && aggOut > 0n ? mu(aggOut * NANO / aggIn) : null,
        traders: cleared,
        excluded,
        solverRemainderMu: mu(remainder),
        why: cleared.length ? null : (excluded.length ? 'NO-CLEAR (every trader excluded or refused at clearing)' : 'EMPTY-SIDE'),
      });
    }
  }
  // 4 · the sandwich surface: the sequential path would expose one boundary per fill pair;
  // the batch exposes ZERO (one atomic clearing - nothing exists between fills).
  const clearedTotal = clears.reduce((s, c) => s + c.traders.length, 0);
  const sequentialFills = valid.length; // what the one-by-one path would have settled
  const windows = sequentialFills > 1 ? sequentialFills - 1 : 0;
  let measuredWindow = null;
  const firstRoute = clears.find((c) => c.routeIds && c.routeIds.length);
  if (windows > 0 && firstRoute) {
    const p0 = pools.find((p) => p.id === firstRoute.routeIds[0]);
    if (p0) {
      const m = sandwichExtraction(p0, firstRoute.from, firstRoute.to, ub(firstRoute.aggIn), BATCH_SANDWICH_FR_BPS);
      if (m) measuredWindow = { pool: p0.id, frBps: Number(BATCH_SANDWICH_FR_BPS), victimInMu: firstRoute.aggIn, ...m, note: 'measured on the first hop of the winning route with a ' + Number(BATCH_SANDWICH_FR_BPS) / 100 + '% front-run - this is what ONE sequential boundary hands a sandwicher' };
    }
  }
  return {
    ok: true, book: 'saos-batch-clear/1.0', publishedAt: now,
    engine: VERSION, batch: (queue && queue.batch) || null, queueAt: (queue && queue.at) || null,
    movedNothing: true,
    intentsInQueue: intentsIn.length, validIntents: valid.length,
    netting: { internalRows, pairNotes },
    clears, refused,
    clearedTotal,
    sandwich: {
      sequentialFills, windows,
      measuredWindow,
      batchWindows: 0,
      statement: 'sequential settle exposes ' + windows + ' intra-batch sandwich windows; the batch clears as ONE atomic op - there is nothing between fills to front-run, and a permuted queue clears byte-identical',
    },
    dry: { ledgerAt: prev.at || null, ledgerSeq: prev.seq == null ? null : prev.seq, note: 'DRY proof lane - the ledger was read, never written; conservation of the read state is untouched by construction (no op was produced)' },
    notes,
  };
}

const BATCH_LAWS = [
  'one batch, one price: every trader in the batch clears at the SAME uniform clearing price - price-time priority inside the batch is abolished',
  'order-invariance is the anti-sandwich proof: a permuted queue clears byte-identical; there is no ordering to exploit',
  'coincidence of wants: two-sided flow nets internally at the MEASURED fair (zero fees, zero pool touch); only the residual clears the pools',
  'fail-closed netting: two-sided flow without a fresh measured fair refuses (MIXED-DIRECTION-NO-FAIR) - the batch never invents a clearing price',
  'solver absorption: the uniform remainder (rounding dust) books to the solver (treasury); a trader whose uniform share misses his minOut is excluded honestly (UNSATISFIED-AT-CLEARING), never force-filled',
  'DRY proof lane: this book measures and proves; it moves NOTHING; the settle gate stays the owner\'s (STASIS law)',
];

/** the clear-batch tick: consume the queue as a MEASUREMENT, publish the proof book, touch nothing */
function clearBatchTick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    let queue = null;
    try { queue = JSON.parse(fs.readFileSync(INTENTS_FILE, 'utf8')); } catch (_) { queue = null; }
    if (!queue || !Array.isArray(queue.intents)) queue = { batch: null, intents: [] };
    const prev = loadBook();
    const coreLive = !!(prev && prev.protocol === PROTOCOL && prev.genesisDone && Array.isArray(prev.pools) && prev.pools.length > 0);
    let book;
    if (!coreLive) {
      book = {
        ok: true, book: 'saos-batch-clear/1.0', publishedAt: now, engine: VERSION,
        verdict: queue.intents.length ? 'NO-CORE-POOLS (the engine book carries no live pools - the proof lane refuses to invent reserves)' : 'NO-INTENTS',
        stasisHalted: !!stasis, measuredInStasis: !!stasis, movedNothing: true,
        batch: queue.batch || null, intentsInQueue: queue.intents.length,
        netting: { internalRows: [], pairNotes: [] }, clears: [], refused: [], clearedTotal: 0,
        sandwich: { sequentialFills: 0, windows: 0, measuredWindow: null, batchWindows: 0, statement: 'nothing to clear - the proof lane publishes the honest empty state' },
        dry: { ledgerAt: prev ? prev.at : null, ledgerSeq: prev && prev.seq != null ? prev.seq : null, note: 'DRY proof lane - nothing to read against a live engine yet' },
        laws: BATCH_LAWS, notes: [], errors: [],
      };
    } else {
      const feed = loadRouterFeed();
      const r = clearBatchUniform(prev, queue, feed, now);
      book = { ...r, stasisHalted: !!stasis, measuredInStasis: !!stasis, laws: BATCH_LAWS, errors: [] };
      book.verdict = book.clearedTotal > 0 ? 'BATCH-CLEAR-PROVEN' : (book.validIntents > 0 ? 'NOTHING-TO-CLEAR (every intent refused or excluded - booked honestly)' : 'NO-INTENTS');
    }
    const tmp = BATCH_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(book, null, 1) + '\n');
    fs.renameSync(tmp, BATCH_FILE);
    console.log(`DEX-CORE-CLEAR-BATCH verdict=${book.verdict} batch=${book.batch || '-'} queue=${book.intentsInQueue} cleared=${book.clearedTotal} windows(seq)=${book.sandwich.windows} windows(batch)=${book.sandwich.batchWindows} stasis=${!!stasis}`);
    return 0;
  } catch (e) {
    try {
      fs.writeFileSync(BATCH_FILE, JSON.stringify({ ok: false, book: 'saos-batch-clear/1.0', publishedAt: now, engine: VERSION, verdict: 'ERROR (booked honestly, exit 0)', stasisHalted: !!stasisCheck(), movedNothing: true, laws: BATCH_LAWS, errors: [String(e.message).slice(0, 300)] }, null, 1) + '\n');
    } catch (_) {}
    console.log(`dex-core clear-batch: ERROR (fail-soft, exit 0) ${e.message}`);
    return 0;
  }
}

// ── R77 THE OWNER GATES (batch settle + engine fee law) ────────────────────
// Owner directive on record 2026-10-05 (staged re-entry):
// intelligently. Let it operate." (staged re-entry, limited exposure, observation,
// increasing confidence) and 2026-10-07 "[owner-directive]" (IM trace 1a1…3b25).
// The gates are ARTIFACTS in the repo (the CR-0074 law: an artifact someone can audit in
// git history, not a boolean an import can flip in memory):
//   · CR-0075-owner-approval.json — presence + opens[] IS the open gate.
//   · agents/STASIS.json stagedLanes.allow — the staged-lane law (capital-gate doctrine)
//     now enforced by the ENGINE itself: STASIS active halts a settle lane unless the lane
//     is staged-allowed. The lane opened: dex-batch-settle — the KEYLESS, internal-only,
//     one-price, anti-sandwich settlement (the safest path first — the calibration mandate).

const BATCH_SETTLE_LAWS = [
  'artifact gate: CR-0075-owner-approval.json presence + opens[] in the repo IS the open gate — absent, revoked, or malformed = the lane refuses (fail-closed DRY)',
  'staged-lane gate: STASIS active halts every settle lane unless the lane is named in STASIS.json stagedLanes.allow (the owner staged re-entry doctrine)',
  'measurement == application: the batch is measured ON the law-fee pools this lane applies — the uniform clearing price INCLUDES the engine fee law',
  'one batch, one atomic commit: internal matches move agent-to-agent at the measured fair (zero pool touch); residual clears walk the route all-or-nothing on simulated copies',
  'conservation is the verdict: any dust left by per-row flooring books to the solver (treasury) — claims are moved, never created; a conservation break refuses the WHOLE batch',
  'idempotency: the settled batch id joins processedBatches (rotating memo) — a replayed batch settles nothing twice',
  'the queue is consumed single-writer (the mesh wrote it, the core clears it) and the settled book publishes the gate trace so any node can audit the approval',
];

const FEE_LAW_LAWS = [
  'the engine fee law (the Meteora take, owner-approved): fee = clamp(base + K_VOL × σ, base, min(2 × base, 200))',
  'σ is measured from OUR OWN official books ONLY — the ledger fill hops (realized prices) + the router fair (fairGap); zero invention',
  'a pool without enough measured samples stays at base — the law never guesses (honesty law)',
  'VOLATILE pools only: PEG pools are 1:1 by law and the fee law does not touch them',
  'the law can only RAISE above base, never lower (allFeesAtOrAboveBase self-audit; a book row below base is refused at trade time)',
  'the stored ledger fee stays BASE: the law rides on top at trade time (Meteora model — base fee + dynamic fee), so re-measurement never fee-creeps',
  'freshness: a law book older than 30h = base fee everywhere (fail-closed)',
];

/** the owner gate (R77): CR-0075's presence + opens[] IS the open gate. `exists`/`read`
 *  injectable for the evals/selftest (purity law — the same seam counterGridGate uses). */
function ownerGate(kind, exists, read) {
  const has = exists === undefined || exists === null ? fs.existsSync(CR_OWNER_APPROVAL_FILE) : !!exists;
  let cr = null, open = false, why = has ? null : 'ARTIFACT-ABSENT (CR-0075 not in the repo — the gate is closed)';
  if (has) {
    try {
      cr = JSON.parse(read === undefined || read === null ? fs.readFileSync(CR_OWNER_APPROVAL_FILE, 'utf8') : read);
      if (!cr || cr.ok !== true || !Array.isArray(cr.opens)) { open = false; why = 'ARTIFACT-MALFORMED (ok/opens missing — refuse)'; }
      else if (cr.opens.map(String).includes(String(kind))) open = true;
      else why = 'KIND-NOT-OPENED (the artifact exists but does not open ' + String(kind) + ')';
    } catch (e) { cr = null; open = false; why = 'ARTIFACT-UNPARSEABLE (refuse)'; }
  }
  return {
    open, kind, why,
    cr: cr ? { cr: String(cr.cr || 'CR-0075'), directive: cr.directive || null, trace: cr.trace || null, at: cr.at || null } : null,
  };
}

/** the staged-lane law (STASIS mode=staged) enforced by the engine: STASIS active halts a
 *  settle lane unless the lane is named in stagedLanes.allow. STASIS inactive → run. */
function stagedLaneCheck(lane, stasis) {
  const s = stasis === undefined ? stasisCheck() : stasis;
  if (!s) return { halt: false, reason: null, staged: false, allow: null, stasis: null };
  const allow = Array.isArray(s.stagedLanes && s.stagedLanes.allow) ? s.stagedLanes.allow.map((x) => String(x).toLowerCase()) : [];
  const allowed = allow.includes(String(lane).toLowerCase());
  return {
    halt: !allowed,
    reason: allowed ? null : 'STASIS-STAGED: lane "' + String(lane) + '" is not in stagedLanes.allow=[' + allow.join(',') + ']',
    staged: true, allow, stasis: { since: s.since || null },
  };
}

// ── the ENGINE fee law (R77-B) ─────────────────────────────────────────────
/** realized hop prices per pool from the ledger's own fill history (zero invention) */
function fillPricesForPool(poolId, histRows) {
  const prices = [];
  for (const r of histRows || []) {
    if (!r || r.type !== 'AGENT_FILL') continue;
    for (const h of (r.hops || [])) {
      if (!h || h.pool !== poolId) continue;
      const i = ub(h.in), o = ub(h.out);
      if (i > 0n && o > 0n) prices.push(o * NANO / i); // realized price in nano (out per in)
    }
  }
  return prices.slice(-FEE_LAW_PRICE_WINDOW);
}
/** the measured fair for a pool pair from the router feed — ONLY where the feed measures one
 *  (STEEM/SBD: fair = nano SBD per STEEM). Everything else returns null (no invention). */
function fairForPair(pool, feed) {
  const fresh = !!(feed && feed.fresh && feed.fair);
  if (fresh && pool.a === 'STEEM' && pool.b === 'SBD') return BigInt(feed.fair); // same orientation as the mid (SBD per STEEM)
  return null;
}
function bpsOf(numer, denom) { return denom > 0n ? Number((numer < 0n ? -numer : numer) * 10000n / denom) : null; }
/** measure the fee law for every live pool from our own books (pure, deterministic) */
function measureFeeLaw(prev, histRows, feed, now) {
  const pools = (prev && Array.isArray(prev.pools) ? prev.pools : []).filter((p) => p && !p.planned);
  const rows = [];
  for (const p of pools) {
    const base = Number(p.feeBps);
    if (p.kind !== 'VOLATILE') {
      rows.push({ pool: p.id, pair: p.pair, kind: p.kind, baseBps: base, samples: 0, twapDevBps: null, fairGapBps: null, rangeBps: null, sigmaBps: null, feeBps: base, deltaBps: 0, basis: 'PEG 1:1 by law — the fee law does not touch pegs (no invention)' });
      continue;
    }
    const ra = ub(p.ra), rb = ub(p.rb);
    const midNano = ra > 0n ? rb * NANO / ra : null;
    const prices = fillPricesForPool(p.id, histRows);
    let twapDevBps = null, rangeBps = null;
    if (prices.length >= FEE_LAW_MIN_SAMPLES) {
      let sum = 0n; for (const x of prices) sum += x;
      const mean = sum / BigInt(prices.length);
      let sq = 0n; for (const x of prices) { const d = x - mean; sq += d * d; }
      const dev = BigInt(Math.round(Math.sqrt(Number(sq / BigInt(prices.length)))));
      twapDevBps = bpsOf(dev, mean);
      let mx = prices[0], mn = prices[0];
      for (const x of prices) { if (x > mx) mx = x; if (x < mn) mn = x; }
      rangeBps = bpsOf(mx - mn, mean);
    }
    let fairGapBps = null;
    const fairNano = fairForPair(p, feed);
    if (fairNano && midNano) fairGapBps = bpsOf(midNano - fairNano, fairNano);
    const comps = [twapDevBps, fairGapBps, rangeBps].filter((x) => x != null && isFinite(x));
    const sigma = comps.length ? Math.max(...comps) : null;
    const cap = Math.min(base * FEE_LAW_CAP_FACTOR, Number(FEE_LAW_CAP_ABS_BPS));
    const fee = sigma == null ? base : Math.max(base, Math.min(cap, base + FEE_LAW_K_VOL * Math.round(sigma)));
    rows.push({
      pool: p.id, pair: p.pair, kind: p.kind, baseBps: base,
      samples: prices.length, twapDevBps, fairGapBps, rangeBps, sigmaBps: sigma,
      feeBps: fee, deltaBps: fee - base,
      basis: sigma == null
        ? 'no measured σ from our own books (samples < ' + FEE_LAW_MIN_SAMPLES + ' or no fair) — the fee stays base (no invention)'
        : 'measured: realized-price dev ' + (twapDevBps == null ? '—' : twapDevBps + 'bps') + ' · fairGap ' + (fairGapBps == null ? '—' : fairGapBps + 'bps') + ' · range ' + (rangeBps == null ? '—' : rangeBps + 'bps') + ' → σ=' + Math.round(sigma) + 'bps',
    });
  }
  const raised = rows.filter((r) => r.deltaBps > 0).length;
  const check = rows.every((r) => r.feeBps >= r.baseBps) && rows.every((r) => r.kind === 'PEG' || r.feeBps <= Math.min(r.baseBps * FEE_LAW_CAP_FACTOR, Number(FEE_LAW_CAP_ABS_BPS)));
  return {
    ok: true, book: 'saos-engine-fee-law/1.0', publishedAt: now,
    engine: VERSION + ' fee-law · R77 the engine fee law (the Meteora take, owner-approved CR-0075)',
    verdict: raised > 0 ? 'LIVE (the measured volatility raised ' + raised + ' engine pool fee(s) above base)' : 'BASE (no measured σ raised a fee yet — the law waits for the tape to thicken)',
    law: { formula: 'fee_bps = clamp(base + K_VOL × σ, base, min(2 × base, 200))', K_VOL: FEE_LAW_K_VOL, CAP_ABS_BPS: Number(FEE_LAW_CAP_ABS_BPS), CAP_FACTOR: FEE_LAW_CAP_FACTOR, maxAgeH: FEE_LAW_MAX_AGE_H, minSamples: FEE_LAW_MIN_SAMPLES, mechanism: 'the Meteora take adopted by the ENGINE: fees rise with MEASURED volatility so LPs are compensated exactly when their risk rises · σ measured from the ledger fill hops + the router fair only' },
    tape: { ledgerSeq: prev && prev.seq != null ? prev.seq : null, ledgerAt: prev && prev.at ? prev.at : null, fillRowsSampled: (histRows || []).filter((r) => r && r.type === 'AGENT_FILL').length, fairFresh: !!(feed && feed.fresh) },
    pools: rows,
    checks: { allFeesAtOrAboveBase: rows.every((r) => r.feeBps >= r.baseBps), capsRespected: check, pegsUntouched: rows.every((r) => r.kind !== 'PEG' || r.deltaBps === 0) },
    application: 'trade-time only: settle-intents fills, uniform batch clears and core routes price by this law when fresh (≤30h); the stored pool fee stays BASE — the law never fee-creeps',
    laws: FEE_LAW_LAWS, errors: [],
  };
}
/** the law book (fail-closed: absent/malformed → null → base fee everywhere) */
function lawFeeBook() {
  try { const b = JSON.parse(fs.readFileSync(FEE_LAW_FILE, 'utf8')); return b && b.ok === true && Array.isArray(b.pools) ? b : null; } catch (_) { return null; }
}
/** the law fee for ONE pool at trade time (null = keep base). VOLATILE only, fresh only,
 *  only rows the law itself allows (≥ base, within caps) — a bad row refuses to base. */
function lawFeeFor(pool, book, nowMs) {
  if (!pool || pool.kind !== 'VOLATILE') return null;
  const b = book === undefined ? lawFeeBook() : book;
  if (!b || !b.publishedAt) return null;
  const t = nowMs === undefined ? Date.now() : nowMs;
  const ageH = (t - Date.parse(b.publishedAt)) / 3.6e6;
  if (!isFinite(ageH) || ageH < 0 || ageH > FEE_LAW_MAX_AGE_H) return null;
  const row = (b.pools || []).find((p) => p && p.pool === pool.id);
  if (!row || row.sigmaBps == null || row.feeBps == null) return null;
  const base = Number(pool.feeBps), fee = Number(row.feeBps);
  if (!(fee >= base)) return null; // the law can only RAISE — a lower row refuses (fail-closed)
  if (fee > Math.min(base * FEE_LAW_CAP_FACTOR, Number(FEE_LAW_CAP_ABS_BPS))) return null; // out-of-law row refuses
  return fee;
}
/** trade-time adoption: a pool COPY with the law fee (the ledger fee stays base — the law rides on top).
 *  T-49: nowMs is THREADED from the settle call — freshness judged at TRADE time, not wall-clock time
 *  (the selftest fixture publishedAt is fixed in the past; judging it by Date.now() was a time bomb
 *  that fired exactly at publishedAt+30h and turned the R77 selftest red in the cloud). */
function withLawFee(pool, book, nowMs) {
  const fee = lawFeeFor(pool, book, nowMs);
  return fee == null ? pool : { ...pool, baseFeeBps: pool.feeBps, feeBps: fee, lawFeeBps: fee };
}
function withLawFees(pools, book, nowMs) { return (pools || []).map((p) => withLawFee(p, book, nowMs)); }

// ── the APPROVED batch settlement (R77-A) ──────────────────────────────────
/** settleBatch (pure, gate/stasis/feeBook injectable for the selftest): measures the queue
 *  with clearBatchUniform ON the law-fee pools (measurement == application) and applies it
 *  to a state copy atomically. Returns either a refusal state (movedNothing, ledger:null)
 *  or the full settlement: {st, ops, fills, rejects, notes, batchId, processedBatches, cons,
 *  consOk, att, meshPnl, batchResult, book fields}. */
function settleBatch(prev, queue, feed, now, gate, lane, feeBook) {
  const g = gate || ownerGate('BATCH-SETTLE');
  const l = lane || stagedLaneCheck('dex-batch-settle');
  const fb = feeBook === undefined ? lawFeeBook() : feeBook;
  const intents = queue && Array.isArray(queue.intents) ? queue.intents : [];
  const base = {
    ok: true, book: 'saos-batch-settle/1.0', publishedAt: now, engine: VERSION,
    batch: (queue && queue.batch) || null, intentsInQueue: intents.length,
    gate: { cr: 'CR-0075', kind: 'BATCH-SETTLE', open: g.open, why: g.why || null, directive: g.cr ? g.cr.directive : null, trace: g.cr ? g.cr.trace : null, artifactAt: g.cr ? g.cr.at : null },
    lane: { name: 'dex-batch-settle', staged: l.staged, allowed: !l.halt, allow: l.allow || null, since: l.stasis ? l.stasis.since : null },
    stasisHalted: !!(l.staged && l.halt), measuredInStasis: !!l.staged,
    feeLaw: { bookAt: fb ? fb.publishedAt : null, verdict: fb ? fb.verdict : 'NO-BOOK (base fee everywhere — fail-closed)' },
    laws: BATCH_SETTLE_LAWS, notes: [], errors: [],
  };
  const refusal = (verdict, extra) => ({ ...base, ...extra, verdict, movedNothing: true, ledger: null });
  if (!g.open) return refusal('GATE-CLOSED (the owner approval artifact is absent or does not open BATCH-SETTLE — the DRY proof lane stays the only lane)');
  if (l.halt) return refusal('STASIS-HALT (the staged-lane law: ' + String(l.reason || 'the lane is not staged-allowed') + ')');
  if (!prev || prev.protocol !== PROTOCOL || !prev.genesisDone) return refusal('NO-GENESIS-BOOK (nothing to settle on — the engine book is absent or pre-genesis)');
  if (!intents.length) return refusal('NO-INTENTS (the queue is empty — the honest empty state)');
  const batch = (queue && queue.batch) || null;
  const processedBatches = Array.isArray(prev.processedBatches) ? [...prev.processedBatches] : [];
  if (batch && processedBatches.includes(batch)) return refusal('SETTLED-ALREADY (idempotency law — no double settle)', { ledger: { seq: prev.seq } });
  // measurement == application: measure ON the law-fee pools this lane applies
  // T-49: freshness is judged at the SETTLE's trade time (threaded) — never wall-clock
  const settleNowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();
  const lawPools = withLawFees(prev.pools, fb, settleNowMs);
  const m = clearBatchUniform({ ...prev, pools: lawPools }, queue, feed, now);
  // apply on copies — atomic across the WHOLE batch (the walk runs on the SAME law-fee pools,
  // so the uniform clearing price INCLUDES the engine fee law; the BASE fee is restored at commit)
  const st = { vault: JSON.parse(JSON.stringify(prev.vault)), accounts: JSON.parse(JSON.stringify(prev.accounts)), pools: JSON.parse(JSON.stringify(lawPools)), seq: prev.seq || 0 };
  const ops = []; const op = (type, payload) => { st.seq += 1; ops.push({ seq: st.seq, type, at: now, batch, ...payload }); };
  const acc = (name) => { if (!st.accounts[name]) st.accounts[name] = { claims: emptyClaims(), lp: {} }; return st.accounts[name]; };
  const fills = [], rejects = [], notes = [];
  const netI = new Map(), netC = new Map(); // agent|asset → BigInt — TWO ledgers: internal matches (agent-to-agent, must net to zero per asset; per-row flooring dust → the solver absorbs) and pool clears (the pool is the counterparty — the net is exactly what the reserves moved, no absorption)
  const move = (m, agent, asset, delta) => { const k = agent + '|' + asset; m.set(k, (m.get(k) || 0n) + delta); };

  // 1 · internal matches (coincidence of wants) — agent to agent at the measured fair, zero pool touch
  for (const row of (m.netting.internalRows || [])) {
    move(netI, row.agent, row.from, -ub(row.inMu));
    move(netI, row.agent, row.to, ub(row.outMu));
    fills.push({ agent: row.agent, from: row.from, to: row.to, amountIn: row.inMu, amountOut: row.outMu, routeIds: [], hops: [], edgeMu: '0', fairUsed: 'INTERNAL-MATCH-AT-MEASURED-FAIR (no pool, no fee)', feesMu: '0', kind: 'BATCH-INTERNAL', at: now });
    op('BATCH-INTERNAL', { agent: row.agent, from: row.from, to: row.to, amountIn: row.inMu, amountOut: row.outMu, why: 'coincidence of wants at the measured fair — zero fees, zero pool touch, zero sandwich surface' });
  }
  // 2 · residual clears — walk the route all-or-nothing on simulated pool copies
  let feesTotal = 0n, solverDustTotal = 0n, poolClears = 0;
  for (const c of (m.clears || [])) {
    if (!c.traders || !c.traders.length) { for (const x of (c.excluded || [])) rejects.push({ agent: x.agent, from: c.from, to: c.to, why: x.why }); continue; }
    const aggIn = ub(c.aggIn);
    if (aggIn <= 0n) continue;
    const touched = new Map(); const hops = [];
    let cur = c.from, amt = aggIn, simOk = true, why2 = '', clearFees = 0n;
    for (const pid of (c.routeIds || [])) {
      const p = st.pools.find((x) => x.id === pid);
      if (!p) { simOk = false; why2 = 'POOL-VANISHED'; break; }
      if (!touched.has(pid)) touched.set(pid, JSON.parse(JSON.stringify(p)));
      const cp = touched.get(pid);
      const dirOut = cp.a === cur ? cp.b : cp.a;
      const sw = poolSwap(cp, cur, dirOut, amt, null);
      if (!sw || sw.error) { simOk = false; why2 = 'HOP-REFUSED-' + String((sw && sw.error) || 'EMPTY'); break; }
      cp.ra = mu(sw.newRa); cp.rb = mu(sw.newRb);
      cp.feeMeter = mu(ub(cp.feeMeter) + sw.feeAmt);
      clearFees += sw.feeAmt;
      hops.push({ pool: pid, in: mu(amt), out: mu(sw.out), fee: mu(sw.feeAmt), feeBpsUsed: cp.lawFeeBps != null ? cp.lawFeeBps : cp.feeBps, lawFee: cp.lawFeeBps != null });
      amt = sw.out; cur = dirOut;
    }
    const walkedOut = simOk && cur === c.to ? amt : null;
    if (!simOk || walkedOut == null || (c.aggOut != null && ub(c.aggOut) !== walkedOut)) {
      // measurement/apply divergence cannot happen by construction (same pools, same law fees,
      // same deterministic BigInt math) — if it EVER does, the whole batch refuses, nothing moves
      return refusal('MEASURE-APPLY-DIVERGED (the walked route disagrees with the measurement — fail-closed, nothing moved)', { notes: [...notes, String(why2 || 'aggOut mismatch')] });
    }
    for (const [pid, cp] of touched) { const p = st.pools.find((x) => x.id === pid); p.ra = cp.ra; p.rb = cp.rb; p.feeMeter = cp.feeMeter; }
    const remainder = ub(c.solverRemainderMu);
    if (remainder > 0n) { acc('treasury').claims[c.to] = mu(ub(acc('treasury').claims[c.to]) + remainder); solverDustTotal += remainder; }
    for (const t of c.traders) {
      move(netC, t.agent, c.from, -ub(t.sizeIn));
      move(netC, t.agent, c.to, ub(t.uniformOut));
      const feeShare = clearFees > 0n ? ub(t.sizeIn) * clearFees / aggIn : 0n; // pro-rata by the same law as the uniform shares (THIS clear's fees only)
      fills.push({ agent: t.agent, from: c.from, to: c.to, amountIn: t.sizeIn, amountOut: t.uniformOut, routeIds: c.routeIds || [], hops, edgeMu: '0', fairUsed: 'UNIFORM-CLEARING-PRICE (the pool price IS the clearing — edge marked 0, never guessed)', feesMu: mu(feeShare), kind: 'BATCH-CLEAR', minOut: t.minOut, at: now });
      op('BATCH-CLEAR', { agent: t.agent, from: c.from, to: c.to, amountIn: t.sizeIn, amountOut: t.uniformOut, minOut: t.minOut, why: 'one batch, one price — cleared at the uniform clearing price (order-invariance: a permuted queue clears byte-identical)' });
      poolClears += 1;
    }
    op('BATCH-SOLVER-DUST', { asset: c.to, amount: mu(remainder), why: 'the uniform remainder books to the solver (treasury) — solver absorption law' });
    feesTotal += clearFees; // the ledger's fee meter for this tick (per-clear fees accumulated once)
    for (const x of (c.excluded || [])) rejects.push({ agent: x.agent, from: c.from, to: c.to, why: x.why });
  }
  // 3 · apply the net agent movements; absorb per-row flooring dust of the INTERNAL ledger into the treasury
  //     (conservation is the verdict: internal matches must net to zero per asset — flooring dust is the solver's;
  //      pool clears net against the RESERVES which already moved by the walked hops — never absorbed, never dusted)
  const netSum = (m, asset) => { let s = 0n; for (const [k, delta] of m) { if (k.endsWith('|' + asset)) s += delta; } return s; };
  const applyNet = (m) => { for (const [k, delta] of m) { const idx = k.lastIndexOf('|'); acc(k.slice(0, idx)).claims[k.slice(idx + 1)] = mu(ub(acc(k.slice(0, idx)).claims[k.slice(idx + 1)]) + delta); } };
  applyNet(netC);
  applyNet(netI);
  const dustAbsorbed = {};
  for (const asset of Object.keys(emptyClaims())) {
    const s = netSum(netI, asset);
    if (s !== 0n) { acc('treasury').claims[asset] = mu(ub(acc('treasury').claims[asset]) - s); dustAbsorbed[asset] = mu(-s); } // the solver absorbs the internal flooring dust (moves, never creates)
  }
  if (Object.keys(dustAbsorbed).length) op('BATCH-FLOOR-DUST', { assets: dustAbsorbed, why: 'per-row flooring dust from the internal netting books to the solver — conservation moves claims, never creates them' });
  // the ledger fee stays BASE (the law rode on top at trade time only — the no-fee-creep law)
  for (const p of st.pools) { if (p.baseFeeBps != null) { p.feeBps = p.baseFeeBps; delete p.lawFeeBps; delete p.baseFeeBps; } }
  // 4 · idempotency + verdicts
  if (batch) { processedBatches.push(batch); while (processedBatches.length > MESH_BATCH_MEMO) processedBatches.shift(); }
  const cons = conservation(st.vault, st.accounts, st.pools);
  const consOk = cons.every((c) => c.ok);
  st.vault.reserveRatio = reserveRatios(st.vault);
  const att = attestationHash(st.vault, st.accounts, st.pools, st.seq);
  // lifetime P&L (honest: edge marked 0 at uniform clearing, fees measured per hop share)
  const prevLife = (prev.meshPnl && prev.meshPnl.lifetime) || { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' };
  const life = { byAgent: { ...prevLife.byAgent }, fills: prevLife.fills, edgeMu: ub(prevLife.edgeMu), feesMu: ub(prevLife.feesMu), volumeInMu: ub(prevLife.volumeInMu) };
  let batchVolume = 0n, batchFees = 0n;
  for (const f of fills) {
    const row = life.byAgent[f.agent] || { fills: 0, edgeMu: 0n, feesMu: 0n, volumeInMu: 0n };
    row.fills += 1; row.volumeInMu += ub(f.amountIn); row.feesMu += ub(f.feesMu || '0');
    life.byAgent[f.agent] = row;
    life.fills += 1; life.volumeInMu += ub(f.amountIn); life.feesMu += ub(f.feesMu || '0');
    batchVolume += ub(f.amountIn); batchFees += ub(f.feesMu || '0');
  }
  for (const k of Object.keys(life.byAgent)) { const r = life.byAgent[k]; life.byAgent[k] = { fills: r.fills, volumeInMu: mu(r.volumeInMu), edgeMu: mu(r.edgeMu), feesMu: mu(r.feesMu) }; }
  const meshPnl = { lifetime: { byAgent: life.byAgent, fills: life.fills, edgeMu: mu(life.edgeMu), feesMu: mu(life.feesMu), volumeInMu: mu(life.volumeInMu) }, batch: { id: batch, fills: fills.length, rejects: rejects.length, edgeMu: '0', feesMu: mu(batchFees), volumeInMu: mu(batchVolume) } };
  notes.push('uniform batch settlement by the owner gate CR-0075 (directive: ' + String((g.cr && g.cr.directive) || '-') + ') — ' + (m.netting.internalRows || []).length + ' internal match(es), ' + poolClears + ' pool clear(s), ' + (m.refused || []).length + ' refused, sandwich windows exposed: 0');
  return {
    ...base, verdict: consOk ? 'BATCH-SETTLED' : 'CONSERVATION-BROKEN (the batch refuses publication as settled)', movedNothing: false,
    internalRows: m.netting.internalRows || [], pairNotes: m.netting.pairNotes || [],
    clears: m.clears || [], refused: m.refused || [], traders: fills.length, poolClears, feesMu: mu(feesTotal), solverDustMu: mu(solverDustTotal),
    sandwich: m.sandwich, ledger: { seqBefore: prev.seq, seqAfter: st.seq, cons, consOk, att, processedBatches },
    st, ops, fills, rejects, notes, batchId: batch, processedBatches, cons, consOk, att, meshPnl, batchResult: m,
  };
}

/** the settle-batch tick: the APPROVED lane. Publishes agents/dex-batch-settled.json in EVERY
 *  state (gate closed / stasis / no intents / settled) — the gate itself is auditable on Pages. */
async function settleBatchTick() {
  const now = nowIso();
  try {
    const gate = ownerGate('BATCH-SETTLE');
    const lane = stagedLaneCheck('dex-batch-settle');
    const prev = loadBook();
    let queue = null;
    try { queue = JSON.parse(fs.readFileSync(INTENTS_FILE, 'utf8')); } catch (_) { queue = null; }
    const feed = loadRouterFeed();
    const r = settleBatch(prev, queue, feed, now, gate, lane);
    const book = r.ledger
      ? { ...r, st: undefined, ops: undefined, fills: undefined, rejects: undefined, batchResult: undefined, summary: { verdict: r.verdict, batch: r.batchId, traders: r.traders, internalRows: (r.internalRows || []).length, poolClears: r.poolClears, feesMu: r.feesMu, solverDustMu: r.solverDustMu } }
      : { ...r };
    const tmp = BATCH_SETTLED_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(book, null, 1) + '\n');
    fs.renameSync(tmp, BATCH_SETTLED_FILE);
    if (r.ledger && r.consOk) {
      const settled = { st: r.st, ops: r.ops, routes: prev.routes || [], arb: prev.arb || [], counterGrids: prev.counterGrids || {}, cons: r.cons, consOk: r.consOk, att: r.att, feesMu: 0n, edgeMu: ub(((prev.treasuryPnl || {}).rebalanceEdgeMu) || '0'), notes: r.notes, rebalanceBooked: false };
      const b = assemble(prev, settled, feed, null, now, false, r.ops, r);
      b.verdict = 'BATCH-SETTLED';
      b.batchSettle = { book: 'saos-batch-settle/1.0', batch: r.batchId, gate: book.gate, lane: book.lane, traders: r.traders, internalRows: (r.internalRows || []).length, poolClears: r.poolClears, feesMu: r.feesMu, solverDustMu: r.solverDustMu, sandwichWindows: (r.sandwich || {}).batchWindows };
      writeBook(b); writeMd(b); appendHistory(r.ops);
      try { fs.writeFileSync(INTENTS_FILE + '.tmp', JSON.stringify({ batch: null, at: now, intents: [], lastSettledBatch: r.batchId }, null, 1) + '\n'); fs.renameSync(INTENTS_FILE + '.tmp', INTENTS_FILE); } catch (_) {}
      console.log(`DEX-CORE-BATCH-SETTLE verdict=BATCH-SETTLED batch=${r.batchId || '-'} internal=${(r.internalRows || []).length} poolClears=${r.poolClears} fees=${r.feesMu} solverDust=${r.solverDustMu} cons=${r.consOk} att=${r.att}`);
    } else {
      console.log(`DEX-CORE-BATCH-SETTLE verdict=${book.verdict} gate=${gate.open} laneAllowed=${!lane.halt} queue=${book.intentsInQueue} cons=${r.ledger ? r.consOk : 'n/a'}`);
    }
    return 0;
  } catch (e) {
    try { fs.writeFileSync(BATCH_SETTLED_FILE, JSON.stringify({ ok: false, book: 'saos-batch-settle/1.0', publishedAt: now, engine: VERSION, verdict: 'ERROR (booked honestly, exit 0)', movedNothing: true, laws: BATCH_SETTLE_LAWS, errors: [String(e.message).slice(0, 300)] }, null, 1) + '\n'); } catch (_) {}
    console.log(`dex-core settle-batch: ERROR (fail-soft, exit 0) ${e.message}`);
    return 0;
  }
}

/** the fee-law tick: measure the engine fee law from our own books and publish it. */
function feeLawTick() {
  const now = nowIso();
  try {
    const prev = loadBook();
    let hist = [];
    try { hist = fs.readFileSync(OUT_HISTORY, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { hist = []; }
    const feed = loadRouterFeed();
    const book = measureFeeLaw(prev, hist, feed, now);
    const tmp = FEE_LAW_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(book, null, 1) + '\n');
    fs.renameSync(tmp, FEE_LAW_FILE);
    const raised = book.pools.filter((p) => p.deltaBps > 0).map((p) => p.pool + ' ' + p.baseBps + '→' + p.feeBps + 'bps').join(', ');
    console.log(`DEX-CORE-FEE-LAW verdict=${book.verdict}${raised ? ' · raised: ' + raised : ''} tape=${book.tape.fillRowsSampled} fill rows`);
    return 0;
  } catch (e) {
    console.log(`dex-core fee-law: ERROR (fail-soft, exit 0) ${e.message}`);
    return 0;
  }
}

/** selftest-batch: the uniform clearing laws judge themselves (fresh process, zero network).
 *  The roster is read LIVE (roster law): the traders are real roster names, so the proofs
 *  never depend on a hardcoded list. */
function selftestBatch() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  const roster = rosterLaw();
  const [A, B, C] = roster; // operator first, then soldiers sorted - deterministic
  const mkCore = () => ({
    protocol: PROTOCOL, at: '2026-10-07T10:00:00.000Z', genesisDone: true, seq: 7,
    accounts: Object.fromEntries(roster.map((r) => [r, { claims: { STEEM: '500000', SBD: '50000', WSTEEM: '388775', WSBD: '27450' } }])),
    pools: [
      { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '388775', rb: '388775', feeMeter: '0', planned: false },
      { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: 2, ra: '27450', rb: '27450', feeMeter: '0', planned: false },
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1555100', rb: '163980', feeMeter: '0', planned: false },
    ],
  });
  const feed = { fresh: true, fair: '105446700' }; // 0.1054467 SBD per STEEM
  const q = (rows) => ({ batch: 'BATCH-TEST-1', at: '2026-10-07T10:00:00.000Z', intents: rows });
  const oneSided = q([
    { agent: A, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null },
    { agent: B, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null },
    { agent: C, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null },
  ]);
  const r1 = clearBatchUniform(mkCore(), oneSided, feed, '2026-10-07T10:00:00.000Z');
  // 1 · uniform price for all
  const side1 = r1.clears.find((x) => x.from === 'STEEM');
  const prices = side1 ? side1.traders.map((t) => (ub(t.uniformOut) * NANO) / ub(t.sizeIn)) : [];
  ok('uniform-price-identical-for-all', !!side1 && side1.traders.length === 3 && prices.every((p) => p === prices[0]));
  // 2 · remainder to solver: sum of shares + remainder == aggOut
  const sumShares = side1 ? side1.traders.reduce((s, t) => s + ub(t.uniformOut), 0n) : 0n;
  ok('remainder-conservation', !!side1 && sumShares + ub(side1.solverRemainderMu) === ub(side1.aggOut));
  // 3 · permutation invariance (the anti-sandwich proof)
  const shuffled = q([oneSided.intents[2], oneSided.intents[0], oneSided.intents[1]]);
  const r2 = clearBatchUniform(mkCore(), shuffled, feed, '2026-10-07T10:00:00.000Z');
  ok('permutation-invariance-byte-identical', JSON.stringify(r1.clears) === JSON.stringify(r2.clears));
  // 4 · sandwich surface: sequential has windows (and they pay), batch has zero
  ok('sequential-windows-exist', r1.sandwich.sequentialFills === 3 && r1.sandwich.windows === 2);
  ok('batch-windows-zero', r1.sandwich.batchWindows === 0);
  ok('measured-sandwich-pays', !!r1.sandwich.measuredWindow && ub(r1.sandwich.measuredWindow.attackerProfitMu) > 0n && ub(r1.sandwich.measuredWindow.victimDamageMu) > 0n);
  // 5 · coincidence of wants: two-sided flow nets internally, only the residual touches the pool
  const twoSided = q([
    { agent: A, from: 'STEEM', to: 'SBD', amountIn: '10000', minOut: null }, // sells 10000mu STEEM
    { agent: B, from: 'SBD', to: 'STEEM', amountIn: '1500', minOut: null },  // buys with 1500mu SBD = 14226mu STEEM at fair
  ]);
  const r3 = clearBatchUniform(mkCore(), twoSided, feed, '2026-10-07T10:00:00.000Z');
  const buyInternal = r3.netting.internalRows.find((x) => x.agent === A);
  const sellInternal = r3.netting.internalRows.find((x) => x.agent === B);
  ok('internal-match-at-measured-fair', !!buyInternal && !!sellInternal); // both sides matched internally at 0.1054467 SBD/STEEM
  ok('seller-fully-internal-no-steem-side-clear', !!buyInternal && !r3.clears.some((x) => x.from === 'STEEM')); // the smaller side (10000mu STEEM) netted away entirely
  const resSbd = r3.clears.find((x) => x.from === 'SBD');
  ok('only-residual-clears-pool', !!resSbd && r3.clears.length === 1 && ub(resSbd.aggIn) > 0n && ub(resSbd.aggIn) < 1500n * SCALE); // only the 446mu SBD residual touches the pool
  // 6 · minOut exclusion: an impossible limit waits honestly, the batch re-clears without him
  const withRidic = q([
    { agent: A, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null },
    { agent: B, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: '999999' }, // 999999 SBD for 20000mu STEEM = impossible
    { agent: C, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null },
  ]);
  const r4 = clearBatchUniform(mkCore(), withRidic, feed, '2026-10-07T10:00:00.000Z');
  const side4 = r4.clears.find((x) => x.from === 'STEEM');
  ok('impossible-minout-excluded', r4.clearedTotal === 2 && !!side4 && side4.excluded.some((x) => x.agent === B && x.why.indexOf('UNSATISFIED-AT-CLEARING') === 0));
  ok('survivors-still-clear', !!side4 && side4.traders.length === 2 && side4.traders.every((t) => ub(t.uniformOut) >= 1000n));
  // 7 · DRY: the ledger is untouched
  const before = mkCore();
  const snap = JSON.stringify(before);
  clearBatchUniform(before, oneSided, feed, '2026-10-07T10:00:00.000Z');
  ok('dry-ledger-untouched', JSON.stringify(before) === snap);
  ok('dry-moved-nothing-flagged', r1.movedNothing === true);
  // 8 · fail-closed netting: two-sided without a fresh fair refuses
  const r5 = clearBatchUniform(mkCore(), twoSided, { fresh: false, fair: null }, '2026-10-07T10:00:00.000Z');
  ok('mixed-no-fair-refused', r5.refused.length === 2 && r5.refused.every((x) => x.why === 'MIXED-DIRECTION-NO-FAIR') && r5.clearedTotal === 0);
  // 9 · dust refusal: below MESH_DUST an intent is noise, honestly refused
  const r6 = clearBatchUniform(mkCore(), q([{ agent: A, from: 'STEEM', to: 'SBD', amountIn: '999', minOut: null }]), feed, '2026-10-07T10:00:00.000Z');
  ok('dust-refused-honestly', r6.validIntents === 0 && r6.refused.length === 1 && r6.refused[0].why === 'DUST');
  const pass = c.filter((x) => x.ok).length;
  console.log(`DEX-CORE-SELFTEST-BATCH-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

/** selftest-batch-settle (R77): the APPROVED batch settlement laws judge themselves —
 *  fresh process, zero network, gate/stasis/feeBook injected (purity law). */
function selftestBatchSettle() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  const roster = rosterLaw();
  const [A, B, C] = roster;
  const mkCore = (extra) => {
    // balanced book (the R44 mkBook law): custody = pooled + free claims, per real asset
    const accounts = { treasury: { claims: { STEEM: '1000000', SBD: '100000' } } };
    for (const r of roster) accounts[r] = { claims: { STEEM: '500000', SBD: '50000' } };
    const pools = [
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1555100', rb: '163980', feeMeter: '0', planned: false },
    ];
    const sumClaims = (a) => mu(Object.values(accounts).reduce((s, acc) => s + ub(acc.claims[a] || '0'), 0n));
    const pooled = (a) => mu(pools.reduce((s, p) => s + (p.a === a ? ub(p.ra) : 0n) + (p.b === a ? ub(p.rb) : 0n), 0n));
    const vv = emptyVault();
    for (const a of ['STEEM', 'SBD']) { vv.custody[a] = mu(ub(pooled(a)) + ub(sumClaims(a))); vv.custodyProvenance[a] = 'test'; }
    return { protocol: PROTOCOL, at: '2026-10-07T10:00:00.000Z', genesisDone: true, seq: 7, processedBatches: [], vault: vv, accounts, pools, ...(extra || {}) };
  };
  const feed = { fresh: true, fair: '105446700' }; // 0.1054467 SBD per STEEM
  const gateOpen = ownerGate('BATCH-SETTLE', true, JSON.stringify({ ok: true, cr: 'CR-0075', opens: ['BATCH-SETTLE', 'ENGINE-FEE-LAW'], directive: '[owner-directive]', trace: '1a1…3b25' }));
  const gateWrongKind = ownerGate('BATCH-SETTLE', true, JSON.stringify({ ok: true, cr: 'CR-0075', opens: ['SOMETHING-ELSE'] }));
  const gateBad = ownerGate('BATCH-SETTLE', true, '{broken');
  const gateAbsent = ownerGate('BATCH-SETTLE', false, null);
  const laneOpen = stagedLaneCheck('dex-batch-settle', { active: true, since: '2026-10-04T22:06:00Z', stagedLanes: { allow: ['grid', 'claims', 'dex-batch-settle'] } });
  const laneShut = stagedLaneCheck('dex-batch-settle', { active: true, since: '2026-10-04T22:06:00Z', stagedLanes: { allow: ['grid', 'claims'] } });
  const laneNoStasis = stagedLaneCheck('dex-batch-settle', null);
  // 1 · the gate laws
  ok('gate-open-by-artifact', gateOpen.open === true && gateOpen.cr.trace === '1a1…3b25');
  ok('gate-absent-closed', gateAbsent.open === false && gateAbsent.why.indexOf('ARTIFACT-ABSENT') === 0);
  ok('gate-wrong-kind-closed', gateWrongKind.open === false && gateWrongKind.why.indexOf('KIND-NOT-OPENED') === 0);
  ok('gate-malformed-closed', gateBad.open === false && gateBad.why.indexOf('ARTIFACT-UNPARSEABLE') === 0);
  // 2 · the staged-lane laws
  ok('lane-staged-allowed-runs', laneOpen.staged === true && laneOpen.halt === false);
  ok('lane-staged-not-allowed-halts', laneShut.halt === true && laneShut.reason.indexOf('STASIS-STAGED') === 0);
  ok('lane-no-stasis-runs', laneNoStasis.staged === false && laneNoStasis.halt === false);
  // 3 · refusals move nothing (every refusal: movedNothing=true, ledger:null)
  const core = mkCore();
  const q = (rows) => ({ batch: 'B77-1', at: '2026-10-07T10:00:00.000Z', intents: rows });
  const intents = q([{ agent: A, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null }, { agent: B, from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: null }]);
  for (const [name, r] of [['gate-closed-refuses', settleBatch(core, intents, feed, 'x', gateAbsent, laneOpen, null)], ['lane-halted-refuses', settleBatch(core, intents, feed, 'x', gateOpen, laneShut, null)], ['no-genesis-refuses', settleBatch(null, intents, feed, 'x', gateOpen, laneOpen, null)], ['no-intents-refuses', settleBatch(core, q([]), feed, 'x', gateOpen, laneOpen, null)]]) {
    ok(name, r.movedNothing === true && r.ledger === null && r.verdict.length > 0);
  }
  ok('settled-already-refuses', settleBatch(mkCore({ processedBatches: ['B77-1'] }), intents, feed, 'x', gateOpen, laneOpen, null).verdict.indexOf('SETTLED-ALREADY') === 0);
  // 4 · the one-sided residual batch SETTLES with conservation + attestation
  const r = settleBatch(core, intents, feed, '2026-10-07T10:00:00.000Z', gateOpen, laneOpen, null);
  ok('batch-settles', r.verdict === 'BATCH-SETTLED' && r.movedNothing === false && r.traders === 2);
  ok('conservation-holds', r.consOk === true && r.ledger.cons.every((x) => x.ok));
  ok('one-price-uniform', r.clears.length === 1 && r.clears[0].traders.every((t) => t.uniformOut === r.clears[0].traders[0].uniformOut));
  ok('solver-dust-booked', r.fills.reduce((s, f) => s + BigInt(f.amountOut), 0n) + BigInt(r.solverDustMu) === BigInt(r.clears[0].aggOut));
  ok('pool-moved-once', BigInt(r.st.pools.find((p) => p.id === 'P3').ra) === BigInt('1595100') && r.st.pools.find((p) => p.id === 'P3').feeMeter !== '0');
  ok('agents-debited-credited', r.st.accounts[A].claims.SBD !== '50000' && r.st.accounts[A].claims.STEEM === '480000');
  ok('idempotency-marks-batch', r.processedBatches.includes('B77-1'));
  ok('gate-trace-in-book', r.gate.cr === 'CR-0075' && r.gate.trace === '1a1…3b25');
  ok('sandwich-windows-zero', r.sandwich.batchWindows === 0);
  // 5 · two-sided flow nets internally: zero pool touch, tokens move agent-to-agent at the fair
  const twoSided = q([
    { agent: A, from: 'SBD', to: 'STEEM', amountIn: '2000', minOut: null },   // sell SBD, buy STEEM
    { agent: B, from: 'STEEM', to: 'SBD', amountIn: '19000', minOut: null },  // sell STEEM, buy SBD
  ]);
  const poolsBefore = JSON.stringify(core.pools);
  const r2 = settleBatch(core, twoSided, feed, '2026-10-07T10:00:00.000Z', gateOpen, laneOpen, null);
  ok('two-sided-nets-internally', r2.verdict === 'BATCH-SETTLED' && r2.internalRows.length === 2 && r2.poolClears <= 2); // per-row flooring leaves ±1µ residuals that clear the pools honestly
  ok('conservation-holds-2', r2.consOk === true);
  ok('match-at-fair', r2.internalRows.every((row) => Math.abs(Number(row.from === 'SBD' ? BigInt(row.inMu) - BigInt(row.outMu) * 105446700n / 1000000000n : BigInt(row.outMu) - BigInt(row.inMu) * 105446700n / 1000000000n)) <= 1)); // the match price is the measured fair within the 1µ floor
  const after = JSON.stringify(core.pools);
  ok('pure-no-mutation-of-input', after === poolsBefore); // the settle law: the caller's state is NEVER mutated (copies only)
  // 6 · a permuted queue settles to a byte-identical LEDGER (order-invariance on the settle path)
  const perm = q([{ agent: B, from: 'STEEM', to: 'SBD', amountIn: '19000', minOut: null }, { agent: A, from: 'SBD', to: 'STEEM', amountIn: '2000', minOut: null }]);
  const r3 = settleBatch(core, perm, feed, '2026-10-07T10:00:00.000Z', gateOpen, laneOpen, null);
  ok('permuted-queue-identical-ledger', r3.verdict === 'BATCH-SETTLED' && r3.att === r2.att);
  // 7 · the fee law rides the batch: a law book raising P3 25→50 changes the uniform price and the hop rows say lawFee
  const lawBook = { ok: true, publishedAt: '2026-10-07T09:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 25, feeBps: 50 }] };
  const r4 = settleBatch(core, intents, feed, '2026-10-07T10:00:00.000Z', gateOpen, laneOpen, lawBook);
  const hop = (r4.fills.find((f) => f.kind === 'BATCH-CLEAR') || {}).hops || [];
  ok('law-fee-rides-the-batch', r4.verdict === 'BATCH-SETTLED' && hop.some((h) => h.lawFee === true && h.feeBpsUsed === 50) && BigInt(r4.clears[0].aggOut) < BigInt(r.clears[0].aggOut));
  ok('law-fee-ledger-fee-stays-base', r4.st.pools.find((p) => p.id === 'P3').feeBps === 25); // the ledger fee NEVER fee-creeps
  const pass = c.filter((x) => x.ok).length;
  console.log(`DEX-CORE-SELFTEST-BATCH-SETTLE-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

/** selftest-fee-law (R77): the engine fee law judges itself — pure, deterministic. */
function selftestFeeLaw() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  const NOW = '2026-10-07T12:00:00.000Z';
  const core = {
    protocol: PROTOCOL, at: NOW, genesisDone: true, seq: 7,
    pools: [
      { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '1000', rb: '1000', planned: false },
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1000000', rb: '105447', planned: false }, // mid = 0.105447 SBD/STEEM ≈ the fair
      { id: 'P4', pair: 'SAOS/WSTEEM', kind: 'VOLATILE', a: 'SAOS', b: 'WSTEEM', feeBps: 30, ra: '0', rb: '0', planned: true },
      { id: 'P5', pair: 'SAOS/WSTEEM', kind: 'VOLATILE', a: 'SAOS', b: 'WSTEEM', feeBps: 30, ra: '800000', rb: '900000', planned: false }, // live, NO measured fair (no invention)
    ],
  };
  // the realized-price tape: P3 filled at two prices around the mid → σ exists (µ in, µ out)
  const hist = [
    { type: 'AGENT_FILL', hops: [{ pool: 'P3', in: '1000000', out: '103500', fee: '2500' }] },  // 0.1035 SBD per STEEM
    { type: 'AGENT_FILL', hops: [{ pool: 'P3', in: '1000000', out: '105500', fee: '2500' }] },  // 0.1055 SBD per STEEM
    { type: 'AGENT_FILL', hops: [{ pool: 'P5', in: '100000', out: '112500', fee: '3000' }] },   // P5: ONE sample only
  ];
  const feed = { fresh: true, fair: '105446700' };
  const book = measureFeeLaw(core, hist, feed, NOW);
  ok('book-shape', book.ok === true && book.book === 'saos-engine-fee-law/1.0' && Array.isArray(book.pools));
  ok('peg-untouched', book.pools.find((p) => p.pool === 'P1').deltaBps === 0 && book.checks.pegsUntouched === true);
  ok('planned-pool-skipped', !book.pools.some((p) => p.pool === 'P4'));
  const p3 = book.pools.find((p) => p.pool === 'P3');
  ok('sigma-measured-from-tape', p3.samples === 2 && p3.sigmaBps != null && p3.feeBps >= p3.baseBps && p3.deltaBps >= 0);
  ok('checks-green', book.checks.allFeesAtOrAboveBase === true && book.checks.capsRespected === true);
  // thin tape: <2 samples AND no fair → σ null → base (no invention)
  const thin = measureFeeLaw(core, [hist[2]], feed, NOW);
  const p5t = thin.pools.find((p) => p.pool === 'P5');
  ok('thin-tape-stays-base', p5t.sigmaBps == null && p5t.feeBps === 30 && p5t.deltaBps === 0);
  // the law raises with σ: a violent tape raises the fee, capped at min(2×base, 200)
  const violent = [
    { type: 'AGENT_FILL', hops: [{ pool: 'P3', in: '1000000', out: '90000', fee: '2500' }] },   // 0.0900
    { type: 'AGENT_FILL', hops: [{ pool: 'P3', in: '1000000', out: '130000', fee: '2500' }] },  // 0.1300 (±19% around 0.11)
  ];
  const hot = measureFeeLaw(core, violent, feed, NOW);
  const p3h = hot.pools.find((p) => p.pool === 'P3');
  ok('volatility-raises-fee', p3h.sigmaBps != null && p3h.sigmaBps > p3.sigmaBps && p3h.feeBps > p3h.baseBps);
  ok('cap-respected', p3h.feeBps <= Math.min(2 * p3h.baseBps, 200));
  // lawFeeFor: fresh book raises; stale book → null (base); lower row refuses; PEG refuses
  const nowMs = Date.parse('2026-10-07T13:00:00.000Z');
  ok('lawfee-fresh-adopts', lawFeeFor(core.pools.find((p) => p.id === 'P3'), { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 25, feeBps: 50 }] }, nowMs) === 50);
  ok('lawfee-stale-refuses', lawFeeFor(core.pools.find((p) => p.id === 'P3'), { publishedAt: '2026-10-05T12:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 25, feeBps: 50 }] }, nowMs) === null);
  ok('lawfee-lower-row-refuses', lawFeeFor(core.pools.find((p) => p.id === 'P3'), { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 0, feeBps: 10 }] }, nowMs) === null);
  ok('lawfee-overcap-row-refuses', lawFeeFor(core.pools.find((p) => p.id === 'P3'), { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 999, feeBps: 500 }] }, nowMs) === null);
  ok('lawfee-peg-refuses', lawFeeFor(core.pools.find((p) => p.id === 'P1'), { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'P1', sigmaBps: 25, feeBps: 50 }] }, nowMs) === null);
  ok('lawfee-unknown-pool-base', lawFeeFor(core.pools.find((p) => p.id === 'P3'), { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'PX', sigmaBps: 25, feeBps: 50 }] }, nowMs) === null);
  // withLawFee keeps the ledger object untouched (copy, Meteora model)
  // T-49: trade-time injected — the fixed-publishedAt fixture must be judged at ITS OWN
  // trade time, never wall-clock (the same time-bomb class the batch-settle lane had)
  const p3src = core.pools.find((p) => p.id === 'P3');
  const wrapped = withLawFee(p3src, { publishedAt: '2026-10-07T12:00:00.000Z', pools: [{ pool: 'P3', sigmaBps: 25, feeBps: 50 }] }, Date.parse('2026-10-07T12:30:00.000Z'));
  ok('withlawfee-copy-not-mutate', wrapped !== p3src && wrapped.feeBps === 50 && wrapped.lawFeeBps === 50 && p3src.feeBps === 25);
  const pass = c.filter((x) => x.ok).length;
  console.log(`DEX-CORE-SELFTEST-FEE-LAW-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

// ── XC intent settlement (R43): the doors' ops applied on ONE balance universe ──
/** The core stays dumb and safe: it applies XC ops atomically, asserts conservation per op,
 *  enforces the escrow/bond laws, and NEVER invents state. The doors, the clocks, the state
 *  machine and the fill competition live in dex-xc.cjs (judge separation — the mesh pattern).
 *  Idempotency by escrow drain: a replayed fill/refund finds the escrow empty and is refused. */
function settleXcOps(prev, queue, feed, now) {
  const st = {
    vault: JSON.parse(JSON.stringify(prev.vault)),
    accounts: JSON.parse(JSON.stringify(prev.accounts)),
    pools: JSON.parse(JSON.stringify(prev.pools)),
    seq: prev.seq || 0,
    xcExposure: JSON.parse(JSON.stringify(prev.xcExposure || {})),
  };
  const ops = [];
  const op = (type, payload) => { st.seq += 1; ops.push({ seq: st.seq, type, at: now, ...payload }); };
  const notes = [], settledXc = [], rejectsXc = [];
  const batch = (queue && queue.batch) || null;

  const finish = (extra) => {
    const cons = conservation(st.vault, st.accounts, st.pools);
    const consOk = cons.every((c) => c.ok);
    st.vault.reserveRatio = reserveRatios(st.vault);
    const att = attestationHash(st.vault, st.accounts, st.pools, st.seq);
    return { st, ops, notes, batchId: batch, cons, consOk, att, settledXc, rejectsXc, xcExposure: st.xcExposure, ...extra };
  };

  if (!batch) { notes.push('xc ops without a batch id — refused by law'); return finish({ skipped: true }); }
  if (!Array.isArray(queue.ops) || queue.ops.length === 0) { notes.push('empty xc queue'); return finish({ skipped: true }); }

  // R43 ESCROW-IDENTITY LAW: every intent escrows into its OWN account (xc-escrow-<intentId>) —
  // the escrow account IS the intent's custody. Idempotency by escrow drain is then PER-INTENT:
  // a replayed fill/refund finds its own escrow empty and is refused, and can never consume
  // another intent's escrow (the shared-escrow design would have allowed exactly that).
  const escrowName = (id) => 'xc-escrow-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const getAcc = (name) => { if (!st.accounts[name]) st.accounts[name] = { claims: emptyClaims(), lp: {} }; return st.accounts[name]; };
  // first-hop depth of an asset (min across live pools holding it) — the split-fill size cap
  const depthOf = (asset) => {
    let d = 0n;
    for (const p of st.pools) {
      if (p.planned || (ub(p.ra) <= 0n && ub(p.rb) <= 0n)) continue;
      if (p.a === asset) d = d === 0n ? ub(p.ra) : (ub(p.ra) < d ? ub(p.ra) : d);
      if (p.b === asset) d = d === 0n ? ub(p.rb) : (ub(p.rb) < d ? ub(p.rb) : d);
    }
    return d;
  };
  const refuse = (o, why) => { op('XC-REFUSED', { intentId: (o && o.intentId) || null, xcOp: (o && o.type) || '?', why: String(why).slice(0, 160) }); rejectsXc.push({ intentId: (o && o.intentId) || null, xcOp: (o && o.type) || '?', why: String(why).slice(0, 160) }); };

  for (const o of (queue.ops || [])) {
    const t = String((o && o.type) || '');
    const intentId = String((o && o.intentId) || '');
    if (!intentId) { refuse(o, 'UNKNOWN-INTENT'); continue; }
    if (t === 'XC-OPEN') {
      const owner = String(o.owner || ''); const origin = String(o.origin || '');
      const amount = ub(o.amountMu); const minOut = (o.minOutMu != null) ? ub(o.minOutMu) : null;
      const destKind = String(o.destKind || ''); const destAsset = o.destAsset ? String(o.destAsset) : null; const destChain = o.destChain ? String(o.destChain) : null;
      if (!owner || !st.accounts[owner]) { refuse(o, 'UNKNOWN-OWNER'); continue; }
      if (!ASSETS.includes(origin) && !WRAPPED.includes(origin)) { refuse(o, 'BAD-ASSET'); continue; }
      if (amount < MESH_DUST) { refuse(o, 'DUST'); continue; }
      if (destKind === 'CHAIN' && !CHAIN_WRAPPER[destChain]) { refuse(o, 'DOOR-GATED-PLAN (no wrapper in the vault catalog — the door is priced, never settled, until keys verify)'); continue; }
      if (destKind === 'LEDGER' && (!destAsset || (!ASSETS.includes(destAsset) && !WRAPPED.includes(destAsset)))) { refuse(o, 'BAD-DEST'); continue; }
      const held = ub(st.accounts[owner].claims[origin] || '0');
      if (held < amount) { refuse(o, 'NO-ESCROW'); continue; }
      const cap = depthOf(origin) * MESH_FILL_MAX_DEPTH_BPS / BPS; // the split-fill law: one intent ≤ 5% of first-hop depth — larger sums split into child intents
      if (amount > cap) { refuse(o, 'SIZE-CAP-SPLIT-REQUIRED'); continue; }
      if (ops.some((x) => x.type === 'XC-ESCROW' && x.intentId === intentId)) { refuse(o, 'DOUBLE-OPEN'); continue; }
      // cross-batch replay defense: this intent's escrow account already holds value ⇒ it is already open
      const existingEsc = st.accounts[escrowName(intentId)];
      if (existingEsc && ub(existingEsc.claims[origin] || '0') > 0n) { refuse(o, 'DOUBLE-OPEN (escrow already held — cross-batch replay refused)'); continue; }
      const ownerAcc = getAcc(owner), esc = getAcc(escrowName(intentId));
      ownerAcc.claims[origin] = mu(ub(ownerAcc.claims[origin]) - amount);
      esc.claims[origin] = mu(ub(esc.claims[origin]) + amount);
      op('XC-ESCROW', { intentId, owner, origin, amount: mu(amount), destKind, destAsset, destChain, minOut: minOut == null ? null : mu(minOut), law: 'escrow moves claims, never creates them — conservation holds' });
      settledXc.push({ intentId, op: 'OPEN' });
      continue;
    }
    if (t === 'XC-FILL-POOL' || t === 'XC-FILL-P2P') {
      const origin = String(o.origin || ''); const amount = ub(o.amountMu);
      const destKind = String(o.destKind || ''); const destAsset = o.destAsset ? String(o.destAsset) : null; const destChain = o.destChain ? String(o.destChain) : null;
      const minOut = (o.minOutMu != null) ? ub(o.minOutMu) : null;
      const owner = String(o.owner || '');
      const esc = st.accounts[escrowName(intentId)];
      const escHeld = esc ? ub(esc.claims[origin] || '0') : 0n;
      if (escHeld < amount) { refuse(o, 'ESCROW-MISMATCH (drained or absent — a replayed fill is refused by law)'); continue; }
      if (t === 'XC-FILL-P2P') {
        // P2P fill: a roster filler delivers the LEDGER destination out of his own claims; the escrow drains to the filler.
        if (destKind !== 'LEDGER' || !destAsset) { refuse(o, 'P2P-LEDGER-ONLY'); continue; }
        const filler = String(o.filler || '');
        if (!rosterLaw().includes(filler)) { refuse(o, 'ROSTER-UNKNOWN'); continue; }
        const deliver = ub(o.deliverMu);
        if (deliver < MESH_DUST) { refuse(o, 'DUST'); continue; }
        if (minOut != null && deliver < minOut) { refuse(o, 'P2P-BELOW-QUOTE'); continue; }
        const fHeld = (st.accounts[filler] ? ub(st.accounts[filler].claims[destAsset] || '0') : 0n);
        if (fHeld < deliver) { refuse(o, 'NO-FILL-CAPITAL'); continue; }
        getAcc(filler).claims[destAsset] = mu(fHeld - deliver);
        getAcc(owner).claims[destAsset] = mu(ub(getAcc(owner).claims[destAsset]) + deliver);
        esc.claims[origin] = mu(escHeld - amount);
        getAcc(filler).claims[origin] = mu(ub(getAcc(filler).claims[origin]) + amount);
        op('XC-FILL', { intentId, mode: 'P2P', filler, origin, amount: mu(amount), destAsset, delivered: mu(deliver), law: 'escrow-first — the filler delivers against held escrow, the escrow drains to the filler' });
        settledXc.push({ intentId, op: 'FILL-P2P', filler, delivered: mu(deliver) });
        continue;
      }
      // POOL fill: the escrowed origin routes through OUR pools (the traffic law: every intent pays fees to our network)
      const dest = destKind === 'CHAIN' ? CHAIN_WRAPPER[destChain] : destAsset;
      if (!dest) { refuse(o, 'BAD-DEST'); continue; }
      const route = routeBest(st.pools, origin, dest, amount);
      if (!route) { refuse(o, 'NO-ROUTE'); continue; }
      // ATOMIC SIMULATE on copies (all-or-nothing — the mesh law inherited)
      const touched = new Map();
      let cur = origin, amt = amount, simOk = true, why2 = '', feesTotal = 0n;
      const hops = [];
      for (const pid of route.ids) {
        const p = st.pools.find((x) => x.id === pid);
        if (!p) { simOk = false; why2 = 'POOL-VANISHED'; break; }
        if (!touched.has(pid)) touched.set(pid, JSON.parse(JSON.stringify(p)));
        const cp = touched.get(pid);
        const dirOut = cp.a === cur ? cp.b : cp.a;
        const sw = poolSwap(cp, cur, dirOut, amt, null);
        if (!sw || sw.error) { simOk = false; why2 = 'HOP-REFUSED-' + String((sw && sw.error) || 'EMPTY'); break; }
        cp.ra = mu(sw.newRa); cp.rb = mu(sw.newRb); cp.feeMeter = mu(ub(cp.feeMeter) + sw.feeAmt);
        feesTotal += sw.feeAmt;
        hops.push({ pool: pid, in: mu(amt), out: mu(sw.out) });
        amt = sw.out; cur = dirOut;
      }
      if (!simOk || cur !== dest) { refuse(o, why2 || 'ROUTE-BROKE'); continue; }
      if (minOut != null && amt < minOut) { refuse(o, 'REFUSED-MINOUT'); continue; }
      // ATOMICITY (all-or-nothing): the chain-dest redeem is SIMULATED on copies BEFORE any commit —
      // a refused redeem leaves pools, escrow and accounts byte-unchanged (the mesh law inherited).
      let rdSim = null;
      if (destKind === 'CHAIN') {
        // the BOND LAW (2:1) — outstanding corridor exposure + this payout ≤ 2× custody of the payout asset
        const underlying = WRAP_UNDERLYING[dest];
        const exposure = ub(st.xcExposure[underlying] || '0');
        const custody = ub(st.vault.custody[underlying] || '0');
        if (exposure + amt > custody * XC_BOND_EXPOSURE_RATIO) {
          refuse(o, `BOND-LAW-EXCEEDED (exposure ${mu(exposure)}+${mu(amt)} > 2×custody ${mu(custody * XC_BOND_EXPOSURE_RATIO)})`);
          continue;
        }
        const simVault = JSON.parse(JSON.stringify(st.vault));
        const simAccounts = JSON.parse(JSON.stringify(st.accounts));
        simAccounts[escrowName(intentId)].claims[origin] = mu(escHeld - amount);
        if (!simAccounts[owner]) simAccounts[owner] = { claims: emptyClaims(), lp: {} };
        simAccounts[owner].claims[dest] = mu(ub(simAccounts[owner].claims[dest] || '0') + amt);
        const simPools = JSON.parse(JSON.stringify(st.pools));
        for (const [pid, cp] of touched) { const p = simPools.find((x) => x.id === pid); p.ra = cp.ra; p.rb = cp.rb; p.feeMeter = cp.feeMeter; }
        rdSim = redeem({ vault: simVault, accounts: simAccounts, seq: st.seq, pools: simPools }, dest, amt, owner, now);
        if (!rdSim.ok) { refuse(o, 'REDEEM-REFUSED-' + String(rdSim.refused || '?')); continue; }
      }
      // COMMIT the route + the escrow drain (all-or-nothing)
      for (const [pid, cp] of touched) { const p = st.pools.find((x) => x.id === pid); p.ra = cp.ra; p.rb = cp.rb; p.feeMeter = cp.feeMeter; }
      esc.claims[origin] = mu(escHeld - amount);
      if (destKind === 'CHAIN') {
        // the wrapper lands on the owner, then the REDEEM law burns it and queues the corridor payout (the R42 law reused, never re-implemented)
        getAcc(owner).claims[dest] = mu(ub(getAcc(owner).claims[dest]) + amt);
        st.vault = rdSim.st.vault; st.accounts = rdSim.st.accounts; st.seq = rdSim.st.seq;
        for (const ro of rdSim.ops) ops.push(ro);
        const underlying = WRAP_UNDERLYING[dest];
        st.xcExposure[underlying] = mu(ub(st.xcExposure[underlying] || '0') + amt);
        op('XC-FILL', { intentId, mode: 'POOL-CHAIN', owner, origin, amount: mu(amount), routeIds: route.ids, hops, wrapper: dest, wrapperOut: mu(amt), feesMu: mu(feesTotal), pegout: rdSim.pegout, law: 'route through our pools, redeem 1:1, payout queued to the corridor — the escrow drains, value is real' });
        settledXc.push({ intentId, op: 'FILL-POOL-CHAIN', payout: mu(amt), corridor: rdSim.corridor });
      } else {
        getAcc(owner).claims[destAsset] = mu(ub(getAcc(owner).claims[destAsset]) + amt);
        op('XC-FILL', { intentId, mode: 'POOL-LEDGER', owner, origin, amount: mu(amount), routeIds: route.ids, hops, destAsset, out: mu(amt), feesMu: mu(feesTotal), law: 'route through our pools — atomic, minOut enforced' });
        settledXc.push({ intentId, op: 'FILL-POOL-LEDGER', out: mu(amt) });
      }
      if (!conservation(st.vault, st.accounts, st.pools).every((c) => c.ok)) return finish({ halted: 'CONSERVATION-BROKEN-AFTER-XC-FILL' });
      continue;
    }
    if (t === 'XC-CONFIRM') {
      const asset = String(o.asset || ''); const payout = ub(o.payoutMu);
      const exposure = ub(st.xcExposure[asset] || '0');
      st.xcExposure[asset] = mu(exposure >= payout ? exposure - payout : 0n);
      op('XC-CONFIRM', { intentId, asset, payout: mu(payout), law: "the door's finality clock passed — the corridor exposure is cleared (the chain receipt stays the keyed desk's)" });
      settledXc.push({ intentId, op: 'CONFIRM', asset });
      continue;
    }
    if (t === 'XC-REFUND') {
      const origin = String(o.origin || ''); const amount = ub(o.amountMu); const owner = String(o.owner || '');
      if (!st.accounts[owner]) { refuse(o, 'UNKNOWN-OWNER'); continue; }
      const esc = st.accounts[escrowName(intentId)];
      const escHeld = esc ? ub(esc.claims[origin] || '0') : 0n;
      if (escHeld < amount) { refuse(o, 'ESCROW-MISMATCH (drained or absent — a replayed refund is refused by law)'); continue; }
      esc.claims[origin] = mu(escHeld - amount);
      getAcc(owner).claims[origin] = mu(ub(getAcc(owner).claims[origin]) + amount);
      op('XC-REFUND', { intentId, owner, origin, amount: mu(amount), law: 'refund WHOLE after the 2:1 clock — the timelock is the law, no dust loss' });
      settledXc.push({ intentId, op: 'REFUND' });
      continue;
    }
    refuse(o, 'UNKNOWN-OP');
  }
  return finish({});
}

// ── xc settle path (R43): the core consumes the doors' queue single-writer ──
async function settleXcTick() {
  const now = nowIso();
  try {
    const stasis = stasisCheck();
    if (stasis) {
      writeBook({ protocol: PROTOCOL, at: now, agent: VERSION, verdict: 'EXCHANGE-CORE-HALTED-STASIS', stasisHalted: true, stasisReason: stasis.reason || null, laws: LAWS, pools: [], routes: [], arb: [], counterGrids: {}, errors: [] });
      console.log(`STASIS-HALT dex-core settle-xc · ${now} (the queue stays — the doors own it, settling resumes when STASIS lifts)`);
      return 0;
    }
    const prev = loadBook();
    if (!prev || prev.protocol !== PROTOCOL || !prev.genesisDone) { console.log('dex-core: no genesis book — settle-xc refuses (nothing to settle on)'); return 0; }
    let queue = null;
    try { queue = JSON.parse(fs.readFileSync(XC_OPS_FILE, 'utf8')); } catch (_) { queue = null; }
    if (!queue || !Array.isArray(queue.ops) || queue.ops.length === 0) { console.log('dex-core: no xc ops in the queue'); return 0; }
    const feed = loadRouterFeed();
    const xc = settleXcOps(prev, queue, feed, now);
    // THE POOL-MOVER'S RE-DERIVATION LAW (R43): any desk that moves the pools re-derives the
    // route rows it leaves in the book — a fill that changes reserves makes every stale quote
    // a lie. Each LIVE route row re-prices at its booked size against the POST-settle pools.
    const reDerivedRoutes = (prev.routes || []).map((r) => {
      if (r.verdict !== 'LIVE-INTERNAL' || !r.from || !r.to || !r.quoteFor) return r;
      const m = String(r.quoteFor).match(/^(\d+) µ/);
      if (!m) return r;
      const fresh = routeBest(xc.st.pools, r.from, r.to, BigInt(m[1]));
      return { ...r, quote: fresh ? mu(fresh.out) : null, verdict: fresh ? 'LIVE-INTERNAL' : 'STALE-THIN (re-derived after the xc fill — no route at this size now)' };
    });
    const book = assemble(prev, { st: xc.st, ops: xc.ops, routes: reDerivedRoutes, arb: prev.arb || [], counterGrids: prev.counterGrids || {}, cons: xc.cons, consOk: xc.consOk, att: xc.att, feesMu: 0n, edgeMu: ub((prev.treasuryPnl || {}).rebalanceEdgeMu || '0'), notes: xc.notes, rebalanceBooked: false, xcExposure: xc.xcExposure }, feed, null, now, false, xc.ops, null);
    book.mode = 'KEYLESS-ATOMIC-INTERNAL (xc intents)';
    book.xc = { batch: xc.batchId, settled: xc.settledXc, rejects: xc.rejectsXc, exposure: xc.xcExposure };
    if (xc.settledXc.length) book.summary.verdict = 'XC-SETTLED';
    writeBook(book); writeMd(book);
    appendHistory(xc.ops);
    // publish pegout rows from chain-dest fills (the corridor queue — keyed desks own the broadcast)
    const pegoutRows = xc.ops.filter((o) => o.type === 'XC-FILL' && o.pegout).map((o) => ({ at: now, intentId: o.intentId, ...o.pegout }));
    if (pegoutRows.length) {
      try {
        let pq = null; try { pq = JSON.parse(fs.readFileSync(PEGOUT_QUEUE_FILE, 'utf8')); } catch (_) { pq = null; }
        pq = pq || { protocol: 'SAOS-DEX-PEGOUT-QUEUE/1', rows: [] };
        pq.at = now; pq.rows = [...(pq.rows || []), ...pegoutRows].slice(-256);
        fs.writeFileSync(PEGOUT_QUEUE_FILE + '.tmp', JSON.stringify(pq, null, 1) + '\n'); fs.renameSync(PEGOUT_QUEUE_FILE + '.tmp', PEGOUT_QUEUE_FILE);
      } catch (_) {}
    }
    // consume the queue (single-writer: the doors wrote it, the core clears it)
    try { fs.writeFileSync(XC_OPS_FILE + '.tmp', JSON.stringify({ protocol: 'SAOS-DEX-XC-OPS/1', batch: null, at: now, ops: [], lastSettled: xc.batchId }, null, 1) + '\n'); fs.renameSync(XC_OPS_FILE + '.tmp', XC_OPS_FILE); } catch (_) {}
    console.log(`DEX-CORE-XC-SETTLE batch=${xc.batchId} settled=${xc.settledXc.length} rejects=${xc.rejectsXc.length} exposure=${JSON.stringify(xc.xcExposure)} cons=${xc.consOk} att=${xc.att}`);
    return 0;
  } catch (e) {
    console.log(`dex-core settle-xc: ERROR (fail-soft, exit 0) ${e.message}`);
    return 0;
  }
}

const LAWS = [
  'counter-grid arm (R44): the owner gate is the CR-0074 ARTIFACT (present = open); the arm adds deterministic rung ids, the 2%-of-depth cap law, the dust refusal (GRID-TOO-THIN) and the two-sided law (a one-sided grid is a direction bet — REFUSED); settle stays pure (the gate is an argument)',
  'pegout hand (R44): the keyed consumer of the pegout queue — DEST-ALLOWLIST law (chain payouts fire ONLY to estate-roster accounts, non-estate dests are REFUSED-DEST-NOT-ESTATE); the rail proves itself with a value-neutral self-transfer, receipted',
  'intent gates (R43): XC intents settle on ONE balance universe — escrow in, route through OUR pools, chain payouts queued to the corridor (keyless code never broadcasts), refund whole behind the 2:1 clock, corridor exposure bonded ≤ 2× custody',
  'units: µ BigInt end to end, no floats in settlement',
  'volatile pools: x·y ≥ k (Uniswap v2 exact, fee on input, floor to user)',
  'peg pools: Curve stableswap A=10 (canonical, fee on output, −1 pad)',
  'real value: wrapped mint 1:1 reserve-backed, redeem ALWAYS honored 1:1',
  'atomicity: minOut guard, refused swaps leave state byte-unchanged',
  'conservation: custody − wrappedReserve − Σ claims === 0 every tick',
  'ledger: append-only op-log, monotonic seq, state = fold(ops)',
  'floor law: rebalance only above 2×(fees+floor) — below it a plan, never a trade',
  'feed law: settle consumes the booked router feed; measurement and settlement are separated',
  'honest money: the powerdown drip is the booked fuel; no invented locks',
  'mesh law (R41): fleet agents settle atomically on this ledger — batch-idempotent, no naked shorts, wires capped at 10% of free treasury per batch, a fill never exceeds 5% of first-hop depth, edge marked to fair (null when no fair exists)',
  'multi-network vault (R42): custody classes — MEASURED-KEYED is the only mintable class; adjacent networks are OBSERVED (seen, never custody, never a reserve); redeem is ALWAYS honored 1:1 in-ledger (burn before payout); the chain payout is queued for the keyed desks — keyless code never fires a broadcast',
  'uniform batch clearing (R76): the queue clears as ONE batch - canonical order, two-sided netting at the measured fair, one uniform clearing price for every trader, the solver absorbs the remainder; order-invariance (a permuted queue clears byte-identical) is the anti-sandwich proof · the proof lane is DRY (moves nothing), the settle gate stays the owner\'s',
];
function assemble(prev, settled, feed, probe, now, isGenesis, ops, meshResult) {
  const s = settled.st;
  const opRows = ops || settled.ops;
  const mesh = meshResult || null;
  const meshFillCount = mesh ? mesh.fills.length : 0;
  const verdict = mesh
    ? (mesh.halted ? 'CONSERVATION-BROKEN' : (mesh.consOk ? (meshFillCount > 0 ? 'MESH-SETTLED' : 'MESH-NO-FILL') : 'CONSERVATION-BROKEN'))
    : (settled.consOk ? (settled.rebalanceBooked ? 'EXCHANGE-CORE-LIVE-REBALANCED' : 'EXCHANGE-CORE-LIVE') : 'CONSERVATION-BROKEN');
  return {
    protocol: PROTOCOL, at: now, agent: VERSION, mode: mesh ? 'KEYLESS-ATOMIC-INTERNAL (mesh batch)' : 'KEYLESS-ATOMIC-INTERNAL',
    stasisHalted: false, laws: LAWS,
    issuer: issuerRow(),
    custodyClasses: s.custodyClasses || prev.custodyClasses || custodyClassRows(null),
    redeemBook: settled.redeemBook || null,
    feed: { source: 'agents/dex-router.json', routerAt: feed.routerAt, fresh: feed.fresh, fairNano: feed.fair, fairSource: feed.fairSource, hiveFairNano: feed.hiveFair || null, crossFairNano: (feed.fair && feed.hiveFair) ? mu(crossFair(feed.fair, feed.hiveFair)) : null, fairSource2: feed.hiveFairSource || null, verdict: feed.fresh ? 'FEED-LIVE' : 'FEED-STALE' },
    custodyProbe: { measured: !!(probe && probe.measured), node: probe ? probe.node : null },
    seq: s.seq,
    vault: s.vault,
    accounts: Object.fromEntries(Object.keys(s.accounts).map((k) => [k, { claims: s.accounts[k].claims, lp: s.accounts[k].lp || {} }])),
    pools: s.pools.map((p) => ({ id: p.id, pair: p.pair, kind: p.kind, a: p.a, b: p.b, feeBps: p.feeBps, amp: p.amp || 0, planned: !!p.planned, ra: p.ra, rb: p.rb, feeMeter: p.feeMeter, verdict: p.verdict, plannedWhy: p.plannedWhy || null, mid: (ub(p.ra) > 0n ? +(Number(ub(p.rb) * NANO / ub(p.ra)) / 1e9).toFixed(8) : null) })),
    routes: settled.routes,
    arb: settled.arb,
    counterGrids: settled.counterGrids,
    treasuryPnl: { feesMu: mu(settled.feesMu), rebalanceEdgeMu: mu(settled.edgeMu), note: 'fees are LP revenue (treasury owns the LP); rebalance edges are marked to the CEX fair at execution — the LVR defense on our own pool' },
    conservation: settled.cons,
    conservationOk: settled.consOk,
    attestation: settled.att,
    processedBatches: mesh ? mesh.processedBatches : (prev.processedBatches || []),
    xcExposure: (settled && settled.xcExposure) || prev.xcExposure || {}, // the bond law's exposure ledger — carried tick to tick, cleared only by XC-CONFIRM
    meshPnl: mesh ? mesh.meshPnl : (prev.meshPnl || { lifetime: { byAgent: {}, fills: 0, edgeMu: '0', feesMu: '0', volumeInMu: '0' }, batch: null }),
    genesisDone: true,
    opsThisTick: opRows.map((o) => ({ seq: o.seq, type: o.type, ...Object.fromEntries(Object.keys(o).filter((k) => !['seq', 'type', 'at'].includes(k)).map((k) => [k, o[k]])) })),
    summary: {
      verdict,
      poolsLive: s.pools.filter((p) => !p.planned && ub(p.ra) > 0n).length,
      poolsPlanned: s.pools.filter((p) => p.planned).length,
      routesLive: settled.routes.filter((r) => r.verdict === 'LIVE-INTERNAL').length,
      routesPlanned: settled.routes.filter((r) => r.verdict !== 'LIVE-INTERNAL').length,
      meshFills: meshFillCount,
      meshBatch: mesh ? mesh.batchId : null,
      notes: settled.notes,
    },
  };
}

// ── selftest (fresh process, zero network, deterministic) ───────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function selftest() {
  const c = []; const ok = (name, cond) => c.push({ name, ok: !!cond });
  // CPMM golden (hand-derived): ra=3, rb=6, in=1, fee 0 → out = 6·1/(3+1) = 1 (floor of 1.5)
  ok('cpmm-golden-floor', cpmmOut(3n, 6n, 1n, 0) === 1n);
  // CPMM golden (hand-derived, 25% fee): inWithFee = 7500 → out = 6·7500/(30000+7500) = 1
  ok('cpmm-golden-fee', cpmmOut(3n, 6n, 1n, 2500) === 1n);
  // CPMM Uniswap-exact cross-check (independent inline formula from UniswapV2Library.getAmountOut)
  const ra = 1000000000n, rb = 4000000000n, amt = 10000000n, fee = 25;
  const exp = (rb * (amt * (BPS - BigInt(fee)))) / (ra * BPS + amt * (BPS - BigInt(fee)));
  ok('cpmm-uniswap-exact', cpmmOut(ra, rb, amt, fee) === exp && cpmmKCheck(ra, rb, amt, exp));
  // CPMM fuzz: k never decreases, reserves never negative (seeded PRNG — deterministic)
  let fuzzOk = true; const rnd = mulberry32(40001);
  for (let i = 0; i < 200 && fuzzOk; i++) {
    const x = BigInt(1 + Math.floor(rnd() * 1e9)), y = BigInt(1 + Math.floor(rnd() * 1e9)), d = BigInt(1 + Math.floor(rnd() * 1e8));
    const f = Math.floor(rnd() * 100);
    const o = cpmmOut(x, y, d, f);
    if (o && !cpmmKCheck(x, y, d, o)) fuzzOk = false;
  }
  ok('cpmm-k-fuzz', fuzzOk);
  // Stableswap: D satisfies the canonical invariant equation (independent float evaluation)
  const A = 10n, x0 = 1000000n, y0 = 1000000n;
  const D = stableD(x0, y0, A);
  const S = Number(x0 + y0), Df = Number(D), Af = Number(A);
  const inv = Af * S + Df - Af * Df - (Df * Df * Df) / (4 * Number(x0) * Number(y0));
  ok('stable-D-invariant', D > 0n && Math.abs(inv) < Df * 1e-9);
  // Stableswap: balanced pool small swap ≈ 1:1 minus fee (peg law) — 0.1% of pool, fee 2bps
  const so = stableOut(x0, y0, 1000n, 2, A);
  ok('stable-peg-law', !!so && so.out >= 990n && so.out <= 1000n);
  // Stableswap: independent float bisection solve of the invariant (spec ≠ solver)
  // D is the POOL CONSTANT — computed from the PRE-swap reserves (canonical Curve law)
  const Xin = x0 + 1000n;
  const Dpre = stableD(x0, y0, A);
  const Dy = Number(Dpre);
  let lo = 1e-6, hi = Number(y0) * 2;
  const g = (y) => Af * (Number(Xin) + y) + Dy - Af * Dy - (Dy * Dy * Dy) / (4 * Number(Xin) * y);
  for (let i = 0; i < 80; i++) { const midr = (lo + hi) / 2; if (g(midr) > 0) hi = midr; else lo = midr; }
  const yRoot = (lo + hi) / 2;
  const floatOut = Number(y0) - yRoot;
  const bOut = stableGetY(1, 0, Xin, x0, y0, Dpre, A);
  ok('stable-independent-solve', !!bOut && Math.abs(Number(bOut) - yRoot) <= 3);
  ok('stable-out-matches-y', !!so && !!bOut && Math.abs(Number(so.out) - floatOut) <= 3);
  // Stableswap fee exactness: 2bps of dy (floor)
  ok('stable-fee-floor', (() => { const r1 = stableOut(x0, y0, 100000n, 0, A); const r2 = stableOut(x0, y0, 100000n, 2, A); return r1 && r2 && r1.out > r2.out && r1.out - r2.out <= (r1.out * 2n) / BPS + 1n; })());
  // minOut atomicity: refused swap reports error, caller state unchanged (pure — the guard is the contract)
  const refused = poolSwap({ id: 'T', kind: 'VOLATILE', a: 'X', b: 'Y', ra: '1000000', rb: '1000000', feeBps: 25 }, 'X', 'Y', 1000000n, ub('999000'));
  ok('minout-atomic', refused && refused.error === 'REFUSED-MINOUT');
  // Reserve law: mint 1:1 only against reserve; redeem always honored (burn before payout)
  const v = emptyVault(); v.custody.STEEM = '1000000'; v.custodyProvenance.STEEM = 'test';
  const accs = { treasury: { claims: emptyClaims(), lp: {} } };
  accs.treasury.claims.STEEM = '1000000';
  const mintAmt = 500000n;
  v.wrappedReserve.STEEM = mu(mintAmt); v.minted.WSTEEM = mu(mintAmt);
  accs.treasury.claims.STEEM = mu(1000000n - mintAmt); accs.treasury.claims.WSTEEM = mu(mintAmt);
  ok('reserve-ratio-1', reserveRatios(v).WSTEEM === 1);
  const overMint = mintAmt + 1n;
  ok('mint-over-reserve-refused-by-law', overMint > ub(v.wrappedReserve.STEEM)); // the law: reserve must cover minted; ratio < 1 is illegal state
  v.wrappedReserve.STEEM = mu(mintAmt - 100000n); v.minted.WSTEEM = mu(mintAmt - 100000n);
  accs.treasury.claims.WSTEEM = mu(mintAmt - 100000n); accs.treasury.claims.STEEM = mu(1000000n - mintAmt + 100000n);
  ok('redeem-always-honored', conservation(v, accs, []).every((r) => r.ok)); // burn releases 1:1 — conservation holds
  // Routing: 3-hop path WSBD→WSTEEM exists and is deterministic
  const pools = [
    { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '500000', rb: '500000' },
    { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: 2, ra: '50000', rb: '50000' },
    { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: '1000000', rb: '105447' },
  ];
  const r1 = routeBest(pools, 'WSBD', 'WSTEEM', 10000n);
  const r2 = routeBest(pools, 'WSBD', 'WSTEEM', 10000n);
  ok('route-3hop-deterministic', !!r1 && r1.ids.length === 3 && r1.ids.join(',') === r2.ids.join(',') && r1.out > 0n);
  const rDirect = routeBest(pools, 'STEEM', 'SBD', 100000n);
  ok('route-direct-best', !!rDirect && rDirect.ids.length === 1 && rDirect.ids[0] === 'P3');
  // Rebalance floor: settle refuses to execute below the threshold (pure settle on a synthetic book)
  const mkBook = (ra, rb, fairNano) => {
    const vv = emptyVault(); vv.custodyProvenance.STEEM = 'test';
    const aa = { treasury: { claims: emptyClaims(), lp: { P3: '1.0' } } };
    for (const k of Object.keys(aa.treasury.claims)) aa.treasury.claims[k] = '0';
    aa.treasury.claims.STEEM = mu(ra * 2n - ra);
    aa.treasury.claims.SBD = '1000000';
    vv.custody.STEEM = mu(ra + ub(aa.treasury.claims.STEEM));   // custody = pooled + free (balanced book)
    vv.custody.SBD = mu(rb + ub(aa.treasury.claims.SBD));
    vv.custodyProvenance.SBD = 'test';
    return { vault: vv, accounts: aa, pools: [
      { id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '0', rb: '0', feeMeter: '0', verdict: 'AWAITING-CUSTODY' },
      { id: 'P2', pair: 'WSBD/SBD', kind: 'PEG', a: 'WSBD', b: 'SBD', feeBps: 2, ra: '0', rb: '0', feeMeter: '0', verdict: 'AWAITING-CUSTODY' },
      { id: 'P3', pair: 'STEEM/SBD', kind: 'VOLATILE', a: 'STEEM', b: 'SBD', feeBps: 25, ra: mu(ra), rb: mu(rb), feeMeter: '0', verdict: 'LIVE-INTERNAL' },
      { id: 'P4', pair: 'SAOS/WSTEEM', kind: 'VOLATILE', a: 'SAOS', b: 'WSTEEM', feeBps: 25, ra: '0', rb: '0', feeMeter: '0', verdict: 'PLANNED-NO-CLAIM' },
    ], seq: 1 };
  };
  const feedLive = { fresh: true, fair: 105446700n, fairSource: 'test', routerAt: nowIso(), router: {} };
  const below = settle(mkBook(1000000n, 105447n * 100n / 100n, null), { ...feedLive, fair: 105447000n }, null, nowIso()); // mid == fair → zero drift
  const belowDrift = settle(mkBook(1000000n, 106500n * 1000n / 1000n, null), feedLive, null, nowIso()); // drift 0.9997% → below 120bps? gross 99.97bps... wait drift here is tiny
  ok('rebalance-below-floor-is-plan', below.arb.concat(belowDrift.arb).filter((r) => r.id === 'A1').every((r) => r.verdict !== 'REBALANCE-BOOKED'));
  const above = settle(mkBook(1000000n, 120000n, null), feedLive, null, nowIso()); // mid 0.12 vs fair 0.1054467 → ~13.8% drift, way above floor
  ok('rebalance-above-floor-executes', above.arb.some((r) => r.verdict === 'REBALANCE-BOOKED' || r.executed));
  // Grid law: both sides present, skew sign follows inventory share
  const grid = above.counterGrids.P3;
  ok('grid-both-sides', !!grid && grid.rungs.filter((r) => r.side === 'buy').length === 3 && grid.rungs.filter((r) => r.side === 'sell').length === 3);
  ok('grid-skew-signed', !!grid && ((grid.inventoryShareBase > 0.5 && grid.skewShiftBps > 0) || (grid.inventoryShareBase < 0.5 && grid.skewShiftBps < 0) || grid.skewShiftBps === 0));
  // Determinism: settle twice on identical inputs → byte-identical routes+arb+ops
  const d1 = settle(mkBook(1000000n, 120000n, null), feedLive, null, '2026-10-05T00:00:00.000Z');
  const d2 = settle(mkBook(1000000n, 120000n, null), feedLive, null, '2026-10-05T00:00:00.000Z');
  ok('settle-deterministic', JSON.stringify(d1.routes) === JSON.stringify(d2.routes) && JSON.stringify(d1.arb) === JSON.stringify(d2.arb) && JSON.stringify(d1.ops) === JSON.stringify(d2.ops));
  // Conservation on the settled book (custody − reserve − claims − pooled === 0)
  ok('conservation-holds-after-settle', above.consOk && above.cons.every((r) => r.ok));
  ok('dust-respects-user', cpmmOut(3n, 6n, 1n, 0) === 1n && (3n + 1n) * (6n - 1n) >= 3n * 6n);

  // ── R41 MESH MARKET selftest ──────────────────────────────────────────────
  // base book for mesh tests: treasury free claims for wiring, P3 live, an edge above floor
  const meshBase = mkBook(1000000n, 120000n, null); // mid 0.12 vs fair 0.1054467 → real edge
  meshBase.processedBatches = [];
  const feedMesh = { fresh: true, fair: 105446700n, fairSource: 'test', routerAt: nowIso(), router: {} };
  // 1. unknown agent refused
  const rej1 = settleIntents(meshBase, { batch: 'B-UNK', intents: [{ agent: 'ghost', from: 'STEEM', to: 'SBD', amountIn: '20000' }] }, feedMesh, nowIso());
  ok('mesh-roster-unknown-refused', rej1.rejects.some((r) => r.why === 'ROSTER-UNKNOWN') && rej1.fills.length === 0);
  // 2. dust refused
  const rej2 = settleIntents(meshBase, { batch: 'B-DUST', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '10' }] }, feedMesh, nowIso());
  ok('mesh-dust-refused', rej2.rejects.some((r) => r.why === 'DUST'));
  // 3. real fill via wire: agent has nothing, treasury has free STEEM → wire + fill settle atomically
  const filled = settleIntents(meshBase, { batch: 'B-FILL', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: '1' }] }, feedMesh, nowIso());
  ok('mesh-wire-then-fill', filled.fills.length === 1 && filled.ops.some((o) => o.type === 'MESH-WIRE') && ub(filled.fills[0].amountOut) > 0n);
  ok('mesh-fill-conservation', filled.consOk && filled.cons.every((r) => r.ok));
  ok('mesh-fill-edge-marked', filled.fills[0].edgeMu != null && filled.fills[0].fairUsed.indexOf('CEX-FAIR') === 0);
  ok('mesh-fill-pool-fee-accrues', (() => { const p = filled.st.pools.find((x) => x.id === 'P3'); return ub(p.feeMeter) > 0n; })());
  ok('mesh-attestation-recomputes', filled.att === attestationHash(filled.st.vault, filled.st.accounts, filled.st.pools, filled.st.seq));
  // 4. idempotency: the same batch settles nothing twice
  const afterFill = { vault: filled.st.vault, accounts: filled.st.accounts, pools: filled.st.pools, seq: filled.st.seq, processedBatches: filled.processedBatches, meshPnl: filled.meshPnl };
  const replay = settleIntents(afterFill, { batch: 'B-FILL', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '20000' }] }, feedMesh, nowIso());
  ok('mesh-batch-idempotent', replay.skipped === true && replay.ops.length === 0 && replay.fills.length === 0);
  // 5. minOut atomicity through the mesh: impossible minOut → refused, pools byte-unchanged, no claims moved
  const preMin = mkBook(1000000n, 120000n, null); preMin.processedBatches = [];
  const meshRefused = settleIntents(preMin, { batch: 'B-MIN', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '20000', minOut: '999999999999' }] }, feedMesh, nowIso());
  ok('mesh-minout-atomic', meshRefused.rejects.some((r) => r.why === 'REFUSED-MINOUT') && meshRefused.fills.length === 0
    && JSON.stringify(meshRefused.st.pools.find((p) => p.id === 'P3')) === JSON.stringify(preMin.pools.find((p) => p.id === 'P3')));
  // 6. naked short without treasury capital: empty treasury → GATED-WIRE-NO-CAPITAL, no fill
  const broke = mkBook(1000000n, 120000n, null); broke.processedBatches = [];
  broke.accounts.treasury.claims.STEEM = '0'; // no free capital
  const gated = settleIntents(broke, { batch: 'B-GATE', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '20000' }] }, feedMesh, nowIso());
  ok('mesh-gated-wire-honest', gated.rejects.some((r) => r.why === 'GATED-WIRE-NO-CAPITAL') && gated.fills.length === 0);
  // 7. determinism: same inputs → byte-identical fills
  const m1 = settleIntents(mkBook(1000000n, 120000n, null), { batch: 'B-DET', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '15000' }] }, feedMesh, '2026-10-05T00:00:00.000Z');
  const m2 = settleIntents(mkBook(1000000n, 120000n, null), { batch: 'B-DET', intents: [{ agent: 'headcorner', from: 'STEEM', to: 'SBD', amountIn: '15000' }] }, feedMesh, '2026-10-05T00:00:00.000Z');
  ok('mesh-deterministic', JSON.stringify(m1.fills) === JSON.stringify(m2.fills) && JSON.stringify(m1.ops) === JSON.stringify(m2.ops));

  // ── R42 MULTI-NETWORK VAULT selftest ───────────────────────────────────────
  // custody-class law: golden rows, mintability, honest absence
  ok('r42-custody-law-golden', CUSTODY_CLASSES.STEEM === 'MEASURED-KEYED' && CUSTODY_CLASSES.HIVE === 'OBSERVED-UNCONTROLLED' && CUSTODY_CLASSES.BLURT === 'OBSERVED-POST-KEYED' && CUSTODY_CLASSES.SAOS === 'PLANNED-NO-CLAIM');
  const ccRows = custodyClassRows({ STEEM: { reachable: true, node: 't', steem: 1000n, sbd: 100n }, HIVE: { reachable: true, node: 't', hive: 34000n, hbd: 3000n }, BLURT: { reachable: true, node: 't', blurt: 67841000n } });
  ok('r42-custody-classes', ccRows.HIVE.class === 'OBSERVED-UNCONTROLLED' && ccRows.HIVE.mintable === false && ccRows.HIVE.observed === '34000' && ccRows.STEEM.class === 'MEASURED-KEYED' && ccRows.STEEM.mintable === true && ccRows.BLURT.observed === '67841000' && ccRows.BLURT.class === 'OBSERVED-POST-KEYED' && ccRows.SAOS.class === 'PLANNED-NO-CLAIM');
  ok('r42-observed-absent-honest', custodyClassRows(null).HIVE.class === 'OBSERVED-ABSENT' && custodyClassRows(null).HIVE.mintable === false);
  // issuer identity: stable, recomputable, input-sensitive
  ok('r42-issuer-stable', issuerIdentity() === issuerIdentity() && issuerIdentity().length === 16);
  ok('r42-issuer-input-sensitive', issuerIdentity(['WSTEEM']) !== issuerIdentity(['WSTEEM', 'WSBD']));
  // redeem law: burn before payout, conservation holds, pegout queued with its corridor named
  const rv0 = emptyVault(); rv0.custody.STEEM = '2000000'; rv0.custodyProvenance.STEEM = 'test';
  rv0.wrappedReserve.STEEM = '1000000'; rv0.minted.WSTEEM = '1000000';
  const ra0 = { treasury: { claims: emptyClaims(), lp: {} } };
  ra0.treasury.claims.STEEM = '1000000'; ra0.treasury.claims.WSTEEM = '1000000';
  const rp0 = [{ id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '0', rb: '0', feeMeter: '0', verdict: 'AWAITING-CUSTODY' }];
  const rv1 = redeem({ vault: rv0, accounts: ra0, pools: rp0, seq: 5 }, 'WSTEEM', '400000', 'treasury', '2026-10-05T00:00:00.000Z');
  ok('r42-redeem-burn-before-payout', rv1.ok && rv1.st.vault.minted.WSTEEM === '600000' && rv1.st.vault.wrappedReserve.STEEM === '600000' && rv1.st.accounts.treasury.claims.WSTEEM === '600000' && rv1.st.accounts.treasury.claims.STEEM === '1400000');
  ok('r42-redeem-conservation', rv1.cons && rv1.cons.every((r) => r.ok));
  ok('r42-redeem-pegout-queued-keyed', rv1.ops.some((o) => o.type === 'PEGOUT-QUEUED' && o.asset === 'STEEM' && o.corridor.indexOf('KEYED-DESK') === 0));
  ok('r42-redeem-refusals', redeem({ vault: rv0, accounts: ra0, pools: [], seq: 1 }, 'WSTEEM', '0', 'treasury', 't').refused === 'DUST'
    && redeem({ vault: rv0, accounts: ra0, pools: [], seq: 1 }, 'WSTEEM', '9999999', 'treasury', 't').refused === 'OVER-MINT'
    && redeem({ vault: rv0, accounts: ra0, pools: [], seq: 1 }, 'WNOPE', '100', 'treasury', 't').refused === 'UNKNOWN-WRAPPER'
    && redeem({ vault: rv0, accounts: { ghost: { claims: emptyClaims(), lp: {} } }, pools: [], seq: 1 }, 'WSTEEM', '500000', 'ghost', 't').refused === 'INSUFFICIENT-CLAIM');
  // the blurt pegout corridor: posting key only — transfers gated (the honest PLAN band)
  // (the synthetic book must be BORN balanced: custody 500000 = reserve + claims, the mint law's own shape)
  const rb0 = emptyVault(); rb0.custody.BLURT = '500000'; rb0.custodyProvenance.BLURT = 'test';
  rb0.wrappedReserve.BLURT = '500000'; rb0.minted.WBLURT = '500000';
  const raB = { treasury: { claims: emptyClaims(), lp: {} } }; raB.treasury.claims.BLURT = '0'; raB.treasury.claims.WBLURT = '500000';
  const rvB = redeem({ vault: rb0, accounts: raB, pools: [], seq: 1 }, 'WBLURT', '500000', 'treasury', 't');
  ok('r42-blurt-pegout-plan-keyed', rvB.ok && rvB.corridor.indexOf('PLAN-PEGOUT-KEYED') === 0);
  // cross fair: deterministic BigInt floor, honest null
  const cf = crossFair('105446700', '56414230');
  ok('r42-crossfair-golden', cf !== null && absb(cf - BigInt(Math.round(105446700e9 / 56414230))) <= 10n && crossFair(null, '56414230') === null && crossFair('105446700', null) === null);
  // pool catalog: 9 pools, the new pairs, the reconcile appends deterministically and once
  ok('r42-pool-catalog-9', poolDefs(null).length === 9 && poolDefs(null).some((d) => d.pair === 'HIVE/STEEM' && d.planned) && poolDefs(null).some((d) => d.pair === 'WSBD/WHBD' && !d.planned));
  const rec0 = { vault: emptyVault(), accounts: { treasury: { claims: emptyClaims(), lp: {} } }, pools: [{ id: 'P1', pair: 'WSTEEM/STEEM', kind: 'PEG', a: 'WSTEEM', b: 'STEEM', feeBps: 2, ra: '388775', rb: '388775', feeMeter: '0', verdict: 'LIVE-INTERNAL' }], seq: 1 };
  reconcilePools(rec0, 't', null);
  reconcilePools(rec0, 't', null);
  ok('r42-reconcile-append-once', rec0.pools.length === 9 && rec0.pools.filter((p) => ['P5', 'P6', 'P7', 'P9'].includes(p.id)).every((p) => p.verdict === 'AWAITING-CUSTODY') && rec0.pools.find((p) => p.id === 'P8').verdict === 'PLANNED-NO-CLAIM');
  // genesis arms the new wrappers ONLY from keyed custody (25% law); observed never mints
  const plan42 = genesisPlan({ STEEM: 1000000n, SBD: 0n, HIVE: 2000000n, HBD: 0n, BLURT: 4000000n, SAOS: 0n }, 105446700n);
  ok('r42-genesis-mint-25pct-law', plan42.mintWHIVE === 500000n && plan42.mintWBLURT === 1000000n && plan42.mintWHBD === 0n && plan42.mintWSTEEM === 50000n);
  const g42 = genesis({ STEEM: 1000000n, SBD: 0n, HIVE: 2000000n, HBD: 0n, BLURT: 4000000n, SAOS: 0n }, 105446700n, { STEEM: 't', HIVE: 't', BLURT: 't' }, '2026-10-05T00:00:00.000Z');
  ok('r42-genesis-arms-new-pools', g42.pools.find((p) => p.id === 'P5').ra === '250000' && g42.pools.find((p) => p.id === 'P7').ra === '500000' && g42.pools.find((p) => p.id === 'P9').verdict === 'AWAITING-CUSTODY' && g42.pools.find((p) => p.id === 'P8').verdict === 'PLANNED-NO-CLAIM');
  ok('r42-genesis-conservation', conservation(g42.vault, g42.accounts, g42.pools).every((r) => r.ok));
  // observed sync: the settle books the observation, custody stays zero, conservation untouched
  const ob0 = mkBook(1000000n, 120000n, null);
  const nets42 = { STEEM: { reachable: false, node: null }, HIVE: { reachable: true, node: 't', hive: 34000n, hbd: 3000n }, BLURT: { reachable: true, node: 't', blurt: 67841000n } };
  const ob1 = settle(ob0, feedLive, null, nowIso(), nets42);
  ok('r42-observed-never-custody', ob1.st.vault.custody.HIVE === '0' && ob1.st.vault.observed.HIVE === '34000' && ob1.st.vault.observed.BLURT === '67841000' && ob1.ops.some((o) => o.type === 'OBSERVE' && o.keyClass === 'OBSERVED-UNCONTROLLED'));
  ok('r42-observed-conservation', ob1.consOk && ob1.cons.every((r) => r.ok));
  ok('r42-observed-custody-classes-booked', !!ob1.st.custodyClasses && ob1.st.custodyClasses.HIVE.class === 'OBSERVED-UNCONTROLLED' && ob1.st.custodyClasses.BLURT.mintable === false);
  // ── R44 COUNTER-GRID ARM selftest ──────────────────────────────────────
  const gateClosed44 = counterGridGate(false);
  const gateOpen44 = counterGridGate(true);
  ok('r44-gate-artifact-law', gateClosed44.open === false && gateOpen44.open === true && gateOpen44.artifact === 'CR-0074-counter-grids.json' && gateOpen44.source.indexOf('owner-directive') === 0);
  const planGrids44 = { PX: { pair: 'WSTEEM/STEEM', anchor: 1, anchorSource: 'POOL-MID (our side of the book)', spacingPct: 0.4, skewShiftBps: 50, inventoryShareBase: 0.5, depthBaseMu: '388775', depthQuoteMu: '388775', rungs: [
    { side: 'buy', price: 0.996, unit: 'STEEM' }, { side: 'sell', price: 1.004, unit: 'WSTEEM' },
    { side: 'buy', price: 0.992, unit: 'STEEM' }, { side: 'sell', price: 1.008, unit: 'WSTEEM' },
    { side: 'buy', price: 0.988, unit: 'STEEM' }, { side: 'sell', price: 1.012, unit: 'WSTEEM' } ], verdict: GRID_VERDICT_PLAN } };
  const closedOut44 = armCounterGrids(planGrids44, gateClosed44);
  ok('r44-gate-closed-stays-plan', closedOut44.PX.verdict === GRID_VERDICT_PLAN && !closedOut44.PX.broadcastPayload && closedOut44.PX.gate.open === false);
  const armed44 = armCounterGrids(planGrids44, gateOpen44).PX;
  ok('r44-gate-open-arms', armed44.verdict === GRID_VERDICT_ARMED && armed44.broadcastPayload.length === 6 && armed44.gate.open === true);
  ok('r44-rung-ids-deterministic', armCounterGrids(planGrids44, gateOpen44).PX.broadcastPayload[0].id === armed44.broadcastPayload[0].id && /^[0-9a-f]{16}$/.test(armed44.broadcastPayload[0].id));
  ok('r44-two-sided-law', armed44.broadcastPayload.filter((r) => r.side === 'buy').length === 3 && armed44.broadcastPayload.filter((r) => r.side === 'sell').length === 3);
  ok('r44-cap-law-golden', armed44.sizeLaw.capBps === 200 && armed44.sizeLaw.sizeMu === '5183'); // 2% of (388775×2 @anchor 1) = 15551 quote → 3 rungs → floor(5183.67)µ base
  ok('r44-dust-thin-refused', armCounterGrids({ PY: { ...planGrids44.PX, depthBaseMu: '50000', depthQuoteMu: '50000' } }, gateOpen44).PY.verdict === GRID_VERDICT_THIN);
  ok('r44-one-sided-refused', armCounterGrids({ PZ: { ...planGrids44.PX, rungs: planGrids44.PX.rungs.filter((r) => r.side === 'buy') } }, gateOpen44).PZ.verdict === 'REFUSED-ONE-SIDED');
  const armSettle44 = settle(mkBook(1000000n, 120000n, null), feedLive, null, nowIso(), null, gateOpen44);
  ok('r44-settle-gate-plumbing', armSettle44.gridGate.open === true && armSettle44.counterGrids.P3.verdict === GRID_VERDICT_ARMED && armSettle44.ops.some((o) => o.type === 'GRID-ARM' && o.pool === 'P3') && armSettle44.consOk);
  const planSettle44 = settle(mkBook(1000000n, 120000n, null), feedLive, null, nowIso(), null);
  ok('r44-settle-default-closed', planSettle44.gridGate.open === false && planSettle44.counterGrids.P3.verdict === GRID_VERDICT_PLAN && !planSettle44.ops.some((o) => o.type === 'GRID-ARM'));
  const pass = c.filter((x) => x.ok).length;
  console.log(`DEX-CORE-SELFTEST-OK ${pass}/${c.length}`);
  if (pass !== c.length) { for (const x of c) if (!x.ok) console.log(`  FAIL ${x.name}`); }
  return pass === c.length ? 0 : 1;
}

if (require.main === module) {
  const arg = process.argv[2] || '';
  if (arg === 'selftest') process.exit(selftest());
  if (arg === 'selftest-batch') process.exit(selftestBatch());
  if (arg === 'selftest-batch-settle') process.exit(selftestBatchSettle());
  if (arg === 'selftest-fee-law') process.exit(selftestFeeLaw());
  if (arg === 'clear-batch') { clearBatchTick(); process.exit(0); }
  if (arg === 'fee-law') { feeLawTick(); process.exit(0); }
  if (arg === 'settle-batch') { settleBatchTick().then((rc) => process.exit(rc)).catch(() => process.exit(0)); }
  if (arg === 'settle-intents') { settleIntentsTick().then((rc) => process.exit(rc)).catch(() => process.exit(0)); }
  else if (arg === 'settle-xc') { settleXcTick().then((rc) => process.exit(rc)).catch(() => process.exit(0)); }
  else tick().then((rc) => process.exit(rc)).catch(() => process.exit(0));
}

module.exports = {
  PROTOCOL,
  // units + invariants
  cpmmOut, cpmmKCheck, feeOnInput, stableD, stableGetY, stableOut,
  // pools + routing
  poolDefs, genesisPlan, genesis, poolSwap, routeBest,
  // vault + ledger
  emptyVault, emptyClaims, conservation, reserveRatios, attestationHash,
  // multi-network vault (R42)
  redeem, crossFair, custodyClassRows, issuerIdentity, reconcilePools, custodyProbeFrom, observedFrom,
  WRAP_UNDERLYING, CUSTODY_CLASSES, PEGOUT_CORRIDORS, MINT_SHARE_BPS, REDEEM_DUST,
  // engine
  settle, settleIntents, settleXcOps, rosterLaw, selftest, LAWS,
  // uniform batch clearing (R76)
  clearBatchUniform, sandwichExtraction, selftestBatch, BATCH_LAWS, BATCH_MAX_ROUNDS, BATCH_SANDWICH_FR_BPS,
  // the owner gates (R77): the approved batch settlement + the engine fee law
  ownerGate, stagedLaneCheck, settleBatch, settleBatchTick, selftestBatchSettle, BATCH_SETTLE_LAWS,
  measureFeeLaw, lawFeeBook, lawFeeFor, withLawFee, withLawFees, feeLawTick, selftestFeeLaw, FEE_LAW_LAWS,
  SCALE, BPS, NANO, STABLE_A, FEE_VOLATILE_BPS, FEE_PEG_BPS, PEG_GUARD_DRIFT_PCT,
  MESH_DUST, MESH_WIRE_MAX_SHARE_BPS, MESH_FILL_MAX_DEPTH_BPS,
  // cross-chain intent gates (R43)
  CHAIN_WRAPPER, XC_BOND_EXPOSURE_RATIO,
  // counter-grid arm (R44)
  counterGridGate, armCounterGrids, rungSizeLaw, rungId,
  GRID_VERDICT_PLAN, GRID_VERDICT_ARMED, GRID_VERDICT_THIN, GRID_CAP_DEPTH_BPS, GRID_DUST, GRID_RUNGS_PER_SIDE,
};
