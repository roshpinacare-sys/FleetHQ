'use client';

// Fleet HQ — Ops Slate shell (DESIGN.md is the law).
// Default view: OPERATIONS — an instrument, not a game. The office (2D/3D)
// and the network atlas remain dedicated views, still wired to the same
// one-truth socket. Zero ≠ unknown: before the first snapshot every
// instrument reads "—", never a fabricated 0.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import io, { type Socket } from 'socket.io-client';
import { useTheme } from 'next-themes';
import { Office } from './Office';
import { NetworkAtlas } from './Network';
import {
  AgentInspector,
  AlertsStrip,
  DecisionsPanel,
  FeedJournal,
  FleetBooksPanel,
  GoalCard,
  Panel,
  ReportsPanel,
  StatusDot,
  StripItem,
  TasksBoard,
} from './panels';
import { GitEvidencePanel } from './GitWire';
import StackHealth from './StackHealth';
import { ReceptionChat, type PublicStats } from './ReceptionChat';
import type { AgentView, BookView, CrewMember, Decision, FeedItem, GitPulse, Goal, LogEntry, Report, Snapshot, Task } from './types';
import { AGENT_SEMANTIC, semanticVar, type Semantic } from '@/components/hq/tokens';
import { t, stateName, type Lang } from './i18n';
import { timeAgo } from './panels';
import { useHq } from '@/lib/hq/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// החדר התלת-ממדי — client-only (קנבס WebGL לא רץ על השרת)
const Room3D = dynamic(() => import('@/components/hq/Room3D'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[color:var(--surface)]" dir="rtl">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--line-strong)] border-t-[color:var(--accent)]" />
        <p className="text-[13px] text-[color:var(--ink-2)]">{t('officeViewHint', 'he')}</p>
      </div>
    </div>
  ),
});

type Tab = 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git';
type View = 'ops' | 'office' | 'network';

const SECTION_FOR_TAB: Record<Tab, string> = {
  monitor: 'sec-crew',
  wall: 'sec-tasks',
  podium: 'sec-decisions',
  library: 'sec-reports',
  fleet: 'sec-fleet',
  git: 'sec-git',
};

const EMPTY_SNAPSHOT: Snapshot = {
  v: 1,
  status: { backend: 'live', llmProvider: '…', message: { he: 'מתחבר…', en: 'Connecting…' }, startedAt: Date.now(), opsDone: 0 },
  crew: [],
  agents: [],
  logs: {},
  tasks: [],
  decisions: [],
  reports: [],
  feed: [],
  books: [],
};

/** Static monogram — brand mark without theatrics (no glow, no breath). */
function Monogram() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" role="img" aria-label={t('title', 'he')}>
      <rect x="1" y="1" width="38" height="38" rx="9" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="central" fontSize="19" fontWeight="700" fill="var(--accent)">
        צ
      </text>
    </svg>
  );
}

/** Jerusalem clock — isolated so its 1Hz tick re-renders ONLY the clock,
 * not the whole console tree (the previous shared state re-rendered
 * every panel every second). */
function JerusalemClock({ lang }: { lang: Lang }) {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('he-IL', { hour12: false, timeZone: 'Asia/Jerusalem' }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="hidden font-mono tabular-nums sm:inline" dir="ltr">{clock} {t('jerusalem', lang)}</span>
  );
}

/** Task 51 (Daylight Slate): light is the default; night is the user's choice.
 * Uses next-themes' class strategy (html.dark) — no flash, persisted. */
function ThemeToggle({ lang }: { lang: Lang }) {
  const { resolvedTheme, setTheme } = useTheme();
  // hydration-safe mounted flag (no setState-in-effect — lint law)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <button
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="sl-btn sl-btn-ghost !min-h-[36px] !w-[36px] !px-0 !py-1 !text-[14px]"
      aria-label={lang === 'he' ? (dark ? 'מצב אור יום' : 'מצב לילה') : dark ? 'Daylight mode' : 'Night mode'}
      title={lang === 'he' ? (dark ? 'מצב אור יום' : 'מצב לילה') : dark ? 'Daylight mode' : 'Night mode'}
    >
      {mounted ? (dark ? '☀' : '☾') : '·'}
    </button>
  );
}

