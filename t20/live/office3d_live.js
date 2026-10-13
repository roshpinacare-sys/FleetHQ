/**
 * live.js — גשר-השידור החי של המשרד.
 *
 * עיקרון: המשרד הוא שידור, לא סימולציה-מקומית. העולם חי בשירות-השידור
 * (office-live) וממשיך להתקיים גם כשאף דף לא פתוח. הדפדפן צופה: מקבל
 * פריימים, מחליק אותם, ומציג אירועים. בלי שידור — כנות מלאה: חזרה
 * למצב המקומי עם סימון מפורש, לעולם לא "שידור מזויף".
 *
 * חיבור דרך השער: io('/?XTransformPort=3036') — יחסי בלבד, אין פורט בכתובת.
 */

export class LiveBridge {
  constructor({ crew, ui, data, setBroadcastMode, onDeskScreens }) {
    this.crew = crew;
    this.ui = ui;
    this.data = data;
    this.setBroadcastMode = setBroadcastMode; // 'broadcast' | 'world' | null
    this.onDeskScreens = onDeskScreens;       // (activities, screenMode)
    this.socket = null;
    this.connected = false;
    this.eventsSeen = new Set();
    this.ticks = 0;
    this.lastActs = '';
    this.world = null;
    this.localLoop = null;
    this.lastEvTs = 0;
    this.gaveUpSocket = false;
    this.canonT = 0; // זמן-פעימת-הגריד שאנחנו מוצמדים אליה (לצ'יפ הכנה)
  }

  /** צגי-שולחן רק כשהפעילות באמת השתנתה — אין ציור-קנבס בכל פריים */
  maybeDeskScreens(acts, mode) {
    const key = JSON.stringify(acts);
    if (key === this.lastActs) return;
    this.lastActs = key;
    this.onDeskScreens(acts, mode);
  }

  start() {
    // סדר-ניסיון: שידור-חי (socket) → עולם-קנוני מהפעימה (world-state.json)
    // → המצב המקומי הכנה. שידור הוא השיא; עולם-קנוני הוא הרצפה האמיתית.
    this.socketAttempt();
    // אם אין שידור תוך 6ש — עוברים לעולם-הקנוני בלי לחכות לגרייס מלא
    setTimeout(() => { if (!this.connected) this.worldAttempt('אין שידור זמין'); }, 6000);
  }

  socketAttempt() {
    if (typeof window === 'undefined' || !window.io) {
      this.worldAttempt('socket.io client לא נטען');
      return;
    }
    try {
      this.socket = window.io('/?XTransformPort=3036', {
        path: '/',
        transports: ['websocket', 'polling'],
        reconnectionDelayMax: 8000,
        timeout: 6000,
      });
    } catch (e) {
      this.worldAttempt('חיבור-שידור נכשל: ' + (e?.message || e));
      return;
    }
    this.socket.on('connect', () => {
      this.connected = true;
      this.stopLocalLoop();
      this.setBroadcastMode('broadcast');
      this.ui.setMode('broadcast', { stateAgeMin: 0 });
      try { this.socket.emit('hello', () => {}); } catch { /* כנה */ }
    });
    this.socket.on('world', (w) => {
      // תמונת-מצב מלאה: עדכון פעילויות לצגי-שולחן + יומן-אירועים עדכני
      try {
        const acts = {};
        for (const a of w.agents || []) acts[a.id] = a.activity || '';
        this.maybeDeskScreens(acts, 'live');
        for (const ev of (w.events || []).slice(-5)) this.surfaceEvent(ev);
      } catch { /* כנה */ }
    });
    this.socket.on('tick', (f) => {
      try {
        this.ticks++;
        this.crew.applyExternalFrame(f);
        const acts = {};
        for (const a of f.ag || []) acts[a.id] = a.activity || '';
        this.maybeDeskScreens(acts, 'live');
        for (const ev of f.ev || []) this.surfaceEvent(ev);
      } catch { /* כנה — שידור לא יפיל את המשרד */ }
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
      this.worldAttempt('השידור התנתק');
    });
    this.socket.on('connect_error', () => {
      if (!this.connected) this.worldAttempt('אין מענה משירות-השידור');
    });
  }

