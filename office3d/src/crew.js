/**
 * crew.js — הצוות החי: דמויות מפרקיות (אגן/פלג-גוף-עליון/ראש/זרועות/רגליים)
 * עם הליכה אמיתית (צעד+ברך+נדנוד-ידיים), ישיבה/קימה, הקלדה, מחוות, מבטים,
 * ולופ-התנהגות מלא בין תחנות: שולחן ← קפה/ספרייה/קיר-גיט/שיחה ← חזרה.
 * רגליים על הרצפה תמיד — אף דמות לא מרחפת. הכול פרוצדורלי, אין מודלים חוץ.
 */

import * as THREE from 'three';
import { CREW, DESKS, DESK_IDS, FLAME, PODIUM, TASK_WALL, GIT_WALL, LIBRARY, COFFEE, LEAD_WALL_SPOT, ARC_CENTER, CHAT_SPOTS, LEAD_TABLE } from './canon.js';
import { makeNameplate } from './textures.js';

const TAU = Math.PI * 2;

function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}

const SKINS = ['#e8b48c', '#d9a074', '#c98d5f', '#f0c39a', '#b87a4e'];
const PANTS = ['#2e3440', '#3a3630', '#33383f', '#3f3a45'];

// ─────────────────────────────────────────────
// בניית דמות — היררכיית מפרקים עם פיבוטים
// ─────────────────────────────────────────────
function buildBody(def) {
  const skin = new THREE.MeshStandardMaterial({ color: def.skin, roughness: 0.75 });
  const shirt = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.85 });
  const sleeve = new THREE.MeshStandardMaterial({ color: def.blazer ? new THREE.Color(def.color).multiplyScalar(0.62).getStyle() : def.color, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: def.pants, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#26221e', roughness: 0.6 });
  const hairM = new THREE.MeshStandardMaterial({ color: def.hairColor, roughness: 0.95 });

  const j = {}; // מפרקים
  const meshes = [];

  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 3, 10);

  function seg(parent, name, pos) {
    const g = new THREE.Group();
    g.position.copy(pos);
    parent.add(g);
    j[name] = g;
    return g;
  }
  function addMesh(parent, geo, mat, y = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  }

  const root = new THREE.Group();
  const scale = def.height / 1.72;
  root.scale.setScalar(scale);

  // אגן
  const hips = seg(root, 'hips', new THREE.Vector3(0, 0.96, 0));
  const pelvis = addMesh(hips, cap(0.13, 0.08), pants, 0.02);

  // פלג-גוף עליון
  const spine = seg(hips, 'spine', new THREE.Vector3(0, 0.06, 0));
  const torso = addMesh(spine, cap(0.155, 0.3), shirt, 0.21);
  torso.scale.set(1.12, 1, 0.82);
  const chest = seg(spine, 'chest', new THREE.Vector3(0, 0.4, 0));

  // צוואר + ראש
  const neck = seg(chest, 'neck', new THREE.Vector3(0, 0.12, 0));
  addMesh(neck, new THREE.CylinderGeometry(0.05, 0.055, 0.09, 8), skin, 0.04);
  const head = seg(neck, 'head', new THREE.Vector3(0, 0.1, 0));
  const skull = addMesh(head, new THREE.SphereGeometry(0.115, 18, 14), skin, 0.09);
  skull.scale.set(0.94, 1.05, 0.98);
  // שיער
  const hairCap = addMesh(head, new THREE.SphereGeometry(0.122, 16, 12, 0, TAU, 0, Math.PI * 0.55), hairM, 0.095);
  hairCap.scale.set(0.97, 1.02, 1.0);
  if (def.hairBack) {
    const back = addMesh(head, new THREE.SphereGeometry(0.105, 12, 10, 0, Math.PI), hairM, 0.06);
    back.rotation.set(0.35, 0, Math.PI);
    back.scale.set(0.9, 1.25, 0.75);
  }
  if (def.bun) {
    const bun = addMesh(head, new THREE.SphereGeometry(0.05, 10, 8), hairM, 0.2);
    bun.position.z = -0.06;
  }
  if (def.beard) {
    const beard = addMesh(head, new THREE.SphereGeometry(0.1, 12, 10, 0, Math.PI), hairM, 0.045);
    beard.rotation.set(-0.25, 0, Math.PI);
    beard.scale.set(0.92, 0.7, 0.85);
  }
  // עיניים (מצוירות כקטנות — לצורך הבהוב scale.y)
  const eyeG = new THREE.SphereGeometry(0.016, 8, 6);
  const eyeM = new THREE.MeshStandardMaterial({ color: '#1d1a17', roughness: 0.35 });
  const eyes = [];
  for (const ex of [-0.042, 0.042]) {
    const e = new THREE.Mesh(eyeG, eyeM);
    e.position.set(ex, 0.098, 0.098);
    head.add(e);
    eyes.push(e);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.006, 0.01), hairM);
    brow.position.set(ex, 0.126, 0.1);
    head.add(brow);
  }
  if (def.glasses) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.3, metalness: 0.5 }));
    rim.position.set(0, 0.098, 0.102);
    head.add(rim);
  }
  // אף קטן
  const nose = addMesh(head, new THREE.ConeGeometry(0.014, 0.04, 6), skin, 0.09);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.108;

  // זרועות
  function buildArm(side) { // side: -1 ימין (x שלילי ב-RTL? נשתמש x=±), +1 שמאל
    const sx = side * 0.2;
    const up = seg(chest, `arm${side}`, new THREE.Vector3(sx, 0.075, 0));
    const upM = addMesh(up, cap(0.048, 0.2), sleeve, -0.13);
    const fore = seg(up, `fore${side}`, new THREE.Vector3(0, -0.26, 0));
    addMesh(fore, cap(0.04, 0.17), skin, -0.115);
    const hand = seg(fore, `hand${side}`, new THREE.Vector3(0, -0.24, 0));
    const handM = addMesh(hand, new THREE.SphereGeometry(0.045, 10, 8), skin, -0.02);
    handM.scale.set(0.85, 1.1, 0.6);
    return { up, fore, hand };
  }
  buildArm(-1);
  buildArm(1);

  // רגליים
  function buildLeg(side) {
    const sx = side * 0.105;
    const thigh = seg(hips, `thigh${side}`, new THREE.Vector3(sx, -0.03, 0));
    addMesh(thigh, cap(0.065, 0.28), pants, -0.17);
    const shin = seg(thigh, `shin${side}`, new THREE.Vector3(0, -0.4, 0));
    addMesh(shin, cap(0.05, 0.26), pants, -0.15);
    const foot = seg(shin, `foot${side}`, new THREE.Vector3(0, -0.36, 0));
    const fm = addMesh(foot, new THREE.BoxGeometry(0.095, 0.06, 0.24), shoe, -0.015);
    fm.position.z = 0.045;
    return { thigh, shin, foot };
  }
  buildLeg(-1);
  buildLeg(1);

  // שלט-שם
  const plate = makeNameplate(def.he, def.role, def.color);
  plate.position.y = 1.32 / scale + 0.22;
  root.add(plate);

  // צל-מגע (הקרקעה ויזואלית)
  const blobC = document.createElement('canvas');
  blobC.width = blobC.height = 128;
  const bg = blobC.getContext('2d');
  const grd = bg.createRadialGradient(64, 64, 8, 64, 64, 62);
  grd.addColorStop(0, 'rgba(30,20,10,0.34)');
  grd.addColorStop(1, 'rgba(30,20,10,0)');
  bg.fillStyle = grd; bg.fillRect(0, 0, 128, 128);
  const blobT = new THREE.CanvasTexture(blobC);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.015;
  root.add(blob);

  return { root, j, eyes, meshes, plate };
}

