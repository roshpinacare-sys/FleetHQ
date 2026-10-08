'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
import { Office } from './Office';
import { NetworkAtlas } from './Network';
import { FleetPanel, LibraryPanel, MonitorPanel, PodiumPanel, WallPanel } from './panels';
import { GitWirePanel } from './GitWire';
import StackHealth from './StackHealth';
import { ReceptionChat, type PublicStats } from './ReceptionChat';
import type { AgentView, BookView, CrewMember, Decision, FeedItem, GitPulse, Goal, LogEntry, Report, Snapshot, Task } from './types';
import { STATE_COLORS } from './types';
import { t, goalStatusName, type Lang } from './i18n';

type Tab = 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git';
type View = 'office' | 'network';

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

/** Count-up readout — rAF ease-out cubic (the numbers feel alive, not stamped). */
function CounterUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (to - from) * eased);
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <b className={`font-mono tabular-nums ${className ?? ''}`}>{shown}</b>;
}

/** Odometer readout — per-digit column strips, 1s power3 glide.
 *  Deterministic SSR: value 0 renders as "0" on both server and first client render. */
function Odometer({ value, className }: { value: number; className?: string }) {
  const digits = String(Math.max(0, Math.floor(value))).split('');
  return (
    <b className={`hq-odo font-mono tabular-nums ${className ?? ''}`} dir="ltr" aria-label={String(value)}>
      {digits.map((d, i) => (
        <span key={`${digits.length - i}`} className="hq-odo-col" aria-hidden="true">
          <span className="hq-odo-strip" style={{ transform: `translateY(-${Number(d) * 100}%)` }}>
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </b>
  );
}

/** Warm dust atmosphere — deterministic init (no Math.random), gold/ember motes,
 *  paused offscreen (IntersectionObserver) and skipped under prefers-reduced-motion. */
function DustField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let visible = true;
    const N = 90;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: ((i * 73 + 11) % 100) / 100,
      y: ((i * 41 + 29) % 100) / 100,
      vx: (((i * 11) % 7) - 3) * 0.00028,
      vy: (((i * 17) % 5) - 2) * 0.00028,
      r: i % 4 === 0 ? 1.4 : 0.9,
      tw: (i * 37) % 628,
    }));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.max(1, canvas.offsetWidth * dpr);
      canvas.height = Math.max(1, canvas.offsetHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
        const twinkle = 0.35 + 0.3 * Math.sin(t * 0.0012 + p.tw);
        ctx.globalAlpha = twinkle;
        ctx.fillStyle = i % 5 === 0 ? '#f0abfc' : '#d946ef';
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="hq-particles" aria-hidden="true" />;
}

/** JourneyBar pitch per act: queued 90°, doing 58°, review 115°, done 90°. */
function journeyAngle(status: Goal['status']): number {
  switch (status) {
    case 'planning': return 90;
    case 'active': return 58;
    case 'review': return 115;
    default: return 90;
  }
}
function journeyAct(status: Goal['status']): string {
  switch (status) {
    case 'planning': return 'I';
    case 'active': return 'II';
    case 'review': return 'III';
    default: return 'IV';
  }
}

/** Section header — the page's visible ORDER: numbered, gold-indexed, hairline rule. */
function SectionHead({ index, title, children }: { index: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <span className="hq-secnum text-sm font-bold" dir="ltr">{index}</span>
      <h2 className="text-lg font-black tracking-wide text-zinc-100">{title}</h2>
      <span className="hq-secline" aria-hidden="true" />
      {children}
    </div>
  );
}

/** The gold monogram — the fleet crest: double ring + צ, breathing glow. */
function Crest({ glitch }: { glitch: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={`hq-breath h-14 w-14 shrink-0 ${glitch ? 'hq-glitch' : ''}`} role="img" aria-label={t('title', 'he')}>
      <defs>
        <linearGradient id="crestAccent" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdf4ff" />
          <stop offset="0.5" stopColor="#d946ef" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="rgba(9,9,11,0.9)" stroke="url(#crestAccent)" strokeWidth="2.4" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="url(#crestAccent)" strokeWidth="1" opacity="0.55" />
      <path d="M50 0.8 L53.4 4.3 L50 7.8 L46.6 4.3 Z" fill="url(#crestAccent)" />
      <path d="M50 92.2 L53.4 95.7 L50 99.2 L46.6 95.7 Z" fill="url(#crestAccent)" />
      <text x="50" y="53" textAnchor="middle" dominantBaseline="central" fontSize="38" fontWeight="800" fill="url(#crestAccent)">
        צ
      </text>
    </svg>
  );
}

