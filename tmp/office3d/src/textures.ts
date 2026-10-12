/**
 * textures.ts — procedural canvas textures for the Fleet HQ office.
 * ------------------------------------------------------------------
 * אפס נכסי רשת: כל החומרים נוצרים בקנבס בזמן אתחול (עץ, בטון מלוטש, שטיח,
 * מתכת מוברשת, שיש, בד, תריסים, קו רקיע לילה, ניאון, שלטי שמות, בועות דיבור,
 * מסכים חיים, לוח כרטסת, קיר גיט).
 * מסכים דינמיים (צג שולחן, לוח משימות, קיר גיט, שלטי שם) — מנהל הפעלות ציור
 * עם דגל לכלוך וסינון 5Hz, כדי שהרינדור יישאר זול.
 */
import * as THREE from 'three';

// ─────────────── helpers ───────────────
function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function noiseOn(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, alpha: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
  void alpha;
}

function finish(c: HTMLCanvasElement, repeat?: [number, number], aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────── חומרים סטטיים ───────────────

/** בטון מלוטש עם חריצי התפר — רצפת האולם */
export function makeConcreteTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 1024);
  // Task 51 (daylight): light limestone floor — the dark #35322e slab made the
  // whole room read as a night club (measured mean-luma 22-35/255).
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#d9d3c6'); g.addColorStop(0.5, '#cfc9bb'); g.addColorStop(1, '#d5cfc1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  // כתמי שחיקה רכים
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 20 + Math.random() * 130;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const lum = Math.random() > 0.5 ? 255 : 0;
    rg.addColorStop(0, `rgba(${lum},${lum},${lum},${0.02 + Math.random() * 0.035})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  // חריצי התפר בגריד 4×4
  ctx.strokeStyle = 'rgba(60,50,38,0.13)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo((i * 256), 0); ctx.lineTo(i * 256, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(1024, i * 256); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 256 + 3, 0); ctx.lineTo(i * 256 + 3, 1024); ctx.stroke();
  }
  noiseOn(ctx, 1024, 1024, 14, 1);
  return finish(c, [6, 6]);
}

/** אלון בהיר מוברש — משטחי שולחנות ודלפקים */
export function makeWoodTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  // Task 51 (daylight): light oak — desks read as furniture, not shadows
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#c9a878'); g.addColorStop(1, '#b8946a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // סיבי עץ
  for (let i = 0; i < 140; i++) {
    const y = Math.random() * 512;
    const w = 0.6 + Math.random() * 2.2;
    const a = 0.05 + Math.random() * 0.1;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(96,64,32,${a})` : `rgba(240,220,180,${a * 0.8})`;
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 3.2);
    ctx.stroke();
  }
  // קשרי עץ
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512;
    for (let r = 14; r > 2; r -= 3) {
      ctx.strokeStyle = `rgba(110,72,36,${0.14 + Math.random() * 0.09})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, r * 2.1, r, 0, 0, 7); ctx.stroke();
    }
  }
  noiseOn(ctx, 1024, 512, 8, 1);
  return finish(c);
}

/** שטיח צמר — אזור הלהבה ואזור הקבלה */
export function makeCarpetTexture(tint = '#5a4636'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 512, 512);
  // דוגמת אריגה עדינה
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const v = ((x + y) / 8) % 2 === 0;
      ctx.fillStyle = v ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, y, 8, 8);
    }
  }
  // גליל גבולות מעוגל
  ctx.strokeStyle = 'rgba(255,196,110,0.5)'; ctx.lineWidth = 10;
  ctx.strokeRect(24, 24, 464, 464);
  ctx.strokeStyle = 'rgba(255,196,110,0.25)'; ctx.lineWidth = 4;
  ctx.strokeRect(44, 44, 424, 424);
  noiseOn(ctx, 512, 512, 18, 1);
  return finish(c, [3, 3]);
}

/** מתכת מוברשת — רגלי שולחנות, מסגרות, תאורה */
export function makeBrushedMetalTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = '#8f939b'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const y = Math.random() * 512;
    const a = 0.03 + Math.random() * 0.09;
    ctx.strokeStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.lineWidth = 0.7 + Math.random();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y + (Math.random() - 0.5) * 6); ctx.stroke();
  }
  return finish(c, [2, 2]);
}

/** שיש בהיר — משטח קבלה */
export function makeMarbleTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 1024, 512);
  g.addColorStop(0, '#eceae4'); g.addColorStop(1, '#e2dfd7');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // ורידים
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(${120 + Math.random() * 40},${116 + Math.random() * 40},${105 + Math.random() * 30},${0.06 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.8 + Math.random() * 2.4;
    let x = Math.random() * 1024, y = Math.random() * 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      x += (Math.random() - 0.4) * 160; y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  noiseOn(ctx, 1024, 512, 7, 1);
  return finish(c);
}

/** בד כיסא — משובץ עדין */
export function makeFabricTexture(tint = '#3a3d42'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(i, 0, 2, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, i, 256, 2);
  }
  noiseOn(ctx, 256, 256, 10, 1);
  return finish(c, [3, 3]);
}

/** קיר צבע חלק עם טקסטורת רולר עדינה */
export function makeWallTexture(tint = '#2e2a26'): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.fillStyle = tint; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const a = 0.015 + Math.random() * 0.03;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 2 + Math.random() * 8, 2 + Math.random() * 3);
  }
  return finish(c, [4, 2]);
}

/** תריסי אלומיניום — על חלונות המערב */
export function makeBlindsTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 1024);
  for (let y = 0; y < 1024; y += 36) {
    const g = ctx.createLinearGradient(0, y, 0, y + 30);
    g.addColorStop(0, '#8d9299'); g.addColorStop(0.5, '#c6cbd2'); g.addColorStop(1, '#5f646b');
    ctx.fillStyle = g; ctx.fillRect(0, y, 256, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, y + 30, 256, 6);
  }
  return finish(c, [3, 1]);
}

/** קו רקיע יום — נוף עיר מחלונות הדרום והמערב (Task 51: daylight honesty) */
export function makeSkylineTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(2048, 512);
  // שמיים יום
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#a9cbe0'); sky.addColorStop(0.5, '#cfe0ea'); sky.addColorStop(0.8, '#e9e9e0'); sky.addColorStop(1, '#f4efe0');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 2048, 512);
  // שמש — הילה רכה במקום ירח
  const mg = ctx.createRadialGradient(1560, 110, 20, 1560, 110, 220);
  mg.addColorStop(0, 'rgba(255,252,236,0.98)'); mg.addColorStop(0.2, 'rgba(255,244,206,0.55)'); mg.addColorStop(1, 'rgba(255,244,206,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(1560, 110, 220, 0, 7); ctx.fill();
  ctx.fillStyle = '#fffdf2'; ctx.beginPath(); ctx.arc(1560, 110, 34, 0, 7); ctx.fill();
  // קו בניינים רחוק — הזגה אטמוספרית
  let x = 0;
  while (x < 2048) {
    const w = 40 + Math.random() * 110, h = 90 + Math.random() * 190;
    ctx.fillStyle = 'rgba(158,178,190,0.85)';
    ctx.fillRect(x, 512 - h - 60, w, h + 60);
    x += w + 4 + Math.random() * 26;
  }
  // קו בניינים קרוב + זכוכית משקפת
  x = -20;
  while (x < 2048) {
    const w = 60 + Math.random() * 130, h = 130 + Math.random() * 230;
    ctx.fillStyle = '#8ea2b0';
    ctx.fillRect(x, 512 - h, w, h);
    for (let wx = x + 8; wx < x + w - 8; wx += 14) {
      for (let wy = 512 - h + 10; wy < 500; wy += 18) {
        if (Math.random() < 0.42) {
          const bright = Math.random() > 0.25;
          ctx.fillStyle = bright ? `rgba(228,242,250,${0.5 + Math.random() * 0.45})` : `rgba(120,150,170,${0.4 + Math.random() * 0.4})`;
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
    }
    x += w + 6 + Math.random() * 40;
  }
  return finish(c);
}

/** טקסטורת צל מגע (blob shadow) */
export function makeBlobShadowTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// (makeHaloTexture / makeSmokeTexture removed with the cinematic layer —
//  their only consumers were the light-shaft dust, flame sparks and halo,
//  all removed as decorative non-information in Task 45.)

// ─────────────── שילוט ───────────────

/** שילוט ניאון: טקסט בוהק + תת-כותרת, על רקע שקוף (מדבק על קיר/זכוכית) */
export function makeSignTexture(text: string, color: string, sub?: string): THREE.CanvasTexture {
  const W = 1024, H = sub ? 320 : 224;
  const [c, ctx] = makeCanvas(W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  // זוהר רקע
  const glow = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * 0.55);
  glow.addColorStop(0, color + '33'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // שכבות ניאון
  ctx.shadowColor = color; ctx.shadowBlur = 34;
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 2 ? '#fff8ee' : color;
    ctx.font = `700 ${sub ? 120 : 128}px 'Heebo','Assistant',system-ui,sans-serif`;
    ctx.fillText(text, W / 2, sub ? H * 0.4 : H / 2);
  }
  if (sub) {
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.font = `500 44px 'Heebo','Assistant',system-ui,sans-serif`;
    ctx.fillText(sub, W / 2, H * 0.76);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ─────────────── מנהל מסכים דינמיים ───────────────

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

class DynTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  painter: Painter;
  dirty = true;
  last = 0;
  constructor(w: number, h: number, painter: Painter) {
    const [c, ctx] = makeCanvas(w, h);
    this.canvas = c; this.ctx = ctx; this.painter = painter;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.draw();
  }
  markDirty() { this.dirty = true; }
  /** מצויר לכל היותר פעם ב-200ms */
  update(now: number) {
    if (!this.dirty || now - this.last < 200) return;
    this.last = now;
    this.draw();
  }
  draw() {
    this.painter(this.ctx, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
    this.dirty = false;
  }
}

/** מסך CRT של צג שולחן — שורות לוג חיות בצבע הסוכן */
export function makeMonitorScreen(agentName: string, agentColor: string): {
  tex: THREE.CanvasTexture; setLogs: (lines: { kind: string; text: string }[]) => void; update: (now: number) => void;
} {
  const lines: { kind: string; text: string }[] = [];
  const dyn = new DynTex(640, 400, (ctx, w, h) => {
    // רקע מסך
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(0, 0, w, h);
    // כותרת
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(0, 0, w, 44);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = agentColor; ctx.font = "600 22px 'Heebo',system-ui,sans-serif";
    ctx.fillText(`${agentName} · צג עבודה`, w - 16, 22);
    ctx.fillStyle = 'rgba(120,255,190,0.75)';
    ctx.font = "500 18px ui-monospace,monospace";
    ctx.textAlign = 'left';
    ctx.fillText('● LIVE', 16, 22);
    // שורות
    const visible = lines.slice(-13);
    ctx.textAlign = 'right'; ctx.direction = 'rtl';
    visible.forEach((l, i) => {
      const y = 74 + i * 24;
      const kindCol =
        l.kind === 'tool' ? '#54d8c0' :
        l.kind === 'result' ? '#9be37a' :
        l.kind === 'error' ? '#ff7a7a' :
        l.kind === 'report' ? '#d9a1ff' :
        l.kind === 'say' ? '#ffd27a' : '#c9ccd4';
      ctx.fillStyle = kindCol;
      ctx.font = `500 19px ui-monospace,'Heebo',monospace`;
      const txt = l.text.length > 52 ? '…' + l.text.slice(-51) : l.text;
      ctx.fillText(txt, w - 16, y);
    });
    // סריקה CRT עדינה
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    // נצנוץ גלוני
    const sg = ctx.createLinearGradient(0, 0, w, h);
    sg.addColorStop(0, 'rgba(255,255,255,0.05)'); sg.addColorStop(0.5, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
  });
  return {
    tex: dyn.tex,
    setLogs: (ls) => {
      let changed = ls.length !== lines.length;
      if (!changed) for (let i = 0; i < ls.length; i++) if (ls[i] !== lines[i]) { changed = true; break; }
      if (!changed) return;
      lines.length = 0; lines.push(...ls);
      dyn.markDirty();
    },
    update: (now) => dyn.update(now),
  };
}

/** שלט שם מעל שולחן — שם, תפקיד, שורת פעילות ונקודת מצב חיה */
export function makeNameplate(
  name: string, title: string, color: string,
): { tex: THREE.CanvasTexture; set: (activity: string, stateCol: string) => void; update: (now: number) => void } {
  let activity = '';
  let stateCol = '#71717a';
  const dyn = new DynTex(512, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // גוף שלט
    ctx.fillStyle = 'rgba(12,12,14,0.88)';
    roundRect(ctx, 6, 6, w - 12, h - 12, 18); ctx.fill();
    // פס צבע
    ctx.fillStyle = color;
    roundRect(ctx, 6, 6, 14, h - 12, 7); ctx.fill();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4f2ee'; ctx.font = "700 44px 'Heebo',system-ui,sans-serif";
    ctx.fillText(name, w - 92, 44);
    ctx.fillStyle = color; ctx.font = "500 27px 'Heebo',system-ui,sans-serif";
    ctx.fillText(title, w - 92, 88);
    ctx.fillStyle = 'rgba(210,208,202,0.85)'; ctx.font = "400 24px 'Heebo',system-ui,sans-serif";
    const act = activity.length > 30 ? activity.slice(0, 29) + '…' : activity;
    ctx.fillText(act || '—', w - 92, 128);
    // נקודת מצב
    ctx.fillStyle = stateCol;
    ctx.shadowColor = stateCol; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(w - 44, 44, 10, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  });
  return {
    tex: dyn.tex,
    set: (a, sc) => { if (a !== activity || sc !== stateCol) { activity = a; stateCol = sc; dyn.markDirty(); } },
    update: (now) => dyn.update(now),
  };
}

/** בועת דיבור מעל סוכן */
export function makeBubbleTexture(): { tex: THREE.CanvasTexture; set: (text: string) => void; update: (now: number) => void } {
  let text = '';
  const dyn = new DynTex(640, 180, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    if (!text) return;
    ctx.fillStyle = 'rgba(18,17,20,0.94)';
    // בועה + זנב
    roundRect(ctx, 8, 8, w - 16, h - 44, 20); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 16, h - 40); ctx.lineTo(w / 2 + 18, h - 40); ctx.lineTo(w / 2 - 2, h - 6);
    ctx.closePath(); ctx.fill();
    ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2efe9'; ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
    wrapText(ctx, text, w / 2, h / 2 - 8, w - 60, 36, 2);
  });
  return { tex: dyn.tex, set: (t) => { if (t !== text) { text = t; dyn.markDirty(); } }, update: (now) => dyn.update(now) };
}

/** לוח המשימות הפיזי — קנבן 4 עמודות (מתוכנן → בעבודה → בביקורת → הושלם) */
export function makeTaskWallTexture(): { tex: THREE.CanvasTexture; set: (tasks: { id: string; title: string; status: string; assignee?: string; color?: string }[]) => void; update: (now: number) => void } {
  let tasks: { id: string; title: string; status: string; assignee?: string; color?: string }[] = [];
  const COLS: [string, string, string][] = [
    ['todo', 'מתוכנן', '#9aa0a8'],
    ['doing', 'בעבודה', '#d946ef'],
    ['review', 'בביקורת', '#fbbf24'],
    ['done', 'הושלם', '#34d399'],
  ];
  const dyn = new DynTex(1600, 860, (ctx, w, h) => {
    // לוח שעם כהה
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4a3a2a'); g.addColorStop(1, '#3c2f22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // גרגר שעם
    for (let i = 0; i < 2600; i++) {
      const a = Math.random() * 0.05;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,220,160,${a})` : `rgba(0,0,0,${a})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2);
    }
    // חוק ה-RTL: הקנבן נקרא ימין→שמאל — העמודה הראשונה (מתוכנן) בצד ימין.
    // מראת אינדקס העמודה: x0 = (COLS.length-1-ci)*cw — בדיוק כחוק לוח-המשימות
    // שתוקן במשרד הדו-ממדי (הזרימה ימין→שמאל, לעולם לא שמאל→ימין).
    const cw = w / 4;
    COLS.forEach(([key, label, col], ci) => {
      const x0 = (COLS.length - 1 - ci) * cw;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x0 + 8, 74, cw - 16, h - 88);
      ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = col; ctx.font = "700 34px 'Heebo',system-ui,sans-serif";
      ctx.fillText(label, x0 + cw / 2, 40);
      ctx.fillRect(x0 + cw / 2 - 44, 62, 88, 3);
      // כרטיסים
      const cards = tasks.filter((t) => t.status === key).slice(0, 6);
      cards.forEach((t, i) => {
        const cy = 92 + i * 126;
        const cx = x0 + 18, cwid = cw - 36;
        ctx.fillStyle = 'rgba(245,240,230,0.96)';
        roundRect(ctx, cx, cy, cwid, 108, 10); ctx.fill();
        // פס מקצה בצבע המקבל
        ctx.fillStyle = t.color || col;
        roundRect(ctx, cx, cy, 10, 108, 5); ctx.fill();
        ctx.direction = 'rtl'; ctx.textAlign = 'right';
        ctx.fillStyle = '#26221c'; ctx.font = "600 25px 'Heebo',system-ui,sans-serif";
        const tt = t.title.length > 26 ? t.title.slice(0, 25) + '…' : t.title;
        ctx.fillText(tt, cx + cwid - 22, cy + 34);
        ctx.fillStyle = '#6b6459'; ctx.font = "500 21px 'Heebo',system-ui,sans-serif";
        ctx.fillText(t.assignee || '', cx + cwid - 22, cy + 74);
      });
    });
  });
  return {
    tex: dyn.tex,
    set: (ts) => {
      const sig = ts.map((t) => t.id + t.status + (t.assignee || '')).join('|');
      if (sig !== tasks.map((t) => t.id + t.status + (t.assignee || '')).join('|')) { tasks = ts; dyn.markDirty(); }
    },
    update: (now) => dyn.update(now),
  };
}

/** קיר הגיט — זרם קומיטים חי על מסך ענק */
export function makeGitWireTexture(): { tex: THREE.CanvasTexture; set: (commits: { hash: string; subject: string; author: string; ts: number }[]) => void; update: (now: number) => void } {
  let commits: { hash: string; subject: string; author: string; ts: number }[] = [];
  let clock = 0;
  const dyn = new DynTex(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#0a0d0a'; ctx.fillRect(0, 0, w, h);
    // רשת רקע
    ctx.strokeStyle = 'rgba(120,200,150,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8fe3ae'; ctx.font = "700 40px 'Heebo',system-ui,sans-serif";
    ctx.fillText('קיר הגיט · זרם הקומיטים של ספרי הצי', w - 28, 46);
    ctx.fillStyle = 'rgba(140,230,170,0.6)'; ctx.font = "500 24px ui-monospace,monospace";
    ctx.textAlign = 'left';
    ctx.fillText(clock > 0.5 ? '● streaming' : '○ streaming', 28, 46);
    const list = commits.slice(0, 12);
    list.forEach((c, i) => {
      const y = 120 + i * 46;
      ctx.textAlign = 'left'; ctx.direction = 'ltr';
      ctx.fillStyle = 'rgba(143,227,174,0.75)'; ctx.font = "500 24px ui-monospace,monospace";
      ctx.fillText(c.hash.slice(0, 7), 28, y);
      ctx.fillStyle = 'rgba(220,225,218,0.85)'; ctx.font = "500 26px 'Heebo',system-ui,sans-serif";
      const subj = c.subject.length > 46 ? c.subject.slice(0, 45) + '…' : c.subject;
      ctx.fillText(subj, 150, y);
      ctx.fillStyle = 'rgba(140,146,150,0.6)'; ctx.font = "400 22px 'Heebo',system-ui,sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText(c.author, w - 28, y);
    });
    if (!list.length) {
      ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.fillStyle = 'rgba(150,155,150,0.5)'; ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
      ctx.fillText('ממתין לזרם…', w / 2, h / 2);
    }
  });
  return {
    tex: dyn.tex,
    set: (cs) => { commits = cs; dyn.markDirty(); },
    update: (now) => { clock = (now / 700) % 2; dyn.update(now); },
  };
}

/** מסך לוח שנה/מדדים בקבלה */
export function makeReceptionScreen(): { tex: THREE.CanvasTexture; set: (s: { mode: string; provider: string; ops: number; goal?: string }) => void; update: (now: number) => void } {
  let info: { mode: string; provider: string; ops: number; goal?: string } = { mode: '…', provider: '…', ops: 0, goal: '' };
  const dyn = new DynTex(560, 380, (ctx, w, h) => {
    ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, w, h);
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#54d8c0'; ctx.font = "700 34px 'Heebo',system-ui,sans-serif";
    ctx.fillText('מצב המפקדה', w - 24, 44);
    ctx.fillStyle = info.mode.startsWith('live') ? '#34d399' : '#fbbf24';
    ctx.font = "700 30px 'Heebo',system-ui,sans-serif";
    ctx.fillText(info.mode, w - 24, 100);
    ctx.fillStyle = 'rgba(220,222,218,0.85)'; ctx.font = "500 26px 'Heebo',system-ui,sans-serif";
    ctx.fillText(`מוח: ${info.provider}`, w - 24, 154);
    ctx.fillText(`פעולות: ${info.ops}`, w - 24, 198);
    ctx.fillStyle = 'rgba(190,192,188,0.9)'; ctx.font = "400 24px 'Heebo',system-ui,sans-serif";
    wrapText(ctx, info.goal || '—', w - 24, 268, w - 48, 34, 3);
  });
  return { tex: dyn.tex, set: (s) => { info = s; dyn.markDirty(); }, update: (now) => dyn.update(now) };
}

// ─────────────── utils ───────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) break; }
    else cur = test;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}
