/**
 * keys.ts — מחסן-המפתחות: חוק-הדרישה-מול-המלאי. [T24]
 * ---------------------------------------------------------------------------
 * החוק שהבעלים דרש: "המערכת לא דורשת מפתח בלי לבדוק שיש לה הכל".
 * · כל-רכיב-תלוי-מפתח נרשם ב-registry.demands.
 * · checkDemand() מחזיר כוונה-מדודה (SATISFIED/DEGRADED/BLOCKED/MISSING-…) —
 *   לא תשובה-חיה-בלבד: משלב מדידת-ריצה (fs/env/פיד-פומבי) מעל קבלת-הרישום.
 * · אין כאן חומר-גלמי. לעולם.
 */
import registryJson from '@/data/keys-registry.json';

export interface KeyEntry {
  id: string;
  chain: string;
  account: string;
  role: string;
  status: 'LIVE' | 'SEALED' | 'BURNED' | 'MISSING-OWNER' | 'DEGRADED';
  pubPrefix?: string | null;
  where: string;
  fit: string;
  receipt: string;
  uses: string[];
}

export interface DemandEntry {
  id: string;
  component: string;
  needs: string;
  state: string;
  how: string;
}

export interface KeysRegistry {
  schema: string;
  generatedAt: string;
  title: string;
  law: string[];
  statusClasses: Record<string, string>;
  keys: KeyEntry[];
  vaults: Array<{ id: string; generation: string; status: string; sha256?: string | null; note: string }>;
  secrets: Array<{ repo: string; names: string[]; note: string }>;
  demands: DemandEntry[];
  ownerGaps: string[];
  adoption: { canonicalTarget: string; stagedBundle: string; sandboxCopy: string; selfhoodIntegration: string };
}

export const registry = registryJson as unknown as KeysRegistry;

/** [T24] המלאי-הקנוני חי ב-Autonomy/state/keys/REGISTRY.json — האפליקציה קוראת-קודם-ענן
 * (אנונימי-raw — Autonomy ציבורי), ונופלת-לעותק-המקומי בכנות אם-אין. מטמון 120 שנ'. */
const gReg = globalThis as unknown as { __canonicalRegistry?: { at: number; data: KeysRegistry | null } };
export async function loadCanonicalRegistry(): Promise<KeysRegistry> {
  const cached = gReg.__canonicalRegistry;
  if (cached && Date.now() - cached.at < 120_000) return cached.data ?? registry;
  let data: KeysRegistry | null = null;
  try {
    const res = await fetch('https://raw.githubusercontent.com/roshpinacare-sys/Autonomy/main/state/keys/REGISTRY.json', {
      cache: 'no-store', headers: { 'User-Agent': 'keys-registry/1' }, signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const j = (await res.json()) as KeysRegistry;
      if (j && j.schema === 'keys.registry/1' && Array.isArray(j.keys)) data = j;
    }
  } catch { /* נפילה-למקומי */ }
  gReg.__canonicalRegistry = { at: Date.now(), data };
  return data ?? registry;
}

export type DemandVerdict = 'SATISFIED' | 'SATISFIED-CLOUD' | 'SATISFIED-SANDBOX' | 'DEGRADED' | 'BLOCKED' | 'MISSING-OWNER' | 'MISSING-KNOWLEDGE' | 'MISSING-FUEL';

export interface DemandCheck {
  id: string;
  component: string;
  needs: string;
  registryState: string;
  runtimeState: DemandVerdict;
  measured: string;
  ok: boolean;
}

/** מדידת-ריצה: מה באמת קיים בסנדבוקס עכשיו (בלי חשיפת-תוכן) */
export function runtimePresence(): {
  ownerKeyFile: boolean;
  sessionPat: boolean;
  zAiConfig: boolean;
} {
  let ownerKeyFile = false;
  let zAiConfig = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require('fs') as typeof import('fs');
    ownerKeyFile = existsSync('/home/z/my-project/upload/headcorner.txt');
    zAiConfig = existsSync('/etc/.z-ai-config');
  } catch {
    /* כשל-קריאה = אין */
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resolveGithubPat } = require('./gh-pat') as typeof import('./gh-pat');
  return { ownerKeyFile, sessionPat: !!resolveGithubPat(), zAiConfig };
}

