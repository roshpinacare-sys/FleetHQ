/**
 * /api/worlds-state — מקרר-האמת של העולמות (צד-שרת בלבד). [T13 · T14 · T-audit]
 * ---------------------------------------------------------------------------
 * · כל-מקור נאחזר דרך gh-truth: ציבורי=raw, פרטי(Sandbox/beacon/lighthouse)=API-מאומת-שרת.
 *   (לפני-התיקון: 5 מקורות-פרטיים נאחזרו אנונימית → 404 תמידי → "חמש-עולמות-חיים" היו חצי-מתות.)
 * · SWR: אין-חסימות-ארוכות; תשובה מיידית מהקאש + רענון-רקע.
 * · כל-מקור נושא fetchedAt + ageMs; נתון-גולמי עתיק (>24h) מסומן staleData (חוק-החיות).
 * · fail-soft לכל-מקור — התשובה תמיד כנה לגבי מה שחסר. אין המצאות.
 */
import { NextResponse } from 'next/server';
import { fetchTruth, ageMs } from '@/lib/gh-truth';
import type {
  BeaconWire, BootVerifyWire, ChainWire, ConnectivityWire, DecisionsWire, DexWire, FleetHealthWire, FlowDataWire, ForemanWire,
  FreshOracleWire, LighthouseWire, ValueScanWire, VerifyWire, WorldsPayload,
} from '@/lib/worlds/types';

export const revalidate = 0;

const TTL_MS = 60_000;
const STALE_LAW_MS = 24 * 60 * 60 * 1000; // חוק-החיות: >24h = היסטורי

interface SourceBox<T> {
  ok: boolean;
  error?: string;
  data?: T;
  fetchedAt?: string;
  ageMs?: number;
  staleData?: boolean;
}

