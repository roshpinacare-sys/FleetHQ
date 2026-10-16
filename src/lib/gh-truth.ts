/**
 * gh-truth.ts — אחזור-אמת מהגיט (צד-שרת בלבד). [T-audit]
 * ---------------------------------------------------------------------------
 * · ריפו-ציבורי  → raw.githubusercontent (מהיר, בלי-מכסת-API).
 * · ריפו-פרטי   → GitHub contents API עם PAT מקומי (ה-PAT לעולם לא יוצא מהשרת).
 * · Cache זיכרון + stale-while-revalidate: לקוח לעולם לא ממתין לרשת —
 *   תשובה מיידית מהמטבע-הישן, רענון ברקע. אין חסימה של 8 שניות.
 * · כל תשובה נושאת fetchedAt + ageMs — כנות-מלאה לגבי טריות הנתון.
 */
import { resolveGithubPat } from '@/lib/gh-pat';

const RAW = 'https://raw.githubusercontent.com';
const API = 'https://api.github.com';
const ORG = 'roshpinacare-sys';

/** ריפו-פרטיים (יאומתו מול ה-API; רשימה-זו רק בוחרת-נתיב-אחזור, לא חושפת-דבר) */
const PRIVATE_REPOS = new Set(['Sandbox', 'saos-runtime', 'sovereign-beacon', 'sovereign-lighthouse']);

function pat(): string {
  // [T24] פותר-אסימון אחיד — צורה-תקינה או אין
  return resolveGithubPat();
}

export interface TruthResult<T> {
  ok: boolean;
  data: T | null;
  fetchedAt: string;
  error?: string;
  /** מקור-האחזור — לשקיפות-מלאה בלי לחשוף נתיבי-מפתח */
  via: 'raw' | 'api' | 'cache';
}

interface CacheEntry {
  at: number;
  result: TruthResult<unknown>;
  refreshing?: boolean;
}

