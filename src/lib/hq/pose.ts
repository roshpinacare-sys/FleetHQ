/**
 * pose.ts — המסלקת-תנוחות של הצוות (Task 47).
 * ------------------------------------------------------------------
 * הבעיה-השורשית שנמדדה: קליפ-הישיבה הפרוצדורלי הישן הציב רוטציות מנוחות
 * בערכי-אולר על עצמות mixamorig/RPM — אבל הצירים-המקומיים של עצמות אלה
 * אינם מיושרים לצירי-המודל, והתוצאה על-המסך היתה "דחלילים": ידיים פרושות
 * הצידה ולמעלה, לא ידיים על המקלדת.
 *
 * התיקון: מסלקה שפועלת במרחב-העולם ולכן אינה תלוית-ריג —
 *   1. דוגמת את כיוון-המנוחה של כל שרשרת עצמות (כתף→מרפק וכו') מהתבנית
 *      עצמה (bind pose), בלי הנחות על צירים.
 *   2. בונה רוטציה שממפה את כיוון-המנוחה אל כיוון-היעד (למשל "קדימה-מטה
 *      אל המקלדת") — setFromUnitVectors, יציב גם ב-T-pose.
 *   3. ממירה את הרוטציה-בעולם לרוטציה-מקומית דרך ההורה החדש (עיבוד
 *      מלמעלה-למטה), ומפיקה רצועות-מפתח אמיתיות ל-AnimationClip.
 *
 * הקליפים המופקים כאן הם החוזה היחיד לתנוחות-ישיבה/הקלדה/נשימה של החדר,
 * לשני הריגים (mixamorig ישיר + RPM מרוטרגט).
 */
import * as THREE from 'three';

export interface PoseMap {
  /** רוטציות-מקומיות חדשות לפי שם-עצם-מנוקד (ללא קידומת) */
  q: Record<string, THREE.Quaternion>;
  /** מצב-הירכיים המלא ביחידות-מקומיות של העצם (וקטור — לא סקלר:
   *  סקאלות-מערכות שונות בין הריגים — מיש'ל Z-up סמ"מ מול RPM Y-up מטרי) */
  hips: THREE.Vector3;
  /** אבחון (Task 47): גובה-הירכיים בעולם במנוחה, יחידות-התבנית */
  restWorldY: number;
  /** סימון מה נמצא וטופל — לאבחון */
  solved: string[];
  missing: string[];
}

type Bones = Record<string, THREE.Bone>;

const strip = (name: string) => name.replace(/^(mixamorig:|mixamorig)/, '');

export function collectBones(root: THREE.Object3D): Bones {
  const map: Bones = {};
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone) map[strip(b.name)] = b;
  });
  return map;
}

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();

/** כיוון מנוחה מעצם אל צאצאה, במרחב-המודל (התבנית במנוחה, root בזהות) */
function restDir(bones: Bones, from: string, to: string): THREE.Vector3 | null {
  const a = bones[from], b = bones[to];
  if (!a || !b) return null;
  a.updateWorldMatrix(true, false);
  b.updateWorldMatrix(true, false);
  const pa = V(), pb = V();
  a.getWorldPosition(pa);
  b.getWorldPosition(pb);
  const d = pb.sub(pa);
  return d.lengthSq() < 1e-10 ? null : d.normalize();
}

/**
 * מציב על העצם רוטציה שמכוונת את צאצאה אל targetDir (מרחב-מודל).
 * מעדכן את העצם בפועל (כדי שצאצאות יראו הורה חדש) ומחזיר את הרוטציה-המקומית.
 */
function aimBone(bones: Bones, name: string, child: string, targetDir: THREE.Vector3, rest: Record<string, THREE.Vector3>): THREE.Quaternion | null {
  const bone = bones[name];
  if (!bone) return null;
  const rd = rest[name];
  if (!rd) return null;
  const restWorld = Q();
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(restWorld);
  const qDelta = Q().setFromUnitVectors(rd, targetDir.clone().normalize());
  const newWorld = qDelta.multiply(restWorld);
  const parentWorld = Q();
  if (bone.parent) {
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(parentWorld);
  }
  const local = parentWorld.invert().multiply(newWorld);
  bone.quaternion.copy(local);
  return local;
}

