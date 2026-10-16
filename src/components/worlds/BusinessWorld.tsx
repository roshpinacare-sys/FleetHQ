/**
 * BusinessWorld.tsx — עולם-עסקים: אולם-האוצרה החי. [T13]
 * ---------------------------------------------------------------------------
 * מקורות-אמת: sovereign-beacon state.json (המפורסם) + מדידת-שרשרת ישירה
 * (api.steemit.com, המרה מדויקת) + Domain dex/grid.json (פס-ה-DEX).
 * ייחוד העולם: ביקורת-אמת חיה — האולם משווה בכל רגע את המפורסם מול השרשרת.
 * אין-התאמה → שלט-אמבר כנה. התאמה → אישור-שקט. זהו חוק-האנטי-זיופים בתלת-ממד.
 * [T15] רשת-האמת: צ'יפ-חי של המאמת-העצמאי (51 טענות) ושער-האמת של האתר-החי —
 * הגוף בודק-את-עצמו בפומבי, והמשרד רואה-זאת בכל-רגע (כנות: אדום נראה אדום).
 */
'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { WorldsPayload } from '@/lib/worlds/types';
import { WorldCanvas, WorldHud, WorldUnavailable, LabelSprite } from './WorldShell';

const FLOOR_TREASURY = 3000;
const FLOOR_OPERATOR = 100;

function Vault({ fill }: { fill: number }) {
  const disk = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    if (!disk.current) return;
    const target = Math.max(0.04, Math.min(1, fill)) * 5.2;
    disk.current.scale.y += (target / 0.12 - disk.current.scale.y) * Math.min(1, dt * 2.5);
    disk.current.position.y = 0.06 + disk.current.scale.y * 0.12 / 2;
  });
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 2.7, 0]} castShadow>
        <cylinderGeometry args={[2.5, 2.5, 5.4, 40, 1, true]} />
        <meshStandardMaterial color="#f3ead6" roughness={0.7} side={THREE.DoubleSide} transparent opacity={0.42} />
      </mesh>
      <mesh ref={disk} position={[0, 0.3, 0]} scale={[1, 1, 1]}>
        <cylinderGeometry args={[2.34, 2.34, 0.12, 36]} />
        <meshStandardMaterial color="#E0973F" roughness={0.35} emissive="#E0973F" emissiveIntensity={0.16} />
      </mesh>
      {/* קו-הרצפה 3,000 */}
      <mesh position={[0, 2.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.55, 0.045, 10, 60]} />
        <meshStandardMaterial color="#b3402f" emissive="#b3402f" emissiveIntensity={0.4} />
      </mesh>
      <LabelSprite height={0.8} position={[0, 6.3, 0]}
        spec={{ lines: [{ text: 'אוצרה ראשי' }], border: 'rgba(90,80,60,0.55)' }} />
    </group>
  );
}

function Pedestal({ label, value, floor, x }: { label: string; value: number | null; floor: number; x: number }) {
  const fill = value === null ? 0 : Math.min(1, value / floor);
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.5, 1, 1.5]} />
        <meshStandardMaterial color="#efe6d2" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.5 + fill * 0.5, 0]}>
        <boxGeometry args={[1.28, Math.max(0.03, fill), 1.28]} />
        <meshStandardMaterial color={fill >= 1 ? '#7BA05B' : '#E0973F'} roughness={0.45} />
      </mesh>
      <LabelSprite height={0.95} position={[0, 1.95, 0]}
        spec={{ lines: [
          { text: label },
          { text: value === null ? 'לא ידוע' : value.toFixed(1), small: true },
        ] }} />
    </group>
  );
}

function DexTable({ verdict, orders, stale }: { verdict: string; orders: number | null; stale: boolean }) {
  return (
    <group position={[-7.2, 0, -3]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[3.4, 0.8, 2]} />
        <meshStandardMaterial color="#efe6d2" roughness={0.8} />
      </mesh>
      <LabelSprite height={0.8} position={[0, 1.5, 0]}
        spec={{ lines: [
          { text: `DEX · ${verdict || 'לא ידוע'}${orders !== null ? ` · ${orders} פקודות פתוחות` : ''}${stale ? ' · מזדקן' : ''}` },
        ] }} />
    </group>
  );
}

