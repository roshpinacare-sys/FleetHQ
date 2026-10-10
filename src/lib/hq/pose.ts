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
function aimBone(bones: Bones, name: string, child: string, targetDir: THREE.Vector3): THREE.Quaternion | null {
  const bone = bones[name];
  const childBone = bones[child];
  if (!bone || !childBone) return null;
  // Task 47-fix (measured live): the source direction is sampled from the LIVE
  // scene (bone→child NOW), not from the bind-rest map. The chain is solved
  // top-down and the bone already inherits its parent's new rotation; a delta
  // computed against the bind rest DOUBLE-COUNTED the parent's aim — measured
  // result: near-horizontal shins on every seated agent (ankle 0.42m vs knee
  // 0.47m instead of ~0.10m), a hunched spine (head 0.97m instead of ~1.15m).
  // The live delta is always the minimal correction: identical to the rest
  // delta for the FIRST bone of a chain, and exactly the residual difference
  // for the bones after it.
  bone.updateWorldMatrix(true, false);
  childBone.updateWorldMatrix(true, false);
  const pa = V(), pb = V();
  bone.getWorldPosition(pa);
  childBone.getWorldPosition(pb);
  const cur = pb.sub(pa);
  if (cur.lengthSq() < 1e-10) return null;
  cur.normalize();
  const restWorld = Q();
  bone.getWorldQuaternion(restWorld);
  const qDelta = Q().setFromUnitVectors(cur, targetDir.clone().normalize());
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
      const q = aimBone(bones, b, c, t);
      if (q) { out[b] = q; solved.push(b); }
    } else missing.push(b);
  }

  // 2) ראש: מבט-מטה אל הצג (כ-16° מטה)
  if (rest['Head']) {
    const q = aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.28), Math.sin(0.28)));
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
    const qArm = aimBone(bones, arm, fore, upperDir);
    if (qArm) { out[arm] = qArm; solved.push(arm); }
    // מרפק: ממשיך קדימה-מטה (יד על המקלדת)
    if (rest[fore]) {
      const foreDir = new THREE.Vector3(sgn * 0.08, -0.55, 0.83);
      const qFore = aimBone(bones, fore, hand, foreDir);
      if (qFore) { out[fore] = qFore; solved.push(fore); }
    } else missing.push(fore);
    void shoulder;
  }

  // 4) רגליים — גיאומטריה מודעת-מידות (Task 47-fix, נמדד-חי):
  //    יעדי-הרגל הסטטיים (ירך (0,−0.37,0.93) · שוק (0,−0.96,0.25)) הניחו
  //    פרופורציות אחידות; הריג-הנקבי שוק-ארוך-מירך (0.473מ' מול 0.37מ' —
  //    נמדד מהתבנית) — התוצאה: קרסול מתחת-לרצפה (−0.064מ' חי). התיקון:
  //    הכיוונים נגזרים מאורכי-השרשרת בפועל ומגיאומטריית-המושב —
  //    ירך seatY · ברך ~seat−0.12 · קרסול ~seat−0.53 (רצפה) — כך הרגל
  //    נשברת בברך והכף-רגל מגיעה-לרצפה בכל ריג, בלי קבועים-קטלניים.
  const chainLen = (a: string, b: string): number | null => {
    const ba = bones[a], bb = bones[b];
    if (!ba || !bb) return null;
    ba.updateWorldMatrix(true, false);
    bb.updateWorldMatrix(true, false);
    const pa = V(), pb = V();
    ba.getWorldPosition(pa);
    bb.getWorldPosition(pb);
    const d = pb.sub(pa).length();
    return d > 1e-6 ? d : null;
  };
  const lThigh = [
    chainLen('LeftUpLeg', 'LeftLeg'),
    chainLen('RightUpLeg', 'RightLeg'),
  ].filter((v): v is number => v !== null);
  const lShin = [
    chainLen('LeftLeg', 'LeftFoot'),
    chainLen('RightLeg', 'RightFoot'),
  ].filter((v): v is number => v !== null);
  const L1 = lThigh.length ? lThigh.reduce((a, b) => a + b, 0) / lThigh.length : 0.42;
  const L2 = lShin.length ? lShin.reduce((a, b) => a + b, 0) / lShin.length : 0.42;
  const kneeY = Math.max(0.35, opts.seatY - 0.12);
  const ankleY = Math.max(0.06, opts.seatY - 0.53);
  const dThigh = Math.min(0.9, Math.max(0.05, (opts.seatY - kneeY) / L1));
  const dShin = Math.min(0.985, Math.max(0.05, (kneeY - ankleY) / L2));
  for (const side of ['Left', 'Right'] as const) {
    const up = `${side}UpLeg`, leg = `${side}Leg`, foot = `${side}Foot`;
    if (!rest[up] || !rest[leg]) { missing.push(up); missing.push(leg); continue; }
    // מיקום-מדויק לכל צד (Task 47-fix): תגובת-הריג לכיוון-מטרה אינה תמיד
    // 1:1 (סטיית-bind של מיש'ל: כיוון-ירידה 0.324 הניב ירידה-בפועל 0.576 —
    // נמדד חי לפני ואחרי). כיוון-חי = נגזרת-כיוונית, ולכן יישוב איטרטיבי
    // של 2 מעברים (מדוד → תקן-יחסי → כוון-שוב) מתכנס ליעד בסנטימטרים —
    // הברך נוחתת בגובה-המושב והקרסול על-הרצפה בכל ריג.
    const targetDropThigh = opts.seatY - kneeY;
    const targetDropShin = kneeY - ankleY;
    let dT = dThigh, dS = dShin;
    const hipB = bones['Hips'], kneeB = bones[leg], ankleB = bones[foot];
    const measureDrop = (from: THREE.Bone | undefined, to: THREE.Bone | undefined): number | null => {
      if (!from || !to) return null;
      from.updateWorldMatrix(true, false);
      to.updateWorldMatrix(true, false);
      const a = V(), b = V();
      from.getWorldPosition(a);
      to.getWorldPosition(b);
      return a.y - b.y;
    };
    for (let pass = 0; pass < 2; pass++) {
      aimBone(bones, up, leg, new THREE.Vector3(0, -dT, Math.sqrt(Math.max(0.02, 1 - dT * dT))));
      const got = measureDrop(hipB, kneeB);
      if (got === null || Math.abs(got) < 1e-4) break;
      dT = Math.min(0.9, Math.max(0.05, dT * (targetDropThigh / got)));
    }
    const q1 = aimBone(bones, up, leg, new THREE.Vector3(0, -dT, Math.sqrt(Math.max(0.02, 1 - dT * dT))));
    if (q1) { out[up] = q1; solved.push(up); }
    for (let pass = 0; pass < 2; pass++) {
      aimBone(bones, leg, foot, new THREE.Vector3(0, -dS, Math.sqrt(Math.max(0.02, 1 - dS * dS))));
      const got = measureDrop(kneeB, ankleB);
      if (got === null || Math.abs(got) < 1e-4) break;
      dS = Math.min(0.985, Math.max(0.05, dS * (targetDropShin / got)));
    }
    const q2 = aimBone(bones, leg, foot, new THREE.Vector3(0, -dS, Math.sqrt(Math.max(0.02, 1 - dS * dS))));
    if (q2) { out[leg] = q2; solved.push(leg); }
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

// ─────────────── מסלקת-עמידה (Task 51, נמדד) ───────────────
/**
 * הבעיה שנמדדה: ה-idle המרוטרגט של Xbot על מיש'ל (ריג Z-up) משכיב אותה
 * על-הגב על הרצפה — רוטציית-האגן של הקליפ נולדה במוסכמת Y-up ואילו
 * ה-bind שלה Z-up (‎+90°X‎): הפרש-המוסכמות = החשיבה לאורך-ציר-אחד שלמה.
 * הישיבה ניצלת כי המסלקה כופה רוטציות מפורשות; העמידה נשענת על הריטרגט.
 *
 * התיקון — אותה משמעת של solveSit, לעמידה: זרועות לאורך-הגוף (כיוון
 * לפי סימן-ה-x של הכתף מול הירכיים — נמדד מהתבנית, לא מנוחש), גב
 * כמעט-זקוף, מבט-קדימה. ללא רצועת-הירכיים — מנוחת-ה-bind כבר עומדת.
 * הרגליים נשארות במנוחה (ישרות ב-bind של שני-הריגים).
 */
export function solveStand(root: THREE.Object3D): PoseMap {
  const bones = collectBones(root);
  const saved: { b: THREE.Bone; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  for (const b of Object.values(bones)) saved.push({ b, q: b.quaternion.clone(), p: b.position.clone() });
  root.updateMatrixWorld(true);
  try {
    return solveStandInner(bones, root);
  } finally {
    for (const s of saved) { s.b.quaternion.copy(s.q); s.b.position.copy(s.p); }
    root.updateMatrixWorld(true);
  }
}

function solveStandInner(bones: Bones, root: THREE.Object3D): PoseMap {
  const rest: Record<string, THREE.Vector3> = {};
  const sample = (n: string, c: string) => {
    const d = restDir(bones, n, c);
    if (d) rest[n] = d;
  };
  sample('Spine', 'Spine1');
  sample('Neck', 'Head');
  sample('Head', 'HeadTop_End');
  sample('LeftArm', 'LeftForeArm');
  sample('LeftForeArm', 'LeftHand');
  sample('RightArm', 'RightForeArm');
  sample('RightForeArm', 'RightHand');

  const solved: string[] = [];
  const missing: string[] = [];
  const out: Record<string, THREE.Quaternion> = {};

  // גב כמעט-זקוף (0.02 rad קדימה — נינוח, לא נוקשה)
  if (rest['Spine']) {
    const q = aimBone(bones, 'Spine', 'Spine1', new THREE.Vector3(0, Math.cos(0.02), Math.sin(0.02)));
    if (q) { out['Spine'] = q; solved.push('Spine'); }
  } else missing.push('Spine');
  // מבט-קדימה (0.05 rad מטה — עדין)
  if (rest['Head']) {
    const q = aimBone(bones, 'Head', 'HeadTop_End', new THREE.Vector3(0, Math.cos(0.05), Math.sin(0.05)));
    if (q) { out['Head'] = q; solved.push('Head'); }
  } else missing.push('Head');

  // זרועות לאורך-הגוף — כיוון לפי סימן-ה-x של הכתף מול הירכיים (מדידה, לא הנחה)
  const hb = bones['Hips'];
  for (const side of ['Left', 'Right'] as const) {
    const arm = `${side}Arm`, fore = `${side}ForeArm`, hand = `${side}Hand`;
    if (!hb || !bones[arm] || !rest[arm]) { missing.push(arm); continue; }
    hb.updateWorldMatrix(true, false);
    const hp = V(); hb.getWorldPosition(hp);
    bones[arm].updateWorldMatrix(true, false);
    const ap = V(); bones[arm].getWorldPosition(ap);
    const sgn = Math.sign(ap.x - hp.x) || 1;
    // זרוע: כמעט-אנכית-מטה, מעט הצידה ומעט קדימה
    const upperDir = new THREE.Vector3(sgn * 0.12, -0.93, 0.1);
    const qArm = aimBone(bones, arm, fore, upperDir);
    if (qArm) { out[arm] = qArm; solved.push(arm); }
    // מרפק: ממשיך מטה, כפיפה עדינה
    if (rest[fore]) {
      const foreDir = new THREE.Vector3(sgn * 0.05, -0.97, 0.06);
      const qFore = aimBone(bones, fore, hand, foreDir);
      if (qFore) { out[fore] = qFore; solved.push(fore); }
    } else missing.push(fore);
  }

  const hips = bones['Hips'];
  const hipsRest = hips ? hips.position.clone() : new THREE.Vector3(0, 0.9, 0);
  return { q: out, hips: hipsRest, restWorldY: 0, solved, missing };
}

/** קליפ-עמידה ממפת-התנוחה: התנוחה הפתורה בשלושה מפתחות + נשימה-זעירה —
 *  עמידה טבעית בכל ריג, בלי T-pose ובלי ריטרגט. Spine/Head מקבלים רק את
 *  רצועת-הנשימה (רצועה-כפולה-לאותו-נכס אסורה — PropertyMixer יתנגש). */
export function makeStandClip(prefix: string, pose: PoseMap): THREE.AnimationClip | null {
  if (!Object.keys(pose.q).length) return null;
  const times = [0, 2.2, 4.4];
  const tracks: THREE.KeyframeTrack[] = [];
  const q = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
  const nudge = (base: THREE.Quaternion, x: number, z: number) =>
    base.clone().multiply(q(x, 0, z)).toArray();
  for (const [bone, quat] of Object.entries(pose.q)) {
    if (bone === 'Spine' || bone === 'Head') continue; // להלן — עם נשימה-זעירה
    const a = quat.toArray();
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName(bone, prefix, '.quaternion'), times, [...a, ...a, ...a]));
  }
  const spine = pose.q['Spine'];
  if (spine) {
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName('Spine', prefix, '.quaternion'), times, [
      ...nudge(spine, 0, 0.008), ...nudge(spine, 0.012, -0.008), ...nudge(spine, 0, 0.008),
    ]));
  }
  const head = pose.q['Head'];
  if (head) {
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName('Head', prefix, '.quaternion'), times, [
      ...nudge(head, 0.01, 0), ...nudge(head, -0.008, 0), ...nudge(head, 0.01, 0),
    ]));
  }
  return new THREE.AnimationClip('stand', 4.4, tracks);
}
