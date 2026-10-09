/**
 * Controls3D.tsx — שכבת השליטה של החדר התלת-ממדי בתוך AgentHQ.
 * ------------------------------------------------------------------
 * · ג'ויסטיק מגע (מוצג רק במסכי מגע) + כפתור ריצה — מותאם RTL (מימין)
 * · טוסטים של החדר (משימה שהושלמה וכד') — מעל הקנבס, בלי לחסום
 * · חץ הדרכה קטן: WASD/גרירה/גלגלת/קליק-להליכה — נעלם אחרי כמה שניות
 * הכיווניות עוקבת אחרי הממשק: לא כופים LTR על תוכן עברי.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { input, bus } from '@/lib/hq/world';
import { useHq } from '@/lib/hq/store';

/** ג'ויסטיק מגע — אותו חוק מהדמו: כתיבה ישירה ל-input הגלובלי של world.ts */
function Joystick() {
  const ref = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const tm = setTimeout(() => setShow(mq.matches), 0);
    return () => clearTimeout(tm);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !show) return;
    const R = 52;
    let id: number | null = null;
    const move = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const r = el.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      input.joy.active = true;
      input.joy.x = dx / R;
      input.joy.y = dy / R;
      if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const down = (e: PointerEvent) => { id = e.pointerId; el.setPointerCapture(id); move(e); };
    const up = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      input.joy.active = false; input.joy.x = 0; input.joy.y = 0;
      if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [show]);
  if (!show) return null;
  return (
    <div className="pointer-events-auto absolute bottom-4 right-4 flex items-end gap-3">
      <div
        ref={ref}
        className="relative h-28 w-28 touch-none rounded-full border border-white/15 bg-black/40 backdrop-blur"
        aria-label="ג'ויסטיק תנועה"
      >
        <div ref={knob} className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/80 shadow-lg" />
      </div>
      <button
        onPointerDown={() => { input.sprint = true; }}
        onPointerUp={() => { input.sprint = false; }}
        className="rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-xs font-bold text-zinc-200 backdrop-blur"
      >
        ריצה
      </button>
    </div>
  );
}

/** טוסטים של החדר — הודעות אמיתיות בלבד (הגיעו מהפורמן דרך הגשר) */
function RoomToasts() {
  const toasts = useHq((s) => s.toasts);
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 z-10 flex w-max max-w-[92%] -translate-x-1/2 flex-col items-center gap-1.5" dir="rtl" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="rounded-full border border-emerald-400/30 bg-zinc-950/85 px-3.5 py-1.5 text-[12.5px] font-bold text-emerald-200 shadow-lg backdrop-blur">
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** חץ הדרכה — WASD / גרירה למבט / גלגלת לזום / קליק על הרצפה להליכה / F למבט ראשון */
function Hints() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const tm = setTimeout(() => setGone(true), 9000);
    return () => clearTimeout(tm);
  }, []);
  if (gone) return null;
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-3.5 py-1.5 text-[11.5px] leading-4 text-zinc-300 backdrop-blur" dir="rtl">
      WASD/חצים — הליכה · גרירה — מבט · גלגלת — זום · קליק על הרצפה — צעד אליה · <b className="text-amber-300">F</b> — מבט ראשון · Esc — יציאה ממיקוד
    </div>
  );
}

/** כניסה לחדר ממוקדת: אחרי הרכבה, מיקוד רך ללהבת הריבונות כדי שהעין תיפול על המרכז */
export function RoomMount() {
  useEffect(() => {
    const tm = setTimeout(() => bus.emit('focus', { target: null }), 300);
    return () => clearTimeout(tm);
  }, []);
  return null;
}

export function Controls3D() {
  return (
    <>
      <Joystick />
      <RoomToasts />
      <Hints />
      <RoomMount />
    </>
  );
}
