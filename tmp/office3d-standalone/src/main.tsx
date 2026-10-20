/**
 * main.tsx — standalone office3d bundle (Domain/office3d/).
 * Same room, same truth bridge, same honesty law — no Next runtime needed.
 */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import Room3D from '@/components/hq/Room3D';
import { startTruthBridge } from '@/lib/hq/truth-bridge';
import './standalone.css';

const LINKS = [
  { href: 'https://github.com/roshpinacare-sys/FleetHQ', label: 'FleetHQ' },
  { href: 'https://roshpinacare-sys.github.io/Domain/', label: 'רשת חיה' },
  { href: 'https://github.com/roshpinacare-sys/sovereign-beacon', label: 'משואה' },
] as const;

function StandaloneRoom() {
  useEffect(() => {
    const stop = startTruthBridge(45_000);
    return stop;
  }, []);
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--surface)] text-[color:var(--ink)]">
      <header
        className="z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 py-2 backdrop-blur"
        dir="rtl"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="sl-dot" style={{ backgroundColor: 'var(--st-ok)' }} aria-hidden="true" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-bold tracking-tight">מפקדת הצי — המשרד הריבוני</h1>
            <p className="truncate text-[11.5px] text-[color:var(--ink-3)]">
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
              className="sl-chip border border-[color:var(--line)] bg-[color:var(--surface)] text-[12px] font-semibold text-[color:var(--ink-2)] hover:bg-[color:var(--accent-dim)] hover:text-[color:var(--accent)]"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative min-h-0 flex-1" aria-label="המשרד התלת-ממדי החי">
        <div className="relative h-full w-full">
          <Room3D />
        </div>
      </main>

      <footer
        className="z-20 shrink-0 border-t border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-4 py-2 backdrop-blur"
        dir="rtl"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--ink-3)]">
          <span>ריבונות אוטונומית · הפורמן חי ב-FleetHQ · כל מספר בחדר נמדד ופורסם</span>
          <span className="font-medium text-[color:var(--ink-2)]">אוצרה · מפעילים · דופק — מהמשואה הציבורית</span>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StandaloneRoom />
  </StrictMode>,
);
