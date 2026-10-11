/**
 * business.js — "עולם-עסקים" (exec-15): אי-מטפורות נפרד מזרחית לאולם.
 * מבנה-מטפורה אחד לכל ספר בדיג'סט החי: גובה-בניין ∝ קומיטים בשבוע
 * (100+ מוצג כפי שהתקבל — בלי לזייף מתחת-לתקרה), אורות-חלונות לפי
 * מצב-הריצה האחרונה (ירוק הצלחה · אדום כשל · אמבר בעבודה · אפור לא-ידוע),
 * וקרן-מגדלור מעל ספר שריצתו עדיין בעבודה.
 *
 * מטפורות-ציון לפי שם-ספר מדויק (המיפוי הוא ההצגה — הנתונים כולם מהדיג'סט;
 * ספר שאינו במיפוי = בניין רגיל, ספר חסר מהדיג'סט = לא מוצג כלל):
 *   TruthRail → מאזני-משפט · sovereign-lighthouse → מגדלור ·
 *   sovereign-beacon → עמד-עדות · Console → שער-פיקוד
 *
 * חוק-אמת: אין דיג'סט → כיכר ריקה עם גוש-אפור אחד ו'לא ידוע'. אף ירוק-מזויף.
 */

import * as THREE from 'three';
import { BUSINESS_ISLAND, SKY_TOP, SKY_BOTTOM } from './canon.js';
import { makeSkyTexture } from './textures.js';

const M = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.04, ...opts });

const COL = {
  ok: '#3e7d5a',      // ירוק — ריצה עברה
  bad: '#b0483a',     // אדום — כשל
  work: '#b28a2e',    // אמבר — בעבודה
  unknown: '#8a857c', // אפור — לא ידוע
};

const LANDMARKS = {
  'TruthRail': { he: 'מאזני-משפט', build: buildScales },
  'sovereign-lighthouse': { he: 'מגדלור', build: buildLighthouse },
  'sovereign-beacon': { he: 'עמד-עדות', build: buildWitness },
  'Console': { he: 'שער-פיקוד', build: buildCommandGate },
};

const FRESH_HE = { fresh: 'טרי', aging: 'מתיישן', stale: 'ישן', unknown: 'לא ידוע' };

/** גובה-בניין מקומיטים — תקרה כנה: הערך 100+ מהדיג'סט מיוצג כמות-שהוא */
function heightFor(commits7d) {
  if (typeof commits7d !== 'number') return 1.5; // לא ידוע — בניין-שפלה אפור
  return 1.5 + (Math.min(commits7d, 100) / 100) * 5.7;
}

export class BusinessWorld {
  constructor(scene) {
    this.scene = scene;
    this.api = { beams: [], pulses: [], spinners: [], sways: [] };
    this.signature = null;
    this.buildIsland();

    // לוח-מקרא (DOM) — נבנה פעם אחת, מתעדכן מהדיג'סט
    this.$legend = document.getElementById('bizLegend');
    this.buildLegendSkeleton();
  }

  // ───── אדריכלות-בסיס של האי (סטטית) ─────
  buildIsland() {
    const { x, z, r, sky } = BUSINESS_ISLAND;
    // כיפת-שמיים משל האי (אותן סגנון-שמיים של האולם)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(sky, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(SKY_TOP, SKY_BOTTOM), side: THREE.BackSide, fog: false }),
    );
    dome.position.set(x, 0, z);
    this.scene.add(dome);

