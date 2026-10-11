/**
 * gate.js — שער-הגיוס (exec-15): מבנה-שער בקצה האולם + לוח-HUD חי.
 * ניזון מ-potential.json (roshpinacare.potential/1) בלבד — כל ערך מהמקור,
 * חוק-טריות 45/90, '—' ללא-נתון, כשל מוסבר בעברית ולא מוסתר.
 *
 * מקורות, בסדר:
 *   1. ../potential.json  — שורש האתר (אותו origin ב-office-pages)
 *   2. ./potential.json   — עותק מקומי לצד העמוד (אם פורסם)
 *   3. GitHub Pages החי   — נפילה-אחורה ציבורית
 */

import * as THREE from 'three';
import { RECRUIT_GATE } from './canon.js';
import { makeNameplate } from './textures.js';

const GATE_SOURCES = [
  '../potential.json',
  './potential.json',
  'https://roshpinacare-sys.github.io/FleetHQ/potential.json',
];

const REFRESH_MS = 10 * 60_000; // ריענון כל 10 דק'

const FRESH_COLOR = {
  fresh: '#3e7d5a',    // ירוק — טרי
  aging: '#b28a2e',    // אמבר — מתיישן
  stale: '#b0483a',    // אדום — ישן
  unknown: '#8a857c',  // אפור — לא ידוע
};
const FRESH_HE = { fresh: 'טרי', aging: 'מתיישן', stale: 'ישן', unknown: 'לא ידוע' };

export class RecruitmentGate {
  constructor(scene) {
    this.available = false;
    this.generatedAt = null;
    this.source = null;
    this.error = null;
    this.raw = null;
    this.lastFetchAt = 0;
    this.failCount = 0;
    this.listeners = new Set();
    this._hudSig = null;
    this._timer = null;

    this.buildGate(scene);
    this.$panel = document.getElementById('gatePanel');
    this.bindPanelToggle();
  }

