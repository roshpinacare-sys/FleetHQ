#!/usr/bin/env node
/**
 * grid-doctor — the fleet truth machine (read-only, no keys, no broadcasts).
 *
 * Purpose (owner directive 2026-10-11, trace 1a1…89d5): the grid must
 * always treat itself according to its CURRENT state — measured from live chain
 * RPCs, never from self-reports or simulation books. Phantom numbers found in a
 * parallel agent's "verified" plan (3676 SP claimed vs 5.93 SP live on
 * headcorner) are exactly the disease this machine cures.
 *
 * Lane: measurement-only. STASIS explicitly keeps measurement lanes running.
 * Outputs:
 *   agents/grid-truth.json          — machine book (append-per-run schema, latest wins)
 *   agents/grid-truth.md            — human book with per-account table + alerts
 *   agents/grid-truth-history.jsonl — append-only compact history (drift math + training)
 * v2 certainty layer (owner directive: verify, train, refine until certain):
 *   + DRIFT alerts — per-account liquid/power delta vs previous committed snapshot
 *   + open-order measurement (condenser_api.get_open_orders) — locked funds are measured,
 *     not guessed; TREASURY-UNDERFLOOR now discounts locked funds before alarming
 *   + PHANTOM-CLAIM reconciliation — roster.claims holds numbers asserted by plans/books;
 *     anything that contradicts live chain is flagged as phantom (the 4001-SP disease)
 * Alert kinds:
 *   ACCOUNT-MISSING | VP-EMPTY | VP-LOW | INACTIVE | STRANDED-CAPITAL |
 *   TREASURY-UNDERFLOOR | RPC-DEAD | DRIFT-LIQUID | DRIFT-POWER | PHANTOM-CLAIM
 * Exit code: always 0 (observability must never be gated) — alerts are in the book.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const AG = __dirname;
const ROSTER = JSON.parse(fs.readFileSync(path.join(AG, 'grid-roster.json'), 'utf8'));
const OUT_JSON = path.join(AG, 'grid-truth.json');
const OUT_MD = path.join(AG, 'grid-truth.md');
const UA = 'saos-grid-doctor/1 (+https://github.com/roshpinacare-sys)';

function nowIso() { return new Date().toISOString(); }

async function rpc(chain, base, method, params, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: ctl.signal
    });
    const j = await res.json();
    if (j && j.error) throw new Error('rpc-error: ' + JSON.stringify(j.error).slice(0, 140));
    return j.result;
  } finally { clearTimeout(t); }
}

function vestsToToken(v) { return Number(String(v).split(' ')[0]) / 1e6; }
// v2.2.1: robust asset number — handles legacy "123.456 HIVE" strings, NAI
// objects {amount, precision}, raw numbers; NaN on garbage (never lies).
function assetNum(v) {
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v.trim().split(/\s+/)[0]); return Number.isFinite(n) ? n : NaN; }
  if (typeof v === 'object') {
    if (v.amount !== undefined) { const p = Math.pow(10, Number(v.precision || 0)); const n = Number(v.amount) / p; return Number.isFinite(n) ? n : NaN; }
    return NaN;
  }
  return NaN;
}
function tok(v) { const n = assetNum(v); return Number.isFinite(n) ? n : 0; }
function r3(x) { return Math.round(x * 1000) / 1000; }

// ---- v2.2: REAL vests->SP conversion ----
// DISEASE FIXED (owner directive: verify, train, refine): the naive vests/1e6
// conversion reported the fleet as ~7 SP when the chain holds ~4,345 SP.
// 1 SP = total_vesting_shares / total_vesting_fund_steem vests (measured
// 2026-10-11: 1612 vests/SP, k=0.0006202). condenser legacy asset strings are
// already human units, so SP = vests * k. k is fetched LIVE every run per chain.
const K = {}; // chain -> {k, vestsPerSP, at}
async function loadK(chain, base) {
  try {
    const g = await rpcRetry(chain, base, 'condenser_api.get_dynamic_global_properties', [], 2);
    const tvf = assetNum(g.total_vesting_fund_steem || g.total_vesting_fund_hive || g.total_vesting_fund_shares);
    const tvs = assetNum(g.total_vesting_shares);
    if (Number.isFinite(tvf) && Number.isFinite(tvs) && tvs > 0 && tvf > 0) {
      K[chain] = { k: tvf / tvs, vestsPerSP: tvs / tvf, at: nowIso() };
      return;
    }
  } catch (e) { /* fallthrough */ }
  K[chain] = { k: 1e-6, vestsPerSP: 1e6, at: nowIso(), fallback: true };
}
function toSP(chain, vests) {
  const kk = K[chain] || { k: 1e-6 };
  return vests * kk.k;
}

