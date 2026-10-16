/**
 * GitWallData.tsx — קיר-הגיט החי (Task 8 — זרם-העבודה, במקום טבלה סטטית).
 * ------------------------------------------------------------------
 * Task 8: הקיר מציג את זרם-העבודה האמיתי — קומיטים חיים מארבעת-המאגרים
 * המקומיים (my-project · FleetHQ · Domain · Sandbox), נקראים ישירות מהגיט
 * המקומי דרך /api/fleet-pulse (git log — לא המצאה, לא סנאפשוט ישן).
 * · שורה = קומיט: נושא · ספר · hash · גיל-יחסי · נקודת-טריות לפי גיל
 *   (≤10 דק' ok · ≤60 דק' attention · מעלה danger — החוק-האחד)
 * · כותרת-עליונה: רצף-פנקס-הכלכלה החי + sha16 — העבודה שנמדדה עכשיו
 * · כנות: בלי דופק — מסך "ממתין לדופק", לעולם לא שורות מדומות
 * · window.__hqWall = { updatedAt, reposRendered } — ל-probe.
 */
'use client';

import { useEffect } from 'react';
import { DynTex, relHe } from '@/lib/hq/textures';
import { useHq } from '@/lib/hq/store';

// ─────────────── חוקי-צבע סמנטיים (ערכי-אור מ-DESIGN.md §2) ───────────────
export const SEMANTIC = {
  ok: '#3ddc97',
  danger: '#ff6b5e',
  working: '#a8741c',
  attention: '#ffb054',
  neutral: '#716d64',
  ink3: '#8b867b',
} as const;

export interface WallRepoRow {
  name: string;
  dotColor: string;
  statusLabel: string;
  /** גיל-יחסי נמדד */
  commitsLabel: string;
}

export interface Freshness {
  tone: 'ok' | 'attention' | 'danger';
  label: string;
  unknown: boolean;
  minutes: number | null;
}

/** חוק-הטריות: ≤45 דק' ok · 45–90 attention "מאוחר" · >90 danger "לא ידוע — מת" · בלי-זמן danger "לא ידוע" */
export function computeFreshness(updatedAtMs: number | null | undefined): Freshness {
  if (!updatedAtMs || !Number.isFinite(updatedAtMs)) {
    return { tone: 'danger', label: 'לא ידוע', unknown: true, minutes: null };
  }
  const mins = (Date.now() - updatedAtMs) / 60000;
  const ago = mins < 1 ? 'עכשיו' : mins < 60 ? `${Math.round(mins)} דק'` : `${Math.floor(mins / 60)} שע'`;
  if (mins <= 45) return { tone: 'ok', label: `טרי · ${ago}`, unknown: false, minutes: mins };
  if (mins <= 90) return { tone: 'attention', label: `מאוחר · ${ago}`, unknown: false, minutes: mins };
  return { tone: 'danger', label: `לא ידוע — מת · ${ago}`, unknown: true, minutes: mins };
}

/** חוק-טריות-קומיט (Task 8): ≤10 דק' ok · ≤60 attention · מעלה danger · בלי-זמן ink3 */
function commitDot(atMs: number | null | undefined): string {
  if (!atMs || !Number.isFinite(atMs)) return SEMANTIC.ink3;
  const mins = (Date.now() - atMs) / 60000;
  if (mins <= 10) return SEMANTIC.ok;
  if (mins <= 60) return SEMANTIC.attention;
  return SEMANTIC.danger;
}

// ─────────────── לוח-הקנבס של הקיר ───────────────
interface BoardData {
  rows: WallRepoRow[];
  /** חותמת-הזמן הנמדדת של הדופק */
  updatedAtMs: number | null;
  /** רצף-פנקס-הכלכלה + sha16 */
  seq: number | null;
  sha16: string | null;
  /** tx/min חי */
  txPerMin: number | null;
}

const W = 1280;
const H = 720;
const HEADER_H = 88;
const COLHEAD_H = 40;
const FOOTER_H = 56;
const ROW_H = 64;
const MAX_ROWS = Math.floor((H - HEADER_H - COLHEAD_H - FOOTER_H) / ROW_H);

