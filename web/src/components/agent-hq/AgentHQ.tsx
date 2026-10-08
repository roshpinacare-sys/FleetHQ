'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import io, { type Socket } from 'socket.io-client';
import { Office } from './Office';
import { FleetPanel, LibraryPanel, MonitorPanel, PodiumPanel, WallPanel } from './panels';
import { GitWirePanel } from './GitWire';
import { ReceptionChat, type PublicStats } from './ReceptionChat';
import type { AgentView, BookView, CrewMember, Decision, FeedItem, GitPulse, Goal, LogEntry, Report, Snapshot, Task } from './types';
import { t, goalStatusName, type Lang } from './i18n';

type Tab = 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git';

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

/** Odometer readout — per-digit column strips, 1s power3 glide (magic.odometer law).
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

/** Particle constellation atmosphere — deterministic init (no Math.random),
 *  link threshold d²<6000, pink/cyan dots, paused offscreen (IntersectionObserver)
 *  and skipped entirely under prefers-reduced-motion (magic.particles law). */
function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let visible = true;
    const N = 110;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: ((i * 73 + 11) % 100) / 100,
      y: ((i * 41 + 29) % 100) / 100,
      vx: (((i * 11) % 7) - 3) * 0.0004,
      vy: (((i * 17) % 5) - 2) * 0.0004,
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
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      }
      const th = 6000 * dpr * dpr;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (pts[i].x - pts[j].x) * w;
          const dy = (pts[i].y - pts[j].y) * h;
          const d2 = dx * dx + dy * dy;
          if (d2 < th) {
            ctx.strokeStyle = `rgba(255, 20, 100, ${((1 - d2 / th) * 0.3).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x * w, pts[i].y * h);
            ctx.lineTo(pts[j].x * w, pts[j].y * h);
            ctx.stroke();
          }
        }
      }
      for (let i = 0; i < N; i++) {
        ctx.fillStyle = i % 2 ? '#FF1464' : '#00E5FF';
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(pts[i].x * w, pts[i].y * h, 1.1 * dpr, 0, Math.PI * 2);
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

/** JourneyBar pitch per act (yuv-decks law): queued 90°, doing 58°, review 115°, done 90°. */
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

/** Section header — the page's visible ORDER: numbered, mono-indexed, consistently spaced. */
function SectionHead({ index, title, children }: { index: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <span className="font-mono text-sm font-bold tracking-[0.2em] text-[#FF1464]" dir="ltr">{index}</span>
      <h2 className="text-lg font-black tracking-wide text-zinc-100">{title}</h2>
      <span className="h-px flex-1 bg-gradient-to-l from-[#26262e] to-transparent" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function AgentHQ() {
  const [lang, setLang] = useState<Lang>('he');
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [agents, setAgents] = useState<Record<string, AgentView>>({});
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
  const [bubbles, setBubbles] = useState<Record<string, { text: string; ts: number }>>({});
  const [tab, setTab] = useState<Tab>('monitor');
  const [selected, setSelected] = useState<string | null>(null);
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
      // glitch burst on a genuinely fresh commit (the wordmark tears for half a second)
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
      : { color: goal.status === 'planning' ? '#FF1464' : goal.status === 'active' ? '#00E5FF' : '#ffb020', label: goalStatusName(goal.status, lang) };
  // JourneyBar rail: share of tasks really done (never the goal's self-report)
  const doneCount = snap.tasks.filter((x) => x.status === 'done').length;
  const tasksTotal = snap.tasks.length;
  const doneRatio = tasksTotal > 0 ? doneCount / tasksTotal : 0;

  return (
    <div className="hq-root flex min-h-screen flex-col bg-[#0a0a0d] text-zinc-100" dir={rtl ? 'rtl' : 'ltr'}>
      {/* atmosphere: particle constellation + drifting neon washes + grain (behind everything) */}
      <div className="hq-atmosphere" aria-hidden="true">
        <ParticleField />
        <div className="hq-blob hq-blob-a" />
        <div className="hq-blob hq-blob-b" />
        <div className="hq-blob hq-blob-c" />
        <div className="hq-grain" />
      </div>

      {/* ================= header ================= */}
      <header className="sticky top-0 z-30 border-b border-[#232329] bg-[#0a0a0d]/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-none bg-[#FF1464] text-xl font-black text-white shadow-[0_0_24px_rgba(255,20,100,0.45)]">צ</div>
            <div>
              <h1 className={`hq-aurora ${glitch ? 'hq-glitch' : ''} text-2xl font-black leading-7 tracking-wide`}>
                {t('title', lang)}
              </h1>
              <p className="text-sm text-zinc-400">{t('subtitle', lang)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${connected ? 'bg-[#00E5FF]/10 text-[#4de3ff]' : 'bg-red-500/15 text-red-400'}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-[#00E5FF] hq-pulse' : 'bg-red-400'}`} />
              {connected ? t('live', lang) : t('connecting', lang)}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-semibold ${sim ? 'bg-amber-500/15 text-amber-400' : 'bg-[#00E5FF]/10 text-[#4de3ff]'}`} title={snap.status.message[lang]}>
              {sim ? t('demoCrew', lang) : t('liveCrew', lang)}
            </span>
            {goalPhase && (
              <span className="flex items-center gap-2 rounded-full bg-[#15151a] px-2.5 py-1 ring-1 ring-[#26262e]">
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 -rotate-90">
                  <circle cx="10" cy="10" r="7" fill="none" stroke="#2a2a32" strokeWidth="3" />
                  <circle cx="10" cy="10" r="7" fill="none" stroke={goalPhase.color} strokeWidth="3" strokeDasharray={`${(goal?.progress ?? 0) * 44} 44`} strokeLinecap="round" />
                </svg>
                <span dir="auto" className="max-w-52 truncate">{goal?.text}</span>
                <span className="font-mono tabular-nums" style={{ color: goalPhase.color }}>{Math.round((goal?.progress ?? 0) * 100)}%</span>
              </span>
            )}
            <span className="rounded-full bg-[#15151a] px-2.5 py-1 text-zinc-300 ring-1 ring-[#26262e]">
              {t('opsDone', lang)}: <Odometer value={snap.status.opsDone} className="text-[#ff5c92]" />
            </span>
          </div>

          <div className="ms-auto flex items-center gap-3 text-[13px] text-zinc-400">
            <span className="hidden font-mono tabular-nums tracking-wider text-[#4de3ff] sm:inline" dir="ltr">{clock} {t('jerusalem', lang)}</span>
            <button
              onClick={() => setLang(rtl ? 'en' : 'he')}
              className="rounded-none border border-[#2e2e36] px-4 py-2 text-sm font-semibold transition hover:border-[#FF1464] hover:text-[#ff5c92]"
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
            <SectionHead index="01" title={t('secOffice', lang)}>
              <span className="hidden shrink-0 font-mono text-[11.5px] tabular-nums text-zinc-500 sm:block" dir="ltr">
                {agentList.filter((a) => a.state !== 'idle').length}/{agentList.length || snap.crew.length} {t('atWork', lang)}
              </span>
            </SectionHead>
            <div className="relative overflow-hidden rounded-none border border-[#232329] bg-[#0c0c10] shadow-[0_0_60px_rgba(0,0,0,0.6)]">
              {/* HUD corner brackets around the office viewport */}
              <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
                <div className="absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-[#3a3b44]" />
                <div className="absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-[#3a3b44]" />
                <div className="absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-[#3a3b44]" />
                <div className="absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-[#3a3b44]" />
              </div>
              <div className="aspect-[4/3] w-full sm:aspect-[1180/640]">
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
              </div>
              {sim && (
                <div className="absolute start-3 top-3 rounded-none bg-amber-500/90 px-3 py-1.5 text-xs font-bold text-zinc-950">
                  {t('demoCrew', lang)} — {t('demoNote', lang)}
                </div>
              )}
            </div>

            {/* flight HUD strip — the mission-control anchor (gradient progress + instruments) */}
            <div className="rounded-none border border-[#232329] bg-[#0c0c10]" dir="ltr">
              <div className="h-[6px] w-full bg-[#15151a]">
                <div
                  className="h-full bg-gradient-to-r from-[#FF1464] via-[#ff7ab0] to-[#00E5FF] transition-[width] duration-700"
                  style={{ width: `${Math.round((goal?.progress ?? 0) * 100)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-stretch divide-x divide-[#1c1c22] rtl:divide-x-reverse">
                <div className="flex min-w-[150px] flex-1 items-center gap-2 px-4 py-3">
                  <span className="rounded-none border border-[#2e2e36] px-2 py-1 font-mono text-[11px] tracking-[0.22em] text-[#4de3ff]">
                    ◉ {goal ? goalPhase?.label.split('…')[0].toUpperCase() : (lang === 'he' ? 'מוכן' : 'READY')}
                  </span>
                  <span dir="auto" className="truncate text-[13px] text-zinc-300">{goal?.text ?? t('noGoal', lang)}</span>
                </div>
                {(
                  [
                    [t('wall', lang), activeTasks, '#4de3ff'],
                    [t('reports', lang), snap.reports.length, '#7dffb0'],
                    [t('podium', lang), openDecisionCount, openDecisionCount > 0 ? '#4de3ff' : '#8f9199'],
                  ] as Array<[string, number, string]>
                ).map(([label, value, color]) => (
                  <div key={label} className="min-w-[104px] flex-1 px-4 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                    <div className="font-mono text-xl tabular-nums leading-6" style={{ color }}>
                      <CounterUp value={value} />
                    </div>
                  </div>
                ))}
                <div className="min-w-[104px] flex-1 px-4 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{t('opsDone', lang)}</div>
                  <div className="font-mono text-xl leading-6 text-[#ff5c92]">
                    <Odometer value={snap.status.opsDone} />
                  </div>
                </div>
              </div>
              {/* JourneyBar — the mission rail: done-share + phase pitch marker (yuv-decks) */}
              {goal && tasksTotal > 0 && (
                <div className="relative h-7 border-t border-[#1c1c22]" aria-hidden="true">
                  <div className="absolute inset-x-6 top-[15px] border-t border-dashed border-[#2e2e36]" />
                  <div
                    className="absolute left-6 top-[15px] h-[2px] -translate-y-1/2 bg-gradient-to-r from-[#FF1464] to-[#00E5FF] transition-[width] duration-700"
                    style={{ width: `calc((100% - 3rem) * ${doneRatio.toFixed(3)})` }}
                  />
                  <div
                    className="absolute top-[15px] text-[13px] leading-none text-[#FF1464] drop-shadow-[0_0_8px_rgba(255,20,100,0.6)]"
                    style={{
                      left: `calc(1.5rem + (100% - 3rem) * ${doneRatio.toFixed(3)})`,
                      transform: `translate(-50%, -50%) rotate(${journeyAngle(goal.status)}deg)`,
                      transition: 'transform 0.5s cubic-bezier(0.34, 1.4, 0.5, 1)',
                    }}
                  >
                    ✈
                  </div>
                  <span className="absolute right-6 top-[5px] font-mono text-[9px] tracking-[0.3em] text-[#4de3ff]">
                    {journeyAct(goal.status)} · {goalStatusName(goal.status, lang)} {doneCount}/{tasksTotal}
                  </span>
                </div>
              )}
            </div>

            {/* the autonomy line — replaced the old goal console: visitors watch, the
                operator works. No stranger ever gets a steering wheel. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-none border border-[#232329] bg-[#0c0c10] px-4 py-3">
              <span className="rounded-none border border-[#00E5FF]/40 bg-[#00E5FF]/8 px-2.5 py-1 font-mono text-[11.5px] font-bold tracking-[0.22em] text-[#4de3ff]">
                ◉ {lang === 'he' ? 'אוטונומי לחלוטין' : 'FULLY AUTONOMOUS'}
              </span>
              <span className="text-[13px] leading-5 text-zinc-300">
                {lang === 'he'
                  ? 'היעדים מתוזמנים ומוכרעים על ידי מערכת ההפעלה בעצמה — למבקרים אין שליטה על הצוות, וזה בכוונה. יש שאלה? פנו לעמית בקבלה.'
                  : 'Goals are scheduled and decided by the operating system itself — visitors hold no control over the crew, by design. Questions? Ask Amit at the front desk.'}
              </span>
            </div>

            {/* feed */}
            <div className="rounded-none border border-[#232329] bg-[#0c0c10] p-4">
              <SectionHead index="02" title={t('secJournal', lang)}>
                <span className="shrink-0 rounded-full bg-[#00E5FF]/10 px-2.5 py-0.5 font-mono text-[11.5px] font-bold text-[#4de3ff]" dir="ltr">
                  {snap.feed.length}
                </span>
              </SectionHead>
              <div className="hq-scroll grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2" dir="auto">
                {snap.feed.length === 0 && <p className="text-[13px] text-zinc-600">{t('emptyFeed', lang)}</p>}
                {[...snap.feed].reverse().map((f, i) => (
                  <div
                    key={f.id}
                    className="hq-feed-in flex items-start gap-2 rounded-none px-2 py-1.5 text-[13px] leading-5 hover:bg-[#15151a]"
                    style={{ animationDelay: `${Math.min(i, 12) * 0.02}s` }}
                  >
                    {i === 0 && <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00E5FF] hq-pulse" aria-hidden="true" />}
                    <span className="shrink-0 pt-px font-mono text-[11.5px] tabular-nums text-zinc-600" dir="ltr">
                      {new Date(f.ts).toLocaleTimeString('he-IL', { hour12: false })}
                    </span>
                    <FeedBadge kind={f.kind} />
                    <span className={`min-w-0 ${f.kind === 'error' ? 'text-red-400' : f.kind === 'user' ? 'text-[#ff8fb4]' : 'text-zinc-200'}`}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* side panels */}
          <aside className="flex min-w-0 flex-col rounded-none border border-[#232329] bg-[#0c0c10]">
            <nav className="flex gap-1 overflow-x-auto border-b border-[#232329] p-2" aria-label="panels">
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
                  className={`relative shrink-0 rounded-none px-3.5 py-2.5 text-[15px] font-semibold transition ${
                    tab === key ? 'bg-[#FF1464]/12 text-[#ff5c92] shadow-[inset_0_-2px_0_0_#FF1464]' : 'text-zinc-400 hover:bg-[#15151a] hover:text-zinc-200'
                  }`}
                >
                  {label}
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF1464] px-1 font-mono text-[10px] font-bold text-white">
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

        {/* crew roster chips */}
        <div className="mt-5">
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
                  className={`flex items-center gap-2.5 rounded-none border px-3.5 py-2.5 text-sm transition ${
                    active ? 'border-[#FF1464] bg-[#FF1464]/10 shadow-[0_0_18px_rgba(255,20,100,0.2)]' : 'border-[#232329] bg-[#0c0c10] hover:border-[#3a3b44]'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a ? rosterDot(a.state) : '#52525b' }} />
                  <span className="text-[15px] font-semibold" style={{ color: c.color }}>{c.name[lang]}</span>
                  <span className="text-[13px] text-zinc-400">{a?.activity || c.title[lang]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* ================= footer ================= */}
      <footer className="mt-auto border-t border-[#232329] bg-[#08080b] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 text-[13px] text-zinc-500" dir="auto">
          <span className="font-semibold text-zinc-300">{t('footerTruth', lang)}</span>
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-none border border-[#2e2e36] bg-[#0c0c10] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#232329] px-4 py-3">
              <h3 className="text-base font-bold">{t('preview', lang)}: {preview.id}</h3>
              <button onClick={() => setPreview(null)} className="rounded-none border border-[#2e2e36] px-3.5 py-2 text-sm hover:border-[#00E5FF] hover:text-[#4de3ff]">
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
    goal: { c: 'bg-[#FF1464]/20 text-[#ff8fb4]', s: '◎' },
    plan: { c: 'bg-[#FF1464]/20 text-[#ff8fb4]', s: '▦' },
    task: { c: 'bg-zinc-700/50 text-zinc-300', s: '▤' },
    message: { c: 'bg-rose-500/15 text-rose-300', s: '❝' },
    decision: { c: 'bg-[#00E5FF]/15 text-[#8fe9f7]', s: '⏳' },
    report: { c: 'bg-[#00E5FF]/10 text-[#4de3ff]', s: '▤' },
    git: { c: 'bg-emerald-500/15 text-emerald-300', s: '⑂' },
    system: { c: 'bg-zinc-800 text-zinc-400', s: '·' },
    error: { c: 'bg-red-500/20 text-red-400', s: '!' },
    user: { c: 'bg-[#FF1464]/25 text-[#ff8fb4]', s: '★' },
  };
  const { c, s } = map[kind] ?? map.system;
  return <span className={`shrink-0 rounded px-1.5 text-[10px] font-bold ${c}`}>{s}</span>;
}
