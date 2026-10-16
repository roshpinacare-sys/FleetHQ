'use client';

/**
 * מפקדת הצי — הדף הראשי. במת-העולמות היא הגיבור [T13]:
 * משרד · רשת · עסקים · מקביל · גיוס·ערך — כולם חיים ומנוזנים ממקורות-אמת
 * ציבוריים של הריבונות (פורמן · מפת-זרימה · משואה · מדידת-שרשרת ישירה).
 * הכותרת והרגל דקים בכוונה — העולם הוא התוכן.
 */
import { WorldDeck } from '@/components/worlds/WorldDeck';
import { OwnerChat } from '@/components/owner/OwnerChat';
import { NetworkSelf } from '@/components/owner/NetworkSelf';

const LINKS = [
  { href: 'https://github.com/roshpinacare-sys/FleetHQ', label: 'FleetHQ', title: 'מקור הפורמן והמשרד' },
  { href: 'https://roshpinacare-sys.github.io/Domain/', label: 'רשת חיה', title: 'הדף החי של הרשת ב-Domain' },
] as const;

export default function Home() {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--surface)] text-[color:var(--ink)]">
      {/* ── פס-עליון: זהות + קישורי-רשת ── */}
      <header
        className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 py-2 backdrop-blur"
        dir="rtl"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="sl-dot" style={{ backgroundColor: 'var(--st-ok)' }} aria-hidden="true" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-bold tracking-tight">מפקדת הצי — המשרד הריבוני</h1>
            <p className="truncate text-[12px] text-[color:var(--ink-3)]">
              חדר פיקוד תלת-ממדי · נתונים אמיתיים בלבד · אין הדגמות
            </p>
          </div>
        </div>
        <nav aria-label="קישורי רשת" className="flex flex-wrap items-center gap-1.5">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              title={l.title}
              className="sl-chip border-[color:var(--line)] bg-[color:var(--surface)] text-[12px] font-semibold text-[color:var(--ink-2)] hover:bg-[color:var(--accent-dim)] hover:text-[color:var(--accent)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── במת-העולמות — הגיבור ── */}
      <main className="relative min-h-0 flex-1" aria-label="עולמות הריבונות החיים">
        <WorldDeck />
      </main>

      {/* ── רגל דביקה: הריבונות כולה חיה זה-לצד-זה ── */}
      <footer
        className="z-20 shrink-0 border-t border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 py-2 backdrop-blur"
        dir="rtl"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[12px] text-[color:var(--ink-3)]">
          <span>ריבונות אוטונומית · חמישה עולמות חיים · כל מספר נמדד ומקורו מפורסם</span>
          <span className="font-medium text-[color:var(--ink-2)]">
            אוצרה · מפת-זרימה · גיוס-ערך — מהגיט הפומבי, לעולם לא מהמצאה
          </span>
        </div>
      </footer>

      {/* ── ערוץ-הפעלה-ריבוני: צ'אט-מנהל (T17) + מודעות-הרשת (T23) ── */}
      <OwnerChat />
      <NetworkSelf />
    </div>
  );
}
