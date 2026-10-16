// /api/worlds-state — גשר-האמת של העולמות (T-59 worlds-wiring, Task 15 lane claim a3643a40).
// המקור ש-worlds/README מכריז עליו ושהיה חסר (404 נמדד ב-FleetHQ וב-Sandbox).
// אפס סודות: כל המקורות keyless פומביים. כל מקור עשוי להיפול → ok:false + error —
// לעולם לא מילוי-מדומה (חוק-האמת של worlds/). cache 60s.
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export const dynamic = 'force-dynamic'

const ORG = 'roshpinacare-sys'
const RAW = `https://raw.githubusercontent.com/${ORG}`
const SRC = {
  flow: `${RAW}/Sandbox/main/ops/flow/flow-map.json`,
  lighthouse: `${RAW}/sovereign-lighthouse/main/state.json`,
  beacon: `${RAW}/sovereign-beacon/main/state.json`,
  dex: `${RAW}/Domain/main/dex/pnl-desk.json`,
  officeState: `${RAW}/FleetHQ/main/office/state/office-state.json`,
  valueScan: `${RAW}/FleetHQ/main/office/state/value-scan.json`,
  // [zai-14] החיבורים החסרים — קבלות שהיו ללא קורא, עכשיו אוכל
  connectivity: `${RAW}/FleetHQ/main/office/state/connectivity.json`,
  bootVerify: `${RAW}/FleetHQ/main/receipts/boot-verify.json`,
  // [T15] רשת-האמת של הקונסולה — המאמת-העצמאי + שער-האמת
  agentVerify: `${RAW}/Console/main/agent/verify/results.json`,
  truthGate: `${RAW}/Console/main/truth/latest.json`,
  freshOracle: `${RAW}/FleetHQ/main/receipts/fresh-oracle/latest.json`,
}

// זהות מדויקת של מדידת-השרשרת — שכפול נאמן של beacon-pulse.yml (מקור-האמת הפומבי)
const STEEM_ACCS = ['headcorner', 'israelnews', 'macrame', 'woq', 'tov', 'lsa', 'wic', 'wog', 'siq', 'cashmachine', 'hcsoldier4', 'hcsoldier5', 'hcsoldier6']
const num = (x: unknown) => parseFloat(String(x ?? '0').split(' ')[0]) || 0

