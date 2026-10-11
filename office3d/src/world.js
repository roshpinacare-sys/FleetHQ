/**
 * world.js — האדריכלות של מפקדת הצי: אולם 20×12.5מ', קירות-זכות דרומיים,
 * חלונות מזרחיים, לוח-משימות וקיר-גיט חיים, קשת-שולחנות סביב להבת-הריבונות,
 * דוכן-החלטות, ספרייה, בר-קפה, קבלה, צמחייה. יום-אור חם — החדר בהיר תמיד.
 */

import * as THREE from 'three';
import {
  ROOM_W, ROOM_D, WALL_H, WALL_T,
  FLAME, PODIUM, TASK_WALL, GIT_WALL, LEAD_TABLE, LIBRARY, COFFEE, RECEPTION, DESKS,
} from './canon.js';
import {
  makeFloorTexture, makePlasterTexture, makeRugTexture, makeSkyTexture,
  makeTaskWallScreen, makeGitWallScreen, makeDeskScreen,
} from './textures.js';

const M = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.04, ...opts });

export function buildWorld(scene) {
  const api = { screens: {}, flameLight: null, flameMesh: null, update: () => {} };

  // ───── שמיים ─────
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 24, 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture('#8fbcd8', '#ece4cf'),
      side: THREE.BackSide, fog: false,
    }),
  );
  scene.add(sky);

  // ───── רצפה ─────
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_W + WALL_T * 2, 0.12, ROOM_D + WALL_T * 2),
    M({ map: makeFloorTexture(), roughness: 0.62 }),
  );
  floor.position.y = -0.06;
  floor.receiveShadow = true;
  scene.add(floor);

  // שטיח מרכזי תחת הקשת
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 0.02, 5.2),
    M({ map: makeRugTexture(), roughness: 0.95 }),
  );
  rug.position.set(0, 0.011, 0.4);
  rug.receiveShadow = true;
  scene.add(rug);

  // ───── קירות ─────
  const plaster = M({ map: makePlasterTexture(), roughness: 0.92 });
  const wallMat = plaster;

  // צפון (מלא)
  addWall(scene, wallMat, 0, -ROOM_D / 2 - WALL_T / 2, ROOM_W + WALL_T * 2, WALL_T);
  // מערב (מלא)
  addWall(scene, wallMat, -ROOM_W / 2 - WALL_T / 2, 0, WALL_T, ROOM_D);
  // מזרח — קיר עם חלונות (3 פסי-קיר בין-חלונות + סף עליון)
  const eastX = ROOM_W / 2 + WALL_T / 2;
  for (const seg of eastSegments()) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, seg.h, seg.d), wallMat);
    m.position.set(eastX, seg.y, seg.z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  // דרום — קיר-זכות: עמודי-פלדה דקים + זכות
  buildSouthGlass(scene);

  // ───── תקרה + קורות ─────
  const ceil = new THREE.Mesh(
    new THREE.BoxGeometry(ROOM_W + WALL_T * 2, 0.14, ROOM_D + WALL_T * 2),
    M({ color: '#f4efe6', roughness: 0.95 }),
  );
  ceil.position.y = WALL_H + 0.07;
  scene.add(ceil);
  const beamMat = M({ color: '#9a7b57', roughness: 0.7 });
  for (let i = 0; i <= 5; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W, 0.22, 0.16), beamMat);
    beam.position.set(0, WALL_H - 0.11, -ROOM_D / 2 + 1.2 + i * ((ROOM_D - 2.4) / 5));
    beam.castShadow = true;
    scene.add(beam);
  }
  // גופי-תאורה צמודי-תקרה — לא חוסמים אף קו-ראייה
  const lampMat = M({ color: '#f8f4ea', emissive: '#fff6dd', emissiveIntensity: 0.4, roughness: 0.4 });
  for (const [lx, lz] of [[-6, -2], [0, -2], [6, -2], [-6, 2.6], [0, 2.6], [6, 2.6]]) {
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.13, 16, 1, true), lampMat);
    shade.position.set(lx, WALL_H - 0.16, lz);
    scene.add(shade);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), M({ color: '#3a3a3a' }));
    base.position.set(lx, WALL_H - 0.07, lz);
    scene.add(base);
  }

  // ───── לוח-המשימות (צפון מרכז) ─────
  const taskScreen = makeTaskWallScreen();
  api.screens.task = taskScreen;
  const taskFrame = new THREE.Mesh(
    new THREE.BoxGeometry(TASK_WALL.w + 0.14, TASK_WALL.h + 0.14, 0.08),
    M({ color: '#7d6242', roughness: 0.6 }),
  );
  taskFrame.position.set(TASK_WALL.x, TASK_WALL.cy, -ROOM_D / 2 + 0.05);
  scene.add(taskFrame);
  const taskFace = new THREE.Mesh(
    new THREE.PlaneGeometry(TASK_WALL.w, TASK_WALL.h),
    new THREE.MeshStandardMaterial({ map: taskScreen.texture, roughness: 0.35, emissive: '#ffffff', emissiveMap: taskScreen.texture, emissiveIntensity: 0.22 }),
  );
  taskFace.position.set(TASK_WALL.x, TASK_WALL.cy, -ROOM_D / 2 + 0.105);
  scene.add(taskFace);

  // ───── קיר-הגיט (צפון-מערב) ─────
  const gitScreen = makeGitWallScreen();
  api.screens.git = gitScreen;
  const gitFrame = new THREE.Mesh(
    new THREE.BoxGeometry(GIT_WALL.w + 0.12, GIT_WALL.h + 0.12, 0.07),
    M({ color: '#20262b', roughness: 0.4, metalness: 0.5 }),
  );
  gitFrame.position.set(GIT_WALL.x, GIT_WALL.cy, -ROOM_D / 2 + 0.045);
  scene.add(gitFrame);
  const gitFace = new THREE.Mesh(
    new THREE.PlaneGeometry(GIT_WALL.w, GIT_WALL.h),
    new THREE.MeshStandardMaterial({ map: gitScreen.texture, roughness: 0.3, emissive: '#ffffff', emissiveMap: gitScreen.texture, emissiveIntensity: 0.5 }),
  );
  gitFace.position.set(GIT_WALL.x, GIT_WALL.cy, -ROOM_D / 2 + 0.09);
  scene.add(gitFace);

  // ───── להבת הריבונות ─────
  buildFlame(scene, api);

  // ───── קשת שולחנות + כיסאות + צגים ─────
  const deskScreens = {};
  const deskGroups = {};
  for (const [id, d] of Object.entries(DESKS)) {
    deskGroups[id] = buildDesk(scene, d, id);
    const scr = makeDeskScreen(crewColor(id));
    deskScreens[id] = scr;
    api.screens[`desk_${id}`] = scr;
  }
  api.screens.desks = deskScreens;
  api.deskGroups = deskGroups;

  // ───── שולחן ראש-המטה (עגול, מזרח) ─────
  buildLeadTable(scene);

  // ───── דוכן-ההחלטות (מערב) ─────
  buildPodium(scene);

  // ───── ספרייה ─────
  buildLibrary(scene);

  // ───── בר-קפה ─────
  buildCoffee(scene);

  // ───── קבלה ─────
  buildReception(scene);

  // ───── צמחייה ─────
  const plantSpots = [[-9, 5.4], [-9.2, -4.8], [9.3, -4.9], [3.2, 5.6], [-3.4, 5.6], [9.4, 1.2]];
  for (const [px, pz] of plantSpots) buildPlant(scene, px, pz);

  // ───── שעון-קיר ─────
  api.clock = buildClock(scene);

  // ───── עדכון-עולם שוטף ─────
  api.update = (t) => {
    // להבה
    if (api.flameMesh) {
      const s = 1 + Math.sin(t * 9.3) * 0.07 + Math.sin(t * 17.7) * 0.04;
      api.flameMesh.scale.set(s, 1 + Math.sin(t * 11.1) * 0.12, s);
      api.flameMesh.rotation.y = t * 0.8;
      api.flameInner.position.y = 0.84 + Math.sin(t * 13.7) * 0.02;
      if (api.flameGlow) {
        const g = 1.45 + Math.sin(t * 8.1) * 0.12;
        api.flameGlow.scale.set(g, g, 1);
      }
      api.flameLight.intensity = 12 + Math.sin(t * 9.3) * 2.2 + Math.sin(t * 23.1) * 1.1;
    }
    // שעון
    if (api.clock) {
      const now = new Date();
      const h = (now.getHours() % 12) / 12 * Math.PI * 2 + now.getMinutes() / 60 * 0.5236;
      const m = now.getMinutes() / 60 * Math.PI * 2;
      api.clock.pivotH.rotation.x = -h;
      api.clock.pivotM.rotation.x = -m;
    }
  };

  return api;
}

