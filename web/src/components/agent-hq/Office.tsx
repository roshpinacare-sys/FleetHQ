'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import type { AgentView, BookView, CrewMember, GitPulse, LogEntry, Station, Task } from './types';
import { STATE_COLORS } from './types';
import { t, type Lang } from './i18n';

// The office floor — a warm, realistic operations room you can READ at a glance:
//   north wall: the task wall + THE GIT WIRE (the fleet's real commit stream)
//   west: the glass-front library · east: the decision stage with its big screen
//   south: the fleet registry board + coffee corner
//   five workstations with live monitors, and the crew walking between stations.
//
// Design law (Fleet HQ 3.0 — Glass & Gold, adapted from the TT design language
// and elevated for an operations room): hot charcoal #120d09, brushed gold
// #e0b45f as the ONE data accent, champagne #f5e3b8 for values, emerald for
// life, red only for errors. Brass lamps cast warm light shafts and breathing
// pools. Glass boards with gold frames sit in strict order on the north wall.
// Every moving part is driven by REAL data: state LEDs by agent state, task
// packets by live agent activity, the git wire by real commits.
//
// Hydration law: anything that depends on the wall clock renders only after
// mount (useNow) — the server and the first client render always agree.

const W = 1180;
const H = 640;

// ---- palette (warm charcoal & brushed gold) -------------------------------------------
const GOLD = '#e0b45f';
const GOLD_L = '#f5e3b8';
const GOLD_D = '#a8823a';
const EMBER = '#d98d4a';
const LIFE = '#34d399';
const RED = '#f87171';
const AMBER = '#fbbf24';
const CHALK = '#ece7dc';
const PANEL = '#1a130c';
const PANEL_EDGE = 'rgba(224, 180, 95, 0.32)';
const TITLE_BAR = '#22180e';

const DESKS: Record<string, { x: number; y: number }> = {
  gal: { x: 360, y: 330 },
  erez: { x: 590, y: 330 },
  tamar: { x: 820, y: 330 },
  shachar: { x: 470, y: 512 },
  yarden: { x: 710, y: 512 },
};

const STATIONS: Record<Exclude<Station, 'desk'>, { x: number; y: number }> = {
  wall: { x: 490, y: 196 },
  podium: { x: 1000, y: 300 },
  library: { x: 130, y: 352 },
  offstage: { x: 590, y: 640 },
};

// the front desk — עמית, the office representative, receives visitors here (south-east)
const RECEPTION = { x: 1020, y: 560 };
const COPPER = '#d98d4a';

const WORKER_ORDER = ['gal', 'erez', 'tamar', 'shachar', 'yarden'];

const SKIN = ['#e8c39e', '#d9a877', '#c68d5c', '#a86f45', '#8a5a36', '#e8c39e'];

/** Muted warm clothing per worker — the room stays in one warm family. */
const CLOTHES: Record<string, string> = {
  aluf: '#2b241c',
  gal: '#2f6f66',
  erez: '#a3742a',
  tamar: '#5c7a36',
  shachar: '#a85a3c',
  yarden: '#566d85',
};

/** Identity accents (stripes / selection) — warm, saturated, one per person. */
const ACCENT: Record<string, string> = {
  aluf: GOLD,
  gal: '#3ba08f',
  erez: EMBER,
  tamar: '#8fae4a',
  shachar: '#c96b4a',
  yarden: '#6b8aa5',
};

