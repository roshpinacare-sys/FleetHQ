'use strict';
/**
 * sovereign-trade.cjs — R33 THE SOVEREIGN HANDS (CR-0063).
 *
 * The owner moved the last gate: "אין יותר נשאר בידיים שלי! יש ריבונות
 * להעביר לידיים של הריבונות" — nothing is left in the owner's hands; the
 * sovereignty owns its own trading cadence. This desk is that cadence leg:
 * ONE invocation = ONE decision = ZERO new accounting. It arms the EXISTING
 * reflex (CR-0039 market-cycle: fill-ledger → decideCycle → CR-0036 executor)
 * and then refreshes the verdict book (pnl-book.cjs). It computes nothing
 * about markets and signs nothing itself.
 *
 * LAWS (in code):
 *  1. LOCAL HANDS: runs where the derived-keys vault lives (the sandbox floor).
 *     Without the vault it books VAULT-ABSENT-LOCAL, spawns NOTHING (no
 *     network, no signatures) and exits 0 — the honest answer of a CI run.
 *  2. STASIS FIRST: the breaker beats the hands (FATE-DEFENSE #1).
 *  3. COOLDOWN: at most one LIVE arm per SOVEREIGN_COOLDOWN_MIN (default 15)
 *     — measured from the last LIVE row in this desk's own canon; a denied
 *     arm is a booked row, not a silent skip.
 *  4. MODE LAW: SOVEREIGN_TRADE_LIVE=1 is the only path to a LIVE arm; even
 *     then the CHILD decides (market-cycle's decideCycle may DRY/SKIP — the
 *     ledger's recycle law rules; the executor's STACK-EXISTS + caps + band +
 *     BUY-EDGE laws hold inside the child).
 *  5. VAULT PRESENCE ONLY: this desk checks presence, never reads key material
 *     and never verifies authority — the verify-then-sign law (on-chain pubkey
 *     compare) stays inside market-exec, the only signing surface.
 *  6. CHILD SEPARATION: fresh child processes with their own canons; this desk
 *     writes ONLY its own two book files (single writer).
 *  7. EVAL-CONTEXT OFF-SWITCH: SOVEREIGN_TRADE_SKIP=1 → decision-only row
 *     (SKIPPED-EVAL-CONTEXT), zero children (E56 exercises exactly this).
 *  8. FAIL-SOFT EXIT, FAIL-LOUD BOOK: child failure is a booked ERROR row,
 *     not a crash; exit 0 always (treasury law). require.main guard (Z-49).
 *  9. SINGLE WRITER: agents/sovereign-trade.json + agents/sovereign-trade.md.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.SOVEREIGN_TRADE_JSON || path.join(ROOT, 'agents', 'sovereign-trade.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');
const HC_DERIVED = process.env.HC_DERIVED || '/home/z/my-project/.fleet/headcorner-derived.json';
const COOLDOWN_MIN = +(process.env.SOVEREIGN_COOLDOWN_MIN || 10); // R34: calibrated to the measured fill cadence (~1 fill/12min)

// ── pure core (exported for E56) ─────────────────────────────────────────────
// decideTrade: the sovereignty's one decision per invocation.
function decideTrade({ stasis, vaultPresent, cooldownOk, live, skipFetch }) {
  if (skipFetch) return { arm: 'SKIP', reason: 'SKIPPED-EVAL-CONTEXT (SOVEREIGN_TRADE_SKIP=1 — decision-only, zero children)' };
  if (stasis) return { arm: 'SKIP', reason: 'STASIS-BRAKE (המפסק פעיל — הידיים כבולות בכוונה)' };
  if (!vaultPresent) return { arm: 'SKIP', reason: 'VAULT-ABSENT-LOCAL (הידיים החתומות חיות רק איפה שה-vault חי — ריצת CI עונה בכנות ולא נוגעת בכלום)' };
  if (!live) return { arm: 'DRY', reason: 'MODE-DRY (SOVEREIGN_TRADE_LIVE unset — קבלת-פלאנינג בלבד, אפס חתימות)' };
  if (!cooldownOk) return { arm: 'DRY', reason: 'COOLDOWN (זרוע LIVE ב-' + COOLDOWN_MIN + ' הדקות האחרונות — קבלת-פלאנינג בלבד)' };
  return { arm: 'LIVE', reason: 'SOVEREIGN-CADENCE-ARMED (הריבונות מחזיקה את הגלגל — הרפלקס חי, חוקי ה-child שולטים בפנים)' };
}

// vault presence check (law 5): presence only — key material is never read here.
function vaultPresent(file = HC_DERIVED) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const s = j && j.steem;
    return !!(s && s.active);
  } catch (_) { return false; }
}

function readCanon() { try { const j = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); return Array.isArray(j) ? j : (j.rows || []); } catch (_) { return []; } }
function writeCanon(rows) { fs.writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2) + '\n'); }

function lastLiveAt(rows) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].arm === 'LIVE' && rows[i].ts) return rows[i].ts;
  return null;
}

function childTail(r) {
  const t = String((r && (r.stdout || '')) || '').trim().split('\n').filter(Boolean).pop() || '';
  return t.slice(0, 220);
}

function writeMd(row) {
  const L = [];
  L.push('# sovereign-trade — ידי הריבונות (CR-0063)');
  L.push('');
  L.push(`ריצה אחרונה: ${row.ts} · זרוע **${row.arm}** · ילדים: market-cycle **${row.children && row.children.marketCycle ? row.children.marketCycle.status : '—'}** · pnl-book **${row.children && row.children.pnlBook ? row.children.pnlBook.status : '—'}**`);
  L.push('');
  L.push(`החלטה: ${row.reason || '—'}`);
  L.push('');
  if (row.children && row.children.marketCycle && row.children.marketCycle.tail) L.push(`market-cycle: ${row.children.marketCycle.tail}`);
  if (row.children && row.children.pnlBook && row.children.pnlBook.tail) L.push(`pnl-book: ${row.children.pnlBook.tail}`);
  L.push('');
  L.push(`## שגיאות (${row.errors.length})`);
  for (const e of row.errors) L.push(`- ${e}`);
  L.push('');
  L.push('חוק הידיים: הריבונות מחזיקה את הקצב מקומית (איפה שה-vault חי); החוקים החתומים — verify-then-sign, caps, band, STACK-EXISTS, BUY-EDGE — חיים בתוך ה-child, לעולם לא כאן. ריצה אחת = החלטה אחת = אפס חשבונאות חדשה.');
  fs.writeFileSync(OUT_MD, L.join('\n') + '\n');
}

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const t0 = Date.now();
  const skip = String(process.env.SOVEREIGN_TRADE_SKIP || '') === '1';
  const live = String(process.env.SOVEREIGN_TRADE_LIVE || '') === '1';
  const stasis = (() => { try { const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'STASIS.json'), 'utf8')); return !!(s && (s.active || s.on)); } catch (_) { return false; } })();
  const canon = readCanon();
  const la = lastLiveAt(canon);
  const cooldownOk = !la || (Date.now() - Date.parse(la)) >= COOLDOWN_MIN * 60000;
  const vault = vaultPresent();
  const d = decideTrade({ stasis, vaultPresent: vault, cooldownOk, live, skipFetch: skip });
  const row = {
    ts: new Date().toISOString(), arm: d.arm, reason: d.reason,
    cooldown: { min: COOLDOWN_MIN, lastLiveAt: la, ok: cooldownOk },
    vault: { path: HC_DERIVED.replace(/^\/home\/[^/]+/, '~'), present: vault },
    children: { marketCycle: null, pnlBook: null }, errors: [], run_index: canon.length + 1,
  };
  if (d.arm !== 'SKIP') {
    try {
      const envMC = { ...process.env };
      if (d.arm === 'LIVE') envMC.MARKET_CYCLE_LIVE = '1'; else delete envMC.MARKET_CYCLE_LIVE;
      // the sovereign loop always carries the EDGE-CURE arm into the reflex (the
      // cure itself fires only inside a LIVE executor run — law 11 of CR-0036)
      envMC.MARKET_EXEC_CURE = '1';
      const mc = spawnSync(process.execPath, [path.join(ROOT, 'agents', 'market-cycle.cjs')], { env: envMC, cwd: ROOT, timeout: 180000, encoding: 'utf8' });
      row.children.marketCycle = { status: mc.status === 0 ? 'OK' : 'EXIT-' + mc.status, tail: childTail(mc) };
    } catch (e) { row.errors.push('market-cycle child: ' + String(e.message || e).slice(0, 120)); }
    try {
      const pb = spawnSync(process.execPath, [path.join(ROOT, 'agents', 'pnl-book.cjs')], { env: process.env, cwd: ROOT, timeout: 120000, encoding: 'utf8' });
      row.children.pnlBook = { status: pb.status === 0 ? 'OK' : 'EXIT-' + pb.status, tail: childTail(pb) };
    } catch (e) { row.errors.push('pnl-book child: ' + String(e.message || e).slice(0, 120)); }
  }
  row.duration_ms = Date.now() - t0;
  canon.push(row);
  writeCanon(canon);
  writeMd(row);
  console.log(`[sovereign-trade] arm=${row.arm} children=${row.children.marketCycle ? row.children.marketCycle.status : 'none'}/${row.children.pnlBook ? row.children.pnlBook.status : 'none'} errors=${row.errors.length} in ${row.duration_ms}ms`);
}
if (require.main === module) {
  try { main(); } catch (e) { console.error('[sovereign-trade] FATAL', String(e.message || e).slice(0, 200)); process.exit(0); }
} else {
  module.exports = { decideTrade, vaultPresent, lastLiveAt, COOLDOWN_MIN, HC_DERIVED, OUT_JSON };
}
