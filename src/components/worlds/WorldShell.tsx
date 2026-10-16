/**
 * WorldShell.tsx — קליפה-משותפת לעולמות: קנבס מותאם-מובייל + צ'יפי-אמת כנים. [T13]
 * מרחב-שמות עצמאי — אפס-תלות ב-hq/* (דחיפה אדיטיבית-בטוחה ל-FleetHQ).
 */
'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

export function useWorldLite(): boolean {
  const [lite] = useState(() =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(max-width: 820px)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4));
  return lite;
}

/** קנבס-עולם — אותו חוק-ביצועים של המשרד: מסך-קטן/מוחלש = פחות פיקסלים ובלי צללים */
export function WorldCanvas({ children, bg, fog }: {
  children: React.ReactNode; bg: string; fog: [string, number, number];
}) {
  const lite = useWorldLite();
  return (
    <Canvas
      shadows={lite ? false : 'soft'}
      dpr={lite ? [0.75, 1.25] : [1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 80, position: [10, 8, 12] }}
      gl={{
        antialias: !lite,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      onCreated={({ gl, scene }) => {
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.fog = new THREE.Fog(fog[0], fog[1], fog[2]);
      }}
    >
      <color attach="background" args={[bg]} />
      <SceneErrorBoundary>
        <Suspense fallback={null}>{children}</Suspense>
      </SceneErrorBoundary>
    </Canvas>
  );
}

class SceneErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: Error) { console.error('[worlds] scene failure:', err.message); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="grid h-full w-full place-items-center" dir="rtl">
        <div className="sl-chip border-[color:var(--line)] bg-[color:var(--surface-2)] px-4 py-2 text-[13px] text-[color:var(--ink-2)]">
          העולם התלת-ממדי נתקל בכשל ונעצר בכנות — רעננו עמוד
        </div>
      </div>
    );
  }
}

/** צ'יפ-אמת של עולם — מקור + גיל, כנה גם כשאין */
export function WorldHud({ title, source, ageHe, warn }: {
  title: string; source: string; ageHe: string; warn?: string | null;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-1.5" dir="rtl">
      <div className="sl-chip border-[color:var(--line)] bg-[color:var(--surface-2)]/95 px-3 py-1.5 shadow-sm backdrop-blur">
        <span className="font-bold text-[color:var(--ink)]">{title}</span>
        <span className="mx-2 text-[color:var(--ink-3)]">·</span>
        <span className="text-[color:var(--ink-2)]">{source}</span>
        <span className="mx-2 text-[color:var(--ink-3)]">·</span>
        <span className="text-[color:var(--ink-3)]">{ageHe}</span>
      </div>
      {warn ? (
        <div className="sl-chip sl-chip-wrap border border-amber-600/40 bg-amber-500/10 px-3 py-1 text-[11.5px] text-amber-700 backdrop-blur dark:text-amber-400">
          {warn}
        </div>
      ) : null}
    </div>
  );
}

/** מסך-מקור-חסר כנה — לעולם לא מסך-ריק שנראה כמו עבודה */
export function WorldUnavailable({ what }: { what: string }) {
  return (
    <div className="grid h-full w-full place-items-center" dir="rtl" role="status">
      <div className="max-w-sm rounded-xl border border-[color:var(--line)] bg-[color:var(--surface-2)] px-5 py-4 text-center shadow-sm">
        <div className="mb-1 text-[14px] font-bold text-[color:var(--ink)]">{what} אינו זמין כרגע</div>
        <p className="text-[12px] leading-relaxed text-[color:var(--ink-3)]">
          חוק-האמת: לא נמציא נתונים. העולם ייפתח ברגע שהמקור הפומבי יחזור להתפרסם.
        </p>
      </div>
    </div>
  );
}

// ── תוויות-ספרייט (CanvasTexture) — עברית-בטוחה, ללא פורטלים ──
// תחליף ל-drei <Html>: הפורטלים גורמים ל-unmount-sync בזמן-רינדור בהחלפת
// עולמות (ראה לוג-הקונסולה). ספרייט-קנבס מצייר עברית נכון (shaping מלא)
// ומתמודד עם המצלמה לבד — אפס-פורטלים, אפס-שורשים-נוספים.

const LABEL_FONT = '600 26px system-ui, "Segoe UI", Arial, sans-serif';
const LABEL_FONT_SMALL = '400 21px system-ui, "Segoe UI", Arial, sans-serif';

export interface LabelSpec {
  lines: { text: string; small?: boolean; color?: string }[];
  bg?: string;
  border?: string;
  scale?: number;
}

function makeLabelCanvas(spec: LabelSpec): { tex: THREE.CanvasTexture; w: number; h: number } {
  const pad = 18;
  const lh = 30;
  const probe = document.createElement('canvas').getContext('2d')!;
  let w = 0;
  for (const l of spec.lines) {
    probe.font = l.small ? LABEL_FONT_SMALL : LABEL_FONT;
    w = Math.max(w, probe.measureText(l.text).width);
  }
  const cw = Math.ceil(w + pad * 2);
  const ch = Math.ceil(spec.lines.length * lh + pad * 1.4);
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(pad * 0.6 + r, 1);
  ctx.arcTo(cw - 1, 1, cw - 1, ch - 1, r);
  ctx.arcTo(cw - 1, ch - 1, 1, ch - 1, r);
  ctx.arcTo(1, ch - 1, 1, 1, r);
  ctx.arcTo(1, 1, cw - 1, 1, r);
  ctx.closePath();
  ctx.fillStyle = spec.bg ?? 'rgba(250,247,240,0.94)';
  ctx.fill();
  ctx.strokeStyle = spec.border ?? 'rgba(90,80,60,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  spec.lines.forEach((l, i) => {
    ctx.font = l.small ? LABEL_FONT_SMALL : LABEL_FONT;
    ctx.fillStyle = l.color ?? '#2b2620';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.text, cw / 2, pad * 0.9 + lh * (i + 0.5), cw - pad);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, w: cw, h: ch };
}

/** תווית-בילבורד בתלת-ממד — תמיד מול המצלמה, עברית מעוצבת כראוי */
export function LabelSprite({ spec, position, height = 0.62 }: {
  spec: LabelSpec; position: [number, number, number]; height?: number;
}) {
  const { tex, w, h } = useMemo(() => makeLabelCanvas(spec), [spec]);
  const k = (height * (spec.scale ?? 1)) / h;
  return (
    <sprite position={position} scale={[w * k, h * k, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
}
