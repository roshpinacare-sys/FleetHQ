/**
 * Office3D.tsx — שורש הקנבס: מרכיב את הסצנה כולה.
 * מוזן מהגשר (store.ts) — AgentHQ מזרים לכאן את המציאות האמיתית של הפורמן.
 * ---------------------------------------------------------------------------
 * חוק-המדרגות (Task 9 — השיעור-הקשה מ-Task 8):
 *  Task 8 שלח PMREM + השתקפות-רצפה + Bloom + צללים-רכים גם אל סביבה בלי
 *  מאיץ-GPU — והדף קפא לגמרי (מדידה חיה: SwiftShader תלה את הטאב, eval לא
 *  נענה). מעכשיו הצינור הכבד רץ **רק על מאיץ-חומשה אמת** (probeGpuTier),
 *  ושומר-סף-חירום (watchdog) מוריד הכל אם הפריים-הראשון מתעכב — כנות
 *  מדודה במקום קפאון שקט. החיים (דופק-הצי, הצוות, הלוחות) הם התוכן —
 *  הם רצים בכל מדרגה.
 * · MSAA מקורי במדרגה-הכבדה — חדות-קצוות בעלות-ביצועים נמוכה
 * · RoomReadiness מודד את הפריים האמיתי הראשון (לשכבת-ההכנה + ה-watchdog)
 * · אין שחקן — מצלמת הבמאי בלבד
 */
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
import { probeGpuTier } from '@/lib/hq/gpu';
import { selectPreset } from './ViewDeck';

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
 * EnvReflections — סביבת-מראות (RoomEnvironment→PMREM) פעם-אחת.
 * רץ רק במדרגה-הכבדה (מאיץ-חומשה אמת) — על-גבי מנוע-תוכנה זה תלייה.
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

/** PostFX — Bloom ממוקד (מסכים אמיסיביים + להבה + ניאון) + Vignette.
 *  רק מדרגה-כבדה; lite/מנוע-תוכנה/חירום → בלי פוסט-פרוססינג בכלל. */
function PostFX({ off }: { off: boolean }) {
  if (off) return null;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom intensity={0.34} luminanceThreshold={0.76} luminanceSmoothing={0.18} mipmapBlur radius={0.62} />
      <Vignette offset={0.3} darkness={0.34} eskil={false} />
    </EffectComposer>
  );
}

/** FrameGuard (Task 9) — שומר-רעב שקוף בתוך-הקנבס: אם זמן-פריים ממוצע
 *  נשאר קיצוני (יותר מ-340ms) דרך 3 חלונות רצופים — הסצנה "נתקעה" במדידה.
 *  במקום קפאון שקט: יורד למדרגת-חירום ובורח לתצפית-הכללית. חוק-החיים:
 *  החדר חייב להישאר חי בכל זווית, בכל מכונה — מרוסן ומדוד. */
function FrameGuard({ onStarve }: { onStarve: () => void }) {
  const acc = useRef({ t: 0, n: 0, bad: 0, last: 0 });
  useFrame((_, dtRaw) => {
    const g = acc.current;
    g.t += dtRaw;
    g.n += 1;
    if (g.t >= 2) {
      const avg = g.t / Math.max(1, g.n);
      if (avg > 0.34) {
        g.bad += 1;
        if (g.bad >= 3 && Date.now() - g.last > 15_000) {
          g.bad = 0;
          g.last = Date.now();
          onStarve();
        }
      } else {
        g.bad = 0;
      }
      g.t = 0;
      g.n = 0;
    }
  });
  return null;
}

/** DemandPulse (Task 9) — פעימת-רינדור 4Hz למדרגת-חיסכון: החדר חי
 *  (הצוות זז, הלוחות נטענים, הלהבה נושמת) אך הרנדור סריאלי — בלי-תור
 *  מצטבר. זה ההבדל בין חי-לאט לבין תקוע-לנצח. */
function DemandPulse() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const iv = setInterval(() => invalidate(), 250);
    return () => clearInterval(iv);
  }, [invalidate]);
  return null;
}

export function Office3D() {
  // אמת-המנוע נמדדת פעם-אחת לפני העלאת-הקנבס (הרכיב רץ לקוח-בלבד):
  // מנוע-תוכנה/חסר = מדרגת-חיסכון מיד — לא מחכים ל-watchdog.
  const gpu = useMemo(() => probeGpuTier(), []);
  const [lite] = useState(() => {
    if (typeof window === 'undefined') return true;
    return (
      gpu !== 'hardware' ||
      window.matchMedia('(max-width: 820px)').matches ||
      (navigator.hardwareConcurrency ?? 8) <= 4);
  });
  // מדרגה-כבדה: רק מאיץ-אמת + מסך-מלא + ליבות-מספיקות.
  const [heavy, setHeavy] = useState(true);
  // שומר-סף-חירום (Task 9): אם הפריים-האמיתי הראשון לא נמדד בתוך 9שנ' —
  // מוריד את כל-הכבד בזמן-ריצה (בלי רענון): פוסט-פרוססינג, השתקפות,
  // צללים — ומוריד dpr. זה ההבדל בין "יפה וקפוא" ל"חי תמיד".
  const [panic, setPanic] = useState(false);
  useEffect(() => {
    if (lite) return; // מדרגת-חיסכון לא יכולה להיתקע על הכבד — אין מה להוריד
    const t = setTimeout(() => {
      if (!useHq.getState().roomReady) {
        setPanic(true);
        setHeavy(false);
        console.warn('[hq] watchdog: first real frame late — shedding heavy tier (fail-honest)');
      }
    }, 9_000);
    return () => clearTimeout(t);
  }, [lite]);
  const perfOff = lite || !heavy || panic;
  // FrameGuard — רק במדרגה-הכבדה: במדרגת-חיסכון אין מה להשיל (הכל כבר מינימלי)
  const onStarve = useMemo(() => () => {
    console.warn('[hq] FrameGuard: sustained frame starvation — shedding to overview + emergency tier');
    setPanic(true);
    setHeavy(false);
    selectPreset('overview');
  }, []);
  return (
    <Canvas
      // Task 9 (measured live): on software GL, an always-on rAF at 60fps
      // queues frames into the SwiftShader command buffer far faster than the
      // GPU process consumes them (0.3–1 fps real) — the backlog grows
      // without bound and the renderer main thread wedges forever. frameloop='demand'
      // + a 4Hz invalidator coalesces that backlog to ONE queued frame:
      // the room breathes slowly but can never wedge. The DOM HUD stays
      // fully live at 60fps either way.
      frameloop={lite ? 'demand' : 'always'}
      shadows={!perfOff ? 'soft' : false}
      dpr={perfOff ? [0.6, 0.9] : [1, 1.6]}
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
          {!perfOff && <EnvReflections />}
          <Architecture heavy={!perfOff} />
          <Stations />
          <Interior />
          <Crew />
          <CameraDirector />
          <Atmosphere />
          <RoomReadiness />
          {!lite && <FrameGuard onStarve={onStarve} />}
          {lite && <DemandPulse />}
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
