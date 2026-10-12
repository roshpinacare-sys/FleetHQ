/**
 * main.js — הפעלת המשרד: רנדרר + תאורת-יום, עולם, צוות, מצלמת-במאי,
 * גשר-נתונים אמיתי, וממשק. חוק-אמת: אין ירוק-מזויף; כשל = כנה ומוסבר.
 */

import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Crew } from './crew.js';
import { Director, VIEWS } from './director.js';
import { DataBridge } from './data.js';
import { LiveBridge } from './live.js';
import { UI } from './ui.js';
import { buildAtmosphere } from './atmosphere.js';
import { CREW, ROOM_W, ROOM_D, WALL_H } from './canon.js';

// ───────── רנדרר ─────────
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.21;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const isMobile = matchMedia('(max-width: 900px)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.8));
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#e6dfcf', 34, 78);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 160);
camera.position.set(7.4, 4.7, 5.1);

// ───────── תאורת יום ─────────
const hemi = new THREE.HemisphereLight('#cfe4f2', '#b09a78', 1.02);
scene.add(hemi);
const amb = new THREE.AmbientLight('#fff8ec', 0.28);
scene.add(amb);

const sun = new THREE.DirectionalLight('#ffedd2', 2.7);
sun.position.set(14, 11, 7); // מהמזרח-דרום — דרך החלונות
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1536 : 3072, isMobile ? 1536 : 3072);
sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 2; sun.shadow.camera.far = 46;
sun.shadow.bias = -0.0004;
sun.shadow.radius = 5;
scene.add(sun, sun.target);

// מילוי-פנימי עדין (לפינות)
const fill1 = new THREE.PointLight('#ffe6bb', 8, 16, 1.7);
fill1.position.set(-6, 3.1, 0);
const fill2 = new THREE.PointLight('#ffe6bb', 8, 16, 1.7);
fill2.position.set(6, 3.1, 0.5);
scene.add(fill1, fill2);

// ───────── עולם + צוות ─────────
const world = buildWorld(scene);

// שכבת-אטמוספירה: עמודי-אור + אבק-קרניים
const atmosphere = buildAtmosphere(scene);

// חיבור צגי-שולחן לטקסטורות החיות
for (const [id, grp] of Object.entries(world.deskGroups)) {
  const scr = world.screens.desks[id];
  if (grp.userData.deskFaceMat && scr) grp.userData.deskFaceMat.emissiveMap = scr.texture;
}

const bubbles = [];
const ui = new UI({
  onFocus: (id) => {
    const target = crew.agents.find((a) => a.id === id);
    if (target) director.focusAgent(target);
  },
  onView: (id) => {
    if (id === 'tour') { director.startTour(); ui.setTourActive(); return; }
    if (id === 'stop-tour') { director.stopTour(); return; }
    const v = VIEWS.find((x) => x.id === id);
    if (v) { director.goView(v); ui.showViewTitle(v.he); }
  },
  onRosterToggle: () => {},
});

const crew = new Crew(scene, {
  onBubble: (id, text, ms) => ui.bubble(id, text, ms, data.mode === 'live'),
  onRoster: (entries) => { ui.updateRoster(entries); ui.updateCardLive(entries); },
});

const director = new Director(camera, renderer.domElement);

// ───────── גשר-נתונים + שידור-חי ─────────
const data = new DataBridge();
let lastBubbleAt = {};
let broadcastMode = null; // 'broadcast' כשיש שידור · null = הגשר המקומי קובע

// צגי-שולחן מפעילות-השידור (אותו פורמט כמו הגשר, בלי ציורים מיותרים)
function setDeskScreens(activities, screenMode) {
  for (const [id, scr] of Object.entries(world.screens.desks)) {
    const c = CREW.find((x) => x.id === id);
    scr.set([
      { text: 'שידור חי: ' + (activities[id] || 'במשמרת'), ok: true },
    ], `${c?.he} · ${c?.role}`, screenMode);
  }
}

const live = new LiveBridge({
  crew,
  ui,
  data,
  setBroadcastMode: (m) => { broadcastMode = m; },
  onDeskScreens: setDeskScreens,
});

data.on((snap) => {
  try {
    const eff = broadcastMode || snap.mode;
    const screenMode = eff === 'broadcast' || eff === 'live' ? 'live' : eff === 'stale' ? 'stale' : 'sim';
    // צ'יפ-המצב: בשידור/עולם — הגשר-החי הוא הבעלים (live.js); הגשר-הספרים לא יורש אותו
    if (!broadcastMode) ui.setMode(eff, snap);
    crew.setLive(snap.activities, snap.mode);
    // לוח-משימות
    const cols = taskColumns(snap);
    world.screens.task.set(cols, screenMode);
    // קיר-הגיט
    const wireRows = snap.wire.slice(0, 11).map((w) => ({
      sha: (w.sha || '').slice(0, 7),
      msg: w.msg || '',
      age: w.ageMin != null ? `${Math.round(w.ageMin)} דק'` : (w.at ? timeAgo(w.at) : ''),
      color: '#6ee7a0',
    }));
    world.screens.git.set(wireRows, screenMode);
    // צגי-שולחן — רק כשאין שידור (בשידור: setDeskScreens מהפריימים)
    if (!broadcastMode) {
      for (const [id, scr] of Object.entries(world.screens.desks)) {
        const c = CREW.find((x) => x.id === id);
        scr.set(data.deskLines(id), `${c?.he} · ${c?.role}`, screenMode);
      }
    }
    // בועות חיות מהפיד (פעם לכל אירוע)
    for (const f of snap.bubbles) {
      const key = f.at || f.text;
      if (lastBubbleAt[key]) continue;
      lastBubbleAt[key] = true;
      const who = (f.kind || '').replace('bubble:', '');
      ui.bubble(who, f.text, 6000, snap.mode === 'live');
    }
    // טיקר
    const f0 = snap.bubbles[0];
    if (f0) ui.pushTicker(f0.text, `${(f0.kind || '').replace('bubble:', '')} · ${timeAgo(f0.at)}`);
    else if (snap.wire[0]) ui.pushTicker(`קומיט חדש בצי: ${snap.wire[0].msg?.slice(0, 46)}`, snap.wire[0].sha);
    else if (snap.mode === 'sim' && !broadcastMode) ui.pushTicker('אין חיבור חי — המשרד רץ במצב הדגמה מסומן', 'חוק-האמת: לא נראה ירוק-מזויף');
  } catch (err) {
    console.warn('[office] data-callback failure (honest):', err?.message || err);
  }
});

