/**
 * Crew.tsx — הצוות האנושי של המשרד.
 * ------------------------------------------------------------------
 * · זכרים — אווטאר Ready Player Me (Wolf3D, פנים אמיתיות, 67 עצמות)
 * · נקבה — Michelle (ריג mixamorig)
 * · מקור אנימציות — Xbot (idle/walk/run/agree/headShake) על אותו ריג mixamorig;
 *   לזכר הקליפים עוברים SkeletonUtils.retargetClip לשלד ה-RPM.
 * · קליפי ישיבה/הקלדה פרוצדורליים (מפתחות-זמן) — תמיד זמינים.
 * · צביעת ביגוד לפי צבע הסוכן בצד הלקוח (שיבוט חומרים).
 * · שלט שם חי + בועת דיבור (מהפיד) + צל מגע.
 */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { to3 } from '@/lib/hq/contract';
import { makeBlobShadowTexture, makeBubbleTexture, makeNameplate } from '@/lib/hq/textures';
import { useHq } from '@/lib/hq/store';
import { bus, agentVisualFresh, ROOM_STALE_MS } from '@/lib/hq/world';
import { STATE_COLORS } from '@/lib/hq/protocol';

const MALE_URL = '/models/humans/readyplayer.me.glb';
const FEMALE_URL = '/models/humans/Michelle.glb';
const SRC_URL = '/models/humans/Xbot.glb';
useGLTF.preload(MALE_URL);
useGLTF.preload(FEMALE_URL);
useGLTF.preload(SRC_URL);

const MALE_H = 1.76;
const FEMALE_H = 1.70;

type ClipLib = Record<string, THREE.AnimationClip>;

interface CrewAssets {
  maleTpl: THREE.Object3D;
  femaleTpl: THREE.Object3D;
  male: ClipLib;
  female: ClipLib;
}

// ─────────────── helpers ───────────────
function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => { if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh; });
  return found;
}

function stripPrefix(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks
    .filter((t) => !/LeftEye|RightEye|LeftToeBase|RightToeBase/.test(t.name))
    .map((t) => {
      if (t.name.startsWith('mixamorig:')) {
        const c = t.clone();
        c.name = t.name.replace('mixamorig:', '');
        return c;
      }
      return t;
    });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

/** השמטת רצועות עצמות שאינן קיימות ביעד (עיניים וכד') — מונע אזהרות PropertyBinding */
function dropMissingBones(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => !/LeftEye|RightEye|LeftToeBase|RightToeBase/.test(t.name));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}

function filterClipTracks(clip: THREE.AnimationClip, keep: (name: string) => boolean): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => keep(t.name));
  return new THREE.AnimationClip(clip.name + '-f', clip.duration, tracks, clip.blendMode);
}
const isHeadBone = (n: string) => /Neck|Head/.test(n);

