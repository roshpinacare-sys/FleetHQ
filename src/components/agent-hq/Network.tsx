'use client';

import { useMemo } from 'react';
import type { BookView } from './types';
import { t, type Lang } from './i18n';
import { semanticVar, type Semantic } from '@/components/hq/tokens';

// ═══════════════════════════════════════════════════════════════════
//  THE NETWORK ATLAS — systems topology of the sovereign domains
//  (Ops Slate instrument — DESIGN.md is the law)
// ═══════════════════════════════════════════════════════════════════
//  The office is the center of the network. Every sovereign domain (a fleet
//  book) is a node whose ring encodes REAL freshness, measured from the book's
//  own heartbeat: fresh (≤6h) → ok, aging (≤72h) → attention, sealed (stale or
//  unreadable) → neutral. No stars, no glow, no gradients, no invented meters:
//  a bar exists ONLY where a true ratio exists (fresh books / registry,
//  territory opened); absolute counters render as plain mono numbers.
//
//  Deterministic rendering: placement is index-derived (golden angle), no
//  Math.random, no wall clock in render → SSR-safe. Clicking a district opens
//  that exact book in the fleet registry — the map is a navigation surface,
//  not a postcard.

const W = 1180;
const H = 640;
const CX = 590;
const CY = 344;
const ORBITS = [150, 228, 300];
const SQUASH = 0.86;

type DistrictState = 'live' | 'open' | 'sealed';

const STATE_SEMANTIC: Record<DistrictState, Semantic> = {
  live: 'ok',
  open: 'attention',
  sealed: 'neutral',
};

interface District extends BookView {
  x: number;
  y: number;
  orbit: number;
  state: DistrictState;
}

interface NetworkProps {
  lang: Lang;
  books: BookView[];
  /** false until the first real snapshot — the map shows "unknown", not an empty world */
  ready: boolean;
  opsDone: number;
  commits: number;
  reports: number;
  busy: number;
  /** drill into one book — opens the fleet registry focused on it */
  onOpenBook: (bookId: string) => void;
  onOpenFleet: () => void;
}

function districtState(b: BookView): DistrictState {
  if (b.ok === false) return 'sealed';
  const age = b.ageHours ?? Infinity;
  if (age <= 6) return 'live';
  if (age <= 72) return 'open';
  return 'sealed';
}

