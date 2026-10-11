/**
 * ui.js — ממשק-הצפייה (ViewDeck v2): שבבי-מצב, רוסטר חי, סרגל-תצפית,
 * טיקר-פיד, כרטיס-סוכן, ובועות-דיבור מוקרנות מהעולם למסך.
 */

import { CREW } from './canon.js';

export class UI {
  constructor({ onFocus, onView, onRosterToggle }) {
    this.onFocus = onFocus;
    this.onView = onView;
    this.$ = (s) => document.querySelector(s);
    this.bubbles = new Map(); // id → {el, until, pos}
    this.bubbleLayer = this.$('#bubbles');
    this.selected = null;
    this.viewBtns = new Map();
    this.tickerItems = [];
    this.projector = null; // נקבע מ-main: (vec3) → {x,y,visible}
    this.buildDeck();
    this.buildRoster();

    this.$('#cardClose').addEventListener('click', () => this.hideCard());
    this.$('#rosterToggle').addEventListener('click', () => {
      this.$('#roster').classList.toggle('open');
      onRosterToggle?.();
    });

    // שעון
    const tickClock = () => {
      const d = new Date();
      this.$('#clock').textContent = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    };
    tickClock();
    setInterval(tickClock, 15_000);
  }

  // ───── סרגל-תצפית ─────
  buildDeck() {
    const views = [
      ['overview', 'מבט-על'], ['arc', 'קשת-הצוות'], ['flame', 'הלהבה'],
      ['taskwall', 'לוח-משימות'], ['gitwall', 'קיר-הגיט'], ['podium', 'הדוכן'],
      ['library', 'הספרייה'], ['coffee', 'בר-הקפה'],
    ];
    const inner = this.$('#deckInner');
    for (const [id, he] of views) {
      const b = document.createElement('button');
      b.className = 'vbtn';
      b.textContent = he;
      b.addEventListener('click', () => {
        this.setViewActive(id);
        this.onView?.(id);
      });
      this.viewBtns.set(id, b);
      inner.appendChild(b);
    }
    const sep = document.createElement('div');
    sep.className = 'sep';
    inner.appendChild(sep);
    const tour = document.createElement('button');
    tour.className = 'vbtn';
    tour.textContent = '▶ סיור אוטומטי';
    tour.addEventListener('click', () => {
      this.touring = !this.touring;
      tour.textContent = this.touring ? '⏸ עוצר סיור' : '▶ סיור אוטומטי';
      tour.classList.toggle('active', this.touring);
      this.onView?.(this.touring ? 'tour' : 'stop-tour');
    });
    this.tourBtn = tour;
    inner.appendChild(tour);
  }

  setViewActive(id) {
    for (const [vid, b] of this.viewBtns) b.classList.toggle('active', vid === id);
    if (this.touring && id) {
      this.touring = false;
      this.tourBtn.textContent = '▶ סיור אוטומטי';
      this.tourBtn.classList.remove('active');
    }
  }

  setTourActive() {
    this.tourBtn.textContent = '⏸ עוצר סיור';
    this.tourBtn.classList.add('active');
    for (const [, b] of this.viewBtns) b.classList.remove('active');
  }

