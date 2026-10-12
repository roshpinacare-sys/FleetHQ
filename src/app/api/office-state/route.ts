/**
 * /api/office-state — מקרר-האמת של המשרד (צד-שרת בלבד).
 * ---------------------------------------------------------------------------
 * מאגד את מקורות-האמת הציבוריים (keyless, raw.githubusercontent):
 *  · FleetHQ office/state/office-state.json — הפורמן האמיתי
 *  · Domain office/data.json — דופק המשרד (verdict/עורקים)
 *  · sovereign-beacon state.json — אמת כלכלית (אוצרה/מפעילים/ראש-שרשרת)
 *  · FleetHQ commits atom — קיר הגיט (keyless, ללא מגבלת-API)
 * כל מקור נכשל לבד (fail-soft) — התשובה תמיד כנה לגבי מה שחסר.
 * Cache: זיכרון-מקומי 60 שניות (מקור-גיט 180 שניות) — אין תשתית חיצונית.
 */
import { NextResponse } from 'next/server';
import type { BeaconRaw, ForemanRaw, OfficePulseRaw } from '@/lib/hq/truth';

export const revalidate = 0;

const RAW = 'https://raw.githubusercontent.com/roshpinacare-sys';
const TTL_MS = 60_000;
const GIT_TTL_MS = 180_000;

interface CommitViewWire { hash: string; subject: string; author: string; ts: number; repo: string }

interface Payload {
  fetchedAt: string;
  foreman: { ok: boolean; error?: string; state?: ForemanRaw };
  pulse: { ok: boolean; error?: string; data?: OfficePulseRaw };
  beacon: { ok: boolean; error?: string; data?: BeaconRaw };
  git: { ok: boolean; error?: string; commits?: CommitViewWire[] };
}

type CacheBox = { at: number; data: Payload };
const g = globalThis as unknown as { __officeStateCache?: CacheBox; __officeGitCache?: CacheBox };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** קיר-הגיט: קומיטים אמיתיים מפיד-ה-atom הציבורי (keyless, בלי מגבלת-API) */
async function fetchGitCommits(): Promise<CommitViewWire[] | null> {
  const cached = g.__officeGitCache;
  if (cached && Date.now() - cached.at < GIT_TTL_MS && cached.data.git.ok) {
    return cached.data.git.commits ?? null;
  }
  try {
    const res = await fetch('https://github.com/roshpinacare-sys/FleetHQ/commits/main.atom', {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
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
    return commits;
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  const cached = g.__officeStateCache;
  if (cached && now - cached.at < TTL_MS) {
    return NextResponse.json(cached.data, { headers: { 'x-office-cache': 'hit' } });
  }

  const [foremanRaw, pulseRaw, beaconRaw, commits] = await Promise.all([
    fetchJson<ForemanRaw>(`${RAW}/FleetHQ/main/office/state/office-state.json`),
    fetchJson<OfficePulseRaw>(`${RAW}/Domain/main/office/data.json`),
    fetchJson<BeaconRaw>(`${RAW}/sovereign-beacon/main/state.json`),
    fetchGitCommits(),
  ]);

  const payload: Payload = {
    fetchedAt: new Date().toISOString(),
    foreman: { ok: !!foremanRaw, ...(foremanRaw ? { state: foremanRaw } : { error: 'unavailable' }) },
    pulse: { ok: !!pulseRaw, ...(pulseRaw ? { data: pulseRaw } : { error: 'unavailable' }) },
    beacon: { ok: !!beaconRaw, ...(beaconRaw ? { data: beaconRaw } : { error: 'unavailable' }) },
    git: { ok: !!commits, ...(commits ? { commits } : { error: 'unavailable' }) },
  };

  g.__officeStateCache = { at: now, data: payload };
  return NextResponse.json(payload, { headers: { 'x-office-cache': 'miss' } });
}