/** קליפ ישיבה פרוצדורלי — ירכיים יורדות לכיסא, רגליים מקופלות */
function makeSitClip(prefix: string, hipsRestY: number, seatY: number): THREE.AnimationClip {
  const b = (n: string) => prefix + n;
  const t = 0.001;
  const drop = Math.max(0.2, hipsRestY - seatY);
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack(b('Hips') + '.position', [t, t + 1], [
      0, hipsRestY - drop, 0, 0, hipsRestY - drop, 0,
    ]),
    new THREE.QuaternionKeyframeTrack(b('LeftUpLeg') + '.quaternion', [t, t + 1], [
      ...q(-1.42, 0, 0.08).toArray(), ...q(-1.42, 0, 0.08).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('RightUpLeg') + '.quaternion', [t, t + 1], [
      ...q(-1.42, 0, -0.08).toArray(), ...q(-1.42, 0, -0.08).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('LeftLeg') + '.quaternion', [t, t + 1], [
      ...q(1.38, 0, 0).toArray(), ...q(1.38, 0, 0).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('RightLeg') + '.quaternion', [t, t + 1], [
      ...q(1.38, 0, 0).toArray(), ...q(1.38, 0, 0).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('Spine') + '.quaternion', [t, t + 1], [
      ...q(0.1).toArray(), ...q(0.1).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('LeftArm') + '.quaternion', [t, t + 1], [
      ...q(-0.42, 0, 0.28).toArray(), ...q(-0.42, 0, 0.28).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('RightArm') + '.quaternion', [t, t + 1], [
      ...q(-0.42, 0, -0.28).toArray(), ...q(-0.42, 0, -0.28).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('LeftForeArm') + '.quaternion', [t, t + 1], [
      ...q(-0.5, 0, 0).toArray(), ...q(-0.5, 0, 0).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('RightForeArm') + '.quaternion', [t, t + 1], [
      ...q(-0.5, 0, 0).toArray(), ...q(-0.5, 0, 0).toArray(),
    ]),
  ];
  return new THREE.AnimationClip('sit', 1.001, tracks);
}

/** קליפ הקלדה — אמות נעות מול המקלדת */
function makeTypeClip(prefix: string): THREE.AnimationClip {
  const b = (n: string) => prefix + n;
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 0.14, 0.28, 0.42, 0.56, 0.7];
  const fl = [-0.72, -0.5, -0.78, -0.55, -0.8, -0.72].map((v) => [...q(v, 0.06).toArray()]).flat();
  const fr = [-0.55, -0.78, -0.5, -0.8, -0.52, -0.55].map((v) => [...q(v, -0.06).toArray()]).flat();
  const spineArr = times.flatMap(() => [...q(0.15).toArray()]);
  const headArr = times.flatMap(() => [...q(0.16).toArray()]);
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(b('LeftForeArm') + '.quaternion', times, fl),
    new THREE.QuaternionKeyframeTrack(b('RightForeArm') + '.quaternion', times, fr),
    new THREE.QuaternionKeyframeTrack(b('Spine') + '.quaternion', times, spineArr),
    new THREE.QuaternionKeyframeTrack(b('Head') + '.quaternion', times, headArr),
  ];
  return new THREE.AnimationClip('type', 0.7, tracks);
}

/**
 * קליפ idle פרוצדורלי — נשימה עדינה. זהו רשת-הביטחון כשקליפ-ה-retarget של
 * ה-idle חסר (כשל-ריטרגינג): אף סוכן לא נשאר T-פוזה קפואה בלי שום תנועה.
 * זה לא "פעילות" — זו נוכחות בסיסית בלבד (העבודה מגיעה רק מהחוזה).
 */
function makeIdleClip(prefix: string): THREE.AnimationClip {
  const b = (n: string) => prefix + n;
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 1.6, 3.2];
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(b('Spine') + '.quaternion', times, [
      ...q(0.02, 0, 0.012).toArray(), ...q(0.045, 0, -0.012).toArray(), ...q(0.02, 0, 0.012).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('LeftForeArm') + '.quaternion', times, [
      ...q(-0.3, 0, 0).toArray(), ...q(-0.35, 0, 0).toArray(), ...q(-0.3, 0, 0).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(b('RightForeArm') + '.quaternion', times, [
      ...q(-0.3, 0, 0).toArray(), ...q(-0.35, 0, 0).toArray(), ...q(-0.3, 0, 0).toArray(),
    ]),
  ];
  return new THREE.AnimationClip('idle-proc', 3.2, tracks);
}

// ─────────────── בניית ספריית הקליפים ───────────────
function buildCrewAssets(maleGltf: { scene: THREE.Object3D }, femaleGltf: { scene: THREE.Object3D }, srcGltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): CrewAssets {
  const maleTpl = SkeletonUtils.clone(maleGltf.scene);
  maleTpl.updateMatrixWorld(true);
  const femaleTpl = SkeletonUtils.clone(femaleGltf.scene);
  femaleTpl.updateMatrixWorld(true);

  const srcClips = srcGltf.animations;
  const find = (re: RegExp) => srcClips.find((c) => re.test(c.name));
  const idle = find(/^(idle|Idle)$/);
  const walk = find(/^(walk|Walk)$/);
  const run = find(/^(run|Run)$/);
  const agree = find(/^agree$/i);
  const shake = find(/^headShake$/i);

  // נקבה — ריג mixamorig זהה: הקליפים המקוריים (מקודמת mixamorig:) עובדים ישירות
  const female: ClipLib = {};
  if (idle) female.idle = dropMissingBones(idle.clone());
  if (!female.idle) female.idle = makeIdleClip('mixamorig:'); // רשת-ביטחון — אף דמות לא T-פוזה
  if (walk) female.walk = dropMissingBones(walk.clone());
  if (run) female.run = dropMissingBones(run.clone());
  if (agree) female.agree = dropMissingBones(filterClipTracks(agree, isHeadBone));
  if (shake) female.shake = dropMissingBones(filterClipTracks(shake, isHeadBone));

  // מציאת עצם הירכיים לגובה ישיבה
  const hipsOf = (root: THREE.Object3D, prefix: string) => root.getObjectByName(prefix + 'Hips');
  const fh = hipsOf(femaleTpl, 'mixamorig:');
  if (fh) {
    female.sit = makeSitClip('mixamorig:', fh.position.y, 0.52);
    female.type = makeTypeClip('mixamorig:');
  }

  // זכר — retarget מ-Xbot ל-RPM
  const male: ClipLib = {};
  const srcMesh = findSkinnedMesh(srcGltf.scene);
  const maleMesh = findSkinnedMesh(maleTpl);
  if (srcMesh && maleMesh) {
    const tryRetarget = (clip: THREE.AnimationClip | undefined, name: string, keepHip = false) => {
      if (!clip) return;
      try {
        const out = SkeletonUtils.retargetClip(maleMesh!, srcMesh, stripPrefix(clip), {
          preserveBoneMatrix: false,
          preserveHipPosition: keepHip,
          useTargetMatrix: true,
        });
        out.name = name;
        male[name] = out;
      } catch (e) {
        console.warn('[hq-crew] retarget failed for', clip.name, e);
      }
    };
    tryRetarget(idle, 'idle', true);
    tryRetarget(walk, 'walk', true);
    tryRetarget(run, 'run', true);
    if (agree) tryRetarget(filterClipTracks(agree, isHeadBone), 'agree');
    if (shake) tryRetarget(filterClipTracks(shake, isHeadBone), 'shake');
    if (!male.idle) male.idle = makeIdleClip(''); // רשת-ביטחון — אף דמות לא T-פוזה

    const mh = hipsOf(maleTpl, '');
    if (mh) {
      male.sit = makeSitClip('', mh.position.y, 0.52);
      male.type = makeTypeClip('');
    }
  }
  return { maleTpl, femaleTpl, male, female };
}

// ─────────────── צביעה ───────────────
function recolor(root: THREE.Object3D, color: string, female: boolean, seed: number) {
  const crew = new THREE.Color(color);
  const dark = crew.clone().multiplyScalar(0.42);
  const skinTones = ['#f0c8a0', '#c89868', '#8a5c3a', '#e8b48a'];
  const skin = new THREE.Color(skinTones[seed % skinTones.length]);
  const hairCols = ['#1a1a1a', '#3a2a1a', '#6b4a2a', '#4a4a4a'];
  const hair = new THREE.Color(hairCols[seed % hairCols.length]);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.material = (Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : (mats[0].clone() as THREE.Material)) as THREE.Material;
    const apply = (m: THREE.MeshStandardMaterial) => {
      if (female) {
        // מיצ'ל — מאריג יחיד: גוון כללי לכיוון צבע הסוכן
        m.color.lerp(crew, 0.4);
        return;
      }
      const n = mesh.name;
      if (/Outfit_Top/i.test(n)) { m.color.copy(crew); m.roughness = 0.75; }
      else if (/Outfit_Bottom/i.test(n)) { m.color.copy(dark); }
      else if (/Outfit_Footwear/i.test(n)) { m.color.set('#241d16'); }
      else if (/Beard/i.test(n)) { m.color.copy(hair); }
      else if (/Head|Body/i.test(n) && !/Teeth/i.test(n)) { m.color.lerp(skin, 0.85); }
      else if (/Teeth|Eye/i.test(n)) { /* ללא שינוי */ }
      else if (/^Mesh$/i.test(n)) { m.color.copy(hair); } // שיער RPM
    };
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) apply(m as THREE.MeshStandardMaterial);
    });
  });
}

// ─────────────── מאגר בועות ───────────────
const bubbles = new Map<string, ReturnType<typeof makeBubbleTexture>>();
function bubbleOf(id: string) {
  let b = bubbles.get(id);
  if (!b) { b = makeBubbleTexture(); bubbles.set(id, b); }
  return b;
}

// ─────────────── הצוות ───────────────
export function Crew() {
  const maleGltf = useGLTF(MALE_URL);
  const femaleGltf = useGLTF(FEMALE_URL);
  const srcGltf = useGLTF(SRC_URL);
  const assets = useMemo(
    () => buildCrewAssets(maleGltf as never, femaleGltf as never, srcGltf as never),
    [maleGltf, femaleGltf, srcGltf],
  );
  const crew = useHq((s) => s.snap.crew);
  return (
    <group>
      {crew.map((c) => (
        <HumanAgent key={c.id} id={c.id} assets={assets} />
      ))}
    </group>
  );
}

const GENDER_OF: Record<string, 'male' | 'female'> = { aluf: 'male', gal: 'male', erez: 'male', tamar: 'female', shachar: 'female', yarden: 'male' };

function HumanAgent({ id, assets }: { id: string; assets: CrewAssets }) {
  const female = GENDER_OF[id] === 'female';
  const crew = useHq((s) => s.snap.crew.find((c) => c.id === id));
  const color = crew?.color ?? '#c9a227';

  const model = useMemo(() => {
    const tpl = female ? assets.femaleTpl : assets.maleTpl;
    const clone = SkeletonUtils.clone(tpl);
    // נרמול גובה
    const box = new THREE.Box3().setFromObject(clone);
    const h = Math.max(0.01, box.max.y - box.min.y);
    const s = (female ? FEMALE_H : MALE_H) / h;
    clone.scale.setScalar(s);
    recolor(clone, color, female, id.charCodeAt(0) + id.length);
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.frustumCulled = true; }
    });
    return clone;
  }, [female, assets, color, id]);

  const lib = female ? assets.female : assets.male;
  const plate = useMemo(() => makeNameplate(crew?.name.he ?? id, crew?.title.he ?? '', color), [crew, color]);
  const bubble = useMemo(() => bubbleOf(id), [id]);
  const shadowTex = useMemo(() => makeBlobShadowTexture(), []);

  // מיקסר
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useRef<Record<string, THREE.AnimationAction>>({});
  const alive = useRef(true);
  useEffect(() => {
    const a: Record<string, THREE.AnimationAction> = {};
    for (const [name, clip] of Object.entries(lib)) {
      if (!clip) continue;
      const act = mixer.clipAction(clip, model);
      act.play();
      act.setEffectiveWeight(name === 'idle' ? 1 : 0);
      a[name] = act;
    }
    actions.current = a;
    return () => { mixer.stopAllAction(); };
  }, [mixer, lib, model]);

  // ניקוי-משאבים מלא בהורדה (Task 46): חומרים משובטים + המיקסר + דגל-חיים
  // שמונע מ-timer-ים של מחוות לגעת במיקסר אחרי-שהדמות הורדה
  useEffect(() => {
    alive.current = true;
    const mats: THREE.Material[] = [];
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const arr = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of arr) mats.push(mm as THREE.Material);
      }
    });
    return () => {
      alive.current = false;
      for (const m of mats) m.dispose();
      mixer.uncacheRoot(model);
    };
  }, [mixer, model]);

  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const curWeight = useRef<Record<string, number>>({ idle: 1, walk: 0, sit: 0, type: 0 });
  const lastGesture = useRef<{ name: string; until: number }>({ name: '', until: 0 });
  const lastBubbleTxt = useRef('');

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const brains = useHq.getState().brains;
    const brain = brains.get(id);
    if (!brain) return;
    // THE TICK (Gate A fix, Task 46): the brain's movement/sit/work state is
    // interpolated HERE, once per frame per agent — without it walkAmt/sitAmt/
    // workAmt stay 0 forever and the whole crew freezes standing (the exact
    // "static characters with status labels" defect this task forbids).
    // Navigation gets wall-clock time (the 0.05s render clamp divided walking
    // speed by ~25 at a low frame rate); cosmetics keep the stable clamp.
    brain.update(Math.min(dtRaw, 1.0), dt);
    const g = group.current;
    if (!g) return;

    // מיקום + כיוון
    const [x, z] = to3(brain.x, brain.y);
    g.position.set(x, 0, z);
    if (inner.current) inner.current.rotation.y = brain.yaw;

    // משקולות פעולה — מהחוזה הדטרמיניסטי (agentVisual) עם חוק-הטריות:
    // סנאפשוט ישן/ניתוק = אפס עבודה. הנפשה ≠ פעילות (Task 46 Gate A).
    const bridge = useHq.getState();
    const fresh =
      bridge.connected &&
      bridge.lastSignalAt !== null &&
      Date.now() - bridge.lastSignalAt < ROOM_STALE_MS;
    const w = curWeight.current;
    const walkT = brain.walkAmt;
    const sitT = brain.sitAmt;
    const workT = fresh ? sitT * brain.workAmt : 0;
    w.idle = Math.max(0.08, 1 - walkT - sitT);
    w.walk = walkT;
    w.sit = sitT * (1 - workT * 0.55);
    w.type = workT;
    const setW = (name: string, v: number) => {
      const act = actions.current[name];
      if (!act) return;
      const target = Math.min(1, Math.max(0, v));
      const cur = act.getEffectiveWeight();
      const nw = cur + (target - cur) * Math.min(1, dt * 7);
      act.setEffectiveWeight(nw);
    };
    setW('idle', w.idle);
    setW('walk', w.walk);
    setW('sit', w.sit);
    setW('type', w.type);

    // מחוות חד-פעמיות לפי החוזה — רק כשהאמת טרייה (חוק-הטריות)
    const st = useHq.getState().snap.agents.find((a) => a.id === id);
    const now = state.clock.getElapsedTime();
    const gesture = st ? agentVisualFresh(st.state, fresh).gesture : 'none';
    if (gesture === 'agree' && lastGesture.current.name !== 'agree' && now - lastGesture.current.until > 6) {
      const act = actions.current['agree'];
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.setEffectiveWeight(0.9); act.play(); }
      lastGesture.current = { name: 'agree', until: now + 1.6 };
      setTimeout(() => { if (!alive.current) return; const a2 = actions.current['agree']; a2?.stop(); a2?.setEffectiveWeight(0); }, 1800);
    }
    if (gesture === 'shake' && lastGesture.current.name !== 'shake' && now - lastGesture.current.until > 6) {
      const act = actions.current['shake'];
      if (act) { act.reset(); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; act.setEffectiveWeight(0.9); act.play(); }
      lastGesture.current = { name: 'shake', until: now + 1.4 };
      setTimeout(() => { if (!alive.current) return; const a2 = actions.current['shake']; a2?.stop(); a2?.setEffectiveWeight(0); }, 1600);
    }

    // נשימה עדינה במנוחה
    void now;

    // שלט שם + בועה — כשהאמת ישנה השלט אומר "לא ידוע" בצבע-תשומת-הלב,
    // לעולם לא ממשיך להציג פעילות שלא נמדדה
    const lang = useHq.getState().lang;
    const activityText = fresh ? (st?.activity || '') : lang === 'he' ? 'האמת לא טרייה — לא ידוע' : 'truth stale — unknown';
    plate.set(activityText, fresh ? STATE_COLORS[st?.state || 'idle'] : '#b45309');
    const logs = useHq.getState().snap.logs[id] || [];
    const say = [...logs].reverse().find((l) => l.kind === 'say' && Date.now() - l.ts < 14000);
    const txt = say?.text ?? '';
    if (txt !== lastBubbleTxt.current) { lastBubbleTxt.current = txt; bubble.set(txt); }

    // צל מגע — עוקב אחרי הרגליים
    if (shadowRef.current) {
      shadowRef.current.position.set(x, 0.015, z);
    }

    mixer.update(dt);
  });

  const focus = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const st = useHq.getState();
    const brain = st.brains.get(id);
    if (brain) bus.emit('focus', { target: { x: brain.x, y: brain.y }, kind: 'desk', id });
    st.setPanel('agent', id);
  };

  return (
    <group ref={group}>
      {/* צל מגע */}
      <mesh ref={shadowRef} rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <planeGeometry args={[1.05, 1.05]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} opacity={0.75} />
      </mesh>
      <group ref={inner} onClick={focus}>
        <primitive object={model} />
        {/* שלט שם — מרחף מעל הראש (Task 46: מוגדל לקריאות בנקודות-התצפית) */}
        <sprite position={[0, 2.12, 0]} scale={[1.5, 0.47, 1]}>
          <spriteMaterial map={plate.tex} transparent depthWrite={false} depthTest={false} />
        </sprite>
        {/* בועת דיבור */}
        <sprite position={[0, 2.62, 0]} scale={[1.5, 0.43, 1]}>
          <spriteMaterial map={bubble.tex} transparent depthWrite={false} depthTest={false} />
        </sprite>
      </group>
    </group>
  );
}
