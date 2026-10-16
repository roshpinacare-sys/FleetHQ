/**
 * broadcast.ts — גשר השידור-החי (דפדפן בלבד, T20).
 * ---------------------------------------------------------------------------
 * המשרד הוא שידור של משמרת מתמשכת, לא סימולציה שנולדת בפתיחת דף. העולם
 * הקנוני מתקדם בענן (office-worldbeat כל 10 דק' ב-Domain) — החדר מצטרף
 * אליו באמצע המשמרת. הגשר סוקר את /api/world-broadcast, מזרים פאזה ויומן
 * לחנות, וכשהמראה לא נענית מחשב פאזה מקומית לפי אותו חוק-שעות בדיוק
 * (מסומן כמקומי — לא כקנוני).
 */
'use client';

import { useHq, type BroadcastInfo } from './store';
import { phaseOfJerusalem } from './world';

interface WirePayload {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  world: { t: number; engine?: string } | null;
  journal: { at: number; who: string; text: string }[];
}

/** חוק-הכנות — פעימה מעל 30 דק' = השידור מוקפא בפועל (ריתמת worldbeat נמדדת ב-10 דק') */
export const BEAT_STALE_MS = 30 * 60_000;

/**
 * גיבוי-לקוח — raw עם עוקף-מטמון, רק כשאין שרת (גרסה סטטית). עותק-קצה ישן
 * מסומן בגיל-הפעימה (BEAT_STALE_MS) — כנות נשמרת גם במסלול הזה.
 */
async function fetchDirect(): Promise<WirePayload | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/world-state.json?_=${Date.now()}`,
      { cache: 'no-store', signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return null;
    const world = (await res.json()) as { t: number; engine?: string };
    return { ok: true, fetchedAt: new Date().toISOString(), world, journal: [] };
  } catch {
    return null;
  }
}

async function pullBroadcastOnce(): Promise<void> {
  let payload: WirePayload | null = null;
  try {
    const res = await fetch('/api/world-broadcast', { cache: 'no-store', signal: AbortSignal.timeout(9000) });
    if (res.ok) payload = (await res.json()) as WirePayload;
  } catch {
    payload = null;
  }
  if (!payload) payload = await fetchDirect();

  const now = Date.now();
  const worldT = payload?.world && Number.isFinite(payload.world.t) ? payload.world.t : null;
  const phase = phaseOfJerusalem(worldT ?? now);
  const beatAgeMs = worldT !== null ? Math.max(0, now - worldT) : null;
  const info: BroadcastInfo = worldT !== null
    ? {
        ok: true,
        phase: phase.he,
        phaseKind: phase.kind,
        worldT,
        beatAgeMs,
        canonical: true,
        fetchedAt: payload!.fetchedAt ? Date.parse(payload!.fetchedAt) || now : now,
        journal: payload!.journal ?? [],
      }
    : {
        // כנות — אין מראה: הפאזה מחושבת מקומית לפי אותו חוק-שעות, ומסומנת כך
        ok: false,
        phase: phase.he,
        phaseKind: phase.kind,
        worldT: null,
        beatAgeMs: null,
        canonical: false,
        fetchedAt: now,
        journal: [],
      };
  useHq.getState().syncBroadcast(info);
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startBroadcastBridge(intervalMs = 60_000): () => void {
  void pullBroadcastOnce();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void pullBroadcastOnce(); }, intervalMs);
  return () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
}
