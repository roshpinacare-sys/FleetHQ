/**
 * contract.ts — the office plan canon.
 * ------------------------------------------------------------------
 * תוכנית הרצפה: PLAN_W=1600 × PLAN_H=1000 יחידות, y גדל דרומה (הכניסה בדרום).
 * עולם 3D במטרים: x3 = (x - W/2)·S · z3 = (y - H/2)·S · y3 = גובה מהרצפה.
 * קנה מידה S=0.0125 → אולם 20מ' × 12.5מ', תקרה 3.6מ'.
 * כל הפיזיקה רצה ביחידות התוכנית; הרינדור במטרים דרך to3().
 *
 * מפת המשרד (מבט על, צפון למעלה) — חוק ה-RTL: הקריאה נכנסת מימין (מזרח):
 *   צפון: קיר הגיט (מערב) · לוח המשימות (מרכז) · הספרייה (מזרח)
 *   מרכז: להבת הריבונות + קשת שולחנות הצוות · שולחן ראש-המטה (מזרח) · דוכן ההחלטות (מערב)
 *   דרום: קבלה + דלתות זכות · בר קפה (מזרח) · צמחייה
 */

import type { Station } from './protocol';

// ─────────────── מידות בסיס ───────────────
export const PLAN_W = 1600;
export const PLAN_H = 1000;
export const SCALE = 0.0125;
export const WALL_H = 3.6;
export const WALL_T = 0.24; // עובי קיר חיצוני (מ')

/** המרת נקודת תוכנית (x,y) לעולם 3D [x, z] */
export function to3(x: number, y: number): [number, number] {
  return [(x - PLAN_W / 2) * SCALE, (y - PLAN_H / 2) * SCALE];
}
/** המרה חזרה (x,z) במטרים → תוכנית */
export function to2(x3: number, z3: number): [number, number] {
  return [x3 / SCALE + PLAN_W / 2, z3 / SCALE + PLAN_H / 2];
}

export const WALK_SPEED = 2.1; // מ'/שנ'
export const SPRINT_SPEED = 3.6;
export const PLAYER_R = 0.34; // רדיוס שחקן במטרים

// ─────────────── עוגני תחנות (יחידות תוכנית) ───────────────
export interface DeskSpot {
  /** מיקום השולחן */
  x: number; y: number;
  /** כיוון פני היושב — רדיאנים (0 = פנים לדרום +z, חיובי נגד כיוון השעון) */
  face: number;
  /** מיקום כיסא (מחושב: מאחורי השולחן ביחס ל-face) */
  seat: [number, number];
}

/** יושבים סביב להבת הריבונות בקשת פתוחה דרומה — כל שולחן פונה למרכז */
function arcDesk(x: number, y: number, face: number): DeskSpot {
  // הכיסא 0.62 מ' "מאחורי" השולחן — בכיוון הפוך מ-face
  const bx = x - Math.sin(face) * 49.6; // 0.62מ' ביחידות תוכנית
  const by = y - Math.cos(face) * 49.6;
  return { x, y, face, seat: [bx, by] };
}

export const DESKS: Record<string, DeskSpot> = {
  gal:    arcDesk(1000, 505, -1.371),  // פונה ללהבה (מערב-דרום)
  erez:   arcDesk(800,  415,  0),      // פונה דרום — השולחן הראשי
  tamar:  arcDesk(600,  505,  1.371),
  shachar:arcDesk(955,  660, -2.212),  // פונה צפון-מערב ללהבה
  yarden: arcDesk(645,  660,  2.212),
};

/** שולחן ראש-המטה — שולחן עגול מזרחי (חוק RTL: ראשון מימין) */
export const LEAD_TABLE = { x: 1220, y: 560, r: 1.15 };
/** עמדת עמידה של אלוף מול לוח המשימות */
export const LEAD_WALL_SPOT: [number, number] = [860, 210];

export const FLAME: [number, number] = [800, 545];
export const RECEPTION: { x: number; y: number; face: number } = { x: 800, y: 882, face: 0 }; // פונה דרום (לכניסה)
export const PODIUM: { x: number; y: number; face: number } = { x: 310, y: 430, face: Math.PI / 2 }; // פונה מזרח (אל תוך המשרד)
export const LIBRARY_TABLE: [number, number] = [1170, 275];
export const COFFEE: { x: number; y: number } = { x: 1472, y: 780 };

