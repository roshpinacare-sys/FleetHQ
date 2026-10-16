/**
 * FEE-DOCTRINE-LAW (R22, CR-0051) — the pure arbitration core for cross-layer C1.
 *
 * THE LAW: same fleet, many venues, one REGISTERED book (agents/fee-doctrine.json).
 * The convergence check refuses ANONYMOUS drift (two FEE_BPS with no registered rule)
 * but accepts GOVERNED per-venue pricing: the book pins every venue's constants and the
 * pricing rule (each leg priced by the venue it stands on). The book must TRACK REALITY:
 * any number in the book that disagrees with the measured source returns DRIFT — a law
 * that lies is worse than no law.
 *
 * pure · deterministic · fail-soft (null/missing book → un-arbitrated)
 */
function feeArbitration(doctrine, measured) {
  const m = measured || {};
  const drift = (m.dexFeeBps != null && m.exchFeeBps != null) ? (m.dexFeeBps - m.exchFeeBps) : null;
  if (drift === 0) return { verdict: 'PASS', arbitration: null, note: 'venues agree — no arbitration needed' };
  if (drift == null) return { verdict: 'FAIL', arbitration: null, note: 'measured sources missing — nothing to arbitrate' };
  if (!doctrine || !Array.isArray(doctrine.venues)) {
    return { verdict: 'DRIFT', arbitration: 'un-arbitrated: agents/fee-doctrine.json missing or malformed', note: 'same fleet, two prices, no registered rule' };
  }
  const kv = (id, key) => { const v = doctrine.venues.find((x) => x && x.id === id); return v ? v[key] : null; };
  const dDex = kv('saos-dex-kernel', 'feeBpsSource');
  const dExch = kv('saos-exchange-evm', 'feeBpsSource');
  const dFloor = kv('chains-internal-markets', 'spacingFloorBps');
  const matches = dDex === m.dexFeeBps && dExch === m.exchFeeBps && (dFloor === m.floorBps || dFloor == null);
  if (matches) {
    return {
      verdict: 'PASS-ARBITRATED',
      arbitration: 'registered: per-venue pricing by agents/fee-doctrine.json',
      note: 'the book matches the measured sources — the drift is governed',
    };
  }
  return {
    verdict: 'DRIFT',
    arbitration: 'book-reality mismatch: fee-doctrine.json disagrees with the measured sources (book dex=' + dDex + ' exch=' + dExch + ' floor=' + dFloor + ' vs measured dex=' + m.dexFeeBps + ' exch=' + m.exchFeeBps + ' floor=' + m.floorBps + ')',
    note: 'a law that lies is worse than no law — fix the book or the source',
  };
}
module.exports = { feeArbitration };