export default function AgentHQ() {
  const [lang, setLang] = useState<Lang>('he');
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [agents, setAgents] = useState<Record<string, AgentView>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [bubbles, setBubbles] = useState<Record<string, { text: string; ts: number }>>({});
  const [tab, setTab] = useState<Tab>('monitor');
  const [view, setView] = useState<View>('office');
  // Default to the chief of staff so the monitor panel is NEVER a dead
  // "pick an agent" empty state — the room always has something to show.
  const [selected, setSelected] = useState<string | null>('aluf');
  const [connected, setConnected] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [clock, setClock] = useState('');
  const [preview, setPreview] = useState<{ id: string; excerpt: string } | null>(null);
  const [glitch, setGlitch] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const lastHashRef = useRef<string | null>(null);
  const rtl = lang === 'he';

  // ---- foreman self-heal: if the socket is down, ping the supervisor endpoint ----
  const healForeman = useRef(0);
  const requestForemanHeal = useCallback(() => {
    const now = Date.now();
    if (now - healForeman.current < 10_000) return; // debounce
    healForeman.current = now;
    fetch('/api/foreman/health').catch(() => {}); // fire-and-forget by design
  }, []);

  // ---- socket wiring ---------------------------------------------------------------
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
      socket.emit('snapshot:request');
    });
    socket.on('disconnect', () => {
      setConnected(false);
      requestForemanHeal(); // the crew service may have died — self-heal
    });
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
      // no auto-tab-jump: decisions resolve autonomously — the podium badge +
      // stage glow surface the deliberation without yanking the visitor around.
    });
    socket.on('report', (r: Report) =>
      setSnap((prev) => (prev.reports.some((x) => x.id === r.id) ? prev : { ...prev, reports: [r, ...prev.reports] })),
    );
    socket.on('feed', (f: FeedItem) => setSnap((prev) => ({ ...prev, feed: [...prev.feed.slice(-160), f] })));
    socket.on('goal', (g: Goal) => setSnap((prev) => ({ ...prev, goal: g })));
    socket.on('books', (books: BookView[]) => setSnap((prev) => ({ ...prev, books })));
    socket.on('status', (status: Snapshot['status']) => setSnap((prev) => ({ ...prev, status })));
    socket.on('git', (g: GitPulse) => {
      setSnap((prev) => ({ ...prev, git: g }));
      // warm flicker on a genuinely fresh commit (the wordmark tears for half a second)
      const h = g.commits[0]?.hash ?? null;
      const prevHash = lastHashRef.current;
      lastHashRef.current = h;
      if (h && prevHash && h !== prevHash) {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 950);
      }
    });
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
  }, [requestForemanHeal]);

  // ---- clock (Jerusalem) — client-only, never rendered on the server -------------------
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
  const activeTasks = snap.tasks.filter((x) => x.status === 'doing' || x.status === 'todo').length;

  const openTab = useCallback((next: Tab) => setTab(next), []);
  const selectAgent = useCallback((id: string) => {
    setSelected(id);
    setTab('monitor');
  }, []);

  const openBookPreview = useCallback((id: string) => {
    socketRef.current?.emit('book:preview', { id }, (r: { ok: boolean; excerpt?: string }) => {
      if (r.ok && r.excerpt) setPreview({ id, excerpt: r.excerpt });
    });
  }, []);

  const sim = snap.status.backend === 'sim';
  const goal = snap.goal;

  // the receptionist's PUBLIC numbers — exactly what any visitor already sees on
  // this page; aggregates only, never task texts, book names or internal ids.
  const publicStats: PublicStats = useMemo(
    () => ({
      live: connected && !sim,
      sim,
      crew: snap.crew.length,
      busy: agentList.filter((a) => a.state !== 'idle').length,
      books: snap.books.length,
      reports: snap.reports.length,
      commits: snap.git?.available ? snap.git.commits.length : 0,
      opsDone: snap.status.opsDone,
      openTasks: activeTasks,
      openDecisions: openDecisionCount,
      goalPhase: goal?.status ?? 'none',
    }),
    [connected, sim, snap, agentList, activeTasks, openDecisionCount, goal],
  );

  const goalPhase =
    !goal || goal.status === 'done' || goal.status === 'failed'
      ? null
      : { color: goal.status === 'planning' ? '#8b5cf6' : goal.status === 'active' ? '#d946ef' : '#fbbf24', label: goalStatusName(goal.status, lang) };
  // JourneyBar rail: share of tasks really done (never the goal's self-report)
  const doneCount = snap.tasks.filter((x) => x.status === 'done').length;
  const tasksTotal = snap.tasks.length;
  const doneRatio = tasksTotal > 0 ? doneCount / tasksTotal : 0;
  // optional foreman economy/memory (wire may not carry them — render only when present)
  const economyTotal = snap.status.economy
    ? Object.values(snap.status.economy).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
    : null;

  return (
    <div className="hq-root flex min-h-screen flex-col bg-zinc-950 text-zinc-100" dir={rtl ? 'rtl' : 'ltr'}>
      {/* atmosphere: violet dust + drifting washes + grain (behind everything) */}
      <div className="hq-atmosphere" aria-hidden="true">
        <DustField />
        <div className="hq-blob hq-blob-a" />
        <div className="hq-blob hq-blob-b" />
        <div className="hq-blob hq-blob-c" />
        <div className="hq-grain" />
      </div>

      {/* ================= header ================= */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <Crest glitch={glitch} />
            <div>
              <h1 className={`hq-aurora ${glitch ? 'hq-glitch' : ''} text-2xl font-black leading-7 tracking-wide`}>
                {t('title', lang)}
              </h1>
              <p className="text-sm text-zinc-400">{t('subtitle', lang)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={`hq-chip ${connected ? '' : 'hq-chip-life'}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-fuchsia-400 hq-pulse' : 'bg-rose-400'}`} aria-hidden="true" />
              <span className={connected ? 'text-zinc-100' : 'text-rose-300'}>{connected ? t('live', lang) : t('connecting', lang)}</span>
            </span>
            <span className="hq-chip" title={snap.status.message[lang]}>
              <span className={sim ? 'text-amber-300' : 'text-zinc-100'}>{sim ? t('demoCrew', lang) : t('liveCrew', lang)}</span>
            </span>
            {goalPhase && (
              <span className="hq-chip">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 -rotate-90" aria-hidden="true">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="#3f3f46" strokeWidth="3" />
                  <circle cx="10" cy="10" r="7" fill="none" stroke={goalPhase.color} strokeWidth="3" strokeDasharray={`${(goal?.progress ?? 0) * 44} 44`} strokeLinecap="round" />
                </svg>
                <span dir="auto" className="max-w-52 truncate text-zinc-200">{goal?.text}</span>
                <span className="font-mono tabular-nums" style={{ color: goalPhase.color }}>{Math.round((goal?.progress ?? 0) * 100)}%</span>
              </span>
            )}
            <span className="hq-chip">
              <span className="text-zinc-500">{t('opsDone', lang)}:</span>
              <Odometer value={snap.status.opsDone} className="text-zinc-100" />
            </span>
          </div>

          <div className="ms-auto flex items-center gap-3 text-[13px] text-zinc-400">
            <span className="hidden font-mono tabular-nums tracking-wider text-zinc-100 sm:inline" dir="ltr">{clock} {t('jerusalem', lang)}</span>
            <button
              onClick={() => setLang(rtl ? 'en' : 'he')}
              className="hq-btn-ghost px-4 py-2 text-sm"
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
          <section className="flex min-w-0 flex-col gap-4">
            <SectionHead index="01" title={t('secOffice', lang)}>
              <span className="hidden shrink-0 font-mono text-[11.5px] tabular-nums text-zinc-500 sm:block" dir="ltr">
                {agentList.filter((a) => a.state !== 'idle').length}/{agentList.length || snap.crew.length} {t('atWork', lang)}
              </span>
            </SectionHead>
            <div className="hq-glass hq-rise overflow-hidden">
              {/* the view switch: the room ⇄ the network atlas */}
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-black/30 px-3 py-2">
                {(
                  [
                    ['office', t('atlasOffice', lang), '◉'],
                    ['network', t('atlasNetwork', lang), '✦'],
                  ] as Array<[View, string, string]>
                ).map(([key, label, glyph]) => (
                  <button
                    key={key}
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={`hq-tab text-[14px] ${view === key ? '' : 'text-zinc-400'}`}
                    data-active={view === key}
                  >
                    <span aria-hidden="true" className="me-1.5 opacity-70">{glyph}</span>
                    {label}
                  </button>
                ))}
                <span className="ms-auto hidden text-[11.5px] leading-snug text-zinc-500 md:block">
                  {view === 'network' ? t('atlasViewHint', lang) : ''}
                </span>
              </div>
              <div className="aspect-[1180/640] w-full">
                {view === 'office' ? (
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
                    onSelectAgent={selectAgent}
                    onOpenReception={() => setChatOpen(true)}
                    onOpenTab={(x) => openTab(x)}
                  />
                ) : (
                  <NetworkAtlas
                    lang={lang}
                    books={snap.books}
                    opsDone={snap.status.opsDone}
                    commits={snap.git?.available ? snap.git.commits.length : 0}
                    reports={snap.reports.length}
                    busy={Object.values(agents).filter((a) => a.state !== 'idle').length}
                    onOpenTab={() => openTab('fleet')}
                  />
                )}
              </div>
              {/* HUD corner brackets around the viewport — zinc frame, never gold */}
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div className="absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-zinc-600/60" />
                <div className="absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-zinc-600/60" />
                <div className="absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-zinc-600/60" />
                <div className="absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-zinc-600/60" />
              </div>
              {sim && (
                <div className="absolute start-3 top-3 rounded-full bg-amber-400/95 px-3.5 py-1.5 text-xs font-bold text-zinc-950">
                  {t('demoCrew', lang)} — {t('demoNote', lang)}
                </div>
              )}
            </div>

            {/* flight HUD strip — the mission-control anchor (accent rail + instruments) */}
            <div className="hq-glass hq-rise-2 p-0" dir="ltr">
              <div className="h-[6px] w-full overflow-hidden rounded-t-[24px] bg-zinc-900">
                <div
                  className="h-full bg-gradient-to-r from-[#7c3aed] via-[#d946ef] to-[#f0abfc] transition-[width] duration-700"
                  style={{ width: `${Math.round((goal?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-stretch divide-x divide-white/10 rtl:divide-x-reverse">
                <div className="flex min-w-[150px] flex-1 items-center gap-2 px-4 py-3">
                  <span className="hq-chip font-mono text-[11px] tracking-[0.22em] text-fuchsia-300">
                    ◉ {goal ? goalPhase?.label.split('…')[0].toUpperCase() : (lang === 'he' ? 'מוכן' : 'READY')}
                  </span>
                  <span dir="auto" className="truncate text-[13px] text-zinc-300">{goal?.text ?? t('noGoal', lang)}</span>
                </div>
                {(
                  [
                    [t('wall', lang), activeTasks],
                    [t('reports', lang), snap.reports.length],
                    [t('podium', lang), openDecisionCount],
                  ] as Array<[string, number]>
                ).map(([label, value]) => (
                  <div key={label} className="min-w-[104px] flex-1 px-4 py-2.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                    <div className="font-mono text-xl tabular-nums leading-6 text-zinc-100">
                      <CounterUp value={value} />
                    </div>
                  </div>
                ))}
                <div className="min-w-[104px] flex-1 px-4 py-2.5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">{t('opsDone', lang)}</div>
                  <div className="font-mono text-xl leading-6 text-zinc-100">
                    <Odometer value={snap.status.opsDone} />
                  </div>
                </div>
              </div>
              {/* JourneyBar — the mission rail: done-share + phase pitch marker */}
              {goal && tasksTotal > 0 && (
                <div className="relative h-7 border-t border-white/10" aria-hidden="true">
                  <div className="absolute inset-x-6 top-[15px] border-t border-dashed border-zinc-700" />
                  <div
                    className="absolute left-6 top-[15px] h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#7c3aed] to-[#f0abfc] transition-[width] duration-700"
                    style={{ width: `calc((100% - 3rem) * ${doneRatio.toFixed(3)})` }}
                  />
                  <div
                    className="hq-journey-plane absolute top-[15px] text-[13px] leading-none text-fuchsia-300 drop-shadow-[0_0_8px_rgba(217,70,239,0.6)]"
                    style={{
                      left: `calc(1.5rem + (100% - 3rem) * ${doneRatio.toFixed(3)})`,
                      transform: `translate(-50%, -50%) rotate(${journeyAngle(goal.status)}deg)`,
                    }}
                  >
                    ✈
                  </div>
                  <span className="absolute right-6 top-[5px] font-mono text-[9px] tracking-[0.3em] text-zinc-500">
                    {journeyAct(goal.status)} · {goalStatusName(goal.status, lang)} {doneCount}/{tasksTotal}
                  </span>
                </div>
              )}
            </div>

            {/* the autonomy line — replaced the old goal console: visitors watch, the
                operator works. No stranger ever gets a steering wheel. */}
            <div className="hq-glass flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <span className="hq-chip font-mono text-[11.5px] tracking-[0.22em] text-fuchsia-300">
                ◉ {lang === 'he' ? 'אוטונומי לחלוטין' : 'FULLY AUTONOMOUS'}
              </span>
              {economyTotal !== null && (
                <span className="hq-chip" title={lang === 'he' ? 'קרדיטים שנצברו בכלכלת המפעיל' : 'credits earned by the operator economy'}>
                  <span className="text-zinc-500">{t('statusCredits', lang)}</span>
                  <b className="font-mono tabular-nums text-fuchsia-200" dir="ltr">{economyTotal}</b>
                </span>
              )}
              {snap.status.memory && (
                <span className="hq-chip" title={lang === 'he' ? 'זיכרון המפעיל האוטונומי' : 'autonomous operator memory'}>
                  <span className="text-zinc-500">{t('statusShifts', lang)}</span>
                  <b className="font-mono tabular-nums text-fuchsia-200" dir="ltr">{snap.status.memory.shifts}</b>
                  <span className="text-zinc-500">{t('statusLessons', lang)}</span>
                  <b className="font-mono tabular-nums text-fuchsia-200" dir="ltr">{snap.status.memory.lessons}</b>
                </span>
              )}
              <span className="text-[13px] leading-5 text-zinc-300">
                {lang === 'he'
                  ? 'היעדים מתוזמנים ומוכרעים על ידי מערכת ההפעלה בעצמה — למבקרים אין שליטה על הצוות, וזה בכוונה. יש שאלה? פנו לעמית בקבלה.'
                  : 'Goals are scheduled and decided by the operating system itself — visitors hold no control over the crew, by design. Questions? Ask Amit at the front desk.'}
              </span>
            </div>

            {/* feed — the operations journal (section, bounded scroll, no layout shift) */}
            <section className="hq-glass hq-rise-3 p-4" aria-label={t('feed', lang)}>
              <SectionHead index="02" title={t('secJournal', lang)}>
                <span className="shrink-0 rounded-full bg-fuchsia-500/12 px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-fuchsia-200" dir="ltr">
                  {snap.feed.length}
                </span>
              </SectionHead>
              <div className="hq-scroll grid max-h-96 gap-1 overflow-y-auto sm:grid-cols-2" dir="auto">
                {snap.feed.length === 0 && <p className="text-[13px] text-zinc-600">{t('emptyFeed', lang)}</p>}
                {[...snap.feed].reverse().map((f, i) => (
                  <div
                    key={f.id}
                    className="hq-feed-in flex items-start gap-2 rounded-xl px-2 py-1.5 text-[13px] leading-5 hover:bg-white/5"
                    style={{ animationDelay: `${Math.min(i, 12) * 0.02}s` }}
                  >
                    {i === 0 && <span className="hq-pulse mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-400" aria-hidden="true" />}
                    <span className="shrink-0 pt-px font-mono text-[11.5px] tabular-nums text-zinc-600" dir="ltr">
                      {new Date(f.ts).toLocaleTimeString('he-IL', { hour12: false })}
                    </span>
                    <FeedBadge kind={f.kind} />
                    <span className={`min-w-0 ${f.kind === 'error' ? 'text-rose-400' : f.kind === 'user' ? 'text-fuchsia-200' : 'text-zinc-200'}`}>{f.text}</span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          {/* side panels */}
          <aside className="hq-glass flex min-w-0 flex-col">
            <nav className="flex gap-1 overflow-x-auto border-b border-white/10 p-2" aria-label="panels">
              {(
                [
                  ['monitor', t('monitor', lang), openDecisionCount],
                  ['wall', t('wall', lang), snap.tasks.filter((x) => x.status === 'todo' || x.status === 'doing').length],
                  ['podium', t('podium', lang), openDecisionCount],
                  ['library', t('library', lang), snap.reports.length],
                  ['fleet', t('fleet', lang), 0],
                  ['git', t('gitWire', lang), snap.git?.commits.length ?? 0],
                ] as Array<[Tab, string, number]>
              ).map(([key, label, badge]) => (
                <button
                  key={key}
                  onClick={() => openTab(key)}
                  className={`hq-tab text-[15px] ${tab === key ? '' : 'text-zinc-400'}`}
                  data-active={tab === key}
                >
                  {label}
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 font-mono text-[10px] font-bold text-zinc-950">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div key={tab} className="hq-page-enter min-h-0 flex-1 p-4">
              {tab === 'monitor' && <MonitorPanel lang={lang} crew={snap.crew} agent={selectedAgent} logs={logs[selected ?? ''] ?? []} tasks={snap.tasks} />}
              {tab === 'wall' && <WallPanel lang={lang} tasks={snap.tasks} crew={snap.crew} />}
              {tab === 'podium' && <PodiumPanel lang={lang} decisions={snap.decisions} />}
              {tab === 'library' && <LibraryPanel lang={lang} reports={snap.reports} />}
              {tab === 'fleet' && <FleetPanel lang={lang} books={snap.books} crew={snap.crew} onPreview={openBookPreview} />}
              {tab === 'git' && <GitWirePanel lang={lang} git={snap.git} />}
            </div>
          </aside>
        </div>

        {/* crew roster chips — pill token selectors */}
        <section className="mt-6" aria-label={t('secCrew', lang)}>
          <SectionHead index="03" title={t('secCrew', lang)}>
            <span className="ms-auto shrink-0 font-mono text-[11.5px] tabular-nums text-zinc-500" dir="ltr">
              {agentList.filter((a) => a.state !== 'idle').length}/{agentList.length || snap.crew.length} {t('atWork', lang)}
            </span>
          </SectionHead>
          <div className="flex flex-wrap gap-2.5">
            {snap.crew.map((c) => {
              const a = agents[c.id];
              const active = selected === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => selectAgent(c.id)}
                  className="hq-crewchip text-sm"
                  data-active={active}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a ? rosterDot(a.state) : '#a1a1aa' }} aria-hidden="true" />
                  <span className="text-[15px] font-bold" style={{ color: c.color }}>{c.name[lang]}</span>
                  <span className="text-[13px] text-zinc-400">{a?.activity || c.title[lang]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 04 · sovereign stack health — chains re-verified from disk */}
        <StackHealth lang={lang} />
      </main>

      {/* ================= footer ================= */}
      <footer className="mt-auto border-t border-white/10 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 text-[13px] text-zinc-500" dir="auto">
          <span className="font-bold text-zinc-300">{t('footerTruth', lang)}</span>
          <span className="ms-auto flex gap-3">
            <span>
              <CounterUp value={snap.books.length} className="text-zinc-400" /> {t('books', lang)} · <CounterUp value={snap.agents.length} className="text-zinc-400" /> {t('agents', lang)}
            </span>
            <span className="font-mono" dir="ltr">{snap.status.llmProvider}</span>
          </span>
        </div>
      </footer>

      {/* book preview dialog */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="hq-glass !rounded-2xl max-h-[80vh] w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="hq-hairline" aria-hidden="true" />
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-base font-bold text-zinc-100">{t('preview', lang)}: {preview.id}</h3>
              <button onClick={() => setPreview(null)} className="hq-btn-ghost px-3.5 py-2 text-sm">
                {t('close', lang)}
              </button>
            </div>
            <pre className="hq-scroll max-h-[65vh] overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-6 text-zinc-300" dir="ltr">
              {preview.excerpt}
            </pre>
          </div>
        </div>
      )}

      {/* the office receptionist — the chat IS a worker in the room (opened by clicking עמית) */}
      <ReceptionChat lang={lang} open={chatOpen} onClose={() => setChatOpen(false)} stats={publicStats} />
    </div>
  );
}

function rosterDot(state: AgentView['state']): string {
  return STATE_COLORS[state];
}

function FeedBadge({ kind }: { kind: FeedItem['kind'] }) {
  const map: Record<FeedItem['kind'], { c: string; s: string }> = {
    goal: { c: 'bg-fuchsia-500/15 text-fuchsia-200', s: '◎' },
    plan: { c: 'bg-violet-500/15 text-violet-200', s: '▦' },
    task: { c: 'bg-zinc-700/50 text-zinc-300', s: '▤' },
    message: { c: 'bg-fuchsia-500/20 text-fuchsia-100', s: '❝' },
    decision: { c: 'bg-emerald-500/15 text-emerald-300', s: '⏳' },
    report: { c: 'bg-emerald-500/12 text-emerald-200', s: '▤' },
    git: { c: 'bg-emerald-500/15 text-emerald-300', s: '⑂' },
    system: { c: 'bg-zinc-800 text-zinc-400', s: '·' },
    error: { c: 'bg-rose-500/20 text-rose-300', s: '!' },
    user: { c: 'bg-fuchsia-500/25 text-fuchsia-100', s: '★' },
  };
  const { c, s } = map[kind] ?? map.system;
  return <span className={`shrink-0 rounded px-1.5 text-[10px] font-bold ${c}`}>{s}</span>;
}
