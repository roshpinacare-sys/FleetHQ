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
  | 'user';

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
}