export interface SitOpts {
  /** גובה-מושב בעולם (מטרים) */
  seatY: number;
  /** מקדם-הקטנת המודל (target height / raw height) — לתרגום גובה-ירכיים */
  scale: number;
  /** נטיית-גב קדימה (רדיאנים, חיובי = קדימה) */
  lean?: number;
}

/**
 * בונה את תנוחת-הישיבה על התבנית (שהיא במנוחה) ומחזירה מפת-תנוחה.
 * לא משנה את התבנית עצמה לצמיתות — הקריאה מחזירה ערכים; האחריות על הקורא
 * לשחזר את מנוחת התבנית (הקליפים נבנים פעם-אחת).
 */
export function solveSit(root: THREE.Object3D, opts: SitOpts): PoseMap {
  const bones = collectBones(root);
  // התבנית משותפת לכל הדמויות — שומרים את המנוחה ומשחזרים בסוף
  const saved: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone(), p: b.position.clone() });
  root.updateMatrixWorld(true);
  try {
    return solveSitInner(bones, root, opts);
  } finally {
    for (const s of saved) { s.b.quaternion.copy(s.q); s.b.position.copy(s.p); }
    root.updateMatrixWorld(true);
  }
}

function solveSitInner(bones: Bones, root: THREE.Object3D, opts: SitOpts): PoseMap {
  const rest: Record<string, THREE.Vector3> = {};
  const sample = (n: string, c: string) => {
    const d = restDir(bones, n, c);
    if (d) rest[n] = d;
  };
  sample('Spine', 'Spine1');       // עמוד-עליון
  sample('Spine1', 'Spine2');
  sample('Neck', 'Head');
  sample('Head', 'HeadTop_End');
  sample('LeftArm', 'LeftForeArm');
  sample('LeftForeArm', 'LeftHand');
  sample('RightArm', 'RightForeArm');
  sample('RightForeArm', 'RightHand');
  sample('LeftUpLeg', 'LeftLeg');
  sample('LeftLeg', 'LeftFoot');
  sample('RightUpLeg', 'RightLeg');
  sample('RightLeg', 'RightFoot');

  const solved: string[] = [];
  const missing: string[] = [];
  const out: Record<string, THREE.Quaternion> = {};
  const lean = opts.lean ?? 0.12;

  const hips = bones['Hips'];
  let hipsLocal: THREE.Vector3 | null = null;
  let restWorldY = 0;
  if (hips) {
    // Task 47 ROOT CAUSE (הקריסה-הנשית): סקאלות-מערכות שונות — מיש'ל נולד
    // Z-up סמ"מ (Character עם rot +90°X ו-scale 0.01; מנוחת-הירכיים המקומית
    // ‎(0,−0.52,−102.6)) ואילו RPM מטרי Y-up (‎(0,1.02,0)). כתיבת (0,מטרים,0)
    // ישירות שילחה את הדמות אל-תוך-הרצפה (hipsWorldY≈0 — נמדד חי).
    // הפתרון הגנרי: ציר-ה"מעלה" המקומי = quaternion-ההורה במנוחה × (0,1,0),
    // וההיסט מחושב דרך מנוחת-העולם — בלי שום הנחה על מערכת-הצירים.
    hips.updateWorldMatrix(true, false);
    const restWorld = V();
    hips.getWorldPosition(restWorld);
    restWorldY = restWorld.y;
    const parentQuat = Q();
    if (hips.parent) {
      hips.parent.updateWorldMatrix(true, false);
      hips.parent.getWorldQuaternion(parentQuat);
    }
    const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(parentQuat.invert()).normalize();
    const restLocal = hips.position.clone();
    // השמרטפי-על המכנה (לא על רכיב-ה-y של upLocal! — במיש'ל upLocal=(0,0,−1)
    // והתנאי הישן כיבה בדיוק את התיקון עבור הריג-היחיד שצריך אותו)
    const localUpComponent = restLocal.dot(upLocal);
    const k = Math.abs(localUpComponent) > 1e-6 ? restWorldY / localUpComponent : 1; // יחידות-עולם ליחידה-מקומית
    const desiredWorld = opts.seatY / Math.max(0.2, opts.scale); // יחידות-תבנית
    const delta = (desiredWorld - restWorldY) / (k !== 0 ? k : 1);
    hipsLocal = restLocal.clone().addScaledVector(upLocal, delta);
  } else missing.push('Hips');

  // 1) עמוד-שדרה: נטייה קדימה עדינה — Spine ו-Spine1
  const spineTarget = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
  for (const [b, c, t] of [
    ['Spine', 'Spine1', spineTarget],
    ['Spine1', 'Spine2', spineTarget],
  ] as const) {
    if (rest[b]) {
      const q = aimBone(bones, b, c, t, rest);
      if (q) { out[b] = q; solved.push(b); }
    } else missing.push(b);
  }

  // 2) ראש: מבט-מטה אל הצג (כ-16° מטה)
  if (rest['Head']) {
    const q = aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.28), Math.sin(0.28)), rest);
    if (q) { out['Head'] = q; solved.push('Head'); }
  } else missing.push('Head');

  // 3) זרועות: כיוון "קדימה-מטה אל המקלדת". צד לפי סימן-ה-x של הכתף במנוחה
  //    (אין הנחה איזה צד הוא שמאל בריג הזה — נמדד מהתבנית עצמה)
  for (const side of ['Left', 'Right'] as const) {
    const arm = `${side}Arm`, fore = `${side}ForeArm`, hand = `${side}Hand`, shoulder = `${side}Shoulder`;
    const hb = bones['Hips'];
    if (!hb || !bones[arm] || !rest[arm]) { missing.push(arm); continue; }
    hb.updateWorldMatrix(true, false);
    const hp = V(); hb.getWorldPosition(hp);
    bones[arm].updateWorldMatrix(true, false);
    const ap = V(); bones[arm].getWorldPosition(ap);
    const sgn = Math.sign(ap.x - hp.x) || 1;
    // זרוע: קדימה, מעט הצידה ומטה
    const upperDir = new THREE.Vector3(sgn * 0.22, -0.5, 0.84);
    const qArm = aimBone(bones, arm, fore, upperDir, rest);
    if (qArm) { out[arm] = qArm; solved.push(arm); }
    // מרפק: ממשיך קדימה-מטה (יד על המקלדת)
    if (rest[fore]) {
      const foreDir = new THREE.Vector3(sgn * 0.08, -0.55, 0.83);
      const qFore = aimBone(bones, fore, hand, foreDir, rest);
      if (qFore) { out[fore] = qFore; solved.push(fore); }
    } else missing.push(fore);
    void shoulder;
  }

  // 4) רגליים — גיאומטריה של ישיבה אמיתית (אגן 0.66מ' ← כיסא 0.5 + רקמה):
  //    ירך → ברך: ירידה 0.155 על קדימה 0.39 · ברך → קרסול: ירידה 0.40 על
  //    קדימה 0.10 — הרגל נשברת בברך והרגליים מגיעות-לרצפה (במטרות הקודמות
  //    השוק היה כמעט-אופקי והרגליים נשארו מתוחות-קדימה; נמדד חי: ברך 0.66
  //    מול ירך 0.71)
  const thigh = new THREE.Vector3(0, -0.37, 0.93);
  const shin = new THREE.Vector3(0, -0.96, 0.25);
  for (const side of ['Left', 'Right'] as const) {
    const up = `${side}UpLeg`, leg = `${side}Leg`, foot = `${side}Foot`;
    if (rest[up]) {
      const q = aimBone(bones, up, leg, thigh, rest);
      if (q) { out[up] = q; solved.push(up); }
    } else missing.push(up);
    if (rest[leg]) {
      const q = aimBone(bones, leg, foot, shin, rest);
      if (q) { out[leg] = q; solved.push(leg); }
    } else missing.push(leg);
  }

  return { q: out, hips: hipsLocal ?? new THREE.Vector3(0, 0.9, 0), restWorldY, solved, missing };
}