export default function AgentHQ() {
  const [lang, setLang] = useState<Lang>('he');
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [agents, setAgents] = useState<Record<string, AgentView>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [bubbles, setBubbles] = useState<Record<string, { text: string; ts: number }>>({});
  const [view, setView] = useState<View>('ops');
  // Default to the chief of staff so the inspector is NEVER a dead
  // "pick an agent" empty state — the console always has something to show.
  const [selected, setSelected] = useState<string | null>('aluf');
  const [connected, setConnected] = useState(false);
  const [gotSnapshot, setGotSnapshot] = useState(false);
  // freshness: ts of the last REAL wire event (any kind). The foreman proves
  // liveness with a 30s status heartbeat, so this can honestly distinguish
  // "quiet office" from "wedged socket".
  const [lastSignalAt, setLastSignalAt] = useState<number | null>(null);
  // drill-down targets (from the atlas / decisions) — scroll + highlight,
  // consumed and cleared so the operator can collapse the card again
  const [focusBook, setFocusBook] = useState<string | null>(null);
  const [focusTask, setFocusTask] = useState<string | null>(null);
  useEffect(() => {
    if (!focusBook && !focusTask) return;
    const id = window.setTimeout(() => {
      setFocusBook(null);
      setFocusTask(null);
    }, 6000);
    return () => window.clearTimeout(id);
  }, [focusBook, focusTask]);
  const [chatOpen, setChatOpen] = useState(false);
  const [preview, setPreview] = useState<{ id: string; excerpt: string } | null>(null);
  const [showAllReports, setShowAllReports] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const rtl = lang === 'he';
  // WebGL availability — client probe after mount (server render assumes yes;
  // without WebGL the room falls back honestly to the proven 2D office).
  const [glOk, setGlOk] = useState(true);
  useEffect(() => {
    let alive = true;
    const probe = () => {
      let ok = false;
      try {
        const c = document.createElement('canvas');
        ok = Boolean(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        ok = false;
      }
      if (alive) setGlOk(ok);
    };
    const id = window.setTimeout(probe, 0);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, []);

  // ---- foreman self-heal: if the socket is down, ping the supervisor endpoint ----
  const healForeman = useRef(0);
  const requestForemanHeal = useCallback(() => {
    const now = Date.now();
    if (now - healForeman.current < 10_000) return; // debounce
    healForeman.current = now;
    fetch('/api/foreman/health').catch(() => {}); // fire-and-forget by design
  }, []);

  const scrollToSection = useCallback((id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 90);
  }, []);

  // ---- bridge binding: clicks inside the 3D room drive the REAL panels -------------
  useEffect(() => {
    useHq.getState().bindUi({
      selectAgent: (id) => {
        setSelected(id);
        setView('ops');
        scrollToSection('sec-crew');
      },
      openTab: (x) => {
        setView('ops');
        scrollToSection(SECTION_FOR_TAB[x]);
      },
      openChat: () => setChatOpen(true),
      setLang: (l) => setLang(l),
    });
  }, [scrollToSection]);

  // ---- socket wiring (the one truth stream — unchanged contract) --------------------
  useEffect(() => {
    requestForemanHeal();
    const socket = io('/?XTransformPort=3010', {
      path: '/', // the gateway forwards on the root path — DO NOT use /socket.io
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 1200,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      useHq.getState().syncConnected(true);
      socket.emit('snapshot:request');
    });
    socket.on('disconnect', () => {
      setConnected(false);
      useHq.getState().syncConnected(false);
      requestForemanHeal(); // the crew service may have died — self-heal
    });
    // every real event proves the stream is alive — one shared freshness mark
    const markEvent = () => setLastSignalAt(Date.now());
    socket.on('snapshot', (s: Snapshot) => {
      markEvent();
      setSnap(s);
      setGotSnapshot(true);
      setAgents(Object.fromEntries(s.agents.map((a) => [a.id, a])));
      setLogs((prev) => ({ ...prev, ...s.logs }));
      useHq.getState().syncSnapshot(s); // the 3D room lives on the same reality
    });
    socket.on('agent', (a: AgentView) => {
      markEvent();
      setAgents((prev) => ({ ...prev, [a.id]: a }));
      useHq.getState().syncAgent(a);
    });
    socket.on('log', ({ agentId, entry }: { agentId: string; entry: LogEntry }) => {
      markEvent();
      setLogs((prev) => {
        const list = [...(prev[agentId] ?? []), entry];
        return { ...prev, [agentId]: list.slice(-160) };
      });
      useHq.getState().syncLog(agentId, entry);
    });
    socket.on('task', (task: Task) => {
      markEvent();
      setSnap((prev) => {
        const tasks = prev.tasks.filter((x) => x.id !== task.id);
        return { ...prev, tasks: [...tasks, task] };
      });
      useHq.getState().syncTask(task);
    });
    socket.on('decision', (d: Decision) => {
      markEvent();
      setSnap((prev) => {
        const decisions = prev.decisions.filter((x) => x.id !== d.id);
        return { ...prev, decisions: [...decisions, d] };
      });
      useHq.getState().syncDecision(d);
      // no auto-jump: decisions resolve autonomously — the alerts strip surfaces them
    });
    socket.on('report', (r: Report) => {
      markEvent();
      setSnap((prev) => (prev.reports.some((x) => x.id === r.id) ? prev : { ...prev, reports: [r, ...prev.reports] }));
      useHq.getState().syncReport(r);
    });
    socket.on('feed', (f: FeedItem) => {
      markEvent();
      setSnap((prev) => ({ ...prev, feed: [...prev.feed.slice(-160), f] }));
      useHq.getState().syncFeed(f);
    });
    socket.on('goal', (g: Goal) => {
      markEvent();
      setSnap((prev) => ({ ...prev, goal: g }));
      useHq.getState().syncGoal(g);
    });
    socket.on('books', (books: BookView[]) => {
      markEvent();
      setSnap((prev) => ({ ...prev, books }));
      useHq.getState().syncBooks(books);
    });
    socket.on('status', (status: Snapshot['status']) => {
      markEvent();
      setSnap((prev) => ({ ...prev, status }));
      useHq.getState().syncStatus(status);
    });
    socket.on('git', (g: GitPulse) => {
      markEvent();
      setSnap((prev) => ({ ...prev, git: g }));
      useHq.getState().syncGit(g);
    });
    socket.on('bubble', ({ agentId, text }: { agentId: string; text: string }) => {
      markEvent();
      setBubbles((prev) => ({ ...prev, [agentId]: { text, ts: Date.now() } }));
      useHq.getState().syncBubble(agentId, text); // real speech → the 3D avatars speak it
      setTimeout(() => setBubbles((prev) => {
        const next = { ...prev };
        const cur = next[agentId];
        if (cur && Date.now() - cur.ts >= 5800) delete next[agentId];
        return next;
      }), 6100);
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [requestForemanHeal]);

  // ---- derived reality ----------------------------------------------------------------
  const openDecisionCount = snap.decisions.filter((d) => d.status === 'open').length;
  const agentList = useMemo(() => Object.values(agents), [agents]);
  const selectedAgent = selected ? agents[selected] : undefined;
  const blockedTasks = snap.tasks.filter((x) => x.status === 'blocked').length;
  const openTasks = snap.tasks.filter((x) => x.status === 'todo' || x.status === 'doing' || x.status === 'review' || x.status === 'blocked').length;
  const workingCount = agentList.filter((a) => AGENT_SEMANTIC[a.state] === 'working').length;
  const errorCount = snap.feed.filter((f) => f.kind === 'error').length;
  const doneCount = snap.tasks.filter((x) => x.status === 'done').length;
  const tasksTotal = snap.tasks.length;

  const openBookPreview = useCallback((id: string) => {
    socketRef.current?.emit('book:preview', { id }, (r: { ok: boolean; excerpt?: string }) => {
      if (r.ok && r.excerpt) setPreview({ id, excerpt: r.excerpt });
    });
  }, []);

  const sim = snap.status.backend === 'sim';
  const goal = snap.goal;

  // the receptionist's PUBLIC numbers — aggregates only, never task texts or ids
  const publicStats: PublicStats = useMemo(
    () => ({
      live: connected && !sim,
      sim,
      crew: snap.crew.length,
      busy: workingCount,
      books: snap.books.length,
      reports: snap.reports.length,
      commits: snap.git?.available ? snap.git.commits.length : 0,
      opsDone: snap.status.opsDone,
      openTasks,
      openDecisions: openDecisionCount,
      goalPhase: goal?.status ?? 'none',
    }),
    [connected, sim, snap, workingCount, openTasks, openDecisionCount, goal],
  );

  // unknown-aware instrument values: "—" until the first snapshot lands
  const u = '—';
  const crewTotal = gotSnapshot ? snap.crew.length : null;
  // truth about freshness: the stream proves itself with heartbeats; when the
  // socket is open but no event has arrived for >75s (>2 missed heartbeats),
  // the data on screen is possibly frozen — say so instead of "live".
  const STALE_MS = 75_000;
  const stale = connected && gotSnapshot && lastSignalAt !== null && Date.now() - lastSignalAt > STALE_MS;
  const freshnessLabel = gotSnapshot && lastSignalAt !== null
    ? `${t('lastUpdate', lang)}: ${timeAgo(lastSignalAt, lang)}`
    : undefined;
  const systemSem: Semantic = !connected ? 'danger' : stale ? 'attention' : sim ? 'attention' : 'ok';
  const systemLabel = !connected
    ? gotSnapshot ? t('socketDown', lang) : t('stripConnecting', lang)
    : stale ? t('stripStale', lang)
    : sim ? t('stripSim', lang) : t('stripLive', lang);

  return (
    <div className="hq-root flex min-h-screen flex-col bg-[color:var(--bg)] text-[color:var(--ink)]" dir={rtl ? 'rtl' : 'ltr'}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-[color:var(--surface-2)] focus:px-3 focus:py-2 focus:text-[13px]">
        {rtl ? 'דלג לתוכן' : 'Skip to content'}
      </a>

      {/* ================= command bar ================= */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <Monogram />
            <div className="min-w-0">
              <h1 className="truncate text-[17px] font-bold leading-6">{t('title', lang)}</h1>
              <p className="truncate text-[12px] text-[color:var(--ink-3)]">{t('opsSubtitle', lang)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="sl-chip" title={snap.status.message[lang]}>
              <StatusDot s={systemSem} live={connected && !sim} />
              <span style={connected ? undefined : { color: 'var(--st-danger)' }} dir="auto">{systemLabel}</span>
            </span>
            {gotSnapshot && (
              <span className="sl-chip" title={snap.status.message[lang]} dir="auto">
                {sim ? t('demoCrew', lang) : t('liveCrew', lang)}
              </span>
            )}
          </div>

          <div className="ms-auto flex items-center gap-2.5 text-[12px] text-[color:var(--ink-2)]">
            <JerusalemClock lang={lang} />
            <ThemeToggle lang={lang} />
            <button onClick={() => setLang(rtl ? 'en' : 'he')} className="sl-btn sl-btn-ghost !min-h-[36px] !px-3 !py-1 !text-[12.5px]">
              {rtl ? 'EN' : 'עברית'}
            </button>
            <button
              onClick={() => setChatOpen(true)}
              className="sl-btn !min-h-[36px] !px-3 !py-1 !text-[12.5px]"
              title={lang === 'he' ? 'עמית — הקבלה החיה של המשרד' : 'Amit — the office live front desk'}
            >
              <span className="sl-dot" style={{ backgroundColor: 'var(--st-ok)' }} aria-hidden="true" />
              {lang === 'he' ? 'עמית · קבלה' : 'Amit · Reception'}
            </button>
          </div>
        </div>
      </header>

      {/* ================= main ================= */}
      <main id="main" className="mx-auto w-full max-w-[1560px] flex-1 px-4 py-4">
        {/* view switch */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="sl-seg" role="tablist" aria-label={t('secOffice', lang)}>
            {(
              [
                ['ops', t('viewOps', lang)],
                ['office', t('atlasOffice', lang)],
                ['network', t('atlasNetwork', lang)],
              ] as Array<[View, string]>
            ).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)} data-active={view === key}>
                {label}
              </button>
            ))}
          </div>
          {view !== 'ops' && (
            <span className="hidden text-[12px] text-[color:var(--ink-3)] md:inline" dir="auto">
              {view === 'office' ? t('officeViewHint', lang) : t('atlasViewHint', lang)}
            </span>
          )}
        </div>

        {view === 'ops' ? (
          <>
            {/* alerts — only when something needs eyes (calm page otherwise) */}
            {gotSnapshot && <div className="mb-4"><AlertsStrip blocked={blockedTasks} openDecisions={openDecisionCount} errors={errorCount} lang={lang} /></div>}

            {/* status strip — the real instruments */}
            <section className="sl-panel mb-4" aria-label={t('stripSystem', lang)}>
              <div className="flex flex-wrap items-stretch divide-x divide-[color:var(--line)] rtl:divide-x-reverse">
                <StripItem label={t('stripSystem', lang)} value={systemLabel} tone={systemSem} mono={false} sub={freshnessLabel} />
                <StripItem label={t('stripCrew', lang)} value={crewTotal === null ? u : `${workingCount}/${crewTotal} ${t('stripWorking', lang)}`} tone={workingCount > 0 ? 'working' : 'neutral'} mono={false} />
                <StripItem label={t('stripTasks', lang)} value={gotSnapshot ? String(openTasks) : u} tone={blockedTasks > 0 ? 'danger' : undefined} />
                <StripItem label={t('stripBooks', lang)} value={gotSnapshot ? String(snap.books.length) : u} />
                <StripItem label={t('stripReports', lang)} value={gotSnapshot ? String(snap.reports.length) : u} />
                <StripItem label={t('stripCommits', lang)} value={snap.git?.available ? String(snap.git.commits.length) : u} />
                <StripItem label={t('stripOps', lang)} value={gotSnapshot ? String(snap.status.opsDone) : u} />
                <StripItem label={t('stripLlm', lang)} value={snap.status.llmProvider && snap.status.llmProvider !== '…' ? snap.status.llmProvider : u} mono={false} />
              </div>
            </section>

            {/* main grid */}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_390px]">
              {/* left: work + evidence */}
              <div className="flex min-w-0 flex-col gap-4">
                <div id="sec-tasks" className="scroll-mt-20">
                  <TasksBoard lang={lang} tasks={snap.tasks} crew={snap.crew} focusTask={focusTask} />
                </div>
                <div id="sec-journal" className="scroll-mt-20">
                  <Panel title={t('secJournal', lang)} meta={`${snap.feed.length}`}>
                    <FeedJournal lang={lang} feed={snap.feed} />
                  </Panel>
                </div>
                <div id="sec-git" className="scroll-mt-20">
                  <Panel title={t('secGit', lang)}>
                    <GitEvidencePanel lang={lang} git={snap.git} />
                  </Panel>
                </div>
              </div>

              {/* right: goal, crew, decisions, reports, registry */}
              <aside className="flex min-w-0 flex-col gap-4">
                <GoalCard goal={goal} doneCount={doneCount} tasksTotal={tasksTotal} lang={lang} />

                <div id="sec-crew" className="scroll-mt-20">
                  <Panel title={t('secCrewRail', lang)} meta={crewTotal === null ? undefined : `${workingCount}/${crewTotal} ${t('stripWorking', lang)}`}>
                    <div>
                      {(crewTotal === null ? [] : snap.crew).map((c) => {
                        const a = agents[c.id];
                        const sem = a ? AGENT_SEMANTIC[a.state] : 'neutral';
                        const active = selected === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelected(c.id)}
                            className="sl-row w-full"
                            data-active={active}
                            style={active ? { background: 'var(--accent-dim)' } : undefined}
                            aria-pressed={active}
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-bold text-[#14060f]" style={{ backgroundColor: c.color }} aria-hidden="true">
                              {c.name[lang].slice(0, 2)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-[color:var(--ink)]" style={active ? { color: 'var(--accent)' } : undefined}>{c.name[lang]}</span>
                              <span className="block truncate text-[11.5px] text-[color:var(--ink-3)]" dir="auto">{a?.activity || c.title[lang]}</span>
                            </span>
                            <span className="sl-chip shrink-0 !py-0 !text-[11px]" style={{ color: semanticVar(sem) }} dir="auto">
                              <StatusDot s={sem} live={sem === 'working'} />
                              {a ? stateName(a.state, lang) : ''}
                            </span>
                          </button>
                        );
                      })}
                      {crewTotal === null && <div className="sl-empty !py-8" dir="auto">{t('waitingFirstSnapshot', lang)}</div>}
                    </div>
                  </Panel>
                </div>

                <Panel title={t('monitor', lang)} meta={selectedAgent ? (snap.crew.find((c) => c.id === selected)?.name[lang] ?? undefined) : undefined}>
                  <div className="h-[320px]">
                    <AgentInspector lang={lang} crew={snap.crew} agent={selectedAgent} logs={logs[selected ?? ''] ?? []} tasks={snap.tasks} />
                  </div>
                </Panel>

                <div id="sec-decisions" className="scroll-mt-20">
                  <Panel title={t('secDecisions', lang)} meta={openDecisionCount > 0 ? `${openDecisionCount}` : undefined}>
                    <DecisionsPanel
                      lang={lang}
                      decisions={snap.decisions}
                      onOpenTask={(taskId) => {
                        setFocusTask(taskId);
                        scrollToSection('sec-tasks');
                      }}
                    />
                  </Panel>
                </div>

                <div id="sec-reports" className="scroll-mt-20">
                  <Panel
                    title={t('secReports', lang)}
                    meta={`${snap.reports.length}`}
                    actions={snap.reports.length > 4 ? (
                      <button className="sl-btn sl-btn-ghost !min-h-[28px] !px-2 !py-0.5 !text-[11.5px]" onClick={() => setShowAllReports((v) => !v)}>
                        {showAllReports ? (rtl ? 'צמצם' : 'Collapse') : t('openLibrary', lang)}
                      </button>
                    ) : undefined}
                  >
                    <ReportsPanel lang={lang} reports={snap.reports} limit={showAllReports ? undefined : 4} />
                  </Panel>
                </div>

                <div id="sec-fleet" className="scroll-mt-20">
                  <Panel title={t('fleet', lang)} meta={`${snap.books.length}`}>
                    <FleetBooksPanel lang={lang} books={snap.books} crew={snap.crew} onPreview={openBookPreview} focusBook={focusBook} />
                  </Panel>
                </div>
              </aside>
            </div>

            {/* sovereign stack health — chains re-verified from disk */}
            <StackHealth lang={lang} />

            {/* the autonomy line — once, quietly (was repeated 3×) */}
            <p className="mt-4 text-center text-[12px] leading-5 text-[color:var(--ink-3)]" dir="auto">{t('autonomyLine', lang)}</p>
          </>
        ) : (
          /* ============ dedicated spatial views (office / network) ============ */
          <section className="sl-panel overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[color:var(--line)] bg-[color:var(--surface-2)] px-3 py-2 text-[12px] text-[color:var(--ink-2)]" dir="auto">
              <StatusDot s={connected ? 'ok' : 'danger'} live={connected} />
              {view === 'office' ? t('officeViewHint', lang) : t('atlasViewHint', lang)}
              {sim && <span className="sl-chip ms-auto" style={{ color: 'var(--st-attention)' }}>{t('demoCrew', lang)}</span>}
            </div>
            {view === 'office' ? (
              glOk ? (
                <div className="relative h-[480px] w-full md:h-[640px]">
                  <Room3D />
                  {sim && (
                    <div className="absolute start-3 top-3 z-20 rounded-lg border border-[color:var(--line-strong)] bg-[color:var(--surface)] px-3 py-1.5 text-xs font-semibold" style={{ color: 'var(--st-attention)' }} dir="auto">
                      {t('demoCrew', lang)} — {t('demoNote', lang)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="aspect-[1180/640] w-full min-w-[760px]">
                    <Office
                      lang={lang}
                      crew={snap.crew}
                      agents={agents}
                      logs={logs}
                      tasks={snap.tasks}
                      books={snap.books}
                      git={snap.git}
                      openDecisions={openDecisionCount}
                      reportsCount={snap.reports.length}
                      newestReport={snap.reports[0]?.title}
                      bubbles={bubbles}
                      selected={selected}
                      sim={sim}
                      receptionOpen={chatOpen}
                      onSelectAgent={(id) => { setSelected(id); }}
                      onOpenReception={() => setChatOpen(true)}
                      onOpenTab={(x) => {
                        setView('ops');
                        scrollToSection(SECTION_FOR_TAB[x as Tab]);
                      }}
                    />
                  </div>
                </div>
              )
            ) : (
              <div className="aspect-[1180/640] w-full min-w-[760px]">
                <NetworkAtlas
                  lang={lang}
                  books={snap.books}
                  ready={gotSnapshot}
                  opsDone={snap.status.opsDone}
                  commits={snap.git?.available ? snap.git.commits.length : 0}
                  reports={snap.reports.length}
                  busy={workingCount}
                  onOpenBook={(bookId) => {
                    setFocusBook(bookId);
                    setView('ops');
                    scrollToSection('sec-fleet');
                  }}
                  onOpenFleet={() => {
                    setView('ops');
                    scrollToSection('sec-fleet');
                  }}
                />
              </div>
            )}
          </section>
        )}
      </main>

      {/* ================= footer ================= */}
      <footer className="mt-auto border-t border-[color:var(--line)] bg-[color:var(--bg)] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[12px] text-[color:var(--ink-3)]" dir="auto">
          <span className="font-semibold text-[color:var(--ink-2)]">{t('footerTruth', lang)}</span>
          <span className="ms-auto flex gap-3">
            <span dir="ltr" className="font-mono tabular-nums">
              {gotSnapshot ? `${snap.books.length} ${t('books', lang)} · ${snap.agents.length} ${t('agents', lang)}` : u}
            </span>
            <span className="font-mono" dir="ltr">{snap.status.llmProvider && snap.status.llmProvider !== '…' ? snap.status.llmProvider : ''}</span>
          </span>
        </div>
      </footer>

      {/* book preview — real dialog: focus trap + Escape (a11y law) */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-h-[80vh] max-w-2xl border-[color:var(--line-strong)] bg-[color:var(--surface)] p-0">
          <DialogHeader className="border-b border-[color:var(--line)] px-4 py-3">
            <DialogTitle className="text-[15px]" dir="auto">{t('preview', lang)}: {preview?.id}</DialogTitle>
          </DialogHeader>
          <pre className="sl-scroll max-h-[65vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-6 text-[color:var(--ink-2)]" dir="ltr">
            {preview?.excerpt}
          </pre>
        </DialogContent>
      </Dialog>

      {/* the office receptionist — the chat IS a worker in the room */}
      <ReceptionChat lang={lang} open={chatOpen} onClose={() => setChatOpen(false)} stats={publicStats} />
    </div>
  );
}