const REPO_TAG: Record<string, string> = {
  'my-project': 'משרד',
  FleetHQ: 'מפקדה',
  Domain: 'רשת',
  Sandbox: 'מעבדה',
};

function makeGitWallBoard() {
  let data: BoardData = { rows: [], updatedAtMs: null, seq: null, sha16: null, txPerMin: null };
  const dyn = new DynTex(W, H, (ctx) => {
    const fresh = computeFreshness(data.updatedAtMs);
    ctx.fillStyle = '#0a0f0c';
    ctx.fillRect(0, 0, W, H);
    // רשת עדינה
    ctx.strokeStyle = 'rgba(120,200,160,0.05)'; ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 64) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = 0; gy < H; gy += 64) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // ── כותרת + צ'יפ טריות ──
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.strokeStyle = 'rgba(140,200,160,0.16)';
    ctx.beginPath(); ctx.moveTo(0, HEADER_H + 0.5); ctx.lineTo(W, HEADER_H + 0.5); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#dce8df';
    ctx.font = "700 36px 'Heebo',system-ui,sans-serif";
    ctx.fillText('קיר הגיט · זרם-העבודה החי', W - 28, HEADER_H / 2 - 4);
    const tone = fresh.tone === 'ok' ? SEMANTIC.ok : fresh.tone === 'attention' ? SEMANTIC.attention : SEMANTIC.danger;
    ctx.textAlign = 'left';
    ctx.font = "600 26px 'Heebo',system-ui,sans-serif";
    const chipX = 28 + 16;
    ctx.fillStyle = tone;
    ctx.fillText(fresh.label, chipX + 12, HEADER_H / 2 - 4);
    ctx.beginPath();
    ctx.arc(chipX, HEADER_H / 2 - 4, 8, 0, 7);
    ctx.fill();

    // ── רצועת-הרצף החי — העבודה שנמדדה עכשיו ──
    ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(150,162,152,0.85)';
    ctx.font = "600 21px 'Heebo',system-ui,sans-serif";
    ctx.fillText('קומיט', W - 28, HEADER_H + COLHEAD_H / 2);
    ctx.textAlign = 'left';
    ctx.font = "500 19px ui-monospace,monospace";
    ctx.fillStyle = 'rgba(84,216,192,0.9)';
    const seqTxt = data.seq !== null
      ? `רצף ${data.seq.toLocaleString('he-IL')} · ${data.txPerMin !== null ? `${data.txPerMin} tx/דק'` : '—'}`
      : 'רצף —';
    ctx.fillText(seqTxt, 28, HEADER_H + COLHEAD_H / 2);

    // ── שורות קומיטים ──
    const rows = data.rows.slice(0, MAX_ROWS);
    rows.forEach((r, i) => {
      const y = HEADER_H + COLHEAD_H + i * ROW_H;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.028)';
        ctx.fillRect(12, y, W - 24, ROW_H);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(12, y + ROW_H + 0.5); ctx.lineTo(W - 12, y + ROW_H + 0.5); ctx.stroke();
      // נקודת-טריות — קצה ימין
      ctx.fillStyle = r.dotColor;
      ctx.beginPath();
      ctx.arc(W - 44, y + ROW_H / 2, 9, 0, 7);
      ctx.fill();
      // נושא-הקומיט — מיושר ימין (RTL)
      ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillStyle = '#e4eee6';
      ctx.font = "600 27px 'Heebo',system-ui,sans-serif";
      const nm = r.name.length > 44 ? r.name.slice(0, 43) + '…' : r.name;
      ctx.fillText(nm, W - 72, y + ROW_H / 2 - 12);
      // תג-הספר · hash מתחת
      ctx.fillStyle = 'rgba(150,162,152,0.8)';
      ctx.font = "500 19px 'Heebo',system-ui,sans-serif";
      ctx.fillText(r.statusLabel, W - 72, y + ROW_H / 2 + 15);
      // גיל-יחסי — מונו משמאל
      ctx.direction = 'ltr'; ctx.textAlign = 'left';
      ctx.font = "500 25px ui-monospace,monospace";
      ctx.fillStyle = r.dotColor === SEMANTIC.ink3 ? 'rgba(139,134,123,0.95)' : '#cfdad1';
      ctx.fillText(r.commitsLabel, 28, y + ROW_H / 2);
    });

    // ── מצב-ריק כן ──
    if (!rows.length) {
      ctx.direction = 'rtl'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(139,134,123,0.9)';
      ctx.font = "500 30px 'Heebo',system-ui,sans-serif";
      ctx.fillText('— אין דופק עדיין · ממתין לזרם-האמת', W / 2, (HEADER_H + COLHEAD_H + H - FOOTER_H) / 2);
    }

    // ── תחתית: מקור כן + sha16 ──
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
    ctx.strokeStyle = 'rgba(140,200,160,0.12)';
    ctx.beginPath(); ctx.moveTo(0, H - FOOTER_H + 0.5); ctx.lineTo(W, H - FOOTER_H + 0.5); ctx.stroke();
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(150,162,152,0.85)';
    ctx.font = "500 21px 'Heebo',system-ui,sans-serif";
    const extra = data.rows.length - rows.length;
    const left = extra > 0 ? ` (+${extra} נוספים)` : '';
    ctx.fillText(`מקור: git log מקומי · 4 ספרים${left}`, W - 28, H - FOOTER_H / 2);
    ctx.textAlign = 'left';
    ctx.font = "500 20px ui-monospace,monospace";
    ctx.fillStyle = tone;
    ctx.fillText(`● ${data.sha16 ?? 'sha16 —'}`, 28, H - FOOTER_H / 2);
  });
  return {
    tex: dyn.tex,
    set(next: BoardData) {
      const sig = next.rows.map((r) => `${r.name}|${r.dotColor}|${r.commitsLabel}`).join('#') + '|' + (next.updatedAtMs ?? '') + '|' + (next.seq ?? '') + '|' + (next.txPerMin ?? '');
      const prevSig = data.rows.map((r) => `${r.name}|${r.dotColor}|${r.commitsLabel}`).join('#') + '|' + (data.updatedAtMs ?? '') + '|' + (data.seq ?? '') + '|' + (data.txPerMin ?? '');
      data = next;
      if (sig !== prevSig) dyn.markDirty();
    },
    bump() { dyn.markDirty(); },
    update: (now: number) => dyn.update(now),
  };
}