function addWall(scene, mat, x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), mat);
  m.position.set(x, WALL_H / 2, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
}

/** מקטעי קיר-מזרח: סף עליון + עמודי בין-חלונות (3 חלונות גדולים) */
function eastSegments() {
  const segs = [];
  const D = ROOM_D;
  // סף עליון: מ-2.4מ' עד התקרה
  segs.push({ y: (2.4 + WALL_H) / 2, h: WALL_H - 2.4, z: 0, d: D });
  // סף תחתון (0→0.5)
  segs.push({ y: 0.25, h: 0.5, z: 0, d: D });
  // עמודים בין-חלונות
  for (const z of [-D / 3, 0, D / 3]) {
    segs.push({ y: (0.5 + 2.4) / 2, h: 1.9, z, d: 0.3 });
  }
  return segs;
}

function buildSouthGlass(scene) {
  const z = ROOM_D / 2 + WALL_T / 2;
  // עמודים אנכיים כל 2.5מ'
  const frameMat = M({ color: '#4a4f54', roughness: 0.5, metalness: 0.6 });
  for (let x = -ROOM_W / 2; x <= ROOM_W / 2 + 0.01; x += 2.5) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, WALL_H, WALL_T), frameMat);
    p.position.set(x, WALL_H / 2, z);
    p.castShadow = true;
    scene.add(p);
  }
  // קורה עליונה + סף תחתון
  const top = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W + WALL_T * 2, 0.6, WALL_T), frameMat);
  top.position.set(0, WALL_H - 0.3, z);
  scene.add(top);
  const bot = new THREE.Mesh(new THREE.BoxGeometry(ROOM_W + WALL_T * 2, 0.16, WALL_T), frameMat);
  bot.position.set(0, 0.08, z);
  scene.add(bot);
  // זכות
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W - 0.2, WALL_H - 0.95),
    new THREE.MeshPhysicalMaterial({
      color: '#dfeef2', transparent: true, opacity: 0.16,
      roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  glass.position.set(0, (WALL_H - 0.95) / 2 + 0.16, ROOM_D / 2 + WALL_T / 2);
  scene.add(glass);
  // דלתות זכות כפולות (קו-חלוקה במרכז)
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.05, WALL_H - 1.0, 0.03), frameMat);
  seam.position.set(0, (WALL_H - 1.0) / 2 + 0.18, ROOM_D / 2 + 0.02);
  scene.add(seam);
}

