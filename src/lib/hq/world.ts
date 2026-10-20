/**
 * world.ts — מנוע העולם של המשרד.
 * ------------------------------------------------------------------
 * · סוכנים: מוח ניווט — כל AgentView של הפורמן מתורגם ליעד תנועה אמיתי
 *   (שולחן משלו / לוח / דוכן החלטות / ספרייה), הליכה חלקה, ישיבה ועבודה.
 * · חוזה מצב→תנועה: AGENT_VISUAL — מיפוי דטרמיניסטי מ-AgentState של הפורמן
 *   לתנוחה/אנימציה. אין כאן המצאת פעילות: מה שהפורמן לא מדווח — לא מוצג.
 * · director: מצב המצלמה המקצועית (נקודות תצפית + מיקוד) — אין שחקן,
 *   אין WASD, אין ג'ויסטיק, אין ריצה.
 * · bus: מיני-אוטובוס אירועים בין סרגל-החדר לסצנה (מיקוד מצלמה).
 */
import {
  PLAN_W, PLAN_H, SCALE,
  DESKS, LEAD_TABLE, TASK_WALL, PODIUM, LIBRARY_TABLE, FLAME, COFFEE,
  resolveCircle,
} from './contract';
import type { AgentState, Station } from './protocol';

// ─────────────── אוטובוס אירועים ───────────────
type BusEvents = {
  focus: { target: { x: number; y: number } | null; kind?: string; id?: string };
};

class MiniBus {
  private map = new Map<string, Set<(p: never) => void>>();
  on<K extends keyof BusEvents>(k: K, fn: (p: BusEvents[K]) => void): () => void {
    let s = this.map.get(k);
    if (!s) { s = new Set(); this.map.set(k, s); }
    s.add(fn as (p: never) => void);
    return () => { s!.delete(fn as (p: never) => void); };
  }
  emit<K extends keyof BusEvents>(k: K, p: BusEvents[K]) {
    this.map.get(k)?.forEach((fn) => { try { fn(p as never); } catch { /* isolated */ } });
  }
}
export const bus = new MiniBus();

// ─────────────── מצב המצלמה (במאי) ───────────────
export type PresetId = 'overview' | 'crew' | 'wall' | 'git' | 'podium' | 'library' | 'reception';

/** מצב המצלמה היחיד בחדר — נקרא ונכתב על-ידי CameraDirector וסרגל-התצפית */
export const director = {
  /** נקודת התצפית הנבחרת */
  preset: 'overview' as PresetId,
  /** מיקוד ישות (גובר על נקודת התצפית עד Esc/בחירה חדשה) — קואורדינטות עולם */
  focus: null as null | { x: number; z: number; kind: string; id?: string },
  /** העדפת מערכת: תנועה מופחתת → מעברי מצלמה מיידיים */
  reducedMotion: false,
  /** Task 11-a — סיור-מודרך (חי ב-FleetHQ — הושב במיזוג T18): המצלמה גולשת
   *  בעדינות בין התחנות (stations → podium → wall → library), עם הקפה-סרק
   *  בין-המעברים. כל קלט מהמשתמש מחזיר שליטה מיידית (מבטל את הסיור).
   *  false = שליטה ידנית בלבד. */
  tour: false,
};

// ─────────────── חוזה מצב→תנועה (דטרמיניסטי) ───────────────
/**
 * המיפוי היחיד ממצב סוכן אמיתי (AgentState של הפורמן) לייצוג חזותי.
 * · pose: ישיבה רק כשהסוכן בשולחנו ולא בדרך
 * · work: אנימציית עבודה (הקלדה) רק למצבי עבודה אמיתיים
 * · gesture: מחווה חד-פעמית להשלמה (הסכמה) או לכשל (ניעור ראש)
 * מצב waiting_user הוא המתנה — לא עבודה: ידיים רגועות, נקודת כוונת-תשומת.
 * מצב blocked/error הוא כשל — ללא אנימציית עבודה.
 */
