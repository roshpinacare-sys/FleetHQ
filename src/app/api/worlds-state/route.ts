/**
 * /api/worlds-state — מקרר-האמת של העולמות (צד-שרת בלבד). [T13 · T14]
 * ---------------------------------------------------------------------------
 * מאגד מקורות-אמת ציבוריים keyless בעבור העולמות-החדשים:
 *  · Sandbox ops/flow/flow-map.json — מפת-הזרימה האמיתית (zai-code-3/F-series) — צריכה-בלבד
 *  · sovereign-lighthouse state.json — דופק-המגדלור + lastKnownAlive
 *  · sovereign-beacon state.json — האמת הכלכלית המפורסמת
 *  · Domain dex/grid.json — פס-ייצור ה-DEX האמיתי
 *  · Sandbox ops/sovereign/VALUE-SCAN/state.json — סריקת-הערך האוטונומית (עשוי להיות חסר — כנה עליו)
 *  · Sandbox ops/sovereign/DECIDER/state.json — הכרעות-הריבונות [T14 — הריבונות מכריעה בעצמה]
 *  · FleetHQ office-state.json — שיקוף סוכנים/משימות לעולם-המקביל וללוח-הגיוס
 *  · Console agent/verify/results.json + truth/latest.json — רשת-האמת (המאמת-העצמאי + שער-האמת) [T15]
 *  · מדידת-שרשרת ישירה (api.steemit.com) — המרה מדויקת של SP; מהווה ביקורת-אמת עצמאית למשואה
 * כל מקור נכשל לבד (fail-soft) — התשובה תמיד כנה לגבי מה שחסר. אין המצאות.
 */
import { NextResponse } from 'next/server';
import type {
  BeaconWire, ChainWire, DecisionsWire, DexWire, FlowDataWire, ForemanWire,
  LighthouseWire, ValueScanWire, VerifyWire, WorldsPayload,
} from '@/lib/worlds/types';

export const revalidate = 0;

const RAW = 'https://raw.githubusercontent.com/roshpinacare-sys';
const TTL_MS = 60_000;

type CacheBox = { at: number; data: WorldsPayload };
const g = globalThis as unknown as { __worldsStateCache?: CacheBox };

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** [T15] רשת-האמת: המאמת-העצמאי (51 טענות מדודות) + שער-האמת של האתר-החי */
async function fetchVerify(): Promise<VerifyWire | null> {
  const [avRaw, tgRaw] = await Promise.all([
    fetchJson<{ summary?: { total: number; passed: number; failed: number; verdict: string }; generatedAt?: string; results?: { id: string; ok: boolean; details?: string }[] }>(
      `${RAW}/Console/main/agent/verify/results.json`),
    fetchJson<{ at?: string; verdict?: string; counts?: { pass: number; fail: number; skip: number }; results?: { gate: string; status: string; note?: string; measured?: string }[] }>(
      `${RAW}/Console/main/truth/latest.json`),
  ]);
  if (!avRaw && !tgRaw) return null;
  return {
    summary: avRaw?.summary,
    generatedAt: avRaw?.generatedAt,
    failures: (avRaw?.results ?? []).filter((r) => !r.ok).map((r) => ({ id: r.id, details: r.details })),
    truthGate: tgRaw ? {
      at: tgRaw.at,
      verdict: tgRaw.verdict,
      counts: tgRaw.counts,
      redGates: (tgRaw.results ?? []).filter((g) => g.status === 'FAIL').map((g) => ({ gate: g.gate, note: g.note, measured: g.measured })),
    } : undefined,
  };
}

/** מדידת-שרשרת ישירה — המרה מדויקת (ביקורת-אמת עצמאית למשואה) */
async function measureChain(): Promise<ChainWire | null> {
  const POST = 'https://api.steemit.com';
  try {
    const body = (method: string, params: unknown[]) =>
      JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const h = { 'Content-Type': 'application/json' };
    const [gRes, aRes] = await Promise.all([
      fetch(POST, { method: 'POST', body: body('condenser_api.get_dynamic_global_properties', []), headers: h, cache: 'no-store', signal: AbortSignal.timeout(9000) }),
      fetch(POST, { method: 'POST', body: body('condenser_api.get_accounts', [['headcorner']]), headers: h, cache: 'no-store', signal: AbortSignal.timeout(9000) }),
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
  const now = Date.now();
  const cached = g.__worldsStateCache;
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, { headers: { 'x-worlds-cache': 'hit' } });
  }

  const [flowRaw, lhRaw, beaconRaw, dexRaw, vsRaw, decRaw, foremanRaw, chainRaw, verifyRaw] = await Promise.all([
    fetchJson<FlowDataWire>(`${RAW}/Sandbox/main/ops/flow/flow-map.json`),
    fetchJson<LighthouseWire>(`${RAW}/sovereign-lighthouse/main/state.json`),
    fetchJson<BeaconWire>(`${RAW}/sovereign-beacon/main/state.json`),
    fetchJson<DexWire>(`${RAW}/Domain/main/dex/grid.json`),
    fetchJson<ValueScanWire>(`${RAW}/Sandbox/main/ops/sovereign/VALUE-SCAN/state.json`),
    fetchJson<DecisionsWire>(`${RAW}/Sandbox/main/ops/sovereign/DECIDER/state.json`),
    fetchJson<ForemanWire>(`${RAW}/FleetHQ/main/office/state/office-state.json`),
    measureChain(),
    fetchVerify(),
  ]);

  const payload: WorldsPayload = {
    fetchedAt: new Date().toISOString(),
    flow: { ok: !!flowRaw, ...(flowRaw ? { data: flowRaw } : { error: 'unavailable' }) },
    lighthouse: { ok: !!lhRaw, ...(lhRaw ? { data: lhRaw } : { error: 'unavailable' }) },
    beacon: { ok: !!beaconRaw, ...(beaconRaw ? { data: beaconRaw } : { error: 'unavailable' }) },
    dex: { ok: !!dexRaw, ...(dexRaw ? { data: dexRaw } : { error: 'unavailable' }) },
    valueScan: { ok: !!vsRaw, ...(vsRaw ? { data: vsRaw } : { error: 'not-published-yet' }) },
    decisions: { ok: !!decRaw, ...(decRaw ? { data: decRaw } : { error: 'not-published-yet' }) },
    foreman: { ok: !!foremanRaw, ...(foremanRaw ? { data: foremanRaw } : { error: 'unavailable' }) },
    chain: { ok: !!chainRaw, ...(chainRaw ? { data: chainRaw } : { error: 'unavailable' }) },
    verify: { ok: !!verifyRaw, ...(verifyRaw ? { data: verifyRaw } : { error: 'not-published-yet' }) },
  };

  g.__worldsStateCache = { at: now, data: payload };
  return NextResponse.json(payload, { headers: { 'x-worlds-cache': 'miss' } });
}
