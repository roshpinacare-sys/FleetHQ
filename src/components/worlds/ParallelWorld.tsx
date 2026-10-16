/**
 * ParallelWorld.tsx — העולם-המקביל: גן-הנפש של האורגניזם. [T13]
 * ---------------------------------------------------------------------------
 * זהו רינדור-מטאפורה פסיכולוגי של מדידות-אמת בלבד:
 * כל חבר-צוות = עץ-נפש שמצבו הנמדד (FleetHQ office-state) מתגלם במטאפורה:
 * תקלה→סערה וגשם · חסום→קרח · עבודה→זוהר-חם · השלמה→פריחה · רגוע→שקט-ירקרק.
 * הכלל המחייב: המטאפורה מוצגת לצד המדידה המילולית — לעולם בלעדיה. אין נתון מדומה.
 * מזג-האוויר = מצב-האורגניזם (deriveWorldMood — נגזר רק ממדידות).
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { CrewId, CrewState, WorldsPayload } from '@/lib/worlds/types';
import { STATE_METAPHOR, WORLDS_CREW, deriveWorldMood } from '@/lib/worlds/types';
import { WorldCanvas, WorldHud, LabelSprite } from './WorldShell';

const SKY = {
  clear: { bg: '#eee6d4', sun: '#f5d9a0', light: 1.25, fog: ['#eee6d4', 24, 66] },
  cloudy: { bg: '#ddd8cc', sun: '#d9cdb2', light: 0.95, fog: ['#ddd8cc', 20, 58] },
  overcast: { bg: '#c9c5bd', sun: '#b9b3a6', light: 0.72, fog: ['#c9c5bd', 16, 48] },
} as const;

function stateOf(p: WorldsPayload, id: CrewId): { state: CrewState; activity: string } {
  const a = (p.foreman.data?.agents ?? []).find((x) => x.id === id);
  const st = (a?.state ?? 'idle') as CrewState;
  return { state: STATE_METAPHOR[st] ? st : 'idle', activity: a?.activity ?? '' };
}

/** גשם — נקודות נופלות (רק מעל עצי-סערה) */
function Rain({ x }: { x: number }) {
  const ref = useRef<THREE.Points>(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const N = 90;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = x + (Math.random() - 0.5) * 2.2;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.2;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [x]);
  useFrame((_, dt) => {
    const pos = geom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - dt * 3.2;
      if (y < 0) y = 5;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  return (
    <points geometry={geom} position={[0, 0, 0]}>
      <pointsMaterial color="#7c8a8f" size={0.055} transparent opacity={0.7} />
    </points>
  );
}

function SoulTree({ member, state, activity, x, alt }: {
  member: (typeof WORLDS_CREW)[number]; state: CrewState; activity: string; x: number; alt?: boolean;
}) {
  const canopy = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  const meta = STATE_METAPHOR[state];
  const t = useRef(Math.random() * 10);
  useFrame((s, dt) => {
    t.current += dt;
    if (canopy.current) {
      const breath = meta.mood === 'work' ? 1 + Math.sin(t.current * 2.6) * 0.06
        : meta.mood === 'bloom' ? 1 + Math.sin(t.current * 1.4) * 0.04
        : meta.mood === 'storm' ? 1 + Math.sin(t.current * 9) * 0.09
        : 1 + Math.sin(t.current * 0.9) * 0.02;
      canopy.current.scale.setScalar(breath);
    }
    if (glow.current) {
      glow.current.intensity = meta.mood === 'work' ? 1.6 + Math.sin(t.current * 3) * 0.5
        : meta.mood === 'storm' ? 0.4 + (Math.sin(t.current * 11) > 0.92 ? 2.2 : 0)
        : meta.mood === 'bloom' ? 1.1 : 0.5;
    }
    void s;
  });
  const canopyColor = meta.mood === 'storm' ? '#5a5148'
    : meta.mood === 'frozen' ? '#b9bdb4'
    : meta.mood === 'bloom' ? '#7BA05B'
    : meta.mood === 'work' ? '#C9A227'
    : '#8fa07a';
  const trunkColor = meta.mood === 'frozen' ? '#a8ada3' : '#6f5b43';
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 1, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 2, 8]} />
        <meshStandardMaterial color={trunkColor} roughness={0.85} />
      </mesh>
      <mesh ref={canopy} position={[0, 2.7, 0]} castShadow>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color={canopyColor} roughness={0.6} flatShading />
      </mesh>
      {meta.mood === 'bloom' ? [0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.cos(i * 2.1) * 0.7, 2.9 + Math.sin(i * 1.7) * 0.3, Math.sin(i * 2.1) * 0.7]}>
          <sphereGeometry args={[0.11, 10, 10]} />
          <meshStandardMaterial color="#d98fa4" roughness={0.5} emissive="#d98fa4" emissiveIntensity={0.25} />
        </mesh>
      )) : null}
      {meta.mood === 'frozen' ? (
        <mesh position={[0, 2.7, 0]}>
          <icosahedronGeometry args={[1.18, 0]} />
          <meshStandardMaterial color="#cdd4cd" transparent opacity={0.28} roughness={0.15} />
        </mesh>
      ) : null}
      <pointLight ref={glow} position={[0, 3, 0]} color={meta.mood === 'storm' ? '#c9d2d6' : member.color} intensity={0.6} distance={5} />
      {meta.mood === 'storm' ? <Rain x={x} /> : null}
      {/* תוויות-מדורגות (Task 59): גובה לסירוגין — שכנים לא נופלים זה על זה */}
      <LabelSprite height={1.05} position={[0, alt ? 5.15 : 4.35, 0]}
        spec={{ lines: [
          { text: `${member.he} · ${meta.he}` },
          { text: `מדידה: ${state} · מטאפורה: ${meta.mood === 'storm' ? 'סערה' : meta.mood === 'frozen' ? 'קרח' : meta.mood === 'work' ? 'זוהר' : meta.mood === 'bloom' ? 'פריחה' : 'רגוע'}`, small: true },
          ...(activity ? [{ text: activity.slice(0, 34), small: true }] : []),
        ] }} />
    </group>
  );
}