// ─────────────────────────────────────────────
// סוכן אחד — FSM + תנועה + אנימציה
// ─────────────────────────────────────────────
class Agent {
  constructor(def, opts) {
    this.def = def;
    this.id = def.id;
    this.body = buildBody(def);
    this.onBubble = opts.onBubble;
    this.liveActivity = '';
    this.mode = 'sim';
    this.say = this.say.bind(this);

    // תחנת-הבית
    if (def.lead) {
      this.home = { x: LEAD_WALL_SPOT[0], z: LEAD_WALL_SPOT[1], face: Math.PI }; // פונה צפונה ללוח
    } else {
      const d = DESKS[def.desk];
      this.home = { x: d.seat[0], z: d.seat[1], face: d.face, desk: d };
    }

    this.pos = new THREE.Vector2(this.home.x, this.home.z);
    this.face = this.home.face;
    this.path = null; // [{x,z}, ...] + פנייה בסוף
    this.speed = 1.02 + Math.random() * 0.14;
    this.walkPhase = Math.random() * TAU;
    this.moving = false;

    this.state = def.lead ? 'board' : 'desk';
    this.stateUntil = 6 + Math.random() * 10;
    this.sitK = def.lead ? 0 : 1; // 1=יושב, 0=עומד
    this.typing = 0; // אינטנסיביות הקלדה 0..1
    this.gesture = null; // {kind, until, target?}
    this.blinkAt = 1 + Math.random() * 4;
    this.lookTarget = null;
    this.ambientAt = 8 + Math.random() * 14;
    this.carryBook = false;

    // יעדי-מבט שימושיים
    if (!def.lead) {
      const d = this.home.desk;
      this.monitorPos = new THREE.Vector3(d.x, 1.05, d.z);
    }
    this.headWorld = new THREE.Vector3();

    this.applyImmediate();
  }

