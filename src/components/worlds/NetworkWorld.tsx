/**
 * NetworkWorld.tsx — עולם-הרשת: האורגניזם כמפת-זרימה חיה בתלת-ממד. [T13]
 * ---------------------------------------------------------------------------
 * מקור-אמת: Sandbox ops/flow/flow-map.json (zai-code-3/F-series — צריכה-בלבד)
 * + sovereign-lighthouse state.json (דופק).
 * כל צומת = עורק אמיתי: גובה-לפי-טריות, צבע-לפי-מצב; קווים = זרימות מדודות.
 * יתומים/רוחות-רפאים/קפואים מוצגים בכנות — זה בדיוק הערך של העולם הזה.
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { WorldsPayload } from '@/lib/worlds/types';
import { WorldCanvas, WorldHud, WorldUnavailable, LabelSprite } from './WorldShell';
import { ageHe } from '@/lib/worlds/bridge';

const COLORS = {
  fresh: '#E0973F',      // עורק טרי (שעות)
  alive: '#7BA05B',      // עורק חי (יממה)
  stale: '#8a8375',      // מזדקן
  missing: '#b3402f',    // חסר — כנות אדומה
  edge: '#9a8f78',
};

function nodeState(n: { missing?: boolean; ageH?: number }): { color: string; h: number; he: string } {
  if (n.missing) return { color: COLORS.missing, h: 0.5, he: 'חסר' };
  const a = typeof n.ageH === 'number' ? n.ageH : 999;
  if (a <= 3) return { color: COLORS.fresh, h: 2.6, he: 'טרי' };
  if (a <= 26) return { color: COLORS.alive, h: 1.8, he: 'חי' };
  return { color: COLORS.stale, h: 0.9, he: 'מזדקן' };
}

interface Placed { key: string; x: number; z: number; color: string; h: number; repo: string; path: string; feeds: string; he: string }

/** פריסת-איים: צמתים מקובצים לפי ריפו, איים על טבעת */
function layout(p: WorldsPayload): { nodes: Placed[]; edges: { a: THREE.Vector3; b: THREE.Vector3; missing: boolean }[]; repos: string[] } {
  const raw = (p.flow.data?.nodes ?? []).filter((n) => n.key);
  const repos: string[] = [];
  for (const n of raw) {
    const r = n.repo ?? '?';
    if (!repos.includes(r)) repos.push(r);
  }
  const R = Math.max(8, repos.length * 1.6);
  const nodes: Placed[] = [];
  const byKey = new Map<string, Placed>();
  repos.forEach((repo, ri) => {
    const inRepo = raw.filter((n) => (n.repo ?? '?') === repo);
    const ang = (ri / repos.length) * Math.PI * 2;
    const cx = Math.cos(ang) * R, cz = Math.sin(ang) * R;
    const ring = Math.max(1.7, inRepo.length * 0.62);
    inRepo.forEach((n, ni) => {
      const a2 = (ni / Math.max(1, inRepo.length)) * Math.PI * 2;
      const st = nodeState(n);
      const x = cx + Math.cos(a2) * Math.min(ring, 5.2);
      const z = cz + Math.sin(a2) * Math.min(ring, 5.2);
      const placed: Placed = {
        key: n.key!, x, z, color: st.color, h: st.h, he: st.he,
        repo, path: (n.path ?? n.key ?? '').slice(0, 60), feeds: n.feeds ?? '',
      };
      nodes.push(placed);
      byKey.set(n.key!, placed);
    });
  });
  const edges: { a: THREE.Vector3; b: THREE.Vector3; missing: boolean }[] = [];
  for (const e of p.flow.data?.edges ?? []) {
    const fromKey = /([^\s]+:[^\s]+)/.exec(e.from ?? '')?.[1] ?? '';
    const a = byKey.get(fromKey) ?? byKey.get(e.from ?? '');
    const b = byKey.get(e.to ?? '');
    if (!a || !b) continue;
    edges.push({
      a: new THREE.Vector3(a.x, Math.min(a.h, 2.2), a.z),
      b: new THREE.Vector3(b.x, Math.min(b.h, 2.2), b.z),
      missing: !!e.nodeMissing,
    });
  }
  return { nodes, edges, repos };
}

function EdgeLines({ edges }: { edges: { a: THREE.Vector3; b: THREE.Vector3; missing: boolean }[] }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (const e of edges.slice(0, 140)) pts.push(e.a.x, e.a.y, e.a.z, e.b.x, e.b.y, e.b.z);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [edges]);
  return <lineSegments ref={ref} geometry={geom}><lineBasicMaterial color={COLORS.edge} transparent opacity={0.34} /></lineSegments>;
}