function buildFlame(scene, api) {
  // בסיס אבן
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.68, 0.5, 28),
    M({ color: '#6f6a60', roughness: 0.9 }),
  );
  base.position.set(FLAME[0], 0.25, FLAME[1]);
  base.castShadow = base.receiveShadow = true;
  scene.add(base);
  // גליל-זכות
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, 1.15, 24, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: '#fff3dd', transparent: true, opacity: 0.14,
      roughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  glass.position.set(FLAME[0], 1.07, FLAME[1]);
  scene.add(glass);
  // להבה (קונוס-פסגה מתנועע)
  const flameMat = new THREE.MeshStandardMaterial({
    color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 2.2, roughness: 0.4,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 14), flameMat);
  flame.position.set(FLAME[0], 0.9, FLAME[1]);
  scene.add(flame);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 10), new THREE.MeshStandardMaterial({
    color: '#ffd98a', emissive: '#ffc451', emissiveIntensity: 3.0, roughness: 0.3,
  }));
  inner.position.set(FLAME[0], 0.84, FLAME[1]);
  scene.add(inner);
  // הילת-זוהר רכה (ספרייט)
  const glowC = document.createElement('canvas');
  glowC.width = glowC.height = 128;
  const gg = glowC.getContext('2d');
  const gGrad = gg.createRadialGradient(64, 64, 4, 64, 64, 62);
  gGrad.addColorStop(0, 'rgba(255,170,70,0.85)');
  gGrad.addColorStop(0.45, 'rgba(255,140,40,0.28)');
  gGrad.addColorStop(1, 'rgba(255,120,20,0)');
  gg.fillStyle = gGrad; gg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(glowC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(1.5, 1.5, 1);
  glow.position.set(FLAME[0], 1.0, FLAME[1]);
  scene.add(glow);
  api.flameGlow = glow;
  const light = new THREE.PointLight('#ff9a40', 14, 7, 1.6);
  light.position.set(FLAME[0], 1.15, FLAME[1]);
  light.castShadow = false;
  scene.add(light);
  api.flameLight = light;
  api.flameMesh = flame;
  api.flameInner = inner;
  // כתובת על הבסיס
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.06, 24),
    M({ color: '#c8a04e', roughness: 0.3, metalness: 0.7 }),
  );
  plate.position.set(FLAME[0], 0.53, FLAME[1]);
  scene.add(plate);
}