  say(text, dur = 4200) {
    if (this.onBubble) this.onBubble(this.id, text, dur);
  }

  /** מיקום עולם של הראש (לצילום-מיקוד ולבועות) */
  headPos(out) {
    this.body.j.head.getWorldPosition(out);
    return out;
  }

  setLive(activity, mode) {
    this.liveActivity = activity || '';
    this.mode = mode;
    if (activity && !this.moving && this.state !== 'chat' && this.state !== 'sit-down') {
      const a = activity;
      if (/קפה/.test(a) && this.state !== 'coffee') this.dispatch('coffee');
      else if (/תקלה|נכשל|שגיא/.test(a) && this.state === 'desk') {
        this.gesture = { kind: 'shake', until: 3.2 };
        this.say('תקלה — רואים ביומן. חוזרים בעוד רגע.');
      }
    }
  }

  // ───── ניווט ─────
  walkTo(x, z, faceAtEnd, onArrive, approach = 0.46, via = null) {
    // מסלול: עוקף את מרכז-הקשת דרך מסדרון דרומי/צפוני אם חוצה אותו
    const from = { x: this.pos.x, z: this.pos.y };
    const pts = [];
    if (via) for (const v of via) pts.push({ x: v[0], z: v[1] });
    if (this.lineCrossesArc(from, { x, z })) {
      const corridor = (from.z + z) / 2 > 0 ? 3.9 : -3.1;
      pts.push({ x: from.x, z: corridor }, { x, z: corridor });
    }
    pts.push({ x, z });
    this.path = { pts, i: 0, faceAtEnd, onArrive, approach };
    this.moving = true;
    this.sitK = 0;
  }

  lineCrossesArc(a, b) {
    // מלבן הקשת הפנימי (בערך x∈[-3.3,3.3], z∈[-1.6,2.4])
    const inside = (p) => Math.abs(p.x) < 3.3 && p.z > -1.6 && p.z < 2.4;
    if (inside(a) || inside(b)) return false; // כבר בפנים — זז ישר
    // חיתוך קו עם המלבן (גס ומספיק)
    const segHit = (x0, x1, zc) => {
      if ((a.z - zc) * (b.z - zc) > 0) return false;
      const t = (zc - a.z) / (b.z - a.z);
      const x = a.x + (b.x - a.x) * t;
      return x > -3.3 && x < 3.3;
    };
    const segHitZ = (z0, z1, xc) => {
      if ((a.x - xc) * (b.x - xc) > 0) return false;
      const t = (xc - a.x) / (b.x - a.x);
      const z = a.z + (b.z - a.z) * t;
      return z > -1.6 && z < 2.4;
    };
    return segHit(a.x, b.x, -1.6) || segHit(a.x, b.x, 2.4) || segHitZ(a.z, b.z, -3.3) || segHitZ(a.z, b.z, 3.3);
  }

  stepMove(dt) {
    const p = this.path;
    if (!p) return;
    const target = p.pts[p.i];
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.y;
    const dist = Math.hypot(dx, dz);
    const stopAt = p.i === p.pts.length - 1 ? (p.approach ?? 0.46) : 0.05;
    if (dist <= stopAt) {
      p.i++;
      if (p.i >= p.pts.length) {
        this.path = null;
        this.moving = false;
        if (p.faceAtEnd != null) this.face = p.faceAtEnd;
        if (p.onArrive) p.onArrive();
        return;
      }
      return;
    }
    const step = Math.min(this.speed * dt, dist - stopAt);
    const nx = dx / dist, nz = dz / dist;
    let goX = this.pos.x + nx * step;
    let goZ = this.pos.y + nz * step;
    // הימנעות-קשה מליבת להבת-הריבונות
    const fdx = goX - FLAME[0], fdz = goZ - FLAME[1];
    const fd = Math.hypot(fdx, fdz);
    if (fd < 0.95 && fd > 0.0001) {
      const push = (0.95 - fd) / fd;
      goX += fdx * push; goZ += fdz * push;
    }
    this.pos.x = goX; this.pos.y = goZ;
    const wantFace = Math.atan2(nx, nz);
    this.face = lerpAngle(this.face, wantFace, 1 - Math.exp(-6 * dt));
    this.walkPhase += dt * this.speed * 7.4;
  }

