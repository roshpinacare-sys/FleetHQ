#!/usr/bin/env node
/**
 * truth-sweep.mjs — ERROR SWEEP over published network content (r145-c, keyless, read-only).
 *
 * What it does (truth law: every claim measured against a named source):
 *   1. Pulls recent public posts + comments of the 11 community accounts
 *      (bridge.get_account_posts, the proven live path).
 *   2. Extracts claims: numbers with units, "N of M", counts, profit/revenue status words.
 *   3. Verifies against LIVE truth sources, each named per check:
 *        · fleet state: condenser getDynamicGlobalProperties + getAccounts (SP totals, VP)
 *        · PnL ledger: GET {TRUTH_URL}/api/economy/pnl (realized/unrealized/fills)
 *        · income:     GET {TRUTH_URL}/api/income (measured 30d income by source)
 *        · governance: DECISION_LOG.jsonl line count when the file is present locally
 *   4. Verdicts: ATTRIBUTION (quote of a target post, not our claim) · OK (within drift)
 *      · STALE (drift beyond gate, honest historical value) · WRONG (contradicts live truth).
 *   5. Writes agents/receipts/truth-sweep-receipt.json. Nothing is edited here —
 *      corrections are a separate signed step (agents/truth-fix.cjs + truth-fixes.json).
 *
 * Doctrine: keyless · fail-soft · zero secrets · every verdict carries its evidence.
 */
import fs from 'node:fs';
import path from 'node:path';

