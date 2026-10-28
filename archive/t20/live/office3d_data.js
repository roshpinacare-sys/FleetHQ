/**
 * data.js — גשר הנתונים האמיתיים. חוק-האמת: מה שנטען מגיע מהגיט החי
 * (office-state.json של FleetHQ + הפעימות של Domain). אין חיבור → נאמר
 * במפורש "מצב הדגמה מסומן" — לעולם לא ירוק-מזויף.
 *
 * מקורות, בסדר:
 *   1. ?src= — כתובת שניתנה מארח העמוד (פרוקסי מקומי)
 *   2. office-state.json באותה תיקייה (עותק שפורסם ל-office-pages)
 *   3. raw.githubusercontent.com — FleetHQ office-state + Domain office pulse
 */

const FHQ_STATE = 'https://raw.githubusercontent.com/roshpinacare-sys/FleetHQ/main/office/state/office-state.json';
const DOMAIN_PULSE = 'https://raw.githubusercontent.com/roshpinacare-sys/Domain/main/office/data.json';

export class DataBridge {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.srcParam = q.get('src');
    this.state = null;
    this.pulse = null;
    this.mode = 'connecting'; // live | stale | sim | connecting
    this.listeners = new Set();
    this.lastFetch = 0;
    this.failCount = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.snapshot()); }

  async start() {
    await this.refresh();
    setInterval(() => this.refresh(), 60_000);
    // ריענון-צגים שוטף (גלילת לוגים)
    setInterval(() => this.emit(), 8_000);
  }

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
    let ok = false;
    let best = this.state; // נעדיף את ה-state הטרי ביותר מכל המקורות
    const newer = (a, b) => {
      const ta = a?.capturedAt ? Date.parse(a.capturedAt) : -1;
      const tb = b?.capturedAt ? Date.parse(b.capturedAt) : -1;
      return ta > tb ? a : (b || a);
    };
    // 1) מקור-ראשי: פרוקסי מקומי (?src=) שמחזיר {state, pulse} — או עותק מקומי
    if (this.srcParam) {
      try {
        const both = await this.fetchJson(this.srcParam);
        if (both && (both.state || both.pulse)) {
          if (both.state) { best = newer(best, both.state); ok = true; }
          if (both.pulse) this.pulse = both.pulse;
        }
      } catch { /* כנה */ }
    } else {
      try {
        const s = await this.fetchJson('office-state.json');
        if (s && (s.agents || s.capturedAt)) { best = newer(best, s); ok = true; }
      } catch { /* כנה */ }
    }
    // 2) raw GitHub — תמיד ננסה: הלב-החי מתעדכן שם כל שעתיים
    try {
      const s = await this.fetchJson(FHQ_STATE);
      if (s && (s.agents || s.capturedAt)) { best = newer(best, s); ok = true; }
    } catch { /* כנה */ }
    if (best && best !== this.state) this.state = best;
    if (!this.pulse) {
      try {
        this.pulse = await this.fetchJson(DOMAIN_PULSE);
      } catch { /* כנה */ }
    }

    if (ok) {
      this.failCount = 0;
      // קצב-הלב האמיתי הוא שעתיים — טרי עד 130 דק' נחשב חי; הגיל מוצג תמיד
      const age = this.stateAgeMin();
      this.mode = age <= 130 ? 'live' : 'stale';
    } else {
      this.failCount++;
      this.mode = this.failCount >= 2 ? 'sim' : this.mode;
    }
    this.lastFetch = Date.now();
    this.emit();
  }

  stateAgeMin() {
    if (!this.state?.capturedAt) return Infinity;
    const t = Date.parse(this.state.capturedAt);
    return Number.isFinite(t) ? (Date.now() - t) / 60000 : Infinity;
  }

  pulseAgeMin() {
    if (!this.pulse?.generatedAt) return Infinity;
    const t = Date.parse(this.pulse.generatedAt);
    return Number.isFinite(t) ? (Date.now() - t) / 60000 : Infinity;
  }

  snapshot() {
    const s = this.state;
    const mode = this.mode;
    // פעילות אמיתית לפי סוכן
    const activities = {};
    if (s?.agents) for (const a of s.agents) activities[a.id] = a.activity || '';
    // בועות אמיתיות מהפיד
    const bubbles = (s?.feed || []).filter((f) => typeof f.kind === 'string' && f.kind.startsWith('bubble:'));
    // קומיטים אמיתיים (מהפעימה — הגייט-חוט של הצי)
    const wire = this.pulse?.office?.wire || [];
    // משימות אמיתיות
    const tasks = s?.tasks || [];
    return {
      mode,
      stateAgeMin: this.stateAgeMin(),
      pulseAgeMin: this.pulseAgeMin(),
      verdict: this.pulse?.verdict || null,
      statusHe: s?.statusHe || null,
      agents: s?.agents || [],
      activities,
      bubbles,
      tasks,
      wire,
      books: s?.books ?? null,
      memory: s?.memory ?? null,
      counts: s?.counts || null,
      capturedAt: s?.capturedAt || null,
    };
  }

  /** טקסט לצג-שולחן: שורות אמיתיות אם יש, אחרת מסומן */
  deskLines(agentId) {
    const snap = this.snapshot();
    const act = snap.activities[agentId];
    const lines = [];
    if (act) {
      lines.push({ text: 'פעילות חיה: ' + act, ok: true });
    }
    const task = snap.tasks.find((t) => t.assignee === agentId) || snap.tasks.find((t) => t.status === 'doing');
    if (task) lines.push({ text: 'משימה: ' + String(task.title || '').slice(0, 34) });
    if (snap.statusHe) lines.push({ text: snap.statusHe.slice(0, 40) });
    if (!lines.length) {
      lines.push({ text: 'ממתין למשמרת הבאה…' }, { text: 'מצב הדגמה — ללא נתונים חיים', err: true });
    }
    return lines;
  }
}