// ---- v2: open orders (locked capital is a fact, measure it) ----
// for_sale is in satoshi units (precision 3); sell_price.base is the formatted asset
// string (e.g. "4.621 STEEM") — parse from there, fall back to for_sale/1000.
async function openOrders(chain, base, name) {
  try {
    const res = await rpcRetry(chain, base, 'condenser_api.get_open_orders', [name], 2);
    const rows = Array.isArray(res) ? res : [];
    const byAsset = {};
    for (const o of rows) {
      const m = String((o.sell_price && o.sell_price.base) || '').match(/^([\d.]+)\s+(\S+)$/);
      const sym = m ? m[2] : (chain === 'hive' ? 'HIVE' : 'STEEM');
      const val = m ? Number(m[1]) : (Number(o.for_sale) || 0) / 1000;
      byAsset[sym] = r3((byAsset[sym] || 0) + val);
    }
    return { count: rows.length, locked: byAsset };
  } catch (e) {
    return { count: null, locked: {}, error: String(e.message || e).slice(0, 80) };
  }
}

function lockedOf(acc, chain) {
  const lk = (acc.orders && acc.orders.locked) || {};
  const base = chain === 'hive' ? 'HIVE' : 'STEEM';
  const debt = chain === 'hive' ? 'HBD' : 'SBD';
  return { base: lk[base] || 0, debt: lk[debt] || 0 };
}

// ---- v2: drift vs previous snapshot ----
function driftAlerts(chain, acc, prev) {
  const alerts = [];
  if (!prev) return alerts;
  const exp = (ROSTER.expectations && ROSTER.expectations.drift) || {};
  const liqAbs = Number(exp.liquid_abs != null ? exp.liquid_abs : 5);
  const powAbs = Number(exp.power_abs != null ? exp.power_abs : 1.0);
  const chainPrev = prev.chains && prev.chains[chain];
  const prevAcc = chainPrev && (chainPrev.accounts || []).find(a => a.account === acc.account);
  if (!prevAcc) return alerts;
  if (acc.liquid !== undefined && prevAcc.liquid !== undefined) {
    // v2.1: drift on AVAILABLE capital (liquid + locked-in-orders) — raw liquid
    // bounces every grid-lane tick as orders lock/unlock, which is noise, not signal.
    const curAvail = acc.liquid + lockedOf(acc, chain).base;
    const prevAvail = prevAcc.liquid + lockedOf(prevAcc, chain).base;
    const d = r3(curAvail - prevAvail);
    if (Math.abs(d) >= liqAbs) {
      alerts.push({ kind: 'DRIFT-LIQUID', detail: 'available (liquid+locked) ' + r3(prevAvail) + ' -> ' + r3(curAvail) + ' (delta ' + (d > 0 ? '+' : '') + d + ' ' + chain.toUpperCase() + ') — verify this movement is ours (grid lane / arming) else investigate' });
    }
  }
  if (acc.effective_power !== undefined && prevAcc.effective_power !== undefined) {
    const d = r3(acc.effective_power - prevAcc.effective_power);
    if (Math.abs(d) >= powAbs) {
      alerts.push({ kind: 'DRIFT-POWER', detail: 'eff power ' + prevAcc.effective_power + ' -> ' + acc.effective_power + ' (delta ' + (d > 0 ? '+' : '') + d + ' ' + chain.toUpperCase() + 'P) — expected only from arming/delegation, else investigate' });
    }
  }
  return alerts;
}

// ---- v2: phantom-claim reconciliation ----
function claimAlerts(chainsOut) {
  const alerts = [];
  const claims = (ROSTER.claims) || [];
  for (const c of claims) {
    let measured = null;
    try {
      measured = 0;
      const chainScope = (!c.chain || c.chain === 'fleet') ? Object.keys(chainsOut) : [c.chain];
      for (const chain of chainScope) {
        const cfg = chainsOut[chain];
        if (!cfg) continue;
        for (const a of cfg.accounts) {
          if (c.account && a.account !== c.account) continue;
          measured += (a[c.metric] || 0);
        }
      }
    } catch (e) { continue; }
    if (c.claimed === undefined) continue;
    const ratio = c.claimed === 0 ? (measured === 0 ? 1 : Infinity) : measured / c.claimed;
    if (ratio < 0.9 || ratio > 1.1) {
      alerts.push({
        kind: 'PHANTOM-CLAIM',
        detail: 'claim "' + (c.id || 'unnamed') + '" asserts ' + c.claimed + ' ' + (c.label || c.metric) +
          ' but chain measures ' + r3(measured) + ' (ratio ' + (ratio === Infinity ? 'infinite' : Math.round(ratio * 100) + '%') + ')' +
          (c.source ? ' — source: ' + c.source : '') + ' — book is a ghost, correct the plan'
      });
    }
  }
  return alerts;
}

