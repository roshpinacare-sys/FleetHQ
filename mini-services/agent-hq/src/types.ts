// Fleet HQ wire protocol — the office state contract between foreman and the web client.
// Inspired by the discipline of typed agent protocols (snapshot + granular upserts).

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'checking'
  | 'writing'
  | 'walking'
  | 'waiting_user'
  | 'blocked'
  | 'done'
  | 'error';

export type Station = 'desk' | 'wall' | 'podium' | 'library' | 'offstage';

export interface CrewMember {
  id: string;
  name: { he: string; en: string };
  title: { he: string; en: string };
  color: string;
  specialty: { he: string; en: string };
  books: string[]; // book ids this agent owns
  role: 'lead' | 'worker';
}

export interface AgentView {
  id: string;
  state: AgentState;
  activity: string; // <= 64 chars, real
  station: Station;
  taskId?: string;
  since: number; // epoch ms of last state change
}

export interface LogEntry {
  ts: number;
  kind: 'text' | 'tool' | 'result' | 'error' | 'report' | 'say';
  text: string;
}

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done' | 'blocked' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;
  dependsOn: string[];
  summary?: string;
  /** Why this worker — the LLM's one-line fit reasoning (shown on the wall card). */
  why?: string;
  /** Who did the matching: the model (llm) or the deterministic specialty fit (fit). */
  matchBy?: 'llm' | 'fit';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface Decision {
  id: string;
  agentId: string;
  kind: 'question' | 'permission';
  question: string;
  options: string[];
  context?: string;
  status: 'open' | 'answered';
  answer?: { option?: string; text?: string; ts: number };
  taskId?: string;
  createdAt: number;
}

export interface Report {
  id: string;
  title: string;
  body: string;
  author: string;
  ts: number;
}

export type FeedKind =
  | 'goal'
  | 'plan'
  | 'task'
  | 'message'
  | 'decision'
  | 'report'
  | 'system'
  | 'error'
  | 'user'
  | 'git';

export interface FeedItem {
  id: string;
  ts: number;
  kind: FeedKind;
  text: string;
  agentId?: string;
}

export type GoalStatus = 'planning' | 'active' | 'review' | 'done' | 'failed';

export interface Goal {
  id: string;
  text: string;
  status: GoalStatus;
  progress: number; // 0..1
  createdAt: number;
  updatedAt: number;
  /** 'commander' = a visitor typed it; 'patrol' = the crew's own scheduled routine shift. */
  origin?: 'commander' | 'patrol';
}

// ---- real fleet registry -------------------------------------------------------------

export interface BookView {
  id: string;
  file: string;
  title: { he: string; en: string };
  category: { he: string; en: string };
  bytes: number;
  heartbeat?: number; // epoch ms
  ageHours?: number;
  ok?: boolean;
  verdict?: string;
  owner?: string; // crew id
}

export interface ForemanStatus {
  backend: 'live' | 'sim';
  llmProvider: string;
  message: { he: string; en: string };
  startedAt: number;
  opsDone: number;
  /** The office economy — credits honestly earned per agent (approved work). */
  economy?: Record<string, number>;
  /** The evolving brain — how many shifts ran and how many lessons are kept. */
  memory?: { shifts: number; lessons: number };
}

/** The office's sovereign memory — persisted into the data repo (git) so a
 *  fresh machine resumes exactly where the fleet left off. */
export interface OfficeMemory {
  shifts: number;
  lessons: string[];
  recentGoals: string[];
  economy: Record<string, number>;
  updatedAt: number;
}

// ---- the git wire: the fleet's real commit stream (what actually happened) ---------------

export interface CommitView {
  hash: string; // short hash
  subject: string; // ≤ 120 chars
  author: string;
  ts: number; // epoch ms
  repo: string; // human repo label, public
}

export interface GitPulse {
  available: boolean;
  repoUrl?: string; // public repo the commits live in
  repoLabel?: string;
  branch?: string;
  commits: CommitView[]; // newest first, capped
  lastFetch: number;
  /** The truthful per-repo sync/health inventory (gitfleet.ts, read-only).
   *  Optional for backward compatibility — null-free honesty inside each row. */
  fleet?: RepoFleetView[];
}

// ---- the repo fleet inventory: truthful per-repo sync state (gitfleet.ts) ----------------

export type RepoSyncState =
  | 'up-to-date'
  | 'behind'
  | 'ahead'
  | 'diverged'
  | 'dirty'
  | 'unreachable'
  | 'unknown';

export interface RepoFleetView {
  label: string;
  dir: string; // ok to expose — the learning wire already exposes it
  branch: string;
  available: boolean;
  head: string; // short sha, 7 chars; '' when the repo is unreachable
  upstreamConfigured: boolean;
  ahead: number | null; // null = not measured (never fake 0)
  behind: number | null; // null = not measured (never fake 0)
  diverged: boolean | null;
  dirtyCount: number | null; // null = not measured
  lastFetchAt: number | null; // epoch ms — .git/FETCH_HEAD mtime when present
  lastSyncError: string | null; // sanitized — never a URL, never a secret
  syncState: RepoSyncState;
}

export interface Snapshot {
  v: 1;
  status: ForemanStatus;
  crew: CrewMember[];
  agents: AgentView[];
  logs: Record<string, LogEntry[]>; // tail per agent
  tasks: Task[];
  decisions: Decision[];
  reports: Report[];
  feed: FeedItem[];
  goal?: Goal;
  books: BookView[];
  git?: GitPulse;
}
