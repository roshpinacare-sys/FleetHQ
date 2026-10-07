'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
import { Office } from './Office';
import { FleetPanel, LibraryPanel, MonitorPanel, PodiumPanel, WallPanel } from './panels';
import type { AgentView, BookView, CrewMember, Decision, FeedItem, Goal, LogEntry, Report, Snapshot, Task } from './types';
import { SUGGESTIONS, t, goalStatusName, type Lang } from './i18n';

type Tab = 'monitor' | 'wall' | 'podium' | 'library' | 'fleet';

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

export default function AgentHQ() {
  const [lang, setLang] = useState<Lang>('he');
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [agents, setAgents] = useState<Record<string, AgentView>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [bubbles, setBubbles] = useState<Record<string, { text: string; ts: number }>>({});
  const [tab, setTab] = useState<Tab>('monitor');
  const [selected, setSelected] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [goalText, setGoalText] = useState('');
  const [clock, setClock] = useState('');
  const [preview, setPreview] = useState<{ id: string; excerpt: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const rtl = lang === 'he';

  // ---- socket wiring ---------------------------------------------------------------
  useEffect(() => {
    const socket = io('/?XTransformPort=3010', {
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
      socket.emit('snapshot:request');
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('snapshot', (s: Snapshot) => {
      setSnap(s);
      setAgents(Object.fromEntries(s.agents.map((a) => [a.id, a])));
      setLogs((prev) => ({ ...prev, ...s.logs }));
    });
    socket.on('agent', (a: AgentView) => setAgents((prev) => ({ ...prev, [a.id]: a })));
    socket.on('log', ({ agentId, entry }: { agentId: string; entry: LogEntry }) =>
      setLogs((prev) => {
        const list = [...(prev[agentId] ?? []), entry];
        return { ...prev, [agentId]: list.slice(-160) };
      }),
    );
    socket.on('task', (task: Task) =>
      setSnap((prev) => {
        const tasks = prev.tasks.filter((x) => x.id !== task.id);
        return { ...prev, tasks: [...tasks, task] };
      }),
    );
    socket.on('decision', (d: Decision) => {
      setSnap((prev) => {
        const decisions = prev.decisions.filter((x) => x.id !== d.id);
        return { ...prev, decisions: [...decisions, d] };
      });
      if (d.status === 'open') setTab('podium'); // a decision needs the commander now
    });
    socket.on('report', (r: Report) =>
      setSnap((prev) => (prev.reports.some((x) => x.id === r.id) ? prev : { ...prev, reports: [r, ...prev.reports] })),
    );
    socket.on('feed', (f: FeedItem) => setSnap((prev) => ({ ...prev, feed: [...prev.feed.slice(-160), f] })));
    socket.on('goal', (g: Goal) => setSnap((prev) => ({ ...prev, goal: g })));
    socket.on('books', (books: BookView[]) => setSnap((prev) => ({ ...prev, books })));
    socket.on('status', (status: Snapshot['status']) => setSnap((prev) => ({ ...prev, status })));
    socket.on('bubble', ({ agentId, text }: { agentId: string; text: string }) => {
      setBubbles((prev) => ({ ...prev, [agentId]: { text, ts: Date.now() } }));
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
  }, []);

  // ---- clock (Jerusalem) ---------------------------------------------------------------
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('he-IL', { hour12: false, timeZone: 'Asia/Jerusalem' }));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const openDecisionCount = snap.decisions.filter((d) => d.status === 'open').length;

  const agentList = useMemo(() => Object.values(agents), [agents]);
  const selectedAgent = selected ? agents[selected] : undefined;

  const submitGoal = useCallback(() => {
    const text = goalText.trim();
    if (!text) return;
    socketRef.current?.emit('goal:submit', { text });
    setGoalText('');
  }, [goalText]);

  const answerDecision = useCallback((id: string, option?: string, text?: string) => {
    socketRef.current?.emit('decision:answer', { id, option, text });
  }, []);

  const openBookPreview = useCallback((id: string) => {
    socketRef.current?.emit('book:preview', { id }, (r: { ok: boolean; excerpt?: string }) => {
      if (r.ok && r.excerpt) setPreview({ id, excerpt: r.excerpt });
    });
  }, []);

  const openTab = useCallback((next: Tab) => setTab(next), []);
  const selectAgent = useCallback((id: string) => {
    setSelected(id);
    setTab('monitor');
  }, []);

  const sim = snap.status.backend === 'sim';
  const goal = snap.goal;
  const goalBadge =
    !goal || goal.status === 'done' || goal.status === 'failed'
      ? null
      : { color: goal.status === 'planning' ? '#E0973F' : goal.status === 'active' ? '#3BA08F' : '#C9A227', label: goalStatusName(goal.status, lang) };

  return (
    <div className="flex min-h-screen flex-col bg-[#131316] text-zinc-100" dir={rtl ? 'rtl' : 'ltr'}>
      {/* ================= header ================= */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-[#131316]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 font-black text-zinc-950">צ</div>
            <div>
              <h1 className="text-lg font-bold leading-5">{t('title', lang)}</h1>
              <p className="text-xs text-zinc-500">{t('subtitle', lang)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${connected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 hq-pulse' : 'bg-red-400'}`} />
              {connected ? t('live', lang) : t('connecting', lang)}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${sim ? 'bg-amber-500/15 text-amber-400' : 'bg-teal-500/15 text-teal-300'}`} title={snap.status.message[lang]}>
              {sim ? t('demoCrew', lang) : t('liveCrew', lang)}
            </span>
            {goalBadge && (
              <span className="flex items-center gap-2 rounded-full bg-zinc-800/80 px-2.5 py-1">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 -rotate-90">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="#3f3f46" strokeWidth="3" />
                  <circle cx="10" cy="10" r="7" fill="none" stroke={goalBadge.color} strokeWidth="3" strokeDasharray={`${goal.progress * 44} 44`} strokeLinecap="round" />
                </svg>
                <span dir="auto" className="max-w-52 truncate">{goal?.text}</span>
                <span style={{ color: goalBadge.color }}>{Math.round((goal?.progress ?? 0) * 100)}%</span>
              </span>
            )}
            <span className="rounded-full bg-zinc-800/80 px-2.5 py-1 text-zinc-300">
              {t('opsDone', lang)}: <b className="text-amber-400">{snap.status.opsDone}</b>
            </span>
          </div>

          <div className="ms-auto flex items-center gap-3 text-xs text-zinc-400">
            <span className="hidden font-mono sm:inline" dir="ltr">{clock} {t('jerusalem', lang)}</span>
            <button
              onClick={() => setLang(rtl ? 'en' : 'he')}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 font-semibold transition hover:border-amber-600 hover:text-amber-400"
            >
              {rtl ? 'EN' : 'עברית'}
            </button>
          </div>
        </div>
      </header>

      {/* ================= main ================= */}
      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* office + console */}
          <section className="flex min-w-0 flex-col gap-3">
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#151518] shadow-2xl">
              <div className="aspect-[4/3] w-full sm:aspect-[1180/640]">
                <Office
                  lang={lang}
                  crew={snap.crew}
                  agents={agents}
                  logs={logs}
                  tasks={snap.tasks}
                  books={snap.books}
                  openDecisions={openDecisionCount}
                  reportsCount={snap.reports.length}
                  newestReport={snap.reports[0]?.title}
                  bubbles={bubbles}
                  selected={selected}
                  sim={sim}
                  onSelectAgent={selectAgent}
                  onOpenTab={(x) => openTab(x)}
                />
              </div>
              {sim && (
                <div className="absolute start-3 top-3 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-zinc-950">
                  {t('demoCrew', lang)} — {t('demoNote', lang)}
                </div>
              )}
            </div>

            {/* goal console */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex gap-2">
                <input
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitGoal()}
                  placeholder={t('consolePlaceholder', lang)}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm outline-none transition focus:border-amber-600"
                  dir="auto"
                  aria-label={t('submitGoal', lang)}
                />
                <button onClick={submitGoal} className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-400">
                  {t('submitGoal', lang)}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">{t('suggestions', lang)}:</span>
                {SUGGESTIONS[lang].map((s) => (
                  <button
                    key={s}
                    onClick={() => setGoalText(s)}
                    className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-amber-600 hover:text-amber-400"
                    dir="auto"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* feed */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500">{t('feed', lang)}</h2>
              <div className="hq-scroll grid max-h-36 gap-1 overflow-y-auto sm:grid-cols-2" dir="auto">
                {snap.feed.length === 0 && <p className="text-xs text-zinc-600">{t('emptyFeed', lang)}</p>}
                {[...snap.feed].reverse().map((f) => (
                  <div key={f.id} className="flex items-start gap-2 rounded-lg px-2 py-1 text-xs leading-4 hover:bg-zinc-900">
                    <span className="shrink-0 font-mono text-[10px] text-zinc-600" dir="ltr">
                      {new Date(f.ts).toLocaleTimeString('he-IL', { hour12: false })}
                    </span>
                    <FeedBadge kind={f.kind} />
                    <span className={`min-w-0 ${f.kind === 'error' ? 'text-red-400' : f.kind === 'user' ? 'text-amber-300' : 'text-zinc-300'}`}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* side panels */}
          <aside className="flex min-w-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800 p-2" aria-label="panels">
              {(
                [
                  ['monitor', t('monitor', lang), openDecisionCount],
                  ['wall', t('wall', lang), snap.tasks.filter((x) => x.status === 'todo' || x.status === 'doing').length],
                  ['podium', t('podium', lang), openDecisionCount],
                  ['library', t('library', lang), snap.reports.length],
                  ['fleet', t('fleet', lang), 0],
                ] as Array<[Tab, string, number]>
              ).map(([key, label, badge]) => (
                <button
                  key={key}
                  onClick={() => openTab(key)}
                  className={`relative shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    tab === key ? 'bg-amber-500/15 text-amber-400' : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200'
                  }`}
                >
                  {label}
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-zinc-950">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 p-3">
              {tab === 'monitor' && <MonitorPanel lang={lang} crew={snap.crew} agent={selectedAgent} logs={logs[selected ?? ''] ?? []} tasks={snap.tasks} />}
              {tab === 'wall' && <WallPanel lang={lang} tasks={snap.tasks} crew={snap.crew} />}
              {tab === 'podium' && <PodiumPanel lang={lang} decisions={snap.decisions} onAnswer={answerDecision} />}
              {tab === 'library' && <LibraryPanel lang={lang} reports={snap.reports} />}
              {tab === 'fleet' && <FleetPanel lang={lang} books={snap.books} crew={snap.crew} onPreview={openBookPreview} />}
            </div>
          </aside>
        </div>

        {/* crew roster chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {snap.crew.map((c) => {
            const a = agents[c.id];
            const active = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => selectAgent(c.id)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  active ? 'border-amber-600 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a ? rosterDot(a.state) : '#52525b' }} />
                <span className="font-semibold" style={{ color: c.color }}>{c.name[lang]}</span>
                <span className="text-xs text-zinc-500">{a?.activity || c.title[lang]}</span>
              </button>
            );
          })}
        </div>
      </main>

      {/* ================= footer ================= */}
      <footer className="mt-auto border-t border-zinc-800/80 bg-[#101012]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-zinc-500" dir="auto">
          <span className="font-semibold text-zinc-400">{t('footerTruth', lang)}</span>
          <span className="ms-auto flex gap-3">
            <span>
              {snap.books.length} {t('books', lang)} · {snap.agents.length} {t('agents', lang)}
            </span>
            <span className="font-mono" dir="ltr">{snap.status.llmProvider}</span>
          </span>
        </div>
      </footer>

      {/* book preview dialog */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <h3 className="font-bold">{t('preview', lang)}: {preview.id}</h3>
              <button onClick={() => setPreview(null)} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:border-amber-600">
                {t('close', lang)}
              </button>
            </div>
            <pre className="hq-scroll max-h-[65vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-5 text-zinc-300" dir="ltr">
              {preview.excerpt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function rosterDot(state: AgentView['state']): string {
  switch (state) {
    case 'thinking': return '#E0973F';
    case 'reading': return '#3BA08F';
    case 'checking': return '#C9A227';
    case 'writing': return '#7BA05B';
    case 'waiting_user': case 'blocked': case 'error': return '#e5484d';
    case 'done': return '#46a758';
    default: return '#71717a';
  }
}

function FeedBadge({ kind }: { kind: FeedItem['kind'] }) {
  const map: Record<FeedItem['kind'], { c: string; s: string }> = {
    goal: { c: 'bg-amber-500/20 text-amber-400', s: '◎' },
    plan: { c: 'bg-amber-500/20 text-amber-400', s: '▦' },
    task: { c: 'bg-zinc-700/50 text-zinc-300', s: '▤' },
    message: { c: 'bg-rose-500/15 text-rose-300', s: '❝' },
    decision: { c: 'bg-amber-500/20 text-amber-300', s: '!' },
    report: { c: 'bg-emerald-500/15 text-emerald-400', s: '▤' },
    system: { c: 'bg-zinc-800 text-zinc-400', s: '·' },
    error: { c: 'bg-red-500/20 text-red-400', s: '!' },
    user: { c: 'bg-amber-500/25 text-amber-300', s: '★' },
  };
  const { c, s } = map[kind] ?? map.system;
  return <span className={`shrink-0 rounded px-1.5 text-[10px] font-bold ${c}`}>{s}</span>;
}