export interface AgentVisual {
  pose: 'sit' | 'stand';
  work: boolean;
  gesture: 'none' | 'agree' | 'shake';
}
export function agentVisual(state: AgentState): AgentVisual {
  switch (state) {
    case 'walking':
      return { pose: 'stand', work: false, gesture: 'none' };
    case 'waiting_user':
    case 'blocked':
      return { pose: 'sit', work: false, gesture: 'none' };
    case 'done':
      return { pose: 'sit', work: false, gesture: 'agree' };
    case 'error':
      return { pose: 'sit', work: false, gesture: 'shake' };
    case 'idle':
      return { pose: 'sit', work: false, gesture: 'none' };
    case 'reading':
    case 'checking':
    case 'writing':
    case 'thinking':
      return { pose: 'sit', work: true, gesture: 'none' };
    default:
      return { pose: 'sit', work: false, gesture: 'none' };
  }
}

/** חוק-הטריות (Task 46): סוכן שהאמת שלו ישנה או שהחיבור נותק — לא ייראה
 *  פרודוקטיבי. לולאת-הקלדה שממשיכה לרוץ על סנאפשוט קפוא היא שקר; כש-fresh
 *  === false העבודה והמחוות נעצרות ונשארת רק השלווה הכנה. המצב המוצג בשלט
 *  יסומן "לא ידוע" — לעולם לא ירוק. */
export function agentVisualFresh(state: AgentState, fresh: boolean): AgentVisual {
  const v = agentVisual(state);
  if (fresh) return v;
  return { ...v, work: false, gesture: 'none' };
}

/** חלון-הטריות של החדר — זהה לחלון של פס-המדדים ב-AgentHQ (75 שניות). */
export const ROOM_STALE_MS = 75_000;

// ─────────────── חוק-הפאזות — זהה למנוע-העולם הקנוני ───────────────
/**
 * חוק-הפאזות של המשמרת — לפי שעת ירושלים, זהה במדויק ל-office/engine.mjs
 * (המנוע המשותף של השידור ב-Domain). שינוי-חוק כאן מחייב עדכון שם — ולהיפך.
 * הצטרפות לשידור = הצוות נמצא בעמדתו לפי הפאזה הנוכחית, לא נולד בדלת.
 */
export type PhaseKind = 'open' | 'day' | 'lunch' | 'evening' | 'night';
export function phaseOfJerusalem(tMs: number): { kind: PhaseKind; he: string } {
  const { h } = jerusalemHM(tMs);
  if (h >= 7 && h < 9) return { kind: 'open', he: 'פתיחת משמרת' };
  if (h >= 9 && h < 12) return { kind: 'day', he: 'משמרת בוקר' };
  if (h >= 12 && h < 13) return { kind: 'lunch', he: 'הפסקת צהריים' };
  if (h >= 13 && h < 18) return { kind: 'day', he: 'משמרת צהריים' };
  if (h >= 18 && h < 22) return { kind: 'evening', he: 'סיכומי ערב' };
  return { kind: 'night', he: 'משמרת לילה' };
}

let hCacheKey = -1;
let hCache = { h: 10, m: 0 };
function jerusalemHM(tMs: number) {
  const key = Math.floor(tMs / 60000);
  if (key !== hCacheKey) {
    hCacheKey = key;
    try {
      const s = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(tMs));
      const [hh, mm] = s.split(':').map((v) => parseInt(v, 10));
      hCache = { h: hh % 24, m: mm };
    } catch { hCache = { h: 10, m: 0 }; }
  }
  return hCache;
}

// ─────────────── מוח סוכן ───────────────
/**
 * מתורגם מ-AgentView של הפורמן לתנועה במרחב.
 * מצבים: seated_at_desk · walking · standing_wall · standing_podium · standing_library · offstage
 */
export interface NavTarget { x: number; y: number; face?: number; kind: 'seat' | 'stand' | 'offstage' }

/** פאזה דטרמיניסטית לפי id — לפיזור-עמדות בין סוכנים באותה תחנה */
function spreadOf(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = (h * 33) ^ id.charCodeAt(i);
  return ((h >>> 0) % 1000) / 1000; // 0..1
}

