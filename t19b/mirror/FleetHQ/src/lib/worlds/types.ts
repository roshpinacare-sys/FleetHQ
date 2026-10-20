/**
 * worlds/types.ts — טיפוסי-החוט של העולמות. [T13]
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
/** [T15] רשת-האמת של הקונסולה — המאמת-העצמאי (51 טענות) + שער-האמת-הציבורי */
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

export interface WorldsPayload {
  fetchedAt: string;
  flow: { ok: boolean; error?: string; data?: FlowDataWire };
  lighthouse: { ok: boolean; error?: string; data?: LighthouseWire };
  beacon: { ok: boolean; error?: string; data?: BeaconWire };
  dex: { ok: boolean; error?: string; data?: DexWire };
  valueScan: { ok: boolean; error?: string; data?: ValueScanWire };
  foreman: { ok: boolean; error?: string; data?: ForemanWire };
  chain: { ok: boolean; error?: string; data?: ChainWire };
  /** [zai-14] חיבוריות‑האורגניזם — מה לא מחובר, נמדד (connectivity-audit) */
  connectivity?: { ok: boolean; error?: string; data?: ConnectivityWire };
  /** [zai-14] קבלת‑האתחול האחרונה — עם גיל כנה (stale מוצג כ-stale) */
  bootVerify?: { ok: boolean; error?: string; ageH?: number | null; data?: BootVerifyWire };
  /** [zai-14] האורקל‑הטרי העומד — בתים ציבוריים == בתים מחויבים */
  freshOracle?: { ok: boolean; error?: string; data?: FreshOracleWire };
  /** [T15] רשת-האמת — הגוף בודק-את-עצמו בפומבי; המשרד רואה-זאת */
  verify?: { ok: boolean; error?: string; data?: VerifyWire };
}

/** [zai-14] פלט tools/connectivity-audit.mjs */
export interface ConnectivityWire {
  schema?: string;
  generatedAt?: string;
  verdictHe?: string;
  graph?: { codeFiles?: number; reachable?: number; trueOrphanCount?: number; libraryCount?: number; scaffoldCount?: number };
  artifacts?: { scanned?: number; wired?: number; unwired?: { path: string; bytes: number; sha16: string }[] };
  tools?: { scanned?: number; unwiredCI?: string[] };
  productSurface?: { routes?: string[] };
}

/** [zai-14] receipts/boot-verify.json (legacy, מוצג בגילו האמיתי) */
export interface BootVerifyWire {
  at?: string;
  all_ok?: boolean;
  elapsed_s?: number;
  checks?: Record<string, unknown>;
}

/** [zai-14] receipts/fresh-oracle/latest.json */
export interface FreshOracleWire {
  schema?: string;
  at?: string;
  law?: string;
  results?: { name: string; verdict: string; liveSha16: string | null; committedSha16: string | null }[];
  summary?: { checked?: number; match?: number; drift?: number; missing?: number; verdict?: string };
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
