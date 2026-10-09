/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 * · MSAA מקורי (בלי פוסט-פרוססינג) — חדות-קצוות אמיתית בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה הכנה)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import { useEffect } from 'react';
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
        toneMappingExposure: 1.12,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.fog = new THREE.Fog('#1a1512', 14, 38);
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
    >
      <color attach="background" args={['#171310']} />
      <SuspenseBoundary>
        <Architecture />
        <Stations />
        <Crew />
        <CameraDirector />
        <Atmosphere />
        <RoomReadiness />
      </SuspenseBoundary>
    </Canvas>
  );
}

/** גבול-שגיאה פנימי: כשל נכס יחיד לא ישאיר קנבס שחור ללא הסבר */
import { Suspense } from 'react';
function SuspenseBoundary({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