export class AgentBrain {
  id: string;
  x: number; y: number;
  /** yaw להצגה (מוחלק) */
  yaw: number;
  yawTarget: number;
  /** 0..1 הליכה · 0..1 ישיבה · 0..1 עבודה */
  walkAmt = 0;
  sitAmt = 0;
  workAmt = 0;
  /** פאזה לנשימה/הבהוב */
  t = Math.random() * 10;
  state: AgentState = 'idle';
  station: Station = 'desk';
  /** יעד נוכחי ומסלול פשוט */
  private target: NavTarget | null = null;
  private arrived = true;
  /** השולחן שלי */
  desk: { x: number; y: number; face: number; seat: [number, number] };

  constructor(id: string, desk: { x: number; y: number; face: number; seat: [number, number] }) {
    this.id = id;
    this.desk = desk;
    // חוק-ההצטרפות לשידור (T20): המשרד הוא שידור של משמרת מתמשכת —
    // הצופה מצטרף באמצע משמרת והצוות כבר בעמדתו. אין לידה-בדלת ואין מצעד-כניסה
    // בפתיחת דף. המיקום הראשוני — מושב השולחן שלי; הסנכרון הראשון ממקם לפי
    // הפאזה האמיתית (joinCrewAtPosts) עוד לפני הפריים הראשון.
    this.x = desk.seat[0];
    this.y = desk.seat[1];
    this.yaw = desk.face;
    this.yawTarget = desk.face;
    this.arrived = true;
    this.waitT = 0;
  }

  /** הצטרפות לשידור — הצמדה לעמדת-היעד הנוכחית בלי תנועה. נקרא פעם-אחת
   *  בסנכרון הראשון אחרי שהמצב האמיתי ידוע: הסוכן כבר בעמדתו מהשנייה-הראשונה,
   *  כמו שידור חי שמצטרפים אליו באמצע. */
  joinAt() {
    const tgt = this.target;
    if (tgt) {
      this.x = tgt.x;
      this.y = tgt.y;
      if (tgt.face !== undefined) { this.yaw = tgt.face; this.yawTarget = tgt.face; }
    }
    this.arrived = true;
    this.waitT = 0;
    this.walkAmt = 0;
    this.lastD = 0;
    this.stuckT = 0;
  }

  /** תרגום AgentView → יעד. נקרא מהצד שסונכרן עם הסוקט */
  syncState(state: AgentState, station: Station, activity: string) {
    void activity;
    this.state = state;
    this.station = station;
    const d = this.desk;
    if (station === 'desk' && d) {
      if (state === 'walking') {
        // בדרך לשולחן — עומד קודם ליד הכיסא
        this.setTarget({ x: d.seat[0], y: d.seat[1] + 26, face: d.face, kind: 'stand' });
      } else {
        // כל יתר המצבים — מהכיסא (המצב קובע אנימציה, לא מיקום)
        this.setTarget({ x: d.seat[0], y: d.seat[1], face: d.face, kind: 'seat' });
      }
    } else if (station === 'wall') {
      // Task 47: פיזור-עמדות — כמה סוכנים באותה תחנה נערמו בנקודה אחת
      // בדיוק (נמדד חי: שני סוכנים על 1170,354). אלוף עוגן קבוע; השאר
      // מתפזרים דטרמיניסטית לפי ה-id.
      const s = spreadOf(this.id);
      const sx = this.id === 'aluf'
        ? TASK_WALL.cx - 90
        : TASK_WALL.cx - 60 + s * 150;
      const sy = TASK_WALL.cy + 140 + (this.id === 'aluf' ? 0 : s * 50);
      this.setTarget({ x: sx, y: sy, face: Math.PI, kind: 'stand' });
    } else if (station === 'podium') {
      // התכנסות-הדוכן (T22, הרכב-נמדד): ראש-המטה מציג מאחורי הדוכן — פנים
      // אל-תוך-האולם ואל-המצלמה, כמו נואם על בימה; השאר — קהל דרומית-מזרחית
      // לבימה, פנים אל הדוכן, בלי לחסום את מסלול-המצלמה (נמדד: נואם שעומד
      // בין המצלמה לדוכן חוסם את כל-הפריים מאחורי-גבו).
      if (this.id === 'aluf') {
        this.setTarget({ x: PODIUM.x - 62, y: PODIUM.y + 14, face: 1.97, kind: 'stand' });
      } else {
        const s = spreadOf(this.id);
        const ax = PODIUM.x + 26 + s * 66;
        const ay = PODIUM.y + 92 + s * 28;
        this.setTarget({ x: ax, y: ay, face: Math.atan2(PODIUM.x - ax, PODIUM.y - ay), kind: 'stand' });
      }
    } else if (station === 'library') {
      const s = spreadOf(this.id);
      this.setTarget({ x: LIBRARY_TABLE[0] - 50 + s * 100, y: LIBRARY_TABLE[1] + 45 + s * 30, face: -0.35, kind: 'stand' });
    } else if (station === 'coffee') {
      // Task 52 — הפסקת-קפה: עמדת-עמידה מערבית לבר, פנים מזרחה אל הדלפק,
      // מפוזרות-דטרמיניסטית (לא שניים באותה נקודה)
      const s = spreadOf(this.id);
      this.setTarget({ x: COFFEE.x - 85 - s * 24, y: COFFEE.y - 60 + s * 55, face: Math.PI / 2, kind: 'stand' });
    } else {
      const s = spreadOf(this.id);
      this.setTarget({ x: FLAME[0] - 120 + s * 60, y: FLAME[1] + s * 50, face: 0, kind: 'offstage' });
    }
  }