async function fetchJson<T = Record<string, unknown>>(url: string, ms = 9000): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' })
    if (!res.ok) return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}` }
    return { ok: true, status: res.status, data: (await res.json()) as T }
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'unknown' }
  }
}

async function steemRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const body = { jsonrpc: '2.0', method: 'call', params: ['condenser_api', method, params], id: 1 }
  try {
    const res = await fetch('https://api.steemit.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(9000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const j = (await res.json()) as { result?: T }
    return j.result ?? null
  } catch {
    return null
  }
}

async function measureChain(): Promise<{ ok: boolean; error?: string; head?: number; time?: string; treasuryNetSp?: number | null; delegatedOutSp?: number | null; receivedInSp?: number | null; balanceSteem?: number | null }> {
  const dp = await steemRpc<{ head_block_number: number; time: string; total_vesting_fund_steem: string; total_vesting_shares: string }>('get_dynamic_global_properties', [])
  if (!dp) return { ok: false, error: 'steem rpc unavailable' }
  const k = num(dp.total_vesting_fund_steem) / num(dp.total_vesting_shares)
  const accs = await steemRpc<{ name: string; vesting_shares: string; received_vesting_shares: string; delegated_vesting_shares: string; balance: string }[]>('get_accounts', [STEEM_ACCS])
  if (!accs || !Array.isArray(accs)) return { ok: false, error: 'steem accounts unavailable' }
  let treasuryNetSp: number | null = null
  let delegatedOutSp: number | null = null
  let receivedInSp: number | null = null
  let balanceSteem: number | null = null
  for (const a of accs) {
    if (!a) continue
    const net = (num(a.vesting_shares) + num(a.received_vesting_shares) - num(a.delegated_vesting_shares)) * k
    if (a.name === 'headcorner') {
      treasuryNetSp = Math.round(net * 10) / 10
      delegatedOutSp = Math.round(num(a.delegated_vesting_shares) * k * 10) / 10
      receivedInSp = Math.round(num(a.received_vesting_shares) * k * 10) / 10
      balanceSteem = num(a.balance)
    }
  }
  return { ok: true, head: dp.head_block_number, time: dp.time, treasuryNetSp, delegatedOutSp, receivedInSp, balanceSteem }
}

type Src<T> = { ok: boolean; error?: string; data: T | null }

async function collect(): Promise<Record<string, unknown>> {
  const [flowR, lhR, bcnR, dexR, officeRaw, vsR, chainR, connRaw, bootRaw, oracleRaw, agentVerifyR, truthGateR] = await Promise.all([
    fetchJson(SRC.flow),
    fetchJson(SRC.lighthouse),
    fetchJson(SRC.beacon),
    fetchJson(SRC.dex),
    fetchJson(SRC.officeState),
    fetchJson(SRC.valueScan),
    measureChain(),
    fetchJson(SRC.connectivity),
    fetchJson(SRC.bootVerify),
    fetchJson(SRC.freshOracle),
    fetchJson(SRC.agentVerify),
    fetchJson(SRC.truthGate),
  ])

  // ---- foreman: עדיפות לקובץ המקומי (האפליקציה רצה ב-worktree — הטרי ביותר), raw כגיבוי
  type OfficeState = { capturedAt?: string; connected?: boolean; statusHe?: string; agents?: { id?: string; state?: string; activity?: string; since?: number }[]; tasks?: { id?: string; title?: string; status?: string; assignee?: string; updatedAt?: number }[] }
  let foreman: Src<OfficeState> = { ok: false, error: 'unavailable', data: null }
  try {
    const local = await readFile(path.join(process.cwd(), 'office', 'state', 'office-state.json'), 'utf-8')
    foreman = { ok: true, data: JSON.parse(local) as OfficeState }
  } catch {
    if (officeRaw.ok) foreman = { ok: true, data: officeRaw.data as OfficeState }
    else foreman = { ok: false, error: officeRaw.error ?? 'office-state unavailable', data: null }
  }
  const os = foreman.data
  const foremanWire = {
    capturedAt: os?.capturedAt ?? null,
    connected: os?.connected ?? null,
    statusHe: os?.statusHe ?? null,
    agents: (os?.agents ?? []).map((a) => ({ id: a.id, state: a.state, activity: a.activity, since: a.since })),
    tasks: (os?.tasks ?? []).map((t) => ({ id: t.id, title: t.title, status: t.status, assignee: t.assignee, updatedAt: t.updatedAt })),
  }

  // ---- beacon / lighthouse: state.pulses[] (החדשה ראשונה) + state.lastPulse
  type BeaconState = { generatedAt?: string; lastPulse?: Record<string, unknown>; pulses?: Record<string, unknown>[] }
  const pulseOf = (s: BeaconState | null) => s?.lastPulse ?? s?.pulses?.[0] ?? null
  const bcn = bcnR.data as BeaconState | null
  const lh = lhR.data as BeaconState | null

  // ---- dex: pnl-desk → DexWire (מיפוי כנה — רק מה שקיים)
  type Pnl = { generatedAt?: string; verdict?: string; law?: string; sources?: { fillLedger?: { fetched?: boolean; rows?: number } }; lifetime?: Record<string, unknown> }
  const pnl = dexR.data as Pnl | null
  const dexWire = pnl ? {
    ok: true,
    publishedAt: pnl.generatedAt ?? null,
    verdict: pnl.verdict ?? null,
    real: pnl.sources?.fillLedger?.fetched === true,
    honesty: { law: pnl.law ?? null, fills: pnl.lifetime?.fills ?? null, edgePct: pnl.lifetime?.edgePct ?? null },
  } : null

  // ---- [zai-14] connectivity / bootVerify / freshOracle: מקומי-קודם (ה-worktree הכי-טרי), raw כגיבוי
  const localFirst = async <T,>(localPath: string, raw: { ok: boolean; error?: string; data: T | null }): Promise<Src<T>> => {
    try {
      const local = await readFile(path.join(process.cwd(), localPath), 'utf-8')
      return { ok: true, data: JSON.parse(local) as T }
    } catch {
      return raw.ok
        ? { ok: true, data: raw.data as T }
        : { ok: false, error: raw.error ?? 'unavailable', data: null }
    }
  }
  const connectivity = await localFirst<Record<string, unknown>>('office/state/connectivity.json', connRaw)
  const bootVerify = await localFirst<Record<string, unknown>>('receipts/boot-verify.json', bootRaw)
  const freshOracle = await localFirst<Record<string, unknown>>('receipts/fresh-oracle/latest.json', oracleRaw)
  // גיל כנה של קבלת-האתחול — stale מוצג כ-stale, לעולם לא מולבש כטרי
  const bootAgeH = bootVerify.ok && bootVerify.data && typeof (bootVerify.data as { at?: string }).at === 'string'
    ? Math.round((Date.now() - Date.parse((bootVerify.data as { at: string }).at)) / 3_600_000 * 10) / 10
    : null

// ---- [T15] רשת-האמת: המאמת-העצמאי (51 טענות מדודות) + שער-האמת של האתר-החי —
// כשל → צ'יפ-אמבר כנה במשרד; אפס-כשל → המדידה-הירוקה המפורסמת. אפס-המצאות.
const avData = agentVerifyR.data as { summary?: { total: number; passed: number; failed: number; verdict: string }; generatedAt?: string; results?: { id: string; ok: boolean; details?: string }[] } | null
const tgData = truthGateR.data as { at?: string; verdict?: string; counts?: { pass: number; fail: number; skip: number }; results?: { gate: string; status: string; note?: string; measured?: string }[] } | null
const verifyWire = (agentVerifyR.ok || truthGateR.ok) ? {
  ok: true as const,
  error: null,
  data: {
    summary: avData?.summary ?? null,
    generatedAt: avData?.generatedAt ?? null,
    failures: (avData?.results ?? []).filter((r) => !r.ok).map((r) => ({ id: r.id, details: r.details })),
    truthGate: tgData ? {
      at: tgData.at ?? null,
      verdict: tgData.verdict ?? null,
      counts: tgData.counts ?? null,
      redGates: (tgData.results ?? []).filter((g) => g.status === 'FAIL').map((g) => ({ gate: g.gate, note: g.note ?? null, measured: g.measured ?? null })),
    } : null,
  },
} : { ok: false as const, error: truthGateR.error ?? agentVerifyR.error ?? 'verify unavailable', data: null }
  const out = {
    fetchedAt: new Date().toISOString(),
    flow: { ok: flowR.ok, error: flowR.error, data: flowR.data },
    lighthouse: { ok: lhR.ok, error: lhR.error, data: lh ? { generatedAt: lh.generatedAt ?? null, lastPulse: pulseOf(lh), lastKnownAlive: (lh as Record<string, unknown>).lastKnownAlive ?? null } : null },
    beacon: { ok: bcnR.ok, error: bcnR.error, data: bcn ? { generatedAt: bcn.generatedAt ?? null, lastPulse: pulseOf(bcn), lastKnownAlive: (bcn as Record<string, unknown>).lastKnownAlive ?? null } : null },
    dex: { ok: dexR.ok, error: dexR.error, data: dexWire },
    valueScan: vsR.ok
      ? { ok: true, data: vsR.data }
      : { ok: false, error: 'טרם פורסם — value-scan.yml רץ על הגיט כל 30 דק׳', data: null },
    foreman: { ok: foreman.ok, error: foreman.error, data: foremanWire },
    chain: { ok: chainR.ok, error: chainR.error, data: chainR.ok ? chainR : null },
    connectivity: { ok: connectivity.ok, error: connectivity.error, data: connectivity.data },
    bootVerify: { ok: bootVerify.ok, error: bootVerify.error, ageH: bootAgeH, data: bootVerify.data },
    freshOracle: { ok: freshOracle.ok, error: freshOracle.error, data: freshOracle.data },
    verify: { ok: verifyWire.ok, error: verifyWire.error, data: verifyWire.data },
  }
  return out
}

let cache: { at: number; payload: Record<string, unknown> } | null = null
const TTL = 60_000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL) return NextResponse.json(cache.payload)
  try {
    const payload = await collect()
    cache = { at: Date.now(), payload }

    return NextResponse.json(payload)
  } catch (err) {
    if (cache) return NextResponse.json(cache.payload)
    return NextResponse.json({ fetchedAt: new Date().toISOString(), error: `worlds-state bridge failed: ${(err as Error).message}` }, { status: 502 })
  }
}