const g = globalThis as unknown as { __ghTruthCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (g.__ghTruthCache ??= new Map());

/** כמו fetchOnce אבל מחזיר טקסט גולמי — למקורות JSONL שאינם JSON תקני */
async function fetchOnceText(repo: string, path: string, ref: string, timeoutMs: number): Promise<TruthResult<string>> {
  const fetchedAt = new Date().toISOString();
  const priv = PRIVATE_REPOS.has(repo);
  if (!priv) {
    try {
      const res = await fetch(`${RAW}/${ORG}/${repo}/${ref}/${path}`, {
        cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { ok: false, data: null, fetchedAt, error: `http-${res.status}`, via: 'raw' };
      return { ok: true, data: await res.text(), fetchedAt, via: 'raw' };
    } catch {
      return { ok: false, data: null, fetchedAt, error: 'unreachable', via: 'raw' };
    }
  }
  const token = pat();
  if (!token) return { ok: false, data: null, fetchedAt, error: 'no-server-credentials', via: 'api' };
  try {
    const res = await fetch(`${API}/repos/${ORG}/${repo}/contents/${path}?ref=${ref}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'office-truth/1',
      },
      cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, data: null, fetchedAt, error: `http-${res.status}`, via: 'api' };
    return { ok: true, data: await res.text(), fetchedAt, via: 'api' };
  } catch {
    return { ok: false, data: null, fetchedAt, error: 'unreachable', via: 'api' };
  }
}

/** JSONL: מחזיר שורות מפורסות כאובייקטים (שורות-שבורות מדולגות בשקט) */
export function parseJsonl<T>(text: string, tail: number): T[] {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('{'));
  const out: T[] = [];
  for (const line of lines.slice(-tail)) {
    try { out.push(JSON.parse(line) as T); } catch { /* שורה-שבורה — נדלגת */ }
  }
  return out;
}

/** אחזור-טקסט עם אותו קאש+SWR (מקורות JSONL) */
export async function fetchTruthText(
  repo: string,
  path: string,
  opts: { ref?: string; ttlMs?: number; timeoutMs?: number } = {},
): Promise<TruthResult<string>> {
  const { ref = 'main', ttlMs = 60_000, timeoutMs = 7_000 } = opts;
  const key = `text:${repo}/${ref}/${path}`;
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.at < ttlMs) return entry.result as TruthResult<string>;
  if (entry) {
    if (!entry.refreshing) {
      entry.refreshing = true;
      try {
        const fresh = await fetchOnceText(repo, path, ref, timeoutMs);
        cache.set(key, { at: Date.now(), result: fresh });
      } catch { /* הישן נשאר */ } finally {
        const cur = cache.get(key);
        if (cur) cur.refreshing = false;
      }
    }
    return entry.result as TruthResult<string>;
  }
  const fresh = await fetchOnceText(repo, path, ref, timeoutMs);
  cache.set(key, { at: Date.now(), result: fresh });
  return fresh;
}

/** אחזור יחיד בלי-קאש */
async function fetchOnce<T>(repo: string, path: string, ref: string, timeoutMs: number): Promise<TruthResult<T>> {
  const fetchedAt = new Date().toISOString();
  const priv = PRIVATE_REPOS.has(repo);
  if (!priv) {
    try {
      const res = await fetch(`${RAW}/${ORG}/${repo}/${ref}/${path}`, {
        cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return { ok: false, data: null, fetchedAt, error: `http-${res.status}`, via: 'raw' };
      return { ok: true, data: (await res.json()) as T, fetchedAt, via: 'raw' };
    } catch {
      return { ok: false, data: null, fetchedAt, error: 'unreachable', via: 'raw' };
    }
  }
  // ריפו-פרטי: contents API עם-PAT (ה-PAT נשאר-בשרת)
  const token = pat();
  if (!token) return { ok: false, data: null, fetchedAt, error: 'no-server-credentials', via: 'api' };
  try {
    const res = await fetch(`${API}/repos/${ORG}/${repo}/contents/${path}?ref=${ref}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw',
        'User-Agent': 'office-truth/1',
      },
      cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, data: null, fetchedAt, error: `http-${res.status}`, via: 'api' };
    const txt = await res.text();
    try {
      return { ok: true, data: JSON.parse(txt) as T, fetchedAt, via: 'api' };
    } catch {
      return { ok: false, data: null, fetchedAt, error: 'non-json', via: 'api' };
    }
  } catch {
    return { ok: false, data: null, fetchedAt, error: 'unreachable', via: 'api' };
  }
}

/**
 * אחזור עם-קאש + SWR (אסינכרוני):
 *  · קאש-טרי (< ttl)  → מיידי (hit).
 *  · קאש-ישן          → מיידי-מהישן + רענון-רקע (stale-while-revalidate).
 *  · אין-קאש בכלל     → חסימה-אחת (cold-start יחיד; אחר-כך תמיד מיידי).
 */
export async function fetchTruth<T>(
  repo: string,
  path: string,
  opts: { ref?: string; ttlMs?: number; timeoutMs?: number } = {},
): Promise<TruthResult<T>> {
  const { ref = 'main', ttlMs = 60_000, timeoutMs = 7_000 } = opts;
  const key = `${repo}/${ref}/${path}`;
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && now - entry.at < ttlMs) {
    return entry.result as TruthResult<T>;
  }
  if (entry) {
    // SWR: מגישים-ישן מיד; רענון-רקע פעם-אחת לכל-המרבה
    if (!entry.refreshing) {
      entry.refreshing = true;
      try {
        const fresh = await fetchOnce<T>(repo, path, ref, timeoutMs);
        cache.set(key, { at: Date.now(), result: fresh });
      } catch {
        /* הישן נשאר; מחזור-הבא ינסה שוב */
      } finally {
        const cur = cache.get(key);
        if (cur) cur.refreshing = false;
      }
    }
    return entry.result as TruthResult<T>;
  }
  // cold-start: חסימה-יחידה
  const fresh = await fetchOnce<T>(repo, path, ref, timeoutMs);
  cache.set(key, { at: Date.now(), result: fresh });
  return fresh;
}

/** גיל במילישניות מאז fetchedAt */
export function ageMs(fetchedAt: string): number {
  return Math.max(0, Date.now() - Date.parse(fetchedAt));
}
