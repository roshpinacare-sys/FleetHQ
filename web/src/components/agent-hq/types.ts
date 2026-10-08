// Client-side mirror of the Fleet HQ wire protocol.
export type AgentState =
  | 'idle' | 'thinking' | 'reading' | 'checking' | 'writing'
  | 'walking' | 'waiting_user' | 'blocked' | 'done' | 'error';

export type Station = 'desk' | 'wall' | 'podium' | 'library' | 'offstage';

export interface CrewMember {
  id: string;
  name: { he: string; en: string };
  title: { he: string; en: string };
  color: string;
  specialty: { he: string; en: string };
  books: string[];
  role: 'lead' | 'worker';
}

export interface AgentView {
  id: string;
  state: AgentState;
  activity: string;
  station: Station;
  taskId?: string;
  since: number;
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

export type FeedKind = 'goal' | 'plan' | 'task' | 'message' | 'decision' | 'report' | 'system' | 'error' | 'user' | 'git';

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
  progress: number;
  createdAt: number;
  updatedAt: number;
  origin?: 'commander' | 'patrol';
}

export interface BookView {
  id: string;
  file: string;
  title: { he: string; en: string };
  category: { he: string; en: string };
  bytes: number;
  heartbeat?: number;
  ageHours?: number;
  ok?: boolean;
  verdict?: string;
  owner?: string;
}

export interface ForemanStatus {
  backend: 'live' | 'sim';
  llmProvider: string;
  message: { he: string; en: string };
  startedAt: number;
  opsDone: number;
}

export interface CommitView {
  hash: string;
  subject: string;
  author: string;
  ts: number;
  repo: string;
  branch?: string;
}

export interface GitPulse {
  available: boolean;
  repoUrl?: string;
  repoLabel?: string;
  branch?: string;
  commits: CommitView[];
  lastFetch: number;
}

export interface Snapshot {
  v: 1;
  status: ForemanStatus;
  crew: CrewMember[];
  agents: AgentView[];
  logs: Record<string, LogEntry[]>;
  tasks: Task[];
  decisions: Decision[];
  reports: Report[];
  feed: FeedItem[];
  goal?: Goal;
  books: BookView[];
  git?: GitPulse;
}

export const STATE_COLORS: Record<AgentState, string> = {
  idle: '#71717a',
  thinking: '#E0973F',
  reading: '#3BA08F',
  checking: '#C9A227',
  writing: '#7BA05B',
  walking: '#a1a1aa',
  waiting_user: '#e5484d',
  blocked: '#e5484d',
  done: '#46a758',
  error: '#e5484d',
};
