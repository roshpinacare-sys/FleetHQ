/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 * · MSAA מקורי (בלי פוסט-פרוססינג) — חדות-קצוות אמיתית בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה הכנה)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import React, { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Architecture } from './Architecture';
import { Stations } from './Stations';
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

export function Office3D() {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 60, position: [4.4, 4.9, 6.4] }}
      gl={{
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.35,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        // Task 47: the previous fog (#1a1512, 14→38) ate the far half of a
        // 20×12.5m room into a black void at overview/git distance (measured
        // in baseline shots). Interior fog now only whispers at ~3x room depth.
        scene.fog = new THREE.Fog('#241e18', 22, 60);
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
    >
      <color attach="background" args={['#171310']} />
      <SceneErrorBoundary>
        <SuspenseBoundary>
          <Architecture />
          <Stations />
          <Crew />
          <CameraDirector />
          <Atmosphere />
          <RoomReadiness />
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
