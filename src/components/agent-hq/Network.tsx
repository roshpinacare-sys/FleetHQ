'use client';

import { useMemo } from 'react';
import type { BookView } from './types';
import { t, type Lang } from './i18n';

// ═══════════════════════════════════════════════════════════════════
//  THE NETWORK ATLAS — the map that develops itself
// ═══════════════════════════════════════════════════════════════════
//  The office is the center of the network. Every sovereign domain (a fleet
//  book) is a district orbiting the HQ. The map is HONEST: a district is open
//  only when its book is actually fresh — the crew's real work (patrols,
//  refreshes, reports) is what opens the territory. Sealed districts are the
//  frontier; as the office operates, they open one by one. That is "the office
//  developing the reality" — no simulation, no invented progress.
//
//  Deterministic rendering: placement is index-derived (golden angle), no
//  Math.random, no wall clock in render → SSR-safe. All motion is CSS/SVG
//  animation, paused under prefers-reduced-motion by the globals sheet.

const W = 1180;
const H = 640;
const CX = 590;
const CY = 344;

const GOLD = '#d946ef';   // fuchsia-500 — the ONE data accent
const GOLD_L = '#e4e4e7'; // zinc-200 — titles & values
const GOLD_D = '#7c3aed'; // violet-500
const LIFE = '#34d399';
const AMBER = '#fbbf24';
const RED = '#fb7185';
const CHALK = '#e4e4e7';
const DIM = '#71717a';

type DistrictState = 'live' | 'open' | 'sealed';

interface District extends BookView {
  x: number;
  y: number;
  orbit: number;
  state: DistrictState;
}

interface NetworkProps {
  lang: Lang;
  books: BookView[];
  opsDone: number;
  commits: number;
  reports: number;
  busy: number;
  onOpenTab: (tab: 'fleet') => void;
}

function districtState(b: BookView): DistrictState {
  if (b.ok === false) return 'sealed';
  const age = b.ageHours ?? Infinity;
  if (age <= 6) return 'live';
  if (age <= 72) return 'open';
  return 'sealed';
}