  private setTarget(t: NavTarget) {
    // Same target as before → keep the current motion state. Re-syncing the
    // same target (every snapshot re-fires syncState) must NOT re-arm the
    // walk: an agent standing on his target would flip arrived→false and pace
    // in place forever (measured live: walk=1 for minutes against the wall).
    if (
      this.target &&
      this.target.kind === t.kind &&
      Math.abs(this.target.x - t.x) < 4 &&
      Math.abs(this.target.y - t.y) < 4
    ) {
      return; // same destination — arrived stays arrived, en-route stays en-route
    }
    this.target = t;
    this.arrived = false;
  }

  /** stuck detector: closing-distance bookkeeping (see update) */
  private lastD = Number.POSITIVE_INFINITY;
  private stuckT = 0;
  /** Task 53: המתנה דטרמיניסטית בפתח — כניסה מדורגת (ראה constructor) */
  private waitT = 0;

  /**
   * @param dtNav  wall-clock-true delta (capped at 1s) — NAVIGATION ONLY.
   *        The renderer's dt clamp (0.05s) exists for mixer/lerp stability,
   *        but at a low frame rate it silently divided the walking speed by
   *        ~25: a 6-second crossing took 160 wall-clock seconds and the room
   *        looked like it paces forever (measured live). Position must advance
   *        with real time; the motion is kinematic (straight step + circle
   *        resolve), stable at large steps by construction.
   * @param dtAnim cosmetic delta (≤0.05s) — breathing phase, weight lerps,
   *        yaw smoothing.
   */
  update(dtNav: number, dtAnim: number) {
    this.t += dtAnim;
    const tgt = this.target;
    if (tgt && !this.arrived) {
      if (this.waitT > 0) {
        // Task 53: עומד בפתח — הכניסה מדורגת (היעד כבר קיים, רק מחכים לתור)
        this.waitT -= dtNav;
      } else {
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      const d = Math.hypot(dx, dy);
      const spd = 88; // יחידות/שנ' ≈ 1.1 מ'/שנ'
      if (d < 8) {
        this.arrived = true;
        this.stuckT = 0;
        if (tgt.face !== undefined) this.yawTarget = tgt.face;
      } else {
        // STUCK LAW (Task 46): moving but not closing the distance for 1.5
        // wall-clock seconds means the geometry (collision shell) will not
        // let him arrive — stopping honestly beats pacing forever.
        if (d > this.lastD - 1) this.stuckT += dtNav;
        else this.stuckT = 0;
        this.lastD = d;
        if (this.stuckT > 1.5) {
          this.arrived = true;
          this.stuckT = 0;
          if (tgt.face !== undefined) this.yawTarget = tgt.face;
        } else {
          const nx = dx / d, ny = dy / d;
          // never step PAST the target: at a low frame rate a full wall-clock
          // step (88u) overshoots the 8-unit arrival radius and the agent
          // oscillates around the target forever (measured live: d cycled
          // ~56->31 without ever dipping below 8). Step = min(speed*dt, d).
          const step = Math.min(spd * dtNav, d);
          const p = resolveCircle(this.x + nx * step, this.y + ny * step, 0.3 / SCALE);
          this.x = p.x; this.y = p.y;
          this.yawTarget = Math.atan2(nx, ny);
          this.walkAmt = Math.min(1, this.walkAmt + dtAnim * 5);
        }
      }
      }
    } else {
      this.walkAmt = Math.max(0, this.walkAmt - dtAnim * 6);
      this.stuckT = 0;
    }
    // ישיבה/עבודה לפי החוזה הדטרמיניסטי — התכנסות בזמן-שעון (התקצר-זמן
    // של הרנדרר חילק את קצב-ההתכנסות ב-10+ בכלי-חלש; הצורה האקספוננציאלית
    // יציבה בכל dt)
    const seated = this.arrived && tgt?.kind === 'seat';
    this.sitAmt += ((seated ? 1 : 0) - this.sitAmt) * (1 - Math.exp(-dtAnim * 3.2));
    const working = seated && agentVisual(this.state).work;
    this.workAmt += ((working ? 1 : 0) - this.workAmt) * (1 - Math.exp(-dtAnim * 2.6));
    // החלקת yaw בקשת הקצרה
    let dyaw = (this.yawTarget - this.yaw) % (Math.PI * 2);
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dtAnim * 6);
  }
}

