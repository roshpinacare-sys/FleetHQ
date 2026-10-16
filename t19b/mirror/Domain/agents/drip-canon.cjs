#!/usr/bin/env node
/**
 * drip-canon.cjs — D2 FUEL CANON (Z-67, CR-0045)
 * Operator directive: "אוקי אז תשיג מה שצריך קדימה תמשיך" — acquire what is
 * needed: the sovereign's D2 drip-pacing verdict was flying on an ABSENT canon
 * (honest NO-DRIP-CANON receipts). This desk acquires the canon from the only
 * sovereign source that exists on CI: THE CHAIN ITSELF (keyless readback).
 *
 * LAWS (in code):
 *  1. OFFICIAL SOURCES ONLY: api.steemit.com (primary) + api.justyy.com
 *     (cross-check). >0.5% disagreement on remaining runway = SPLIT-BRAIN —
 *     NOTHING is written (the tick's dripPacing keeps its honest RECEIPT).
 *  2. THE MIXED-UNIT LAW (measured live Z-67, twice independently):
 *     condenser to_withdraw is denominated in GESTS (µ-VESTS, ÷1e6) while
 *     vesting_withdraw_rate is in VESTS — measured: remaining 1,903,529,118.972142
 *     raw → 1903.529118 SP (matches the fleet's measured 1903.31 + drip days),
 *     rate raw → 475.88228 SP/wk (matches measured 475.852 SP/wk). Sanity clamp:
 *     remaining SP > total vesting SP ⇒ UNVERIFIED, nothing written.
 *  3. SINGLE WRITER: this desk writes ONLY agents/sovereign-drip.json
 *     (atomic tmp+rename). The tick stays zero-network (CR-0033 family law):
 *     it READS this canon via SOVEREIGN_DRIP_JSON.
 *  4. FAIL-SOFT EXIT 0, FAIL-LOUD BOOK: every outcome prints a receipt line;
 *     eval off-switch DRIP_CANON_SKIP=1 does nothing (zero writes, zero network).
 *  5. KEYLESS: read-only condenser calls; no secrets, nothing signed.
 *
 * Env:
 *   DRIP_CANON_JSON      output path (default agents/sovereign-drip.json)
 *   DRIP_CANON_ACCOUNT   default headcorner (or MARKET_EXEC_HEAD)
 *   DRIP_CANON_SKIP=1    eval off-switch
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.DRIP_CANON_JSON || path.join(ROOT, 'agents', 'sovereign-drip.json');
const ACCOUNT = process.env.DRIP_CANON_ACCOUNT || process.env.MARKET_EXEC_HEAD || 'headcorner';
const NODE_PRIMARY = 'https://api.steemit.com';
const NODE_CROSS = 'https://api.justyy.com';

// ── pure core (exported for E36) ─────────────────────────────────────────────
function vestsToSp(vestsRaw, gp) {
  const vf = parseFloat(gp.total_vesting_fund_steem);
  const vs = parseFloat(gp.total_vesting_shares);
  if (!isFinite(vf) || !isFinite(vs) || vs <= 0) return null;
  return vestsRaw * vf / vs;
}
// THE MIXED-UNIT LAW: to_withdraw arrives in GESTS (µ-VESTS) — ÷1e6 before SP.
function dripCanonOf(acc, gp) {
  const vestingSp = vestsToSp(parseFloat(acc.vesting_shares), gp);
  const weeklySp = vestsToSp(parseFloat(acc.vesting_withdraw_rate), gp); // rate: VESTS
  const remainingSp = vestsToSp(parseFloat(acc.to_withdraw) / 1e6, gp);  // to_withdraw: GESTS
  if (vestingSp == null || weeklySp == null || remainingSp == null) return { unverified: true, reason: 'gp-unreadable' };
  if (!(weeklySp > 0) || !(remainingSp >= 0)) return { unverified: true, reason: 'nonpositive-drip' };
  if (remainingSp > vestingSp * 1.01) return { unverified: true, reason: 'unit-clamp: remaining ' + remainingSp.toFixed(3) + ' SP > total vesting ' + vestingSp.toFixed(3) + ' SP (the mixed-unit law would be violated)' };
  const dailySp = weeklySp / 7;
  return {
    account: acc.name,
    vesting_sp: +vestingSp.toFixed(6),
    weekly_sp: +weeklySp.toFixed(6),
    daily_sp: +dailySp.toFixed(6),
    remaining_sp: +remainingSp.toFixed(6),
    runway_days: +((remainingSp / dailySp)).toFixed(1),
    next_vesting_withdrawal: acc.next_vesting_withdrawal || null,
  };
}

function rpc(node, body) {
  return new Promise((res, rej) => {
    const r = https.request(node, { method: 'POST', headers: { 'content-type': 'application/json' } }, (x) => {
      let b = ''; x.on('data', (c) => { b += c; });
      x.on('end', () => { try { res(JSON.parse(b).result); } catch (e) { rej(e); } });
    });
    r.on('error', rej); r.setTimeout(15000, () => { r.destroy(new Error('timeout ' + node)); });
    r.end(JSON.stringify(body));
  });
}

async function fetchCanon(node) {
  const [acc] = await rpc(node, { jsonrpc: '2.0', method: 'condenser_api.get_accounts', params: [[ACCOUNT]], id: 1 });
  if (!acc) throw new Error('account-unreadable on ' + node);
  const gp = await rpc(node, { jsonrpc: '2.0', method: 'condenser_api.get_dynamic_global_properties', params: [], id: 2 });
  const c = dripCanonOf(acc, gp);
  if (c.unverified) throw new Error(c.reason);
  return c;
}

async function main() {
  if (String(process.env.DRIP_CANON_SKIP || '') === '1') { console.log('[drip-canon] SKIP: eval-context off-switch, zero writes'); return; }
  let primary = null, cross = null, crossErr = null;
  try { primary = await fetchCanon(NODE_PRIMARY); } catch (e) {
    console.log('[drip-canon] RECEIPT: primary node unreadable (' + String(e.message).slice(0, 80) + ') — canon not written, tick keeps its honest receipt');
    return;
  }
  try { cross = await fetchCanon(NODE_CROSS); } catch (e) { crossErr = String(e.message).slice(0, 80); }
  if (cross) {
    const d = Math.abs(primary.remaining_sp - cross.remaining_sp) / Math.max(primary.remaining_sp, 1e-9) * 100;
    if (d > 0.5) { console.log('[drip-canon] SPLIT-BRAIN: remaining runway disagrees ' + d.toFixed(3) + '% across nodes — nothing written'); return; }
  }
  const canon = {
    protocol: 'SAOS-DRIP-CANON/1',
    at: new Date().toISOString(),
    ...primary,
    cross_node: cross
      ? { ok: true, d_remaining_pct: +(Math.abs(primary.remaining_sp - cross.remaining_sp) / primary.remaining_sp * 100).toFixed(4) }
      : { ok: false, warn: crossErr || 'unreadable' },
    unit_law: 'to_withdraw GESTS (µ-VESTS ÷1e6) · vesting_withdraw_rate VESTS — measured live twice (1903.529118 SP remaining · 475.88228 SP/wk rate)',
    source: { primary: NODE_PRIMARY, cross: NODE_CROSS, api: 'condenser_api.get_accounts + get_dynamic_global_properties', keyless: true },
  };
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(canon, null, 1) + '\n');
  fs.renameSync(tmp, OUT);
  console.log('[drip-canon] CANON: remaining ' + canon.remaining_sp + ' SP · ' + canon.daily_sp + ' SP/day · runway ' + canon.runway_days + 'd · next payout ' + canon.next_vesting_withdrawal + ' → ' + path.relative(ROOT, OUT));
}

module.exports = { vestsToSp, dripCanonOf, OUT, ACCOUNT };
if (require.main === module) main().catch((e) => { console.log('[drip-canon] RECEIPT (fail-soft): ' + String(e.message).slice(0, 120)); process.exit(0); });