export function ParallelWorld({ p }: { p: WorldsPayload | null }) {
  const mood = useMemo(() => deriveWorldMood(p), [p]);
  const sky = SKY[mood.sky];
  if (!p || !p.foreman.ok) {
    return (
      <div className="relative h-full w-full">
        <WorldCanvas bg={sky.bg} fog={sky.fog as unknown as [string, number, number]}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[8, 14, 6]} intensity={sky.light} />
        </WorldCanvas>
        <WorldHud title="העולם-המקביל" source="מקור המדידות לא זמין" ageHe="כנות: אין רינדור נפש בלי מדידה" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center" dir="rtl">
          <div className="sl-chip bg-[color:var(--surface-2)]/95 px-4 py-2 text-[12.5px]">
            אין מדידות פורמן — הגן נשאר ריק בכנות עד שהמקור יחזור
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full">
      <WorldCanvas bg={sky.bg} fog={sky.fog as unknown as [string, number, number]}>
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 14, 6]} intensity={sky.light} color={sky.sun} castShadow shadow-mapSize={[1024, 1024]} />
        {mood.sky !== 'clear' ? (
          <mesh position={[0, 12, -10]}>
            <boxGeometry args={[40, 3, 12]} />
            <meshStandardMaterial color={mood.sky === 'overcast' ? '#8f8a80' : '#b5ada0'} roughness={1} />
          </mesh>
        ) : null}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[22, 48]} />
          <meshStandardMaterial color="#d9d2bd" roughness={0.95} />
        </mesh>
        {WORLDS_CREW.map((m, i) => {
          const { state, activity } = stateOf(p, m.id);
          return <SoulTree key={m.id} member={m} state={state} activity={activity} alt={i % 2 === 1} x={(i - (WORLDS_CREW.length - 1) / 2) * 4.4} />;
        })}
        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.35} minDistance={6} maxDistance={34} maxPolarAngle={Math.PI / 2.05} target={[0, 1.6, 0]} />
      </WorldCanvas>
      <WorldHud
        title="העולם-המקביל · גן-הנפש"
        source="מטאפורות של מדידות אמת"
        ageHe={mood.he}
        warn={mood.sky !== 'clear' ? mood.reasons.filter((r) => !r.includes('תקינה')).join(' · ') || null : null}
      />
      <div className="pointer-events-none absolute bottom-3 inset-x-3 z-10 max-w-[70%]" dir="rtl">
        <div className="sl-chip bg-[color:var(--surface-2)]/95 text-[11px]">
          חוק-העולם-המקביל: כל מטאפורה מוצגת לצד המדידה המילולית שלה — לעולם לא במקומה
        </div>
      </div>
    </div>
  );
}
