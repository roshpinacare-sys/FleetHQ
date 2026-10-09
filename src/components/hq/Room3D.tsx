/**
 * Room3D.tsx — החדר התלת-מימדי המאוחד בתוך AgentHQ.
 * נטען דינמית (client-only) מתוך מסך המשרד: קנבס + סרגל תצפית מקצועי.
 * כל הנתונים מגיעים מהגשר (lib/hq/store) — AgentHQ מזרים את הפורמן האמיתי.
 * אין מיני-מפת-שחקן ואין ג'ויסטיק: הניווט הוא נקודות-תצפית אדריכליות.
 */
'use client';

import { useEffect } from 'react';
import { Office3D } from './Office3D';
import { ViewDeck } from './ViewDeck';
import { useHq } from '@/lib/hq/store';

export default function Room3D() {
  useEffect(() => {
    // debug hook (dev): live crew brains for browser probing
    (window as unknown as Record<string, unknown>).__hqBrains = useHq.getState().brains;
  }, []);
  return (
    <div className="relative h-full w-full" dir="rtl">
      <Office3D />
      <ViewDeck />
    </div>
  );
}
