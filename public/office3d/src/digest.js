/**
 * digest.js — גשר-הדיג'סט (exec-15). קורא את דיג'סט-הצי החי
 * (roshpinacare.fleet-digest/1) בלי לגעת בגשר office-state של data.js.
 *
 * חוק-אמת: כל ערך שמגיע מ-digest.json; מה שלא נמדד = 'לא ידוע' ואפור.
 * חוק-טריות 45/90: טרי ≤45 דק' (ירוק) · מתיישן ≤90 דק' (אמבר) · ישן >90 (אדום)
 * · אין נתון = unknown (אפור, '—'). אף כשל-אחזור לא זורק ללולאת-הרינדור.
 *
 * מקורות, בסדר:
 *   1. ../digest.json      — הדיג'סט בשורש האתר (אותו origin ב-office-pages)
 *   2. ./digest.json       — עותק מקומי לצד העמוד (אם פורסם)
 *   3. GitHub Pages החי    — נפילה-אחורה ציבורית (CORS מותר)
 */

const DIGEST_SOURCES = [
  '../digest.json',
  './digest.json',
  'https://roshpinacare-sys.github.io/FleetHQ/digest.json',
];

const REFRESH_MS = 5 * 60_000; // ריענון כל 5 דק'

export class DigestBridge {
  constructor() {
    this.available = false;
    this.generatedAt = null; // מתוך הדיג'סט עצמו
    this.source = null;      // איזה מקור הצליח (שקיפות)
    this.error = null;       // כשל אחרון, כנה
    this.raw = null;
    this.lastFetchAt = 0;
    this.failCount = 0;
    this.listeners = new Set();
    this._timer = null;
  }

  // ───── דפוס מאזינים — זהה ל-DataBridge ─────
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.snapshot()); }

  async start() {
    await this.refresh();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.refresh(), REFRESH_MS);
  }

  /** אחזור JSON עם cache-busting + תמוט 9 שניות — כמו data.js */
  async fetchJson(url, timeoutMs = 9000) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  async refresh() {
    let got = null;
    let usedSrc = null;
    for (const url of DIGEST_SOURCES) {
      try {
        const j = await this.fetchJson(url);
        // קבלה רק אם זה באמת הדיג'סט (schema + מערך-ספרים)
        if (j && typeof j.schema === 'string' && j.schema.startsWith('roshpinacare.fleet-digest') && Array.isArray(j.repos)) {
          got = j; usedSrc = url;
          break;
        }
      } catch { /* כנה — המקור הבא בתור */ }
    }
    if (got) {
      this.raw = got;
      this.available = true;
      this.generatedAt = got.generatedAt || null;
      this.source = usedSrc;
      this.error = null;
      this.failCount = 0;
    } else {
      this.available = false;
      this.error = 'כל מקורות הדיג׳סט נכשלו';
      this.failCount++;
    }
    this.lastFetchAt = Date.now();
    this.emit();
  }

  // ───── חוק-טריות 45/90 ─────
  get ageMin() {
    if (!this.generatedAt) return Infinity;
    const t = Date.parse(this.generatedAt);
    return Number.isFinite(t) ? (Date.now() - t) / 60000 : Infinity;
  }

  get freshness() {
    if (!this.available || !Number.isFinite(this.ageMin)) return 'unknown';
    const a = this.ageMin;
    if (a <= 45) return 'fresh';
    if (a <= 90) return 'aging';
    return 'stale';
  }

  /** טריות לפי זמן-ריצה אחרון (lastRun.at) — אותו חוק 45/90 לכל ספר */
  static runFreshness(runAt) {
    if (!runAt) return 'unknown';
    const t = Date.parse(runAt);
    if (!Number.isFinite(t)) return 'unknown';
    const a = (Date.now() - t) / 60000;
    if (a <= 45) return 'fresh';
    if (a <= 90) return 'aging';
    return 'stale';
  }

  /** צבע-מצב ריצה: ירוק הצלחה · אדום כשל · אמבר בעבודה · אפור לא-ידוע */
  static runColor(run) {
    if (!run) return '#8a857c';
    const c = run.conclusion;
    const s = run.status;
    if (c === 'success') return '#3e7d5a';
    if (c && c !== 'null' && c !== 'success') return '#b0483a'; // failure / timed_out / cancelled / startup_failure
    if (s === 'in_progress' || s === 'pending' || s === 'queued' || s === 'waiting' || s === 'requested') return '#b28a2e';
    return '#8a857c';
  }

  /** נרמול ספרי-הצי — שדות אמיתיים בלבד מהדיג'סט, בלי המצאות */
  get repos() {
    if (!this.raw || !Array.isArray(this.raw.repos)) return [];
    return this.raw.repos.map((r) => ({
      name: r.name || '—',
      pushedAt: r.pushedAt || null,
      defaultBranch: r.defaultBranch || null,
      runName: r.lastRun?.name ?? null,
      runStatus: r.lastRun?.status ?? null,
      runConclusion: r.lastRun?.conclusion ?? null,
      runAt: r.lastRun?.at ?? null,
      runUrl: r.lastRun?.url ?? null,
      commits7d: (typeof r.commits7d === 'number') ? r.commits7d : null,
      commits7dCapped: r.commits7dCapped === true,
      runFreshness: DigestBridge.runFreshness(r.lastRun?.at),
      color: DigestBridge.runColor(r.lastRun),
    }));
  }

  snapshot() {
    return {
      available: this.available,
      generatedAt: this.generatedAt,
      ageMin: this.ageMin,
      freshness: this.freshness,
      source: this.source,
      error: this.error,
      lastFetchAt: this.lastFetchAt,
      repos: this.repos,
      schema: this.raw?.schema || null,
      tokenMode: this.raw?.tokenMode || null,
      note: this.raw?.note || null,
    };
  }
}