export function NetworkAtlas({ lang, books, opsDone, commits, reports, busy, onOpenTab }: NetworkProps) {
  const mono = "'JetBrains Mono', ui-monospace, monospace";

  const districts = useMemo<District[]>(() => {
    // freshest first — the frontier reveals itself outward by real freshness
    const sorted = [...books].sort((a, b) => {
      const sa = districtState(a) === 'sealed' ? 1 : 0;
      const sb = districtState(b) === 'sealed' ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return (a.ageHours ?? 1e9) - (b.ageHours ?? 1e9);
    });
    return sorted.slice(0, 18).map((b, i) => {
      const orbit = i < 6 ? 0 : i < 12 ? 1 : 2;
      const radii = [150, 228, 300];
      const r = radii[orbit];
      // golden-angle spread per orbit — deterministic, evenly distributed
      const idxInOrbit = i % 6;
      const angle = (-90 + idxInOrbit * 60 + orbit * 31) * (Math.PI / 180);
      return { ...b, orbit, state: districtState(b), x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) * 0.86 };
    });
  }, [books]);

  const counts = useMemo(() => {
    const live = districts.filter((d) => d.state === 'live').length;
    const open = districts.filter((d) => d.state === 'open').length;
    const sealed = districts.filter((d) => d.state === 'sealed').length;
    const total = books.length || 1;
    const opened = live + open;
    return { live, open, sealed, ratio: Math.min(1, opened / Math.max(1, Math.min(books.length, 18))), total };
  }, [districts, books.length]);

  const territoryAngle = counts.ratio * 360;

  // honest economy indices — every value is a real counter, nothing invented
  const economy = useMemo(() => {
    const fresh = books.filter((b) => b.ageHours !== undefined && b.ageHours <= 6 && b.ok !== false).length;
    const rows: Array<{ label: string; value: string; pct: number }> = [
      { label: t('econProd', lang), value: `${opsDone}`, pct: Math.min(1, opsDone / Math.max(24, opsDone)) },
      { label: t('econCirc', lang), value: `${commits}`, pct: Math.min(1, commits / Math.max(60, commits)) },
      { label: t('econKnow', lang), value: `${reports}`, pct: Math.min(1, reports / Math.max(30, reports)) },
      { label: t('econReserve', lang), value: `${fresh}/${books.length}`, pct: books.length ? fresh / books.length : 0 },
      { label: t('econArea', lang), value: `${Math.round(counts.ratio * 100)}%`, pct: counts.ratio },
    ];
    return rows;
  }, [books, opsDone, commits, reports, counts.ratio, lang]);

  return (
    <div className="relative h-full w-full" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {/* direction:ltr at the SVG root — see Office.tsx: the RTL page must not flip
          SVG text anchors or labels spill out of their cards. Hebrew is bidi-safe. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ direction: 'ltr' }} className="h-full w-full select-none" role="img" aria-label={t('atlasTitle', lang)}>
        <defs>
          <radialGradient id="at-space" cx="50%" cy="44%" r="72%">
            <stop offset="0%" stopColor="#18181b" />
            <stop offset="55%" stopColor="#111113" />
            <stop offset="100%" stopColor="#09090b" />
          </radialGradient>
          <radialGradient id="at-hq-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={GOLD} stopOpacity="0.32" />
            <stop offset="60%" stopColor={GOLD} stopOpacity="0.08" />
            <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="at-core" cx="38%" cy="32%" r="80%">
            <stop offset="0%" stopColor="#fdf4ff" />
            <stop offset="55%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
          <linearGradient id="at-wire" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0abfc" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.4" />
          </linearGradient>
          <filter id="at-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* deep space */}
        <rect width={W} height={H} fill="url(#at-space)" />
        {/* faint star field — deterministic */}
        <g fill="#e4e4e7">
          {Array.from({ length: 90 }, (_, i) => (
            <circle
              key={i}
              cx={((i * 127 + 31) % 1160) + 10}
              cy={((i * 83 + 17) % 610) + 12}
              r={i % 3 === 0 ? 1.1 : 0.6}
              opacity={0.06 + ((i * 7) % 10) * 0.014}
            />
          ))}
        </g>
        {/* orbit rings */}
        {[150, 228, 300].map((r, i) => (
          <ellipse key={r} cx={CX} cy={CY} rx={r} ry={r * 0.86} fill="none" stroke={GOLD} strokeOpacity={0.07 + i * 0.015} strokeWidth="1" strokeDasharray="2 9" />
        ))}

        {/* ── HQ core ── */}
        <g>
          <circle cx={CX} cy={CY} r="150" fill="url(#at-hq-glow)" className="hq-pool" />
          {/* territory arc — share of the network really opened */}
          <circle cx={CX} cy={CY} r="64" fill="none" stroke="#3f3f46" strokeWidth="3.5" />
          <circle
            cx={CX}
            cy={CY}
            r="64"
            fill="none"
            stroke="url(#at-wire)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${(territoryAngle / 360) * 402} 402`}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.2,0.8,0.3,1)' }}
          />
          <circle cx={CX} cy={CY} r="46" fill="#131316" stroke={GOLD} strokeOpacity="0.8" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="38" fill="none" stroke={GOLD_D} strokeWidth="1" opacity="0.7" />
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="2.4" fill={GOLD_L} fontFamily={mono} direction="ltr">
            HQ
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={CHALK}>
            {t('atlasHq', lang)}
          </text>
          <text x={CX} y={CY + 27} textAnchor="middle" fontSize="10" fill={DIM} fontFamily={mono} direction="ltr">
            {opsDone} ops
          </text>
          {/* territory caption under the core */}
          <text x={CX} y={CY + 88} textAnchor="middle" fontSize="11" fontWeight="700" fill={GOLD}>
            {Math.round(counts.ratio * 100)}% {t('atlasTerritory', lang)}
          </text>
        </g>

        {/* ── THE CITY — a building is born from every real district ── */}
        <g>
          <title>{`${t('atlasCity', lang)} — ${t('atlasCityHint', lang)}`}</title>
          {districts.slice(0, 12).map((d, i) => {
            const angle = (-90 + (i % 6) * 60 + d.orbit * 31) * (Math.PI / 180);
            const r = 104;
            const bx = CX + r * Math.cos(angle);
            const by = CY + r * Math.sin(angle) * 0.86;
            const live = d.state === 'live';
            const open = d.state === 'open';
            const h = live ? 30 + (i % 3) * 3 : open ? 21 + (i % 3) * 2 : 8;
            const w = 13 + (i % 2) * 2;
            const lit = live || open;
            return (
              <g key={`city-${d.id}`} transform={`translate(${bx},${by})`} pointerEvents="none">
                {/* body */}
                <rect x={-w / 2} y={-h} width={w} height={h} rx="1.2" fill={lit ? '#231a2e' : '#101012'} stroke={lit ? '#3f3f46' : '#26262b'} strokeWidth="0.7" />
                {live && <rect x={-w / 2} y={-h} width={w} height="1.6" fill={GOLD} opacity="0.85" />}
                {/* lit windows — deterministic pattern, real state drives the light */}
                {lit &&
                  [0, 1, 2].slice(0, Math.max(2, Math.floor(h / 11))).map((row) => (
                    <g key={row}>
                      {((i + row) % 2 === 0 || live) && (
                        <rect
                          x={-w / 2 + 3}
                          y={-h + 4 + row * 7}
                          width={w - 6}
                          height="2.6"
                          rx="0.6"
                          fill={live ? GOLD_L : GOLD_D}
                          opacity={live ? 0.95 : 0.55}
                          className={live && row === 0 ? 'hq-pulse' : undefined}
                        />
                      )}
                    </g>
                  ))}
                {/* live antenna — the district is breathing right now */}
                {live && <line x1="0" y1={-h} x2="0" y2={-h - 6} stroke={GOLD} strokeWidth="1" opacity="0.8" />}
                {live && <circle cx="0" cy={-h - 7.4} r="1.3" fill={LIFE} className="hq-pulse" />}
              </g>
            );
          })}
        </g>
        {/* city caption under the core (territory caption stays at +88) */}
        <text x={CX} y={CY + 112} textAnchor="middle" fontSize="9.6" fill={DIM}>
          {t('atlasCity', lang)}{busy > 0 ? ` · ${busy} ${lang === 'he' ? 'עובדים כרגע' : 'at work now'}` : ''}
        </text>

        {/* ── wires + districts ── */}
        {districts.map((d) => {
          const sealed = d.state === 'sealed';
          const live = d.state === 'live';
          const stroke = sealed ? '#3f3f46' : live ? GOLD : GOLD_D;
          return (
            <g key={d.id}>
              {/* wire HQ → district */}
              <line
                x1={CX}
                y1={CY}
                x2={d.x}
                y2={d.y}
                stroke={stroke}
                strokeOpacity={sealed ? 0.16 : 0.4}
                strokeWidth={live ? 1.6 : 1}
                strokeDasharray={sealed ? '1 8' : '4 6'}
                className={!sealed ? 'hq-dash' : undefined}
              />
              {/* live packet on fresh wires — the heartbeat really travels */}
              {live && (
                <circle r="2.6" fill={LIFE} filter="url(#at-glow)">
                  <animateMotion dur={`${2.2 + (d.x % 7) * 0.12}s`} repeatCount="indefinite" path={`M ${CX} ${CY} L ${d.x} ${d.y}`} />
                </circle>
              )}
            </g>
          );
        })}
        {districts.map((d) => {
          const sealed = d.state === 'sealed';
          const live = d.state === 'live';
          const open = d.state === 'open';
          const coreR = sealed ? 14 : 18;
          return (
            <g key={`node-${d.id}`} onClick={() => onOpenTab('fleet')} className="cursor-pointer">
              <title>
                {d.title[lang]} · {sealed ? t('atlasLocked', lang) : `${d.ageHours ?? '—'} ${t('atlasHours', lang)}`}
              </title>
              {/* selection/attention halo */}
              {live && <circle cx={d.x} cy={d.y} r={coreR + 8} fill="none" stroke={LIFE} strokeWidth="1" opacity="0.5" className="hq-ring" />}
              {live && <circle cx={d.x} cy={d.y} r={coreR + 8} fill="none" stroke={LIFE} strokeWidth="1" opacity="0.3" className="hq-ring hq-ring-late" />}
              {/* open bloom */}
              {!sealed && <circle cx={d.x} cy={d.y} r={coreR + 12} fill={GOLD} opacity="0.06" className="hq-pool" />}
              {/* core */}
              {sealed ? (
                <circle cx={d.x} cy={d.y} r={coreR} fill="#101012" stroke="#3f3f46" strokeWidth="1.4" strokeDasharray="3 4" />
              ) : (
                <circle cx={d.x} cy={d.y} r={coreR} fill="url(#at-core)" stroke={GOLD_L} strokeOpacity={open ? 0.55 : 0.95} strokeWidth="1.4" filter="url(#at-glow)" />
              )}
              {sealed && (
                <text x={d.x} y={d.y + 4} textAnchor="middle" fontSize="11" fill="#52525b">
                  ✕
                </text>
              )}
              {/* life dot on live districts */}
              {live && <circle cx={d.x + coreR - 3} cy={d.y - coreR + 3} r="3.2" fill={LIFE} stroke="#120d09" strokeWidth="1.2" className="hq-pulse" />}
              {/* label chip */}
              <g transform={`translate(${d.x},${d.y + coreR + 6})`} pointerEvents="none">
                <rect x="-62" y="0" width="124" height="30" rx="5" fill={sealed ? '#0f0f12cc' : '#131316dd'} stroke={sealed ? 'rgba(255,255,255,0.06)' : 'rgba(217,70,239,0.3)'} strokeWidth="0.8" />
                {sealed ? (
                  <>
                    <text x="0" y="12.5" fontSize="10.5" fontWeight="700" fill="#a1a1aa" textAnchor="middle">
                      {truncate(d.title[lang], 16)}
                    </text>
                    <text x="0" y="24.5" fontSize="9" fill="#71717a" textAnchor="middle" fontFamily={mono} direction="ltr">
                      {t('atlasSealed', lang)}
                    </text>
                  </>
                ) : (
                  <>
                    <text x="0" y="12.5" fontSize="10.5" fontWeight="700" fill={CHALK} textAnchor="middle">
                      {truncate(d.title[lang], 16)}
                    </text>
                    <text x="0" y="24.5" fontSize="9" fill={live ? LIFE : DIM} textAnchor="middle" fontFamily={mono} direction="ltr">
                      {live ? '● ' : ''}{d.ageHours ?? '—'}h
                    </text>
                  </>
                )}
              </g>
            </g>
          );
        })}

        {/* empty state */}
        {books.length === 0 && (
          <text x={CX} y={CY + 150} textAnchor="middle" fontSize="12.5" fill={DIM}>
            {t('atlasEmpty', lang)}
          </text>
        )}

        {/* ── THE OFFICE ECONOMY — honest indices, reference-clean card ── */}
        <g>
          <rect x="812" y="22" width="344" height="196" rx="8" fill="#131316dd" stroke="rgba(217,70,239,0.35)" strokeWidth="1.2" />
          <rect x="812" y="22" width="344" height="2.6" rx="1.3" fill="url(#at-wire)" />
          <text x="1140" y="48" fontSize="12.5" fontWeight="800" letterSpacing="1.2" fill={GOLD_L} textAnchor="end">
            {t('econTitle', lang)}
          </text>
          {economy.map((row, i) => {
            const y = 74 + i * 26;
            return (
              <g key={row.label}>
                <text x="1140" y={y} fontSize="10.4" fill={CHALK} textAnchor="end">
                  {row.label}
                </text>
                <text x="828" y={y} fontSize="11.5" fontWeight="800" fill={GOLD_L} textAnchor="start" fontFamily={mono} direction="ltr">
                  {row.value}
                </text>
                {/* meter rail + fill */}
                <rect x="828" y={y + 6.5} width="280" height="3.2" rx="1.6" fill="#3f3f46" />
                <rect
                  x="828"
                  y={y + 6.5}
                  width={Math.max(4, 280 * row.pct)}
                  height="3.2"
                  rx="1.6"
                  fill={GOLD}
                  opacity="0.9"
                  style={{ transition: 'width 900ms cubic-bezier(0.2,0.8,0.3,1)' }}
                />
              </g>
            );
          })}
          <text x="984" y="209" fontSize="8.8" fill={DIM} textAnchor="middle">
            {t('econNote', lang)}
          </text>
        </g>

        {/* ── header plaque ── */}
        <g>
          <rect x="24" y="22" width="384" height="66" rx="8" fill="#131316dd" stroke="rgba(217,70,239,0.35)" strokeWidth="1.2" />
          <rect x="24" y="22" width="2.6" height="66" fill={GOLD} />
          <text x="40" y="44" fontSize="12.5" fontWeight="800" letterSpacing="1.2" fill={GOLD_L}>
            {t('atlasTitle', lang)}
          </text>
          <text x="40" y="62" fontSize="9.8" fill="#a1a1aa">
            {t('atlasViewHint', lang)}
          </text>
          {/* legend */}
          <g fontFamily={mono} fontSize="10" direction="ltr">
            <circle cx="44" cy="75" r="3" fill={LIFE} />
            <text x="52" y="78.5" fill={CHALK}>{counts.live} {t('atlasLive', lang)}</text>
            <circle cx="140" cy="75" r="3" fill={GOLD} />
            <text x="148" y="78.5" fill={CHALK}>{counts.open} {t('atlasOpen', lang)}</text>
            <circle cx="236" cy="75" r="3" fill="none" stroke="#52525b" strokeWidth="1.2" strokeDasharray="2 2" />
            <text x="245" y="78.5" fill={CHALK}>{counts.sealed} {t('atlasSealed', lang)}</text>
          </g>
        </g>
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
