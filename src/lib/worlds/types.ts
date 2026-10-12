/**
 * worlds/types.ts — טיפוסי-החוט של העולמות. [T13 · T14]
 * מרחב-שמות עצמאי לגמרי (אפס-תלויות ב-hq/*) כדי-שהקוד ידחף ל-FleetHQ בלי לגעת
 * בשדרוגי ה-office-v2 של הסוכן-המקביל. חוק-אמת: כל מקור עשוי להיות חסר — הטיפוסים כנים.
 */
/** טיפוסי-חוט — מוגדרים כאן (לא בשרת) כדי-שהספרייה תהיה אוטונומית לגמרי */
export interface FlowNodeWire {
  key?: string; kind?: string; path?: string; repo?: string;
  ageH?: number; missing?: boolean; feeds?: string; author?: string;
}
export interface FlowDataWire {
  generatedAt?: string; owner?: string;
  nodes?: FlowNodeWire[];
  edges?: { from?: string; to?: string; nodeMissing?: boolean }[];
  orphans?: unknown[]; ghosts?: unknown[]; stale?: unknown[];
  summary?: Record<string, unknown>; alerts?: unknown[];
}
export interface LighthouseWire {
  generatedAt?: string;
  lastPulse?: { at?: string; degraded?: boolean; degradedWhy?: string[] };
  lastKnownAlive?: Record<string, unknown>;
}
export interface BeaconWire {
  generatedAt?: string;
  lastPulse?: { at?: string; treasuryNetSp?: number; minOperatorSp?: number; steemHead?: number; degraded?: boolean; degradedWhy?: string[] };
}
export interface DexWire {
  ok?: boolean; publishedAt?: string; verdict?: string; armed?: boolean; real?: boolean;
  openOrdersNow?: number; honesty?: Record<string, unknown>;
  fills?: unknown; orders?: unknown; hive?: { verdict?: string; rc?: { reason?: string } };
}
export interface ValueOpportunity {
  id: string; area: string; titleHe: string; valueHe: string;
  evidence: string; source: string; effort: 'S' | 'M' | 'L';
}
export interface ValueScanWire {
  generatedAt?: string; verdictHe?: string; topIds?: string[];
  metrics?: Record<string, number | string | boolean | null>;
  opportunities?: ValueOpportunity[];
}
export interface ForemanWire {
  capturedAt?: string; connected?: boolean; statusHe?: string;
  agents?: { id?: string; state?: string; activity?: string; since?: string | number }[];
  tasks?: { id?: string; title?: string; status?: string; assignee?: string; updatedAt?: string }[];
}
export interface ChainWire {
  head?: number; time?: string; mult?: number;
  treasuryNetSp?: number; delegatedOutSp?: number; receivedInSp?: number;
  balanceSteem?: number;
}

/** [T14] הכרעות-הריבונות — נמדדות-על-הגיט ע"י sovereign-decider.yml (כל 30 דק') */
export interface DecisionOption {
  id: string; he: string;
  scores: { safety: number; reversibility: number; valueNow: number; effort: number };
  total: number;
  status: 'CHOSEN' | 'STAGED-EXEC' | 'REJECTED' | 'OBSERVING';
}
export interface SovereignDecision {
  id: string; area: string; titleHe: string; verdictHe: string;
  status: 'ENFORCED' | 'STAGED-EXEC' | 'OBSERVING' | 'REVOKED';
  priority?: 'P0' | 'P1' | 'P2';
  evidence: string[];
  options?: DecisionOption[];
  chosen?: string[];
  policy?: Record<string, unknown>;
  routing?: Record<string, unknown>;
  decidedAt: string; decidedBy: string;
}
export interface DecisionsWire {
  schema?: string; generatedAt?: string; charter?: string;
  charterMandateAt?: string; ownerMandateVerbatim?: string;
  degraded?: string[];
  chainVerify?: { head?: number; mult?: number; treasuryNetSp?: number; minOperatorSp?: number; beaconChainMatch?: boolean | null };
  decisions?: SovereignDecision[];
  noAction?: { area: string; note: string }[];
  law?: string;
}
export interface WorldsPayload {
  fetchedAt: string;
  flow: { ok: boolean; error?: string; data?: FlowDataWire };
  lighthouse: { ok: boolean; error?: string; data?: LighthouseWire };
  beacon: { ok: boolean; error?: string; data?: BeaconWire };
  dex: { ok: boolean; error?: string; data?: DexWire };
  valueScan: { ok: boolean; error?: string; data?: ValueScanWire };
  foreman: { ok: boolean; error?: string; data?: ForemanWire };
  chain: { ok: boolean; error?: string; data?: ChainWire };
  decisions: { ok: boolean; error?: string; data?: DecisionsWire };
  verify: { ok: boolean; error?: string; data?: VerifyWire };
}

