/**
 * Atmosphere.tsx — אווירת המשרד:
 * · תאורת בסיס (hemisphere + ambient חמורה) + זרקורים מרכזיים
 * · עמודות אור ווליומטריות מהחלונות (GLSL — שפת tidewater: רך, פילמי, אף פעם לא שוטף)
 * · אבק מרחף שנדלק בתוך עמודות האור
 * · פוסט-פרוססינג: Bloom · Vignette · Grain · FXAA
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, Bloom, Vignette, Noise, FXAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { PLAN_W, PLAN_H, SCALE, WALL_H } from '@/lib/hq/contract';
import { makeSmokeTexture } from '@/lib/hq/textures';

// ─────────────── עמודות אור ───────────────
/** צירי עמודות: מחלונות המערב (ירח) והדרום — [x, z, רדיוס בסיס, עכירות] */
const SHAFTS: { x: number; z: number; r: number; opacity: number; color: string }[] = [
  { x: -PLAN_W * SCALE / 2 + 1.6, z: -3.1, r: 1.5, opacity: 0.1, color: '#cfd8e8' },
  { x: -PLAN_W * SCALE / 2 + 1.6, z: 0.6, r: 1.5, opacity: 0.1, color: '#cfd8e8' },
  { x: -PLAN_W * SCALE / 2 + 1.6, z: 3.7, r: 1.5, opacity: 0.1, color: '#cfd8e8' },
  { x: -1.9, z: PLAN_H * SCALE / 2 - 1.8, r: 1.7, opacity: 0.08, color: '#e8d8c0' },
];

const SHAFT_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vNearFade;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec2 axisXZ = vec2(modelMatrix[3][0], modelMatrix[3][2]);
  float camDist = distance(cameraPosition.xz, axisXZ);
  vNearFade = smoothstep(0.9, 3.2, camDist);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHAFT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vNearFade;
void main() {
  float vf = smoothstep(0.0, 0.3, vUv.y) * (0.35 + 0.65 * vUv.y);
  vf *= 1.0 - smoothstep(0.85, 1.0, vUv.y);
  vec3 vdir = normalize(cameraPosition - vWorldPos);
  float edge = pow(abs(dot(vNormalW, vdir)), 1.6);
  float n1 = sin(vWorldPos.x * 0.9 + uTime * 0.1) * sin(vWorldPos.y * 1.2 - uTime * 0.06);
  float n2 = sin(vWorldPos.z * 1.5 + uTime * 0.14) * sin(vWorldPos.x * 2.0 - uTime * 0.04);
  float noiseMod = 1.0 + 0.13 * n1 + 0.09 * n2;
  float flicker = 1.0 + 0.025 * sin(uTime * 1.2 + vWorldPos.x * 0.41 + vWorldPos.z * 0.57);
  float a = vf * edge * noiseMod * flicker * vNearFade * uOpacity;
  gl_FragColor = vec4(uColor, a);
}
`;

function LightShafts() {
  const mats = useMemo(
    () =>
      SHAFTS.map((s) => {
        const mat = new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          uniforms: {
            uColor: { value: new THREE.Color(s.color) },
            uOpacity: { value: s.opacity },
            uTime: { value: 0 },
          },
          vertexShader: SHAFT_VERT,
          fragmentShader: SHAFT_FRAG,
        });
        return mat;
      }),
    [],
  );
  const tops = WALL_H - 0.15;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    mats.forEach((m) => { m.uniforms.uTime.value = t; });
  });
  return (
    <group>
      {SHAFTS.map((s, i) => (
        <mesh key={i} position={[s.x, tops - (tops - 0.05) / 2, s.z]}>
          <cylinderGeometry args={[0.34, s.r, tops - 0.05, 20, 1, true]} />
          <primitive object={mats[i]} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

// ─────────────── אבק מרחף ───────────────
function Dust() {
  const tex = useMemo(() => makeSmokeTexture(), []);
  const COUNT = 240;
  const box = useMemo(() => ({
    w: PLAN_W * SCALE * 0.96,
    h: WALL_H - 0.4,
    d: PLAN_H * SCALE * 0.96,
  }), []);
  const data = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const seed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box.w;
      pos[i * 3 + 1] = Math.random() * box.h;
      pos[i * 3 + 2] = (Math.random() - 0.5) * box.d;
      seed[i] = Math.random() * 100;
    }
    return { pos, seed };
  }, [box]);

  const ref = useRef<THREE.Points>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime();
    const p = ref.current?.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!p) return;
    for (let i = 0; i < COUNT; i++) {
      let y = p.getY(i) - dt * 0.028;
      if (y < 0.05) y = box.h;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + data.seed[i]) * dt * 0.014);
      p.setZ(i, p.getZ(i) + Math.cos(t * 0.24 + data.seed[i] * 1.7) * dt * 0.014);
    }
    p.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={tex}
        color="#ffe6c0"
        size={0.035}
        transparent
        opacity={0.32}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        sizeAttenuation
      />
    </points>
  );
}

// ─────────────── תאורת בסיס ───────────────
function BaseLights() {
  return (
    <group>
      <hemisphereLight args={['#6b6156', '#2b2620', 1.35]} />
      <ambientLight intensity={0.38} color="#8a7f72" />
      {/* אור ירח מהמערב — צללים ארוכים */}
      <directionalLight
        position={[-9, 6.5, 1.5]}
        intensity={1.5}
        color="#d8e0ee"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
      />
      {/* זרקור מרכזי חם מעל הלהבה */}
      <spotLight
        position={[0, WALL_H - 0.25, 0.6]}
        angle={0.75}
        penumbra={0.7}
        intensity={3.0}
        color="#ffd9a6"
        distance={14}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      {/* אור מילוי מהדרום (קבלה) */}
      <pointLight position={[0, 2.6, 4.6]} intensity={0.55} color="#ffcf9e" distance={9} decay={2} />
    </group>
  );
}

// ─────────────── רכיב ראשי ───────────────
export function Atmosphere({ fx = true }: { fx?: boolean }) {
  return (
    <group>
      <BaseLights />
      <LightShafts />
      <Dust />
      {fx && (
        <EffectComposer multisampling={0}>
          <Bloom intensity={0.62} luminanceThreshold={0.62} luminanceSmoothing={0.28} mipmapBlur radius={0.72} />
          <Vignette offset={0.24} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
          <Noise opacity={0.05} blendFunction={BlendFunction.OVERLAY} />
          <FXAA />
        </EffectComposer>
      )}
    </group>
  );
}