    // כיכר-אבן
    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r + 1.2, 0.5, 42),
      M({ color: '#c9bda6', roughness: 0.92 }),
    );
    plaza.position.set(x, -0.25, z);
    plaza.receiveShadow = true;
    this.scene.add(plaza);
    // טבעת-שפה
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(r - 0.4, 0.09, 8, 48),
      M({ color: '#a8977a', roughness: 0.85 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(x, 0.03, z);
    this.scene.add(rim);

    // קבוצת-העיר — נבנית-מחדש מכל דיג'סט משתנה
    this.city = new THREE.Group();
    this.city.position.set(x, 0, z);
    this.scene.add(this.city);
  }

  // ───── בנייה-מחדש מהדיג'סט (רק כשחתימת-הנתונים השתנתה) ─────
  applyDigest(snap) {
    const repos = snap?.repos || [];
    const sig = snap?.available
      ? repos.map((r) => `${r.name}|${r.commits7d}|${r.runStatus}|${r.runConclusion}|${r.runAt}`).join(';;')
      : 'no-digest';
    if (sig === this.signature) return;
    this.signature = sig;
    this.disposeCity();
    this.api = { beams: [], pulses: [], spinners: [], sways: [] };

    if (!snap?.available || !repos.length) {
      // כנות: אין דיג'סט — גוש אפור אחד עם 'לא ידוע'
      this.buildUnknownMonolith();
      this.renderLegend(snap);
      return;
    }

    // רשת 3×3 לפי סדר-הדיג'סט
    const GAP = 6.6;
    repos.forEach((r, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const px = (col - 1) * GAP;
      const pz = (row - 1) * GAP;
      const land = LANDMARKS[r.name];
      const g = new THREE.Group();
      g.position.set(px, 0, pz);
      if (land) land.build(g, r, this.api, heightFor(r.commits7d));
      else this.buildTower(g, r, this.api);
      this.city.add(g);
      // שלט-שם: שם הספר + קומיטים (מהדיג'סט בלבד)
      const label = makeRepoLabel(r.name, commitsText(r));
      label.position.set(px, heightFor(r.commits7d) + (land ? 2.6 : 1.15), pz);
      this.city.add(label);
    });
    this.renderLegend(snap);
  }

  buildTower(g, r, api) {
    const h = heightFor(r.commits7d);
    const color = r.color || COL.unknown;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, h, 2.5),
      M({ color: r.color === COL.unknown ? '#b7b2a8' : '#d8cec0', roughness: 0.9 }),
    );
    body.position.y = h / 2;
    g.add(body);
    // פס-גג בצבע-המצב (האור האמיתי של הספר)
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(2.62, 0.16, 2.62),
      new THREE.MeshStandardMaterial({ color: '#3a362f', emissive: color, emissiveIntensity: 1.6, roughness: 0.5 }),
    );
    band.position.y = h + 0.08;
    g.add(band);
    // חלונות (שתי שורות בפאה הדרומית) — בצבע-המצב
    const winMat = new THREE.MeshStandardMaterial({
      color: '#2e2b26', emissive: color, emissiveIntensity: 1.1, roughness: 0.4,
    });
    const rows = Math.max(1, Math.min(3, Math.round(h / 2)));
    for (let ry = 0; ry < rows; ry++) {
      for (let wx = -0.7; wx <= 0.7; wx += 0.7) {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.03), winMat);
        w.position.set(wx, 0.9 + ry * (h - 1.2) / Math.max(1, rows), 1.26);
        g.add(w);
      }
    }
    // קרן-מגדלור לריצה-בעבודה (in_progress/pending/queued)
    if (r.runStatus === 'in_progress' || r.runStatus === 'pending' || r.runStatus === 'queued') {
      addBeam(g, h + 0.2, api, COL.work);
    }
  }

  buildUnknownMonolith() {
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      M({ color: '#b7b2a8', roughness: 0.95 }),
    );
    g.position.set(0, 1.1, 0);
    this.city.add(g);
    const label = makeRepoLabel('אין דיג׳סט', '— לא ידוע —');
    label.position.set(0, 3.4, 0);
    this.city.add(label);
  }

  disposeCity() {
    const dead = [];
    this.city.traverse((o) => { if (o.isMesh || o.isSprite) dead.push(o); });
    for (const o of dead) {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
    this.city.clear();
  }

  // ───── לופ-החיים של האי ─────
  update(t) {
    // קרני-עבודה פועמות
    for (const b of this.api.beams) {
      b.material.opacity = 0.3 + Math.sin(t * 2.1 + b.userData.phase) * 0.18;
    }
    // כתר-המגדלור מסתובב
    for (const s of this.api.spinners) s.rotation.y = t * 0.85;
    // עמוד-העדות פועם
    for (const p of this.api.pulses) {
      const k = 0.5 + Math.sin(t * 2.6 + p.phase) * 0.5;
      p.sphere.material.emissiveIntensity = 1.0 + k * 1.6;
      p.light.intensity = 2.5 + k * 3.5;
    }
    // כפות-המאזניים מתנדנדות-קלות
    for (const s of this.api.sways) s.rotation.z = Math.sin(t * 1.3 + s.userData.phase) * 0.035;
  }

  // ───── מעברי-מצלמה (דרך הבמאי — מינימלי ואדיטיבי) ─────
  enter(director) {
    director.setMode('business');
    const { x, z } = BUSINESS_ISLAND;
    director.flyTo(
      new THREE.Vector3(x + 12.5, 9.2, 15.5),
      new THREE.Vector3(x, 2.4, 0),
      3.2,
    );
  }

  leave(director) {
    director.setMode('office');
    // חזרה למבט-העל של המשרד (נקודת-הפתיחה של האולם)
    director.flyTo(new THREE.Vector3(7.4, 4.7, 5.1), new THREE.Vector3(-0.6, 0.9, -0.9), 3.2);
  }

  // ───── לוח-המקרא (DOM, עברית, RTL) ─────
  buildLegendSkeleton() {
    if (!this.$legend) return;
    this.$legend.innerHTML = `
      <header>
        <b>עולם-העסקים — המטפורות</b>
        <span id="bizLegendSrc" class="bizSrc">—</span>
      </header>
      <div class="bizBody">
        <div class="bizRow"><span class="bizGlyph">🏢</span> גובה-בניין = קומיטים בשבוע (100+ מוצג כפי שהתקבל מהדיג'סט)</div>
        <div class="bizRow"><span class="bizDot" style="background:${COL.ok}"></span> הריצה האחרונה עברה (success)</div>
        <div class="bizRow"><span class="bizDot" style="background:${COL.bad}"></span> הריצה האחרונה נכשלה</div>
        <div class="bizRow"><span class="bizDot" style="background:${COL.work}"></span> ריצה בעבודה — קרן-אור מעל הגג</div>
        <div class="bizRow"><span class="bizDot" style="background:${COL.unknown}"></span> לא ידוע (אין נתון — אין צבע)</div>
        <div class="bizSep"></div>
        <div class="bizRow bizLand"><b>מאזני-משפט</b> — TruthRail: שקילת-אמת לכל טענה <span class="bizMeta" data-repo="TruthRail">—</span></div>
        <div class="bizRow bizLand"><b>מגדלור</b> — sovereign-lighthouse: אור-סיפור מסתובב <span class="bizMeta" data-repo="sovereign-lighthouse">—</span></div>
        <div class="bizRow bizLand"><b>עמד-עדות</b> — sovereign-beacon: עדות פועמת <span class="bizMeta" data-repo="sovereign-beacon">—</span></div>
        <div class="bizRow bizLand"><b>שער-פיקוד</b> — Console: השער לפיקוד-הצי <span class="bizMeta" data-repo="Console">—</span></div>
      </div>`;
  }

  renderLegend(snap) {
    if (!this.$legend) return;
    const src = this.$legend.querySelector('#bizLegendSrc');
    if (src) {
      if (snap?.available && snap.generatedAt) {
        const age = Number.isFinite(snap.ageMin) ? `${Math.max(0, Math.round(snap.ageMin))} דק'` : '—';
        src.textContent = `מקור: digest.json · ${FRESH_HE[snap.freshness] || 'לא ידוע'} · ${age}`;
        src.className = 'bizSrc ' + snap.freshness;
      } else {
        src.textContent = 'מקור: digest.json · לא ידוע (אין חיבור)';
        src.className = 'bizSrc unknown';
      }
    }
    // מטפורות: כנות לגבי נוכחות הספר בדיג'סט
    const have = new Map((snap?.repos || []).map((r) => [r.name, r]));
    for (const [name, meta] of Object.entries(LANDMARKS)) {
      const el = this.$legend.querySelector(`[data-repo="${name}"]`);
      if (!el) continue;
      const r = have.get(name);
      if (r) {
        el.textContent = `· בדיג'סט · ${commitsText(r)}`;
        el.className = 'bizMeta ' + (r.runConclusion === 'success' ? 'ok' : (r.color === COL.bad ? 'bad' : (r.color === COL.work ? 'work' : '')));
      } else {
        el.textContent = '· לא בדיג׳סט —';
        el.className = 'bizMeta off';
      }
    }
  }
}