// ---- v2: roster-vs-roster reconciliation (the two-books disease) ----
function rosterAlerts(chainsOut) {
  const alerts = [];
  try {
    const fr = JSON.parse(fs.readFileSync(path.join(AG, 'fleet-roster.json'), 'utf8'));
    const fleet = (fr.steemFleet || []).map(String);
    const banned = (fr.bannedCapital || []).map(b => String(b.name || b));
    const audited = new Set((chainsOut.steem && chainsOut.steem.accounts || []).map(a => a.account));
    for (const n of fleet) {
      if (!audited.has(n)) {
        alerts.push({ kind: 'ROSTER-DIVERGENCE', detail: 'fleet-roster member "' + n + '" (owner-authorized) is NOT audited by grid-roster — add it, the chain referees between books' });
      }
    }
    for (const b of banned) {
      if (!audited.has(b)) {
        alerts.push({ kind: 'ROSTER-DIVERGENCE', detail: 'bannedCapital account "' + b + '" (owner-authorized) is NOT audited by grid-roster — add it' });
        continue;
      }
      // bannedCapital semantics: capital must never FLOW INTO these accounts.
      const acc = (chainsOut.steem.accounts || []).find(a => a.account === b);
      if (acc && (acc.delegated_in || 0) > 0.001) {
        alerts.push({ kind: 'BANNED-CAPITAL-INFLOW', detail: 'banned account "' + b + '" holds ' + acc.delegated_in + ' SP delegated IN — capital lane violated the ban, reclaim or justify' });
      }
    }
    if (fr.head && chainsOut.steem && !audited.has(fr.head)) {
      alerts.push({ kind: 'ROSTER-DIVERGENCE', detail: 'fleet head "' + fr.head + '" not audited' });
    }
  } catch (e) { /* fleet-roster unreadable — skip silently, audit must never gate */ }
  return alerts;
}

async function rcPct(chain, base, name) {
  if (chain === 'blurt') return null; // no rc_api assumed
  try {
    const r = await rpc(chain, base, 'rc_api.find_rc_accounts', { accounts: [name] });
    const a = r && r.rc_accounts && r.rc_accounts[0];
    if (!a || !a.max_rc) return null;
    return Math.max(0, Math.min(100, (Number(a.rc_manabar.current_mana) / Number(a.max_rc)) * 100));
  } catch (e) { return null; }
}

async function rpcRetry(chain, base, method, params, tries) {
  tries = tries || 3;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await rpc(chain, base, method, params); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  throw lastErr;
}