function extractTs(d: unknown, depth = 0): number | null {
  if (!d || typeof d !== 'object' || depth > 2) return null;
  const o = d as Record<string, unknown>;
  for (const k of ['at', 'updatedAt', 'generatedAt', 'publishedAt', 'measuredAt', 'fetchedAt', 'timestamp']) {
    const v = o[k];
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const t = extractTs(v, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

function box<T>(r: { ok: boolean; data: T | null; error?: string; fetchedAt: string }): SourceBox<T> {
  if (!r.ok || r.data === null) {
    return { ok: false, error: r.error ?? 'unavailable', fetchedAt: r.fetchedAt, ageMs: ageMs(r.fetchedAt) };
  }
  const ts = extractTs(r.data);
  return {
    ok: true,
    data: r.data,
    fetchedAt: r.fetchedAt,
    ageMs: ageMs(r.fetchedAt),
    ...(ts !== null && Date.now() - ts > STALE_LAW_MS ? { staleData: true } : {}),
  };
}

/** [T15] רשת-האמת: המאמת-העצמי (51 טענות מדודות) + שער-האמת של האתר-החי */
async function fetchVerify(): Promise<VerifyWire | null> {
  const [avRaw, tgRaw] = await Promise.all([
    fetchTruth<{ summary?: { total: number; passed: number; failed: number; verdict: string }; generatedAt?: string; results?: { id: string; ok: boolean; details?: string }[] }>(
      'Console', 'agent/verify/results.json', { ttlMs: TTL_MS }),
    fetchTruth<{ at?: string; verdict?: string; counts?: { pass: number; fail: number; skip: number }; results?: { gate: string; status: string; note?: string; measured?: string }[] }>(
      'Console', 'truth/latest.json', { ttlMs: TTL_MS }),
  ]);
  if (!avRaw.ok && !tgRaw.ok) return null;
  return {
    summary: avRaw.data?.summary,
    generatedAt: avRaw.data?.generatedAt,
    failures: (avRaw.data?.results ?? []).filter((r) => !r.ok).map((r) => ({ id: r.id, details: r.details })),
    truthGate: tgRaw.data ? {
      at: tgRaw.data.at,
      verdict: tgRaw.data.verdict,
      counts: tgRaw.data.counts,
      redGates: (tgRaw.data.results ?? []).filter((g) => g.status === 'FAIL').map((g) => ({ gate: g.gate, note: g.note, measured: g.measured })),
    } : undefined,
  };
}

/** מדידת-שרשרת ישירה — המרה מדויקת (ביקורת-אמת עצמאית למשואה) */
// [T27 perf] SWR cache for chain measurement: a live round-trip to Steem costs ~0.8-1s per request.
// Display law — the measurement is presented with its fetchedAt, single-flight background refresh.
// A 60s TTL does not change the treasury picture (vesting calculations move slowly), but the endpoint
// goes from ~1s to tens of ms on warm cache.
const chainG = globalThis as unknown as {
  __chainCache?: { at: number; chain: ChainWire | null };
  __chainInflight?: Promise<ChainWire | null>;
};
const CHAIN_TTL_MS = 60_000;

async function measureChainCached(): Promise<ChainWire | null> {
  const cache = chainG.__chainCache;
  const age = cache ? Date.now() - cache.at : Infinity;
  if (cache && age < CHAIN_TTL_MS) return cache.chain;
  if (chainG.__chainInflight) return cache ? cache.chain : chainG.__chainInflight;
  const p = measureChain()
    .then((c) => {
      chainG.__chainCache = { at: Date.now(), chain: c };
      return c;
    })
    .finally(() => {
      chainG.__chainInflight = undefined;
    });
  chainG.__chainInflight = p;
  if (cache) return cache.chain;
  return p;
}

async function measureChain(): Promise<ChainWire | null> {
  const POST = 'https://api.steemit.com';
  try {
    const body = (method: string, params: unknown[]) =>
      JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const h = { 'Content-Type': 'application/json' };
    const [gRes, aRes] = await Promise.all([
      fetch(POST, { method: 'POST', body: body('condenser_api.get_dynamic_global_properties', []), headers: h, cache: 'no-store', signal: AbortSignal.timeout(7000) }),
      fetch(POST, { method: 'POST', body: body('condenser_api.get_accounts', [['headcorner']]), headers: h, cache: 'no-store', signal: AbortSignal.timeout(7000) }),
    ]);
    if (!gRes.ok || !aRes.ok) return null;
    const gp = (await gRes.json())?.result;
    const acc = (await aRes.json())?.result?.[0];
    if (!gp || !acc) return null;
    const tvs = parseFloat(String(gp.total_vesting_shares ?? '0'));
    const tvf = parseFloat(String(gp.total_vesting_fund_steem ?? '0'));
    if (!tvs || !tvf) return null;
    const mult = tvf / tvs;
    const vests = parseFloat(String(acc.vesting_shares ?? '0'));
    const dele = parseFloat(String(acc.delegated_vesting_shares ?? '0'));
    const recv = parseFloat(String(acc.received_vesting_shares ?? '0'));
    return {
      head: gp.head_block_number, time: gp.time, mult,
      treasuryNetSp: Math.round((vests - dele + recv) * mult * 10) / 10,
      delegatedOutSp: Math.round(dele * mult * 10) / 10,
      receivedInSp: Math.round(recv * mult * 10) / 10,
      balanceSteem: parseFloat(String(acc.balance ?? '0')),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [flow, lh, beacon, dex, vs, dec, foreman, chainRaw, verifyRaw, fleetHealth, freshOracle, connectivity, bootVerify] = await Promise.all([
    fetchTruth<FlowDataWire>('Sandbox', 'ops/flow/flow-map.json', { ttlMs: TTL_MS }),
    fetchTruth<LighthouseWire>('sovereign-lighthouse', 'state.json', { ttlMs: TTL_MS }),
    fetchTruth<BeaconWire>('sovereign-beacon', 'state.json', { ttlMs: TTL_MS }),
    fetchTruth<DexWire>('Domain', 'dex/grid.json', { ttlMs: TTL_MS }),
    fetchTruth<ValueScanWire>('Sandbox', 'ops/sovereign/VALUE-SCAN/state.json', { ttlMs: TTL_MS }),
    fetchTruth<DecisionsWire>('Sandbox', 'ops/sovereign/DECIDER/state.json', { ttlMs: TTL_MS }),
    fetchTruth<ForemanWire>('FleetHQ', 'office/state/office-state.json', { ttlMs: TTL_MS }),
    measureChainCached(),
    fetchVerify(),
    // [T-watch] מישור-הבקרה — GridWatch ריפו ציבורי; TTL 120s (ה-watch עצמו רץ כל 30 דק')
    fetchTruth<FleetHealthWire>('GridWatch', 'state/fleet-health.json', { ttlMs: 120_000 }),
    // [T-merge מהענן] מקורות-אמת של מסלולות-הענן — fresh-oracle / connectivity / boot-verify
    fetchTruth<FreshOracleWire>('FleetHQ', 'receipts/fresh-oracle/latest.json', { ttlMs: TTL_MS }),
    fetchTruth<ConnectivityWire>('FleetHQ', 'office/state/connectivity.json', { ttlMs: TTL_MS }),
    fetchTruth<BootVerifyWire>('FleetHQ', 'receipts/boot-verify.json', { ttlMs: TTL_MS }),
  ]);

  const chain = chainRaw
    ? { ok: true as const, data: chainRaw, fetchedAt: new Date().toISOString(), ageMs: 0 }
    : { ok: false as const, error: 'unavailable' };
  // [T-merge מהענן] גיל-כנה לקבלת-האתחול (שעות) — מזמן-הקבלה עצמו
  const bootTsRaw = extractTs(bootVerify.data);
  const bootAgeH = bootTsRaw !== null ? Math.round((Date.now() - bootTsRaw) / 3_600_000) : null;

  const payload: WorldsPayload = {
    fetchedAt: new Date().toISOString(),
    flow: box(flow),
    lighthouse: box(lh),
    beacon: box(beacon),
    dex: box(dex),
    valueScan: box(vs),
    decisions: box(dec),
    foreman: box(foreman),
    chain,
    verify: verifyRaw
      ? { ok: true, data: verifyRaw, fetchedAt: new Date().toISOString(), ageMs: 0 }
      : { ok: false, error: 'not-published-yet' },
    fleetHealth: box(fleetHealth),
    freshOracle: box(freshOracle),
    connectivity: box(connectivity),
    bootVerify: { ...box(bootVerify), ...(bootAgeH !== null ? { ageH: bootAgeH } : {}) },
  };

  return NextResponse.json(payload, { headers: { 'x-worlds-cache': 'swr' } });
}
