/**
 * CameraDirector.tsx — מצלמת הבמאי של החדר התלת-מימדי.
 * ------------------------------------------------------------------
 * מצלמה מקצועית במקום שחקן: אין WASD, אין ריצה, אין ג'ויסטיק, אין מבט-ראשון,
 * אין הליכה-בקליק. מה שנשאר הוא שליטה אדריכלית ניתנת-לחיזוי:
 * · גרירה = הקפה סביב נקודת-המבט (pitch מוגבל, לא מתחת לרצפה)
 * · גלגלת/צביטה = התרחקות בגבולות נקודת התצפית
 * · נקודות תצפית מוגדרות (סרגל החדר) + מיקוד ישות בקליק (bus 'focus')
 * · Esc מחזיר לתצפית הכללית; העדפת reduced-motion = מעברים מיידיים
 * · המצלמה לעולם לא יוצאת מהקירות ולא לוקחת שליטה בפתאומיות
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_PRESETS, FOCUS_PRESETS, WALL_H } from '@/lib/hq/contract';
import { bus, director, ROOM_BOUNDS, type PresetId } from '@/lib/hq/world';

const state = {
  /** נקודת המבט הנוכחית (עולם) */
  look: new THREE.Vector3(0, 0.9, 0.56),
  /** כדור המצלמה סביב נקודת המבט */
  yaw: Math.PI * 0.86,
  pitch: 0.62,
  dist: 9.2,
  /** גבולות ההתרחקות של התצפית הנוכחית */
  minDist: 5,
  maxDist: 12,
  /** נקודת-מבט יעד (מעבר חלק) */
  lookTo: new THREE.Vector3(0, 0.9, 0.56),
  yawTo: Math.PI * 0.86,
  pitchTo: 0.62,
  distTo: 9.2,
};

function applyPreset(id: PresetId) {
  const p = CAMERA_PRESETS.find((x) => x.id === id) ?? CAMERA_PRESETS[0];
  state.minDist = p.minDist;
  state.maxDist = p.maxDist;
  state.lookTo.set(p.target[0], p.target[1], p.target[2]);
  state.yawTo = p.yaw;
  state.pitchTo = p.pitch;
  state.distTo = p.dist;
}

/** קלט: גרירת-הקפה + גלגלת + צביטה. בלי מקלדת-משחק; Esc בלבד (בסרגל וכאן) */
function useCameraInput() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let moved = 0;
    let lx = 0, ly = 0;
    const pd = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) {
        state.yawTo -= dx * 0.0052;
        state.pitchTo = Math.max(0.06, Math.min(1.25, state.pitchTo + dy * 0.0036));
        state.yaw = state.yawTo;
        state.pitch = state.pitchTo; // הקפה ישירה — בלי עיכוב-מצלמה
      }
      lx = e.clientX; ly = e.clientY;
    };
    const pu = () => { dragging = false; };
    el.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);

    const wheel = (e: WheelEvent) => {
      state.distTo = Math.max(state.minDist, Math.min(state.maxDist, state.distTo + e.deltaY * 0.0035));
    };
    el.addEventListener('wheel', wheel, { passive: true });

    // צביטה במגע
    let pinch0: number | null = null;
    let dist0 = 0;
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (pinch0 === null) { pinch0 = d; dist0 = state.distTo; }
      state.distTo = Math.max(state.minDist, Math.min(state.maxDist, dist0 * (pinch0 / d)));
    };
    const touchEnd = () => { pinch0 = null; };
    el.addEventListener('touchmove', touchMove, { passive: true });
    el.addEventListener('touchend', touchEnd);

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && director.focus) {
        director.focus = null;
        applyPreset(director.preset);
      }
    };
    window.addEventListener('keydown', key);

    return () => {
      el.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd);
      window.removeEventListener('keydown', key);
    };
  }, [gl]);
}