async function auditAccount(chain, base, spec, exp) {
  const name = spec.name;
  const out = { chain, account: name, role: spec.role, alerts: [] };
  try {
    const res = await rpcRetry(chain, base, 'condenser_api.get_accounts', [[name]]);
    const a = res && res[0];
    if (!a) { out.alerts.push({ kind: 'ACCOUNT-MISSING', detail: 'not found on ' + chain }); return out; }
    const ves = tok(a.vesting_shares), del = tok(a.delegated_vesting_shares), rec = tok(a.received_vesting_shares);
    const effVes = ves - del + rec;
    out.effective_power = r3(toSP(chain, effVes)); // SP / HP / BP — real k conversion (v2.2)
    out.own_power = r3(toSP(chain, ves));
    out.liquid = tok(a.balance);
    out.sbd_like = tok(a.sbd_balance);
    out.delegated_out = r3(toSP(chain, del));
    out.delegated_in = r3(toSP(chain, rec));
    out.created = a.created;
    out.last_post = a.last_post;
    // v2: locked capital measured, not guessed
    out.orders = chain === 'blurt' ? { count: null, locked: {}, error: 'blurt open-orders api not assumed' } : await openOrders(chain, base, name);
    // voting power from manabar relative to effective vesting
    let vp = null;
    if (a.voting_manabar && effVes > 0) {
      vp = Math.max(0, Math.min(100, (Number(a.voting_manabar.current_mana) / effVes) * 100));
    } else if (a.voting_manabar) { vp = 0; }
    out.voting_power_pct = vp === null ? null : Math.round(vp * 10) / 10;
    out.rc_pct = null;
    // async fill below
    const rc = await rcPct(chain, base, name);
    out.rc_pct = rc === null ? null : Math.round(rc * 10) / 10;
    const daysSincePost = a.last_post && !a.last_post.startsWith('1970')
      ? (Date.now() - Date.parse(a.last_post)) / 86400000 : null;
    out.days_since_post = daysSincePost === null ? null : Math.round(daysSincePost * 10) / 10;

    const isActive = /worker-active|treasury|poster|connect-target/.test(spec.role);
    if (isActive && vp !== null && vp < (exp.vp_floor_pct || 20)) {
      out.alerts.push({ kind: 'VP-EMPTY', detail: 'vp=' + out.voting_power_pct + '% below floor ' + (exp.vp_floor_pct || 20) + '% — auto-voting drains mana' });
    }
    // v2.2: SP floor (e.g. treasury head must keep 3000 SP per delegation plan)
    const spFloorKey = chain + ':' + name;
    const spFloor = exp.sp_floor && exp.sp_floor[spFloorKey];
    if (spFloor !== undefined && out.effective_power < spFloor) {
      out.alerts.push({ kind: 'SP-UNDERFLOOR', detail: 'effective ' + out.effective_power + ' SP below floor ' + spFloor + ' — arming waves must respect the treasury floor' });
    }
    if (isActive && daysSincePost !== null && daysSincePost > (exp.active_post_max_age_days || 7)) {
      out.alerts.push({ kind: 'INACTIVE', detail: 'last post ' + out.days_since_post + 'd ago (role expects activity)' });
    }
    if (/keyless/.test(spec.role) && out.liquid > (exp.keyless_no_liquid_above || 1)) {
      out.alerts.push({ kind: 'STRANDED-CAPITAL', detail: 'keyless account holds ' + out.liquid + ' ' + chain.toUpperCase() + ' liquid — no custody, unrecoverable without key recovery' });
    }
    // v2: floor check now discounts measured locked funds (orders are liquid capital in waiting)
    const floorKey = chain + ':' + name;
    const floor = exp.treasury_liquid_floor && exp.treasury_liquid_floor[floorKey];
    if (floor !== undefined) {
      const lockedSym = chain === 'hive' ? 'HIVE' : 'STEEM';
      const locked = (out.orders && out.orders.locked && out.orders.locked[lockedSym]) || 0;
      const available = out.liquid + locked;
      if (available < floor) {
        out.alerts.push({ kind: 'TREASURY-UNDERFLOOR', detail: 'liquid ' + out.liquid + ' + locked-in-orders ' + locked + ' = ' + r3(available) + ' below floor ' + floor });
      }
    }
  } catch (e) {
    out.alerts.push({ kind: 'RPC-DEAD', detail: String(e.message || e).slice(0, 120) });
  }
  return out;
}

const HISTORY_MAX_LINES = 500;

