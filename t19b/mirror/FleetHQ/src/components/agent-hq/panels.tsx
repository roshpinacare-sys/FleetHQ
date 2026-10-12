'use client';

// Ops Slate components — the console instrument set (DESIGN.md §5).
// Every color comes from tokens.ts semantics; no ad-hoc palettes here.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentView, BookView, CrewMember, Decision, FeedItem, Goal, LogEntry, Report, Task } from './types';
import { t, taskStatusName, stateName, type Lang } from './i18n';
import {
  AGENT_SEMANTIC,
  FEED_KIND_SEMANTIC,
  GOAL_SEMANTIC,
  TASK_SEMANTIC,
  semanticVar,
  type Semantic,
} from '@/components/hq/tokens';

/* ── shared helpers (the ONE copy — audit finding L1) ────────────────── */

export function timeAgo(ts: number, lang: Lang): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return t('now', lang);
  if (m < 60) return lang === 'he' ? `לפני ${m} דק׳` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'he' ? `לפני ${h} שע׳` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === 'he' ? `לפני ${d} ימים` : `${d}d ago`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function fmtBytes(n: number): string {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}K` : String(n);
}

/* ── primitives ──────────────────────────────────────────────────────── */

export function StatusDot({ s, live = false }: { s: Semantic; live?: boolean }) {
  return <span className={`sl-dot ${live ? 'sl-dot-live' : ''}`} style={{ backgroundColor: semanticVar(s) }} aria-hidden="true" />;
}

export function Panel({ title, meta, children, actions }: { title: string; meta?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="sl-panel min-w-0">
      <header className="sl-panel-head">
        <h2 className="sl-panel-title" dir="auto">{title}</h2>
        {actions}
        {meta && <span className="sl-panel-meta" dir="ltr">{meta}</span>}
      </header>
      {children}
    </section>
  );
}

/* ── alerts strip: exists only when something needs eyes ─────────────── */

export function AlertsStrip({ blocked, openDecisions, errors, lang }: { blocked: number; openDecisions: number; errors: number; lang: Lang }) {
  if (!blocked && !openDecisions && !errors) return null;
  return (
    <div className="sl-alerts" role="status" aria-live="polite">
      <span className="sl-alert" style={{ color: 'var(--st-danger)' }}>
        <StatusDot s="danger" />
        {t('alertAttention', lang)}
      </span>
      {blocked > 0 && (
        <button className="sl-alert underline decoration-dotted underline-offset-4" onClick={() => document.getElementById('sec-tasks')?.scrollIntoView({ behavior: 'smooth' })}>
          {blocked} {blocked === 1 ? t('alertBlocked', lang) : t('alertBlockedPlural', lang)}
        </button>
      )}
      {openDecisions > 0 && (
        <button className="sl-alert underline decoration-dotted underline-offset-4" onClick={() => document.getElementById('sec-decisions')?.scrollIntoView({ behavior: 'smooth' })}>
          {openDecisions} {t('alertOpenDecisions', lang)}
        </button>
      )}
      {errors > 0 && (
        <button className="sl-alert underline decoration-dotted underline-offset-4" onClick={() => document.getElementById('sec-journal')?.scrollIntoView({ behavior: 'smooth' })}>
          {errors} {t('alertErrors', lang)}
        </button>
      )}
    </div>
  );
}

/* ── status strip: real instruments, "—" when unknown ────────────────── */

export function StripItem({ label, value, tone, sub, mono = true }: { label: string; value: string; tone?: Semantic; sub?: string; mono?: boolean }) {
  return (
    <div className="flex min-w-[104px] flex-1 flex-col gap-0.5 px-4 py-3">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-[color:var(--ink-3)]" dir="auto">{label}</span>
      <span className={`flex items-center gap-1.5 text-[15px] font-semibold leading-5 ${mono ? 'font-mono tabular-nums' : ''}`} style={tone ? { color: semanticVar(tone) } : undefined} dir={mono ? 'ltr' : 'auto'}>
        {value}
      </span>
      {sub && <span className="text-[10.5px] leading-3.5 text-[color:var(--ink-3)]" dir="auto">{sub}</span>}
    </div>
  );
}

/* ── goal card ───────────────────────────────────────────────────────── */

export function GoalCard({ goal, doneCount, tasksTotal, lang }: { goal?: Goal; doneCount: number; tasksTotal: number; lang: Lang }) {
  const sem = goal ? GOAL_SEMANTIC[goal.status] : 'neutral';
  return (
    <Panel title={t('goalCard', lang)} meta={goal ? `${Math.round(goal.progress * 100)}%` : undefined}>
      <div className="p-4">
        {goal ? (
          <>
            <div className="flex items-center gap-2">
              <StatusDot s={sem} live={goal.status === 'active'} />
              <span className="text-[13px] font-semibold" style={{ color: semanticVar(sem) }} dir="auto">
                {goalStatusName(goal.status, lang)}
              </span>
              {goal.origin && (
                <span className="sl-chip !py-0.5 !text-[11px]" dir="auto">
                  {goal.origin === 'patrol' ? t('patrolBadge', lang) : t('commanderBadge', lang)}
                </span>
              )}
            </div>
            <p className="mt-2 text-[14px] leading-6 text-[color:var(--ink)]" dir="auto">{goal.text}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-2)]" role="progressbar" aria-valuenow={Math.round(goal.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(goal.progress * 100)}%`, backgroundColor: semanticVar(sem) }} />
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--ink-3)]" dir="auto">
              {t('goalTasksDone', lang)}: <span className="font-mono tabular-nums">{doneCount}/{tasksTotal}</span>
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-6 text-[color:var(--ink-3)]" dir="auto">{t('goalNone', lang)}</p>
        )}
      </div>
    </Panel>
  );
}

