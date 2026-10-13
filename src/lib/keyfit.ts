import { createHash } from 'crypto';

/**
 * keyfit.ts — בדיקת-התאמה-חיה של מפתח-המנהל מול STEEM/BLURT (צד-שרת בלבד).
 * ---------------------------------------------------------------------------
 * · מאמת WIF (base58check, גרסה 0x80, קידומת-P נתמכת) — בלי לשמור/לרשום אותו.
 * · גוזר את המפתח-הציבורי ובודק מול רשויות-השרשרת בזמן-אמת.
 * · כנות: כישלון-צומת = דיווח-כנה, לא-הצלחה-מזויפת.
 */

// --- secp256k1 minimal (noble-compatible DER-free: pubkey derivation only) ---
// משתמשים ב-@noble/secp256k1 שכבר-מותקן
import * as secp from '@noble/secp256k1';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function b58decode(s: string): Buffer {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('bad-b58');
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16).padStart(2, '0');
  if (hex.length % 2) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  let pad = 0;
  for (const c of s) {
    if (c === '1') pad++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(pad), buf]);
}
function b58encode(buf: Buffer): string {
  let n = 0n;
  for (const x of buf) n = n * 256n + BigInt(x);
  let s = '';
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const x of buf) {
    if (x === 0) s = '1' + s;
    else break;
  }
  return s;
}
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();
const ripemd160 = (b: Buffer) => createHash('ripemd160').update(b).digest();

export interface WifCheck {
  wifValid: boolean;
  hadPrefix: boolean;
  fingerprint: string;
  derivedPub: string;
  error?: string;
}

/** מנתח מפתח-פרטי (WIF) ומחזיר בדיקה + מפתח-ציבורי גזור. אפס-פלט-סודי. */
export function checkWif(raw: string): WifCheck {
  const fail = (error: string): WifCheck => ({ wifValid: false, hadPrefix: false, fingerprint: '', derivedPub: '', error });
  let wif = (raw ?? '').trim();
  let hadPrefix = false;
  if (wif.length === 52 && wif.startsWith('P')) {
    wif = wif.slice(1);
    hadPrefix = true;
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{51}$/.test(wif)) return fail('פורמט-WIF-לא-תקין');
  let dec: Buffer;
  try {
    dec = b58decode(wif);
  } catch {
    return fail('base58-לא-תקין');
  }
  if (dec.length !== 37) return fail('אורך-WIF-לא-תקין');
  const payload = dec.slice(0, -4);
  const checksum = dec.slice(-4);
  if (!sha256(sha256(payload)).slice(0, 4).equals(checksum)) return fail('סכום-ביקורת-WIF-נכשל');
  if (payload[0] !== 0x80) return fail('גרסת-WIF-לא-צפויה');
  const priv = payload.slice(1);
  try {
    const pub33 = Buffer.from(secp.getPublicKey(priv, true));
    // [T-audit תיקון] סכום-הביקורת של גרפן: ripemd160(pub_buf) ישירות — לפני-כן היה
    // ripemd160(sha256(pub)) → קידוד-מפתח-שגוי → כל-השוואות-הרשויות חושבו מול-מפתח-לא-תקין.
    const ck = ripemd160(pub33).slice(0, 4);
    const derivedPub = 'STM' + b58encode(Buffer.concat([pub33, ck]));
    return {
      wifValid: true,
      hadPrefix,
      fingerprint: `P${wif.slice(0, 4)}…${wif.slice(-4)}`,
      derivedPub,
    };
  } catch {
    return fail('גזירת-מפתח-ציבורי-נכשלה');
  }
}

// --- chain probes ---

async function rpc(url: string, method: string, params: unknown, timeoutMs = 12000): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const txt = await res.text();
  try {
    const j = JSON.parse(txt) as { error?: unknown; result?: unknown };
    if (j.error) throw new Error('rpc-error');
    return j.result;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('non-json-response');
    throw e;
  }
}

interface AccountAuth {
  name: string;
  posting?: { key_auths?: [string, number][] };
  active?: { key_auths?: [string, number][] };
  owner?: { key_auths?: [string, number][] };
  memo_key?: string;
}

export interface ChainFit {
  reachable: boolean;
  node?: string;
  accountExists?: boolean;
  registeredRoles: string[];
  note?: string;
}

const STEEM_NODES = ['https://api.justyy.com', 'https://api.steemit.com'];
const BLURT_NODES = [
  'https://rpc.blurt.world',
  'https://blurt.blkctracker.com',
  'https://api.blurt.buzz',
  'https://blurt-rpc.saboin.com',
];

const MAIN_ACCOUNT = 'headcorner'; // בדיקת-התאמה מול רשויות-החשבון-הראשי (מידע-ציבורי-על-השרשרת)

async function fitChain(
  nodes: string[],
  pub: string,
  bltPub: string,
  nodeTimeoutMs = 9000,
): Promise<ChainFit> {
  let lastErr = '';
  for (const node of nodes) {
    try {
      const accs = (await rpc(node, 'condenser_api.get_accounts', [[MAIN_ACCOUNT]], nodeTimeoutMs)) as AccountAuth[];
      const acc = accs?.[0];
      if (!acc) return { reachable: true, node, accountExists: false, registeredRoles: [], note: 'account-missing-on-chain' };
      const roles: string[] = [];
      for (const role of ['posting', 'active', 'owner'] as const) {
        if ((acc[role]?.key_auths ?? []).some(([k]) => k === pub || k === bltPub)) roles.push(role);
      }
      if (acc.memo_key === pub || acc.memo_key === bltPub) roles.push('memo');
      return { reachable: true, node, accountExists: true, registeredRoles: roles, note: roles.length ? 'key-fit-confirmed' : 'key-not-registered-on-authorities' };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : 'unknown';
    }
  }
  return { reachable: false, registeredRoles: [], note: lastErr || 'all-nodes-unreachable' };
}

export interface KeyfitResult {
  ok: boolean;
  wif: WifCheck;
  bltPub: string;
  steem: ChainFit;
  blurt: ChainFit;
  verdict: string;
  measuredAt: string;
}

/** בדיקה מלאה: תקינות-מפתח + התאמה-מול-STEEM + מצב-BLURT. */
export async function runKeyfit(raw: string): Promise<KeyfitResult> {
  const wif = checkWif(raw);
  const empty: ChainFit = { reachable: false, registeredRoles: [], note: 'invalid-key' };
  if (!wif.wifValid) {
    return { ok: false, wif, bltPub: '', steem: empty, blurt: empty, verdict: 'INVALID-KEY', measuredAt: new Date().toISOString() };
  }
  const pub33 = b58decode(wif.derivedPub.slice(3)).slice(0, 33);
  // אותו-תיקון: ripemd160 ישיר (סכמת-גרפן זהה ל-BLURT)
  const bltPub = 'BLT' + b58encode(Buffer.concat([pub33, ripemd160(pub33).slice(0, 4)]));
  const [steem, blurt] = await Promise.all([
    fitChain(STEEM_NODES, wif.derivedPub, bltPub),
    fitChain(BLURT_NODES, wif.derivedPub, bltPub, 8000),
  ]);
  const verdict = !steem.reachable
    ? 'STEEM-UNREACHABLE'
    : steem.registeredRoles.length
      ? 'KEY-FIT-CONFIRMED'
      : 'KEY-NOT-REGISTERED';
  return { ok: true, wif, bltPub, steem, blurt, verdict, measuredAt: new Date().toISOString() };
}