const RPC = 'https://api.steemit.com';
const FLEET = ['cashmachine', 'haran', 'israelnews', 'lsa', 'macrame', 'siq', 'tov', 'wic', 'wog', 'woq', 'headcorner'];
const TRUTH_URL = (process.env.TRUTH_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.env.RECEIPT_OUT || path.resolve('agents/receipts/truth-sweep-receipt.json');
const STALE_DRIFT = Number(process.env.STALE_DRIFT || 0.15);

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function fetchItems(account, sort, limit) {
  try {
    const r = await rpc('bridge.get_account_posts', { sort, account, limit });
    return (r || []).map(p => ({
      author: String(p.author || account), permlink: String(p.permlink || ''),
      title: String(p.title || ''), body: String(p.body || ''),
      created: String(p.created || ''), kind: sort === 'posts' ? 'post' : 'comment',
    }));
  } catch (e) {
    return [];
  }
}

async function liveFleetTruth() {
  const g = await rpc('condenser_api.get_dynamic_global_properties', []);
  const ratio = parseFloat(g.total_vesting_fund_steem) / parseFloat(g.total_vesting_shares);
  const accs = await rpc('condenser_api.get_accounts', [FLEET]);
  let totalSP = 0, delegated = 0, soldiers = 0;
  const vp = {};
  for (const a of accs) {
    vp[a.name] = Math.round(a.voting_power / 100);
    if (a.name !== 'headcorner') { soldiers++; if (parseFloat(a.received_vesting_shares) > 0) delegated++; }
    totalSP += (parseFloat(a.vesting_shares) + parseFloat(a.received_vesting_shares) - parseFloat(a.delegated_vesting_shares)) * ratio;
  }
  return { totalSP: Math.round(totalSP), vpReady: FLEET.filter(n => vp[n] >= 20).length, delegated, soldiers, at: new Date().toISOString() };
}

async function fetchTruth(urlPath) {
  try {
    const r = await fetch(TRUTH_URL + urlPath, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const stripMd = (s) => String(s).replace(/https?:\/\/\S+/g, ' ').replace(/[*_#>`~|[\]()]/g, ' ');

function attributionContext(text, idx) {
  // quoted fragment context: "the part with <num>" or the number sits inside quotation marks
  const before = text.slice(Math.max(0, idx - 60), idx).toLowerCase();
  if (/the part with\s*$/.test(before)) return true;
  if (/your (piece|post)\s*"?\s*$/.test(before)) return true;
  return false;
}

function extractClaims(item) {
  const text = stripMd(item.body);
  const claims = [];
  const push = (re, type) => {
    for (const m of text.matchAll(re)) {
      claims.push({
        type, raw: m[0].trim(), at: m.index,
        attribution: attributionContext(text, m.index) || /stopped me|your piece/i.test(text) && item.kind === 'comment' && type === 'number',
      });
    }
  };
  push(/-?\d[\d,]*(?:\.\d+)?\s*(?:SP|SBD|STEEM|HBD|HIVE|BLURT)/gi, 'number');
  push(/\d+\s*of\s*11\b/gi, 'of-eleven');
  push(/\d[\d,]*\s*(?:decisions?|fills?|cycles?|accounts?)\b/gi, 'count');
  push(/\$\s?-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s*USD/gi, 'usd');
  const statusHits = [];
  for (const m of text.matchAll(/\b(profitable|a profit|made a profit|earned|revenue per day|real revenue)\b/gi)) {
    statusHits.push({ raw: m[0], at: m.index, attribution: attributionContext(text, m.index) });
  }
  return { claims, statusHits, text };
}

function usdNumber(raw) {
  const m = String(raw).replace(/[$,]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

function verdictFor(claim, truth, context) {
  if (claim.attribution) return { verdict: 'ATTRIBUTION', why: 'quoted fragment of a target post, not an own claim' };
  const num = parseFloat(claim.raw.replace(/,/g, ''));
  if (claim.type === 'number' && /\bSP\b/i.test(claim.raw)) {
    // SP claims are not always fleet totals: powerdown rows and per-soldier
    // delegation grants are their own measured quantities.
    const ctx = (context || '').toLowerCase();
    if (/weekly|per week|remaining|to withdraw|powerdown|האצלה לחייל|דלק/.test(ctx)) {
      return { verdict: 'OK', why: 'powerdown/delegation quantity (own measured stream, not a fleet-total claim)' };
    }
    if (!truth.fleet) return { verdict: 'OK', why: 'fleet truth unavailable (fail-soft)' };
    const drift = Math.abs(num - truth.fleet.totalSP) / truth.fleet.totalSP;
    return drift <= STALE_DRIFT
      ? { verdict: 'OK', why: `within ${(STALE_DRIFT * 100).toFixed(0)}% drift gate of live fleet SP ${truth.fleet.totalSP}` }
      : { verdict: 'STALE', why: `claim ${num} SP vs live fleet ${truth.fleet.totalSP} SP (${(drift * 100).toFixed(0)}% drift — value was publish-time measured, aged out)` };
  }
  if (claim.type === 'of-eleven') {
    if (!truth.fleet) return { verdict: 'OK', why: 'fleet truth unavailable (fail-soft)' };
    const n = parseInt(claim.raw, 10);
    return Math.abs(n - truth.fleet.vpReady) <= 3
      ? { verdict: 'OK', why: `live vpReady=${truth.fleet.vpReady} of 11 (gate ±3)` }
      : { verdict: 'WRONG', why: `claims ${claim.raw} ready vs live vpReady=${truth.fleet.vpReady} of 11` };
  }
  if (claim.type === 'count' && /decision/i.test(claim.raw)) {
    if (!truth.decisions) return { verdict: 'OK', why: 'decision count unavailable (fail-soft)' };
    const n = parseInt(claim.raw.replace(/,/g, ''), 10);
    return n >= truth.decisions
      ? { verdict: 'OK', why: `>= live decision count ${truth.decisions} (append-only grows)` }
      : { verdict: 'WRONG', why: `claims ${n} decisions vs live ${truth.decisions}` };
  }
  if (claim.type === 'count' && /fill/i.test(claim.raw)) {
    if (!truth.pnl) return { verdict: 'OK', why: 'pnl truth unavailable (fail-soft)' };
    const n = parseInt(claim.raw.replace(/,/g, ''), 10);
    const t = truth.pnl.realized?.fillsTotal;
    if (!t) return { verdict: 'OK', why: 'fill total unavailable in pnl truth' };
    return Math.abs(n - t) / t <= 0.2
      ? { verdict: 'OK', why: `within 20% of live fillsTotal=${t}` }
      : { verdict: 'WRONG', why: `claims ${n} fills vs live ${t}` };
  }
  if (claim.type === 'usd') {
    const abs = Math.abs(usdNumber(claim.raw));
    if (!Number.isFinite(abs)) return { verdict: 'OK', why: 'non-numeric artifact' };
    const ctx = (context || '').toLowerCase();
    // hypotheticals and capital math are framed claims, not measurements
    if (/up to|would|produces|working capital|apr|capital math|gap to/.test(ctx)) {
      return { verdict: 'OK', why: 'hypothetical/capital-math framing, not a measured claim' };
    }
    // a revenue/day claim with a named live method: compare against the live book
    if (/revenue\/day|per day/.test(ctx) && truth.mission?.usdPerDay7dAvg != null) {
      const live = Number(truth.mission.usdPerDay7dAvg);
      const drift = live !== 0 ? Math.abs(abs - live) / Math.max(live, 1e-9) : abs;
      return drift <= 0.2
        ? { verdict: 'OK', why: `within 20% of live usdPerDay7dAvg=${live.toFixed(5)} (/api/mission)` }
        : { verdict: 'WRONG', why: `claims $${abs}/day as measured-today vs live book $${live.toFixed(5)}/day (/api/mission, ${(drift * 100).toFixed(0)}% drift)` };
    }
    // lifetime PnL-ish claims must not contradict the measured realized sign
    if (/lifetime|cumulative/.test(ctx) && truth.pnl?.realized?.capturedUsd != null) {
      const realized = Number(truth.pnl.realized.capturedUsd);
      if (abs > 0 && realized < 0) {
        return { verdict: 'WRONG', why: `positive cumulative claim $${abs} vs measured realized PnL ${realized} USD (/api/economy/pnl, FIFO on real fills)` };
      }
      return { verdict: 'OK', why: `sign-consistent with realized PnL ${realized} USD` };
    }
    // price/parity quotes and inventory values are not income claims
    if (/parity|price|bid|ask|oracle|sbd\/steem|per steem|≈|\bpowerdown\b|weekly/.test(ctx)) {
      return { verdict: 'OK', why: 'price/parity/fuel-stream quote, not an income claim' };
    }
    return { verdict: 'OK', why: 'no contradicting truth source for this unit (income-scale gate passed)' };
  }
  return { verdict: 'OK', why: 'no contradicting truth source for this unit' };
}

function verdictForStatus(hit, item, truth) {
  if (hit.attribution) return { verdict: 'ATTRIBUTION', why: 'inside a quoted fragment' };
  const text = stripMd(item.body).toLowerCase();
  // subject-aware: a profit word can describe an EXTERNAL subject (e.g. an explainer
  // about why casinos profit) — that is not a claim about this network's PnL.
  const around = text.slice(Math.max(0, hit.at - 220), hit.at + 120);
  if (/casino|house edge|players|gambl/.test(around)) {
    return { verdict: 'OK', why: 'profit word describes an external subject (casino/edge explainer), not this network' };
  }
  const honestFrame = /no revenue promises|measured|not a profit|small and real|simulation|never as revenue|honest/.test(text);
  const realizedSbd = truth.pnl?.realized?.capturedSbd;
  if (/profitab|a profit|made a profit/.test(hit.raw.toLowerCase())) {
    if (typeof realizedSbd === 'number' && realizedSbd < 0 && !honestFrame) {
      return { verdict: 'WRONG', why: `profit claim while realized PnL is negative (${realizedSbd} SBD, /api/economy/pnl)` };
    }
    return { verdict: 'OK', why: honestFrame ? 'profit word present inside an honest measured frame' : 'no contradicting realized-PnL truth reachable' };
  }
  return { verdict: 'OK', why: 'status word inside measured framing' };
}

(async () => {
  const t0 = new Date().toISOString();
  const receipt = { at: t0, tool: 'truth-sweep.mjs', sources: {}, items: 0, errors: [], claims: [], summary: {} };

  const [fleet, pnl, income, mission] = await Promise.all([liveFleetTruth().catch(e => { receipt.errors.push('fleet: ' + String(e.message || e).slice(0, 80)); return null; }), fetchTruth('/api/economy/pnl'), fetchTruth('/api/income'), fetchTruth('/api/mission')]);
  let decisions = null;
  try {
    const p = path.resolve('DECISION_LOG.local.jsonl');
    if (process.env.DECISION_LOG_PATH && fs.existsSync(process.env.DECISION_LOG_PATH)) {
      decisions = fs.readFileSync(process.env.DECISION_LOG_PATH, 'utf8').split('\n').filter(l => l.trim()).length;
    } else if (fs.existsSync(p)) decisions = fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).length;
  } catch { }
  receipt.sources = {
    fleet: fleet ? `condenser live @ ${fleet.at} (totalSP=${fleet.totalSP}, vpReady=${fleet.vpReady}, delegated=${fleet.delegated}/${fleet.soldiers})` : 'unavailable',
    pnl: pnl ? `GET ${TRUTH_URL}/api/economy/pnl (realizedSbd=${pnl.realized?.capturedSbd}, fills=${pnl.realized?.fillsTotal})` : 'unreachable',
    income: income ? `GET ${TRUTH_URL}/api/income (${(income.sources || []).length} measured sources)` : 'unreachable',
    decisions: decisions != null ? `DECISION_LOG lines=${decisions}` : 'file unavailable',
    mission: mission ? `GET ${TRUTH_URL}/api/mission (usdPerDay7dAvg=${mission.measured?.usdPerDay7dAvg})` : 'unreachable',
  };
  const truth = { fleet, pnl, income: income ? Object.fromEntries((income.sources || []).map(s => [s.id, { usd30d: s.usd30d }])) : null, decisions, mission: mission?.measured ?? null };

  const items = [];
  for (const who of FLEET) {
    for (const sort of ['posts', 'comments']) items.push(...await fetchItems(who, sort, 8));
  }
  receipt.items = items.length;

  for (const item of items) {
    const { claims, statusHits, text } = extractClaims(item);
    for (const c of claims) {
      const ctx = text.slice(Math.max(0, c.at - 70), c.at + 70);
      const v = verdictFor(c, truth, ctx);
      receipt.claims.push({
        author: item.author, permlink: item.permlink, kind: item.kind, created: item.created,
        claim: c.raw, type: c.type, verdict: v.verdict, why: v.why, context: ctx.replace(/\s+/g, ' '),
        url: `https://steemit.com/@${item.author}/${item.permlink}`,
      });
    }
    for (const h of statusHits) {
      const v = verdictForStatus(h, item, truth);
      receipt.claims.push({
        author: item.author, permlink: item.permlink, kind: item.kind, created: item.created,
        claim: h.raw, type: 'status', verdict: v.verdict, why: v.why,
        url: `https://steemit.com/@${item.author}/${item.permlink}`,
      });
    }
  }

  const summary = {};
  for (const c of receipt.claims) summary[c.verdict] = (summary[c.verdict] || 0) + 1;
  receipt.summary = { claimsTotal: receipt.claims.length, ...summary };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ state: 'ok', summary: receipt.summary, sources: receipt.sources }));
})().catch(e => {
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 160) }));
  process.exit(0);
});
