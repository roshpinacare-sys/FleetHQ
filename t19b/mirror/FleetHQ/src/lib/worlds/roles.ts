/**
 * worlds/roles.ts — גזירת גיוס-עובדים וערך ממדידות-בלבד. [T13]
 * ---------------------------------------------------------------------------
 * חוק: כל תפקיד-גיוס חייב ראיה מדודה + מקור. אין ראיה → אין תפקיד.
 * כאן נולדת הלולאה שהבעלים ביקש: "שכל הזמן ישאלו מה הפוטנציאל, מה פתוח,
 * ומה יכול לתת לנו עוד ערך" — נגזר מהמקורות הפומביים, עם עדויות.
 */
import type { ValueOpportunity, WorldsPayload } from './types';

export interface RecruitRole {
  id: string;
  titleHe: string;
  whyHe: string;
  evidence: string;
  source: string;
  severity: 'red' | 'amber' | 'teal';
}

export function deriveRecruitment(p: WorldsPayload | null): RecruitRole[] {
  if (!p) return [];
  const roles: RecruitRole[] = [];

  // 1) תקלות/משימות-תקועות אצל הפורמן → מהנדס-תיקון
  const tasks = p.foreman.data?.tasks ?? [];
  const errorTasks = tasks.filter((t) => t.status === 'blocked');
  const errAgent = (p.foreman.data?.agents ?? []).find((a) => a.state === 'error');
  if (errAgent?.id) {
    roles.push({
      id: 'fix-engineer',
      titleHe: 'מהנדס-תיקון (משמרת א)',
      whyHe: `סוכן ${errAgent.id} במצב תקלה מדוד`,
      evidence: `state=error · ${p.foreman.data?.statusHe?.slice(0, 80) ?? 'ללא דיווח'}`,
      source: 'FleetHQ office-state.json',
      severity: 'red',
    });
  }
  if (errorTasks.length > 0) {
    const first = errorTasks[0];
    roles.push({
      id: 'unblock-officer',
      titleHe: 'קצין-שחרור-חסימות',
      whyHe: `${errorTasks.length} משימות חסומות בצוות`,
      evidence: `משימה ${first.id ?? '?'}: ${(first.title ?? '').slice(0, 70)}`,
      source: 'FleetHQ office-state.json',
      severity: 'amber',
    });
  }

  // 2) פערי-רצפה כלכליים → כלכלן-ריבונות (דיווח-בלבד; הכרעה = בעלים)
  const treasury = p.beacon.data?.lastPulse?.treasuryNetSp;
  if (typeof treasury === 'number' && treasury < 3000) {
    roles.push({
      id: 'sovereign-economist',
      titleHe: 'כלכלן-ריבונות (ייעוץ · אין-הכרעה)',
      whyHe: `אוצרה ${treasury.toFixed(1)} SP מתחת לרצפת 3,000`,
      evidence: `פער נמדד ${(3000 - treasury).toFixed(1)} SP · מקור המספר: משואה keyless`,
      source: 'sovereign-beacon state.json',
      severity: 'amber',
    });
  }

  // 4) יתומים/רוחות-רפאים במפת-הזרימה → מחבר-עורקים
  const orphans = Array.isArray(p.flow.data?.orphans) ? p.flow.data!.orphans!.length : 0;
  const ghosts = Array.isArray(p.flow.data?.ghosts) ? p.flow.data!.ghosts!.length : 0;
  if (orphans + ghosts > 0) {
    roles.push({
      id: 'artery-weaver',
      titleHe: 'מחבר-עורקים (everything-uses-everything)',
      whyHe: `${orphans} יתומים · ${ghosts} רוחות-רפאים במפת-הזרימה`,
      evidence: 'flow-map.json: nodes קיימים שאינם מזינים דבר / קיימים בשם בלבד',
      source: 'Sandbox ops/flow/flow-map.json (F-series)',
      severity: 'teal',
    });
  }

  // 5) DEX לא-חי/לא-חמוש → מפעיל-שוק
  const dex = p.dex.data;
  if (p.dex.ok && dex && (dex.armed === false || !dex.ok)) {
    roles.push({
      id: 'market-operator',
      titleHe: 'מפעיל-שוק (DEX)',
      whyHe: `פס-ה-DEX מדווח verdict=${dex.verdict ?? '?'} armed=${String(dex.armed)}`,
      evidence: `publishedAt: ${dex.publishedAt?.slice(0, 19) ?? 'לא ידוע'}`,
      source: 'Domain dex/grid.json',
      severity: 'amber',
    });
  }

  // 6) מקורות שנפלו → מחזיק-חיים
  const dead: string[] = [];
  if (!p.flow.ok) dead.push('flow-map');
  if (!p.beacon.ok) dead.push('beacon');
  if (!p.lighthouse.ok) dead.push('lighthouse');
  if (!p.foreman.ok) dead.push('foreman');
  if (dead.length > 0) {
    roles.push({
      id: 'life-keeper',
      titleHe: 'מחזיק-חיים (כנות-מלאה)',
      whyHe: `מקורות-אמת לא זמינים כרגע: ${dead.join(', ')}`,
      evidence: 'fail-soft: העולמות מציגים חוסר במקום להמציא',
      source: '/api/worlds-state',
      severity: 'red',
    });
  }

  return roles;
}

/** הזדמנויות-ערך מהסריקה האוטונומית (value-scan.yml) + גיבוי-חישוב מקומי כנה */
export function deriveValue(p: WorldsPayload | null): { ops: ValueOpportunity[]; scannedAt: string | null; verdictHe: string | null } {
  if (p?.valueScan.ok && p.valueScan.data) {
    return {
      ops: Array.isArray(p.valueScan.data.opportunities) ? p.valueScan.data.opportunities : [],
      scannedAt: p.valueScan.data.generatedAt ?? null,
      verdictHe: p.valueScan.data.verdictHe ?? null,
    };
  }
  return { ops: [], scannedAt: null, verdictHe: null };
}
