/**
 * store.ts — גשר המצב של המשרד התלת-ממדי (zustand bridge).
 * ---------------------------------------------------------------------------
 * החוק: אין כאן סוקט, אין כאן סימולציה. AgentHQ (הממשק האמיתי) מחזיק את
 * החיבור היחיד לפורמן (:3010) ומזרים לכאן כל אירוע אמיתי בזמן אמת —
 * סנאפשוט, סוכן, לוג, משימה, החלטה, דוח, פיד, יעד, ספרים, גיט, בועת דיבור.
 * השכבה התלת-ממדית קוראת מכאן בלבד, ולכן כל מה שנראה בחדר הוא המציאות
 * הנמדדת של המשרד — לעולם לא הדגמה.
 *
 * קליקים בחדר חוזרים אל AgentHQ דרך bindUi: בחירת סוכן, פתיחת לוח/פודיום/
 * ספרייה/גיט, קבלה — הפאנלים האמיתיים, לא עותקים.
 */
'use client';

import { create } from 'zustand';
import type {
  AgentView, BookView, CrewMember, Decision, FeedItem, ForemanStatus,
  GitPulse, Goal, LogEntry, Report, Snapshot, Task,
} from './protocol';
import { CREW_FALLBACK } from './protocol';
import { createBrains, type AgentBrain } from './world';

export type Lang = 'he' | 'en';

/** הפאנלים שהחדר יכול לבקש מ-AgentHQ (הפאנלים האמיתיים של הממשק) */
export type PanelRequest =
  | { kind: 'agent'; agentId: string }
  | { kind: 'tab'; tab: 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git' }
  | { kind: 'chat' };

/** AgentHQ מחבר את הפונקציות האמיתיות שלו לכאן */
export interface UiBindings {
  selectAgent?: (id: string) => void;
  openTab?: (tab: 'monitor' | 'wall' | 'podium' | 'library' | 'fleet' | 'git') => void;
  openChat?: () => void;
  setLang?: (l: Lang) => void;
}

interface HqBridgeState {
  /** תמיד true — החדר ניזון ישירות מהמצב האמיתי של AgentHQ */
  booted: boolean;
  lang: Lang;
  /** מראה את מצב החיבור האמיתי של AgentHQ (לתצוגה בלבד — אין כאן חיבור) */
  connected: boolean;
  snap: Snapshot;
  brains: Map<string, AgentBrain>;
  ui: UiBindings;
  toasts: { id: number; text: string }[];

  bindUi(ui: UiBindings): void;
  setLang(l: Lang): void;
  setPanel(panel: string, agentId?: string): void;
  toast(text: string): void;

  // ---- הזרמת מציאות (AgentHQ קורא אליהן מתוך מטפלי הסוקט שלו) ----
  syncSnapshot(snap: Snapshot): void;
  syncAgent(a: AgentView): void;
  syncLog(agentId: string, entry: LogEntry): void;
  syncTask(t: Task): void;
  syncDecision(d: Decision): void;
  syncReport(r: Report): void;
  syncFeed(f: FeedItem): void;
  syncGoal(g: Goal): void;
  syncBooks(books: BookView[]): void;
  syncStatus(status: ForemanStatus): void;
  syncGit(git: GitPulse): void;
  syncConnected(connected: boolean): void;
  /** בועת דיבור אמיתית מהפורמן — נכנסת כלוג 'say' כדי שהדמות תדבר בחדר */
  syncBubble(agentId: string, text: string): void;
}

const EMPTY: Snapshot = {
  v: 1,
  status: { backend: 'live', llmProvider: '…', message: { he: 'מתחבר…', en: 'Connecting…' }, startedAt: Date.now(), opsDone: 0 },
  crew: CREW_FALLBACK,
  agents: CREW_FALLBACK.map((c) => ({ id: c.id, state: 'idle' as const, activity: '', station: 'desk' as const, since: Date.now() })),
  logs: {},
  tasks: [],
  decisions: [],
  reports: [],
  feed: [],
  books: [],
};

let toastSeq = 0;

function syncBrains(brains: Map<string, AgentBrain>, agents: AgentView[]) {
  for (const a of agents) brains.get(a.id)?.syncState(a.state, a.station, a.activity);
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

export const useHq = create<HqBridgeState>((set, get) => ({
  booted: true,
  lang: 'he',
  connected: false,
  snap: EMPTY,
  brains: createBrains(),
  ui: {},
  toasts: [],

  bindUi(ui) { set({ ui }); },

  setLang(l) {
    set({ lang: l });
    get().ui.setLang?.(l); // השפה אחת לכל הממשק — הכיוון מתהפך במקום אחד
  },

  /** קליק בחדר → הפאנל האמיתי של AgentHQ */
  setPanel(panel, agentId) {
    const ui = get().ui;
    if (panel === 'agent' && agentId) ui.selectAgent?.(agentId);
    else if (panel === 'reception') ui.openChat?.();
    else if (panel === 'wall') ui.openTab?.('wall');
    else if (panel === 'podium') ui.openTab?.('podium');
    else if (panel === 'library') ui.openTab?.('library');
    else if (panel === 'git') ui.openTab?.('git');
    else if (panel === 'flame' || panel === 'lead') ui.openTab?.('fleet');
  },

  toast(text) {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-3), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3400);
  },

  // ---- הזרמת מציאות ----
  syncSnapshot(snap) {
    const crew: CrewMember[] = snap.crew?.length ? snap.crew : CREW_FALLBACK;
    const agents: AgentView[] = snap.agents?.length
      ? snap.agents
      : crew.map((c) => ({ id: c.id, state: 'idle' as const, activity: '', station: 'desk' as const, since: Date.now() }));
    const next: Snapshot = { ...snap, crew, agents };
    set({ snap: next });
    syncBrains(get().brains, agents);
  },
  syncAgent(a) {
    const st = get();
    const agents = upsert(st.snap.agents, a);
    set({ snap: { ...st.snap, agents } });
    syncBrains(st.brains, [a]);
  },
  syncLog(agentId, entry) {
    const st = get();
    const logs = { ...st.snap.logs, [agentId]: [...(st.snap.logs[agentId] || []).slice(-40), entry] };
    set({ snap: { ...st.snap, logs } });
  },
  syncTask(t) {
    const st = get();
    set({ snap: { ...st.snap, tasks: upsert(st.snap.tasks, t) } });
    if (t.status === 'done' && t.assignee) st.toast('✓ ' + t.title);
  },
  syncDecision(d) {
    const st = get();
    set({ snap: { ...st.snap, decisions: upsert(st.snap.decisions, d) } });
  },
  syncReport(r) {
    const st = get();
    set({ snap: { ...st.snap, reports: [r, ...st.snap.reports].slice(0, 30) } });
  },
  syncFeed(f) {
    const st = get();
    set({ snap: { ...st.snap, feed: [...st.snap.feed.slice(-160), f] } });
  },
  syncGoal(g) {
    set({ snap: { ...get().snap, goal: g } });
  },
  syncBooks(books) {
    set({ snap: { ...get().snap, books } });
  },
  syncStatus(status) {
    set({ snap: { ...get().snap, status } });
  },
  syncGit(git) {
    set({ snap: { ...get().snap, git } });
  },
  syncConnected(connected) {
    set({ connected });
  },
  syncBubble(agentId, text) {
    if (!text) return;
    get().syncLog(agentId, { ts: Date.now(), kind: 'say', text });
  },
}));