export function NetworkAtlas({ lang, books, ready, opsDone, commits, reports, busy, onOpenBook, onOpenFleet }: NetworkProps) {
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
      const r = ORBITS[orbit];
      // golden-angle spread per orbit — deterministic, evenly distributed
      const idxInOrbit = i % 6;
      const angle = (-90 + idxInOrbit * 60 + orbit * 31) * (Math.PI / 180);
      return { ...b, orbit, state: districtState(b), x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) * SQUASH };
    });
  }, [books]);

  const counts = useMemo(() => {
    // counted over the WHOLE registry, not just the displayed ring
    const all = books.map(districtState);
    const live = all.filter((s) => s === 'live').length;
    const open = all.filter((s) => s === 'open').length;
    const sealed = all.filter((s) => s === 'sealed').length;
    const total = books.length;
    return { live, open, sealed, total, ratio: total ? Math.min(1, (live + open) / total) : 0 };
  }, [books]);

  const freshRatio = counts.total ? counts.live / counts.total : 0;

  // honest economy readout — numbers where a number is true, meters only for real ratios
  const rows: Array<{ label: string; value: string; meter?: { pct: number; color: string } }> = [
    { label: t('econProd', lang), value: String(opsDone) },
    { label: t('econCirc', lang), value: String(commits) },
    { label: t('econKnow', lang), value: String(reports) },
    { label: t('econReserve', lang), value: `${counts.live}/${counts.total}`, meter: { pct: freshRatio, color: semanticVar('ok') } },
    { label: t('econArea', lang), value: `${Math.round(counts.ratio * 100)}%`, meter: { pct: counts.ratio, color: semanticVar('info') } },
  ];

  const territoryAngle = counts.ratio * 360;

  return (
    <div className="relative h-full w-full" dir={lang === 'he' ? 'rtl' : 'ltr'}>
      {/* direction:ltr at the SVG root — the RTL page must not flip SVG text
          anchors or labels spill out of their cards. Hebrew is bidi-safe. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ direction: 'ltr' }} className="h-full w-full select-none" role="img" aria-label={t('atlasTitle', lang)}>
        {/* flat map ground — one surface, no gradients */}
        <rect width={W} height={H} fill="var(--bg)" />

        {/* orbit rings — the spatial model: rings are freshness distance */}
        {ORBITS.map((r) => (
          <ellipse key={r} cx={CX} cy={CY} rx={r} ry={r * SQUASH} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 9" />
        ))}

        {/* ── HQ core ── */}
        <g>
          {/* territory arc — the real share of the registry that is open */}
          <circle cx={CX} cy={CY} r="64" fill="none" stroke="var(--surface-2)" strokeWidth="3.5" />
          <circle
            cx={CX}
            cy={CY}
            r="64"
            fill="none"
            stroke={semanticVar('info')}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={`${(territoryAngle / 360) * 402} 402`}
            transform={`rotate(-90 ${CX} ${CY})`}
          />
          <circle cx={CX} cy={CY} r="46" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="38" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" fontFamily={mono} direction="ltr">
            HQ
          </text>
          <text x={CX} y={CY + 9} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--ink-2)">
            {t('atlasHq', lang)}
          </text>
          <text x={CX} y={CY + 27} textAnchor="middle" fontSize="10" fill="var(--ink-3)" fontFamily={mono} direction="ltr">
            {opsDone} ops
          </text>
          <text x={CX} y={CY + 88} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)">
            {Math.round(counts.ratio * 100)}% {t('atlasTerritory', lang)}
          </text>
          {busy > 0 && (
            <text x={CX} y={CY + 106} textAnchor="middle" fontSize="9.6" fill="var(--ink-3)">
              {busy} {lang === 'he' ? 'עובדים כרגע' : 'at work now'}
            </text>
          )}
        </g>

        {/* ── wires + districts ── */}
        {districts.map((d) => {
          const sealed = d.state === 'sealed';
          const sem = STATE_SEMANTIC[d.state];
          const color = semanticVar(sem);
          return (
            <line
              key={`wire-${d.id}`}
              x1={CX}
              y1={CY}
              x2={d.x}
              y2={d.y}
              stroke={sealed ? 'var(--line)' : color}
              strokeOpacity={sealed ? 0.9 : 0.4}
              strokeWidth={1.2}
              strokeDasharray={sealed ? '1 8' : '4 6'}
            />
          );
        })}
        {districts.map((d) => {
          const sealed = d.state === 'sealed';
          const sem = STATE_SEMANTIC[d.state];
          const color = semanticVar(sem);
          const coreR = sealed ? 13 : 17;
          return (
            <g
              key={`node-${d.id}`}
              onClick={() => onOpenBook(d.id)}
              className="cursor-pointer"
              role="button"
              aria-label={`${d.title[lang]} — ${sealed ? t('atlasSealed', lang) : `${d.ageHours ?? '—'} ${t('atlasHours', lang)}`}`}
            >
              <title>
                {d.title[lang]} · {sealed ? t('atlasSealed', lang) : `${d.ageHours ?? '—'} ${t('atlasHours', lang)}`}
              </title>
              {sealed ? (
                <circle cx={d.x} cy={d.y} r={coreR} fill="transparent" stroke={color} strokeWidth="1.4" strokeDasharray="3 4" />
              ) : (
                <>
                  <circle cx={d.x} cy={d.y} r={coreR} fill={color} fillOpacity="0.13" stroke={color} strokeWidth="1.4" />
                  <circle cx={d.x} cy={d.y} r="3.4" fill={color} />
                </>
              )}
              {sealed && (
                <text x={d.x} y={d.y + 3.5} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
                  ✕
                </text>
              )}
              {/* label chip — flat, tokened */}
              <g transform={`translate(${d.x},${d.y + coreR + 6})`} pointerEvents="none">
                <rect x="-62" y="0" width="124" height="30" rx="5" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="0.8" />
                <text x="0" y="12.5" fontSize="10.5" fontWeight="600" fill="var(--ink)" textAnchor="middle">
                  {truncate(d.title[lang], 16)}
                </text>
                <text x="0" y="24.5" fontSize="9" fill={sealed ? 'var(--ink-3)' : color} textAnchor="middle" fontFamily={mono} direction="ltr">
                  {sealed ? t('atlasSealed', lang) : `${d.ageHours ?? '—'}h`}
                </text>
              </g>
            </g>
          );
        })}

        {/* unknown state — before the first snapshot the map does not pretend */}
        {!ready && districts.length === 0 && (
          <g>
            <text x={CX} y={CY + 150} textAnchor="middle" fontSize="12.5" fill="var(--ink-3)">
              —
            </text>
            <text x={CX} y={CY + 170} textAnchor="middle" fontSize="11.5" fill="var(--ink-3)">
              {t('waitingFirstSnapshot', lang)}
            </text>
          </g>
        )}
        {ready && books.length === 0 && (
          <text x={CX} y={CY + 150} textAnchor="middle" fontSize="12.5" fill="var(--ink-3)">
            {t('atlasEmpty', lang)}
          </text>
        )}

        {/* ── legend (top-start) ── */}
        <g fontFamily={mono} fontSize="10">
          <rect x="24" y="22" width="330" height="40" rx="8" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <circle cx="44" cy="42" r="3.4" fill={semanticVar('ok')} />
          <text x="54" y="45.5" fill="var(--ink-2)">{counts.live} {t('atlasLive', lang)}</text>
          <circle cx="140" cy="42" r="3.4" fill={semanticVar('attention')} />
          <text x="150" y="45.5" fill="var(--ink-2)">{counts.open} {t('atlasOpen', lang)}</text>
          <circle cx="236" cy="42" r="3.4" fill="none" stroke={semanticVar('neutral')} strokeWidth="1.2" strokeDasharray="2 2" />
          <text x="246" y="45.5" fill="var(--ink-2)">{counts.sealed} {t('atlasSealed', lang)}</text>
        </g>

        {/* ── the office economy — honest readout card ── */}
        <g>
          <rect x="812" y="22" width="344" height="210" rx="8" fill="var(--surface)" stroke="var(--line)" strokeWidth="1" />
          <text x="1140" y="48" fontSize="12.5" fontWeight="600" fill="var(--ink)" textAnchor="end">
            {t('econTitle', lang)}
          </text>
          {rows.map((row, i) => {
            const y = 74 + i * 30;
            return (
              <g key={row.label}>
                <text x="1140" y={y} fontSize="10.4" fill="var(--ink-2)" textAnchor="end">
                  {row.label}
                </text>
                <text x="828" y={y} fontSize="11.5" fontWeight="600" fill="var(--ink)" textAnchor="start" fontFamily={mono} direction="ltr">
                  {row.value}
                </text>
                {row.meter && (
                  <>
                    <rect x="828" y={y + 6.5} width="280" height="3.2" rx="1.6" fill="var(--surface-2)" />
                    <rect x="828" y={y + 6.5} width={Math.max(2, 280 * Math.min(1, Math.max(0, row.meter.pct)))} height="3.2" rx="1.6" fill={row.meter.color} />
                  </>
                )}
              </g>
            );
          })}
          <text x="984" y="223" fontSize="8.8" fill="var(--ink-3)" textAnchor="middle">
            {t('econNote', lang)}
          </text>
        </g>
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