export type GitWallBoard = ReturnType<typeof makeGitWallBoard>;
let _board: GitWallBoard | null = null;
/** מופע-יחיד (עצל) — נוצר בצד-לקוח בלבד */
export function gitBoard(): GitWallBoard {
  if (!_board) _board = makeGitWallBoard();
  return _board;
}

// ─────────────── ויסות window.__hqWall ───────────────
const hqWall = { updatedAt: null as number | null, reposRendered: 0 };

/** מזרים את זרם-העבודה החי (Task 8) אל לוח-הקיר: fleet כל 4שנ' + טיק-גיל 1שנ' */
export function GitWallSync() {
  useEffect(() => {
    const apply = () => {
      const f = useHq.getState().fleet;
      const rows: WallRepoRow[] = (f?.repos ?? []).map((c) => ({
        name: c.subject,
        dotColor: commitDot(c.at),
        statusLabel: `${REPO_TAG[c.repo] ?? c.repo} · ${c.hash}`,
        commitsLabel: relHe(c.at),
      }));
      gitBoard().set({
        rows,
        updatedAtMs: f?.ts ?? null,
        seq: f?.econ?.seq ?? null,
        sha16: f?.econ?.lastSha16 ?? null,
        txPerMin: f?.econ?.txPerMin ?? null,
      });
      hqWall.updatedAt = f?.ts ?? null;
      hqWall.reposRendered = rows.length;
      (window as unknown as Record<string, unknown>).__hqWall = hqWall;
    };
    apply();
    // טיק-ציור: DynTex מצויר רק דרך update() — הגיל-היחסי חי כל שנייה
    const repaint = setInterval(() => { apply(); gitBoard().update(Date.now()); }, 1000);
    return () => clearInterval(repaint);
  }, []);
  return null;
}