  // ───── FSM ─────
  dispatch(next) {
    switch (next) {
      case 'desk': {
        const h = this.home;
        const dirX = Math.sin(h.face), dirZ = Math.cos(h.face);
        // נקודת-עזר לפני הכיסא, אחר-כך הכיסא עצמו
        this.walkTo(h.x, h.z, h.face, () => {
          this.state = 'sit-down';
          this.stateUntil = 0.95;
        }, 0.0, [[h.x - dirX * 0.6, h.z - dirZ * 0.6]]);
        this.setLabel('חוזר לשולחן');
        break;
      }
      case 'coffee':
        this.walkTo(COFFEE[0] + 0.3, COFFEE[1] + 0.85, Math.PI, () => {
          this.state = 'coffee'; this.stateUntil = 7 + Math.random() * 6;
        }, 0.32);
        this.setLabel('הולך לבר-קפה');
        break;
      case 'library':
        this.walkTo(LIBRARY.table[0] - 0.5, LIBRARY.table[1] + 1.05, Math.PI, () => {
          this.state = 'library'; this.stateUntil = 8 + Math.random() * 6;
          this.carryBook = false;
        }, 0.3);
        this.setLabel('הולך לספרייה');
        break;
      case 'gitwall':
        this.walkTo(GIT_WALL.x + 1.4, GIT_WALL.z + 1.5, Math.PI, () => {
          this.state = 'gitwall'; this.stateUntil = 6 + Math.random() * 5;
        }, 0.3);
        this.setLabel('בודק את קיר-הגיט');
        break;
      case 'board': // ראש-המטה מול הלוח
        this.walkTo(LEAD_WALL_SPOT[0], LEAD_WALL_SPOT[1], Math.PI, () => {
          this.state = 'board'; this.stateUntil = 9 + Math.random() * 7;
        }, 0.34);
        this.setLabel('מתפעל את לוח-המשימות');
        break;
      case 'podium':
        this.walkTo(PODIUM.x - 0.52, PODIUM.z, PODIUM.face, () => {
          this.state = 'podium'; this.stateUntil = 8 + Math.random() * 6;
        }, 0.28);
        this.setLabel('הולך לדוכן-ההחלטות');
        break;
      case 'flame':
        this.walkTo(ARC_CENTER[0] + (Math.random() - 0.5) * 1.4, ARC_CENTER[1] + 0.9 + (Math.random() - 0.5) * 0.8, null, () => {
          this.state = 'flame'; this.stateUntil = 4 + Math.random() * 4;
          this.face = Math.atan2(FLAME[0] - this.pos.x, FLAME[1] - this.pos.y);
        }, 0.55);
        this.setLabel('נעמד מול להבת-הריבונות');
        break;
      case 'leadtable':
        this.walkTo(LEAD_TABLE.x - 0.95, LEAD_TABLE.z + 1.15, null, () => {
          this.state = 'leadtable'; this.stateUntil = 7 + Math.random() * 6;
          this.face = Math.atan2(LEAD_TABLE.x - this.pos.x, LEAD_TABLE.z - this.pos.y);
        }, 0.3);
        this.setLabel('עובר לשולחן ראש-המטה');
        break;
    }
  }

  setLabel(l) { this.label = l; }