function buildDesk(scene, d, id) {
  const wood = M({ color: '#a9825c', roughness: 0.55 });
  const legMat = M({ color: '#3c3f43', roughness: 0.4, metalness: 0.7 });
  const g = new THREE.Group();
  // שולחן 1.4×0.7
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), wood);
  top.position.y = 0.74;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  for (const [lx, lz] of [[-0.64, -0.28], [0.64, -0.28], [-0.64, 0.28], [0.64, 0.28]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), legMat);
    leg.position.set(lx, 0.36, lz);
    leg.castShadow = true;
    g.add(leg);
  }
  // צג: קופסה + פאת-מסך חיה (הטקסטורה נקשרת ב-main לפי מזהה הסוכן)
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.04), M({ color: '#191d21', roughness: 0.35 }));
  monitor.position.set(0, 1.06, -0.18);
  monitor.rotation.x = -0.06;
  g.add(monitor);
  const faceMat = new THREE.MeshStandardMaterial({
    color: '#0c1013', roughness: 0.28,
    emissive: '#ffffff', emissiveIntensity: 0.55, emissiveMap: null,
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.34), faceMat);
  face.position.set(0, 1.065, -0.157);
  face.rotation.x = -0.06;
  g.add(face);
  // מקלדת + עכבר
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.15), M({ color: '#22262a' }));
  kb.position.set(0, 0.77, 0.14);
  g.add(kb);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), M({ color: '#22262a' }));
  mouse.scale.set(1, 0.6, 1.4);
  mouse.position.set(0.32, 0.775, 0.16);
  g.add(mouse);
  // ספר/מחברת
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.32), M({ color: ['#7d4636', '#3c5a4e', '#5a4a72', '#705a36', '#365a6e'][Math.floor(Math.random() * 5)] }));
  book.position.set(-0.5, 0.79, 0.05);
  book.rotation.y = 0.4;
  g.add(book);
  // כיסא משרדי
  const chair = buildOfficeChair();
  chair.position.set(d.seat[0] - d.x, 0, d.seat[1] - d.z);
  chair.rotation.y = d.face;
  g.add(chair);
  // מיקום + פנייה (face: 0 = פנים לדרום +z; הצג מצפון ליושב)
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.face + Math.PI; // השולחן מסודר כך שהצג נמצא ממול ליושב
  scene.add(g);
  g.userData.deskFaceMat = faceMat; // main יחבר כאן את הטקסטורה החיה
  return g;
}

function buildOfficeChair() {
  const g = new THREE.Group();
  const mat = M({ color: '#37414b', roughness: 0.7 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.5), mat);
  seat.position.y = 0.47;
  seat.castShadow = true;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), mat);
  back.position.set(0, 0.78, -0.24);
  back.rotation.x = 0.1;
  back.castShadow = true;
  g.add(back);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28), M({ color: '#55595e', metalness: 0.7, roughness: 0.3 }));
  pole.position.y = 0.3;
  g.add(pole);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), M({ color: '#55595e', metalness: 0.7, roughness: 0.3 }));
    leg.position.set(Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14);
    leg.rotation.y = a;
    g.add(leg);
  }
  return g;
}

