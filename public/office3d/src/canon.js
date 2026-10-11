/**
 * canon.js — תוכנית הרצפה של מפקדת הצי (תואם contract.ts של FleetHQ).
 * PLAN_W=1600 × PLAN_H=1000 יחידות, SCALE=0.0125 → אולם 20מ' × 12.5מ', תקרה 3.6מ'.
 * צירים: x מזרח(+)/מערב(-), z דרום(+)/צפון(-). הכניסה מדרום, חוק RTL.
 */

export const PLAN_W = 1600;
export const PLAN_H = 1000;
export const SCALE = 0.0125;
export const WALL_H = 3.6;
export const WALL_T = 0.24;

export const ROOM_W = PLAN_W * SCALE; // 20m
export const ROOM_D = PLAN_H * SCALE; // 12.5m

/** נקודת תוכנית (x,y) → עולם [x, z] במטרים */
export function to3(x, y) {
  return [(x - PLAN_W / 2) * SCALE, (y - PLAN_H / 2) * SCALE];
}

// ───── תחנות (יחידות תוכנית → עולם) ─────
export const FLAME = to3(800, 545);
export const PODIUM = (() => {
  const [x, z] = to3(310, 430);
  return { x, z, face: Math.PI / 2 }; // פונה מזרח — אל תוך המשרד
})();
export const TASK_WALL = (() => {
  const [x, z] = to3(800, 30);
  return { x, z, w: 256 * SCALE, h: 136 * SCALE, cy: 1.62 };
})();
export const GIT_WALL = (() => {
  const [x, z] = to3(310, 52);
  return { x, z, w: 380 * SCALE, h: 210 * SCALE, cy: 1.75 };
})();
export const LEAD_TABLE = (() => {
  const [x, z] = to3(1220, 560);
  return { x, z, r: 1.15 };
})();
export const LIBRARY = {
  table: to3(1170, 275),
  shelf: to3(1330, 130), // מדף צפון-מזרחי
};
export const COFFEE = to3(1472, 780);
export const RECEPTION = (() => {
  const [x, z] = to3(800, 882);
  return { x, z, face: 0 };
})();

/** שולחנות הקשת — כל אחד פונה ללהבת הריבונות */
export const DESKS = {
  gal: desk(1000, 505, -1.371),
  erez: desk(800, 415, 0),
  tamar: desk(600, 505, 1.371),
  shachar: desk(955, 660, -2.212),
  yarden: desk(645, 660, 2.212),
};

function desk(x, y, face) {
  const [wx, wz] = to3(x, y);
  return {
    x: wx, z: wz, face,
    seat: to3(x - Math.sin(face) * 49.6, y - Math.cos(face) * 49.6),
  };
}

// ───── הצוות (canon — זהה ל-CREW_FALLBACK של FleetHQ) ─────
export const CREW = [
  { id: 'aluf', he: 'אלוף', en: 'Aluf', role: 'ראש-המטה', roleEn: 'Chief of staff', color: '#E0973F', desk: null, lead: true },
  { id: 'gal', he: 'גל', en: 'Gal', role: 'מפעיל שוק', roleEn: 'Market operator', color: '#3BA08F', desk: 'gal', books: ['dex-book', 'fills-ledger'] },
  { id: 'erez', he: 'ארז', en: 'Erez', role: 'מבקר פנים', roleEn: 'Internal auditor', color: '#C9A227', desk: 'erez', books: ['claims-audit'] },
  { id: 'tamar', he: 'תמר', en: 'Tamar', role: 'כלכלנית הצי', roleEn: 'Fleet economist', color: '#7BA05B', desk: 'tamar', books: ['econ-book'] },
  { id: 'shachar', he: 'שחר', en: 'Shachar', role: 'קצין מודיעין', roleEn: 'Intelligence officer', color: '#C76B4A', desk: 'shachar', books: ['fleet-indicators'] },
  { id: 'yarden', he: 'ירדן', en: 'Yarden', role: 'מהנדס תשתיות', roleEn: 'Infrastructure eng.', color: '#6E8FA8', desk: 'yarden', books: ['registry', 'coord-bus'] },
];

export const DESK_IDS = ['gal', 'erez', 'tamar', 'shachar', 'yarden'];

/** נקודת עמידה מול לוח-המשימות לראש-המטה */
export const LEAD_WALL_SPOT = to3(860, 168);

/** מרכז הקשת — מקום מפגש */
export const ARC_CENTER = to3(800, 560);

/** זוגות נקודות מפגש-שיחה (עומדים פונים זה לזה) */
export const CHAT_SPOTS = [
  [to3(700, 620), to3(760, 680)],
  [to3(880, 640), to3(940, 700)],
  [to3(680, 420), to3(740, 360)],
  [to3(900, 400), to3(960, 350)],
];

// ───── הגדרות יום ─────
export const SKY_TOP = '#8fbcd8';
export const SKY_BOTTOM = '#ece4cf';
export const SUN_COLOR = '#ffedd2';
export const FOG_COLOR = '#e6dfcf';