/** החוק: בדיקת-דרישה מול-המלאי — הפונקציה שכל-מסילה-תלוית-מפתח קוראת-לה קודם.
 * extra.patVerified: פסק-דין חי מ-verifyGithubPat (אמת-מעל-צורה) — undefined = לא-נבדק. */
export function checkDemand(demandId: string, extra?: Partial<Record<string, boolean>>): DemandCheck | null {
  const d = registry.demands.find((x) => x.id === demandId);
  if (!d) return null;
  const p = runtimePresence();
  let runtimeState = d.state as DemandVerdict;
  let measured = d.how;
  // שדרוג/הורדת-כוונה לפי-מדידה-חיה:
  if (d.needs === 'github-pat עותק-מקומי') {
    if (extra && typeof extra.patVerified === 'boolean' && extra.patVerified) {
      runtimeState = 'SATISFIED';
      measured = 'אסימון-סשן אומת-מול-גיטהאב (200)';
    } else if (extra && typeof extra.patVerified === 'boolean' && !extra.patVerified) {
      runtimeState = p.sessionPat ? 'DEGRADED' : 'BLOCKED';
      measured = p.sessionPat
        ? 'אסימון-צורה-תקינה שגיטהאב דוחה (401) — שרוף; כתיבה/פרטי מהסנדבוקס נופלים-סגור; עותקי-ענן חיים'
        : 'אין-אסימון-סשן — נפילה-סגורה עם עותקי-ענן חיים';
    } else {
      runtimeState = p.sessionPat ? d.state === 'DEGRADED' ? 'DEGRADED' : 'BLOCKED' : 'BLOCKED';
      measured = p.sessionPat ? 'אסימון-צורה-תקינה; אימות-חי טרם-רץ בקשה-זו' : 'אין-אסימון-סשן — נפילה-סגורה עם עותקי-ענן חיים';
    }
  }
  if (d.needs === 'owner-posting-steem') {
    runtimeState = p.ownerKeyFile ? 'SATISFIED' : 'BLOCKED';
    measured = p.ownerKeyFile ? 'קובץ-הבעלים קיים-מקומית (ללא-קריאת-תוכן)' : 'קובץ-הבעלים חסר — כניסת-בעלים תיפול-סגור';
  }
  if (d.needs === 'z-ai-brain-config') {
    runtimeState = p.zAiConfig ? 'SATISFIED-SANDBOX' : 'BLOCKED';
    measured = p.zAiConfig ? 'קונפיג-המוח קיים (ללא-קריאת-תוכן)' : 'קונפיג-המוח חסר';
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (!v) continue;
      measured += ` · ${k}: חי`;
    }
  }
  return {
    id: d.id,
    component: d.component,
    needs: d.needs,
    registryState: d.state,
    runtimeState,
    measured,
    ok: runtimeState.startsWith('SATISFIED'),
  };
}

/** סיכום-בריאות המלאי לשער-האפליקציה (על-מלאי-נתון — קנוני או מקומי) */
export function registryHealth(r: KeysRegistry = registry) {
  const p = runtimePresence();
  const byStatus = r.keys.reduce<Record<string, number>>((acc, k) => {
    acc[k.status] = (acc[k.status] ?? 0) + 1;
    return acc;
  }, {});
  const demandsSatisfied = r.demands.filter((d) => String(d.state).startsWith('SATISFIED')).length;
  return {
    keysTotal: r.keys.length,
    byStatus,
    demandsTotal: r.demands.length,
    demandsSatisfied,
    ownerGaps: r.ownerGaps.length,
    runtime: p,
  };
}