function buildLeadTable(scene) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(LEAD_TABLE.r, LEAD_TABLE.r, 0.05, 32), M({ color: '#8a6a48', roughness: 0.5 }));
  top.position.y = 0.75;
  top.castShadow = top.receiveShadow = true;
  g.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.22, 0.73, 16), M({ color: '#3c3f43', metalness: 0.6, roughness: 0.4 }));
  leg.position.y = 0.375;
  g.add(leg);
  // ניירות + כוסות
  for (let i = 0; i < 3; i++) {
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.006, 0.4), M({ color: '#f4efe2' }));
    paper.position.set((Math.random() - 0.5) * 1.0, 0.78 + i * 0.006, (Math.random() - 0.5) * 0.7);
    paper.rotation.y = Math.random() * Math.PI;
    g.add(paper);
  }
  for (const [cx, cz] of [[0.5, 0.2], [-0.45, -0.1]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.1, 12), M({ color: '#e8e2d4' }));
    cup.position.set(cx, 0.83, cz);
    g.add(cup);
  }
  g.position.set(LEAD_TABLE.x, 0, LEAD_TABLE.z);
  scene.add(g);
  // שני כיסאות עגולים
  for (const [sx, sz, rot] of [[0.8, 1.35, Math.PI * 0.78], [-0.85, -1.3, Math.PI * -0.22]]) {
    const ch = buildOfficeChair();
    ch.position.set(LEAD_TABLE.x + sx, 0, LEAD_TABLE.z + sz);
    ch.rotation.y = rot;
    scene.add(ch);
  }
}

function buildPodium(scene) {
  const g = new THREE.Group();
  const dark = M({ color: '#4c3626', roughness: 0.55 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.12, 0.5), dark);
  body.position.y = 0.56;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.6), M({ color: '#5e422e', roughness: 0.45 }));
  top.position.y = 1.15;
  top.rotation.x = 0.12;
  top.castShadow = true;
  g.add(top);
  // סמל-לוח
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20), M({ color: '#c8a04e', metalness: 0.8, roughness: 0.25 }));
  emblem.rotation.x = Math.PI / 2 - 0.12;
  emblem.position.set(0, 0.86, 0.26);
  g.add(emblem);
  g.position.set(PODIUM.x, 0, PODIUM.z);
  g.rotation.y = PODIUM.face;
  scene.add(g);
}

function buildLibrary(scene) {
  // מדף צפון-מזרחי: 4 מדפים עם ספרים אינסטנסים
  const [sx, sz] = LIBRARY.shelf;
  const wood = M({ color: '#7c5f40', roughness: 0.65 });
  const shelfW = 3.4, shelfD = 0.32;
  const g = new THREE.Group();
  // שלד
  for (const lx of [-shelfW / 2, shelfW / 2]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, shelfD), wood);
    side.position.set(lx, 1.1, 0);
    side.castShadow = true;
    g.add(side);
  }
  const colors = ['#7d4636', '#3c5a4e', '#5a4a72', '#705a36', '#365a6e', '#6e3c5a', '#4a6e3c'];
  const bookGeo = new THREE.BoxGeometry(0.055, 0.3, 0.22);
  const shelves = [0.35, 0.9, 1.45, 2.0];
  for (const h of shelves) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(shelfW, 0.05, shelfD), wood);
    board.position.set(0, h, 0);
    board.castShadow = board.receiveShadow = true;
    g.add(board);
    // ספרים באינסטנס
    const n = Math.floor(shelfW / 0.085);
    const inst = new THREE.InstancedMesh(bookGeo, M({ color: '#ffffff' }), n);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      dummy.position.set(-shelfW / 2 + 0.06 + i * 0.085, h + 0.18, 0.02 + (Math.random() - 0.5) * 0.05);
      dummy.rotation.y = (Math.random() - 0.5) * 0.14;
      dummy.rotation.z = Math.random() < 0.06 ? -0.35 : 0;
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      col.setHex(colors[Math.floor(Math.random() * colors.length)]);
      inst.setColorAt(i, col);
    }
    inst.castShadow = true;
    g.add(inst);
  }
  g.position.set(sx, 0, sz);
  g.rotation.y = Math.PI; // מדף פונה דרומה (אל תוך החדר)
  scene.add(g);
  // שולחן-קריאה
  const [tx, tz] = LIBRARY.table;
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), M({ color: '#8a6a48', roughness: 0.55 }));
  table.position.set(tx, 0.75, tz);
  table.castShadow = table.receiveShadow = true;
  scene.add(table);
  for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.73, 0.07), M({ color: '#3c3f43' }));
    leg.position.set(tx + lx, 0.37, tz + lz);
    leg.castShadow = true;
    scene.add(leg);
  }
  // כיסא
  const ch = buildOfficeChair();
  ch.position.set(tx, 0, tz + 0.95);
  ch.rotation.y = Math.PI;
  scene.add(ch);
  // ספרים פתוחים על השולחן
  for (let i = 0; i < 2; i++) {
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.46), M({ color: i ? '#f0e8d6' : '#dcd2bc' }));
    bk.position.set(tx - 0.3 + i * 0.6, 0.8 + i * 0.005, tz + (i - 0.5) * 0.2);
    bk.rotation.y = i * 0.6;
    scene.add(bk);
  }
}