// ───── עזרים ─────
function commitsText(r) {
  if (typeof r.commits7d !== 'number') return 'קומיטים 7d: —';
  return `קומיטים 7d: ${r.commits7d}${r.commits7dCapped ? '+' : ''}`;
}

function addBeam(g, y, api, color) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 5.5, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }),
  );
  beam.position.y = y + 2.75;
  beam.userData.phase = Math.random() * Math.PI * 2;
  g.add(beam);
  api.beams.push(beam);
}

function statusLantern(g, y, color, api, { pulse = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#3a362f', emissive: color, emissiveIntensity: pulse ? 1.0 : 1.6, roughness: 0.4,
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat);
  sphere.position.y = y;
  g.add(sphere);
  if (pulse) {
    const light = new THREE.PointLight(color, 3.5, 9, 1.6);
    light.position.y = y + 0.1;
    g.add(light);
    api.pulses.push({ sphere, light, phase: Math.random() * Math.PI * 2 });
  }
  return sphere;
}

// ───── מטפורות-הציון ─────

// TruthRail → מאזני-משפט: עמוד + קורה + שתי כפות תלויות
function buildScales(g, r, api, h) {
  const brass = M({ color: '#c8a04e', roughness: 0.3, metalness: 0.75 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.35, 18), M({ color: '#6f6a60', roughness: 0.9 }));
  base.position.y = 0.17;
  g.add(base);
  const pillarH = Math.max(2.0, h * 0.75);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, pillarH, 12), brass);
  pillar.position.y = 0.35 + pillarH / 2;
  g.add(pillar);
  // הקורה כולה מתנדנדת סביב ציר-העמוד — התנדנדות-מאזניים עדינה
  const cross = new THREE.Group();
  cross.position.y = 0.35 + pillarH;
  cross.userData.phase = 0;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.07), brass);
  cross.add(bar);
  for (const side of [-1, 1]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.85, 6), M({ color: '#8a7a55', metalness: 0.6, roughness: 0.4 }));
    chain.position.set(side * 1.2, -0.43, 0);
    cross.add(chain);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.07, 16), brass);
    pan.position.set(side * 1.2, -0.88, 0);
    cross.add(pan);
  }
  api.sways.push(cross);
  g.add(cross);
  statusLantern(g, 0.35 + pillarH + 0.5, r.color || COL.unknown, api, { pulse: false });
}

