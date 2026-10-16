/**
 * fleet.ts — גשר דופק-הצי (Task 8): הדפדפן סוקר את /api/fleet-pulse כל 4 שניות
 * ומזרים את האמת החיה של כל-הפעילות-הענפה (כלכלה · rig · guard · מסילות ·
 * גיט-עבודה · שירותים) אל חנות-החדר. אין סימולציה — מה שנכשל נשאר null
 * והלוחות מציגים כנות.
 */
'use client';

import type { FleetPulse } from '@/app/api/fleet-pulse/route';
import { useHq } from './store';

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

export async function pullFleetOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch('/api/fleet-pulse', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const pulse = (await res.json()) as FleetPulse;
    useHq.getState().syncFleet(pulse);
  } catch {
    /* כנות: סקר כושל לא מעדכן — הלוח מציג את גיל הנתון האחרון */
  } finally {
    inFlight = false;
  }
}

export function startFleetBridge(intervalMs = 4000): () => void {
  void pullFleetOnce();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void pullFleetOnce(); }, intervalMs);
  return () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
}