const trackName = (bone: string, prefix: string, prop: '.quaternion' | '.position') =>
  `${prefix}${bone}${prop}`;

/** קליפ-ישיבה סטטי ממפת-תנוחה (שני מפתחות זהים — תנוחה, לא תנועה) */
export function makeSitClip(prefix: string, pose: PoseMap, name = 'sit'): THREE.AnimationClip | null {
  if (!Object.keys(pose.q).length) return null;
  const t0 = 0.001, t1 = 1.001;
  const h = pose.hips;
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack(trackName('Hips', prefix, '.position'), [t0, t1], [h.x, h.y, h.z, h.x, h.y, h.z]),
  ];
  for (const [bone, q] of Object.entries(pose.q)) {
    const a = q.toArray(), b = q.toArray();
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName(bone, prefix, '.quaternion'), [t0, t1], [...a, ...b]));
  }
  return new THREE.AnimationClip(name, 1.002, tracks);
}

/**
 * קליפ-הקלדה אדיטיבי — דלתות עדינות סביב תנוחת-הישיבה (הישיבה היא הבסיס;
 * ההקלדה מוסיפה תנודת-אמות + הבהוב-ראש עדין). phase לכל סוכן נקבע בצד המיקסר.
 */
export function makeTypeClipAdditive(prefix: string, seed = 1): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72];
  const wave = (phase: number, amp: number) =>
    times.flatMap((t) => [...q(Math.sin(t * 9.5 + phase + seed) * amp, Math.cos(t * 7.3 + phase) * amp * 0.35, 0).toArray()]);
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('LeftForeArm', prefix, '.quaternion'), times, wave(0, 0.075)),
    new THREE.QuaternionKeyframeTrack(trackName('RightForeArm', prefix, '.quaternion'), times, wave(2.1, 0.075)),
    new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, wave(1.3, 0.022)),
    new THREE.QuaternionKeyframeTrack(trackName('Spine1', prefix, '.quaternion'), times, wave(0.7, 0.012)),
  ];
  const clip = new THREE.AnimationClip('type', 0.72, tracks, THREE.AdditiveAnimationBlendMode);
  return clip;
}