function buildCoffee(scene) {
  const [x, z] = COFFEE;
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.94, 0.68), M({ color: '#5e5248', roughness: 0.6 }));
  counter.position.y = 0.47;
  counter.castShadow = counter.receiveShadow = true;
  g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.06, 0.8), M({ color: '#cfc4ae', roughness: 0.4 }));
  top.position.y = 0.97;
  top.castShadow = true;
  g.add(top);
  // מכונת-קפה
  const machine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.36), M({ color: '#2e3238', roughness: 0.3, metalness: 0.6 }));
  machine.position.set(-0.6, 1.21, 0.05);
  machine.castShadow = true;
  g.add(machine);
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), M({ color: '#a8a8a8', metalness: 0.8, roughness: 0.3 }));
  spout.position.set(-0.6, 1.0, 0.16);
  g.add(spout);
  // כוסות
  for (let i = 0; i < 3; i++) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.09, 10), M({ color: '#e8e2d4' }));
    cup.position.set(0.1 + i * 0.16, 1.05, 0.14);
    g.add(cup);
  }
  // כיסא-בר גבוה
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14), M({ color: '#37414b' }));
  stool.position.set(0.35, 0.68, 0.75);
  stool.castShadow = true;
  g.add(stool);
  const spole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.66, 10), M({ color: '#55595e', metalness: 0.6 }));
  spole.position.set(0.35, 0.33, 0.75);
  g.add(spole);
  g.position.set(x, 0, z);
  scene.add(g);
}

function buildReception(scene) {
  const { x, z } = RECEPTION;
  const g = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.02, 0.6), M({ color: '#6b5744', roughness: 0.6 }));
  desk.position.y = 0.51;
  desk.castShadow = desk.receiveShadow = true;
  g.add(desk);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.05, 0.72), M({ color: '#8a7258', roughness: 0.45 }));
  top.position.y = 1.05;
  g.add(top);
  // לוגו-קטן
  const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 18), M({ color: '#c8a04e', metalness: 0.8, roughness: 0.3 }));
  mark.position.set(0, 1.1, 0.1);
  g.add(mark);
  g.position.set(x, 0, z);
  scene.add(g);
}

function buildPlant(scene, x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.34, 14), M({ color: '#8a5a3c', roughness: 0.8 }));
  pot.position.y = 0.17;
  pot.castShadow = true;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 12), M({ color: '#3a2e22' }));
  soil.position.y = 0.34;
  g.add(soil);
  const leafMat = M({ color: '#4d7a45', roughness: 0.8 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const tilt = 0.5 + Math.random() * 0.5;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9 + Math.random() * 0.5, 6), leafMat);
    leaf.position.set(Math.sin(a) * 0.1, 0.75, Math.cos(a) * 0.1);
    leaf.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  scene.add(g);
}

function buildClock(scene) {
  // שעון-קיר על הקיר המערבי
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), M({ color: '#f4efe6', roughness: 0.5 }));
  face.rotation.z = Math.PI / 2;
  face.position.set(-ROOM_W / 2 + 0.16, 2.5, 0);
  scene.add(face);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 10, 28), M({ color: '#3a3a3a', metalness: 0.5 }));
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-ROOM_W / 2 + 0.14, 2.5, 0);
  scene.add(ring);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.015), M({ color: '#222' }));
  const minuteHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.015), M({ color: '#222' }));
  const pivotH = new THREE.Group();
  const pivotM = new THREE.Group();
  pivotH.position.set(-ROOM_W / 2 + 0.19, 2.5, 0);
  pivotM.position.copy(pivotH.position);
  hourHand.position.y = 0.07;
  minuteHand.position.y = 0.11;
  pivotH.add(hourHand);
  pivotM.add(minuteHand);
  scene.add(pivotH, pivotM);
  return { pivotH, pivotM };
}

function crewColor(id) {
  const colors = {
    gal: '#3BA08F', erez: '#C9A227', tamar: '#7BA05B', shachar: '#C76B4A', yarden: '#6E8FA8', aluf: '#E0973F',
  };
  return colors[id] || '#888888';
}
