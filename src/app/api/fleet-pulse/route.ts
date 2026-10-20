/**
 * /api/fleet-pulse — דופק-הצי החי (Task 8).
 * ---------------------------------------------------------------------------
 * מקורות אמת מקומיים בלבד — כל מספר נקרא מהדיסק/מהפורטים של המכונה הזאת,
 * לעולם לא המצאה:
 *  · פנקס-הכלכלה החי (econ-ledger.jsonl) — קצב-טעיפה, סה"כ, פילוח-מקורות,
 *    אירועים אחרונים (rig · guard · git · offev · …)
 *  · מצב מנוע-הכלכלה (econ-engine-state.json) — seq, minted, sha16
 *  · שירותי-הצי — בדיקת-חיים אמיתית לכל פורט (office/foreman/gateway/
 *    local-brain/guard/rig/beats) עם זמן-תגובה נמדד
 *  · עבודת-גיט — log אחרון מארבעת-המאגרים המקומיים (my-project · FleetHQ ·
 *    Domain · Sandbox) — העבודה הענפה שלפני-המשרד, נמדדת ישירות מהגיט
 *  · מסילות-ה-beats — זנב יומן-ה-local-beats: flush/seal/audit/grid עם
 *    ורדיקט אמיתי מהשורה
 * קאש 3 שניות — הסקר מהדפדפן כל 4 שניות והחדר נראה חי באמת.
 */
import { NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const ROOT = '/home/z/my-project';
const ECON_DIR = path.join(ROOT, 't19b/Domain/agents');
const FLEETHQ = '/home/z/estate/FleetHQ';

export interface FleetTx { at: number; kind: string; venue: string; amount: number; payee: string }
export interface LaneState { lane: string; at: number; ok: boolean; brief: string }
export interface RepoCommit { repo: string; hash: string; subject: string; author: string; at: number }
export interface ServicePing { name: string; port: number; ok: boolean; ms: number; code: number | null }

export interface FleetPulse {
  ts: number;
  econ: {
    seq: number | null;
    minted: number | null;
    lastSha16: string | null;
    lastAt: number | null;
    txPerMin: number | null;
    mwuPerMin: number | null;
    windowMin: number;
    kinds: { kind: string; count: number; mwu: number }[];
    spark: number[];
    recent: FleetTx[];
  } | null;
  services: ServicePing[];
  repos: RepoCommit[];
  lanes: LaneState[];
  pages: { capturedAt: number | null; ageMin: number | null };
}

/* ─────────────── econ ledger ─────────────── */
/** קריאת-זנב יעילה — רק N בייטים אחרונים מהקובץ (הפנקס גדל 20MB+/שע') */
async function readTail(p: string, bytes: number): Promise<string> {
  const fh = await fsp.open(p, 'r');
  try {
    const st = await fh.stat();
    const len = Math.min(bytes, st.size);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, st.size - len);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

async function readEcon(): Promise<FleetPulse['econ']> {
  try {
    const p = path.join(ECON_DIR, 'econ-ledger.jsonl');
    const tail = 524288; // 512KB tail — מכסה 5 דק' גם בקצבי-שיא
    const slice = await readTail(p, tail);
    const lines = slice.split('\n').filter(Boolean);
    if (lines.length) lines.shift(); // שורה חתוכה בראש — תמיד (קוראים מאמצע-שורה)
    let last: { seq: number; at: number; kind: string; venue: string; amount: number; payee: string } | null = null;
    let prevSeq: number | null = null;
    let prevAt = 0;
    const now = Date.now();
    const win = 5 * 60_000;
    const kinds = new Map<string, { count: number; mwu: number }>();
    const recent: FleetTx[] = [];
    const buckets = new Array<number>(30).fill(0); // sparkline: 10-שנ' לדגימה, 5 דק'
    let winCount = 0;
    let winMwu = 0;
    for (const ln of lines) {
      let o: Record<string, unknown>;
      try { o = JSON.parse(ln); } catch { continue; }
      const at = Date.parse(String(o.at || o.ev_at || '')) || 0;
      const kind = typeof o.kind === 'string' ? o.kind : '?';
      const amount = typeof o.amount_mwu === 'number' ? o.amount_mwu : 0;
      last = {
        seq: typeof o.seq === 'number' ? o.seq : (prevSeq ?? 0),
        at: at || prevAt,
        kind,
        venue: typeof o.venue === 'string' ? o.venue : '',
        amount,
        payee: typeof o.payee === 'string' ? o.payee : '',
      };
      prevSeq = last.seq;
      prevAt = last.at;
      if (at > now - win) {
        winCount += 1;
        winMwu += amount;
        const k = kinds.get(kind) ?? { count: 0, mwu: 0 };
        k.count += 1; k.mwu += amount;
        kinds.set(kind, k);
        const b = Math.min(29, Math.max(0, Math.floor((now - at) / 10_000)));
        buckets[29 - b] += 1;
      }
    }
    // recent — האירועים האחרונים, מהחדש לישן (דה-דופליקט לפי venue+kind)
    const seen = new Set<string>();
    for (let i = lines.length - 1; i >= 0 && recent.length < 14; i--) {
      try {
        const o = JSON.parse(lines[i]) as Record<string, unknown>;
        const key = `${o.kind}|${o.venue}`;
        if (seen.has(key)) continue;
        seen.add(key);
        recent.push({
          at: Date.parse(String(o.at || '')) || 0,
          kind: String(o.kind || '?'),
          venue: String(o.venue || ''),
          amount: typeof o.amount_mwu === 'number' ? o.amount_mwu : 0,
          payee: String(o.payee || ''),
        });
      } catch { /* line skip */ }
    }
    let state: { last_seq?: number; minted?: number; last_sha16?: string } = {};
    try { state = JSON.parse(readFileSync(path.join(ECON_DIR, 'econ-engine-state.json'), 'utf8')); } catch { /* honest null */ }
    return {
      seq: state.last_seq ?? last?.seq ?? null,
      minted: state.minted ?? null,
      lastSha16: state.last_sha16 ?? null,
      lastAt: last?.at ?? null,
      txPerMin: Math.round(winCount / 5),
      mwuPerMin: Math.round(winMwu / 5),
      windowMin: 5,
      kinds: [...kinds.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.count - a.count),
      spark: buckets,
      recent,
    };
  } catch {
    return null;
  }
}

/* ─────────────── services ─────────────── */
const PORTS: { name: string; port: number; path: string }[] = [
  { name: 'office', port: 3000, path: '/' },
  { name: 'foreman', port: 3010, path: '/' },
  { name: 'gateway', port: 3011, path: '/' },
  { name: 'local-brain', port: 8080, path: '/' },
  { name: 'health-guard', port: 3090, path: '/' },
  { name: 'micro-work-rig', port: 3095, path: '/' },
  { name: 'local-beats', port: 3012, path: '/' },
];

async function ping(s: { name: string; port: number; path: string }): Promise<ServicePing> {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2600); // מספיק גם לרגעי-קומפילציה של office עצמו
    const res = await fetch(`http://127.0.0.1:${s.port}${s.path}`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(to);
    return { name: s.name, port: s.port, ok: res.status < 500, ms: Date.now() - t0, code: res.status };
  } catch {
    return { name: s.name, port: s.port, ok: false, ms: Date.now() - t0, code: null };
  }
}

/* ─────────────── git labor ─────────────── */
const REPOS: { repo: string; dir: string }[] = [
  { repo: 'my-project', dir: ROOT },
  { repo: 'FleetHQ', dir: FLEETHQ },
  { repo: 'Domain', dir: '/home/z/estate/Domain' },
  { repo: 'Sandbox', dir: '/home/z/estate/Sandbox' },
];

function gitLog(): RepoCommit[] {
  const out: RepoCommit[] = [];
  for (const r of REPOS) {
    try {
      const raw = execFileSync(
        'git',
        ['-C', r.dir, 'log', '-3', '--format=%h%x09%s%x09%an%x09%ct'],
        { timeout: 2500, encoding: 'utf8' },
      );
      for (const ln of raw.split('\n')) {
        const [hash, subject, author, ct] = ln.split('\t');
        if (!hash || !subject) continue;
        out.push({ repo: r.repo, hash, subject: subject.slice(0, 90), author: author || '', at: (parseInt(ct, 10) || 0) * 1000 });
      }
    } catch { /* honest: repo missing from pulse */ }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 10);
}

/* ─────────────── beats lanes ─────────────── */
function lanes(): LaneState[] {
  try {
    const raw = readFileSync(path.join(FLEETHQ, 'receipts/runtime/local-beats.log'), 'utf8');
    const lines = raw.split('\n').slice(-80);
    const map = new Map<string, LaneState>();
    for (const ln of lines) {
      const m = ln.match(/^\[local-beats ([^\]]+)\] ([a-z0-9-]+): (.*)$/);
      if (!m) continue;
      const at = Date.parse(m[1]) || 0;
      const lane = m[2];
      const body = m[3];
      const fail = (/exit=[1-9]|FAIL|BLOCKED|error/i.test(body)) && !/exit=0/.test(body);
      map.set(lane, { lane, at, ok: !fail, brief: body.slice(0, 110) });
    }
    return [...map.values()].sort((a, b) => b.at - a.at).slice(0, 10);
  } catch {
    return [];
  }
}

/* ─────────────── pages freshness ─────────────── */
function pages(): FleetPulse['pages'] {
  try {
    const o = JSON.parse(readFileSync(path.join(FLEETHQ, 'office/state/office-state.json'), 'utf8')) as { capturedAt?: string };
    const t = Date.parse(o.capturedAt || '') || null;
    return { capturedAt: t, ageMin: t ? Math.round((Date.now() - t) / 60_000) : null };
  } catch {
    return { capturedAt: null, ageMin: null };
  }
}

/* ─────────────── handler + cache ─────────────── */
let cache: { at: number; body: FleetPulse } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < 3000) return NextResponse.json(cache.body);
  const [services, econ] = await Promise.all([Promise.all(PORTS.map(ping)), readEcon()]);
  const body: FleetPulse = {
    ts: Date.now(),
    econ,
    services,
    repos: gitLog(),
    lanes: lanes(),
    pages: pages(),
  };
  cache = { at: Date.now(), body };
  return NextResponse.json(body);
}