  /** מצב-עולם: ממשיכים את העולם הקנוני מפעימת-הגריד (world-state.json) */
  async worldAttempt(reason) {
    if (this.connected || this.world) return;
    this.gaveUpSocket = true;
    try { if (this.socket) this.socket.disconnect(); } catch { /* כנה */ }
    try {
      const mod = await import('./engine.js');
      // סדר-מקורות: אותו-בית (Pages: /office/world-state.json) → פרוקסי-הקונסולה
      let w = null;
      for (const url of ['../office/world-state.json', '/api/office/world']) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) continue;
          w = mod.fromJSON(await res.json());
          break;
        } catch { /* המקור הבא */ }
      }
      if (!w) throw new Error('no canon source reachable');
      this.canonT = w.t;
      const ageMin = Math.max(0, Math.round((Date.now() - w.t) / 60000));
      mod.advanceWorld(w, Date.now());
      this.world = w;
      this.setBroadcastMode('world');
      this.ui.setMode('world', { stateAgeMin: ageMin });
      this.ui.pushTicker('עולם מתמשך — ממשיכים את המשמרת מהפעימה הקנונית של הגריד', `פעימה בת ${ageMin} דק'`);
      // צגי-שולחן מהעולם + התחלת צעד מקומי של אותו עולם
      const acts = {};
      for (const a of w.agents) acts[a.id] = a.activity || '';
      this.maybeDeskScreens(acts, 'live');
      this.stopLocalLoop();
      this.localLoop = setInterval(() => {
        try {
          this.ticks++;
          mod.stepWorld(this.world, 0.25);
          const f = mod.worldFrame(this.world, this.lastEvTs);
          if (f.ev.length) this.lastEvTs = f.ev[f.ev.length - 1].ts;
          this.crew.applyExternalFrame(f);
          const acts2 = {};
          for (const a of f.ag) acts2[a.id] = a.activity || '';
          this.maybeDeskScreens(acts2, 'live');
          for (const ev of f.ev) this.surfaceEvent(ev);
          // פעימה-קנונית חדשה נחתה? נצמדים אליה (קומיט חדש של worldbeat) + צ'יפ-כנה
          if (this.ticks % 240 === 0) {
            this.refreshCanon(mod);
            try {
              this.ui.setMode('world', { stateAgeMin: Math.max(0, Math.round((Date.now() - this.canonT) / 60000)) });
            } catch { /* כנה */ }
          }
        } catch { /* כנה */ }
      }, 250);
    } catch (e) {
      // גם העולם הקנוני לא זמין — כנות מלאה: המצב המקומי מסומן
      this.localHonest('עולם-קנוני לא נטען: ' + (e?.message || e));
    }
  }

  async refreshCanon(mod) {
    for (const url of ['../office/world-state.json', '/api/office/world']) {
      try {
        const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) continue;
        const fresh = mod.fromJSON(await res.json());
        if (fresh.t > this.world.t) {
          // הגריד הקדים אותנו — מתאחדים עם השושלת הקנונית
          this.canonT = fresh.t;
          this.world = fresh;
        }
        return;
      } catch { /* המקור הבא */ }
    }
  }

  stopLocalLoop() {
    if (this.localLoop) { clearInterval(this.localLoop); this.localLoop = null; }
  }

  surfaceEvent(ev) {
    if (!ev || !ev.text) return;
    const key = `${ev.ts}|${ev.who}|${ev.text}`;
    if (this.eventsSeen.has(key)) return;
    this.eventsSeen.add(key);
    if (this.eventsSeen.size > 400) {
      this.eventsSeen = new Set(Array.from(this.eventsSeen).slice(-200));
    }
    try {
      this.ui.bubble(ev.who, ev.text, 6000, true);
      this.ui.pushTicker(ev.text, `${ev.who} · שידור חי`);
    } catch { /* כנה */ }
  }

  /** כנות בהיעדר הכול: המצב המקומי מסומן, הגשר קובע */
  localHonest(reason) {
    this.setBroadcastMode(null);
    try {
      this.ui.pushTicker('העולם המתמשך אינו זמין — המשרד ממשיך מהמצב המקומי ומסומן בכנות', reason || 'אין מקור');
    } catch { /* כנה */ }
    try { this.data.refresh(); } catch { /* כנה */ }
  }
}
