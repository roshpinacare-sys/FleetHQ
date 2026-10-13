/**
 * truth-bridge.ts — הצד-החי של גשר-האמת (דפדפן בלבד).
 * ---------------------------------------------------------------------------
 * סקר-מחזורי של /api/office-state → הזרמה לחנות (store) בדיוק בחוזה של
 * הפורמן: syncSnapshot + syncGit + syncBubble + setTruth + syncConnected.
 * אין כאן שום סימולציה: אם המקור נכשל — החדר מראה "מנותק" בכנות.
 */
'use client';

import { useHq } from './store';
import { buildSnapshot, buildTruth, type BeaconRaw, type ForemanRaw, type OfficePulseRaw } from './truth';

interface WirePayload {
  fetchedAt: string;
  foreman: { ok: boolean; error?: string; state?: ForemanRaw };
  pulse: { ok: boolean; error?: string; data?: OfficePulseRaw };
  beacon: { ok: boolean; error?: string; data?: BeaconRaw };
  git: { ok: boolean; error?: string; commits?: { hash: string; subject: string; author: string; ts: number; repo: string }[] };
}

/** מקורות-האמת הציבוריים — מוגשים גם דרך /api/office-state (סנדבוקס) וגם
 *  ישירות מ-raw.githubusercontent (CORS פתוח) לגרסה הסטטית ב-Domain. */
const RAW_BASE = 'https://raw.githubusercontent.com/roshpinacare-sys';

async function fetchJsonDirect<T>(url: string, timeoutMs = 9000): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** איסוף ישיר מהמקורות (סטטי, ללא שרת) — כנות זהה: מה שנכשל נשאר לא-זמין */
async function gatherDirect(): Promise<WirePayload> {
  const [foremanState, pulseData, beaconData, ghCommits] = await Promise.all([
    fetchJsonDirect<ForemanRaw>(`${RAW_BASE}/FleetHQ/main/office/state/office-state.json`),
    fetchJsonDirect<OfficePulseRaw>(`${RAW_BASE}/Domain/main/office/data.json`),
    fetchJsonDirect<BeaconRaw>(`${RAW_BASE}/sovereign-beacon/main/state.json`),
    fetchJsonDirect<{ sha?: string; commit?: { message?: string; author?: { name?: string }; committer?: { name?: string } } }[]>(
      'https://api.github.com/repos/roshpinacare-sys/FleetHQ/commits?per_page=8',
    ),
  ]);
  const commits = Array.isArray(ghCommits)
    ? ghCommits
        .filter((c) => c?.sha && c?.commit?.message)
        .map((c) => ({
          hash: c.sha!.slice(0, 10),
          subject: c.commit!.message!.split('\n')[0].slice(0, 90),
          author: c.commit!.author?.name || c.commit!.committer?.name || 'unknown',
          ts: Date.parse((c.commit!.author as { date?: string } | undefined)?.date || '') || Date.now(),
          repo: 'FleetHQ',
        }))
    : undefined;
  return {
    fetchedAt: new Date().toISOString(),
    foreman: { ok: !!foremanState, ...(foremanState ? { state: foremanState } : { error: 'unavailable' }) },
    pulse: { ok: !!pulseData, ...(pulseData ? { data: pulseData } : { error: 'unavailable' }) },
    beacon: { ok: !!beaconData, ...(beaconData ? { data: beaconData } : { error: 'unavailable' }) },
    git: { ok: !!commits?.length, ...(commits?.length ? { commits } : { error: 'unavailable' }) },
  };
}

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

export async function pullTruthOnce(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    // ערוץ ראשון: ה-API המקומי (סנדבוקס). אם אין שרת (גרסה סטטית) — מקורות ישירים.
    let payload: WirePayload | null = null;
    try {
      const res = await fetch('/api/office-state', { cache: 'no-store', signal: AbortSignal.timeout(9000) });
      if (res.ok) payload = (await res.json()) as WirePayload;
    } catch {
      payload = null;
    }
    if (!payload) payload = await gatherDirect();
    if (!payload) throw new Error('no truth source');
    const p = payload;

    const snap = buildSnapshot(p.foreman.state ?? null, p.pulse.data ?? null, p.beacon.data ?? null);
    useHq.getState().syncSnapshot(snap);

    // בועות-דיבור אמיתיות מהפיד → יומן 'say' (הדמויות מדברות אמת)
    for (const f of snap.feed) {
      if (f.agentId && f.text) useHq.getState().syncBubble(f.agentId, f.text);
    }

    // קיר-הגיט: קומיטים אמיתיים או כנות-פנויה
    useHq.getState().syncGit({
      available: !!p.git.ok,
      repoUrl: 'https://github.com/roshpinacare-sys/FleetHQ',
      repoLabel: 'FleetHQ',
      branch: 'main',
      commits: p.git.commits ?? [],
      lastFetch: Date.parse(p.fetchedAt) || Date.now(),
    });

    useHq.getState().setTruth(buildTruth(
      p.foreman.state ?? null,
      p.pulse.data ?? null,
      p.beacon.data ?? null,
      [
        ...(p.foreman.ok ? [] : ['foreman']),
        ...(p.pulse.ok ? [] : ['pulse']),
        ...(p.beacon.ok ? [] : ['beacon']),
        ...(p.git.ok ? [] : ['git']),
      ],
    ));
    useHq.getState().syncConnected(p.foreman.ok);
  } catch {
    // כנות בכשל: החדר מציג "מנותק" — אף מספר לא מומצא
    useHq.getState().syncConnected(false);
  } finally {
    inFlight = false;
  }
}

/** מתחיל את הסקר; מחזיר פונקציית עצירה */
export function startTruthBridge(intervalMs = 45_000): () => void {
  void pullTruthOnce();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void pullTruthOnce(); }, intervalMs);
  return () => {
    if (timer) { clearInterval(timer); timer = null; }
  };
}
