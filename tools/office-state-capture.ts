// office-state-capture.ts — the office's public-state eye.
//
// Connects to the agent-hq foreman socket (READ-ONLY — the socket has no
// control surface), observes a real window of office life, and writes a
// single JSON state file that the public Domain page renders live.
//
// Honesty law: everything in the JSON was actually emitted by the foreman.
// Nothing is invented; when the office is quiet, the JSON says so.
//
// COUNTS LAW (3-b fix, 2026-10-13): counts were WINDOW-EVENT counters (bumped
// per socket event during the capture window), so a quiet window showed
// counts.task=0 next to a 158-task array — the owner read it as "the wall is
// broken". Now counts = the MEASURED SIZES of the arrays shipped in this very
// file (agent/task/feed/decision/report/bubble are self-consistent totals);
// only log/goal remain window-event counters (their arrays are not shipped),
// and the header comment says so.
//
// MEMORY LAW (3-b fix, 2026-10-13): the foreman ships its git-restored shift
// memory at snapshot.status.memory ({shifts, lessons}) — NOT at the snapshot
// root. The capture read s.memory, found nothing, and published memory:null
// forever, so every reader showed "0 משמרות, 0 לקחים". Now both paths are
// read (status.memory first, root as fallback) — still foreman-emitted truth
// only, never invented.
//
// Usage: bun tools/office-state-capture.ts [port] [outFile] [captureMs]
//   port      default 3010
//   outFile   default office-state.json
//   captureMs default 90000

import { io } from 'socket.io-client';
import { readFileSync, writeFileSync } from 'fs';

const PORT = process.argv[2] || '3010';
const OUT = process.argv[3] || 'office-state.json';
const CAPTURE_MS = Number(process.argv[4] || 90000);

type Task = { id: string; title: string; status: string };
type Agent = { id: string; name?: string; state?: string; activity?: string };
type FeedItem = { kind: string; text: string; at: number };

const state = {
  capturedAt: new Date().toISOString(),
  connected: false,
  backend: null as string | null,
  statusHe: null as string | null,
  mode: null as string | null,
  agents: [] as Agent[],
  tasks: [] as Task[],
  books: 0,
  memory: null as unknown,
  counts: { agent: 0, task: 0, log: 0, feed: 0, decision: 0, report: 0, goal: 0, bubble: 0 },
  feed: [] as FeedItem[],
  reports: [] as { id?: string; title?: string; agentId?: string; at: number }[],
  decisions: [] as unknown[],
  lastError: null as string | null,
};

const bump = (k: keyof typeof state.counts) => { state.counts[k]++; };
const rememberFeed = (kind: string, text: string) => {
  state.feed.push({ kind, text: String(text ?? '').slice(0, 240), at: Date.now() });
  if (state.feed.length > 60) state.feed.splice(0, state.feed.length - 60);
};

const socket = io(`http://localhost:${PORT}`, { path: '/', transports: ['websocket', 'polling'], timeout: 8000 });

socket.on('connect', () => { state.connected = true; });

socket.on('connect_error', (e: Error) => {
  state.lastError = `connect_error: ${e.message}`;
});

socket.on('snapshot', (s: any) => {
  state.backend = s?.status?.backend ?? null;
  state.statusHe = s?.status?.message?.he ?? null;
  state.mode = s?.mode ?? s?.status?.mode ?? null;
  state.agents = Array.isArray(s?.agents) ? s.agents : [];
  state.books = Array.isArray(s?.books) ? s.books.length : state.books;
  // foreman path: status.memory = {shifts, lessons} (git-restored); root memory = legacy fallback
  const mem = s?.status?.memory ?? s?.memory;
  if (mem) state.memory = mem;
  if (Array.isArray(s?.tasks)) state.tasks = s.tasks;
});

socket.on('task', (t: Task) => {
  bump('task');
  const i = state.tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) state.tasks[i] = { ...state.tasks[i], ...t };
  else state.tasks.push({ id: t.id, title: t.title, status: t.status });
  rememberFeed('task', `${t.status}: ${t.title}`);
});

socket.on('agent', (a: Agent) => {
  bump('agent');
  const i = state.agents.findIndex((x) => x.id === a.id);
  if (i >= 0) state.agents[i] = { ...state.agents[i], ...a };
});

socket.on('log', (l: { agentId: string; entry: { kind: string; text: string } }) => {
  bump('log');
  if (l?.entry?.kind === 'report') rememberFeed(`log:${l.agentId}`, l.entry.text);
});

socket.on('feed', (f: { kind: string; text: string }) => { bump('feed'); rememberFeed(f.kind, f.text); });
socket.on('goal', (g: unknown) => { bump('goal'); rememberFeed('goal', JSON.stringify(g).slice(0, 200)); });
socket.on('bubble', (b: { agentId?: string; text?: string }) => { bump('bubble'); rememberFeed(`bubble:${b?.agentId ?? ''}`, b?.text ?? ''); });
socket.on('decision', (d: unknown) => { bump('decision'); state.decisions.push(d); if (state.decisions.length > 10) state.decisions.splice(0, state.decisions.length - 10); });
socket.on('report', (r: { id?: string; title?: string; agentId?: string }) => {
  bump('report');
  state.reports.push({ ...r, at: Date.now() });
  rememberFeed('report', r?.title ?? '(untitled report)');
});

setTimeout(() => {
  // R53 DECISIONS LAW: the window rarely sees a decision event, but the office
  // journal (receipts/office-state-mirror.json — the office's own durable
  // write) carries the full decision history. Without this merge the public
  // state book ships decisions:[] forever, the podium ring never lights, and
  // the owner rightly asks what the decisions podium is even FOR. Merge the
  // newest journal decisions (answered + open, newest first, capped) — the
  // foreman's own book, nothing invented.
  try {
    const j = JSON.parse(readFileSync('receipts/office-state-mirror.json', 'utf8'));
    const jd: unknown[] = Array.isArray(j?.decisions) ? j.decisions : [];
    const known = new Set(state.decisions.map((d: unknown) => (d as { id?: string })?.id));
    for (const d of jd.slice().reverse()) {
      const o = d as { id?: string };
      if (!o?.id || known.has(o.id)) continue;
      state.decisions.push(d);
      if (state.decisions.length > 10) state.decisions.splice(0, state.decisions.length - 10);
    }
  } catch { /* mirror absent (demo-mode honest) — window decisions only */ }
  state.feed.reverse(); // newest first
  // COUNTS LAW: publish the measured sizes of THIS file's arrays (self-consistent
  // totals a reader can verify against the arrays), never a quiet-window zero.
  state.counts = {
    agent: state.agents.length,
    task: state.tasks.length,
    log: state.counts.log, // window-event counter (log entries are not shipped)
    feed: state.feed.length,
    decision: state.decisions.length,
    report: state.reports.length,
    goal: state.counts.goal, // window-event counter (goals are not shipped)
    bubble: state.feed.filter((f) => f.kind.startsWith('bubble:')).length,
  };
  writeFileSync(OUT, JSON.stringify(state, null, 2), 'utf8');
  console.log(`[office-state-capture] wrote ${OUT}: connected=${state.connected} backend=${state.backend} agents=${state.agents.length} tasks=${state.tasks.length} reports=${state.reports.length} events={${Object.entries(state.counts).map(([k, v]) => `${k}:${v}`).join(',')}}`);
  socket.disconnect();
  process.exit(0);
}, CAPTURE_MS);
