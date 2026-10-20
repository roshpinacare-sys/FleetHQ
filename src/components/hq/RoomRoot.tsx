/**
 * RoomRoot.tsx — שורש חדר-המשרד בדף הראשי.
 * ---------------------------------------------------------------------------
 * · Room3D נטען לקוח-בלבד (dynamic, ssr:false) — WebGL לא רץ בשרת.
 * · גשר-האמת מופעל כאן פעם-אחת: נתוני הפורמן האמיתיים זורמים לחדר.
 * · אין כאן פאנלים של AgentHQ (אין סוקט מקומי) — לחיצות בחדר עושות
 *   מיקוד-מצלמה בלבד, והחדר מציג את האמת המדודה מהגיט.
 */
'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { startTruthBridge } from '@/lib/hq/truth-bridge';
import { startFleetBridge } from '@/lib/hq/fleet';
import { startBroadcastBridge } from '@/lib/hq/broadcast';
import { startDecisionsBridge, useDecisions } from '@/lib/hq/decisions';
import { useHq } from '@/lib/hq/store';

const Room3D = dynamic(() => import('@/components/hq/Room3D'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center" dir="rtl" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 py-3.5 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line-strong)] border-t-[color:var(--accent)]" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[color:var(--ink)]">החדר התלת-ממדי נטען…</span>
      </div>
    </div>
  ),
});

export function RoomRoot() {
  useEffect(() => {
    // חוק-החיות (Task 8): החדר חי — סקר-אמת מהיר (12שנ') + דופק-הצי (4שנ')
    // + טיק שעון (1שנ') שמזרים גיל-נתון חי לכל הלוחות. אין מסך-קפוא.
    const stopTruth = startTruthBridge(12_000);
    const stopFleet = startFleetBridge(4_000);
    const tick = setInterval(() => useHq.getState().beatTick(), 1000);
    // גשר-השידור (T20) — המשמרת הקנונית חיה בענן; החדר מצטרף אליה באמצעה
    const stopBroadcast = startBroadcastBridge(60_000);
    // גשר-פנקס-ההכרעות (T22) — הדוכן חי מהמדידה בענן
    const stopDecisions = startDecisionsBridge(120_000);
    // חוק-ההתכנסות: סדר-עבודה פתוח P0 → הצוות מתכנס לדוכן (אמת מניעה, לא אנימציה)
    const unsub = useDecisions.subscribe((s) => {
      useHq.getState().syncAssembly(s.loaded && s.p0Count > 0);
    });
    // probe hook (Task 8): מיקומי-הצוות האמיתיים לבדיקת-דפדפן — מדידה, לא ניחוש
    (window as unknown as Record<string, unknown>).__hqBrains = () =>
      [...useHq.getState().brains.entries()].map(([id, b]) => ({
        id, x: Math.round(b.x), y: Math.round(b.y), yaw: +b.yaw.toFixed(2),
        walk: +b.walkAmt.toFixed(2), sit: +b.sitAmt.toFixed(2), station: b.station,
      }));
    return () => { stopTruth(); stopFleet(); clearInterval(tick); stopBroadcast(); stopDecisions(); unsub(); };
  }, []);
  return (
    <div className="relative h-full w-full">
      <Room3D />
    </div>
  );
}