/** לוח המשימות — קיר צפון מרכזי (יחידות תוכנית) */
export const TASK_WALL: { cx: number; cy: number; w: number; h: number } = { cx: 800, cy: 52, w: 460, h: 250 };
/** קיר הגיט — מסך ענק צפון-מערבי */
export const GIT_WALL: { cx: number; cy: number; w: number; h: number } = { cx: 310, cy: 52, w: 380, h: 210 };
/** ספרייה — מדפים לאורך קיר צפון-מזרח (חוק RTL: הספרייה מזרח) */
export const SHELVES: { x: number; y: number; rot: number; len: number }[] = [
  { x: 1390, y: 120, rot: 0, len: 300 },  // לאורך הקיר הצפוני
  { x: 1390, y: 330, rot: 0, len: 300 },
  { x: 1538, y: 430, rot: Math.PI / 2, len: 240 }, // לאורך הקיר המזרחי
];
export const BOOK_SHELF_POS = to3(1390, 120);

/** כניסה — דלתות זכות בדרום */
export const ENTRANCE: [number, number] = [800, 995];
export const SPAWN: { x: number; y: number; face: number } = { x: 600, y: 780, face: Math.PI }; // מערבית לדלפק הקבלה על רצפה פנויה — לדלפק אין זכות-וטו על המצלמה

// ─────────────── מתקני תאורה (מטרים, מרחב 3D) ───────────────
/** נברשות מעל שולחנות הצוות + להבה */
export const PENDANTS: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (const d of Object.values(DESKS)) {
    const [x, z] = to3(d.x, d.y);
    out.push([x, z, 2.55]);
  }
  const [fx, fz] = to3(FLAME[0], FLAME[1]);
  out.push([fx, fz, 2.85]);
  return out;
})();

/** כתוביות ניאון — [x, z, גובה, רוחב, טקסט, צבע, rotY] */
export const NEON_SIGNS: { pos: [number, number, number]; w: number; text: string; sub?: string; color: string; rotY: number }[] = [
  { pos: [...to3(800, 18), 2.9], w: 3.4, text: 'מפקדת הצי', sub: 'FLEET HQ', color: '#ffb054', rotY: 0 },
  { pos: [...to3(800, 984), 2.75], w: 2.6, text: 'FLEET HQ', sub: 'משרד ריבוני · סוכני AI', color: '#54d8c0', rotY: Math.PI },
  { pos: [...to3(310, 320), 2.5], w: 1.9, text: 'דוכן ההחלטות', color: '#e07b54', rotY: Math.PI / 2 },
  { pos: [...to3(1450, 560), 2.6], w: 1.7, text: 'הספרייה', color: '#a78bfa', rotY: -Math.PI / 2 },
];

// ─────────────── התנגשויות (מלבנים ביחידות תוכנית) ───────────────
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** שולחן עבודה: 1.5מ' × 0.72מ' = 120×58 יחידות, מסובב לפי face — נפשט למלבן מיושר-צירים עוטף */
function deskRect(d: DeskSpot): Rect {
  const R = 62;
  return { x0: d.x - R, y0: d.y - R * 0.55, x1: d.x + R, y1: d.y + R * 0.55 };
}

export const COLLIDERS: Rect[] = (() => {
  const cs: Rect[] = [];
  // קירות חיצוניים: עובי 24 יח'
  cs.push({ x0: -30, y0: -30, x1: PLAN_W + 30, y1: 0 });        // צפון
  cs.push({ x0: -30, y0: PLAN_H, x1: PLAN_W + 30, y1: PLAN_H + 30 }); // דרום
  cs.push({ x0: -30, y0: -30, x1: 0, y1: PLAN_H + 30 });        // מערב
  cs.push({ x0: PLAN_W, y0: -30, x1: PLAN_W + 30, y1: PLAN_H + 30 }); // מזרח
  // שולחנות
  for (const d of Object.values(DESKS)) cs.push(deskRect(d));
  // שולחן עגול ראש-המטה (עוטף)
  cs.push({ x0: LEAD_TABLE.x - 105, y0: LEAD_TABLE.y - 105, x1: LEAD_TABLE.x + 105, y1: LEAD_TABLE.y + 105 });
  // דוכן קבלה
  cs.push({ x0: RECEPTION.x - 150, y0: RECEPTION.y - 45, x1: RECEPTION.x + 150, y1: RECEPTION.y + 45 });
  // דוכן ההחלטות
  cs.push({ x0: PODIUM.x - 55, y0: PODIUM.y - 55, x1: PODIUM.x + 55, y1: PODIUM.y + 55 });
  // שולחן קריאה
  cs.push({ x0: LIBRARY_TABLE[0] - 80, y0: LIBRARY_TABLE[1] - 55, x1: LIBRARY_TABLE[0] + 80, y1: LIBRARY_TABLE[1] + 55 });
  // מדפי ספרייה
  for (const s of SHELVES) {
    const t = 30;
    if (s.rot === 0) cs.push({ x0: s.x - s.len / 2, y0: s.y - t, x1: s.x + s.len / 2, y1: s.y + t });
    else cs.push({ x0: s.x - t, y0: s.y - s.len / 2, x1: s.x + t, y1: s.y + s.len / 2 });
  }
  // בר קפה
  cs.push({ x0: COFFEE.x - 60, y0: COFFEE.y - 210, x1: COFFEE.x + 60, y1: COFFEE.y + 30 });
  // צמחים בפינות
  cs.push({ x0: 40, y0: 940, x1: 120, y1: PLAN_H });
  cs.push({ x0: PLAN_W - 120, y0: 940, x1: PLAN_W - 40, y1: PLAN_H });
  return cs;
})();

