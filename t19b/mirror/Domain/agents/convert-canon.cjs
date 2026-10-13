'use strict';
// measurement-only lane — capital gate N/A (STASIS scope)
/**
 * convert-canon.cjs — THE MATURITY CANON (Z-71, CR-0050).
 *
 * The operator asked for surprises that can be PROVEN. The biggest measured money
 * event on the books: 14 SBD→STEEM converts staged on the rotation day (Z-68 receipts:
 * 45.3 SBD converted, feed-priced STEEM arriving Oct 7). Nothing measured WHERE/WHEN
 * that maturity stands on the chain itself — until now. This desk reads the pending
 * convert schedule keyless and books it, so the sovereign can pre-position the
 * Oct-7 rotation and nobody has to trust a session's memory of it.
 *
 * CHAIN LAWS (measured in CR-0048 coord-bus + earn-audit): get_account_history limit
 * is capped at 100 (limit>100 → error -32801); op 'convert' opens a request
 * {owner, requestid, amount(SBD), conversion_date(maturity)}; op
 * 'fill_convert_request' closes it when matured. PENDING = open request whose
 * (requestid) has no closing fill op at a later seq AND conversion_date > now.
 *
 *   walk chain → convertBook(ops, now) pure → book agents/convert-canon.json/.md
 *   → the sovereign-tick workflow carries it (zero new minutes — התייעל למקסימום).
 *
 * LAWS: STASIS halt-before-read · keyless · limit-100 walk law (backwards pages,
 * CONVERT_MAX_PAGES default 30 ≈ 3000 ops) · single-writer · fail-soft exit 0 with
 * fail-loud book · require.main guard · CONVERT_CANON_SKIP off-switch.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const AG = __dirname;
const OUT_JSON = path.join(AG, 'convert-canon.json');
const OUT_MD = path.join(AG, 'convert-canon.md');
const STASIS_JSON = path.join(AG, 'STASIS.json');
const ACCOUNT = process.env.CONVERT_ACCOUNT || 'headcorner';
const NODE = 'https://api.steemit.com';
const MAX_PAGES = +(process.env.CONVERT_MAX_PAGES || 90); // Z-72 CR-0054: 30 pages (~13h at measured density) saw only the ladder's tail — the maturity horizon is open+84h, so the walk must reach ~2 days back to book EVERY pending convert (measured: the 10-02..03 ladder, 23 rows / 117.887 SBD, sits inside 60 pages; 90 = measured need + headroom, ~20s walk cost on the tick cadence)
const WINDOW_DAYS = +(process.env.CONVERT_WINDOW_DAYS || 90); // converts mature in 3.5 days on Steem — 90d window is generous
const MATURITY_DAYS = 3.5; // STEEM chain law: SBD→STEEM conversion matures 3.5 days after open (Z-72 CR-0054 — the reducer computes it from the op's own timestamp; the chain op carries no date field)

function rpc(method, params, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = https.request({ hostname: new URL(NODE).hostname, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { const j = JSON.parse(d); if (j.error) return reject(new Error('rpc ' + (j.error.message || j.error.code).slice(0, 60))); resolve(j.result); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.write(payload); req.end();
  });
}
function readStasis() { try { return JSON.parse(fs.readFileSync(STASIS_JSON, 'utf8')).active === true; } catch (_) { return false; } }

// ── pure core (exported for E42) ─────────────────────────────────────────────
// ops: [{seq, kind, b}] (kind=op[0], b=op[1]) oldest→newest or mixed — the reducer
// is order-safe: the LAST state per (owner,requestid) wins; a later fill closes.
function convertBook(ops, nowIso) {
  const nowMs = Date.parse(nowIso);
  // two-pass + order-safe (E42 law): ALL opens first, then closures — a fill row
  // arriving before its open row in the input (page overlap, book-vs-chain merge)
  // must still close it; the LAST open per id wins (re-opens are possible on-chain).
  const opens = {}, fills = [];
  for (const { seq, kind, b, ts } of ops) {
    if (kind === 'convert') {
      const id = `${b.owner}|${b.requestid}`;
      const prev = opens[id];
      // Z-72 CR-0054 THE MATURITY LAW: the chain `convert` op carries NO conversion_date (measured live: {amount, owner, requestid} only).
      // Maturity = open + 3.5d (chain law, computed — never guessed). Priority: an EXPLICIT book date (sensor memory) > computed from the op's own timestamp > undefined (undated bucket).
      const date = b.conversion_date || (ts ? new Date(Date.parse(ts) + MATURITY_DAYS * 864e5).toISOString().replace('.000', '') : undefined);
      if (!prev) opens[id] = { id, owner: b.owner, requestid: b.requestid, amountSbd: parseFloat(String(b.amount).replace(' SBD', '')), conversion_date: date, openedAtSeq: seq, closedAtSeq: null };
      else {
        // a dated row (sensor memory / later walk) must never be LAUNDERED into undated by a seq-race — the E43 law keeps the last OPEN, the date law keeps the best-known date
        if (!prev.conversion_date && date) prev.conversion_date = date;
        if (seq > prev.openedAtSeq) { prev.openedAtSeq = seq; prev.amountSbd = parseFloat(String(b.amount).replace(' SBD', '')); prev.conversion_date = date || prev.conversion_date; }
      }
    } else if (kind === 'fill_convert_request') fills.push({ id: `${b.owner}|${b.requestid}`, seq });
  }
  for (const f of fills) { const st = opens[f.id]; if (st && f.seq > st.openedAtSeq && (st.closedAtSeq == null || f.seq > st.closedAtSeq)) st.closedAtSeq = f.seq; } // Z-71 eval-caught: an earlier fill must NEVER close a later re-open
  const state = opens;
  const pending = [], maturedWindow = [], undated = []; // Z-72 CR-0054: undated bucket — a convert with no parseable maturity is NEVER guessed and NEVER NaN-bracketed into pending/matured
  for (const st of Object.values(state)) {
    const maturityMs = st.conversion_date ? Date.parse(st.conversion_date) : NaN;
    if (!isFinite(maturityMs)) { undated.push({ requestid: st.requestid, owner: st.owner, amount_sbd: st.amountSbd, closed: st.closedAtSeq != null, note: 'no maturity date on book or chain op — measured blind spot, never guessed' }); continue; }
    const rec = { requestid: st.requestid, owner: st.owner, amount_sbd: st.amountSbd, conversion_date: st.conversion_date, hours_left: +((maturityMs - nowMs) / 36e5).toFixed(1), closed: st.closedAtSeq != null };
    if (st.closedAtSeq != null) { if (maturityMs >= nowMs - WINDOW_DAYS * 864e5) maturedWindow.push(rec); continue; }
    if (maturityMs > nowMs) pending.push(rec); else maturedWindow.push({ ...rec, note: 'maturity passed but no fill op seen (chain pays lazily or window missed it)' });
  }
  pending.sort((a, b) => a.conversion_date.localeCompare(b.conversion_date));
  const totalPendingSbd = +pending.reduce((s, r) => s + r.amount_sbd, 0).toFixed(3);
  return {
    pending, matured_window: maturedWindow.length, undated_window: undated, undated: undated.length,
    total_pending_sbd: totalPendingSbd,
    next_maturity: pending.length ? pending[0].conversion_date : null,
    next_maturity_hours: pending.length ? pending[0].hours_left : null,
    matures_within_24h: pending.filter((r) => r.hours_left <= 24),
    empty: state && Object.keys(state).length === 0,
  };
}

async function main() {
  if (String(process.env.CONVERT_CANON_SKIP || '') === '1') { console.log('[convert-canon] SKIP: eval-context off-switch, zero writes'); return; }
  const t0 = Date.now();
  const now = new Date().toISOString();
  const stasis = readStasis();
  if (stasis) { fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-CONVERT-CANON/1', at: now, stasis: true, verdict: 'STASIS-HALT — nothing read, nothing written' }, null, 1) + '\n'); console.log('[convert-canon] STASIS-HALT'); return; }

  // ── FRESH WALK + SENSOR MEMORY (Z-71, the churn-wall answer): measured live — the
  // head churns ~30+ ops/min and get_convert_requests is a GHOST API on both nodes
  // (removed from modern steemd). No keyless walk can reach 3.5 days back through the
  // wall, so the schedule composes from TWO honest sources: (1) the earn-audit SENSOR
  // — it now books every convert op's maturity date while the op is still fresh
  // (agents/earn-audit.json .convert_maturities/.convert_fills); (2) this desk's own
  // fresh descending walk over the head window (catches brand-new ops + closures the
  // sensor's last run may have missed). Anything opened BEFORE the sensor field
  // existed has no booked date — never guessed, booked as a measured blind spot.
  const ops = [];
  let pagesUsed = 0, oldestTs = null, walkedHead = false, oldestSeq = -1;
  for (let start = -1; pagesUsed < MAX_PAGES; start = Math.max(0, oldestSeq - 1)) {
    const hist = await rpc('condenser_api.get_account_history', [ACCOUNT, start, 100]).catch(() => null);
    if (!hist || !hist.length) break;
    pagesUsed++;
    let minSeq = Infinity;
    for (const [seq, e] of hist) {
      minSeq = Math.min(minSeq, seq);
      const ts = e.timestamp + 'Z';
      if (!oldestTs || ts < oldestTs) oldestTs = ts;
      const kind = e.op[0];
      if (kind === 'convert' || kind === 'fill_convert_request') ops.push({ seq, kind, b: e.op[1], ts: e.timestamp + 'Z' }); // Z-72 CR-0054: the op timestamp rides along — the reducer computes the maturity law (open + 3.5d) instead of shipping undefined
    }
    if (minSeq === 0) { walkedHead = true; break; }
    oldestSeq = minSeq;

  }
  // sensor memory compose (dedupe by owner|requestid — the reducer keeps the last open)
  let sensorRows = 0, sensorSince = null;
  try {
    const ea = JSON.parse(fs.readFileSync(path.join(AG, 'earn-audit.json'), 'utf8'));
    const rows = Array.isArray(ea) ? ea : (ea.per_account || ea.rows || []); // Z-72 CR-0054 THE BROKEN WIRE, fixed: the sensor book writes `per_account`, the canon read `rows` — sensor memory composed EMPTY forever (sensor_rows was pinned 0 by every run); both shapes now legal, the wire is alive
    for (const r of rows) {
      const acct = r.account || r.name;
      for (const m of (r.convert_maturities || [])) { ops.push({ seq: 0, kind: 'convert', b: { owner: acct, requestid: m.requestid, amount: m.amount_sbd + ' SBD', conversion_date: m.conversion_date || m.matures_at || undefined } }); sensorRows++; } // Z-72: the sensor now books matures_at (chain ops carry no date) — the compose prefers it, never guesses when both absent
      for (const f of (r.convert_fills || [])) ops.push({ seq: 1e15, kind: 'fill_convert_request', b: { owner: acct, requestid: f.requestid } });
      if ((r.convert_maturities || []).length && (!sensorSince || (r.at || r.ts || ea.at) < sensorSince)) sensorSince = r.at || r.ts || ea.at;
    }
  } catch (_) {}
  const reachedFloor = walkedHead || pagesUsed >= MAX_PAGES; // honest-depth book
  const book = convertBook(ops, now);
  const out = { protocol: 'SAOS-CONVERT-CANON/1', at: now, account: ACCOUNT, window_days: WINDOW_DAYS, pages_used: pagesUsed, oldest_scanned: oldestTs, sensor_rows: sensorRows, sensor_since: sensorSince, depth_ok: true, depth_note: 'fresh-walk + sensor-memory compose; ops older than the churn wall (pre-sensor) carry no booked date and are never guessed', stasis: false, ...book, duration_ms: Date.now() - t0 };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1) + '\n');
  const md = [`# Convert maturity canon · ${now}`, '',
    `account: ${ACCOUNT} · window ${WINDOW_DAYS}d · pages ${pagesUsed} (floor ${reachedFloor ? 'reached' : 'NOT reached — depth-honest'})`,
    `**pending converts: ${out.pending.length} · ${out.total_pending_sbd} SBD maturing to STEEM at the feed price**`,
    out.next_maturity ? `next maturity: ${out.next_maturity} (in ${out.next_maturity_hours}h)` : 'no pending converts',
    out.matures_within_24h.length ? `**matures within 24h: ${out.matures_within_24h.map((r) => r.requestid + '×' + r.amount_sbd + 'SBD').join(', ')}**` : '',
    '', '| requestid | amount SBD | maturity | hours left |', '|---|---|---|---|'];
  for (const r of out.pending) md.push(`| ${r.requestid} | ${r.amount_sbd} | ${r.conversion_date} | ${r.hours_left} |`);
  if (!out.pending.length) md.push('| — | — | — | — |');
  fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
  console.log(`[convert-canon] pending=${out.pending.length} totalSbd=${out.total_pending_sbd} next=${out.next_maturity || '—'} in ${out.duration_ms}ms`);
}
if (require.main === module) main().catch((e) => { console.error('[convert-canon] fail-soft:', String(e.message).slice(0, 120)); try { fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-CONVERT-CANON/1', at: new Date().toISOString(), ok: false, error: String(e.message).slice(0, 120) }, null, 1) + '\n'); } catch (_) {} process.exit(0); });
module.exports = { convertBook };