function taskColumns(snap) {
  const pick = (pred, color) => snap.tasks
    .filter(pred)
    .slice(-6)
    .map((t) => ({
      title: t.title || t.description || t.id,
      who: t.assignee ? CREW.find((c) => c.id === t.assignee)?.he || t.assignee : '',
      color,
    }));
  const st = (t) => (t.status || '').toLowerCase();
  const cols = [
    { he: 'מתוכנן', cards: pick((t) => ['todo', 'planned', 'planning'].some((s) => st(t).startsWith(s)), '#f6f1e4') },
    { he: 'בעבודה', cards: pick((t) => ['doing', 'in_progress', 'active'].some((s) => st(t).startsWith(s)), '#f6f1e4') },
    { he: 'הושלם', cards: pick((t) => ['done', 'review', 'complete'].some((s) => st(t).startsWith(s)), '#eef2e6') },
  ];
  // חסום = מסומן באדום (אמת, לא נעלם)
  const blocked = snap.tasks.filter((t) => st(t) === 'blocked').slice(-2)
    .map((t) => ({ title: 'חסום: ' + (t.title || ''), who: '', color: '#f6ddda' }));
  cols[1].cards = blocked.concat(cols[1].cards).slice(0, 6);
  if (!cols[0].cards.length && !cols[1].cards.length && !cols[2].cards.length) {
    return [
      { he: 'מתוכנן', cards: [{ title: 'ממתין לתוכנית ראש-המטה' }] },
      { he: 'בעבודה', cards: [{ title: '—' }] },
      { he: 'הושלם', cards: [] },
    ];
  }
  return cols;
}

function timeAgo(ts) {
  if (!ts) return '';
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (min < 1) return 'עכשיו';
  if (min < 60) return `${min} דק'`;
  return `${Math.round(min / 60)} שע'`;
}

// ───────── מסך-טעינה ─────────
const bar = document.querySelector('#bar > i');
const loadState = document.getElementById('loadState');
let loadP = 8;
function setLoad(p, txt) { loadP = Math.max(loadP, p); bar.style.width = loadP + '%'; if (txt) loadState.textContent = txt; }
setLoad(30, 'בונים את האולם…');

// ───────── לולאה ─────────
const clock = new THREE.Clock();
let elapsed = 0;
let firstFrames = 0;
const headVec = new THREE.Vector3();

function project(v) {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * innerWidth,
    y: (-p.y * 0.5 + 0.5) * innerHeight,
    visible: p.z < 1 && p.x > -1.2 && p.x < 1.2 && p.y > -1.2 && p.y < 1.2,
  };
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  world.update(elapsed);
  atmosphere.update(dt);
  crew.update(dt, elapsed);
  director.update(dt);

  // שמש עוקבת-קלות (עומק צל יציב)
  sun.target.position.set(0, 0, 0);

  ui.renderBubbles(project, (id) => {
    const a = crew.agents.find((x) => x.id === id);
    return a ? a.headPos(headVec) : null;
  });

  renderer.render(scene, camera);

  if (firstFrames < 3) {
    firstFrames++;
    setLoad(firstFrames === 1 ? 62 : firstFrames === 2 ? 84 : 100, 'מעירים את הצוות…');
    if (firstFrames === 3) {
      setTimeout(() => {
        document.getElementById('loader').classList.add('hide');
        if (data.mode === 'live') ui.bubble('aluf', 'המשמרת החיה נפתחה — הצוות עובד.', 5200, true);
      }, 350);
    }
  }
}

animate();

// ───────── שינוי-גודל ─────────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// עצירה ברקע-כבוי (חיסכון-סוללה)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clock.getDelta();
});

// וידוא-הקשר לדיבוג
window.__office = { scene, camera, renderer, crew, world, data, director };

// כשל-גלובלי כנה
addEventListener('error', (e) => {
  if (document.getElementById('loader') && !document.getElementById('loader').classList.contains('hide')) {
    document.getElementById('failMsg').textContent = 'שגיאת אתחול: ' + (e.message || 'לא ידוע');
    document.getElementById('fail').classList.add('show');
  }
});

// התחלת הגשר + השידור החי (השידור קובע כשהוא קיים; בלעדיו — כנות הגשר)
setLoad(20, 'מתחבר לספרי-הצי…');
data.start();
live.start();
