/**
 * textures.js — טקסטורות פרוצדורליות (קנבס): רצפת עץ, טיח, שטיח, שמיים,
 * ומסכים חיים (לוח-משימות, קיר-הגיט, צגי-שולחן) שנצבעים מהנתונים האמיתיים.
 * אין כאן תמונות חוץ — הכול מצויר מקומית, אפס תלות רשת.
 */

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}

function tex(c, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}

// ───── רצפת אלון חמה ─────
export function makeFloorTexture() {
  const { c, g } = canvas(1024, 1024);
  g.fillStyle = '#b08a5f'; g.fillRect(0, 0, 1024, 1024);
  // לוחות אופקיים
  const rows = 12, h = 1024 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    const off = (r % 2) * 180 + (r * 97) % 120;
    for (let x = -off; x < 1024; x += 340) {
      const shade = 0.86 + ((r * 31 + x) % 17) / 60;
      g.fillStyle = `rgb(${176 * shade | 0},${138 * shade | 0},${95 * shade | 0})`;
      g.fillRect(x + 3, y + 2, 334, h - 4);
      // פסי-גרגר
      g.strokeStyle = 'rgba(90,60,30,0.16)';
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const gy = y + 6 + ((x + i * 53 + r * 29) % (h - 12));
        g.beginPath(); g.moveTo(x + 6, gy);
        g.bezierCurveTo(x + 90, gy + 3, x + 200, gy - 3, x + 330, gy + 1);
        g.stroke();
      }
      // חריץ בין-לוחות
      g.fillStyle = 'rgba(70,45,22,0.35)'; g.fillRect(x, y, 2, h);
    }
    g.fillStyle = 'rgba(70,45,22,0.22)'; g.fillRect(0, y, 1024, 1);
  }
  return tex(c, { repeat: [5, 3.2] });
}