function agentPos(a: AgentView): { x: number; y: number } {
  if (a.station === 'desk') {
    const d = DESKS[a.id] ?? { x: 590, y: 450 };
    return d;
  }
  const s = STATIONS[a.station];
  if (!s) return { x: 590, y: 450 };
  const idx = WORKER_ORDER.indexOf(a.id);
  const j = idx >= 0 ? (idx - 2) * 30 : 0;
  return { x: s.x + j, y: s.y + (a.id === 'aluf' ? 0 : 6) };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function ageLabel(ts: number, lang: Lang, now: number): string {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return t('now', lang);
  if (m < 60) return lang === 'he' ? `${m}ד׳` : `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'he' ? `${h}ש׳` : `${h}h`;
  const d = Math.floor(h / 24);
  return lang === 'he' ? `${d}י׳` : `${d}d`;
}

/** 0 = deep night, 1 = mid-day (real UTC hour → the windows show the real sky). */
function dayFactor(ts: number): number {
  const h = new Date(ts).getUTCHours();
  if (h >= 7 && h < 17) return 1;
  if (h >= 5 && h < 7) return (h - 5) / 2;
  if (h >= 17 && h < 20) return 1 - (h - 17) / 3;
  return 0;
}

/** Wall-clock snapshot, client-only. null until mounted → SSR-safe rendering. */
function useNow(intervalMs = 30000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0); // after mount, async — hydration stays honest
    const iv = setInterval(update, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [intervalMs]);
  return now;
}

const isBusyState = (s: AgentStateLike) => s === 'thinking' || s === 'reading' || s === 'checking' || s === 'writing';
type AgentStateLike = AgentView['state'];

/** Quadratic bezier path task-wall → desk top (inbound work packet). */
function wallToDeskPath(d: { x: number; y: number }): string {
  const sx = 528;
  const sy = 184;
  const ex = d.x;
  const ey = d.y - 78;
  const cx = (sx + ex) / 2;
  const cy = Math.min(sy, ey) - 46;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
}

/** Quadratic bezier path desk → library (outbound report packet). */
function deskToLibraryPath(d: { x: number; y: number }): string {
  const sx = d.x - 84;
  const sy = d.y - 46;
  const ex = 218;
  const ey = 322;
  const cx = (sx + ex) / 2;
  const cy = Math.max(sy, ey) + 58;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
}

/** Quadratic bezier path desk → wall (completion status really returns to the wall). */
function deskToWallPath(d: { x: number; y: number }): string {
  const sx = d.x;
  const sy = d.y - 78;
  const ex = 528;
  const ey = 184;
  const cx = (sx + ex) / 2;
  const cy = Math.min(sy, ey) - 46;
  return `M ${sx} ${sy} Q ${cx} ${cy} ${ex} ${ey}`;
}

/** Thinking-trace waveform across a monitor — EEG harmonic law
 *  (sin(t·f)·0.8A + sin(t·1.5f)·0.2A + sin(t·2f)·0.1A), phase-shifted per desk. */
function eegWave(d: { x: number; y: number }, phase: number): string {
  const x0 = d.x - 60;
  const yBase = d.y - 85;
  let p = `M ${x0} ${yBase}`;
  for (let x = 6; x <= 112; x += 6) {
    const tt = (x / 112) * Math.PI * 2;
    const y = Math.sin(tt * 2 + phase) * 4 + Math.sin(tt * 3 + phase * 1.37) * 2 + Math.sin(tt * 5 + phase * 0.61) * 1;
    p += ` L ${(x0 + x).toFixed(1)} ${(yBase + y).toFixed(2)}`;
  }
  return p;
}

interface OfficeProps {
  lang: Lang;
  crew: CrewMember[];
  agents: Record<string, AgentView>;
  logs: Record<string, LogEntry[]>;
  tasks: Task[];
  books: BookView[];
  git?: GitPulse;
  openDecisions: number;
  reportsCount: number;
  newestReport?: string;
  bubbles: Record<string, { text: string; ts: number }>;
  selected: string | null;
  sim: boolean;
  receptionOpen: boolean;
  onSelectAgent: (id: string) => void;
  onOpenReception: () => void;
  onOpenTab: (tab: 'wall' | 'podium' | 'library' | 'fleet' | 'git') => void;
}

function OfficeInner(props: OfficeProps) {
  const { lang, crew, agents, logs, tasks, books, git, openDecisions, reportsCount, newestReport, bubbles, selected, sim, receptionOpen, onSelectAgent, onOpenReception, onOpenTab } = props;
  const now = useNow();
  const day = now === null ? null : dayFactor(now); // null = pre-mount neutral sky

  const byStatus = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], doing: [], review: [], done: [] };
    for (const task of tasks) if (cols[task.status]) cols[task.status].push(task);
    return cols;
  }, [tasks]);

  const staleBooks = books.filter((b) => (b.ageHours ?? 0) > 72 || b.ok === false).length;
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const commits = git?.available ? git.commits.slice(0, 6) : [];
  const commitCount = git?.available ? git.commits.length : 0;
  const freshest = commits[0];

  // live packet traffic: desks really pulling work / really shipping reports
  const inbound = (Object.entries(DESKS) as Array<[string, { x: number; y: number }]>).filter(([id]) => {
    const s = agents[id]?.state;
    return s === 'thinking' || s === 'reading' || s === 'checking';
  });
  const outbound = (Object.entries(DESKS) as Array<[string, { x: number; y: number }]>).filter(([id]) => agents[id]?.state === 'writing');
  const doneOut = (Object.entries(DESKS) as Array<[string, { x: number; y: number }]>).filter(([id]) => agents[id]?.state === 'done');

  const mono = "'JetBrains Mono', ui-monospace, monospace";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full select-none" role="img" aria-label="Fleet HQ office floor">
      <defs>
        {/* warm wood floor */}
        <linearGradient id="oq-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1e13" />
          <stop offset="45%" stopColor="#211710" />
          <stop offset="100%" stopColor="#140e08" />
        </linearGradient>
        {/* warm plaster wall */}
        <linearGradient id="oq-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#241a10" />
          <stop offset="72%" stopColor="#1b130c" />
          <stop offset="100%" stopColor="#140e09" />
        </linearGradient>
        <linearGradient id="oq-wainscot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#33241666" />
          <stop offset="100%" stopColor="#33241622" />
        </linearGradient>
        <linearGradient id="oq-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9c4" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffe9c4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="oq-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={day === null ? '#181210' : day > 0.5 ? '#7db8d4' : day > 0.15 ? '#c88a4a' : '#101724'} />
          <stop offset="100%" stopColor={day === null ? '#120d0c' : day > 0.5 ? '#b7d6e2' : day > 0.15 ? '#5a4a52' : '#182034'} />
        </linearGradient>
        {/* warm lamp light shaft */}
        <linearGradient id="oq-shaft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd98f" stopOpacity="0.14" />
          <stop offset="70%" stopColor="#ffd98f" stopOpacity="0.045" />
          <stop offset="100%" stopColor="#ffd98f" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="oq-pool" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.13" />
          <stop offset="55%" stopColor={GOLD} stopOpacity="0.05" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oq-lamp" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffe9c4" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ffe9c4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="oq-vignette" cx="50%" cy="46%" r="75%">
          <stop offset="60%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.52" />
        </radialGradient>
        <linearGradient id="oq-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#231910" />
          <stop offset="100%" stopColor="#191208" />
        </linearGradient>
        <linearGradient id="oq-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120d08" />
          <stop offset="100%" stopColor="#0a0705" />
        </linearGradient>
        <linearGradient id="oq-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9c4" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffe9c4" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="oq-goldbar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f5e3b8" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#e0b45f" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#a8823a" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="oq-rug" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a2f1c" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#33200f" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id="oq-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2d492" />
          <stop offset="55%" stopColor="#c99a4e" />
          <stop offset="100%" stopColor="#8a6a30" />
        </linearGradient>
        <pattern id="oq-scan" width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="1" fill={GOLD} opacity="0.05" />
        </pattern>
        <filter id="oq-glow-g" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="oq-glow-life" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ================= ROOM SHELL ================= */}
      <rect x="0" y="0" width={W} height={H} fill="url(#oq-floor)" />
      {/* wood plank perspective lines + seams */}
      <g stroke="#ffdfae" strokeOpacity="0.045">
        {Array.from({ length: 14 }, (_, i) => (
          <line key={`fh${i}`} x1="0" y1={212 + i * 31} x2={W} y2={212 + i * 31} />
        ))}
      </g>
      <g stroke="#000000" strokeOpacity="0.14">
        {Array.from({ length: 25 }, (_, i) => (
          <line key={`fv${i}`} x1={i * 49.2 - 40} y1="196" x2={(i - 11.8) * 118 + 590} y2={H} />
        ))}
      </g>
      {/* the big warm rug — anchors the work area */}
      <g pointerEvents="none">
        <rect x="330" y="392" width="520" height="180" rx="16" fill="url(#oq-rug)" />
        <rect x="338" y="400" width="504" height="164" rx="12" fill="none" stroke={GOLD} strokeOpacity="0.14" strokeWidth="1.6" />
        <rect x="346" y="408" width="488" height="148" rx="9" fill="none" stroke={GOLD} strokeOpacity="0.08" strokeWidth="1" />
      </g>
      {/* back wall */}
      <rect x="0" y="0" width={W} height="196" fill="url(#oq-wall)" />
      {/* wainscot rail + warm wall wash */}
      <rect x="0" y="150" width={W} height="40" fill="url(#oq-wainscot)" />
      <rect x="0" y="0" width={W} height="196" fill="url(#oq-sheen)" />
      {/* baseboard with a brass hairline */}
      <rect x="0" y="188" width={W} height="9" fill="#191009" />
      <rect x="0" y="186" width={W} height="1.6" fill={GOLD_D} opacity="0.5" />

      {/* ceiling rails + brass pendant lamps with warm light shafts */}
      <line x1="0" y1="8" x2={W} y2="8" stroke="#3a2c1a" strokeWidth="2" opacity="0.7" />
      {[350, 590, 830].map((x) => (
        <g key={`lamp-${x}`}>
          <line x1={x} y1="8" x2={x} y2="26" stroke="#4a3a22" strokeWidth="2.5" />
          {/* the shade — brass cone */}
          <path d={`M ${x - 22} 26 L ${x + 22} 26 L ${x + 26} 36 L ${x - 26} 36 Z`} fill="url(#oq-brass)" stroke="#6b5228" strokeWidth="0.8" />
          <ellipse cx={x} cy="37" rx="24" ry="6" fill="#ffe9c4" opacity="0.9" />
          {/* light shaft — widening cone to the floor */}
          <path d={`M ${x - 24} 38 L ${x + 24} 38 L ${x + 150} ${H} L ${x - 150} ${H} Z`} fill="url(#oq-shaft)" pointerEvents="none" />
        </g>
      ))}

      {/* ================= WINDOWS (real day-night sky) ================= */}
      {[
        { x: 52, y: 46 },
        { x: 52, y: 118 },
      ].map((p, i) => (
        <g key={`win-${i}`} transform={`translate(${p.x},${p.y})`}>
          <rect x="-4" y="-4" width="132" height="64" rx="4" fill="#160f0a" stroke="#4a3a22" strokeWidth="1.2" />
          <rect x="0" y="0" width="124" height="56" rx="2" fill="url(#oq-sky)" />
          {/* stars / sun by real hour */}
          {day !== null && day < 0.3 &&
            [14, 34, 58, 90, 108].map((sx, si) => (
              <circle key={si} cx={sx} cy={8 + ((si * 13) % 34)} r={si % 2 ? 0.9 : 1.3} fill="#efe4ff" opacity="0.85" />
            ))}
          {day !== null && day > 0.6 && <circle cx="96" cy="14" r="9" fill="#ffe9b0" opacity="0.95" />}
          {/* skyline silhouette */}
          <path d="M 0 44 L 0 38 L 14 38 L 14 30 L 26 30 L 26 42 L 44 42 L 44 34 L 58 34 L 58 44 L 78 44 L 78 36 L 92 36 L 92 44 L 124 44 L 124 56 L 0 56 Z" fill={day !== null && day > 0.4 ? '#2c4a56' : '#0a0e18'} opacity="0.9" />
          {day !== null && day < 0.4 &&
            [
              [10, 34], [20, 32], [50, 38], [84, 39], [98, 40],
            ].map(([lx, ly], li) => (
              <rect key={li} x={lx} y={ly} width="3" height="3" fill="#ffd9a3" opacity="0.8" />
            ))}
          <line x1="62" y1="0" x2="62" y2="56" stroke="#241a10" strokeWidth="3.5" />
          <line x1="0" y1="28" x2="124" y2="28" stroke="#241a10" strokeWidth="3" />
          {/* brass sill */}
          <rect x="-6" y="56" width="136" height="6" rx="2" fill="url(#oq-brass)" opacity="0.8" />
        </g>
      ))}

      {/* wall clock (Jerusalem) — brass bezel, hands only after mount (hydration-safe) */}
      <g transform="translate(232,74)">
        <circle r="17" fill="#241a10" stroke="url(#oq-brass)" strokeWidth="2.6" />
        <circle r="17" fill="none" stroke={GOLD} strokeWidth="0.6" opacity="0.3" />
        {now !== null && (
          <>
            <line x1="0" y1="0" x2="0" y2="-9" stroke={CHALK} strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${(new Date(now).getHours() % 12) * 30})`} />
            <line x1="0" y1="0" x2="0" y2="-12" stroke={CHALK} strokeWidth="1.2" strokeLinecap="round" transform={`rotate(${new Date(now).getMinutes() * 6})`} />
          </>
        )}
        <circle r="1.6" fill={EMBER} />
      </g>

      {/* ================= GIT WIRE BOARD (north-east — the real activity) ================= */}
      <g onClick={() => onOpenTab('git')} className="cursor-pointer">
        {freshest && now !== null && now - freshest.ts < 26000 && <circle cx="974" cy="109" r="86" fill={GOLD} opacity="0.05" className="hq-pulse" />}
        <rect x="806" y="38" width="336" height="142" rx="6" fill="url(#oq-panel)" stroke={PANEL_EDGE} strokeWidth="1.2" />
        <rect x="806" y="38" width="336" height="26" rx="6" fill={TITLE_BAR} stroke="rgba(224,180,95,0.18)" strokeWidth="0.8" />
        <rect x="806" y="62" width="336" height="1" fill={GOLD} opacity="0.3" />
        <circle cx="821" cy="51" r="3.2" fill={GOLD} className="hq-pulse" filter="url(#oq-glow-g)" />
        <text x="832" y="55.5" fontSize="12.5" fontWeight="800" letterSpacing="1.4" fill={GOLD_L}>
          {t('gitWireLabel', lang)}
        </text>
        <text x="1130" y="55" fontSize="11.5" fontWeight="700" fill={GOLD} textAnchor="end" fontFamily={mono}>
          {commitCount} ◂ {t('commits', lang)}
        </text>
        {/* the wire itself: commits travel along it */}
        <line x1="500" y1="196" x2="806" y2="180" stroke={GOLD} strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="3 7" className="hq-dash" />
        {commits.length === 0 && (
          <text x="974" y="118" fontSize="11" fill="#6b6154" textAnchor="middle">
            {git ? t('gitUnavailable', lang) : '…'}
          </text>
        )}
        {commits.map((c, i) => {
          const fresh = i === 0 && now !== null && now - c.ts < 26000;
          return (
            <g key={c.hash} transform={`translate(816,${72 + i * 17})`}>
              {fresh && <rect x="-4" y="-9" width="322" height="15" rx="3" fill={GOLD} opacity="0.1" />}
              <rect x="0" y="-8" width="40" height="12" rx="2" fill={fresh ? '#2a2010' : '#1c150c'} stroke={fresh ? GOLD : '#5a4526'} strokeWidth="0.7" />
              <text x="20" y="1.4" fontSize="9" fill={fresh ? GOLD_L : '#c9a96a'} textAnchor="middle" fontFamily={mono} direction="ltr">
                {c.hash}
              </text>
              <text x="48" y="1.6" fontSize="9.8" fill={fresh ? CHALK : '#b3aa9b'}>
                {truncate(c.subject, 44)}
              </text>
              <text x="314" y="1.6" fontSize="9" fill="#8a7a58" textAnchor="end" direction="ltr" fontFamily={mono}>
                {ageLabel(c.ts, lang, now ?? c.ts)}
              </text>
            </g>
          );
        })}
        {git?.available && (
          <text x="816" y="174" fontSize="9" fill="#8a7a58">
            {t('gitLive', lang)}
          </text>
        )}
      </g>

      {/* ================= TASK WALL (north-center) ================= */}
      <g onClick={() => onOpenTab('wall')} className="cursor-pointer">
        <rect x="268" y="38" width="520" height="142" rx="6" fill="url(#oq-panel)" stroke={PANEL_EDGE} strokeWidth="1.2" />
        <rect x="268" y="38" width="520" height="26" rx="6" fill={TITLE_BAR} stroke="rgba(224,180,95,0.18)" strokeWidth="0.8" />
        <rect x="268" y="62" width="520" height="1" fill={GOLD} opacity="0.3" />
        <text x="284" y="55.5" fontSize="12.5" fontWeight="800" letterSpacing="1.4" fill={GOLD_L}>
          {t('taskWallLabel', lang)}
        </text>
        <text x="772" y="55" fontSize="11.5" fill="#a89a82" textAnchor="end" fontFamily={mono}>
          {tasks.length} {lang === 'he' ? 'משימות' : 'tasks'}
        </text>
        {(['todo', 'doing', 'review', 'done'] as const).map((status, ci) => {
          const colX = 284 + ci * 124;
          const list = byStatus[status];
          const label = t(status === 'todo' ? 'taskTodo' : status === 'doing' ? 'taskDoing' : status === 'review' ? 'taskReview' : 'taskDone', lang);
          const active = status === 'doing';
          return (
            <g key={status}>
              <rect x={colX} y="72" width="114" height="96" rx="4" fill="#17100a" stroke={active ? 'rgba(224,180,95,0.5)' : 'rgba(255,255,255,0.07)'} strokeWidth="0.9" />
              <text x={colX + 7} y="85" fontSize="10" fill={active ? GOLD_L : '#a89a82'} fontWeight="700">
                {label} · {list.length}
              </text>
              {list.slice(0, 4).map((task, i) => {
                const owner = task.assignee ? crewById.get(task.assignee) : undefined;
                return (
                  <g key={task.id} transform={`translate(${colX + 5},${89 + i * 19})`}>
                    <rect width="104" height="16" rx="3" fill="#20170e" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
                    <rect width="3.5" height="16" rx="1.5" fill={owner ? ACCENT[owner.id] ?? owner.color : '#8a7a58'} />
                    {task.status === 'doing' && <circle cx="95" cy="8" r="2.4" fill={GOLD} className="hq-pulse" filter="url(#oq-glow-g)" />}
                    <text x="9" y="11" fontSize="9.2" fill="#ded7c9">
                      {truncate(task.title, 18)}
                    </text>
                  </g>
                );
              })}
              {list.length > 4 && (
                <text x={colX + 7} y="166" fontSize="9.5" fill="#8a7a58" fontFamily={mono}>
                  +{list.length - 4}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* ================= WIRE TOPOLOGY — edges LIGHT UP while really carrying traffic ================= */}
      {(Object.entries(DESKS) as Array<[string, { x: number; y: number }]>).map(([id, d]) => {
        const s = agents[id]?.state;
        const hot = s === 'thinking' || s === 'reading' || s === 'checking';
        return (
          <g key={`wire-${id}`} pointerEvents="none">
            <path d={wallToDeskPath(d)} fill="none" stroke={GOLD} strokeOpacity={hot ? 0.4 : 0.1} strokeWidth={hot ? 2.4 : 1} strokeDasharray={hot ? undefined : '3 7'} className={hot ? 'hq-dash' : undefined} />
            <path d={deskToLibraryPath(d)} fill="none" stroke={LIFE} strokeOpacity="0.08" strokeWidth="1" strokeDasharray="3 7" />
          </g>
        );
      })}
      {/* live packets — REAL traffic: an agent actually pulling work / shipping a report. */}
      {inbound.map(([id, d]) => (
        <g key={`pkt-in-${id}`} pointerEvents="none">
          <circle r="3" fill={GOLD_L} filter="url(#oq-glow-g)">
            <animateMotion dur="1.9s" repeatCount="indefinite" path={wallToDeskPath(d)} />
            <animate attributeName="r" values="3;6.5;3" dur="1.9s" repeatCount="indefinite" />
          </circle>
          <circle r="6.5" fill={GOLD} opacity="0.18">
            <animateMotion dur="1.9s" repeatCount="indefinite" path={wallToDeskPath(d)} />
            <animate attributeName="r" values="6.5;12;6.5" dur="1.9s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      {outbound.map(([id, d]) => (
        <g key={`pkt-out-${id}`} pointerEvents="none">
          <circle r="3" fill={LIFE} filter="url(#oq-glow-life)">
            <animateMotion dur="2.3s" repeatCount="indefinite" path={deskToLibraryPath(d)} />
            <animate attributeName="r" values="3;6.5;3" dur="2.3s" repeatCount="indefinite" />
          </circle>
          <circle r="6.5" fill={LIFE} opacity="0.14">
            <animateMotion dur="2.3s" repeatCount="indefinite" path={deskToLibraryPath(d)} />
            <animate attributeName="r" values="6.5;12;6.5" dur="2.3s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}
      {/* completion packets — the 'done' status really travels back to the task wall */}
      {doneOut.map(([id, d]) => (
        <g key={`pkt-done-${id}`} pointerEvents="none">
          <circle r="3" fill={LIFE} filter="url(#oq-glow-life)">
            <animateMotion dur="2.1s" repeatCount="indefinite" path={deskToWallPath(d)} />
            <animate attributeName="r" values="3;6;3" dur="2.1s" repeatCount="indefinite" />
          </circle>
          <circle r="6" fill={LIFE} opacity="0.12">
            <animateMotion dur="2.1s" repeatCount="indefinite" path={deskToWallPath(d)} />
            <animate attributeName="r" values="6;11;6" dur="2.1s" repeatCount="indefinite" />
          </circle>
        </g>
      ))}

      {/* ================= LIBRARY (west, glass-front) ================= */}
      <g onClick={() => onOpenTab('library')} className="cursor-pointer">
        <rect x="40" y="216" width="172" height="176" rx="6" fill="url(#oq-panel)" stroke={PANEL_EDGE} strokeWidth="1.2" />
        <rect x="40" y="216" width="172" height="24" rx="6" fill={TITLE_BAR} stroke="rgba(224,180,95,0.18)" strokeWidth="0.8" />
        <text x="54" y="232.5" fontSize="12.5" fontWeight="800" letterSpacing="1.4" fill={GOLD_L}>
          {t('libraryLabel', lang)}
        </text>
        <text x="200" y="232" fontSize="12.5" fontWeight="800" fill={LIFE} textAnchor="end" fontFamily={mono}>
          {reportsCount}
        </text>
        {/* glass-front shelves with warm wood frame */}
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect x="54" y={248 + row * 42} width="144" height="34" rx="3" fill="#17100a" stroke="#4a3a22" strokeWidth="0.9" />
            <rect x="54" y={248 + row * 42} width="144" height="34" rx="3" fill="url(#oq-glass)" />
            <line x1="126" y1={248 + row * 42} x2="126" y2={282 + row * 42} stroke="#4a3a22" strokeWidth="1.4" />
            {Array.from({ length: 10 }, (_, i) => {
              const colors = ['#3ba08f', '#d98d4a', '#8fae4a', '#c96b4a', '#6b8aa5', '#c99a4e', '#8a7a58', '#b08a4a', '#5c8a6f', '#c9a227'];
              const filled = reportsCount > row * 10 + i;
              const h = 18 + ((row * 10 + i) % 3) * 4;
              return (
                <rect key={i} x={58 + i * 13.8} y={278 + row * 42 - h} width="9" height={h} rx="1.5" fill={colors[(row * 10 + i) % 10]} opacity={filled ? 0.92 : 0.14} />
              );
            })}
          </g>
        ))}
        {newestReport && (
          <text x="54" y="386" fontSize="9.4" fill="#a89a82">
            {truncate(newestReport, 28)}
          </text>
        )}
      </g>

      {/* ================= PODIUM STAGE (east — autonomous decisions, shown for transparency) ================= */}
      <g onClick={() => onOpenTab('podium')} className="cursor-pointer">
        {/* stage platform */}
        <rect x="952" y="238" width="200" height="118" rx="6" fill="url(#oq-panel)" stroke={openDecisions > 0 ? 'rgba(251,191,36,0.6)' : PANEL_EDGE} strokeWidth={openDecisions > 0 ? 1.5 : 1.2} />
        <rect x="952" y="238" width="200" height="24" rx="6" fill={TITLE_BAR} stroke="rgba(224,180,95,0.18)" strokeWidth="0.8" />
        <text x="968" y="254.5" fontSize="12.5" fontWeight="800" letterSpacing="1.4" fill={GOLD_L}>
          {t('podiumLabel', lang)}
        </text>
        {/* big decision screen */}
        <rect x="972" y="270" width="160" height="58" rx="3" fill="url(#oq-screen)" stroke="#3a2c1a" strokeWidth="0.9" />
        {openDecisions > 0 && <rect x="972" y="270" width="160" height="58" rx="3" fill={AMBER} opacity="0.08" className="hq-pulse" />}
        <text x="1052" y="296" fontSize="22" fontWeight="800" fill={openDecisions > 0 ? GOLD_L : '#4a4234'} textAnchor="middle" fontFamily={mono} filter={openDecisions > 0 ? 'url(#oq-glow-g)' : undefined}>
          {openDecisions > 0 ? `⏳${openDecisions}` : '—'}
        </text>
        <text x="1052" y="316" fontSize="9.6" fill={openDecisions > 0 ? GOLD_L : '#6b6154'} textAnchor="middle" fontWeight="600">
          {openDecisions > 0 ? t('needsYou', lang) : t('noDecisions', lang)}
        </text>
        {/* brass lectern */}
        <path d="M 1014 356 L 1090 356 L 1082 384 L 1022 384 Z" fill="#2b2115" stroke="#4a3a22" strokeWidth="1" />
        <rect x="1010" y="350" width="84" height="9" rx="2" fill="url(#oq-brass)" stroke="#6b5228" strokeWidth="0.6" />
        <circle cx="1052" cy="354.5" r="2.4" fill={openDecisions > 0 ? GOLD : '#5a4526'} className={openDecisions > 0 ? 'hq-pulse' : ''} filter={openDecisions > 0 ? 'url(#oq-glow-g)' : undefined} />
      </g>

      {/* ================= REGISTRY BOARD (south) ================= */}
      <g onClick={() => onOpenTab('fleet')} className="cursor-pointer">
        <rect x="404" y="574" width="372" height="50" rx="6" fill="url(#oq-panel)" stroke={PANEL_EDGE} strokeWidth="1.2" />
        <text x="422" y="594" fontSize="12.5" fontWeight="800" letterSpacing="1.4" fill={GOLD_L}>
          {t('registryLabel', lang)}
        </text>
        <text x="760" y="594" fontSize="11.5" fill="#a89a82" textAnchor="end" fontFamily={mono}>
          {books.length} {t('books', lang)}
        </text>
        {/* health strip: each book = one tick, colored by freshness */}
        <g transform="translate(422,600)">
          {books.slice(0, 44).map((b, i) => {
            const fresh = b.ageHours !== undefined && b.ageHours <= 6 && b.ok !== false;
            const warn = !fresh && (b.ageHours ?? 0) <= 72 && b.ok !== false;
            return <rect key={b.id} x={(i % 44) * 7.4} y="0" width="5" height="9" rx="1.5" fill={fresh ? LIFE : warn ? AMBER : RED} opacity={fresh ? 0.9 : 0.75} />;
          })}
        </g>
        <text x="422" y="620" fontSize="9.6" fill={staleBooks > 0 ? AMBER : '#8a7a58'}>
          {staleBooks > 0 ? `${staleBooks} ${lang === 'he' ? 'ספרים ישנים או דורשים בדיקה' : 'stale or flagged books'}` : lang === 'he' ? 'כל הספרים טריים' : 'all books fresh'}
        </text>
      </g>

      {/* ================= COFFEE CORNER (south-west — the one warm pocket) ================= */}
      <g>
        <rect x="236" y="560" width="120" height="12" rx="2" fill="#4a3a26" stroke="#5f4c30" strokeWidth="0.8" />
        <rect x="242" y="572" width="8" height="52" fill="#332616" />
        <rect x="342" y="572" width="8" height="52" fill="#332616" />
        {/* copper kettle */}
        <path d="M 262 560 L 262 542 Q 262 534 272 534 L 282 534 Q 292 534 292 542 L 292 560 Z" fill="url(#oq-brass)" stroke="#6b5228" strokeWidth="0.8" />
        <path d="M 292 544 Q 302 546 298 556" stroke="#8a6a30" strokeWidth="3" fill="none" />
        {/* steam */}
        <path d="M 272 530 q 3 -6 0 -10 m 8 10 q 3 -6 0 -10" stroke="#c9b896" strokeWidth="1.2" fill="none" opacity="0.5" className="hq-steam" />
        {/* mugs */}
        <rect x="308" y="550" width="10" height="10" rx="2" fill="#a85a3c" />
        <rect x="322" y="550" width="10" height="10" rx="2" fill="#3ba08f" />
        {/* sign */}
        <text x="296" y="624" fontSize="9.2" fill="#8a7a58" textAnchor="middle">
          {lang === 'he' ? 'פינת הקפה של המפקדה' : 'HQ coffee corner'}
        </text>
      </g>

      {/* ================= RECEPTION (south-east — where visitors talk to the office) ================= */}
      {/* עמית, the office representative, works the front desk. Clicking him opens the
          conversation — there is no other chat entry point on purpose: the chat IS a worker. */}
      <g
        onClick={() => onOpenReception()}
        className="cursor-pointer"
        role="button"
        aria-label={t('repHint', lang)}
      >
        <title>{t('repHint', lang)}</title>
        {/* warm pool over the front desk */}
        <ellipse cx={RECEPTION.x} cy={RECEPTION.y - 40} rx="120" ry="84" fill="url(#oq-pool)" className="hq-pool" />
        {/* attending halo while the conversation is open */}
        {receptionOpen && (
          <circle cx={RECEPTION.x} cy={RECEPTION.y - 47} r="16" fill="none" stroke={GOLD} strokeWidth="1.3" opacity="0.55" className="hq-ring" />
        )}
        {/* counter (faces the visitor / camera) — warm walnut + brass top */}
        <rect x={RECEPTION.x - 92} y={RECEPTION.y - 8} width="184" height="12" rx="2" fill="url(#oq-brass)" stroke="#6b5228" strokeWidth="0.8" />
        <rect x={RECEPTION.x - 86} y={RECEPTION.y + 4} width="172" height="40" rx="2" fill="#332616" stroke="#4a3a22" strokeWidth="0.8" />
        <rect x={RECEPTION.x - 86} y={RECEPTION.y + 4} width="172" height="3" fill={COPPER} opacity="0.55" />
        {/* front-desk sign */}
        <rect x={RECEPTION.x - 62} y={RECEPTION.y + 16} width="124" height="16" rx="2" fill="#17100a" stroke="rgba(224,180,95,0.25)" strokeWidth="0.6" />
        <rect x={RECEPTION.x - 62} y={RECEPTION.y + 16} width="2.4" height="16" fill={COPPER} />
        <text x={RECEPTION.x + 2} y={RECEPTION.y + 28} fontSize="9.8" fill={CHALK} textAnchor="middle" fontWeight="700">
          {t('repName', lang)} · {t('repRole', lang)}
        </text>
        {/* small terminal on the counter */}
        <rect x={RECEPTION.x - 74} y={RECEPTION.y - 34} width="34" height="24" rx="2" fill="#0e0a06" stroke={receptionOpen ? GOLD : '#3a2c1a'} strokeWidth="1" />
        <rect x={RECEPTION.x - 71} y={RECEPTION.y - 31} width="28" height="18" rx="1.5" fill="url(#oq-screen)" />
        <path d={`M ${RECEPTION.x - 66} ${RECEPTION.y - 22} h 14 M ${RECEPTION.x - 66} ${RECEPTION.y - 18} h 9`} stroke={GOLD} strokeWidth="1" opacity="0.55" />
        <rect x={RECEPTION.x - 60} y={RECEPTION.y - 12} width="6" height="5" fill="#2b2115" />
        {/* service bell — brass */}
        <path d={`M ${RECEPTION.x + 48} ${RECEPTION.y - 6} a 8 8 0 0 1 16 0 Z`} fill="url(#oq-brass)" stroke="#f2d492" strokeWidth="0.7" />
        <circle cx={RECEPTION.x + 56} cy={RECEPTION.y - 15} r="1.6" fill="#f2d492" />
        <line x1={RECEPTION.x + 44} y1={RECEPTION.y - 5} x2={RECEPTION.x + 68} y2={RECEPTION.y - 5} stroke="#6b5228" strokeWidth="1.6" />
        {/* papers on the counter */}
        <rect x={RECEPTION.x + 10} y={RECEPTION.y - 8} width="22" height="7" rx="1" fill="#e5ddc9" opacity="0.75" transform={`rotate(-4 ${RECEPTION.x + 10} ${RECEPTION.y - 8})`} />
        {/* ---- עמית himself ---- */}
        <g transform={`translate(${RECEPTION.x},${RECEPTION.y - 12})`}>
          <ellipse cx="0" cy="0" rx="17" ry="5.5" fill="#000" opacity="0.45" />
          <g className={receptionOpen ? 'agent-bob' : ''}>
            {/* legs + shoes */}
            <rect x="-8" y="-15" width="6.5" height="14" rx="2.6" fill="#17100a" />
            <rect x="2" y="-15" width="6.5" height="14" rx="2.6" fill="#17100a" />
            <rect x="-9" y="-3" width="8" height="3.4" rx="1.6" fill="#0e0a06" />
            <rect x="1.5" y="-3" width="8" height="3.4" rx="1.6" fill="#0e0a06" />
            {/* torso — charcoal shirt + copper vest */}
            <path d="M -12 -40 Q -13 -40 -13 -34 L -13 -16 Q -13 -13 -10 -13 L 10 -13 Q 13 -13 13 -16 L 13 -34 Q 13 -40 12 -40 Z" fill="#332a20" />
            <path d="M -8 -40 L -8 -14 L 8 -14 L 8 -40 Q 4 -42 0 -42 Q -4 -42 -8 -40 Z" fill={COPPER} opacity="0.92" />
            <path d="M -13 -30 L 13 -30 L 13 -26 L -13 -26 Z" fill="#000" opacity="0.14" />
            {/* visitor badge on a lanyard */}
            <path d="M -6 -40 L 0 -27 L 6 -40" stroke="#17100a" strokeWidth="1.4" fill="none" />
            <rect x="-3.4" y="-28" width="6.8" height="8" rx="1" fill="#f2ead6" />
            <rect x="-2.4" y="-26" width="4.8" height="2.6" rx="0.5" fill={COPPER} />
            <rect x="-2.4" y="-22.6" width="3.2" height="1.4" rx="0.5" fill="#a89a82" />
            {/* arms */}
            <rect x="-17" y="-36" width="5.2" height="17" rx="2.6" fill="#332a20" opacity="0.9" />
            <rect x="11.8" y="-36" width="5.2" height="17" rx="2.6" fill="#332a20" opacity="0.9" />
            <circle cx="-14.4" cy="-19" r="2.6" fill="#d9a877" />
            <circle cx="14.4" cy="-19" r="2.6" fill="#d9a877" />
            {/* head */}
            <circle cx="0" cy="-47" r="9.2" fill="#d9a877" />
            {/* headset — always on, he is the reception line */}
            <path d="M -9 -48 A 9.2 9.2 0 0 1 9 -48" stroke="#241a10" strokeWidth="2.6" fill="none" />
            <rect x="-12" y="-49" width="4.2" height="7.5" rx="2" fill="#241a10" />
            <rect x="7.8" y="-49" width="4.2" height="7.5" rx="2" fill="#241a10" />
            <path d="M -11.5 -42 Q -11.5 -35 -4 -34" stroke="#241a10" strokeWidth="1.4" fill="none" />
            {/* neat side-part hair */}
            <path d="M -9 -49 Q -6 -57 2 -56.5 Q 9 -56 9.2 -48 Q 5 -52 -1 -52.5 Q -6 -53 -9 -49 Z" fill="#241a10" />
          </g>
          {/* availability dot — copper, calm (he is not a task agent) */}
          <circle cx="15" cy="-59" r="5" fill={receptionOpen ? GOLD : COPPER} stroke="#120d09" strokeWidth="1.5" className="hq-pulse" filter="url(#oq-glow-g)" />
          {/* the invite / in-conversation chip — the office talking to you */}
          <g transform="translate(0,-78)">
            {receptionOpen ? (
              <g>
                <rect x="-30" y="-13" width="60" height="20" rx="4" fill="#17100a" stroke={GOLD} strokeWidth="1" />
                <circle cx="-19" cy="-3" r="2.6" fill={GOLD} className="hq-pulse" />
                <text x="-12" y="0.5" fontSize="10.5" fontWeight="700" fill={GOLD_L}>
                  {t('repInChat', lang)}
                </text>
              </g>
            ) : (
              <g className="hq-pulse">
                <rect x="-46" y="-13" width="92" height="20" rx="4" fill="#17100a" stroke={GOLD} strokeWidth="1" />
                <path d="M -6 7 L 0 16 L 6 7 Z" fill="#17100a" stroke={GOLD} strokeWidth="1" />
                <text x="0" y="1.5" fontSize="10.5" fontWeight="700" fill={GOLD_L} textAnchor="middle">
                  {t('repInvite', lang)}
                </text>
              </g>
            )}
          </g>
        </g>
        {/* floor label */}
        <text x={RECEPTION.x} y={RECEPTION.y + 62} fontSize="9.4" fill="#8a7a58" textAnchor="middle">
          {lang === 'he' ? 'קבלת המפקדה · לחץ על עמית לשיחה' : 'HQ front desk · click Amit to chat'}
        </text>
      </g>

      {/* plants */}
      {[
        { x: 26, y: 470, s: 1.25 },
        { x: 1154, y: 470, s: 1.25 },
        { x: 790, y: 560, s: 1 },
        { x: 232, y: 210, s: 0.9 },
        { x: 800, y: 64, s: 0.9 },
      ].map((p, i) => (
        <g key={`plant-${i}`} transform={`translate(${p.x},${p.y}) scale(${p.s})`}>
          <path d="M -12 8 L 12 8 L 9 22 L -9 22 Z" fill="#4a3a26" stroke="#5f4c30" strokeWidth="0.8" />
          <ellipse cx="-7" cy="-6" rx="7" ry="13" fill="#3d5c42" />
          <ellipse cx="7" cy="-4" rx="7" ry="14" fill="#476b4c" />
          <ellipse cx="0" cy="-12" rx="6" ry="12" fill="#527a57" />
        </g>
      ))}

      {/* light pools over desks */}
      {Object.entries(DESKS).map(([id, d]) => (
        <ellipse key={`pool-${id}`} cx={d.x} cy={d.y - 40} rx="130" ry="90" fill="url(#oq-pool)" className="hq-pool" style={{ animationDelay: `${(DESKS[id].x % 5) * 0.9}s` }} />
      ))}

      {/* ================= WORKSTATIONS with live monitors ================= */}
      {Object.entries(DESKS).map(([id, d]) => {
        const member = crewById.get(id);
        if (!member) return null;
        const agent = agents[id];
        const tail = (logs[id] ?? []).filter((l) => l.kind !== 'say').slice(-3);
        const state = agent?.state ?? 'idle';
        const busy = isBusyState(state);
        const accent = ACCENT[id] ?? member.color;
        const openCount = tasks.filter((x) => x.assignee === id && (x.status === 'todo' || x.status === 'doing' || x.status === 'review')).length;
        return (
          <g key={`desk-${id}`} onClick={() => onSelectAgent(id)} className="cursor-pointer">
            {/* pulse ring while really working */}
            {busy && (
              <>
                <circle cx={d.x} cy={d.y - 82} r="12" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.5" className="hq-ring" />
                <circle cx={d.x} cy={d.y - 82} r="12" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.3" className="hq-ring hq-ring-late" />
              </>
            )}
            {/* desk body — walnut top with brass edge */}
            <rect x={d.x - 84} y={d.y - 74} width="168" height="10" rx="2" fill="#4a3620" stroke="#5f4c30" strokeWidth="0.8" />
            <rect x={d.x - 84} y={d.y - 74} width="168" height="1.6" fill={GOLD_D} opacity="0.55" />
            <rect x={d.x - 78} y={d.y - 64} width="6" height="56" fill="#332616" />
            <rect x={d.x + 72} y={d.y - 64} width="6" height="56" fill="#332616" />
            {/* state LED strip on the desk edge */}
            <rect x={d.x - 70} y={d.y - 67.4} width="132" height="2.6" rx="1.3" fill={STATE_COLORS[state]} opacity={busy ? 1 : 0.4} className={busy ? 'hq-pulse' : ''} filter={busy ? 'url(#oq-glow-g)' : undefined} />
            {/* monitor — border glows warm while really busy */}
            <rect x={d.x - 64} y={d.y - 108} width="120" height="46" rx="3" fill="#0e0a06" stroke={busy ? GOLD : '#3a2c1a'} strokeOpacity={busy ? 0.75 : 1} strokeWidth={busy ? 1.6 : 1.2} />
            <rect x={d.x - 60} y={d.y - 104} width="112" height="38" rx="2" fill="url(#oq-screen)" />
            {busy && <rect x={d.x - 60} y={d.y - 104} width="112" height="38" rx="2" fill={GOLD} opacity="0.04" />}
            {/* scanline wash + top data edge */}
            <rect x={d.x - 60} y={d.y - 104} width="112" height="38" rx="2" fill="url(#oq-scan)" />
            <rect x={d.x - 60} y={d.y - 104} width="112" height="1.2" fill={GOLD} opacity={busy ? 0.6 : 0.18} />
            {/* thinking trace — the model's activity waveform, flowing */}
            {(state === 'thinking' || state === 'checking') && (
              <path d={eegWave(d, (d.x + d.y) * 0.013)} fill="none" stroke={GOLD} strokeOpacity={state === 'thinking' ? 0.34 : 0.22} strokeWidth="1.1" strokeDasharray="5 4" className="hq-dash" />
            )}
            {/* screen stand */}
            <rect x={d.x - 6} y={d.y - 62} width="12" height="7" fill="#2b2115" />
            {/* real log lines */}
            {tail.map((entry, i) => (
              <text key={i} x={d.x - 54} y={d.y - 92 + i * 12} fontSize="9.2" fill={entry.kind === 'error' ? RED : entry.kind === 'tool' ? GOLD : entry.kind === 'report' ? LIFE : '#d9cba8'} fontFamily={mono} direction="ltr">
                {truncate(entry.text.replace(/\s+/g, ' '), 20)}
              </text>
            ))}
            {tail.length === 0 && (
              <text x={d.x - 4} y={d.y - 83} fontSize="8.6" fill="#3d3222" fontFamily={mono}>
                · · ·
              </text>
            )}
            {/* scan bar sweep while really thinking */}
            {state === 'thinking' && (
              <rect x={d.x - 60} y={d.y - 104} width="112" height="2.4" fill={GOLD} opacity="0.4" pointerEvents="none">
                <animate attributeName="y" values={`${d.y - 104};${d.y - 67};${d.y - 104}`} dur="2s" repeatCount="indefinite" />
              </rect>
            )}
            {/* blinking cursor while the agent really works */}
            {busy && <rect x={d.x + 38} y={d.y - 80} width="5" height="7" fill={GOLD} opacity="0.8" className="hq-blink" />}
            {/* open-task pill — real count from the wall, never invented */}
            {openCount > 0 && (
              <g transform={`translate(${d.x + 58},${d.y - 110})`} pointerEvents="none">
                <rect width="20" height="13" rx="6.5" fill="#2a2010" stroke={accent} strokeOpacity="0.8" strokeWidth="0.8" />
                <text x="10" y="9.6" fontSize="9" fontWeight="800" fill={GOLD_L} textAnchor="middle" fontFamily={mono}>
                  {openCount}
                </text>
              </g>
            )}
            {/* keyboard + mug */}
            <rect x={d.x - 30} y={d.y - 72} width="52" height="5" rx="1.5" fill="#241a10" stroke="#3a2c1a" strokeWidth="0.5" />
            <rect x={d.x + 52} y={d.y - 72} width="8" height="7" rx="1.5" fill={accent} opacity="0.9" />
            {/* name plate on the desk front */}
            <rect x={d.x - 34} y={d.y - 44} width="68" height="15" rx="2" fill="#17100a" stroke="rgba(224,180,95,0.22)" strokeWidth="0.6" />
            <rect x={d.x - 34} y={d.y - 44} width="2.4" height="15" fill={accent} />
            <text x={d.x + 2} y={d.y - 32.5} fontSize="10" fill={CHALK} textAnchor="middle" fontWeight="700">
              {member.name[lang]}
            </text>
            {/* chair */}
            <rect x={d.x - 17} y={d.y + 8} width="34" height="9" rx="3" fill="#241a10" stroke="#3a2c1a" strokeWidth="0.6" />
            <rect x={d.x - 20} y={d.y - 16} width="6" height="26" rx="2" fill="#241a10" />
          </g>
        );
      })}

      {/* ================= CREW ================= */}
      {crew.map((member, mi) => {
        const agent = agents[member.id];
        const pos = agent ? agentPos(agent) : STATIONS.offstage;
        const state = agent?.state ?? 'idle';
        const accent = ACCENT[member.id] ?? member.color;
        const clothes = CLOTHES[member.id] ?? member.color;
        const isBusy = isBusyState(state);
        const bubble = bubbles[member.id];
        const isSel = selected === member.id;
        const skin = SKIN[mi % SKIN.length];
        return (
          <g
            key={member.id}
            className="agent-move cursor-pointer"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            onClick={() => onSelectAgent(member.id)}
          >
            {isSel && <ellipse cx="0" cy="-2" rx="30" ry="10" fill="none" stroke={GOLD} strokeWidth="1.8" strokeDasharray="5 4" className="hq-spin" filter="url(#oq-glow-g)" />}
            <ellipse cx="0" cy="0" rx="17" ry="5.5" fill="#000" opacity="0.45" />
            <g className={isBusy ? 'agent-bob' : ''}>
              {/* legs + shoes */}
              <rect x="-8" y="-15" width="6.5" height="14" rx="2.6" fill="#17100a" />
              <rect x="2" y="-15" width="6.5" height="14" rx="2.6" fill="#17100a" />
              <rect x="-9" y="-3" width="8" height="3.4" rx="1.6" fill="#0e0a06" />
              <rect x="1.5" y="-3" width="8" height="3.4" rx="1.6" fill="#0e0a06" />
              {/* torso */}
              <path d="M -12 -40 Q -13 -40 -13 -34 L -13 -16 Q -13 -13 -10 -13 L 10 -13 Q 13 -13 13 -16 L 13 -34 Q 13 -40 12 -40 Z" fill={clothes} />
              <path d="M -13 -30 L 13 -30 L 13 -26 L -13 -26 Z" fill="#000" opacity="0.14" />
              {/* lanyard for the lead */}
              {member.id === 'aluf' && <path d="M -6 -40 L 0 -26 L 6 -40" stroke="#17100a" strokeWidth="1.6" fill="none" />}
              {/* arms */}
              <rect x="-17" y="-36" width="5.2" height="17" rx="2.6" fill={clothes} opacity="0.88" />
              <rect x="11.8" y="-36" width="5.2" height="17" rx="2.6" fill={clothes} opacity="0.88" />
              <circle cx="-14.4" cy="-19" r="2.6" fill={skin} />
              <circle cx="14.4" cy="-19" r="2.6" fill={skin} />
              {/* head */}
              <circle cx="0" cy="-47" r="9.2" fill={skin} />
              {/* headset on workers, earpiece on lead */}
              <path d="M -9 -48 A 9.2 9.2 0 0 1 9 -48" stroke="#241a10" strokeWidth="2.6" fill="none" />
              <rect x="-12" y="-49" width="4.2" height="7.5" rx="2" fill="#241a10" />
              {/* hats: distinct silhouette per agent */}
              {member.id === 'aluf' && (
                <>
                  <rect x="-10" y="-58" width="20" height="7.5" rx="2" fill="#241a10" />
                  <rect x="-13.5" y="-52.5" width="27" height="3.2" rx="1" fill="#17100a" />
                  <rect x="-2.6" y="-60.5" width="5.2" height="4.2" rx="0.5" fill={GOLD} />
                </>
              )}
              {member.id === 'gal' && <path d="M -9 -51 Q 0 -61 9 -51 L 9 -46.5 Q 0 -53 -9 -46.5 Z" fill="#3ba08f" />}
              {member.id === 'erez' && (
                <>
                  <rect x="-9" y="-56" width="18" height="5.5" rx="1.5" fill={EMBER} />
                  <rect x="-11.5" y="-51.5" width="23" height="2.8" rx="1" fill="#8a5f28" />
                </>
              )}
              {member.id === 'tamar' && (
                <>
                  <circle cx="7.5" cy="-54" r="4.8" fill="#8fae4a" />
                  <path d="M -9 -49 Q 0 -57 9 -49" stroke="#8fae4a" strokeWidth="3.2" fill="none" />
                </>
              )}
              {member.id === 'shachar' && <path d="M -10 -47 Q -11 -61 0 -61 Q 11 -61 10 -47 L 6 -49 Q 7 -56 0 -56 Q -7 -56 -6 -49 Z" fill="#c96b4a" />}
              {member.id === 'yarden' && (
                <>
                  <path d="M -10 -47 A 10.5 10.5 0 0 1 10 -47" stroke="#6b8aa5" strokeWidth="3.2" fill="none" />
                  <rect x="-13.5" y="-50" width="5" height="8.5" rx="1.5" fill="#6b8aa5" />
                  <rect x="8.5" y="-50" width="5" height="8.5" rx="1.5" fill="#6b8aa5" />
                </>
              )}
            </g>
            {/* state dot */}
            <circle cx="15" cy="-59" r="5" fill={STATE_COLORS[state]} stroke="#120d09" strokeWidth="1.5" className={isBusy || state === 'waiting_user' ? 'hq-pulse' : ''} filter={isBusy ? 'url(#oq-glow-g)' : undefined} />
            {/* nameplate — glass chip with gold edge */}
            <g transform="translate(0,-74)">
              <rect x="-54" y="-14" width="108" height="27" rx="5" fill="#17100aee" stroke={isSel ? GOLD : 'rgba(224,180,95,0.22)'} strokeWidth="1" />
              <rect x="-54" y="-14" width="2.4" height="27" rx="1" fill={accent} />
              <circle cx="-44" cy="-5" r="3" fill={STATE_COLORS[state]} />
              <text x="-37" y="-2.5" fontSize="11.5" fontWeight="800" fill={CHALK}>
                {member.name[lang]}
              </text>
              <text x="-46" y="9" fontSize="9.2" fill="#b3a98f">
                {truncate(agent?.activity || member.title[lang], 22)}
              </text>
            </g>
            {/* speech bubble */}
            {bubble && (
              <g className="hq-bubble" transform="translate(0,-112)">
                <rect x="-96" y="-24" width="192" height="30" rx="5" fill="#17100a" stroke={GOLD} strokeWidth="1" />
                <path d="M -6 6 L 0 15 L 6 6 Z" fill="#17100a" stroke={GOLD} strokeWidth="1" />
                <rect x="-96" y="-24" width="192" height="30" rx="5" fill="#17100a" />
                <text x="0" y="-4.5" fontSize="10.5" fill={CHALK} textAnchor="middle" fontWeight="600">
                  {truncate(bubble.text, 36)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* HUD corner brackets — warm brass framing */}
      <g stroke="#5a4526" strokeWidth="2" fill="none" opacity="0.8" pointerEvents="none">
        <path d="M 10 26 L 10 10 L 26 10" />
        <path d="M 1154 10 L 1170 10 L 1170 26" />
        <path d="M 10 614 L 10 630 L 26 630" />
        <path d="M 1154 630 L 1170 630 L 1170 614" />
      </g>

      {/* vignette + demo watermark */}
      <rect x="0" y="0" width={W} height={H} fill="url(#oq-vignette)" pointerEvents="none" />
      {sim && (
        <g opacity="0.09" pointerEvents="none">
          <text x={W / 2} y={H / 2} fontSize="92" fontWeight="800" fill="#ffffff" textAnchor="middle" transform={`rotate(-18 ${W / 2} ${H / 2})`} letterSpacing="14">
            DEMO · SIMULATION
          </text>
        </g>
      )}
    </svg>
  );
}

export const Office = memo(OfficeInner);