export function CameraDirector() {
  const { camera } = useThree();
  useCameraInput();

  // reduced-motion נמדד פעם אחת בהרכבה (העדפת מערכת)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const set = () => { director.reducedMotion = mq.matches; };
    set();
    mq.addEventListener?.('change', set);
    return () => mq.removeEventListener?.('change', set);
  }, []);

  // מיקוד ישות מהסצנה/סרגל
  useEffect(() => {
    const off = bus.on('focus', ({ target, kind }) => {
      if (!target) {
        director.focus = null;
        applyPreset(director.preset);
        return;
      }
      const [wx, wz] = [(target.x - 800) * 0.0125, (target.y - 500) * 0.0125];
      const preset = FOCUS_PRESETS[kind || 'flame'] || FOCUS_PRESETS.flame;
      // המצלמה ניצבת בין מרכז החדר ליעד — פריימינג פנימי עקבי
      const cx = 0, cz = 0.56;
      const dx = cx - wx, dz = cz - wz;
      const dl = Math.hypot(dx, dz) || 1;
      state.minDist = preset.dist * 0.55;
      state.maxDist = preset.dist * 1.9;
      state.lookTo.set(wx, kind === 'wall' || kind === 'git' ? 1.5 : 1.15, wz);
      state.yawTo = Math.atan2(dx / dl, dz / dl);
      state.pitchTo = preset.pitch;
      state.distTo = preset.dist;
      state.yaw = state.yawTo;
      state.pitch = state.pitchTo;
      state.dist = preset.dist * 0.92; // נכנסת מעט פנימה ומתייצבת
      director.focus = { x: wx, z: wz, kind: kind || 'flame' };
      director.preset = 'overview'; // אחרי Esc חוזרים לתצפית הכללית
    });
    return off;
  }, []);

  // סרגל החדר: בחירת נקודת תצפית
  useEffect(() => {
    const onPreset = (e: Event) => {
      const id = (e as CustomEvent<PresetId>).detail;
      director.preset = id;
      director.focus = null;
      applyPreset(id);
    };
    window.addEventListener('hq-camera-preset', onPreset as EventListener);
    return () => window.removeEventListener('hq-camera-preset', onPreset as EventListener);
  }, []);

  const tmp = useMemo(() => ({ pos: new THREE.Vector3(), cam: null as THREE.Vector3 | null }), []);
  const camPos = useRef(new THREE.Vector3(0, 5, 8));
  const camLook = useRef(new THREE.Vector3(0, 0.9, 0.56));
  const first = useRef(true);

  useFrame((_, dtRaw) => {
    // Task 47: WALL-CLOCK dt — the previous 0.05s clamp (a mixer-stability
    // guard) silently divided the transition rate at a low frame rate: at
    // ~0.8fps a 1s preset change crawled for 15+ wall seconds (measured live:
    // the podium preset was still mid-flight 4.5s after the keypress).
    // Exponential decay 1-exp(-dt*k) is unconditionally stable, so the only
    // cap is a tab-switch guard.
    const dt = Math.min(dtRaw, 0.5);
    const instant = director.reducedMotion || first.current;
    const kPos = instant ? 1 : 1 - Math.exp(-dt * 3.2);
    const kLook = instant ? 1 : 1 - Math.exp(-dt * 4.2);
    first.current = false;

    // יעד המבט: מיקוד ישות או נקודת התצפית
    if (director.focus) {
      state.look.lerp(tmp.pos.set(director.focus.x, director.focus.kind === 'wall' || director.focus.kind === 'git' ? 1.5 : 1.15, director.focus.z), kLook);
    } else {
      state.look.lerp(state.lookTo, kLook);
    }

    // החלקת כדור המצלמה
    state.yaw += (state.yawTo - state.yaw) * kPos;
    state.pitch += (state.pitchTo - state.pitch) * kPos;
    state.dist += (state.distTo - state.dist) * kPos;

    const cp = Math.cos(state.pitch);
    const px = state.look.x + Math.sin(state.yaw) * cp * state.dist;
    const pz = state.look.z + Math.cos(state.yaw) * cp * state.dist;
    const py = state.look.y + Math.sin(state.pitch) * state.dist;
    camPos.current.set(
      THREE.MathUtils.clamp(px, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX),
      THREE.MathUtils.clamp(py, 0.5, WALL_H - 0.25),
      THREE.MathUtils.clamp(pz, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ),
    );
    camLook.current.lerp(state.look, instant ? 1 : 1 - Math.exp(-dt * 5));

    const cam = camera as THREE.PerspectiveCamera;
    cam.position.copy(camPos.current);
    cam.lookAt(camLook.current);
  });

  return null;
}
