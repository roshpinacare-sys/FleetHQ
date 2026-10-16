/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 * · MSAA מקורי (בלי פוסט-פרוססינג) — חדות-קצוות אמיתית בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה הכנה)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { PerformanceMonitor } from '@react-three/drei';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Architecture } from './Architecture';
import { Stations } from './Stations';
import { Interior } from './Interior';
import { Crew } from './Crew';
import { CameraDirector } from './CameraDirector';
import { Atmosphere } from './Atmosphere';
import { useHq } from '@/lib/hq/store';

/** מודד את הפריים המורכב האמיתי הראשון (draw-calls > 6) — אמת, לא הנחה */
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
        return;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);
    return () => { settled = true; cancelAnimationFrame(raf); };
  }, [gl]);
  return null;
}

/**
 * EnvReflections (Task 8) — סביבת-מראות אמיתית (RoomEnvironment→PMREM) פעם-אחת:
 * המתכות/המסכים/הפליז מקבלים השתקפות-סביבה אמיתית במקום מט-מוות. מקומי
 * לחלוטין — בלי נכסי-רשת.
 */
function EnvReflections() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    // three.js קנון: הצמדת-סביבה לסצנה בתוך useEffect — מוטציה-מכוונת
    // eslint-disable-next-line react-hooks/immutability
    scene.environment = env.texture;
    return () => {
      env.texture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** PostFX (Task 8) — Bloom ממוקד (מסכים אמיסיביים + להבה + ניאון) + Vignette.
 *  lite/מנוע-מוחלש → בלי פוסט-פרוססינג בכלל. */
function PostFX({ off }: { off: boolean }) {
  if (off) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom intensity={0.34} luminanceThreshold={0.76} luminanceSmoothing={0.18} mipmapBlur radius={0.62} />
      <Vignette offset={0.3} darkness={0.34} eskil={false} />
    </EffectComposer>
  );
}

export function Office3D() {
  // התאמת-ביצועים אמיתית (Task 3D-MOBILE): במסך-קטן/מוחלש — פחות פיקסלים
  // ובלי צללים. נמדד פעם-אחת בהרכבה (הרכיב רץ לקוח-בלבד).
  const [lite] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 820px)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4));
  // Task 8 — שומר-איכות אדפטיבי: מנוע אמיתי מדד FPS; ירידות חוזרות =
  // הורדת-הילה/השתקפויות (יופי עם הנדסה — לא קריסה במכונה חלשה).
  const [heavy, setHeavy] = useState(true);
  const perfOff = lite || !heavy;
  return (
    <Canvas
      shadows={lite ? false : 'soft'}
      dpr={perfOff ? [0.75, 1.2] : [1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 60, position: [4.4, 4.9, 6.4] }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // Task 8 — איזון-חשיפה: RoomEnvironment מוסיף הרבה-אור; בלי כיול
        // החדר נשרף ללבן (נמדד בצילום-בסיס). environmentIntensity 0.32 +
        // חשיפה 0.96 — חום-יום נעים, מסכים זוהרים נשארים בולטים.
        scene.environmentIntensity = 0.32;
        // Task 51 (אור-יום): הערפל הפנימי בצבע-אור-יום — לילה נשאר רק בחלונות.
        scene.fog = new THREE.Fog('#ddd6c8', 26, 62);
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
      gl={{
        antialias: !lite,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 0.96,
      }}
    >
      <color attach="background" args={['#ddd6c8']} />
      <SceneErrorBoundary>
        <SuspenseBoundary>
          <PerformanceMonitor
            flipflops={3}
            onFallback={() => setHeavy(false)}
            onDecline={() => setHeavy(false)}
          />
          <EnvReflections />
          <Architecture heavy={!perfOff} />
          <Stations />
          <Interior />
          <Crew />
          <CameraDirector />
          <Atmosphere />
          <RoomReadiness />
          <PostFX off={perfOff} />
        </SuspenseBoundary>
      </SceneErrorBoundary>
    </Canvas>
  );
}

/** גבול-שגיאה פנימי: כשל נכס יחיד לא ישאיר קנבס שחור ללא הסבר */
import { Suspense } from 'react';
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