  // ───── דפוס מאזינים — זהה ל-DataBridge ─────
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this.snapshot()); }

  // ───── המבנה בעולם ─────
  buildGate(scene) {
    const { x, z, face, w, h } = RECRUIT_GATE;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = face;

    const stone = new THREE.MeshStandardMaterial({ color: '#8a7a62', roughness: 0.88 });
    // שני עמודי-אבן
    for (const sx of [-(w / 2 + 0.14), w / 2 + 0.14]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), stone);
      p.position.set(sx, h / 2, 0);
      p.castShadow = true;
      g.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), stone);
      cap.position.set(sx, h + 0.06, 0);
      g.add(cap);
    }
    // משקוף
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.72, 0.2, 0.3), stone);
    lintel.position.y = h + 0.2;
    g.add(lintel);
    // אדן-מדרגה
    const step = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.1, 0.7), stone);
    step.position.y = 0.05;
    step.receiveShadow = true;
    g.add(step);
    // מישור-השער — זוהר לפי טריות הנתונים (לעולם לא ירוק-מזויף)
    this.portalMat = new THREE.MeshStandardMaterial({
      color: '#2e2b26', emissive: FRESH_COLOR.unknown, emissiveIntensity: 0.9, roughness: 0.4,
      transparent: true, opacity: 0.5,
    });
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(w, h - 0.1), this.portalMat);
    portal.position.y = (h - 0.1) / 2 + 0.05;
    g.add(portal);
    // שלט-השער
    const plate = makeNameplate('שער-הגיוס', 'פוטנציאל · גיוס · התראות', '#c2792e');
    plate.position.set(0, h + 0.75, 0);
    g.add(plate);
    // אור-פנימי עדין
    this.portalLight = new THREE.PointLight(FRESH_COLOR.unknown, 2.2, 5.5, 1.8);
    this.portalLight.position.set(0, h * 0.6, 0.4);
    g.add(this.portalLight);

    scene.add(g);
  }

  bindPanelToggle() {
    if (!this.$panel) return;
    const head = this.$panel.querySelector('#gatePanelHead');
    if (head) {
      head.addEventListener('click', () => {
        const collapsed = this.$panel.classList.toggle('collapsed');
        this.$panel.classList.toggle('open', !collapsed);
        head.setAttribute('aria-expanded', String(!collapsed));
      });
    }
  }

  // ───── אחזור נתונים ─────
  async start() {
    await this.refresh();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.refresh(), REFRESH_MS);
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
    let got = null;
    let usedSrc = null;
    for (const url of GATE_SOURCES) {
      try {
        const j = await this.fetchJson(url);
        if (j && typeof j.schema === 'string' && j.schema.startsWith('roshpinacare.potential')) {
          got = j; usedSrc = url;
          break;
        }
      } catch { /* כנה — המקור הבא */ }
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
      this.error = 'כל מקורות potential.json נכשלו';
      this.failCount++;
    }
    this.lastFetchAt = Date.now();
    this.applyToScene();
    this.renderHud();
    this.emit();
  }

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

  snapshot() {
    const r = this.raw || {};
    return {
      available: this.available,
      generatedAt: this.generatedAt,
      ageMin: this.ageMin,
      freshness: this.freshness,
      source: this.source,
      error: this.error,
      motto: r.motto || null,
      openWork: Array.isArray(r.openWork) ? r.openWork : null,
      officeRecruitment: r.officeRecruitment || null,
      ghostsVerification: r.ghostsVerification || null,
      theater: r.theater || null,
    };
  }

  // ───── השער משקף את טריות הנתונים ─────
  applyToScene() {
    const c = FRESH_COLOR[this.freshness] || FRESH_COLOR.unknown;
    if (this.portalMat) this.portalMat.emissive.set(c);
    if (this.portalLight) this.portalLight.color.set(c);
  }

  update(t) {
    if (this.portalMat) {
      this.portalMat.emissiveIntensity = 0.8 + Math.sin(t * 2.0) * 0.25;
    }
    if (this.portalLight) {
      this.portalLight.intensity = 2.0 + Math.sin(t * 2.0 + 1.1) * 0.5;
    }
  }

  // ───── לוח-HUD (DOM, עברית, RTL) ─────
  renderHud() {
    if (!this.$panel) return;
    const snap = this.snapshot();
    const minute = Math.floor(Date.now() / 60000); // רינדור לכל-היותר פעם-בדקה (הגיל נמדד)
    const sig = JSON.stringify(snap).slice(0, 4000) + ':' + minute;
    if (sig === this._hudSig) return;
    this._hudSig = sig;

    const srcEl = this.$panel.querySelector('#gateSrc');
    if (srcEl) {
      if (snap.available && snap.generatedAt) {
        const age = Number.isFinite(snap.ageMin) ? `${Math.max(0, Math.round(snap.ageMin))} דק'` : '—';
        srcEl.textContent = `potential.json · ${FRESH_HE[snap.freshness]} · ${age}`;
        srcEl.className = 'gateSrc ' + snap.freshness;
        srcEl.title = 'נוצר: ' + snap.generatedAt;
      } else {
        srcEl.textContent = 'potential.json · לא ידוע';
        srcEl.className = 'gateSrc unknown';
        srcEl.title = snap.error || 'אין חיבור';
      }
    }
    const body = this.$panel.querySelector('#gateBody');
    if (!body) return;

    if (!snap.available) {
      body.innerHTML = `<div class="gateFail">השער סגור — אין חיבור ל-potential.json (${escapeHtml(snap.error || 'כשל לא ידוע')}). כל הערכים מוצגים 'לא ידוע' עד לחיבור. אין כאן ירוק-מזויף.</div>`;
      return;
    }

    const parts = [];
    // 1) עבודה פתוחה (openWork)
    const ow = snap.openWork || [];
    parts.push(section('עבודה פתוחה', ow.length, ow.length
      ? ow.map((it) => row(
          it?.title || it?.id || '—',
          chip(statusHe(it?.status), statusClass(it?.status), it?.status),
          it?.evidence || '',
        )).join('')
      : emptyList()));
    // 2) תפקידי-המשרד (officeRecruitment.roles — title.he, status)
    const rec = snap.officeRecruitment;
    const roles = Array.isArray(rec?.roles) ? rec.roles : [];
    const rolesCount = typeof rec?.rolesCount === 'number' ? rec.rolesCount : roles.length;
    parts.push(section('תפקידי-המשרד', rolesCount, roles.length
      ? roles.map((r) => {
          const he = r?.title?.he || r?.title?.en || r?.id || '—';
          const st = r?.status || null;
          const cls = st === 'FILLED' ? 'ok' : st === 'PROPOSED' ? 'neutral' : 'neutral';
          const heSt = st === 'FILLED' ? 'אויש' : st === 'PROPOSED' ? 'מוצע' : (st || '—');
          return row(he, chip(heSt, cls, st), r?.mechanismEvidence || '');
        }).join('')
      : emptyList()));
    // 3) אימות-רפאים (ghostsVerification)
    const gh = snap.ghostsVerification;
    if (gh && typeof gh.measured === 'number') {
      parts.push(section('אימות-רפאים', gh.measured,
        row(`רפאים שנמדדו`, chip(String(gh.measured), 'neutral', 'measured'), gh.evidence || '')));
    } else {
      parts.push(section('אימות-רפאים', null, row('—', chip('לא ידוע', 'neutral', null), '')));
    }
    // 4) התראות-תיאטרון (theater.items — מחרוזות אמת)
    const th = snap.theater;
    const items = Array.isArray(th?.items) ? th.items : [];
    const tCount = typeof th?.count === 'number' ? th.count : items.length;
    parts.push(section('התראות-תיאטרון', tCount, items.length
      ? items.map((s) => row(String(s), chip('התראה', 'bad', 'theater'), '')).join('')
      : (tCount > 0
        ? `<div class="gateEmpty">נספרו ${tCount} התראות אך הרשימה לא הגיעה — לא ידוע.</div>`
        : `<div class="gateEmpty">אין התראות תיאטרון כרגע.</div>`)));

    body.innerHTML = parts.join('');
  }
}

// ───── עזרי-DOM ─────
function section(title, count, inner) {
  const n = (typeof count === 'number') ? ` · ${count}` : ' · —';
  return `<div class="gateSec"><div class="gateSecT">${title}${n}</div>${inner}</div>`;
}

function row(title, chipHtml, sub) {
  return `<div class="gateRow"><div class="gateRowT">${escapeHtml(title)} ${chipHtml}</div>${sub ? `<div class="gateRowS">${escapeHtml(sub)}</div>` : ''}</div>`;
}

function chip(text, cls, raw) {
  const t = text || '—';
  return `<span class="gchip ${cls || 'neutral'}" title="${raw ? escapeHtml(String(raw)) : 'לא ידוע'}">${t}</span>`;
}

function emptyList() {
  return '<div class="gateEmpty">אין פתוחים כרגע.</div>';
}

/** סטטוס-עבודה → עברית כנה (raw נשמר ב-title) */
function statusHe(st) {
  if (!st) return '—';
  const map = {
    'open-for-recruiting': 'פתוח-לגיוס',
    'flagged-lane-dex': 'מסלול-מסומן',
    claimed: 'נתבע',
    resolved: 'נפתר',
  };
  return map[st] || st;
}

function statusClass(st) {
  if (!st) return 'neutral';
  if (String(st).includes('open')) return 'work';
  if (String(st).includes('flagged')) return 'bad';
  return 'neutral';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
