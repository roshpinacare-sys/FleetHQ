/**
 * instrumentation.ts — חימום-מקורות-אמת בעליית-השרת. [T29 — ויעל]
 * ---------------------------------------------------------------------------
 * המדידה (dev.log): הפגיעות-הראשונות-אחרי-הפעלה משלמות-קור-על-הרשת
 * (office-state 400-850ms, world-broadcast עד 855ms). חוק-החימום: ברגע-עליית
 * השרת מזרימים את כל-מקורות-האמת החמים למטמוני SWR — הפגיעה-הראשונה של הממשק
 * מוגשת מהמטמון במקום לשלם-קור. אפס-התנהגות-חדשה: אותן-קריאות בדיוק שה-APIים
 * מריצים ממילא; רק מוקדמות. fire-and-forget — כישלון-חימום לא מפיל עלייה.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // מוקדם-אך-לא-חוסם: לתת לשרת לסיים-עלייה קודם
  setTimeout(() => {
    void warmTruthSources().catch(() => {
      /* חימום-שנכשל לא מפיל — ה-APIים ימדדו-כרגיל */
    });
  }, 250);
}

async function warmTruthSources(): Promise<void> {
  // [T29-הבהרה] רק gh-truth: מודול-זה נכרת גם-ל-Edge-instrumentation — אסור
  // לגרור לכאן git-state (node:crypto). Autonomy פומבי → raw מספיק.
  const { fetchTruth, fetchTruthText } = await import('@/lib/gh-truth');

  const jobs: Array<Promise<unknown>> = [
    // office-state (3)
    fetchTruth('FleetHQ', 'office/state/office-state.json', { ttlMs: 60_000 }),
    fetchTruth('Domain', 'office/data.json', { ttlMs: 60_000 }),
    fetchTruth('sovereign-beacon', 'state.json', { ttlMs: 60_000 }),
    // worlds-state (7)
    fetchTruth('sovereign-lighthouse', 'state.json', { ttlMs: 60_000 }),
    fetchTruth('Domain', 'dex/grid.json', { ttlMs: 60_000 }),
    fetchTruth('Sandbox', 'ops/flow/flow-map.json', { ttlMs: 60_000 }),
    fetchTruth('Sandbox', 'ops/sovereign/VALUE-SCAN/state.json', { ttlMs: 60_000 }),
    fetchTruth('Sandbox', 'ops/sovereign/DECIDER/state.json', { ttlMs: 60_000 }),
    fetchTruth('GridWatch', 'state/fleet-health.json', { ttlMs: 120_000 }),
    // queue-graph (2) + decisions (1)
    fetchTruthText('ops-intake', 'ops/QUEUE.json', { ttlMs: 120_000 }),
    fetchTruthText('ops-forge', 'ops/RECEIPTS.jsonl', { ttlMs: 120_000 }),
    fetchTruth('ops-intake', 'ops/QUEUE.json', { ttlMs: 120_000 }),
    // engineering + decisions-cycle (Autonomy פומבי — raw)
    fetchTruth('Autonomy', 'state/app/engineering.json', { ttlMs: 120_000 }),
    fetchTruth('Autonomy', 'state/app/decisions-cycle.json', { ttlMs: 120_000 }),
  ];
  await Promise.allSettled(jobs);
}