export function BusinessWorld({ p }: { p: WorldsPayload | null }) {
  const published = p?.beacon.data?.lastPulse?.treasuryNetSp ?? null;
  const measured = p?.chain.data?.treasuryNetSp ?? null;
  const minOp = p?.beacon.data?.lastPulse?.minOperatorSp ?? null;
  const head = p?.chain.data?.head ?? p?.beacon.data?.lastPulse?.steemHead ?? null;
  const dex = p?.dex.data;
  const dexAgeH = dex?.publishedAt ? (Date.now() - Date.parse(dex.publishedAt)) / 3_600_000 : null;
  const dexStale = dexAgeH !== null ? dexAgeH > 30 : true;

  const audit = useMemo(() => {
    if (published === null || measured === null) return null;
    const diff = Math.abs(published - measured);
    return { diff, ok: diff <= 1 };
  }, [published, measured]);

  if (!p || (published === null && measured === null)) {
    return <WorldUnavailable what="האמת הכלכלית (משואה + שרשרת)" />;
  }
  const gap = published !== null ? Math.max(0, FLOOR_TREASURY - published) : null;

  return (
    <div className="relative h-full w-full">
      <WorldCanvas bg="#ece4d4" fog={['#ece4d4', 26, 70]}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, 16, 6]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[24, 48]} />
          <meshStandardMaterial color="#e7dfcd" roughness={0.9} />
        </mesh>
        <Vault fill={published !== null ? published / FLOOR_TREASURY : 0} />
        <Pedestal label="מפעיל מינימלי" value={minOp} floor={FLOOR_OPERATOR} x={5.6} />
        <Pedestal label="מדידת-שרשרת" value={measured} floor={FLOOR_TREASURY} x={-5.6} />
        <DexTable verdict={dex?.verdict ?? ''} orders={typeof dex?.openOrdersNow === 'number' ? dex.openOrdersNow : null} stale={dexStale} />
        <OrbitControls makeDefault autoRotate autoRotateSpeed={0.4} minDistance={7} maxDistance={40} maxPolarAngle={Math.PI / 2.05} target={[0, 2, 0]} />
      </WorldCanvas>
      <WorldHud
        title="עולם-עסקים"
        source={`אוצרה ${published !== null ? published.toFixed(1) : '?'} SP · רצפה 3,000`}
        ageHe={head ? `ראש-שרשרת ${head.toLocaleString('en-US')}` : 'לא ידוע'}
        warn={gap !== null && gap > 0 ? `פער-רצפה נמדד ${gap.toFixed(1)} SP — כנות מלאה` : null}
      />
      <div className="pointer-events-none absolute bottom-3 inset-x-3 z-10 flex flex-wrap gap-1.5" dir="rtl">
        {audit ? (
          <span className={`sl-chip sl-chip-wrap ${audit.ok ? 'bg-[color:var(--surface-2)]/95' : 'bg-amber-500/15 text-amber-700'}`}>
            {audit.ok
              ? `ביקורת-אמת: המשואה מאומתת מול השרשרת (סטייה ${audit.diff.toFixed(1)} SP)`
              : `ביקורת-אמת: חוסר-התאמה נמדד ${audit.diff.toFixed(1)} SP בין מפורסם לשרשרת`}
          </span>
        ) : (
          <span className="sl-chip sl-chip-wrap bg-amber-500/15 text-amber-700">ביקורת-אמת: מדידת-שרשרת לא זמינה כרגע</span>
        )}
        {p.verify?.data ? (
          (() => {
            const v = p.verify!.data!;
            const s = v.summary;
            const tg = v.truthGate;
            const allGreen = !!s && s.verdict === 'ALL_PASS' && (!tg || (tg.redGates?.length ?? 0) === 0);
            const bits: string[] = [];
            if (s) bits.push(`מאמת-הרשת ${s.passed}/${s.total} ${s.verdict}`);
            if (tg) bits.push(`שער-האמת ${tg.verdict ?? '?'}`);
            if (!allGreen && v.failures?.length) bits.push(`כשלים: ${v.failures.map((f) => f.id).join(', ')}`);
            if (!allGreen && tg?.redGates?.length) bits.push(tg.redGates.map((g) => `${g.gate} ${g.note ?? ''}`.trim()).join(' · '));
            return (
              <span className={`sl-chip sl-chip-wrap ${allGreen ? 'bg-[color:var(--surface-2)]/95' : 'bg-amber-500/15 text-amber-700'}`}>
                רשת-האמת: {bits.join(' · ') || 'לא ידוע'}
              </span>
            );
          })()
        ) : (
          <span className="sl-chip sl-chip-wrap bg-amber-500/15 text-amber-700">רשת-האמת: לא מפורסם עדיין</span>
        )}
        {p.chain.data?.receivedInSp ? (
          <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">האצלה-נכנסת {p.chain.data.receivedInSp.toFixed(1)} SP</span>
        ) : null}
        {p.chain.data?.delegatedOutSp ? (
          <span className="sl-chip sl-chip-wrap bg-[color:var(--surface-2)]/95">האצלה-יוצאת {p.chain.data.delegatedOutSp.toFixed(1)} SP</span>
        ) : null}
      </div>
    </div>
  );
}
