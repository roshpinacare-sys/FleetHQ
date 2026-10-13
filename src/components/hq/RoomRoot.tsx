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
    const stopTruth = startTruthBridge(45_000);
    // גשר-השידור (T20) — המשמרת הקנונית חיה בענן; החדר מצטרף אליה באמצעה
    const stopBroadcast = startBroadcastBridge(60_000);
    // גשר-פנקס-ההכרעות (T22) — הדוכן חי מהמדידה בענן
    const stopDecisions = startDecisionsBridge(120_000);
    // חוק-ההתכנסות: סדר-עבודה פתוח P0 → הצוות מתכנס לדוכן (אמת מניעה, לא אנימציה)
    const unsub = useDecisions.subscribe((s) => {
      useHq.getState().syncAssembly(s.loaded && s.p0Count > 0);
    });
    return () => { stopTruth(); stopBroadcast(); stopDecisions(); unsub(); };
  }, []);
  return (
    <div className="relative h-full w-full">
      <Room3D />
    </div>
  );
}
