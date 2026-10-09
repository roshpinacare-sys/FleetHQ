/**
 * Room3D.tsx — החדר התלת-ממדי המאוחד בתוך AgentHQ.
 * נטען דינמית (client-only) מתוך מסך המשרד: קנבס + שליטה + מפת קומה.
 * כל הנתונים מגיעים מהגשר (lib/hq/store) — AgentHQ מזרים את הפורמן האמיתי.
 */
'use client';

import { useEffect } from 'react';
import { Office3D } from './Office3D';
import { Controls3D } from './Controls3D';
import { MiniMap } from './MiniMap';
import { useHq } from '@/lib/hq/store';

export default function Room3D() {
  useEffect(() => {
    // debug hook (dev): live crew brains for browser probing
    (window as unknown as Record<string, unknown>).__hqBrains = useHq.getState().brains;
  }, []);
  return (
    <div className="relative h-full w-full" dir="rtl">
      <Office3D />
      {/* מפת הקומה — פינה עליונה (התחלת הקריאה בעברית), שקופה ולא חוסמת */}
      <div className="absolute right-3 top-3 z-10 overflow-hidden rounded-lg border border-amber-400/20 shadow-xl">
        <MiniMap />
      </div>
      <Controls3D />
    </div>
  );
}
