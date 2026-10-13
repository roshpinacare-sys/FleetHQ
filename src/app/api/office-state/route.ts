/**
 * /api/office-state — מקרר-האמת של המשרד (צד-שרת בלבד). [T-audit מהדורה-שנייה]
 * ---------------------------------------------------------------------------
 * · כל-מקור-אמת נאחזר דרך gh-truth: ציבורי=raw, פרטי=API-מאומת-שרת.
 *   (לפני-התיקון: מקורות-פרטיים נאחזרו אנונימית והחזירו 404 תמידי — מיושן-מלידה.)
 * · SWR: אין-חסימות-ארוכות; תשובה מיידית מהקאש + רענון-רקע.
 * · כל-מקור נושא fetchedAt + ageMs + חוק-חיות: נתון-גולמי עתיק (>24h) מסומן stale.
 * · fail-soft לכל-מקור — התשובה תמיד כנה לגבי מה שחסר.
 */
import { NextResponse } from 'next/server';
import { fetchTruth, ageMs } from '@/lib/gh-truth';
import type { BeaconRaw, ForemanRaw, OfficePulseRaw } from '@/lib/hq/truth';

export const revalidate = 0;

const TTL_MS = 60_000;
const GIT_TTL_MS = 180_000;
const STALE_LAW_MS = 24 * 60 * 60 * 1000; // חוק-החיות: >24h = היסטורי

interface AtomBox { commits: CommitViewWire[]; fetchedAt: string }
const g2 = globalThis as unknown as { __officeAtomCache?: { at: number; v: AtomBox | null; refreshing?: boolean } };

interface CommitViewWire { hash: string; subject: string; author: string; ts: number; repo: string }

interface SourceBox<T> {
  ok: boolean;
  error?: string;
  data?: T;
  fetchedAt?: string;
  ageMs?: number;
  /** נתון-המקור-עצמו עתיק מ-24h (חוק-החיות של מדיניות-הפרסום) */
  staleData?: boolean;
}

interface Payload {
  fetchedAt: string;
  /** חוזה-הגשר: `state` (פורמן) + קופסת-הטריות הכללית */
  foreman: SourceBox<ForemanRaw> & { state?: ForemanRaw };
  pulse: SourceBox<OfficePulseRaw>;
  beacon: SourceBox<BeaconRaw>;
  git: { ok: boolean; error?: string; commits?: CommitViewWire[]; fetchedAt?: string; ageMs?: number };
}

/** חילוץ חותמת-זמן מן-הנתון-הגולמי (best-effort, לחוק-החיות) */
function extractTs(d: unknown, depth = 0): number | null {
  if (!d || typeof d !== 'object' || depth > 2) return null;
  const o = d as Record<string, unknown>;
  for (const k of ['at', 'updatedAt', 'generatedAt', 'publishedAt', 'measuredAt', 'fetchedAt', 'timestamp']) {
    const v = o[k];
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object') {
      const t = extractTs(v, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

function box<T>(r: { ok: boolean; data: T | null; error?: string; fetchedAt: string }): SourceBox<T> {
  if (!r.ok || r.data === null) {
    return { ok: false, error: r.error ?? 'unavailable', fetchedAt: r.fetchedAt, ageMs: ageMs(r.fetchedAt) };
  }
  const ts = extractTs(r.data);
  return {
    ok: true,
    data: r.data,
    fetchedAt: r.fetchedAt,
    ageMs: ageMs(r.fetchedAt),
    ...(ts !== null && Date.now() - ts > STALE_LAW_MS ? { staleData: true } : {}),
  };
}

export async function GET() {
  const [foreman, pulse, beacon, commits] = await Promise.all([
    fetchTruth<ForemanRaw>('FleetHQ', 'office/state/office-state.json', { ttlMs: TTL_MS }),
    fetchTruth<OfficePulseRaw>('Domain', 'office/data.json', { ttlMs: TTL_MS }),
    fetchTruth<BeaconRaw>('sovereign-beacon', 'state.json', { ttlMs: TTL_MS }),
    fetchGitCommits(),
  ]);

  const payload: Payload = {
    fetchedAt: new Date().toISOString(),
    // חוזה-ה-wire של הגשר (truth-bridge): `state` לפורמן, `data` לשאר — אסור לשבור
    foreman: { ...box(foreman), state: foreman.data ?? undefined },
    pulse: box(pulse),
    beacon: box(beacon),
    git: commits
      // [T22-תיקון-באג] commits הוא AtomBox ({commits[], fetchedAt}) — ה-wire חייב
      // להחזיר את המערך עצמו, לא את הקופסה (נמדד: קריסת .map בקיר-הגיט)
      ? { ok: true, commits: commits.commits, fetchedAt: commits.fetchedAt, ageMs: ageMs(commits.fetchedAt) }
      : { ok: false, error: 'unavailable' },
  };

  return NextResponse.json(payload, { headers: { 'x-office-cache': 'swr' } });
}

/** קיר-הגיט: קומיטים אמיתיים מפיד-ה-atom הציבורי (keyless, בלי מגבלת-API) — SWR */
async function fetchGitCommits(): Promise<AtomBox | null> {
  const c = g2.__officeAtomCache;
  if (c && Date.now() - c.at < GIT_TTL_MS) return c.v;
  if (c && !c.refreshing) {
    c.refreshing = true;
    void fetchAtom()
      .then((v) => { g2.__officeAtomCache = { at: Date.now(), v }; })
      .finally(() => { const cur = g2.__officeAtomCache; if (cur) cur.refreshing = false; });
    return c.v;
  }
  if (c?.refreshing) return c.v;
  const v = await fetchAtom();
  g2.__officeAtomCache = { at: Date.now(), v };
  return v;
}

async function fetchAtom(): Promise<AtomBox | null> {
  try {
    const res = await fetch('https://github.com/roshpinacare-sys/FleetHQ/commits/main.atom', {
      cache: 'no-store', signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const entries = xml.split('<entry>').slice(1, 9);
    const commits: CommitViewWire[] = [];
    for (const e of entries) {
      const id = /Commit\/([0-9a-f]{10,40})/i.exec(e)?.[1];
      const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(e)?.[1]?.trim();
      const name = /<name>([^<]*)<\/name>/.exec(e)?.[1]?.trim();
      const updated = /<updated>([^<]*)<\/updated>/.exec(e)?.[1];
      if (!id || !title) continue;
      commits.push({
        hash: id.slice(0, 10),
        subject: title.slice(0, 90),
        author: name || 'unknown',
        ts: updated ? Date.parse(updated) || Date.now() : Date.now(),
        repo: 'FleetHQ',
      });
    }
    return commits.length ? { commits, fetchedAt: new Date().toISOString() } : null;
  } catch {
    return null;
  }
}

// הערה: fetchGitCommits נקראת לפני הגדרתה — hoisting של function-declaration מכסה זאת.