/** הצטרפות-מלאה של הצוות לשידור — סנכרון מצב ואז הצמדה לעמדה. נקרא מהחנות
 *  בסנכרון-האמת הראשון בלבד (broadcastJoined) כדי שהצטרפות לא תחזור על עצמה. */
export function joinCrewAtPosts(brains: Map<string, AgentBrain>, agents: { id: string; state: AgentState; station: Station; activity: string }[]) {
  for (const a of agents) {
    const b = brains.get(a.id);
    if (!b) continue;
    b.syncState(a.state, a.station, a.activity);
    b.joinAt();
  }
}

/** בונה מוחות לפי מפת השולחנות */
export function createBrains(): Map<string, AgentBrain> {
  const m = new Map<string, AgentBrain>();
  for (const [id, d] of Object.entries(DESKS)) m.set(id, new AgentBrain(id, d));
  // אלוף — שולחן עגול ראש-המטה (Task 8 — תיקון "הבוס תקוע בשולחן"):
  // הכיסא היה במרכז-השולחן עצמו [1220,560] — בתוך-מעטפת-ההתנגשות (±105),
  // resolveCircle דחף אותו והוא נתקע בשולחן לנצח (נמדד חי).
  // הכיסא האמיתי: דרומית-לשולחן (y+135 — מחוץ-למעטפת), פנים צפונה אל
  // מרכז-האולם והלהבה — עמדת-פיקוד נראית, לא סטטואל.
  m.set('aluf', new AgentBrain('aluf', {
    x: LEAD_TABLE.x, y: LEAD_TABLE.y, face: Math.PI,
    seat: [LEAD_TABLE.x, LEAD_TABLE.y + 135],
  }));
  return m;
}

/** גבולות החדר במטרים — עוגן למצלמה (לא לצאת מהקירות) */
export const ROOM_BOUNDS = {
  minX: -PLAN_W * SCALE / 2 + 0.55,
  maxX: PLAN_W * SCALE / 2 - 0.55,
  minZ: -PLAN_H * SCALE / 2 + 0.55,
  maxZ: PLAN_H * SCALE / 2 - 0.55,
};
