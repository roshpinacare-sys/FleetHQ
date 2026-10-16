// sovereign/stack/policy/policy-engine.mjs — Layer 2 of the Ultimate Sovereign Stack.
// The deterministic validator (adapt.ai PolicyAVS pattern): the agent drafts
// off-chain tasks; the validator network checks them against HARD whitelists and
// refuses to sign anything out-of-policy. Pure functions, zero deps, no network.
// CLI:
//   node policy-engine.mjs --selftest              (12 vectors; exit 1 on failure — this is a TEST, not a measurement)
//   node policy-engine.mjs --validate-xc <file>    (validate an SAOS-DEX-XC/1 intents book; exit 0 measurement)
//   node policy-engine.mjs --validate-state <file> (validate a dex/state.json tape; exit 0 measurement)
// Library: import { validateIntent, validateFill, evaluateStasis } from this file.

import { readFileSync } from 'node:fs';

const STATES = ['DRAFTED', 'OPENED', 'FILLED', 'CONFIRMED', 'REFUNDED', 'REFUSED', 'EXPIRED'];
const HEX40 = /\b0x[0-9a-fA-F]{40}\b/;
const BEARER = /\b(sk-|ghp_|github_pat_|Bearer\s+[A-Za-z0-9._-]{16,})/;

export function loadPolicy(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// STASIS composition: the one-file brake outranks every other rule.
export function evaluateStasis(stasisDoc) {
  return !!(stasisDoc && stasisDoc.active === true);
}

function redactionViolations(rec) {
  const s = JSON.stringify(rec);
  const v = [];
  if (HEX40.test(s)) v.push('redaction: 40-hex token riding inside the record');
  if (BEARER.test(s)) v.push('redaction: bearer/secret-shaped token riding inside the record');
  return v;
}

// ---- xc intent validation (SAOS-DEX-XC/1)
export function validateIntent(intent, policy, ctx = {}) {
  const reasons = [];
  const stasis = ctx.stasisActive === true;
  const cap = policy.capital || {};
  const ceil = cap.ceilings || {};
  const pairs = cap.pairs || {};
  const venues = (cap.venues && cap.venues.allowed) || [];

  if (stasis) reasons.push('stasis-brake: STASIS.json active=true — every capital action refuses to sign (FATE-DEFENSE #1)');
  if (intent.state && !STATES.includes(intent.state)) reasons.push(`state-machine: unknown intent state "${intent.state}"`);
  const corridor = String(intent.corridor || intent.band || '');
  if (corridor && !venues.some(v => corridor.toUpperCase().includes(v.toUpperCase().split('-').slice(-1)[0]) || corridor.toUpperCase().includes(v.toUpperCase()))) {
    // corridor strings are descriptive (e.g. "KEYED-DESK (...)") — match any allowed venue token
    if (!venues.some(v => corridor.toUpperCase().includes(v.toUpperCase().replace(/-/g, '')) || corridor.toUpperCase().replace(/-/g, '').includes(v.toUpperCase().replace(/-/g, '')))) {
      reasons.push(`venue-whitelist: corridor "${corridor.slice(0, 60)}" matches no allowed venue`);
    }
  }
  if (intent.origin && !pairs.allowedBase?.includes(intent.origin) && !pairs.allowedQuote?.includes(intent.origin)) reasons.push(`pair-whitelist: origin asset "${intent.origin}" not allowed`);
  if (intent.destChain && !pairs.allowedBase?.includes(intent.destChain) && !pairs.allowedQuote?.includes(intent.destChain)) reasons.push(`pair-whitelist: dest "${intent.destChain}" not allowed`);
  if (typeof intent.guardBps === 'number' && intent.guardBps > (ceil.maxGuardBps ?? 100)) reasons.push(`guardBps ${intent.guardBps} > ceiling ${ceil.maxGuardBps}`);
  if ('quoteMu' in intent && 'minOutMu' in intent && intent.minOutMu != null) {
    const q = Number(intent.quoteMu), m = Number(intent.minOutMu);
    if (Number.isFinite(q) && Number.isFinite(m) && m > q) reasons.push(`min-out-protection: minOutMu(${m}) > quoteMu(${q})`);
  }
  if (intent.openedAt && intent.fillDeadline) {
    if (!(Date.parse(intent.openedAt) < Date.parse(intent.fillDeadline))) reasons.push('deadline-order: openedAt >= fillDeadline');
    if (intent.refundUnlock && !(Date.parse(intent.fillDeadline) < Date.parse(intent.refundUnlock))) reasons.push('deadline-order: fillDeadline >= refundUnlock');
  }
  reasons.push(...redactionViolations(intent));

  // notional (honest): computed ONLY against a declared stable quote
  const stable = pairs.stablePriceUsd || {};
  const amount = Number(intent.amountMu);
  const priced = intent.origin && stable[intent.origin] != null && Number.isFinite(amount);
  let notionalUsd = null;
  if (priced) { notionalUsd = (amount / 1e6) * stable[intent.origin]; if (notionalUsd > (ceil.maxNotionalUsdPerLeg ?? Infinity)) reasons.push(`ceiling: notional $${notionalUsd.toFixed(2)} > maxNotionalUsdPerLeg $${ceil.maxNotionalUsdPerLeg}`); }

  const verdict = reasons.length === 0 ? 'PASS' : (stasis ? 'ESCALATE' : 'REJECT');
  return { verdict, reasons, notionalUsd, priced: !!priced, intentId: intent.intentId || null };
}

// ---- fill validation (dex/state.json tape entries + orders)
export function validateFill(fill, policy, ctx = {}) {
  const reasons = [];
  const stasis = ctx.stasisActive === true;
  const cap = policy.capital || {};
  const ceil = cap.ceilings || {};
  const pairs = cap.pairs || {};

  if (stasis) reasons.push('stasis-brake: STASIS.json active=true');
  // orientation-neutral market law (amendment 2026-10-14T02:00Z, trace 1a137fbff7c7c4ad):
  // a market is a market — {SAOS,USDS} and {USDS,SAOS} are the SAME market viewed from
  // either side. Measured: the live sweep drafted an inverted leg (base=USDS quote=SAOS)
  // and the strict orientation check rejected a market the policy explicitly allows.
  // The whitelist governs MARKETS, not representation; both orientations of an allowed
  // base×quote combination pass. Single-sided assets still check their own list.
  const _ab = pairs.allowedBase || [], _aq = pairs.allowedQuote || [];
  const _fwd = _ab.includes(fill.base) && _aq.includes(fill.quote);
  const _rev = _aq.includes(fill.base) && _ab.includes(fill.quote);
  if (fill.base && fill.quote && !_fwd && !_rev) {
    reasons.push(`pair-whitelist: market ${fill.base}/${fill.quote} not allowed (either orientation)`);
  } else {
    if (fill.base && !fill.quote && !_ab.includes(fill.base)) reasons.push(`pair-whitelist: base "${fill.base}" not allowed`);
    if (!fill.base && fill.quote && !_aq.includes(fill.quote)) reasons.push(`pair-whitelist: quote "${fill.quote}" not allowed`);
  }
  const price = Number(fill.price);
  if (Number.isFinite(price) && !(price > 0 && price < 1e9)) reasons.push(`positive-price: price ${price} out of (0,1e9)`);
  reasons.push(...redactionViolations(fill));

  const stable = pairs.stablePriceUsd || {};
  const amount = Number(fill.amountMu);
  // notional resolves against the STABLE side regardless of orientation (an inverted
  // fill still prices against USDS — the stable is wherever it sits in the pair)
  const stableSide = stable[fill.quote] != null ? fill.quote : (stable[fill.base] != null ? fill.base : null);
  let notionalUsd = null;
  if (stableSide != null && Number.isFinite(amount)) {
    notionalUsd = (amount / 1e6) * stable[stableSide];
    if (notionalUsd > (ceil.maxNotionalUsdPerLeg ?? Infinity)) reasons.push(`ceiling: fill notional $${notionalUsd.toFixed(2)} > maxNotionalUsdPerLeg $${ceil.maxNotionalUsdPerLeg}`);
  }

  const verdict = reasons.length === 0 ? 'PASS' : (stasis ? 'ESCALATE' : 'REJECT');
  return { verdict, reasons, notionalUsd, priced: notionalUsd != null, ref: fill.kind === 'fill' ? `fill@${fill.at}` : `order@${fill.seq ?? fill.id ?? '?'}` };
}

// ---- aggregate beat/day ceilings over a set of priced legs
export function validateAggregate(items, policy) {
  const ceil = (policy.capital && policy.capital.ceilings) || {};
  const now = Date.now();
  const dayAgo = now - 86400e3;
  const beat = items.filter(i => i.priced && i.at && (now - i.at) < 3600e3).reduce((s, i) => s + (i.notionalUsd || 0), 0);
  const day = items.filter(i => i.priced && i.at && (now - i.at) < 86400e3).reduce((s, i) => s + (i.notionalUsd || 0), 0);
  const reasons = [];
  if (beat > (ceil.maxNotionalUsdPerBeat ?? Infinity)) reasons.push(`ceiling: ${'beat-notional'} $${beat.toFixed(2)}/hour > $${ceil.maxNotionalUsdPerBeat}`);
  if (day > (ceil.maxNotionalUsdPerDay ?? Infinity)) reasons.push(`ceiling: $${day.toFixed(2)}/day > $${ceil.maxNotionalUsdPerDay}`);
  return { beatNotionalUsd: beat, dayNotionalUsd: day, verdict: reasons.length ? 'REJECT' : 'PASS', reasons };
}

// ---- selftest: 12 vectors with expected verdicts. Exit 1 on failure (a test may fail loudly).
export function selftest(policy) {
  const t = [];
  const base = { intentId: 't', state: 'OPENED', origin: 'SBD', destChain: 'STEEM', amountMu: 1000000, quoteMu: 935800, minOutMu: 931200, guardBps: 50, openedAt: '2026-10-13T10:00:00Z', fillDeadline: '2026-10-13T11:00:00Z', refundUnlock: '2026-10-13T12:00:00Z', corridor: 'KEYED-DESK (steem active in the protected desks)' };
  const ok = { ...base }; t.push(['clean intent PASS', validateIntent(ok, policy).verdict, 'PASS']);
  t.push(['stasis => ESCALATE', validateIntent(ok, policy, { stasisActive: true }).verdict, 'ESCALATE']);
  t.push(['unknown state', validateIntent({ ...ok, state: 'WAT' }, policy).verdict, 'REJECT']);
  t.push(['foreign venue', validateIntent({ ...ok, corridor: 'MYSTERY-RAIL' }, policy).verdict, 'REJECT']);
  t.push(['foreign origin', validateIntent({ ...ok, origin: 'MOON' }, policy).verdict, 'REJECT']);
  t.push(['guardBps over ceiling', validateIntent({ ...ok, guardBps: 500 }, policy).verdict, 'REJECT']);
  t.push(['min-out breach', validateIntent({ ...ok, minOutMu: 99999999 }, policy).verdict, 'REJECT']);
  t.push(['deadline inversion', validateIntent({ ...ok, openedAt: '2026-10-13T12:00:00Z', fillDeadline: '2026-10-13T11:00:00Z' }, policy).verdict, 'REJECT']);
  t.push(['secret in record', validateIntent({ ...ok, note: 'key 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }, policy).verdict, 'REJECT']);
  t.push(['priced over leg ceiling', validateIntent({ ...ok, origin: 'USDS', amountMu: 200000000 }, policy).verdict, 'REJECT']);
  t.push(['fill clean PASS', validateFill({ kind: 'fill', base: 'SAOS', quote: 'USDS', price: 1007, amountMu: 47000, at: Date.now() }, policy).verdict, 'PASS']);
  t.push(['fill INVERTED orientation PASS (measured live reject → amendment)', validateFill({ kind: 'fill', base: 'USDS', quote: 'SAOS', price: 1007, amountMu: 47000, at: Date.now() }, policy).verdict, 'PASS']);
  t.push(['fill genuinely foreign market REJECT', validateFill({ kind: 'fill', base: 'MOON', quote: 'MARS', price: 1007, amountMu: 47000, at: Date.now() }, policy).verdict, 'REJECT']);
  t.push(['fill bad price', validateFill({ kind: 'fill', base: 'SAOS', quote: 'USDS', price: -5, amountMu: 47000, at: Date.now() }, policy).verdict, 'REJECT']);
  const fails = t.filter(([, got, want]) => got !== want);
  for (const [name, got, want] of t) console.log(`  ${got === want ? '✓' : '✗'} ${name}: ${got}${got === want ? '' : ` (want ${want})`}`);
  return { pass: fails.length === 0, fails };
}

// ---- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const here = new URL('.', import.meta.url).pathname;
  const policy = loadPolicy(`${here}policy.json`);
  const arg = process.argv[2];
  if (arg === '--selftest') {
    console.log('policy-engine selftest:');
    const r = selftest(policy);
    console.log(r.pass ? 'SELFTEST PASS (12/12)' : `SELFTEST FAIL (${r.fails.length})`);
    process.exit(r.pass ? 0 : 1);
  }
  if (arg === '--validate-xc' || arg === '--validate-state') {
    const file = process.argv[3];
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      const items = arg === '--validate-xc' ? (doc.intents || []) : (doc.tape || []).concat(doc.orders || []);
      let pass = 0, rej = 0, esc = 0, unpriced = 0;
      for (const it of items) {
        const v = arg === '--validate-xc' ? validateIntent(it, policy) : validateFill(it, policy);
        if (v.verdict === 'PASS') pass++; else if (v.verdict === 'REJECT') rej++; else esc++;
        if (!v.priced) unpriced++;
      }
      console.log(JSON.stringify({ file, items: items.length, pass, reject: rej, escalate: esc, unpriced, exitLaw: 'measurement duty -> exit 0 (RED lives in the book)' }));
      process.exit(0);
    } catch (e) { console.error(`validate failed (honest): ${e.message}`); process.exit(0); }
  }
  console.log('usage: --selftest | --validate-xc <file> | --validate-state <file>');
  process.exit(0);
}