// sovereign-lighthouse → מגדלור: מגדל מתחדד + פנס + קרן-אור מסתובבת
function buildLighthouse(g, r, api, h) {
  const towerH = Math.max(2.6, h * 0.95);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.62, towerH, 14),
    M({ color: '#e8e0d0', roughness: 0.85 }),
  );
  tower.position.y = towerH / 2;
  g.add(tower);
  // פסים אדומים-לבנים (צבע חומר בלבד — לא סטטוס)
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5 - i * 0.07, 0.56 - i * 0.07, 0.16, 14),
      M({ color: '#b0483a', roughness: 0.8 }),
    );
    stripe.position.y = towerH * (0.25 + i * 0.25);
    g.add(stripe);
  }
  // חדר-הפנס
  const lampRoom = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12, 1, true),
    new THREE.MeshPhysicalMaterial({ color: '#fff3dd', transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
  );
  lampRoom.position.y = towerH + 0.2;
  g.add(lampRoom);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.3, 12), M({ color: '#b0483a', roughness: 0.6 }));
  roof.position.y = towerH + 0.55;
  g.add(roof);
  statusLantern(g, towerH + 0.2, r.color || COL.unknown, api, { pulse: true });
  // קרן-האור המסתובבת (מטפורת הסיפור)
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 3.4, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: '#ffe9b8', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.y = towerH + 0.2;
  const spinner = new THREE.Group();
  spinner.position.y = 0;
  spinner.add(cone);
  cone.position.set(1.7, towerH + 0.2, 0);
  api.spinners.push(spinner);
  g.add(spinner);
}

