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
  // Task 9: one step deeper/warmer — the pale limestone washed out under
  // the flame lights (measured whiteout); deeper greige restores contrast.
  g.addColorStop(0, '#cfc8b7'); g.addColorStop(0.5, '#c3bcaa'); g.addColorStop(1, '#c9c2b0');
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

export class DynTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  painter: Painter;
  dirty = true;
  last = 0;
  minInterval: number;
  constructor(w: number, h: number, painter: Painter, minInterval = 200) {
    const [c, ctx] = makeCanvas(w, h);
    this.canvas = c; this.ctx = ctx; this.painter = painter;
    this.minInterval = minInterval;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    // Task 9 (measured live): mipmap regeneration on SwiftShader is pure CPU
    // cost for screen textures viewed head-on — killing it removes the
    // single most expensive part of every upload on weak machines.
    this.tex.generateMipmaps = false;
    this.tex.minFilter = THREE.LinearFilter;
    this.draw();
  }
  markDirty() { this.dirty = true; }
  /** מצויר לכל היותר פעם אחת כל minInterval (ברירת-מחדל 200ms) */
  update(now: number) {
    if (!this.dirty || now - this.last < this.minInterval) return;
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
/** זמן-יחסי עברי קצר — לכל הלוחות החיים */
export function relHe(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 45) return 'עכשיו';
  if (s < 3600) return `${Math.round(s / 60)} דק'`;
  if (s < 86400) return `${Math.floor(s / 3600)} שע'`;
  return `${Math.floor(s / 86400)} ימ'`;
}

/**
 * makeFleetWallTexture (Task 8) — לוח הצי החי: מסך-פיקוד חי במקום לוח-שעם קפוא.
 * מציג את הפעילות הענפה שלפני-המשרד, ישירות מהמקורות הנמדדים:
 * קצב-טעיפת-הכלכלה (tx/min · mwu/min) · מספר-הרצף החי · פילוח-מקורות
 * (rig/guard/git/offev) · מסילות-ה-beats עם ורדיקט אמיתי · טיקר-אירועים.
 * כנות-מלאה: pulse=null → מסך "ממתין לדופק" — לעולם לא מספרים מומצאים.
 */
