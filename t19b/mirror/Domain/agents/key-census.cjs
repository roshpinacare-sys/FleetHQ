#!/usr/bin/env node
/**
 * key-census — resolve WHICH secret actually holds the live authority WIF,
 * by bit-compare against the chain (zero key material printed, ever).
 *
 * Honesty law: the fleet had a stale STEEM_ACTIVE_WIF that does NOT match
 * headcorner's live active authority (measured 2026-10-11 in treasury-arm run
 * 38147358384 — "Missing Active Authority headcorner"). Secrets must be
 * census-ed, not assumed.
 *
 * Candidates may be: raw WIFs, base64(JSON) key bundles (SA_FLEET_KEYS —
 * every WIF-shaped string inside is tried), or master passwords (MAIN_KEY —
 * derived via auth.getPrivateKeys). Exported resolve() returns
 * { secretName, wif } | null and prints only MATCH/NO-MATCH lines.
 */
'use strict';
const WIF_RE = /^[5JK][1-9A-HJ-NP-Za-km-z]{50}$/;

const crypto = require('crypto');
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58check(buf) {
  const h = crypto.createHash('sha256').update(crypto.createHash('sha256').update(buf).digest()).digest();
  const all = Buffer.concat([buf, h.slice(0, 4)]);
  let n = BigInt('0x' + all.toString('hex')), s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of all) { if (b === 0) s = '1' + s; else break; }
  return s;
}
/* saos-engine seed law: wifFor(seed) = base58check(0x80 + sha256(seed) + 0x01) */
function sha256Wif(seedStr) {
  const body = Buffer.concat([Buffer.from([0x80]), crypto.createHash('sha256').update(Buffer.from(seedStr, 'utf8')).digest(), Buffer.from([0x01])]);
  return b58check(body);
}
/* prefix-agnostic pubkey compare: STM/HIVE/BLT all 53 chars, body bit-equal */
function pubEq(a, b) {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.length === 53 && b.length === 53 && a.slice(3) === b.slice(3);
}


function collectWifs(node, out) {
  out = out || [];
  if (typeof node === 'string') {
    const t = node.trim();
    if (WIF_RE.test(t)) out.push(t);
    else {
      /* base64(JSON) bundles / multiline envs: extract any WIF-shaped substring */
      const m = t.match(/[5JK][1-9A-HJ-NP-Za-km-z]{50}/g);
      if (m) out.push(...m);
      else {
        try {
          const dec = Buffer.from(t, 'base64').toString('utf8');
          if (dec && dec !== t) {
            try {
              const j = JSON.parse(dec);
              collectWifs(j, out);
            } catch (_) {
              const m2 = dec.match(/[5JK][1-9A-HJ-NP-Za-km-z]{50}/g);
              if (m2) out.push(...m2);
            }
          }
        } catch (_) { /* not base64 */ }
      }
    }
  } else if (Array.isArray(node)) node.forEach(x => collectWifs(x, out));
  else if (node && typeof node === 'object') Object.values(node).forEach(x => collectWifs(x, out));
  return out;
}

function livePubkey(acct, role) {
  const auth = acct && acct[role];
  if (!auth) return null;
  if (auth.key_auths && auth.key_auths[0] && auth.key_auths[0][0]) return auth.key_auths[0][0];
  if (auth.key) return auth.key;
  return null;
}

/**
 * resolve({ rpc, account, role, steem, candidates:[{name, env}] })
 * → { secretName, wif } | null ; prints census lines only.
 */
async function resolve(opts) {
  const { rpc, account, role, steem, candidates } = opts;
  const res = await rpc('condenser_api.get_accounts', [[account]]);
  const acct = (res || [])[0];
  if (!acct) { console.log('CENSUS-NO-ACCOUNT ' + account); return null; }
  const live = livePubkey(acct, role);
  if (!live) { console.log('CENSUS-NO-LIVE-AUTHORITY ' + account + ':' + role); return null; }
  for (const c of candidates) {
    const raw = (process.env[c.name] || '').trim();
    if (!raw) { console.log('CENSUS-ABSENT ' + c.name); continue; }
    const wifs = collectWifs(raw);
    for (const w of wifs) {
      try {
        if (pubEq(steem.auth.wifToPublic(w), live)) {
          console.log('CENSUS-MATCH ' + c.name + ' → ' + account + ':' + role + ' (bit-exact vs live authority)');
          return { secretName: c.name, wif: w };
        }
      } catch (_) { /* not a valid wif */ }
    }
    /* saos-engine seed-orders derivation (mini-services/saos-engine/steemtx.mjs SEED_ORDERS) */
    const ORDERS = [
      (a, r, p) => a + r + p, (a, r, p) => p + r + a,
      (a, r, p) => a + p + r, (a, r, p) => p + a + r,
      (a, r, p) => r + a + p, (a, r, p) => r + p + a
    ];
    for (let oi = 0; oi < ORDERS.length; oi++) {
      try {
        const swif = sha256Wif(ORDERS[oi](account, role, raw));
        if (pubEq(steem.auth.wifToPublic(swif), live)) {
          console.log('CENSUS-MATCH ' + c.name + ' (seed-order derivation o' + oi + ') -> ' + account + ':' + role);
          return { secretName: c.name, wif: swif };
        }
      } catch (_) { /* derive fail */ }
    }
    /* master-password derivation */
    try {
      const keys = steem.auth.getPrivateKeys(account, raw, [role]);
      if (keys && keys[role] && pubEq(steem.auth.wifToPublic(keys[role]), live)) {
        console.log('CENSUS-MATCH ' + c.name + ' (master-password derivation) → ' + account + ':' + role);
        return { secretName: c.name, wif: keys[role] };
      }
    } catch (_) { /* not a password */ }
    console.log('CENSUS-NO-MATCH ' + c.name + ' (' + wifs.length + ' wif-shapes tried)');
  }
  console.log('CENSUS-EXHAUSTED no candidate matches ' + account + ':' + role + ' — owner must provision the correct secret');
  return null;
}

module.exports = { resolve, collectWifs, livePubkey, WIF_RE };