async function main() {
  const exp = ROSTER.expectations || {};
  // v2: snapshot previous book BEFORE overwrite — drift is measured against it
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')); } catch (e) { prev = null; }
  const chainsOut = {};
  const allAlerts = [];
  for (const [chain, cfg] of Object.entries(ROSTER.chains)) {
    await loadK(chain, cfg.rpc); // v2.2: live vests->SP rate per chain, every run
    if (K[chain] && K[chain].fallback) {
      allAlerts.push('k ' + chain + ' K-FALLBACK — dynamic global properties unavailable, naive /1e6 in use, numbers may be off by ~1612x');
    }
    const results = [];
    for (const spec of cfg.accounts) {
      const r = await auditAccount(chain, cfg.rpc, spec, exp);
      // v2: drift vs previous committed snapshot
      for (const al of driftAlerts(chain, r, prev)) r.alerts.push(al);
      results.push(r);
      for (const al of r.alerts) allAlerts.push(chain + ':' + r.account + ' ' + al.kind + ' — ' + al.detail);
    }
    chainsOut[chain] = { rpc: cfg.rpc, accounts: results };
  }

  const totals = {};
  for (const [chain, c] of Object.entries(chainsOut)) {
    totals[chain] = {
      effective_power: r3(c.accounts.reduce((s, a) => s + (a.effective_power || 0), 0)),
      liquid: r3(c.accounts.reduce((s, a) => s + (a.liquid || 0), 0)),
      locked_in_orders: r3(c.accounts.reduce((s, a) => {
        const sym = chain === 'hive' ? 'HIVE' : 'STEEM';
        const sbdLike = chain === 'hive' ? 'HBD' : 'SBD';
        const lk = (a.orders && a.orders.locked) || {};
        return s + (lk[sym] || 0);
      }, 0)),
      accounts_alive: c.accounts.filter(a => !a.alerts.some(x => x.kind === 'ACCOUNT-MISSING')).length
    };
  }

  // v2: reconcile asserted claims against measured reality
  const phantomAlerts = claimAlerts(chainsOut);
  for (const al of phantomAlerts) allAlerts.push('claims ' + al.kind + ' — ' + al.detail);
  // v2: roster-vs-roster divergence (fleet-roster is owner-authorized canon)
  const rosterAl = rosterAlerts(chainsOut);
  for (const al of rosterAl) allAlerts.push('roster ' + al.kind + ' — ' + al.detail);

  const book = {
    schema: 'saos/grid-truth/3',
    generatedAt: nowIso(),
    by: 'grid-doctor v2.2',
    source: 'live chain RPC (api.steemit.com, api.hive.blog, blurt-rpc.saboin.com) — zero self-reports',
    kRates: K,
    driftVs: prev && prev.generatedAt ? prev.generatedAt : null,
    totals,
    chains: chainsOut,
    claims: phantomAlerts,
    alerts: allAlerts
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 2) + '\n');

  // v2: append-only compact history (drift math + grid training over time)
  const histPath = path.join(AG, 'grid-truth-history.jsonl');
  try {
    const histLine = JSON.stringify({
      at: book.generatedAt,
      totals,
      alertCount: allAlerts.length,
      alertKinds: allAlerts.map(a => a.split(' ')[1]).filter(Boolean)
    }) + '\n';
    let old = '';
    try { old = fs.readFileSync(histPath, 'utf8'); } catch (e) {}
    const lines = (old ? old.trim().split('\n') : []).concat(histLine.trim());
    fs.writeFileSync(histPath, lines.slice(-HISTORY_MAX_LINES).join('\n') + '\n');
  } catch (e) { console.error('history-append-failed', e.message); }

  const lines = [];
  lines.push('# GRID-TRUTH · ' + book.generatedAt + ' (live RPC, read-only)');
  lines.push('');
  lines.push('The anti-phantom book: every number below was measured from the chain this run.');
  if (book.driftVs) lines.push('Drift measured vs previous snapshot: ' + book.driftVs);
  lines.push('');
  lines.push('| chain | total effective power | total liquid | locked in orders | accounts alive |');
  lines.push('|---|---|---|---|---|');
  for (const [c, t] of Object.entries(totals)) {
    lines.push('| ' + c + ' | ' + t.effective_power + ' | ' + t.liquid + ' | ' + (t.locked_in_orders || 0) + ' | ' + t.accounts_alive + ' |');
  }
  lines.push('');
  for (const [c, cfg] of Object.entries(chainsOut)) {
    lines.push('## ' + c.toUpperCase());
    lines.push('');
    lines.push('| account | role | eff power | liquid | locked | VP% | RC% | last post | alerts |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const a of cfg.accounts) {
      const sym = c === 'hive' ? 'HIVE' : 'STEEM';
      const locked = a.orders && a.orders.locked ? Object.entries(a.orders.locked).map(([k, v]) => v + ' ' + k).join('+') : '—';
      lines.push('| ' + a.account + ' | ' + (a.role || '') + ' | ' + (a.effective_power !== undefined ? a.effective_power : '—') + ' | ' + (a.liquid !== undefined ? a.liquid : '—') + ' | ' + locked + ' | ' + (a.voting_power_pct === null || a.voting_power_pct === undefined ? '—' : a.voting_power_pct) + ' | ' + (a.rc_pct === null || a.rc_pct === undefined ? '—' : a.rc_pct) + ' | ' + (a.last_post || '—').slice(0, 10) + ' | ' + a.alerts.map(x => x.kind).join(',') + ' |');
    }
    lines.push('');
  }
  if (phantomAlerts.length) {
    lines.push('## PHANTOM-CLAIMS (books that contradict the chain)');
    lines.push('');
    for (const al of phantomAlerts) lines.push('- ' + al.detail);
    lines.push('');
  }
  lines.push('## ALERTS (' + allAlerts.length + ')');
  lines.push('');
  if (!allAlerts.length) lines.push('none — fleet matches expectations');
  for (const al of allAlerts) lines.push('- ' + al);
  lines.push('');
  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');

  console.log('GRID-DOCTOR-DONE accounts=' + Object.values(chainsOut).reduce((s, c) => s + c.accounts.length, 0) + ' alerts=' + allAlerts.length + ' phantomClaims=' + phantomAlerts.length);
  for (const al of allAlerts) console.log('GRID-ALERT ' + al);
}

main().catch(e => { console.error('GRID-DOCTOR-FATAL', e); process.exit(0); });