  showViewTitle(he) {
    const el = this.$('#viewTitle');
    el.textContent = he;
    el.classList.add('show');
    clearTimeout(this._vt);
    this._vt = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // ───── רוסטר ─────
  buildRoster() {
    const list = this.$('#rosterList');
    this.rows = new Map();
    for (const c of CREW) {
      const row = document.createElement('button');
      row.className = 'agentRow';
      row.innerHTML = `
        <span class="avatar" style="background:${c.color}">${c.he[0]}</span>
        <span class="info">
          <span class="nm">${c.he} <small>${c.role}</small></span>
          <span class="act">מתעורר…</span>
        </span>
        <span class="st idle"></span>`;
      row.addEventListener('click', () => {
        this.selected = c.id;
        this.markSelected();
        this.showCard(c);
        this.onFocus?.(c.id);
      });
      list.appendChild(row);
      this.rows.set(c.id, row);
    }
  }

  markSelected() {
    for (const [id, row] of this.rows) row.classList.toggle('active', id === this.selected);
  }

  updateRoster(entries) {
    for (const e of entries) {
      const row = this.rows.get(e.id);
      if (!row) continue;
      const act = row.querySelector('.act');
      const st = row.querySelector('.st');
      const txt = e.live || e.label || '';
      if (act.textContent !== txt) act.textContent = txt;
      st.className = 'st ' + (e.moving ? 'walk' : (e.state === 'desk' || e.state === 'board' ? 'work' : 'idle'));
    }
  }

  showCard(c) {
    const card = this.$('#card');
    this.$('#cardAvatar').style.background = c.color;
    this.$('#cardAvatar').textContent = c.he[0];
    this.$('#cardName').textContent = c.he;
    this.$('#cardRole').textContent = c.role;
    this.$('#cardBody').innerHTML = `
      <div class="row"><b>תפקיד:</b> ${c.role}</div>
      <div class="row"><b>ספרים:</b> ${(c.books || []).map((b) => `<code>${b}</code>`).join(', ') || '—'}</div>
      <div class="row" id="cardLive"><b>עכשיו:</b> —</div>`;
    card.classList.add('show');
  }

  updateCardLive(entries) {
    if (!this.selected) return;
    const e = entries.find((x) => x.id === this.selected);
    const el = this.$('#cardLive');
    if (e && el) el.innerHTML = `<b>עכשיו:</b> ${e.live || e.label || '—'}`;
  }

  hideCard() {
    this.$('#card').classList.remove('show');
    this.selected = null;
    this.markSelected();
  }

  // ───── שבבי-מצב ─────
  setMode(mode, { verdict, stateAgeMin, pulseAgeMin }) {
    const pulse = this.$('#chipPulse');
    const pulseTxt = this.$('#pulseTxt');
    const modeChip = this.$('#chipMode');
    const modeTxt = this.$('#modeTxt');
    const fmt = (m) => (Number.isFinite(m) ? `${Math.max(0, Math.round(m))} דק'` : '—');

    if (mode === 'live') {
      pulse.className = 'chip ok';
      pulseTxt.textContent = `המשרד חי · עודכן לפני ${fmt(stateAgeMin)}`;
      modeChip.className = 'chip ok';
      modeTxt.textContent = 'מצב LIVE — נתונים אמיתיים';
    } else if (mode === 'stale') {
      pulse.className = 'chip warn';
      pulseTxt.textContent = `נתונים ישנים · ${fmt(stateAgeMin)} מאז עדכון`;
      modeChip.className = 'chip warn';
      modeTxt.textContent = 'מצב STALE — מוצג ביודעין';
    } else if (mode === 'sim') {
      pulse.className = 'chip';
      pulseTxt.textContent = 'אין חיבור חי';
      modeChip.className = 'chip bad';
      modeTxt.textContent = 'מצב הדגמה מסומן · DEMO · SIMULATION';
    } else {
      pulseTxt.textContent = 'מתחבר…';
    }
    if (verdict) pulseTxt.title = `פעימת-המשרד: ${verdict} · פעימה עודכנה לפני ${fmt(pulseAgeMin)}`;
    this.$('#rosterMode').textContent = mode === 'live' ? 'LIVE' : mode === 'stale' ? 'STALE' : 'SIM';
    this.$('#tickMode').textContent = mode === 'live' ? 'חי' : mode === 'stale' ? 'ישן' : 'הדגמה';
  }

  // ───── טיקר ─────
  pushTicker(text, sub) {
    const line = this.$('#tickerLine');
    const subEl = this.$('#tickerSub');
    line.style.opacity = '0';
    setTimeout(() => {
      line.textContent = text;
      subEl.textContent = sub || '';
      line.style.opacity = '1';
    }, 220);
  }

  // ───── בועות-דיבור ─────
  bubble(agentId, text, ms = 4200, live = false) {
    const c = CREW.find((x) => x.id === agentId);
    const el = document.createElement('div');
    el.className = 'bubble' + (live ? ' live' : '');
    el.innerHTML = `<span class="who" style="color:${c?.color || '#666'}">${c?.he || agentId}:</span> ${text}`;
    this.bubbleLayer.appendChild(el);
    const pos = { x: 0, y: 0, head: null };
    this.bubbles.set(agentId + ':' + Date.now(), { el, until: performance.now() + ms, pos, agentId });
    // הגבלה: 4 בועות
    while (this.bubbles.size > 4) {
      const first = this.bubbles.keys().next().value;
      const b = this.bubbles.get(first);
      b.el.remove();
      this.bubbles.delete(first);
    }
  }

  renderBubbles(project, headGetter) {
    const now = performance.now();
    for (const [key, b] of this.bubbles) {
      if (now > b.until) {
        b.el.classList.remove('show');
        setTimeout(() => b.el.remove(), 260);
        this.bubbles.delete(key);
        continue;
      }
      const head = headGetter(b.agentId);
      if (!head) continue;
      const p = project(head);
      if (!p.visible) { b.el.style.opacity = '0'; continue; }
      b.el.style.opacity = '';
      // הצמדה לתוך-המסך (לא נחתך בקצוות)
      const w = b.el.offsetWidth || 200;
      const x = Math.min(innerWidth - w / 2 - 8, Math.max(w / 2 + 8, p.x));
      b.el.style.left = x + 'px';
      b.el.style.top = (p.y - 14) + 'px';
    }
  }
}