/** [T15] רשת-האמת של הקונסולה — המאמת-העצמאי + שער-האמת-הציבורי */
export interface VerifyWire {
  summary?: { total: number; passed: number; failed: number; verdict: string };
  generatedAt?: string;
  failures?: { id: string; details?: string }[];
  truthGate?: {
    at?: string;
    verdict?: string;
    counts?: { pass: number; fail: number; skip: number };
    redGates?: { gate: string; note?: string; measured?: string }[];
  };
}

/** הצוות — שיקוף מקומי של המזהים האמיתיים (מקור-האמת: FleetHQ office-state) */
export const WORLDS_CREW = [
  { id: 'aluf', he: 'אלוף', role: 'ראש-המטה', color: '#E0973F' },
  { id: 'gal', he: 'גל', role: 'מפעיל שוק', color: '#3BA08F' },
  { id: 'erez', he: 'ארז', role: 'מבקר פנים', color: '#C9A227' },
  { id: 'tamar', he: 'תמר', role: 'כלכלנית הצי', color: '#7BA05B' },
  { id: 'shachar', he: 'שחר', role: 'קצין מודיעין', color: '#C76B4A' },
  { id: 'yarden', he: 'ירדן', role: 'מהנדס תשתיות', color: '#6E8FA8' },
] as const;

export type CrewId = (typeof WORLDS_CREW)[number]['id'];
export type CrewState =
  | 'idle' | 'thinking' | 'reading' | 'checking' | 'writing'
  | 'walking' | 'waiting_user' | 'blocked' | 'done' | 'error';

/** גילום-מטאפורה לכל מצב נמדד — המטאפורה מוצגת לצד המדידה, לעולם במקומה */
export const STATE_METAPHOR: Record<CrewState, { he: string; mood: 'calm' | 'work' | 'bright' | 'frozen' | 'storm' | 'bloom' }> = {
  idle: { he: 'רגוע', mood: 'calm' },
  thinking: { he: 'חושב', mood: 'work' },
  reading: { he: 'קורא', mood: 'work' },
  checking: { he: 'בודק', mood: 'work' },
  writing: { he: 'כותב', mood: 'work' },
  walking: { he: 'בדרך', mood: 'work' },
  waiting_user: { he: 'ממתין', mood: 'frozen' },
  blocked: { he: 'חסום', mood: 'frozen' },
  done: { he: 'השלים', mood: 'bloom' },
  error: { he: 'תקלה', mood: 'storm' },
};

/** מצב-אווירה של האורגניזם — נגזר רק ממדידות */
export interface WorldMood {
  sky: 'clear' | 'cloudy' | 'overcast';
  he: string;
  reasons: string[];
}

export function deriveWorldMood(p: WorldsPayload | null): WorldMood {
  const reasons: string[] = [];
  let score = 0;
  const beaconDegraded = p?.beacon.data?.lastPulse?.degraded;
  if (beaconDegraded === true) { score += 2; reasons.push('המשואה מדווחת הידרדרות'); }
  if (beaconDegraded === false) { reasons.push('משואה תקינה'); }
  if (p?.lighthouse.data?.lastPulse?.degraded === true) { score += 1; reasons.push('מגדלור מוגדר'); }
  if (p?.foreman.ok) {
    const errAgents = (p.foreman.data?.agents ?? []).filter((a) => a.state === 'error').length;
    const blockedTasks = (p.foreman.data?.tasks ?? []).filter((t) => t.status === 'blocked').length;
    if (errAgents > 0) { score += errAgents; reasons.push(`${errAgents} סוכנים בתקלה`); }
    if (blockedTasks > 0) { score += 1; reasons.push(`${blockedTasks} משימות חסומות`); }
  } else {
    score += 1; reasons.push('מקור הפורמן לא זמין');
  }
  const sky = score >= 3 ? 'overcast' : score >= 1 ? 'cloudy' : 'clear';
  const he = sky === 'clear' ? 'שמיים בהירים' : sky === 'cloudy' ? 'עננים מתקבצים' : 'שמיים כבדים';
  return { sky, he, reasons };
}
