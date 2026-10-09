/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 */
'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Architecture } from './Architecture';
import { Stations } from './Stations';
import { Crew } from './Crew';
import { PlayerRig } from './Player';
import { Atmosphere } from './Atmosphere';

export function Office3D() {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      camera={{ fov: 55, near: 0.1, far: 60, position: [0, 4.6, 9.5] }}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.18,
      }}
      onCreated={({ gl, scene, camera }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.fog = new THREE.Fog('#1a1512', 12, 34);
        // debug hook (dev): window.__hq
        (window as unknown as Record<string, unknown>).__hq = { gl, scene, camera };
      }}
    >
      <color attach="background" args={['#171310']} />
      <Suspense fallback={null}>
        <Architecture />
        <Stations />
        <Crew />
        <PlayerRig />
        <Atmosphere />
      </Suspense>
    </Canvas>
  );
}