  pickNext() {
    // אחרי עבודה בשולחן — בחירת הפסקה; ראש-המטה בלופ שלו
    if (this.def.lead) {
      const opts = ['board', 'podium', 'leadtable', 'flame', 'board'];
      return opts[Math.floor(Math.random() * opts.length)];
    }
    const opts = ['coffee', 'library', 'gitwall', 'chat', 'desk', 'desk'];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ───── אנימציה ─────
  applyImmediate() {
    const r = this.body.root;
    r.position.set(this.pos.x, 0, this.pos.y);
    r.rotation.y = this.face;
  }

  update(dt, t, ctx) {
    const b = this.body;
    const j = b.j;

    // FSM
    if (!this.moving) {
      this.stateUntil -= dt;
      if (this.stateUntil <= 0) {
        switch (this.state) {
          case 'sit-down':
            this.state = 'desk'; this.sitK = 1; this.stateUntil = 18 + Math.random() * 26;
            this.typing = 1;
            this.setLabel('עובד על המשימה');
            if (Math.random() < 0.4) this.say(this.ambientLine('desk'));
            break;
          case 'desk':
            this.typing = 0;
            if (Math.random() < 0.62) this.dispatch(this.pickNext());
            else this.stateUntil = 6 + Math.random() * 8;
            break;
          case 'coffee':
            if (Math.random() < 0.5) this.say(this.ambientLine('coffee'));
            this.dispatch('desk');
            break;
          case 'library':
            this.carryBook = true;
            this.dispatch('desk');
            break;
          case 'gitwall':
          case 'flame':
          case 'leadtable':
            this.dispatch(this.def.lead ? this.pickNext() : 'desk');
            break;
          case 'board':
            this.dispatch(this.pickNext());
            break;
          case 'podium':
            this.dispatch('board');
            break;
          case 'chat':
            this.dispatch('desk');
            break;
        }
      }
      // שיחה מוזמנת
      if (ctx.invite && ctx.invite.for === this.id && !this.moving && (this.state === 'desk' || this.state === 'coffee' || this.state === 'gitwall')) {
        const inv = ctx.invite;
        this.typing = 0;
        this.walkTo(inv.spot.x, inv.spot.z, inv.faceTo, () => {
          this.state = 'chat'; this.stateUntil = inv.dur;
          this.chatWith = inv.withId;
          inv.ready(this.id);
        }, 0.42);
        this.setLabel('הולך לשיחה');
      }
    }

    // תנועה
    if (this.moving) this.stepMove(dt);

    // ישיבה/קימה (בלנד)
    const sitGoal = (this.state === 'desk' || this.state === 'sit-down') && !this.moving ? (this.state === 'sit-down' ? 1 - this.stateUntil / 0.95 : 1) : 0;
    this.sitK += (sitGoal - this.sitK) * (1 - Math.exp(-7 * dt));

    // ───── יעדי-פוזה ─────
    const P = {
      hipsY: 0.96, hipsRX: 0, hipsRZ: 0,
      spineRX: 0, spineRY: 0,
      neckRX: 0, headRX: 0, headRY: 0,
      armRX: [-0.06, 0], armRZ: [-0.1, 0.1], foreRX: [-0.18, -0.18],
      thighRX: [0, 0], shinRX: [0, 0], footRX: [0, 0],
    };
    void j;

    const breath = Math.sin(t * 1.7 + this.walkPhase * 0.1) * 0.5 + 0.5;

    if (this.moving) {
      // הליכה: צעדים
      const ph = this.walkPhase;
      const swing = 0.52;
      P.thighRX = [Math.sin(ph) * swing, Math.sin(ph + Math.PI) * swing];
      P.shinRX = [Math.max(0, Math.sin(ph - 0.9)) * 0.85, Math.max(0, Math.sin(ph + Math.PI - 0.9)) * 0.85];
      P.footRX = [-P.thighRX[0] * 0.35, -P.thighRX[1] * 0.35];
      P.armRX = [Math.sin(ph + Math.PI) * 0.42 - 0.05, Math.sin(ph) * 0.42 - 0.05];
      P.foreRX = [-0.35, -0.35];
      P.hipsY = 0.96 + Math.abs(Math.cos(ph)) * 0.028;
      P.hipsRZ = Math.sin(ph) * 0.03;
      P.spineRX = 0.07;
      P.spineRY = -Math.sin(ph) * 0.06;
      P.headRY = Math.sin(ph * 0.5) * 0.04;
      // ספר ביד
      if (this.carryBook) { P.armRX[0] = -0.9; P.foreRX[0] = -0.7; }
    } else if (this.sitK > 0.5) {
      // ישיבה
      const s = this.sitK;
      P.hipsY = 0.96 - (0.96 - 0.56) * s;
      P.thighRX = [-1.52 * s, -1.52 * s];
      P.shinRX = [1.5 * s, 1.5 * s];
      P.footRX = [0.12 * s, 0.12 * s];
      P.spineRX = 0.05;
      if (this.typing > 0 && this.state === 'desk') {
        // הקלדה
        const tt = t * 10.5 + this.walkPhase;
        P.armRX = [-0.62, -0.62];
        P.foreRX = [-0.52 + Math.sin(tt) * 0.06, -0.52 + Math.sin(tt + Math.PI) * 0.06];
        P.armRZ = [-0.12, 0.12];
        P.headRX = 0.24 + Math.sin(t * 0.6) * 0.03;
        P.headRY = Math.sin(t * 0.35 + 2) * 0.06;
        P.spineRX = 0.1;
      } else {
        // ישיבה רגועה
        P.armRX = [-0.2, -0.2];
        P.foreRX = [-0.4, -0.4];
        P.headRX = 0.02 + breath * 0.015;
        P.headRY = Math.sin(t * 0.4 + 1) * 0.12;
      }
    } else {
      // עמידה לפי מצב
      switch (this.state) {
        case 'board': {
          // כתיבה על הלוח
          P.armRX = [-1.5, -0.6];
          P.foreRX = [-0.35, -1.15];
          const scrib = t * 6.2;
          P.armRZ = [-0.16, 0.12];
          P.headRX = 0.06;
          P.headRY = Math.sin(scrib * 0.4) * 0.14;
          P.spineRX = 0.04;
          P.armRX[0] += Math.sin(scrib) * 0.08;
          break;
        }
        case 'podium': {
          // נאום — מחוות שתי-ידיים
          const w = Math.sin(t * 2.1) * 0.5 + 0.5;
          P.armRX = [-0.7 - w * 0.3, -0.7 - (1 - w) * 0.3];
          P.foreRX = [-0.75 - w * 0.25, -0.75 - (1 - w) * 0.25];
          P.armRZ = [-0.2, 0.2];
          P.headRX = -0.03 + Math.sin(t * 1.3) * 0.05;
          P.headRY = Math.sin(t * 0.55) * 0.2;
          break;
        }
        case 'coffee': {
          // לגימה
          const sip = (Math.sin(t * 1.4) * 0.5 + 0.5) > 0.62;
          if (sip) {
            P.armRX[0] = -1.62; P.foreRX[0] = -2.05; P.headRX = -0.1;
          } else {
            P.armRX[0] = -0.3; P.foreRX[0] = -0.5;
          }
          P.armRX[1] = -0.12; P.foreRX[1] = -0.25;
          P.headRY = Math.sin(t * 0.5) * 0.1;
          break;
        }
        case 'library': {
          // שליפת/דפדוף ספר
          const reach = Math.sin(t * 0.9) * 0.5 + 0.5;
          P.armRX[1] = -1.15 - reach * 0.55;
          P.foreRX[1] = -0.4 - reach * 0.3;
          P.armRX[0] = -0.7; P.foreRX[0] = -0.9; // מחזיק ספר
          P.headRX = 0.12 + reach * 0.1;
          P.headRY = 0.18 + Math.sin(t * 0.6) * 0.08;
          break;
        }
        case 'gitwall': {
          // מסתכל במסך הענק, ידיים משולבות מאחור
          P.armRX = [0.12, 0.12];
          P.foreRX = [-0.85, -0.85];
          P.armRZ = [-0.22, 0.22];
          P.headRX = 0.1;
          P.headRY = Math.sin(t * 0.33) * 0.14;
          P.spineRX = -0.02;
          break;
        }
        case 'flame': {
          P.headRX = 0.04 + breath * 0.02;
          P.headRY = Math.sin(t * 0.4) * 0.1;
          P.armRX = [-0.1, -0.1];
          break;
        }
        case 'leadtable': {
          // סוקר ניירות
          P.spineRX = 0.22;
          P.headRX = 0.3;
          P.armRX = [-0.5, -0.5];
          P.foreRX = [-0.55, -0.55];
          P.headRY = Math.sin(t * 0.7) * 0.12;
          break;
        }
        case 'chat': {
          // פונה לשותף, מחוות
          const w = Math.sin(t * 1.8) * 0.5 + 0.5;
          P.armRX = [-0.35 - w * 0.35, -0.25];
          P.foreRX = [-0.9 - w * 0.3, -0.4];
          P.headRY = Math.sin(t * 0.9) * 0.1;
          P.headRX = 0.03;
          break;
        }
        default: {
          // עמידה כללית + מיקרו-תזוזות
          const shift = Math.sin(t * 0.33 + this.walkPhase);
          P.hipsRZ = shift * 0.022;
          P.hipsY += breath * 0.008;
          P.headRY = Math.sin(t * 0.37 + 3) * 0.16;
          P.headRX = breath * 0.02;
          P.armRX = [-0.08, -0.08];
        }
      }
    }

    // מחווה זמנית (עדיפה)
    if (this.gesture && this.gesture.until > 0 && !this.moving) {
      this.gesture.until -= dt;
      const g = this.gesture;
      if (g.kind === 'nod') P.headRX += Math.sin(t * 5) * 0.12;
      else if (g.kind === 'shake') P.headRY += Math.sin(t * 6) * 0.22;
      else if (g.kind === 'wave') {
        P.armRX[1] = -2.3; P.foreRX[1] = -0.5; P.armRZ[1] = 0.45 + Math.sin(t * 7) * 0.18;
      } else if (g.kind === 'explain') {
        const w = Math.sin(t * 3.2);
        P.armRX = [-0.9, -0.9]; P.foreRX = [-1.1 - w * 0.15, -1.1 + w * 0.15]; P.armRZ = [-0.3, 0.3];
      } else if (g.kind === 'point' && g.target) {
        const dx = g.target.x - this.pos.x, dz = g.target.z - this.pos.y;
        const want = Math.atan2(dx, dz);
        P.headRY += lerpAngle(0, want - this.face, 1) * 0.3;
        P.armRX[1] = -1.2; P.foreRX[1] = -0.2;
      }
      if (this.gesture.until <= 0) this.gesture = null;
    }

    // אקראי: מחווה מיקרו בזמן עבודה
    if (!this.moving && Math.random() < dt * 0.035 && !this.gesture) {
      this.gesture = { kind: Math.random() < 0.5 ? 'nod' : 'explain', until: 1.4 + Math.random() };
    }

    // הבהוב
    this.blinkAt -= dt;
    let blink = 1;
    if (this.blinkAt < 0.12) blink = Math.max(0.05, Math.abs(this.blinkAt - 0.06) / 0.06);
    if (this.blinkAt <= 0) this.blinkAt = 2 + Math.random() * 4.5;

    // ───── מיזוג לפיבוטים ─────
    const k = 1 - Math.exp(-11 * dt);
    j.hips.position.y += (P.hipsY - j.hips.position.y) * k;
    j.hips.rotation.x += (P.hipsRX - j.hips.rotation.x) * k;
    j.hips.rotation.z += (P.hipsRZ - j.hips.rotation.z) * k;
    j.spine.rotation.x += (P.spineRX - j.spine.rotation.x) * k;
    j.spine.rotation.y += (P.spineRY - j.spine.rotation.y) * k;
    j.head.rotation.x += (P.headRX - j.head.rotation.x) * k;
    j.head.rotation.y += (P.headRY - j.head.rotation.y) * k;
    j['arm-1'].rotation.x += (P.armRX[0] - j['arm-1'].rotation.x) * k;
    j['arm1'].rotation.x += (P.armRX[1] - j['arm1'].rotation.x) * k;
    j['arm-1'].rotation.z += (P.armRZ[0] - j['arm-1'].rotation.z) * k;
    j['arm1'].rotation.z += (P.armRZ[1] - j['arm1'].rotation.z) * k;
    j['fore-1'].rotation.x += (P.foreRX[0] - j['fore-1'].rotation.x) * k;
    j['fore1'].rotation.x += (P.foreRX[1] - j['fore1'].rotation.x) * k;
    j['thigh-1'].rotation.x += (P.thighRX[0] - j['thigh-1'].rotation.x) * k;
    j['thigh1'].rotation.x += (P.thighRX[1] - j['thigh1'].rotation.x) * k;
    j['shin-1'].rotation.x += (P.shinRX[0] - j['shin-1'].rotation.x) * k;
    j['shin1'].rotation.x += (P.shinRX[1] - j['shin1'].rotation.x) * k;
    j['foot-1'].rotation.x += (P.footRX[0] - j['foot-1'].rotation.x) * k;
    j['foot1'].rotation.x += (P.footRX[1] - j['foot1'].rotation.x) * k;

    for (const e of b.eyes) e.scale.y = blink;

    // צנצונת-פליטה לצג בזמן הקלדה — הראש "מביט" בצג
    if (this.state === 'desk' && this.typing > 0) {
      this.lookTarget = this.monitorPos || null;
    }
    void ctx;

    // שורש
    b.root.position.set(this.pos.x, 0, this.pos.y);
    b.root.rotation.y = this.face;
  }

  ambientLine(context) {
    const pools = {
      desk: [
        'קורא את הספרים עכשיו — הכול מדידה אמיתית.',
        'מצליב בין הספרים — אין המצאות.',
        'שורה שנכשלה מסומנת ככישלון — כך זה הוגן.',
        'סיימתי מדידה, עובר לבא בתור.',
      ],
      coffee: [
        'לגימה מהירה — וחוזרים לעבודה.',
        'הקפה של הריבונות תמיד חמה.',
        'דקה של אוויר, אחר-כך חוזרים למדידות.',
      ],
      board: ['מעדכן את לוח-המשימות — התוכנית האמיתית.'],
      podium: ['החלטה לפי המדיניות — מפורסם כאן בשקיפות.'],
      library: ['שולף דוח מהספרייה — נכתב כאן על-ידי הצוות.'],
      gitwall: ['הקומיטים האמיתיים על הקיר — טריים.'],
      chat: ['מסתדרים בינינו — בלי לדרוס אחד את השני.'],
    };
    const arr = pools[context] || pools.desk;
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

// ─────────────────────────────────────────────
// הצוות כולו + מפגשים
// ─────────────────────────────────────────────
export class Crew {
  constructor(scene, { onBubble, onRoster }) {
    this.agents = [];
    this.onBubble = onBubble;
    this.onRoster = onRoster;
    this.meetAt = 26 + Math.random() * 20;
    this.invites = [];

    const look = {
      aluf: { height: 1.78, blazer: true, hairColor: '#3a3228', skin: SKINS[0], pants: PANTS[0] },
      gal: { height: 1.74, hairColor: '#241f1a', skin: SKINS[1], pants: PANTS[1] },
      erez: { height: 1.7, glasses: true, hairColor: '#4a4034', skin: SKINS[2], pants: PANTS[0] },
      tamar: { height: 1.64, hairBack: true, bun: true, hairColor: '#54382a', skin: SKINS[3], pants: PANTS[2] },
      shachar: { height: 1.72, beard: true, hairColor: '#2a2622', skin: SKINS[4], pants: PANTS[3] },
      yarden: { height: 1.69, hairColor: '#37312b', skin: SKINS[0], pants: PANTS[1] },
    };
    for (const def of CREW) {
      const a = new Agent({ ...def, ...(look[def.id] || {}) }, { onBubble });
      scene.add(a.body.root);
      this.agents.push(a);
    }
  }

  headPos(id, out) {
    const a = this.agents.find((x) => x.id === id);
    return a ? a.headPos(out) : null;
  }

  setLive(activities, mode) {
    for (const a of this.agents) a.setLive(activities?.[a.id] || '', mode);
  }

  focusTarget(id) {
    const a = this.agents.find((x) => x.id === id);
    if (!a) return null;
    return { pos: a.pos, head: a.headPos(new THREE.Vector3()), agent: a };
  }

  update(dt, t) {
    // מפגש-צוות מתוזמן: שני עובדים נפגשים באמצע
    this.meetAt -= dt;
    if (this.meetAt <= 0 && this.invites.length === 0) {
      this.meetAt = 75 + Math.random() * 70;
      const free = this.agents.filter((a) => !a.def.lead && !a.moving && ['desk', 'coffee', 'gitwall'].includes(a.state));
      if (free.length >= 2) {
        const i = Math.floor(Math.random() * free.length);
        let k = Math.floor(Math.random() * free.length);
        if (k === i) k = (k + 1) % free.length;
        const [A, B] = [free[i], free[k]];
        const spots = CHAT_SPOTS[Math.floor(Math.random() * CHAT_SPOTS.length)];
        const dur = 7 + Math.random() * 5;
        const faceAB = Math.atan2(B.pos.x - A.pos.x, B.pos.y - A.pos.y);
        const faceBA = faceAB + Math.PI;
        let readyCount = 0;
        const ready = () => {
          readyCount++;
          if (readyCount === 2) {
            A.say(A.ambientLine('chat'));
            setTimeout(() => { B.gesture = { kind: 'explain', until: 2.2 }; }, 1200);
            setTimeout(() => { A.gesture = { kind: 'nod', until: 1.6 }; }, 3400);
            setTimeout(() => { B.say('מסתדרים — ממשיכים.'); }, 4600);
          }
        };
        this.invites.push(
          { for: A.id, spot: { x: spots[0][0], z: spots[0][1] }, faceTo: faceAB, withId: B.id, dur, ready },
          { for: B.id, spot: { x: spots[1][0], z: spots[1][1] }, faceTo: faceBA, withId: A.id, dur, ready },
        );
      }
    }

    for (const a of this.agents) a.update(dt, t, { invites: this.invites });
    // הזמנות שנצרכו (הסוכן התחיל ללכת) מוסרות כאן
    this.invites = this.invites.filter((inv) => {
      const a = this.agents.find((x) => x.id === inv.for);
      return a && !a.moving && a.state !== 'chat';
    });

    // דו"ח רוסטר
    if (this.onRoster) {
      this.rosterT = (this.rosterT || 0) + dt;
      if (this.rosterT > 0.5) {
        this.rosterT = 0;
        this.onRoster(this.agents.map((a) => ({
          id: a.id, label: a.label || '', moving: a.moving,
          state: a.state, live: a.liveActivity, mode: a.mode,
        })));
      }
    }
  }
}