/**
 * קליפ-נשימה אדיטיבי — קיום בסיסי בלבד (לעולם לא "פעילות"): תנודת-חזה,
 * הרמת-כתפיים עדינה וראש-חי. רץ תמיד (גם בישיבה, גם בעמידה) — כאן הפאזה
 * האישית של כל סוכן נראית ביותר.
 */
export function makeBreatheClip(prefix: string): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 0.9, 1.8, 2.7, 3.6];
  const sway = (fx: number, fy: number, fz: number, amp: number) =>
    times.flatMap((t) => [...q(
      Math.sin(t / 3.6 * Math.PI * 2 * 1 + fx) * amp,
      Math.sin(t / 3.6 * Math.PI * 2 * 0.5 + fy) * amp * 0.6,
      Math.sin(t / 3.6 * Math.PI * 2 * 1 + fz) * amp * 0.8,
    ).toArray()]);
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, sway(0, 0, 0, 0.016)),
    new THREE.QuaternionKeyframeTrack(trackName('Spine1', prefix, '.quaternion'), times, sway(1.1, 0.4, 0, 0.012)),
    new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, sway(2.2, 1.5, 0.8, 0.014)),
    new THREE.QuaternionKeyframeTrack(trackName('LeftShoulder', prefix, '.quaternion'), times, sway(0, 0, 0.5, 0.01)),
    new THREE.QuaternionKeyframeTrack(trackName('RightShoulder', prefix, '.quaternion'), times, sway(0, 0, -0.5, 0.01)),
  ];
  return new THREE.AnimationClip('breathe', 3.6, tracks, THREE.AdditiveAnimationBlendMode);
}

/**
 * קליפ-idle פרוצדורלי כרשת-ביטחון (כשל-ריטרגינג): עמידה חיה עדינה —
 * משקל-גוף מתחלף וזרועות רגועות. לעולם לא T-pose קפואה.
 */
export function makeIdleStandClip(prefix: string): THREE.AnimationClip {
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const times = [0, 1.7, 3.4];
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, [
      ...q(0.02, 0, 0.014).toArray(), ...q(0.045, 0.02, -0.014).toArray(), ...q(0.02, 0, 0.014).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(trackName('LeftArm', prefix, '.quaternion'), times, [
      ...q(0.06, 0, 0.09).toArray(), ...q(0.09, 0, 0.12).toArray(), ...q(0.06, 0, 0.09).toArray(),
    ]),
    new THREE.QuaternionKeyframeTrack(trackName('RightArm', prefix, '.quaternion'), times, [
      ...q(0.06, 0, -0.09).toArray(), ...q(0.09, 0, -0.12).toArray(), ...q(0.06, 0, -0.09).toArray(),
    ]),
  ];
  return new THREE.AnimationClip('idle-proc', 3.4, tracks);
}
