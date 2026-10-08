'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentView, BookView, CrewMember, Decision, LogEntry, Report, Task } from './types';
import { STATE_COLORS } from './types';
import { t, taskStatusName, stateName, stationName, type Lang } from './i18n';

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function timeAgo(ts: number, lang: Lang): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return lang === 'he' ? 'עכשיו' : 'now';
  if (m < 60) return lang === 'he' ? `לפני ${m} דק׳` : `${m}m ago`;
  const h = Math.floor(m / 60);
  return lang === 'he' ? `לפני ${h} שע׳` : `${h}h ago`;
}

const KIND_STYLE: Record<LogEntry['kind'], { color: string; label: string }> = {
  text: { color: 'text-zinc-400', label: '·' },
  tool: { color: 'text-amber-400', label: '⚙' },
  result: { color: 'text-teal-300', label: '≡' },
  error: { color: 'text-red-400', label: '!' },
  report: { color: 'text-green-400', label: '▤' },
  say: { color: 'text-rose-300', label: '❝' },
};

// ---- Monitor panel ------------------------------------------------------------------

export function MonitorPanel({
  lang,
  crew,
  agent,
  logs,
  tasks,
}: {
  lang: Lang;
  crew: CrewMember[];
  agent: AgentView | undefined;
  logs: LogEntry[];
  tasks: Task[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  const member = crew.find((c) => c.id === agent?.id);
  const task = tasks.find((x) => x.id === agent?.taskId);

  if (!member || !agent)
    return <div className="grid h-40 place-items-center text-sm text-zinc-500">{t('selectAgent', lang)}</div>;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4" dir="auto">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-zinc-950" style={{ backgroundColor: member.color }}>
            {member.name[lang].slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{member.name[lang]}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: `${STATE_COLORS[agent.state]}22`, color: STATE_COLORS[agent.state] }}>
                {stateName(agent.state, lang)}
              </span>
            </div>
            <div className="truncate text-xs text-zinc-500">
              {member.title[lang]} · {stationName(agent.station, lang)}
            </div>
          </div>
        </div>
        {agent.activity && <div className="mt-3 rounded-lg bg-zinc-950/70 px-3 py-2 text-sm text-zinc-300" dir="auto">{agent.activity}</div>}
        {task && (
          <div className="mt-2 text-xs text-zinc-500" dir="auto">
            {t('assignee', lang)}: <span className="text-zinc-300">{task.title}</span>
          </div>
        )}
      </div>
      <div ref={scroller} className="hq-scroll min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/80 p-3" dir="ltr">
        {logs.length === 0 && <div className="grid h-24 place-items-center text-xs text-zinc-600">—</div>}
        {logs.map((entry, i) => (
          <div
            key={i}
            className="hq-feed-in flex gap-2 py-0.5 font-mono text-[11.5px] leading-5"
            style={{ animationDelay: `${Math.min(i, 12) * 0.02}s` }}
          >
            <span className="shrink-0 text-zinc-600">{new Date(entry.ts).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour12: false })}</span>
            <span className={`shrink-0 ${KIND_STYLE[entry.kind].color}`}>{KIND_STYLE[entry.kind].label}</span>
            <span className="whitespace-pre-wrap break-all text-zinc-300">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Task wall panel ------------------------------------------------------------------

export function WallPanel({
  lang,
  tasks,
  crew,
}: {
  lang: Lang;
  tasks: Task[];
  crew: CrewMember[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const cols: Array<'todo' | 'doing' | 'review' | 'done' | 'blocked'> = ['todo', 'doing', 'review', 'done', 'blocked'];
  const crewById = new Map(crew.map((c) => [c.id, c]));
  if (!tasks.length) return <div className="grid h-40 place-items-center text-sm text-zinc-500">{t('noTasks', lang)}</div>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {cols.map((status) => {
        const list = tasks.filter((x) => x.status === status);
        return (
          <div key={status} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-2">
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-zinc-400">
              <span>{taskStatusName(status, lang)}</span>
              <span className="rounded-full bg-zinc-800 px-1.5 text-[11px]">{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.map((task) => {
                const owner = task.assignee ? crewById.get(task.assignee) : undefined;
                const expanded = open === task.id;
                return (
                  <button
                    key={task.id}
                    onClick={() => setOpen(expanded ? null : task.id)}
                    className="hq-card w-full rounded-lg border border-zinc-800 bg-zinc-950/70 p-2 text-right"
                  >
                    <div className="flex items-start gap-2" dir="auto">
                      {owner && <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: owner.color }} />}
                      <span className="text-xs font-medium leading-4 text-zinc-200">{task.title}</span>
                    </div>
                    {expanded && (
                      <div className="mt-2 space-y-1.5 border-t border-zinc-800 pt-2 text-[11px] text-zinc-400" dir="auto">
                        {task.description && <p className="leading-4">{task.description}</p>}
                        {owner && (
                          <p>
                            {t('assignee', lang)}: <span style={{ color: owner.color }}>{owner.name[lang]}</span>
                          </p>
                        )}
                        {task.dependsOn.length > 0 && (
                          <p>
                            {t('dependsOn', lang)}: {task.dependsOn.join(', ')}
                          </p>
                        )}
                        {task.summary && (
                          <p className="rounded bg-zinc-900 p-1.5 leading-4 text-zinc-300">
                            {t('summary', lang)}: {task.summary}
                          </p>
                        )}
                        <p className="text-zinc-600">{timeAgo(task.updatedAt, lang)}</p>
                      </div>
                    )}
                  </button>
                );
              })}
              {!list.length && <div className="px-1 py-2 text-[11px] text-zinc-700">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Podium panel (transparency record — decisions resolve autonomously) --------------

export function PodiumPanel({ lang, decisions }: { lang: Lang; decisions: Decision[] }) {
  const open = decisions.filter((d) => d.status === 'open');
  const answered = decisions.filter((d) => d.status === 'answered').slice(-6).reverse();
  return (
    <div className="space-y-3">
      {/* the autonomy banner — visitors see the record, never hold the pen */}
      <div className="rounded-none border border-[#00E5FF]/30 bg-[#00E5FF]/5 px-3 py-2 text-[11.5px] leading-4.5 text-[#8fe9f7]">
        🔒 {t('podiumAutonomous', lang)}
      </div>
      {!open.length && !answered.length && <div className="grid h-24 place-items-center text-sm text-zinc-500">{t('noDecisions', lang)}</div>}
      {open.map((d) => (
        <div key={d.id} className="rounded-none border border-[#00E5FF]/40 bg-[#00E5FF]/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-[#4de3ff]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#00E5FF]/20 font-bold">⏳</span>
            {t('deciding', lang)}
          </div>
          <p className="font-medium leading-5" dir="auto">{d.question}</p>
          {d.context && <p className="mt-2 whitespace-pre-wrap text-xs leading-4 text-zinc-400" dir="auto">{d.context}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {d.options.map((o) => (
              <span key={o} className="rounded-full border border-[#232329] bg-[#101015] px-2.5 py-1 text-xs text-zinc-400" dir="auto">
                {o}
              </span>
            ))}
          </div>
        </div>
      ))}
      {answered.map((d) => (
        <div key={d.id} className="hq-card rounded-none border border-zinc-800 bg-zinc-900/40 p-3 opacity-80">
          <p className="text-sm leading-5" dir="auto">{truncate(d.question, 90)}</p>
          <p className="mt-1 text-xs text-[#7dffb0]" dir="auto">
            {t('resolved', lang)}: {d.answer?.option ?? d.answer?.text ?? '—'} · {timeAgo(d.answer?.ts ?? d.createdAt, lang)}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- Library panel ------------------------------------------------------------------

export function LibraryPanel({ lang, reports }: { lang: Lang; reports: Report[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!reports.length) return <div className="grid h-32 place-items-center px-6 text-center text-sm text-zinc-500">{t('noReports', lang)}</div>;
  return (
    <div className="space-y-3">
      {reports.map((r) => {
        const expanded = open === r.id;
        return (
          <div key={r.id} className="hq-card rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <button className="w-full text-right" onClick={() => setOpen(expanded ? null : r.id)}>
              <div className="font-semibold leading-5" dir="auto">{r.title}</div>
              <div className="mt-1 text-xs text-zinc-500" dir="auto">
                {t('by', lang)} {r.author} · {timeAgo(r.ts, lang)}
              </div>
            </button>
            {expanded ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-950/70 p-3 text-sm leading-6 text-zinc-300" dir="auto">
                {r.body}
              </p>
            ) : (
              <p className="mt-2 line-clamp-2 text-xs leading-4 text-zinc-500" dir="auto">{r.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Fleet registry panel --------------------------------------------------------------

export function FleetPanel({
  lang,
  books,
  crew,
  onPreview,
}: {
  lang: Lang;
  books: BookView[];
  crew: CrewMember[];
  onPreview: (id: string) => void;
}) {
  const crewById = new Map(crew.map((c) => [c.id, c]));
  return (
    <div className="hq-scroll max-h-[52vh] space-y-2 overflow-y-auto pl-1">
      {books.map((b) => {
        const owner = b.owner ? crewById.get(b.owner) : undefined;
        const stale = (b.ageHours ?? 0) > 72;
        return (
          <button
            key={b.id}
            onClick={() => onPreview(b.id)}
            className="hq-card hq-card-lift flex w-full items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-right"
          >
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: owner?.color ?? '#52525b' }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-200" dir="auto">
                {b.title[lang]}
              </span>
              <span className="block text-[11px] text-zinc-500" dir="ltr">
                {b.file} · {fmtBytes(b.bytes)}
              </span>
            </span>
            <span className="shrink-0 text-left">
              <span className={`block text-xs font-semibold ${stale ? 'text-amber-400' : b.ok === false ? 'text-red-400' : 'text-teal-300'}`} dir="auto">
                {b.ageHours !== undefined ? `${b.ageHours.toFixed(1)}h` : '—'}
              </span>
              {owner && (
                <span className="block text-[10px] text-zinc-500" dir="auto">
                  {owner.name[lang]}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {!books.length && <div className="grid h-24 place-items-center text-sm text-zinc-500">{t('noBooks', lang)}</div>}
    </div>
  );
}

function fmtBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}K` : String(n);
}