export function makeFleetWallTexture(): {
  tex: THREE.CanvasTexture; set: (pulse: unknown, tick: number) => void; update: (now: number) => void;
} {
  interface Pulse {
    ts: number;
    econ: {
      seq: number | null; minted: number | null; lastSha16: string | null; lastAt: number | null;
      txPerMin: number | null; mwuPerMin: number | null; windowMin: number;
      kinds: { kind: string; count: number; mwu: number }[]; spark: number[];
      recent: { at: number; kind: string; venue: string; amount: number }[];
    } | null;
    services: { name: string; ok: boolean; ms: number }[];
    repos: { repo: string; hash: string; subject: string; at: number }[];
    lanes: { lane: string; at: number; ok: boolean; brief: string }[];
    pages: { ageMin: number | null };
  }
  let pulse: Pulse | null = null;
  let tick = 0;
  let lastSig = '';
  let lastTick = -999;
  let drawnOnce = false;
  const W = 1600, H = 860;
  const AMBER = '#ffb054', TEAL = '#54d8c0', OK = '#3ddc97', BAD = '#ff6b5e', DIM = 'rgba(158,178,198,0.85)';
  const mono = (px: number) => `${px}px ui-monospace,'JetBrains Mono',monospace`;
  const hef = (px: number, wgt = 500) => `${wgt} ${px}px 'Heebo',system-ui,sans-serif`;

  const dyn = new DynTex(W, H, (ctx, w, h) => {
    // רקע — מסך-פיקוד כהה
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b111a'); bg.addColorStop(1, '#0d1520');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // רשת עדינה
    ctx.strokeStyle = 'rgba(120,160,200,0.055)'; ctx.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (let gy = 0; gy < h; gy += 80) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    ctx.direction = 'rtl'; ctx.textBaseline = 'middle';

    const age = pulse ? relHe(pulse.ts) : '—';

    // ── כותרת ──
    ctx.fillStyle = AMBER; ctx.font = hef(44, 800);
    ctx.fillText('לוח הצי החי', w - 36, 54);
    ctx.fillStyle = DIM; ctx.font = hef(24);
    ctx.fillText(`FLEET PULSE · מקור: המכונה הריבונית`, w - 36, 104);
    // נקודת-חיים פועמת
    const beat = 0.55 + 0.45 * Math.sin((tick % 2) * Math.PI);
    ctx.fillStyle = pulse ? OK : BAD;
    ctx.beginPath(); ctx.arc(46, 54, 10 + 3 * beat, 0, 7); ctx.fill();
    ctx.fillStyle = pulse ? OK : BAD; ctx.font = hef(26, 600); ctx.textAlign = 'left';
    ctx.fillText(pulse ? `חי · ${age}` : 'ממתין לדופק', 70, 54);
    ctx.textAlign = 'right';

    if (!pulse || !pulse.econ) {
      ctx.fillStyle = DIM; ctx.font = hef(34); ctx.textAlign = 'center';
      ctx.fillText('אין דופק — הלוח כנה, לא ממציא', w / 2, h / 2);
      return;
    }
    const e = pulse.econ;

    // ── שורת KPI ──
    const kpis: [string, string, string][] = [
      ["עסקאות/דק'", e.txPerMin !== null ? String(e.txPerMin) : '—', "עבודה נמדדת · 5 דק'"],
      ["mwu/דק'", e.mwuPerMin !== null ? e.mwuPerMin.toLocaleString('he-IL') : '—', 'יחידות-עבודה'],
      ['רצף', e.seq !== null ? e.seq.toLocaleString('he-IL') : '—', 'פנקס-הכלכלה'],
      ['שירותים', `${pulse.services.filter((s) => s.ok).length}/${pulse.services.length}`, 'דופק-פורטים'],
    ];
    const kw = (w - 72) / 4;
    kpis.forEach(([label, val, sub], i) => {
      const x1 = w - 36 - i * (kw + 8) - kw; // RTL: הראשון מימין
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      roundRect(ctx, x1, 148, kw, 118, 14); ctx.fill();
      ctx.strokeStyle = 'rgba(255,176,84,0.18)'; ctx.lineWidth = 1.5;
      roundRect(ctx, x1, 148, kw, 118, 14); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = i === 2 ? TEAL : AMBER; ctx.font = mono(52);
      ctx.fillText(val, x1 + kw / 2, 196);
      ctx.fillStyle = '#dfe7f0'; ctx.font = hef(24, 700);
      ctx.fillText(label, x1 + kw / 2, 234);
      ctx.fillStyle = 'rgba(140,160,180,0.7)'; ctx.font = hef(17);
      ctx.fillText(sub, x1 + kw / 2, 256);
    });

    // ── ספארקליין — קצב 5 דק' (30 דגימות של 10שנ') ──
    const sx0 = 36, sw = w - 72, sy0 = 310, sh = 150;
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(ctx, sx0, sy0 - 34, sw, sh + 56, 12); ctx.fill();
    ctx.textAlign = 'right'; ctx.fillStyle = DIM; ctx.font = hef(22, 600);
    ctx.fillText('קצב-העבודה · 5 הדקות האחרונות (עסקאות ל-10שנ)', w - 52, sy0 - 8);
    const spark = e.spark ?? [];
    const mx = Math.max(1, ...spark);
    const pts: [number, number][] = spark.map((v, i) => [
      sx0 + (i / Math.max(1, spark.length - 1)) * sw,
      sy0 + sh - (v / mx) * (sh - 14) - 4,
    ]);
    // מילוי-שטח זוהר
    const grad = ctx.createLinearGradient(0, sy0, 0, sy0 + sh);
    grad.addColorStop(0, 'rgba(84,216,192,0.42)'); grad.addColorStop(1, 'rgba(84,216,192,0.02)');
    ctx.beginPath();
    pts.forEach(([px, py], i) => { if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.lineTo(sx0 + sw, sy0 + sh); ctx.lineTo(sx0, sy0 + sh); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
    // קו
    ctx.beginPath();
    pts.forEach(([px, py], i) => { if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.strokeStyle = TEAL; ctx.lineWidth = 3; ctx.stroke();
    // נקודה חיה בקצה
    if (pts.length) {
      const [lx, ly] = pts[pts.length - 1];
      ctx.fillStyle = TEAL; ctx.beginPath(); ctx.arc(lx, ly, 5 + 2.5 * beat, 0, 7); ctx.fill();
    }

    // ── פילוח-מקורות (bars RTL) ──
    const kinds = (e.kinds ?? []).slice(0, 5);
    const ky0 = sy0 + sh + 66;
    const maxK = Math.max(1, ...kinds.map((k) => k.count));
    const bw = w - 320;
    ctx.textAlign = 'right'; ctx.fillStyle = DIM; ctx.font = hef(22, 600);
    ctx.fillText("פילוח-מקורות · ספירה/5 דק'", w - 52, ky0 - 26);
    const KIND_COLS: Record<string, string> = {
      rig: '#54d8c0', guard: '#ffb054', git: '#a78bfa', offev: '#e07b54',
      fleet: '#7fd4ff', beat: '#f2b8d0', journal: '#c9d3a8', mesh: '#8fd0ff',
    };
    kinds.forEach((k, i) => {
      const y = ky0 + i * 34;
      const bl = (k.count / maxK) * bw;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, 280, y, bw, 22, 8); ctx.fill();
      ctx.fillStyle = KIND_COLS[k.kind] ?? TEAL;
      roundRect(ctx, 280 + bw - bl, y, Math.max(6, bl), 22, 8); ctx.fill();
      ctx.fillStyle = '#e6edf4'; ctx.font = hef(21, 700);
      ctx.fillText(`${k.kind}`, w - 52, y + 11);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(158,178,198,0.95)'; ctx.font = mono(18);
      ctx.fillText(`${k.count} · ${k.mwu.toLocaleString('he-IL')} mwu`, 292, y + 11);
      ctx.textAlign = 'right';
    });

    // ── מסילות-ה-beats ──
    const ly0 = ky0 + kinds.length * 34 + 26;
    ctx.textAlign = 'right'; ctx.fillStyle = DIM; ctx.font = hef(22, 600);
    ctx.fillText('מסילות-ההפעלה · local-beats', w - 52, ly0);
    const lanes = (pulse.lanes ?? []).slice(0, 8);
    const lw = (w - 88) / 4, lh = 62;
    lanes.forEach((l, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      const x1 = w - 44 - (col + 1) * lw - col * 6; // RTL
      const y1 = ly0 + 14 + row * (lh + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      roundRect(ctx, x1, y1, lw, lh, 10); ctx.fill();
      ctx.strokeStyle = l.ok ? 'rgba(61,220,151,0.35)' : 'rgba(255,107,94,0.45)';
      ctx.lineWidth = 1.4; roundRect(ctx, x1, y1, lw, lh, 10); ctx.stroke();
      ctx.fillStyle = l.ok ? OK : BAD;
      ctx.beginPath(); ctx.arc(x1 + lw - 20, y1 + 20, 6, 0, 7); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillStyle = '#e6edf4'; ctx.font = hef(21, 700);
      ctx.fillText(l.lane, x1 + lw - 36, y1 + 20);
      ctx.fillStyle = 'rgba(158,178,198,0.85)'; ctx.font = hef(17);
      ctx.fillText(relHe(l.at), x1 + lw - 36, y1 + 44);
      ctx.textAlign = 'left'; ctx.fillStyle = l.ok ? 'rgba(61,220,151,0.85)' : 'rgba(255,107,94,0.9)'; ctx.font = mono(16);
      ctx.fillText(l.ok ? 'OK' : 'FAIL', x1 + 14, y1 + 20);
    });

    // ── טיקר אירוע-אחרון ──
    const last = (e.recent ?? [])[0];
    ctx.fillStyle = 'rgba(255,176,84,0.10)';
    ctx.fillRect(0, h - 54, w, 54);
    ctx.strokeStyle = 'rgba(255,176,84,0.25)';
    ctx.beginPath(); ctx.moveTo(0, h - 54 + 0.5); ctx.lineTo(w, h - 54 + 0.5); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = AMBER; ctx.font = hef(23, 700);
    const txt = last ? `${last.kind} · ${last.venue} · ${last.amount} mwu` : 'אין אירועים';
    ctx.fillText(txt, w - 36, h - 26);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(158,178,198,0.8)'; ctx.font = mono(18);
    ctx.fillText(`sha16 ${e.lastSha16 ?? '—'}`, 36, h - 26);
  }, 3000); // Task 9: שלב-ציור מרוסן — הלוח הגדול לא מצייר יותר מדי-פעם ב-3שנ'

  return {
    tex: dyn.tex,
    set(p, t) {
      // Task 9 (measured live): this used to markDirty UNCONDITIONALLY on
      // every store tick (1s) — a 1600×860 canvas redraw + GPU upload + CPU
      // mipmap regeneration EVERY SECOND intermittently wedged the software
      // renderer (5.5MB/s churn). Redraw only on real data change; the
      // age/ticker rows live through update() at a calm cadence.
      const e = p as Pulse | null;
      // Task 9: seq/tx/mwu bucketed — the exact live numbers live in the DOM
      // HUD; a 1600×860 wall repaint per 4s poll (just because the counter
      // moved) was the last recurring 5-10s stall on software GL.
      const sig = e
        ? `${Math.floor((e.seq ?? 0) / 500)}|${Math.round(e.txPerMin ?? 0)}|${Math.round((e.mwuPerMin ?? 0) / 50)}|${e.lastSha16}|${e.services?.length ?? 0}|${e.lanes?.map((l) => `${l.lane}:${l.ok}`).join(',')}|${e.pages?.ageMin ?? ''}`
        : 'null';
      const changed = sig !== lastSig || t - lastTick >= 30;
      lastSig = sig;
      lastTick = t;
      pulse = p as Pulse | null;
      tick = t;
      if (changed || !drawnOnce) {
        drawnOnce = true;
        dyn.markDirty();
      }
    },
    update: (now) => dyn.update(now),
  };
}

export function makeReceptionScreen(): { tex: THREE.CanvasTexture; set: (s: { mode: string; provider: string; ops: number; goal?: string }) => void; update: (now: number) => void } {
  let info: { mode: string; provider: string; ops: number; goal?: string } = { mode: '…', provider: '…', ops: 0, goal: '' };
  let lastKey = '';
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
  // Task 9: dirty-on-change — this screen was re-uploaded every store tick (1s)
  return {
    tex: dyn.tex,
    set: (s) => {
      const key = `${s.mode}|${s.provider}|${s.ops}|${s.goal ?? ''}`;
      info = s;
      if (key !== lastKey) {
        lastKey = key;
        dyn.markDirty();
      }
    },
    update: (now) => dyn.update(now),
  };
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

// ─────────────── Task 53 — אמנות-קיר (השוואה מול office3d/v2) ───────────────
// מנדט-הבעלים: "עיצוב משרד פסיכדלי אבל אלגנטי — קירות כמו טריפ-LSD פעיל
// אבל בעצימות-נמוכה, אומנותי, לא בולט ומבלבל, עדין ואלגנטי, וכמה תמונות
// קקטוסים, קצת עיצוב מעצב-פנים". הכל קנבס-פרוצדורלי — אפס נכסי-רשת
// (אותה משמעת של כל-החדר), פלטת-עבר רכה ורווי-נמוך על נייר-חם.

/** נייר-אמנות חם עם דגן עדין — בסיס אחיד לכל-ההדפסים */
function artPaper(ctx: CanvasRenderingContext2D, w: number, h: number, seed = 7) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#f4efe3');
  g.addColorStop(0.55, '#efe8d8');
  g.addColorStop(1, '#f6f1e5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  let rnd = 987654321 ^ seed;
  const rand = () => { rnd = (Math.imul(rnd, 1103515245) + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
  ctx.globalAlpha = 0.045;
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#8a7f6a' : '#ffffff';
    ctx.fillRect(rand() * w, rand() * h, 1.7, 1.7);
  }
  ctx.globalAlpha = 1;
}

/** הדפס פסיכדלי-עדין (variants 0..3) — זרימות-משי בעבר-רך, רווי-נמוך,
 *  קונטרסט-שקט: "טריפ בעצימות-נמוכה" שנותן חיים לקיר בלי לגנוב-את-העין. */
export function makePsyArtTexture(variant = 0): THREE.CanvasTexture {
  const W = 512, H = 672;
  const [c, ctx] = makeCanvas(W, H);
  artPaper(ctx, W, H, variant * 31 + 5);
  // פלטת-עבר: רוז-אבק, סייג', חול-זהב, לילך-מעומעם, תכלת-אפרסק — כולם רכים
  // Task 53-fix (נמדד-במסך): הגרסה-הראשונה יצאה כמעט-לבנה מרחוק (אלפא 0.32-0.50
  // על נייר-קרם + תאורת-יום 2.7). כאן: אלפא 0.58-0.88 — "עדין-אך-נראה".
  const pal = [
    ['rgba(206,142,132,0.88)', 'rgba(128,160,142,0.78)', 'rgba(200,172,104,0.72)', 'rgba(156,136,180,0.68)', 'rgba(118,152,168,0.62)'],
    ['rgba(156,136,180,0.82)', 'rgba(206,142,132,0.74)', 'rgba(118,152,168,0.70)', 'rgba(128,160,142,0.64)', 'rgba(200,172,104,0.58)'],
    ['rgba(200,172,104,0.80)', 'rgba(118,152,168,0.76)', 'rgba(206,142,132,0.70)', 'rgba(156,136,180,0.64)', 'rgba(128,160,142,0.60)'],
    ['rgba(128,160,142,0.84)', 'rgba(200,172,104,0.74)', 'rgba(156,136,180,0.70)', 'rgba(206,142,132,0.64)', 'rgba(118,152,168,0.58)'],
  ][variant % 4];
  // גוף-הדפס: שטיפת-צבע רכה מאחורי-המוטיב (נותן להדפס "בשר" ולא קווים על נייר)
  const bodyWash = ctx.createRadialGradient(W * 0.5, H * 0.44, 40, W * 0.5, H * 0.5, W * 0.72);
  bodyWash.addColorStop(0, pal[variant % pal.length].replace(/0\.\d+\)$/, '0.30)'));
  bodyWash.addColorStop(1, 'rgba(244,239,227,0)');
  ctx.fillStyle = bodyWash;
  ctx.fillRect(0, 0, W, H);
  if (variant % 4 === 0 || variant % 4 === 2) {
    // זרימות-אופק — סרטי-משי חוצי-הדף עם סחיפת-פאזה
    const horiz = variant % 4 === 0;
    for (let i = 0; i < 26; i++) {
      const t = i / 26;
      ctx.beginPath();
      const amp = 26 + 16 * Math.sin(t * Math.PI);
      const base = horiz ? t * H : t * W;
      for (let s = 0; s <= 220; s++) {
        const u = s / 220;
        const w = 1 + 0.55 * Math.sin(u * 9.2 + i * 0.62) + 0.3 * Math.sin(u * 17.7 + i * 1.31);
        const x = horiz ? u * W : base + w * amp;
        const y = horiz ? base + w * amp : (1 - u) * H;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = pal[i % pal.length];
      ctx.lineWidth = 3.2 + 3.8 * Math.abs(Math.sin(i * 1.7));
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  } else if (variant % 4 === 1) {
    // פריחה-רדיאלית — עלי-כותרת קשתיים מלב-ההדפס
    const cx = W * 0.5, cy = H * 0.46;
    for (let ring = 0; ring < 5; ring++) {
      const r0 = 44 + ring * 52;
      const n = 10 + ring * 3;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2 + ring * 0.23;
        const a1 = a0 + (Math.PI * 2 / n) * 0.62;
        ctx.beginPath();
        ctx.arc(cx, cy, r0, a0, a1);
        ctx.arc(cx, cy, r0 * 0.55, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = pal[(ring + i) % pal.length];
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(244,239,227,0.92)';
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fill();
  } else {
    // היתוך-גלים — שדה-התאבכות רך (מוואות עדינות)
    for (let y = 0; y < H; y += 7) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const v = Math.sin(x * 0.016 + y * 0.045) + Math.sin(x * 0.031 - y * 0.021 + 2.1) + Math.sin(y * 0.017 + 4.2);
        const yy = y + v * 19;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = pal[Math.floor(y / 46) % pal.length];
      ctx.lineWidth = 3.4;
      ctx.stroke();
    }
  }
  // ויניטה עדינה — עומק אופטי של הדפס-אמיתי
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(60,50,36,0)');
  vig.addColorStop(1, 'rgba(60,50,36,0.14)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  // מסגרת-נייר פנימית עדינה (מרווח-מאונטינג)
  ctx.strokeStyle = 'rgba(120,106,84,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  return finish(c);
}

/** הדפס קקטוס (variants 0..2) — מינימליזם מדברי אלגנטי על נייר-חם */
export function makeCactusArtTexture(variant = 0): THREE.CanvasTexture {
  const W = 512, H = 672;
  const [c, ctx] = makeCanvas(W, H);
  artPaper(ctx, W, H, variant * 57 + 11);
  const green = '#5c7a54';
  const greenDark = '#46613f';
  if (variant % 3 === 0) {
    // סגוארו בשקיעת-חול — צללית מינימלית + דיסק-שמש
    const sky = ctx.createLinearGradient(0, 90, 0, H - 130);
    sky.addColorStop(0, 'rgba(226,196,150,0.55)');
    sky.addColorStop(1, 'rgba(214,164,156,0.34)');
    ctx.fillStyle = sky;
    ctx.fillRect(56, 90, W - 112, H - 240);
    ctx.fillStyle = 'rgba(240,232,210,0.95)';
    ctx.beginPath(); ctx.arc(W * 0.62, 200, 44, 0, 7); ctx.fill();
    ctx.fillStyle = greenDark;
    // גוף
    roundRect(ctx, W * 0.46, 190, 34, 330, 17); ctx.fill();
    // זרוע שמאל (זקופה-מעוקלת)
    roundRect(ctx, W * 0.46 - 52, 300, 30, 120, 15); ctx.fill();
    roundRect(ctx, W * 0.46 - 52, 268, 56, 30, 15); ctx.fill();
    // זרוע ימין נמוכה
    roundRect(ctx, W * 0.46 + 56, 350, 28, 96, 14); ctx.fill();
    roundRect(ctx, W * 0.46 + 34, 350, 50, 28, 14); ctx.fill();
    // קרקע
    ctx.fillStyle = 'rgba(120,106,84,0.5)';
    ctx.fillRect(56, H - 152, W - 112, 3);
    for (let i = 0; i < 5; i++) ctx.fillRect(90 + i * 74, H - 150, 20 + (i % 3) * 12, 2.4);
  } else if (variant % 3 === 1) {
    // קקטוס-סיר בקו-אמן — אגס-קוצים בסיר טרהקוטה
    const cx = W * 0.5;
    ctx.strokeStyle = 'rgba(96,84,64,0.75)';
    ctx.lineWidth = 3.4;
    // סיר
    ctx.beginPath();
    ctx.moveTo(cx - 74, H - 250); ctx.lineTo(cx + 74, H - 250);
    ctx.lineTo(cx + 58, H - 140); ctx.lineTo(cx - 58, H - 140);
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(190,124,92,0.6)';
    ctx.fill();
    // אדן-סיר
    ctx.strokeRect(cx - 84, H - 268, 168, 20);
    // כרית-מצע
    ctx.fillStyle = 'rgba(110,92,66,0.55)';
    ctx.fillRect(cx - 70, H - 272, 140, 8);
    // אגס-קוצים — כרי-דשא מעוגלים
    const pads: [number, number, number, number][] = [
      [cx, H - 330, 64, 84], [cx - 74, H - 392, 52, 66], [cx + 70, H - 420, 50, 62], [cx - 20, H - 486, 44, 56],
    ];
    for (const [px, py, pw, ph] of pads) {
      ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, 7);
      ctx.fillStyle = green; ctx.fill();
      ctx.strokeStyle = 'rgba(70,97,63,0.8)'; ctx.lineWidth = 2.6; ctx.stroke();
    }
    // קוצים עדינים
    ctx.strokeStyle = 'rgba(246,242,228,0.85)'; ctx.lineWidth = 1.6;
    for (const [px, py, pw, ph] of pads) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + px;
        const x0 = px + Math.cos(a) * (pw / 2 - 7), y0 = py + Math.sin(a) * (ph / 2 - 7);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * 7, y0 + Math.sin(a) * 7); ctx.stroke();
      }
    }
  } else {
    // קקטוס-חבית גיאומטרי — צלעות-מניפה + כתר-פרח
    const cx = W * 0.5, cy = H * 0.52;
    ctx.fillStyle = green;
    ctx.beginPath(); ctx.ellipse(cx, cy, 108, 148, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(70,97,63,0.75)'; ctx.lineWidth = 2.8;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + i * 21, cy, 14, 148 * Math.cos((i / 5.2) * (Math.PI / 2)) * 0.96, 0, 0, 7);
      ctx.stroke();
    }
    // כתר
    ctx.fillStyle = 'rgba(214,164,156,0.9)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 24, cy - 138 + Math.sin(a) * 10, 8.5, 0, 7); ctx.fill();
    }
    // קוצי-צלע
    ctx.strokeStyle = 'rgba(246,242,228,0.8)'; ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i++) {
      for (let j = 0; j < 6; j++) {
        const yy = cy - 120 + j * 48;
        const xx = cx + i * 21;
        if (Math.abs(i * 21) < 108 * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / 148, 2))) - 10) {
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 4.5, yy - 4.5); ctx.stroke();
        }
      }
    }
    // קרקע
    ctx.fillStyle = 'rgba(120,106,84,0.5)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 172, 130, 12, 0, 0, 7); ctx.fill();
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(60,50,36,0)');
  vig.addColorStop(1, 'rgba(60,50,36,0.14)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(120,106,84,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  return finish(c);
}
