'use client';

import { memo, useMemo } from 'react';
import type { AgentView, BookView, CrewMember, LogEntry, Station, Task } from './types';
import { STATE_COLORS } from './types';
import { t, type Lang } from './i18n';

// The office floor: task wall (north), library (west), decision podium (east),
// five operator desks with live monitors, and the crew walking between stations.
// Movement is CSS-transitioned for smooth, cheap 60fps motion.

const W = 1180;
const H = 640;

const DESKS: Record<string, { x: number; y: number }> = {
  gal: { x: 360, y: 318 },
  erez: { x: 590, y: 318 },
  tamar: { x: 820, y: 318 },
  shachar: { x: 470, y: 498 },
  yarden: { x: 710, y: 498 },
};

const STATIONS: Record<Exclude<Station, 'desk'>, { x: number; y: number }> = {
  wall: { x: 590, y: 162 },
  podium: { x: 948, y: 268 },
  library: { x: 135, y: 350 },
  offstage: { x: 590, y: 606 },
};

const WORKER_ORDER = ['gal', 'erez', 'tamar', 'shachar', 'yarden'];

function agentPos(a: AgentView): { x: number; y: number } {
  if (a.station === 'desk') {
    const d = DESKS[a.id] ?? { x: 590, y: 440 };
    return d;
  }
  const s = STATIONS[a.station];
  if (!s) return { x: 590, y: 440 };
  // crowd offsets so agents never fully overlap
  const idx = WORKER_ORDER.indexOf(a.id);
  const j = idx >= 0 ? (idx - 2) * 26 : 0;
  return { x: s.x + j, y: s.y + (a.id === 'aluf' ? 0 : 6) };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}K` : String(n);
}

interface OfficeProps {
  lang: Lang;
  crew: CrewMember[];
  agents: Record<string, AgentView>;
  logs: Record<string, LogEntry[]>;
  tasks: Task[];
  books: BookView[];
  openDecisions: number;
  reportsCount: number;
  newestReport?: string;
  bubbles: Record<string, { text: string; ts: number }>;
  selected: string | null;
  sim: boolean;
  onSelectAgent: (id: string) => void;
  onOpenTab: (tab: 'wall' | 'podium' | 'library' | 'fleet') => void;
}

function OfficeInner(props: OfficeProps) {
  const { lang, crew, agents, logs, tasks, books, openDecisions, reportsCount, newestReport, bubbles, selected, sim, onSelectAgent, onOpenTab } = props;

  const byStatus = useMemo(() => {
    const cols: Record<string, Task[]> = { todo: [], doing: [], review: [], done: [] };
    for (const task of tasks) if (cols[task.status]) cols[task.status].push(task);
    return cols;
  }, [tasks]);

  const staleBooks = books.filter((b) => (b.ageHours ?? 0) > 72 || b.ok === false).length;
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full select-none" role="img" aria-label="Fleet HQ office floor">
      <defs>
        <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b1c20" />
          <stop offset="100%" stopColor="#151518" />
        </linearGradient>
        <radialGradient id="pool" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#E0973F" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#E0973F" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb04d" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffb04d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="board" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#232428" />
          <stop offset="100%" stopColor="#1d1e22" />
        </linearGradient>
      </defs>

      {/* floor + grid */}
      <rect x="0" y="0" width={W} height={H} fill="url(#floor)" />
      <g stroke="#ffffff" strokeOpacity="0.03">
        {Array.from({ length: 12 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 55 + 30} x2={W} y2={i * 55 + 30} />
        ))}
        {Array.from({ length: 20 }, (_, i) => (
          <line key={`v${i}`} x1={i * 62 + 20} y1="0" x2={i * 62 + 20} y2={H} />
        ))}
      </g>

      {/* walls */}
      <rect x="0" y="0" width={W} height="26" fill="#101012" />
      <line x1="0" y1="26" x2={W} y2="26" stroke="#2c2d31" strokeWidth="2" />

      {/* light pools */}
      {Object.entries(DESKS).map(([id, d]) => (
        <circle key={`pool-${id}`} cx={d.x} cy={d.y - 40} r="120" fill="url(#pool)" />
      ))}

      {/* center rug */}
      <rect x="428" y="330" width="330" height="120" rx="14" fill="#232025" stroke="#3a3230" />
      <rect x="444" y="344" width="298" height="92" rx="10" fill="none" stroke="#E0973F" strokeOpacity="0.25" />
      <rect x="540" y="368" width="110" height="44" rx="8" fill="#2a2529" stroke="#3d3538" />

      {/* ================= TASK WALL (north) ================= */}
      <g onClick={() => onOpenTab('wall')} className="cursor-pointer">
        <rect x="250" y="44" width="680" height="112" rx="10" fill="url(#board)" stroke="#34353a" />
        <text x={296} y="66" fontSize="11" fontWeight="700" letterSpacing="2" fill="#8b8d94">
          {t('taskWallLabel', lang)}
        </text>
        <text x="884" y="66" fontSize="10" fill="#63656c" textAnchor="end">
          {tasks.length} {lang === 'he' ? 'משימות' : 'tasks'}
        </text>
        {(['todo', 'doing', 'review', 'done'] as const).map((status, ci) => {
          const colX = 268 + ci * 166;
          const list = byStatus[status];
          const label = t(status === 'todo' ? 'taskTodo' : status === 'doing' ? 'taskDoing' : status === 'review' ? 'taskReview' : 'taskDone', lang);
          return (
            <g key={status}>
              <rect x={colX} y="76" width="150" height="68" rx="6" fill="#1a1b1e" stroke="#2e2f34" />
              <text x={colX + 8} y="90" fontSize="9" fill="#9a9ca3" fontWeight="600">
                {label} · {list.length}
              </text>
              {list.slice(0, 3).map((task, i) => {
                const owner = task.assignee ? crewById.get(task.assignee) : undefined;
                return (
                  <g key={task.id}>
                    <rect x={colX + 6} y={94 + i * 16} width="138" height="13" rx="3" fill="#26272c" stroke="#33343a" strokeWidth="0.5" />
                    <rect x={colX + 6} y={94 + i * 16} width="3.5" height="13" rx="1.5" fill={owner?.color ?? '#71717a'} />
                    <text x={colX + 14} y={104 + i * 16} fontSize="8.5" fill="#c9cbd1">
                      {truncate(task.title, 20)}
                    </text>
                  </g>
                );
              })}
              {list.length > 3 && (
                <text x={colX + 8} y="141" fontSize="8" fill="#63656c">
                  +{list.length - 3}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* ================= LIBRARY (west) ================= */}
      <g onClick={() => onOpenTab('library')} className="cursor-pointer">
        <rect x="52" y="170" width="165" height="160" rx="10" fill="url(#board)" stroke="#34353a" />
        <text x="68" y="192" fontSize="10" fontWeight="700" letterSpacing="1.5" fill="#8b8d94">
          {t('libraryLabel', lang)}
        </text>
        <text x="200" y="192" fontSize="11" fontWeight="700" fill="#E0973F" textAnchor="end">
          {reportsCount}
        </text>
        {/* shelf spines */}
        {[0, 1, 2].map((row) => (
          <g key={row}>
            <rect x="66" y={206 + row * 38} width="136" height="4" rx="1" fill="#3a3b40" />
            {Array.from({ length: 7 }, (_, i) => {
              const colors = ['#3BA08F', '#C9A227', '#7BA05B', '#C76B4A', '#6E8FA8', '#E0973F', '#8b8d94'];
              const h = 20 + ((row * 7 + i) % 3) * 4;
              return (
                <rect key={i} x={70 + i * 18.5} y={210 + row * 38 - h} width="12" height={h} rx="2" fill={colors[(row * 7 + i) % 7]} opacity={reportsCount > row * 7 + i ? 0.9 : 0.28} />
              );
            })}
          </g>
        ))}
        {newestReport && (
          <text x="68" y="322" fontSize="8.5" fill="#9a9ca3">
            {truncate(newestReport, 24)}
          </text>
        )}
      </g>

      {/* ================= PODIUM (east) ================= */}
      <g onClick={() => onOpenTab('podium')} className="cursor-pointer">
        {openDecisions > 0 && <circle cx="1050" cy="216" r="74" fill="url(#lampGlow)" className="hq-pulse" />}
        {/* lamp post */}
        <line x1="1050" y1="222" x2="1050" y2="256" stroke="#3a3b40" strokeWidth="4" />
        <circle cx="1050" cy="214" r="10" fill={openDecisions > 0 ? '#ffb04d' : '#33343a'} stroke={openDecisions > 0 ? '#ffd9a3' : '#3a3b40'} strokeWidth="2" className={openDecisions > 0 ? 'hq-pulse' : ''} />
        {/* lectern */}
        <rect x="1010" y="256" width="80" height="46" rx="8" fill="#26272c" stroke="#3a3b40" />
        <rect x="1020" y="266" width="60" height="18" rx="4" fill="#1a1b1e" stroke="#33343a" strokeWidth="0.5" />
        <text x="1050" y="279" fontSize="9" fill={openDecisions > 0 ? '#ffb04d' : '#8b8d94'} textAnchor="middle" fontWeight="700">
          {openDecisions > 0 ? `! ${openDecisions}` : '—'}
        </text>
        <text x="1050" y="322" fontSize="10" letterSpacing="1.5" fill="#8b8d94" textAnchor="middle" fontWeight="700">
          {t('podiumLabel', lang)}
        </text>
        {openDecisions > 0 && (
          <text x="1050" y="338" fontSize="9" fill="#ffb04d" textAnchor="middle">
            {t('needsYou', lang)}
          </text>
        )}
      </g>

      {/* ================= REGISTRY BOARD (south) ================= */}
      <g onClick={() => onOpenTab('fleet')} className="cursor-pointer">
        <rect x="380" y="576" width="420" height="48" rx="8" fill="url(#board)" stroke="#34353a" />
        <text x="398" y="596" fontSize="10" fontWeight="700" letterSpacing="1.5" fill="#8b8d94">
          {t('registryLabel', lang)}
        </text>
        <text x="782" y="596" fontSize="10" fill="#9a9ca3" textAnchor="end">
          {books.length} {t('books', lang)}
        </text>
        <text x="398" y="613" fontSize="9" fill={staleBooks > 0 ? '#ffb04d' : '#63656c'}>
          {staleBooks > 0 ? `${staleBooks} ${lang === 'he' ? 'ספרים ישנים או דורשים בדיקה' : 'stale or flagged books'}` : lang === 'he' ? 'כל הספרים טריים' : 'all books fresh'}
        </text>
      </g>

      {/* plants */}
      {[
        { x: 38, y: 560 },
        { x: 1142, y: 560 },
        { x: 948, y: 90 },
        { x: 218, y: 90 },
      ].map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <rect x="-9" y="-8" width="18" height="14" rx="3" fill="#3a3230" />
          {[-8, 0, 8].map((dx) => (
            <ellipse key={dx} cx={dx} cy={-16} rx="6" ry="11" fill="#3f5c46" opacity="0.9" />
          ))}
        </g>
      ))}

      {/* ================= DESKS with live monitors ================= */}
      {Object.entries(DESKS).map(([id, d]) => {
        const member = crewById.get(id);
        if (!member) return null;
        const agent = agents[id];
        const tail = (logs[id] ?? []).filter((l) => l.kind !== 'say').slice(-3);
        const state = agent?.state ?? 'idle';
        return (
          <g key={id} onClick={() => onSelectAgent(id)} className="cursor-pointer">
            {/* desk */}
            <rect x={d.x - 78} y={d.y - 86} width="156" height="58" rx="8" fill="#2b2724" stroke="#453c35" />
            <rect x={d.x - 66} y={d.y - 78} width="132" height="42" rx="5" fill="#111214" stroke="#33343a" strokeWidth="0.8" />
            {/* monitor log lines (real) */}
            {tail.map((entry, i) => (
              <text key={i} x={d.x - 58} y={d.y - 64 + i * 12} fontSize="7.6" fill={entry.kind === 'error' ? '#ff7b81' : entry.kind === 'tool' ? '#ffb04d' : entry.kind === 'report' ? '#7BA05B' : '#3BA08F'} fontFamily="ui-monospace, monospace" direction="ltr">
                {truncate(entry.text.replace(/\s+/g, ' '), 30)}
              </text>
            ))}
            {tail.length === 0 && (
              <text x={d.x} y={d.y - 54} fontSize="7.6" fill="#43454c" textAnchor="middle" fontFamily="ui-monospace, monospace">
                ···
              </text>
            )}
            {/* desk lamp = state */}
            <circle cx={d.x + 62} cy={d.y - 70} r="4" fill={STATE_COLORS[state]} />
            {/* name tag on desk */}
            <text x={d.x - 70} y={d.y - 38} fontSize="8.5" fill="#9a9ca3" fontWeight="600">
              {member.name[lang]}
            </text>
            {/* chair */}
            <rect x={d.x - 14} y={d.y + 4} width="28" height="10" rx="4" fill="#24252a" stroke="#33343a" strokeWidth="0.6" />
          </g>
        );
      })}

      {/* ================= CREW ================= */}
      {crew.map((member) => {
        const agent = agents[member.id];
        const pos = agent ? agentPos(agent) : STATIONS.offstage;
        const state = agent?.state ?? 'idle';
        const color = member.color;
        const isBusy = ['thinking', 'reading', 'checking', 'writing'].includes(state);
        const bubble = bubbles[member.id];
        const isSel = selected === member.id;
        return (
          <g
            key={member.id}
            className="agent-move cursor-pointer"
            style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            onClick={() => onSelectAgent(member.id)}
          >
            {/* selection ring */}
            {isSel && <ellipse cx="0" cy="-2" rx="30" ry="10" fill="none" stroke="#E0973F" strokeWidth="1.6" strokeDasharray="4 3" />}
            {/* shadow */}
            <ellipse cx="0" cy="0" rx="16" ry="5" fill="#000" opacity="0.35" />
            <g className={isBusy ? 'agent-bob' : ''}>
              {/* legs */}
              <rect x="-8" y="-14" width="6" height="14" rx="2.5" fill="#1f2023" />
              <rect x="2" y="-14" width="6" height="14" rx="2.5" fill="#1f2023" />
              {/* body */}
              <rect x="-12" y="-38" width="24" height="26" rx="8" fill={color} />
              <rect x="-12" y="-30" width="24" height="4" fill="#000" opacity="0.14" />
              {/* arms */}
              <rect x="-16" y="-34" width="5" height="16" rx="2.5" fill={color} opacity="0.85" />
              <rect x="11" y="-34" width="5" height="16" rx="2.5" fill={color} opacity="0.85" />
              {/* head */}
              <circle cx="0" cy="-46" r="9" fill="#d9c6b0" />
              {/* headset */}
              <path d="M -9 -47 A 9 9 0 0 1 9 -47" stroke="#2a2b2e" strokeWidth="2.4" fill="none" />
              <rect x="-11.5" y="-48" width="4" height="7" rx="2" fill="#2a2b2e" />
              {/* hats: distinct silhouette per agent */}
              {member.id === 'aluf' && (
                <>
                  <rect x="-10" y="-56" width="20" height="7" rx="3" fill="#2a2b2e" />
                  <rect x="-13" y="-51" width="26" height="3" rx="1.5" fill="#1f2023" />
                  <rect x="-2.5" y="-58" width="5" height="4" rx="1" fill="#E0973F" />
                </>
              )}
              {member.id === 'gal' && <path d="M -9 -50 Q 0 -60 9 -50 L 9 -46 Q 0 -52 -9 -46 Z" fill="#2f6b60" />}
              {member.id === 'erez' && (
                <>
                  <rect x="-9" y="-55" width="18" height="5" rx="2" fill="#4a3f1c" />
                  <rect x="-11" y="-51" width="22" height="2.6" rx="1.3" fill="#3a3116" />
                </>
              )}
              {member.id === 'tamar' && (
                <>
                  <circle cx="7" cy="-53" r="4.5" fill="#4a5c38" />
                  <path d="M -9 -48 Q 0 -56 9 -48" stroke="#4a5c38" strokeWidth="3" fill="none" />
                </>
              )}
              {member.id === 'shachar' && <path d="M -10 -46 Q -11 -60 0 -60 Q 11 -60 10 -46 L 6 -48 Q 7 -55 0 -55 Q -7 -55 -6 -48 Z" fill="#7a4634" />}
              {member.id === 'yarden' && (
                <>
                  <path d="M -10 -46 A 10 10 0 0 1 10 -46" stroke="#39516b" strokeWidth="3" fill="none" />
                  <rect x="-13" y="-49" width="5" height="8" rx="2" fill="#39516b" />
                  <rect x="8" y="-49" width="5" height="8" rx="2" fill="#39516b" />
                </>
              )}
            </g>
            {/* state dot */}
            <circle cx="14" cy="-58" r="4.5" fill={STATE_COLORS[state]} stroke="#101012" strokeWidth="1.4" className={isBusy || state === 'waiting_user' ? 'hq-pulse' : ''} />
            {/* nameplate */}
            <g transform="translate(0,-72)">
              <rect x="-52" y="-13" width="104" height="26" rx="6" fill="#131316" stroke={isSel ? '#E0973F' : '#2e2f34'} strokeWidth="1" opacity="0.96" />
              <circle cx="-43" cy="-4" r="3" fill={STATE_COLORS[state]} />
              <text x="-36" y="-1.5" fontSize="10" fontWeight="700" fill="#eceef2">
                {member.name[lang]}
              </text>
              <text x="-46" y="8.5" fontSize="7.6" fill="#9a9ca3">
                {truncate(agent?.activity || member.title[lang], 30)}
              </text>
            </g>
            {/* speech bubble */}
            {bubble && (
              <g className="hq-bubble" transform="translate(0,-108)">
                <rect x="-90" y="-24" width="180" height="30" rx="9" fill="#f4f2ee" />
                <path d="M -6 6 L 0 14 L 6 6 Z" fill="#f4f2ee" />
                <text x="0" y="-5" fontSize="9.5" fill="#17171a" textAnchor="middle" fontWeight="600">
                  {truncate(bubble.text, 44)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* DEMO watermark */}
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
export { fmtBytes };
