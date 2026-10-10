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
  DESKS, LEAD_TABLE, TASK_WALL, PODIUM, LIBRARY_TABLE, FLAME,
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

// ─────────────── מוח סוכן ───────────────
/**
 * מתורגם מ-AgentView של הפורמן לתנועה במרחב.
 * מצבים: seated_at_desk · walking · standing_wall · standing_podium · standing_library · offstage
 */
export interface NavTarget { x: number; y: number; face?: number; kind: 'seat' | 'stand' | 'offstage' }

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
    this.x = desk.seat[0]; this.y = desk.seat[1];
    this.yaw = desk.face; this.yawTarget = desk.face;
    this.arrived = true;
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
      const sx = TASK_WALL.cx + (this.id === 'aluf' ? -60 : 60);
      this.setTarget({ x: sx, y: TASK_WALL.cy + 118, face: Math.PI, kind: 'stand' });
    } else if (station === 'podium') {
      this.setTarget({ x: PODIUM.x + 62, y: PODIUM.y - 20, face: -Math.PI / 2, kind: 'stand' });
    } else if (station === 'library') {
      this.setTarget({ x: LIBRARY_TABLE[0], y: LIBRARY_TABLE[1] + 60, face: -0.35, kind: 'stand' });
    } else {
      this.setTarget({ x: FLAME[0] - 120, y: FLAME[1], face: 0, kind: 'offstage' });
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

  update(dt: number) {
    this.t += dt;
    const tgt = this.target;
    if (tgt && !this.arrived) {
      const dx = tgt.x - this.x, dy = tgt.y - this.y;
      const d = Math.hypot(dx, dy);
      const spd = 88; // יחידות/שנ' ≈ 1.1 מ'/שנ'
      if (d < 8) {
        this.arrived = true;
        if (tgt.face !== undefined) this.yawTarget = tgt.face;
      } else {
        const nx = dx / d, ny = dy / d;
        const p = resolveCircle(this.x + nx * spd * dt, this.y + ny * spd * dt, 0.3 / SCALE);
        this.x = p.x; this.y = p.y;
        this.yawTarget = Math.atan2(nx, ny);
        this.walkAmt = Math.min(1, this.walkAmt + dt * 5);
      }
    } else {
      this.walkAmt = Math.max(0, this.walkAmt - dt * 6);
    }
    // ישיבה/עבודה לפי החוזה הדטרמיניסטי
    const seated = this.arrived && tgt?.kind === 'seat';
    this.sitAmt += ((seated ? 1 : 0) - this.sitAmt) * Math.min(1, dt * 3.2);
    const working = seated && agentVisual(this.state).work;
    this.workAmt += ((working ? 1 : 0) - this.workAmt) * Math.min(1, dt * 2.6);
    // החלקת yaw בקשת הקצרה
    let dyaw = (this.yawTarget - this.yaw) % (Math.PI * 2);
    if (dyaw > Math.PI) dyaw -= Math.PI * 2;
    if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yaw += dyaw * Math.min(1, dt * 6);
  }
}

/** בונה מוחות לפי מפת השולחנות */
export function createBrains(): Map<string, AgentBrain> {
  const m = new Map<string, AgentBrain>();
  for (const [id, d] of Object.entries(DESKS)) m.set(id, new AgentBrain(id, d));
  // אלוף — עוגן שולחן עגול (עומד/נע בין הלוח לשולחן)
  m.set('aluf', new AgentBrain('aluf', { x: LEAD_TABLE.x, y: LEAD_TABLE.y, face: 1.6, seat: [LEAD_TABLE.x, LEAD_TABLE.y] }));
  return m;
}

/** גבולות החדר במטרים — עוגן למצלמה (לא לצאת מהקירות) */
export const ROOM_BOUNDS = {
  minX: -PLAN_W * SCALE / 2 + 0.55,
  maxX: PLAN_W * SCALE / 2 - 0.55,
  minZ: -PLAN_H * SCALE / 2 + 0.55,
  maxZ: PLAN_H * SCALE / 2 - 0.55,
};
