/**
 * WorldDeck.tsx — במת-העולמות: לשוניות-עולם מעל הדף הראשי. [T13]
 * ---------------------------------------------------------------------------
 * משרד (T12, קיים) · רשת (מפת-הזרימה החיה) · עסקים (אולם-האוצרה) ·
 * מקביל (גן-הנפש, מטאפורות של מדידות) · גיוס·ערך (לוח-הלולאה האוטונומית).
 * סקר-אמת אחד משותף (60 שניות) מזרים את אותן מדידות לכל העולמות —
 * מקור-אחד, אפס-המצאות, כנות-מלאה כשמקור נופל.
 */
'use client';

import { useState } from 'react';
import { RoomRoot } from '@/components/hq/RoomRoot';
import { useWorldsState, ageHe } from '@/lib/worlds/bridge';
import { NetworkWorld } from './NetworkWorld';
import { BusinessWorld } from './BusinessWorld';
import { ParallelWorld } from './ParallelWorld';
import { RecruitmentBoard } from './RecruitmentBoard';
import { SelfWorld } from './SelfWorld'; // [zai-14] עולם-העצמי — אדיטיבי

type WorldId = 'office' | 'network' | 'business' | 'parallel' | 'recruit' | 'self';

const TABS: { id: WorldId; label: string; hint: string }[] = [
  { id: 'office', label: 'משרד', hint: 'חדר-הפיקוד התלת-ממדי' },
  { id: 'network', label: 'רשת', hint: 'מפת-הזרימה החיה של האורגניזם' },
  { id: 'business', label: 'עסקים', hint: 'אולם-האוצרה + ביקורת-אמת' },
  { id: 'parallel', label: 'מקביל', hint: 'גן-הנפש — מטאפורות של מדידות' },
  { id: 'recruit', label: 'גיוס·ערך', hint: 'הלולאה: מה הפוטנציאל · מה פתוח · מה נותן ערך' },
  { id: 'self', label: 'עצמי', hint: 'המשרד בודק את עצמו: אורקל-טרי · חיבוריות · קבלות — בלי טענות' }, // [zai-14]
];

export function WorldDeck() {
  const [active, setActive] = useState<WorldId>('office');
  const { data, error } = useWorldsState(60_000);
  // המשרד (T12) מזין את עצמו מהגשר-שלו; העולמות האחרים מהמקרר-המשותף.
  const needsWorlds = active !== 'office';

  return (
    <div className="flex h-full w-full flex-col">
      {/* לשוניות-עולם */}
      <div role="tablist" aria-label="עולמות הריבונות"
           className="z-10 flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/80 px-2 py-1.5 backdrop-blur"
           dir="rtl">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            title={t.hint}
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              active === t.id
                ? 'bg-[color:var(--accent-dim)] text-[color:var(--accent)]'
                : 'text-[color:var(--ink-2)] hover:bg-[color:var(--surface)] hover:text-[color:var(--ink)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        {needsWorlds ? (
          <span className="ms-auto hidden self-center whitespace-nowrap pe-2 text-[10.5px] text-[color:var(--ink-3)] sm:block">
            {error ? 'מקרר-האמת: שגיאה — כנות' : data ? `מקרר-האמת · ${ageHe(0)}` : 'מקרר-האמת נטען…'}
          </span>
        ) : null}
      </div>

      {/* העולם הפעיל */}
      <div className="relative min-h-0 flex-1" role="tabpanel" aria-label={TABS.find((t) => t.id === active)?.hint}>
        {active === 'office' ? (
          <RoomRoot />
        ) : active === 'network' ? (
          <NetworkWorld p={data} />
        ) : active === 'business' ? (
          <BusinessWorld p={data} />
        ) : active === 'parallel' ? (
          <ParallelWorld p={data} />
        ) : active === 'self' ? (
          <SelfWorld p={data} /> /* [zai-14] */
        ) : (
          <RecruitmentBoard p={data} />
        )}
      </div>
    </div>
  );
}