/** פתרון התנגשות עיגול-מלבן — מחזיר מיקום מתוקן */
export function resolveCircle(x: number, y: number, r: number): { x: number; y: number } {
  let nx = x, ny = y;
  for (const c of COLLIDERS) {
    const cx = Math.max(c.x0, Math.min(nx, c.x1));
    const cy = Math.max(c.y0, Math.min(ny, c.y1));
    const dx = nx - cx, dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (r - d) / d;
      nx += dx * push;
      ny += dy * push;
    }
  }
  return { x: nx, y: ny };
}

// ─────────────── נקודות אינטראקציה ───────────────
export type InteractKind = 'desk' | 'wall' | 'podium' | 'library' | 'git' | 'reception' | 'flame' | 'coffee' | 'lead';

export interface Interactable {
  id: string;
  kind: InteractKind;
  /** מרכז התחנה בתוכנית */
  x: number; y: number;
  /** רדיוס הפעלה במטרים */
  r: number;
  station?: Station;
  agentId?: string;
}

export const INTERACTABLES: Interactable[] = [
  ...Object.entries(DESKS).map(([id, d]) => ({ id: `desk:${id}`, kind: 'desk' as const, x: d.x, y: d.y, r: 1.55, station: 'desk' as Station, agentId: id })),
  { id: 'wall', kind: 'wall', x: TASK_WALL.cx, y: TASK_WALL.cy + 90, r: 3.1, station: 'wall' as Station },
  { id: 'podium', kind: 'podium', x: PODIUM.x, y: PODIUM.y, r: 2.4, station: 'podium' as Station },
  { id: 'library', kind: 'library', x: LIBRARY_TABLE[0], y: LIBRARY_TABLE[1], r: 2.4, station: 'library' as Station },
  { id: 'git', kind: 'git', x: GIT_WALL.cx, y: GIT_WALL.cy + 90, r: 3.0 },
  { id: 'reception', kind: 'reception', x: RECEPTION.x, y: RECEPTION.y + 80, r: 1.8 },
  { id: 'flame', kind: 'flame', x: FLAME[0], y: FLAME[1], r: 1.9 },
  { id: 'lead', kind: 'lead', x: LEAD_TABLE.x, y: LEAD_TABLE.y, r: 1.9, agentId: 'aluf' },
];

/** תחנת ניווט לכל סוג station — קואורדינטת-X במפה (אליה הולך סוכן כשהוא נקרא) */
export const STATION_NAV: Record<Station, number> = {
  desk: DESKS.erez.x, // לא בשימוש ישיר — כל סוכן הולך לשולחן שלו
  wall: TASK_WALL.cx, podium: PODIUM.x + 140, library: LIBRARY_TABLE[0], offstage: FLAME[0],
};

/** הגדרות מיקוד מצלמה לפי סוג תחנה (מרחק, זווית) — כמו FOCUS_PRESETS בקזינו */
export const FOCUS_PRESETS: Record<string, { dist: number; pitch: number }> = {
  desk: { dist: 2.7, pitch: 0.42 },
  wall: { dist: 5.4, pitch: 0.34 },
  podium: { dist: 3.8, pitch: 0.4 },
  library: { dist: 3.6, pitch: 0.36 },
  git: { dist: 5.6, pitch: 0.3 },
  reception: { dist: 3.4, pitch: 0.38 },
  flame: { dist: 4.6, pitch: 0.3 },
  lead: { dist: 3.6, pitch: 0.42 },
};
