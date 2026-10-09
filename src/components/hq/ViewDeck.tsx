/**
 * ViewDeck.tsx — סרגל-החדר המקצועי (במקום שכבת-המשחק).
 * ------------------------------------------------------------------
 * · נקודות תצפית: כפתורים אמיתיים (מקלדת-נגישים, aria-pressed, קיצורי 1..7,
 *   Esc = תצפית כללית) — כל נקודה היא הרכב על אזור אמיתי בתוכנית.
 * · מצב-חדר כנה: חיבור + טריות + "החדר בהכנה…" עד הפריים האמיתי הראשון
 *   (נמדד מהרנדרר — לא הנחה), כי בכלי-חלש קומפילציית-ה-shaders עלולה לארוך.
 * · טוסטים: הודעות אמיתיות בלבד (הגיעו מהפורמן דרך הגשר).
 * אין ג'ויסטיק, אין ריצה, אין WASD, אין מבט-ראשון — הניווט אדריכלי.
 */
'use client';

import { useEffect, useState } from 'react';
import { bus, director, type PresetId } from '@/lib/hq/world';
import { CAMERA_PRESETS } from '@/lib/hq/contract';
import { useHq, type Lang } from '@/lib/hq/store';

/** שידור בחירת נקודת תצפית למצלמת הבמאי (אירוע דומיין יחיד, בלי קפלים) */
export function selectPreset(id: PresetId) {
  director.preset = id;
  director.focus = null;
  window.dispatchEvent(new CustomEvent('hq-camera-preset', { detail: id }));
}

/** טוסטים — הודעות אמיתיות בלבד */
function RoomToasts() {
  const toasts = useHq((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-max max-w-[92%] -translate-x-1/2 flex-col items-center gap-1.5" dir="rtl" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-full border border-[color:var(--line-strong)] bg-[color:var(--surface-2)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[color:var(--ink)] shadow-sm">
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** מצב-חדר כנה: חיבור + טריות + הכנה */
function RoomStatus({ lang }: { lang: Lang }) {
  const connected = useHq((s) => s.connected);
  const ready = useHq((s) => s.roomReady);
  const gotSnapshot = useHq((s) => s.snap.agents.length > 0 || s.snap.tasks.length > 0);
  const he = lang === 'he';
  return (
    <div className="pointer-events-none absolute left-3 bottom-3 z-10 flex items-center gap-2 rounded-lg border border-[color:var(--line)] bg-[color:var(--surface-2)] px-2.5 py-1.5" dir="rtl">
      <span className="sl-dot" style={{ backgroundColor: !ready ? 'var(--st-neutral)' : connected ? 'var(--st-ok)' : 'var(--st-attention)' }} aria-hidden="true" />
      <span className="text-[11.5px] font-medium text-[color:var(--ink-2)]">
        {!ready
          ? (he ? 'החדר בהכנה…' : 'Preparing the room…')
          : !connected
            ? (he ? 'מנותק מהפורמן — מציג נתונים אחרונים' : 'Disconnected from foreman — showing last data')
            : gotSnapshot
              ? (he ? 'חי' : 'Live')
              : (he ? 'מחובר — ממתין לסנאפשוט ראשון' : 'Connected — awaiting first snapshot')}
      </span>
    </div>
  );
}

/** שכבת-הכנה — נעלמת בפריים האמיתי הראשון */
function PreparingVeil({ lang }: { lang: Lang }) {
  const ready = useHq((s) => s.roomReady);
  if (ready) return null;
  const he = lang === 'he';
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" dir="rtl" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 py-3.5 shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--line-strong)] border-t-[color:var(--accent)]" aria-hidden="true" />
        <div>
          <div className="text-[13px] font-semibold text-[color:var(--ink)]">{he ? 'החדר בהכנה…' : 'Preparing the room…'}</div>
          <div className="text-[11.5px] text-[color:var(--ink-3)]">{he ? 'טוען דמויות ומקמפל תאורה — זה יימשך רגע' : 'Loading crew and compiling lighting — this takes a moment'}</div>
        </div>
      </div>
    </div>
  );
}

/** סרגל נקודות-התצפית */
function PresetDeck({ lang }: { lang: Lang }) {
  const [active, setActive] = useState<PresetId>(director.preset);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    const onPreset = (e: Event) => setActive((e as CustomEvent<PresetId>).detail);
    window.addEventListener('hq-camera-preset', onPreset as EventListener);
    const off = bus.on('focus', ({ target, id }) => {
      if (target && id) setFocusId(id);
      if (!target) setFocusId(null);
    });
    return () => {
      window.removeEventListener('hq-camera-preset', onPreset as EventListener);
      off();
    };
  }, []);

  // קיצורי מקלדת: 1..7 לנקודות, Esc לתצפית כללית
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= CAMERA_PRESETS.length) selectPreset(CAMERA_PRESETS[n - 1].id);
      if (e.key === 'Escape') selectPreset('overview');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const he = lang === 'he';
  return (
    <nav
      className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex max-w-[96%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)]/92 p-1 shadow-sm backdrop-blur"
      dir="rtl"
      aria-label={he ? 'נקודות תצפית בחדר' : 'Room camera presets'}
    >
      {CAMERA_PRESETS.map((p, i) => {
        const on = focusId ? false : active === p.id;
        return (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            aria-pressed={on}
            title={`${p.label[lang]} (${i + 1})`}
            className="sl-chip !border-transparent !bg-transparent !text-[12px] !font-semibold hover:!bg-[color:var(--surface-2)]"
            style={on ? { background: 'var(--accent-dim)', color: 'var(--accent)' } : undefined}
          >
            <span className="me-1 hidden text-[10px] font-bold text-[color:var(--ink-3)] sm:inline" aria-hidden="true">{i + 1}</span>
            {p.label[lang]}
          </button>
        );
      })}
    </nav>
  );
}

export function ViewDeck() {
  const lang = useHq((s) => s.lang);
  return (
    <>
      <RoomToasts />
      <PreparingVeil lang={lang} />
      <PresetDeck lang={lang} />
      <RoomStatus lang={lang} />
    </>
  );
}