// ───── טיח פנים חם ─────
export function makePlasterTexture() {
  const { c, g } = canvas(512, 512);
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * 0.05;
    g.fillStyle = Math.random() > 0.5 ? `rgba(120,105,85,${a})` : `rgba(255,255,255,${a + 0.02})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  return tex(c, { repeat: [4, 2] });
}

// ───── שטיח מרכזי ─────
export function makeRugTexture() {
  const { c, g } = canvas(1024, 640);
  const grad = g.createRadialGradient(512, 320, 60, 512, 320, 520);
  grad.addColorStop(0, '#8a4b3c'); grad.addColorStop(0.75, '#7d4636'); grad.addColorStop(1, '#6d3c2e');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 640);
  // מסגרת וקישוט גיאומטרי עדין
  g.strokeStyle = 'rgba(240,220,190,0.55)'; g.lineWidth = 8;
  g.strokeRect(26, 26, 972, 588);
  g.lineWidth = 3; g.strokeRect(48, 48, 928, 544);
  g.strokeStyle = 'rgba(240,220,190,0.28)';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.arc(512, 320, 90 + i * 34, 0, Math.PI * 2);
    g.stroke();
  }
  return tex(c);
}

// ───── שמיים (כיפה) ─────
export function makeSkyTexture(top, bottom) {
  const { c, g } = canvas(64, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, top); grad.addColorStop(0.55, '#d8e4e4'); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───── מסך חי: לוח-המשימות (קנבס עם API ציור) ─────
export function makeTaskWallScreen() {
  const { c, g } = canvas(1024, 560);
  const t = tex(c);
  const state = { cols: null, mode: 'sim' };
  function draw() {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, 1024, 560);
    // כותרת
    g.fillStyle = '#2c2a26';
    g.font = '800 40px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText('לוח המשימות — התוכנית האמיתית', 1000, 58);
    const cols = state.cols || [
      { he: 'מתוכנן', cards: simCards('plan') },
      { he: 'בעבודה', cards: simCards('doing') },
      { he: 'הושלם', cards: simCards('done') },
    ];
    const cw = 316, gap = 22, x0 = 1024 - 30 - cw;
    cols.forEach((col, i) => {
      const x = x0 - i * (cw + gap);
      g.fillStyle = 'rgba(60,52,40,0.07)';
      roundRect(g, x, 84, cw, 446, 16); g.fill();
      g.fillStyle = '#5b544a';
      g.font = '800 28px system-ui, sans-serif';
      g.fillText(`${col.he} · ${col.cards.length}`, x + cw - 18, 124);
      col.cards.slice(0, 6).forEach((card, j) => {
        const y = 148 + j * 62;
        g.fillStyle = card.color || '#fff';
        roundRect(g, x + 14, y, cw - 28, 52, 12); g.fill();
        g.strokeStyle = 'rgba(60,52,40,0.22)'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#2c2a26';
        g.font = '600 22px system-ui, sans-serif';
        clipText(g, card.title, x + cw - 30, y + 24, cw - 56);
        if (card.who) {
          g.fillStyle = '#8a6a3c';
          g.font = '700 18px system-ui, sans-serif';
          g.fillText(card.who, x + cw - 30, y + 45);
        }
      });
    });
    // חותמת מצב
    stampMode(g, state.mode);
    t.needsUpdate = true;
  }
  draw();
  return { texture: t, set(cols, mode) { state.cols = cols; state.mode = mode; draw(); } };
}

// ───── מסך חי: קיר-הגיט ─────
export function makeGitWallScreen() {
  const { c, g } = canvas(1024, 560);
  const t = tex(c);
  const state = { rows: null, mode: 'sim' };
  function draw() {
    g.fillStyle = '#141a1e'; g.fillRect(0, 0, 1024, 560);
    g.fillStyle = '#79c0a8';
    g.font = '700 30px ui-monospace, monospace';
    g.textAlign = 'right';
    g.fillText('הגייט-חוט — קומיטים אמיתיים', 996, 52);
    g.textAlign = 'left';
    const rows = state.rows || simWire();
    rows.slice(0, 12).forEach((r, i) => {
      const y = 104 + i * 37;
      g.fillStyle = r.color || '#6ee7a0';
      g.font = '600 22px ui-monospace, monospace';
      g.fillText(r.sha, 28, y);
      g.fillStyle = '#d7e2df';
      g.font = '400 21px system-ui, sans-serif';
      g.fillText(clipStr(r.msg, 62), 150, y);
      g.fillStyle = '#5f6d6a';
      g.font = '400 18px system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText(r.age, 996, y);
      g.textAlign = 'left';
    });
    stampMode(g, state.mode, true);
    t.needsUpdate = true;
  }
  draw();
  return { texture: t, set(rows, mode) { state.rows = rows; state.mode = mode; draw(); }, state };
}

// ───── מסך חי: צג שולחן של סוכן ─────
export function makeDeskScreen(color) {
  const { c, g } = canvas(512, 320);
  const t = tex(c);
  const state = { lines: [], title: '', mode: 'sim', scroll: 0 };
  function draw() {
    g.fillStyle = '#101518'; g.fillRect(0, 0, 512, 320);
    // פס-כותרת בצבע הסוכן
    g.fillStyle = color;
    g.fillRect(0, 0, 512, 40);
    g.fillStyle = '#0d1114';
    g.font = '700 22px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(state.title || 'מסך עבודה', 496, 28);
    const lines = state.lines.length ? state.lines : ['ממתין למשמרת…', '—'];
    const vis = 7, first = Math.max(0, lines.length - vis - Math.floor(state.scroll));
    g.textAlign = 'right';
    lines.slice(first, first + vis + 2).forEach((ln, i) => {
      const y = 74 + i * 33;
      g.fillStyle = ln.err ? '#e07b6a' : ln.ok ? '#8fd6a8' : '#c8d4d0';
      g.font = '500 20px ui-monospace, monospace';
      g.fillText(clipStr(ln.text, 40), 496, y);
    });
    if (state.mode === 'sim') {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.font = '600 14px system-ui, sans-serif';
      g.fillText('DEMO · SIMULATION', 16, 306);
    }
    t.needsUpdate = true;
  }
  draw();
  return {
    texture: t,
    set(lines, title, mode) {
      state.lines = lines || []; state.title = title || ''; state.mode = mode;
      state.scroll = (state.scroll + 0.13) % Math.max(1, state.lines.length - 5);
      draw();
    },
  };
}

// ───── שלט-שם מרחף (ספרייט) ─────
export function makeNameplate(he, role, color) {
  const { c, g } = canvas(512, 160);
  function draw() {
    g.clearRect(0, 0, 512, 160);
    g.fillStyle = 'rgba(28,26,23,0.88)';
    roundRect(g, 16, 18, 480, 124, 26); g.fill();
    g.strokeStyle = color; g.lineWidth = 6;
    roundRect(g, 16, 18, 480, 124, 26); g.stroke();
    // נקודת צבע
    g.fillStyle = color;
    g.beginPath(); g.arc(66, 80, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5f1e8';
    g.textAlign = 'right';
    g.font = '800 52px system-ui, sans-serif';
    g.fillText(he, 470, 78);
    g.fillStyle = 'rgba(240,235,225,0.75)';
    g.font = '500 30px system-ui, sans-serif';
    g.fillText(role, 470, 122);
  }
  draw();
  const t = tex(c);
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.86, 0.27, 1);
  return sprite;
}

// ───── עזרים ─────
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function clipStr(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function clipText(g, s, x, y, maxW) {
  s = String(s ?? '');
  if (g.measureText(s).width <= maxW) { g.fillText(s, x, y); return; }
  while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  g.fillText(s + '…', x, y);
}

function stampMode(g, mode, dark = false) {
  g.textAlign = 'left';
  if (mode === 'sim') {
    g.fillStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.45)';
    g.font = '800 20px system-ui, sans-serif';
    g.fillText('DEMO · SIMULATION', 24, dark ? 306 : 546);
  }
}

// סימולציה מסומנת — רק כשאין נתונים אמיתיים
function simCards(kind) {
  const base = [
    { title: 'סיור שגרה בספרי-הצי', who: 'אלוף', color: '#f3e8d3' },
    { title: 'אימות טריות ספרים', who: 'ארז', color: '#f0ead8' },
    { title: 'מדידת מדדי-שוק', who: 'גל', color: '#e8f0e4' },
  ];
  return kind === 'plan' ? base : kind === 'doing' ? base.slice(0, 2) : base.slice(0, 1);
}

function simWire() {
  return [
    { sha: '────────', msg: 'אין חיבור חי — מצב הדגמה מסומן', age: '', color: '#8a8378' },
  ];
}
