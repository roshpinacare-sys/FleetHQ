/**
 * world.ts — מנוע העולם של המשרד (פיזיקה ביחידות תוכנית, רינדור במטרים).
 * ------------------------------------------------------------------
 * · שחקן: הליכה/ריצה, התנגשות מול הקוליידרים, זיהוי תחנה קרובה.
 * · סוכנים: מוח ניווט פשוט — כל AgentView של הפורמן מתורגם ליעד תנועה
 *   (שולחן משלו / לוח / דוכן החלטות / ספרייה), הליכה חלקה, ישיבה ועבודה.
 * · bus: מיני-אוטובוס אירועים בין ה-HUD לסצנה (מיקוד מצלמה, כניסה/יציאה).
 */
import {
  PLAN_W, PLAN_H, SCALE, WALK_SPEED, SPRINT_SPEED, PLAYER_R,
  DESKS, LEAD_TABLE, TASK_WALL, PODIUM, LIBRARY_TABLE, FLAME,
  resolveCircle, INTERACTABLES, type Interactable,
} from './contract';
import type { AgentState, Station } from './protocol';

// ─────────────── אוטובוס אירועים ───────────────
type BusEvents = {
  focus: { target: { x: number; y: number } | null; kind?: string; id?: string };
  hud: { kind: 'panel' | 'toast' | 'chat'; id?: string; data?: unknown };
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

// ─────────────── מצב קלט גלובלי ───────────────
export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0, active: false },      // ג'ויסטיק מגע
  look: { x: 0, y: 0 },                     // דלתא מבט (גרירה)
  tapTarget: null as null | { x: number; y: number },
  firstPerson: false,
  sprint: false,
  /** false = מצלמת פתיחה קולנועית; כל קלט ראשון מוסר את השליטה לשחקן */
  introDone: false,
};

/** נקודת עניין קרובה — לחיצה על הסצנה תשלח לכאן */
export function nearestInteractable(x: number, y: number, maxDist = 130): Interactable | null {
  let best: Interactable | null = null;
  let bd = maxDist * maxDist;
  for (const it of INTERACTABLES) {
    const dx = it.x - x, dy = it.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = it; }
  }
  return best;
}

// ─────────────── השחקן ───────────────
export class Player {
  x = 600; y = 780;
  facing = Math.PI; // פנים לצפון (לתוך המשרד)
  vx = 0; vy = 0;
  /** 0..1 עוצמת הליכה לאנימציה */
  walkAmt = 0;
  private tapHold = 0;

  update(dt: number) {
    let ix = 0, iy = 0;
    const k = input.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) iy -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iy += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    if (input.joy.active) { ix += input.joy.x; iy += input.joy.y; }

    // tap-to-move
    if (input.tapTarget) {
      const dx = input.tapTarget.x - this.x, dy = input.tapTarget.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 26) { ix += dx / d; iy += dy / d; }
      else { input.tapTarget = null; }
      this.tapHold += dt;
      if (this.tapHold > 6) { input.tapTarget = null; this.tapHold = 0; }
    } else this.tapHold = 0;

    const mag = Math.hypot(ix, iy);
    const spd = (input.sprint ? SPRINT_SPEED : WALK_SPEED) / SCALE; // יחידות תוכנית
    if (mag > 0.01) {
      const nx = ix / mag, ny = iy / mag;
      this.vx = nx * spd; this.vy = ny * spd;
      this.facing = Math.atan2(nx, ny); // yaw: 0=דרום (+z), מודל פונה +z
      const p = resolveCircle(this.x + this.vx * dt, this.y + this.vy * dt, PLAYER_R / SCALE);
      this.x = Math.max(8, Math.min(PLAN_W - 8, p.x));
      this.y = Math.max(8, Math.min(PLAN_H - 8, p.y));
      this.walkAmt = Math.min(1, this.walkAmt + dt * 6);
    } else {
      this.vx *= 0.72; this.vy *= 0.72;
      this.walkAmt = Math.max(0, this.walkAmt - dt * 7);
    }
  }
}

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
  /** 0..1 הליכה · 0..1 ישיבה · 0..1 הקלדה */
  walkAmt = 0;
  sitAmt = 0;
  typeAmt = 0;
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
      } else if (state === 'idle') {
        this.setTarget({ x: d.seat[0], y: d.seat[1], face: d.face, kind: 'seat' });
      } else {
        // reading/checking/writing/thinking/error/... עובד מהכיסא
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
    if (this.target && this.target.kind === t.kind &&
        Math.abs(this.target.x - t.x) < 4 && Math.abs(this.target.y - t.y) < 4 && this.arrived === false) {
      return; // אותו יעד — המשך
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
    // ישיבה/הקלדה לפי יעד
    const seated = this.arrived && tgt?.kind === 'seat';
    this.sitAmt += ((seated ? 1 : 0) - this.sitAmt) * Math.min(1, dt * 3.2);
    const working = seated && ['reading', 'checking', 'writing', 'thinking', 'error'].includes(this.state);
    this.typeAmt += ((working ? 1 : 0) - this.typeAmt) * Math.min(1, dt * 2.6);
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
