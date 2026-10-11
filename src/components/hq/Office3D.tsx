/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן
 * (חי מהסוקט, או מראת-היומן האמיתית — lib/hq/feed.ts).
 * · MSAA מקורי (בלי פוסט-פרוססינג) — חדות-קצוות אמיתית בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה הכנה)
 * · Task 11-a — מגבלות-ביצועים: dpr מהודק, ואיכות מסתגלת בניטור-ביצועים
 *   (PerformanceMonitor → ירידה ב-fps מורידה dpr; התאוששות מעלה בחזרה)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { Architecture } from './Architecture';
import { Stations } from './Stations';
import { Crew } from './Crew';
import { CameraDirector } from './CameraDirector';
import { Atmosphere } from './Atmosphere';
import { useHq } from '@/lib/hq/store';

/** מודל את הפריים המורכב האמיתי הראשון (draw-calls > 6) — אמת, לא הנחה.
 *  Task 11-a: גם חושף __hqRoomReady לבודקים חיצוניים (בייק ה-3D נשען על זה). */
function RoomReadiness() {
  const { gl } = useThree();
  useEffect(() => {
    let raf = 0;
    let settled = false;
    const check = () => {
      if (settled) return;
      if (gl.info.render.calls > 6) {
        settled = true;
        useHq.getState().setRoomReady(true);
        (window as unknown as Record<string, unknown>).__hqRoomReady = true;
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => { settled = true; cancelAnimationFrame(raf); };
  }, [gl]);
  return null;
}

/** Task 11-a — איכות מסתגלת: ניטור fps ממשי; ירידה מתמשכת → dpr 1
 *  (והסרת-ה-MSAA החדה אינה נדרשת — ה-dpr לבדו מחצי את העומס). */
function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const [degraded, setDegraded] = useState(false);
  return (
    <>
      <PerformanceMonitor
        flipflops={4}
        onFallback={() => setDegraded(true)}
        onIncline={() => setDpr(1.5)}
        onDecline={() => { setDpr(1); setDegraded(true); }}
      />
      {degraded && <AdaptiveDpr pixelated />}
    </>
  );
}

export function Office3D() {
  // התאמת-ביצועים אמיתית (Task 3D-MOBILE): במסך-קטן/מוחלש — פחות פיקסלים
  // ובלי צללים. נמדד פעם-אחת בהרכבה (הרכיב רץ לקוח-בלבד).
  const [lite] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 820px)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4));
  return (
    <Canvas
      shadows={lite ? false : 'soft'}
      dpr={lite ? [0.75, 1.25] : [1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 60, position: [4.4, 4.9, 6.4] }}
      gl={{
        antialias: !lite,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.12,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // Task 51 (אור-יום): הערפל הפנימי בצבע-אור-יום — לילה נשאר רק בחלונות.
        // הישן (#241e18, 22→60) בלע בחצי-החדר הרחוק לתוך-שחור (מדד-בסיס 51).
        scene.fog = new THREE.Fog('#ddd6c8', 26, 62);
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
    >
      <color attach="background" args={['#ddd6c8']} />
      <SceneErrorBoundary>
        <SuspenseBoundary>
          <Architecture />
          <Stations />
          <Crew />
          <CameraDirector />
          <Atmosphere />
          <AdaptiveQuality />
          <RoomReadiness />
        </SuspenseBoundary>
      </SceneErrorBoundary>
    </Canvas>
  );
}

/** גבול-שגיאה פנימי: כשל נכס יחיד לא ישאיר קנבס שחור ללא הסבר */
function SuspenseBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

/** גבול-כשל סצנה (Task 46): נכס/מודל שנפל בתוך הקנבס מסומן כנה בחנות —
 *  Room3D מציג מצב-כשל עם פעולה, במקום קנבס שחור שקט. */
class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: Error) {
    console.error('[hq-scene] scene failure:', err.message);
    useHq.getState().setSceneFailed(true);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