// sovereign-beacon → עמד-עדות: עמוד-אבן עם אור פועם
function buildWitness(g, r, api, h) {
  const pillarH = Math.max(2.2, h * 0.85);
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, pillarH, 0.42),
    M({ color: '#cfc4ae', roughness: 0.9 }),
  );
  pillar.position.y = pillarH / 2;
  g.add(pillar);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.62), M({ color: '#a8977a', roughness: 0.85 }));
  cap.position.y = pillarH + 0.07;
  g.add(cap);
  statusLantern(g, pillarH + 0.42, r.color || COL.unknown, api, { pulse: true });
  if (r.runStatus === 'in_progress' || r.runStatus === 'pending' || r.runStatus === 'queued') {
    addBeam(g, pillarH + 0.5, api, COL.work);
  }
}

// Console → שער-פיקוד: קשת/שער עם מישור-אור
function buildCommandGate(g, r, api, h) {
  const gateH = Math.max(2.4, h * 0.9);
  const steel = M({ color: '#3c4148', roughness: 0.4, metalness: 0.7 });
  for (const sx of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, gateH, 0.22), steel);
    post.position.set(sx, gateH / 2, 0);
    g.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.24, 0.3), steel);
  lintel.position.y = gateH + 0.12;
  g.add(lintel);
  // מישור-השער — שקוף, בצבע-המצב
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, gateH - 0.15),
    new THREE.MeshBasicMaterial({ color: r.color || COL.unknown, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
  );
  plane.position.y = (gateH - 0.15) / 2;
  g.add(plane);
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.03, 18), M({ color: '#c8a04e', metalness: 0.8, roughness: 0.25 }));
  emblem.rotation.x = Math.PI / 2;
  emblem.position.y = gateH + 0.36;
  g.add(emblem);
  statusLantern(g, gateH + 0.62, r.color || COL.unknown, api, { pulse: false });
  if (r.runStatus === 'in_progress' || r.runStatus === 'pending' || r.runStatus === 'queued') {
    addBeam(g, gateH + 0.7, api, COL.work);
  }
}

// ───── שלט-שם של ספר (ספרייט קנבס — סגנון textures.js) ─────
function makeRepoLabel(name, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 144;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(28,26,23,0.88)';
  roundRect(g, 14, 18, 484, 108, 22); g.fill();
  g.strokeStyle = 'rgba(240,235,225,0.5)'; g.lineWidth = 3;
  roundRect(g, 14, 18, 484, 108, 22); g.stroke();
  g.fillStyle = '#f5f1e8';
  g.textAlign = 'center';
  g.font = '800 44px ui-monospace, monospace';
  g.fillText(clip(String(name), 20), 256, 70);
  g.fillStyle = 'rgba(240,235,225,0.78)';
  g.font = '500 28px system-ui, sans-serif';
  g.fillText(clip(String(sub), 34), 256, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sprite.scale.set(1.9, 0.53, 1);
  return sprite;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function clip(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