function Node({ n }: { n: Placed }) {
  const mesh = useRef<THREE.Mesh>(null);
  // תוויות-מדורגות: שכנים על הטבעת לא נופלים לאותה-גובה — פיזור-קריא (Task 59)
  const labelY = n.x + n.z >= 0 ? 0.55 : 1.05;
  useFrame((s) => {
    if (!mesh.current) return;
    const t = s.clock.elapsedTime;
    const pulse = n.color === COLORS.fresh ? 1 + Math.sin(t * 2.2 + n.x) * 0.05 : 1;
    mesh.current.scale.setScalar(pulse);
  });
  return (
    <group position={[n.x, n.h / 2, n.z]}>
      <mesh ref={mesh} castShadow>
        <cylinderGeometry args={[0.17, 0.21, n.h, 10]} />
        <meshStandardMaterial color={n.color} roughness={0.55} />
      </mesh>
      <LabelSprite height={0.62} position={[0, n.h / 2 + labelY, 0]}
        spec={{ lines: [
          { text: `${n.path.split('/').pop() || n.path} · ${n.he}` },
        ] }} />
    </group>
  );
}

function RepoLabel({ repo, x, z }: { repo: string; x: number; z: number }) {
  const short = repo.split('/')[1] ?? repo;
  return (
    <LabelSprite height={0.72} position={[x, 0.5, z]}
      spec={{ lines: [{ text: short }], border: 'rgba(90,80,60,0.55)' }} />
  );
}

function Scene({ p }: { p: WorldsPayload }) {
  const { nodes, edges, repos } = useMemo(() => layout(p), [p]);
  const R = Math.max(8, repos.length * 1.6);
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[12, 18, 8]} intensity={1.35} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R + 7, 64]} />
        <meshStandardMaterial color="#e7e0d1" roughness={0.9} />
      </mesh>
      {repos.map((repo, ri) => {
        const ang = (ri / repos.length) * Math.PI * 2;
        return <RepoLabel key={repo} repo={repo} x={Math.cos(ang) * R} z={Math.sin(ang) * R} />;
      })}
      {nodes.map((n) => <Node key={n.key} n={n} />)}
      <EdgeLines edges={edges} />
      <OrbitControls makeDefault enablePan autoRotate autoRotateSpeed={0.5} minDistance={5} maxDistance={46} maxPolarAngle={Math.PI / 2.06} />
    </>
  );
}

export function NetworkWorld({ p }: { p: WorldsPayload | null }) {
  if (!p || !p.flow.ok || !p.flow.data?.nodes?.length) {
    return <WorldUnavailable what="מפת-הזרימה של הרשת" />;
  }
  const d = p.flow.data;
  const orphans = Array.isArray(d.orphans) ? d.orphans.length : 0;
  const ghosts = Array.isArray(d.ghosts) ? d.ghosts.length : 0;
  const stale = Array.isArray(d.stale) ? d.stale.length : 0;
  const lhAge = p.lighthouse.ok ? p.lighthouse.data?.generatedAt ?? null : null;
  const missing = Array.isArray(d.nodes) ? d.nodes.filter((n) => n.missing).length : 0;
  return (
    <div className="relative h-full w-full">
      <WorldCanvas bg="#e9e2d3" fog={['#e9e2d3', 30, 74]}>
        <Scene p={p} />
      </WorldCanvas>
      <WorldHud
        title="עולם-הרשת"
        source={`${d.nodes?.length ?? 0} עורקים · ${d.edges?.length ?? 0} זרימות`}
        ageHe={ageHe(lhAge ? Math.max(0, (Date.now() - Date.parse(lhAge)) / 1000) : null)}
        warn={missing > 0 ? `${missing} עורקים חסרים — כנות` : null}
      />
      <div className="pointer-events-none absolute bottom-3 inset-x-3 z-10 flex flex-wrap gap-1.5" dir="rtl">
        <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">יתומים {orphans}</span>
        <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">רוחות-רפאים {ghosts}</span>
        <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">מזדקנים {stale}</span>
        {p.lighthouse.ok ? <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">מגדלור חי</span> : <span className="sl-chip sl-chip-wrap bg-amber-500/15 text-amber-700">מגדלור לא זמין</span>}
      </div>
    </div>
  );
}