function goalStatusName(s: Goal['status'], lang: Lang): string {
  switch (s) {
    case 'planning': return t('goalPlanning', lang);
    case 'active': return t('goalActive', lang);
    case 'review': return t('goalReview', lang);
    case 'done': return t('goalDone', lang);
    default: return t('goalFailed', lang);
  }
}

/* ── task board: full-width kanban, honest lifecycle order ───────────── */

const COLS: Array<Task['status']> = ['todo', 'doing', 'review', 'blocked', 'done', 'cancelled'];

/** Task 52 — משך-עבודה נמדד: שניות קצרות כשניות, אחרת דקות ושניות */
function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60 ? ` ${s % 60}s` : ''}`;
}

export function TasksBoard({ lang, tasks, crew, focusTask }: { lang: Lang; tasks: Task[]; crew: CrewMember[]; focusTask?: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const focusRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusTask && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusTask]);
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  return (
    <Panel title={t('secTasks', lang)} meta={`${tasks.filter((x) => x.status === 'doing').length} ${t('stripWorking', lang)}`}>
      {tasks.length === 0 ? (
        <div className="sl-empty" dir="auto">{t('tasksEmpty', lang)}</div>
      ) : (
        <div className="p-3">
          <div className="sl-board sl-scroll pb-1">
            {COLS.map((status) => {
              const list = tasks.filter((x) => x.status === status);
              const sem = TASK_SEMANTIC[status];
              return (
                <div key={status} className="sl-col">
                  <div className="sl-col-head">
                    <StatusDot s={sem} />
                    <span className="truncate" dir="auto">{taskStatusName(status, lang)}</span>
                    <span className="ms-auto font-mono tabular-nums text-[color:var(--ink-3)]">{list.length}</span>
                  </div>
                  <div className="sl-col-cards sl-scroll max-h-[420px] overflow-y-auto">
                    {list.map((task) => {
                      const owner = task.assignee ? crewById.get(task.assignee) : undefined;
                      // a drill-down target (decision → task) stays expanded while focused
                      const expanded = open === task.id || focusTask === task.id;
                      const focused = focusTask === task.id;
                      return (
                        <button
                          key={task.id}
                          ref={focused ? focusRef : undefined}
                          onClick={() => setOpen(expanded ? null : task.id)}
                          className="sl-card"
                          aria-expanded={expanded}
                          style={focused ? { borderColor: 'var(--accent)', background: 'var(--accent-dim)' } : undefined}
                        >
                          <span className="flex items-start gap-2" dir="auto">
                            {owner && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: owner.color }} aria-hidden="true" />}
                            <span className="min-w-0 text-[13px] font-medium leading-5 text-[color:var(--ink)]">{task.title}</span>
                          </span>
                          {task.why && !expanded && (
                            <span className="mt-1 flex items-center gap-1.5 text-[11.5px] leading-4 text-[color:var(--ink-3)]" dir="auto">
                              <span className="shrink-0 font-mono text-[10px] font-semibold" style={{ color: semanticVar('info') }}>{task.matchBy === 'fit' ? 'FIT' : 'LLM'}</span>
                              <span className="truncate">{truncate(task.why, 64)}</span>
                            </span>
                          )}
                          {/* Task 52 — משך-המשימה הנמדד: חי בזמן-ריצה, נמדד אחרת */}
                          {task.status === 'doing' && task.startedAt ? (
                            <span className="mt-1 block font-mono text-[10.5px] tabular-nums" style={{ color: semanticVar('attention') }} dir="ltr">
                              {t('taskElapsed', lang)} {fmtDur(Date.now() - task.startedAt)}
                            </span>
                          ) : task.durationMs != null ? (
                            <span className="mt-1 block font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]" dir="ltr">
                              {t('taskDuration', lang)}: {fmtDur(task.durationMs)}
                            </span>
                          ) : null}
                          {expanded && (
                            <span className="mt-2 block space-y-1.5 border-t border-[color:var(--line)] pt-2 text-[12px] leading-4 text-[color:var(--ink-2)]" dir="auto">
                              {task.description && <span className="block">{task.description}</span>}
                              {owner && <span className="block">{t('assignee', lang)}: <span style={{ color: owner.color }}>{owner.name[lang]}</span></span>}
                              {task.why && <span className="block" style={{ color: semanticVar('info') }}>{task.matchBy === 'fit' ? 'FIT' : 'LLM'} · {task.why}</span>}
                              {task.dependsOn.length > 0 && <span className="block">{t('dependsOn', lang)}: <span className="font-mono">{task.dependsOn.join(', ')}</span></span>}
                              {task.durationMs != null && <span className="block">{t('taskDuration', lang)}: <span className="font-mono tabular-nums" dir="ltr">{fmtDur(task.durationMs)}</span></span>}
                              {task.summary && <span className="block rounded-md bg-[color:var(--surface-2)] p-1.5">{t('summary', lang)}: {task.summary}</span>}
                              <span className="block font-mono text-[11px] text-[color:var(--ink-3)]" dir="ltr">{task.id}</span>
                              <span className="block text-[color:var(--ink-3)]">{timeAgo(task.updatedAt, lang)}</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {!list.length && <span className="px-1 py-1.5 text-[11px] text-[color:var(--ink-3)]">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── agent inspector (the monitor) ───────────────────────────────────── */

const LOG_TONE: Record<LogEntry['kind'], Semantic> = {
  text: 'neutral',
  tool: 'info',
  result: 'ok',
  error: 'danger',
  report: 'ok',
  say: 'info',
};

export function AgentInspector({ lang, crew, agent, logs, tasks }: { lang: Lang; crew: CrewMember[]; agent?: AgentView; logs: LogEntry[]; tasks: Task[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  const member = crew.find((c) => c.id === agent?.id);
  const task = tasks.find((x) => x.id === agent?.taskId);

  if (!member || !agent)
    return <div className="sl-empty" dir="auto">{t('selectAgent', lang)}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-[color:var(--line)] p-3" dir="auto">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-bold text-[#14060f]" style={{ backgroundColor: member.color }} aria-hidden="true">
          {member.name[lang].slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-[color:var(--ink)]">{member.name[lang]}</span>
            <span className="sl-chip !py-0" style={{ color: semanticVar(AGENT_SEMANTIC[agent.state]) }}>
              <StatusDot s={AGENT_SEMANTIC[agent.state]} live={AGENT_SEMANTIC[agent.state] === 'working'} />
              {stateName(agent.state, lang)}
            </span>
          </div>
          <div className="truncate text-[12px] text-[color:var(--ink-3)]" dir="auto">{member.title[lang]}</div>
        </div>
      </div>
      <div className="space-y-2 border-b border-[color:var(--line)] p-3" dir="auto">
        {agent.activity && <p className="text-[13px] leading-5 text-[color:var(--ink-2)]">{agent.activity}</p>}
        <p className="text-[12px] text-[color:var(--ink-3)]">
          {t('currentTask', lang)}: {task ? <span className="text-[color:var(--ink-2)]">{task.title}</span> : t('noCurrentTask', lang)}
        </p>
        <p className="text-[11.5px] text-[color:var(--ink-3)]" dir="auto">
          {t('stateSince', lang)}: {timeAgo(agent.since, lang)}
        </p>
      </div>
      <div ref={scroller} className="hq-scroll min-h-0 flex-1 overflow-y-auto bg-[color:var(--surface-2)] p-2.5" dir="ltr">
        {logs.length === 0 && <div className="sl-empty !p-6">{t('logEmpty', lang)}</div>}
        {logs.map((entry, i) => (
          <div key={i} className="sl-feed-in flex gap-2 py-0.5 font-mono text-[12px] leading-5">
            <span className="shrink-0 text-[color:var(--ink-3)]">{new Date(entry.ts).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour12: false })}</span>
            <span className="shrink-0" style={{ color: semanticVar(LOG_TONE[entry.kind]) }}>·</span>
            <span className="whitespace-pre-wrap break-all text-[color:var(--ink-2)]">{entry.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── decisions (transparency record — resolved autonomously) ─────────── */

export function DecisionsPanel({ lang, decisions, onOpenTask }: { lang: Lang; decisions: Decision[]; onOpenTask?: (taskId: string) => void }) {
  const open = decisions.filter((d) => d.status === 'open');
  const answered = decisions.filter((d) => d.status === 'answered').slice(-5).reverse();
  return (
    <div className="divide-y divide-[color:var(--line)]">
      {!open.length && !answered.length && <div className="sl-empty" dir="auto">{t('noDecisions', lang)}</div>}
      {open.map((d) => (
        <article key={d.id} className="p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: semanticVar('attention') }} dir="auto">
            <StatusDot s="attention" live />
            {t('deciding', lang)}
          </div>
          <p className="mt-1.5 text-[14px] font-medium leading-6 text-[color:var(--ink)]" dir="auto">{d.question}</p>
          {d.context && <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-5 text-[color:var(--ink-2)]" dir="auto">{d.context}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {d.options.map((o) => (
              <span key={o} className="sl-chip" dir="auto">{o}</span>
            ))}
            {d.taskId && onOpenTask && (
              <button
                onClick={() => onOpenTask(d.taskId as string)}
                className="sl-chip !border-dashed font-mono !text-[11px]"
                style={{ color: 'var(--accent)' }}
                title={t('goToTask', lang)}
                dir="ltr"
              >
                {t('goToTask', lang)} → {d.taskId}
              </button>
            )}
          </div>
        </article>
      ))}
      {answered.map((d) => (
        <article key={d.id} className="p-3.5">
          <p className="text-[13px] leading-5 text-[color:var(--ink-2)]" dir="auto">{truncate(d.question, 110)}</p>
          <p className="mt-1 text-[12px]" style={{ color: semanticVar('ok') }} dir="auto">
            {t('resolved', lang)}: {d.answer?.option ?? d.answer?.text ?? '—'} · {timeAgo(d.answer?.ts ?? d.createdAt, lang)}
          </p>
        </article>
      ))}
    </div>
  );
}

/* ── reports (the library, latest first) ─────────────────────────────── */

export function ReportsPanel({ lang, reports, limit }: { lang: Lang; reports: Report[]; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!reports.length) return <div className="sl-empty" dir="auto">{t('noReports', lang)}</div>;
  const shown = limit ? reports.slice(0, limit) : reports;
  return (
    <div className="divide-y divide-[color:var(--line)]">
      {shown.map((r) => {
        const expanded = open === r.id;
        return (
          <article key={r.id} className="p-3.5">
            <button className="w-full text-start" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
              <span className="block text-[14px] font-semibold leading-5 text-[color:var(--ink)]" dir="auto">{r.title}</span>
              <span className="mt-0.5 block text-[12px] text-[color:var(--ink-3)]" dir="auto">
                {t('by', lang)} {r.author} · {timeAgo(r.ts, lang)}
              </span>
            </button>
            {expanded ? (
              <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-[color:var(--surface-2)] p-3 text-[13px] leading-6 text-[color:var(--ink-2)]" dir="auto">{r.body}</p>
            ) : (
              <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-5 text-[color:var(--ink-3)]" dir="auto">{r.body}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ── fleet books registry ────────────────────────────────────────────── */

export function FleetBooksPanel({ lang, books, crew, onPreview, focusBook }: { lang: Lang; books: BookView[]; crew: CrewMember[]; onPreview: (id: string) => void; focusBook?: string | null }) {
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const focusRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusBook && focusRef.current) focusRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusBook]);
  return (
    <div className="sl-scroll max-h-[420px] overflow-y-auto">
      {books.map((b) => {
        const owner = b.owner ? crewById.get(b.owner) : undefined;
        const stale = (b.ageHours ?? 0) > 72;
        const sem: Semantic = b.ok === false ? 'danger' : stale ? 'attention' : 'ok';
        const focused = focusBook === b.id;
        return (
          <button
            key={b.id}
            ref={focused ? focusRef : undefined}
            onClick={() => onPreview(b.id)}
            className="sl-row w-full"
            style={focused ? { background: 'var(--accent-dim)', boxShadow: 'inset 2px 0 0 var(--accent)' } : undefined}
            dir="auto"
          >
            <span className="h-6 w-1 shrink-0 rounded-full" style={{ backgroundColor: owner?.color ?? 'var(--st-neutral)' }} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-[color:var(--ink)]">{b.title[lang]}</span>
              <span className="block truncate text-[11.5px] text-[color:var(--ink-3)]" dir="ltr">{b.file} · {fmtBytes(b.bytes)}</span>
            </span>
            <span className="shrink-0 text-end">
              <span className="block font-mono text-[12px] tabular-nums" style={{ color: semanticVar(sem) }} dir="ltr">
                {b.ageHours !== undefined ? `${b.ageHours.toFixed(1)}h` : '—'}
              </span>
              {owner && <span className="block text-[11px] text-[color:var(--ink-3)]" dir="auto">{owner.name[lang]}</span>}
            </span>
          </button>
        );
      })}
      {!books.length && <div className="sl-empty" dir="auto">{t('noBooks', lang)}</div>}
    </div>
  );
}

/* ── activity journal with filters ───────────────────────────────────── */

type FeedFilter = 'all' | 'work' | 'done' | 'issues';
const FILTER_KINDS: Record<Exclude<FeedFilter, 'all'>, string[]> = {
  work: ['goal', 'plan', 'task', 'message', 'user'],
  done: ['decision', 'report', 'git'],
  issues: ['error'],
};

export function FeedJournal({ lang, feed }: { lang: Lang; feed: FeedItem[] }) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const sorted = useMemo(() => [...feed].sort((a, b) => b.ts - a.ts), [feed]);
  const shown = filter === 'all' ? sorted : sorted.filter((f) => FILTER_KINDS[filter].includes(f.kind));
  const filters: Array<[FeedFilter, string, number]> = [
    ['all', t('filterAll', lang), sorted.length],
    ['work', t('filterWorking', lang), sorted.filter((f) => FILTER_KINDS.work.includes(f.kind)).length],
    ['done', t('filterDone', lang), sorted.filter((f) => FILTER_KINDS.done.includes(f.kind)).length],
    ['issues', t('filterIssues', lang), sorted.filter((f) => f.kind === 'error').length],
  ];
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap gap-1.5 border-b border-[color:var(--line)] p-2.5" role="tablist" aria-label={t('secJournal', lang)}>
        {filters.map(([key, label, n]) => (
          <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className="sl-chip transition-colors" data-active={filter === key}
            style={filter === key ? { borderColor: 'var(--accent)', color: 'var(--ink)', background: 'var(--accent-dim)' } : undefined}>
            {label}
            <span className="font-mono tabular-nums text-[color:var(--ink-3)]">{n}</span>
          </button>
        ))}
      </div>
      <div className="sl-scroll max-h-[420px] min-h-[120px] overflow-y-auto p-1.5" dir="auto">
        {shown.length === 0 && <div className="sl-empty !p-6" dir="auto">{t('emptyFeed', lang)}</div>}
        {shown.map((f) => {
          const sem = FEED_KIND_SEMANTIC[f.kind] ?? 'neutral';
          return (
            <div key={f.id} className="sl-feed-in flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-5 hover:bg-[rgba(255,255,255,0.03)]">
              <span className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-[color:var(--ink-3)]" dir="ltr">
                {new Date(f.ts).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour12: false })}
              </span>
              <span
                className="sl-tip shrink-0 rounded px-1 font-mono text-[10px] font-bold"
                data-t={f.kind}
                style={{ color: semanticVar(sem), backgroundColor: 'var(--surface-2)' }}
                aria-label={f.kind}
              >
                {f.kind === 'error' ? '!' : f.kind === 'git' ? '⑂' : f.kind === 'decision' ? '✓' : f.kind === 'report' ? '▤' : f.kind === 'goal' ? '◎' : '·'}
              </span>
              <span className={`min-w-0 ${f.kind === 'error' ? 'font-medium' : ''}`} style={{ color: f.kind === 'error' ? semanticVar('danger') : 'var(--ink-2)' }}>{f.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
