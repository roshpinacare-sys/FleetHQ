/**
 * shift-history.ts — the office's operational-log transcriptor (stdlib only).
 *
 * WHY: the office runs on sockets and memory — every wall, log and task board
 * is ephemeral. The operator demanded a clean, tamper-proof history of every
 * completed shift. The office now journals its own events (log lines, task
 * transitions, goal events) into an append-only, git-backed journal
 * (Domain/agents/office-events.jsonl); THIS tool is the compiler that turns
 * that journal into human-readable receipts, every 60s:
 *
 *   receipts/shift-history-latest.md      ← the live shift, readable
 *   receipts/shift-history-history.jsonl  ← one line per COMPLETED shift
 *
 * EVERYTHING here is compiled from the office's own journal — gate verdicts
 * (relevance scores, cancellations, bounded redos, approvals), task boards,
 * per-worker activity. Nothing is invented; absence is reported as absence.
 *
 * Run: bun mini-services/agent-hq/tools/shift-history.ts  (supervised as a
 * child of the Next server tree by /api/foreman/health, like the watchdog)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const DOMAIN = path.join(ROOT, 'Domain');
const RECEIPTS = path.join(ROOT, 'receipts');
const JOURNAL = path.join(DOMAIN, 'agents', 'office-events.jsonl');
const JOURNAL_PREV = `${JOURNAL}.prev`;
const MEMORY = path.join(DOMAIN, 'agents', 'office-memory.json');
const HOST_MEM = path.join(RECEIPTS, 'host-mem.jsonl');
const LATEST_MD = path.join(RECEIPTS, 'shift-history-latest.md');
const HISTORY_JSONL = path.join(RECEIPTS, 'shift-history-history.jsonl');
const STATE_JSON = path.join(RECEIPTS, 'shift-history-state.json');

const TICK_MS = 60_000;
const JOURNAL_TAIL_LINES = 4000; // bounded read per tick
const HISTORY_MAX_LINES = 2000; // same law as telemetry history
const MD_MAX_BYTES = 120_000; // the latest.md never grows unbounded

const AGENT_NAMES: Record<string, string> = {
  aluf: 'אלוף (ראש-מטה)',
  tamar: 'תמר',
  erez: 'ארז',
  shachar: 'שחר',
  yarden: 'ירדן',
  gal: 'גל',
};

interface JournalEntry {
  ts: number;
  type: 'log' | 'task' | 'goal' | 'usage';
  agentId?: string;
  agent?: string | null;
  phase?: string | null;
  provider?: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_chars?: number;
  completion_chars?: number;
  kind?: string;
  text?: string;
  event?: string;
  id?: string;
  title?: string;
  status?: string;
  assignee?: string | null;
  origin?: string;
  summary?: string;
}

interface TaskState {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  lastTs: number;
  summary?: string;
}

interface UsageAgg {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  tokenReports: number; // how many calls the provider reported tokens for
  promptChars: number;
  completionChars: number;
}

interface ShiftStats {
  goalId: string;
  goalText: string;
  origin: string;
  startTs: number;
  endTs: number | null; // null = still open
  tasks: TaskState[];
  approvals: number;
  cancellations: number;
  redos: number;
  gateScores: number[];
  gateLines: string[];
  noEvidence: number;
  crossChecks: { confirm: number; dispute: number; skipped: number; lines: string[] };
  usage: UsageAgg;
  usageByAgent: Map<string, UsageAgg>;
  perAgent: Map<string, { lines: number; last?: { ts: number; text: string } }>;
}

function emptyUsage(): UsageAgg {
  return { calls: 0, promptTokens: 0, completionTokens: 0, tokenReports: 0, promptChars: 0, completionChars: 0 };
}

const CHAR_PER_TOKEN = 4; // honest fallback estimate when a provider omits usage

function addUsage(into: UsageAgg, e: JournalEntry) {
  into.calls += 1;
  into.promptChars += e.prompt_chars ?? 0;
  into.completionChars += e.completion_chars ?? 0;
  if (typeof e.prompt_tokens === 'number' || typeof e.completion_tokens === 'number') {
    into.tokenReports += 1;
    into.promptTokens += e.prompt_tokens ?? 0;
    into.completionTokens += e.completion_tokens ?? 0;
  }
}

function usageTotals(u: UsageAgg): { pt: number; ct: number; reported: boolean } {
  if (u.tokenReports > 0) return { pt: u.promptTokens, ct: u.completionTokens, reported: true };
  // no provider usage at all → char-based estimate, explicitly labeled as such
  return { pt: Math.round(u.promptChars / CHAR_PER_TOKEN), ct: Math.round(u.completionChars / CHAR_PER_TOKEN), reported: false };
}

function readJournalTail(): JournalEntry[] {
  const lines: string[] = [];
  // rotation awareness: if the live file is thin, prepend the tail of .prev
  try {
    const live = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
    lines.push(...live);
    if (lines.length < JOURNAL_TAIL_LINES / 4 && fs.existsSync(JOURNAL_PREV)) {
      const prev = fs.readFileSync(JOURNAL_PREV, 'utf8').split('\n').filter(Boolean);
      lines.unshift(...prev.slice(-JOURNAL_TAIL_LINES));
    }
  } catch {
    return []; // no journal yet — the office has not spoken since boot
  }
  const slice = lines.slice(-JOURNAL_TAIL_LINES);
  const out: JournalEntry[] = [];
  for (const l of slice) {
    try {
      out.push(JSON.parse(l) as JournalEntry);
    } catch {
      // a torn last line (crash mid-write) is skipped, never fatal
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function emptyStats(goal: JournalEntry, now: number): ShiftStats {
  return {
    goalId: goal.id ?? 'g?',
    goalText: goal.text ?? '(יעד לא ידוע)',
    origin: goal.origin ?? 'unknown',
    startTs: goal.ts,
    endTs: null,
    tasks: [],
    approvals: 0,
    cancellations: 0,
    redos: 0,
    gateScores: [],
    gateLines: [],
    noEvidence: 0,
    crossChecks: { confirm: 0, dispute: 0, skipped: 0, lines: [] },
    usage: emptyUsage(),
    usageByAgent: new Map(),
    perAgent: new Map(),
  };
}

const GATE_LINE = /relevance gate: ([\d.]+)/;
const CANCEL_LINE = /cancelled: (.+?) — לא מקדמת.*?relevance ([\d.]+)/;
const PLAN_FILTER_LINE = /plan filter: "(.+?)" נפסלה.*?relevance ([\d.]+)/;
const REDO_LINE = /redo \((\d)\/\d+\): (.+)/;
const APPROVED_LINE = /^approved: (.+)/;
const APPROVED_CAP_LINE = /^approved after (\d+) redos \(cap reached\)/;
const CROSS_CHECK_LINE = /^cross-check\((confirm|dispute)\): (.+)/;
const CROSS_CHECK_SKIP_LINE = /^cross-check skipped: (.+)/;
const GOAL_DERIVED_LINE = /plan unusable → goal-derived task \(fit: (\w+)\)/;
const NO_EVIDENCE_LINE = /ללא עדות כלים/;

function absorbLog(s: ShiftStats, e: JournalEntry) {
  const text = e.text ?? '';
  const agent = e.agentId ?? 'unknown';
  const slot = s.perAgent.get(agent) ?? { lines: 0 };
  slot.lines += 1;
  slot.last = { ts: e.ts, text: text.slice(0, 160) };
  s.perAgent.set(agent, slot);

  const gate = GATE_LINE.exec(text);
  if (gate) {
    s.gateScores.push(Number(gate[1]));
    s.gateLines.push(`relevance ${gate[1]} — ${agent}`);
    return;
  }
  const cancel = CANCEL_LINE.exec(text);
  if (cancel) {
    s.cancellations += 1;
    s.gateLines.push(`בוטלה: ${cancel[1].slice(0, 80)} (relevance ${cancel[2]})`);
    return;
  }
  const pf = PLAN_FILTER_LINE.exec(text);
  if (pf) {
    s.gateLines.push(`תכנון-סינון: "${pf[1].slice(0, 60)}" נפסלה (relevance ${pf[2]})`);
    return;
  }
  const redo = REDO_LINE.exec(text);
  if (redo) {
    s.redos += 1;
    s.gateLines.push(`redo ${redo[1]}/2: ${redo[2].slice(0, 80)}`);
    return;
  }
  const cap = APPROVED_CAP_LINE.exec(text);
  if (cap) {
    s.approvals += 1;
    s.gateLines.push(`אושרה אחרי ${cap[1]} redos (תקרה — אישור-כנות מתועד)`);
    return;
  }
  const ok = APPROVED_LINE.exec(text);
  if (ok) {
    s.approvals += 1;
    s.gateLines.push(`אושרה: ${ok[1].slice(0, 80)}`);
    return;
  }
  const cc = CROSS_CHECK_LINE.exec(text);
  if (cc) {
    if (cc[1] === 'dispute') s.crossChecks.dispute += 1;
    else s.crossChecks.confirm += 1;
    s.crossChecks.lines.push(`${cc[1].toUpperCase()} — ${cc[2].slice(0, 100)}`);
    return;
  }
  const ccs = CROSS_CHECK_SKIP_LINE.exec(text);
  if (ccs) {
    s.crossChecks.skipped += 1;
    s.crossChecks.lines.push(`SKIPPED — ${ccs[1].slice(0, 80)}`);
    return;
  }
  if (GOAL_DERIVED_LINE.test(text)) s.gateLines.push('תכנון נפל למשימה-נגזרת-יעד (fit fallback)');
  if (NO_EVIDENCE_LINE.test(text)) s.noEvidence += 1;
}

function absorbUsage(s: ShiftStats, e: JournalEntry) {
  addUsage(s.usage, e);
  const agent = e.agent ?? 'unknown';
  const slot = s.usageByAgent.get(agent) ?? emptyUsage();
  addUsage(slot, e);
  s.usageByAgent.set(agent, slot);
}

function buildShifts(entries: JournalEntry[]): { closed: ShiftStats[]; open: ShiftStats | null } {
  const goalSets = entries.filter((e) => e.type === 'goal' && e.event === 'set');
  if (!goalSets.length) return { closed: [], open: null };

  const closed: ShiftStats[] = [];
  for (let i = 0; i < goalSets.length - 1; i++) {
    const start = goalSets[i];
    const nextStart = goalSets[i + 1];
    const s = emptyStats(start, nextStart.ts);
    s.endTs = nextStart.ts;
    for (const e of entries) {
      if (e.ts < start.ts || e.ts >= nextStart.ts) continue;
      if (e.type === 'log') absorbLog(s, e);
      else if (e.type === 'task') absorbTask(s, e);
      else if (e.type === 'usage') absorbUsage(s, e);
    }
    closed.push(s);
  }
  // the open shift: last goal → now
  const last = goalSets[goalSets.length - 1];
  const open = emptyStats(last, Date.now());
  for (const e of entries) {
    if (e.ts < last.ts) continue;
    if (e.type === 'log') absorbLog(open, e);
    else if (e.type === 'task') absorbTask(open, e);
    else if (e.type === 'usage') absorbUsage(open, e);
  }
  return { closed, open };
}

function absorbTask(s: ShiftStats, e: JournalEntry) {
  if (!e.id) return;
  const existing = s.tasks.find((t) => t.id === e.id);
  if (existing) {
    if (e.title) existing.title = e.title;
    if (e.status) existing.status = e.status;
    if (e.assignee !== undefined) existing.assignee = e.assignee;
    if (e.summary) existing.summary = e.summary;
    existing.lastTs = e.ts;
  } else {
    s.tasks.push({
      id: e.id,
      title: e.title ?? '(ללא כותרת)',
      status: e.status ?? 'todo',
      assignee: e.assignee ?? null,
      lastTs: e.ts,
      ...(e.summary ? { summary: e.summary } : {}),
    });
  }
}

function fmtTs(ts: number): string {
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function dur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} דק'`;
  return `${Math.floor(m / 60)} שע' ${m % 60} דק'`;
}

function shiftSection(s: ShiftStats, open: boolean): string {
  const rows = s.tasks
    .map(
      (t) =>
        `| ${AGENT_NAMES[t.assignee ?? ''] ?? t.assignee ?? '—'} | ${t.title.slice(0, 90)} | ${t.status} |${t.summary ? ` ${t.summary.slice(0, 120)}` : ''} |`,
    )
    .join('\n');
  const board = s.tasks.length
    ? `| עובד | משימה | סטטוס | סיכום |\n|---|---|---|---|\n${rows}`
    : '_(אין משימות ביומן למשמרת זו — תכנון או משמרת ריקה)_';
  const avg = s.gateScores.length
    ? (s.gateScores.reduce((a, b) => a + b, 0) / s.gateScores.length).toFixed(2)
    : '—';
  const gate = s.gateLines.length
    ? s.gateLines.slice(-12).map((l) => `- ${l}`).join('\n')
    : '- (אין הכרעות-שער מתועדות)';
  const cross = s.crossChecks.lines.length
    ? s.crossChecks.lines.slice(-6).map((l) => `- ${l}`).join('\n')
    : '- (אין ביקורות-עמיתים מתועדות)';
  const u = usageTotals(s.usage);
  const usageLine =
    `קריאות ${s.usage.calls} · prompt ${u.pt}${u.reported ? '' : '~'} · completion ${u.ct}${u.reported ? '' : '~'} tokens` +
    `${u.reported ? '' : ' (אומדן מתווים — הספק לא דיווח)'}`;
  const effTokens = u.pt + u.ct;
  const effLine =
    s.approvals > 0
      ? `${effTokens.toLocaleString('en-US')}${u.reported ? '' : '~'} tokens · ${Math.round(effTokens / s.approvals).toLocaleString('en-US')}${u.reported ? '' : '~'} לאישור`
      : `${effTokens.toLocaleString('en-US')}${u.reported ? '' : '~'} tokens · אין אישורים עדיין — המדד יופיע באישור הראשון`;
  const usageByAgent = [...s.usageByAgent.entries()]
    .filter(([id]) => id !== 'aluf' && id !== 'unknown')
    .map(([id, ua]) => {
      const t = usageTotals(ua);
      return `- ${AGENT_NAMES[id] ?? id}: ${ua.calls} קריאות · ${t.pt}${t.reported ? '' : '~'}+${t.ct}${t.reported ? '' : '~'} tokens`;
    })
    .join('\n');
  const agents = [...s.perAgent.entries()]
    .filter(([id]) => id !== 'aluf')
    .map(([id, v]) => {
      const name = AGENT_NAMES[id] ?? id;
      return v.last
        ? `- ${name}: ${v.lines} שורות · אחרון: "${v.last.text.slice(0, 100)}"`
        : `- ${name}: ${v.lines} שורות`;
    })
    .join('\n');
  const status = open ? '🟢 פתוחה (חיה)' : '🔒 נסגרה';
  return [
    `## ${status}: ${s.goalText}`,
    ``,
    `- **מקור**: ${s.origin === 'commander' ? 'פקודת מפעיל' : s.origin === 'patrol' ? 'פטרול אוטונומי' : s.origin}`,
    `- **נפתחה**: ${fmtTs(s.startTs)}`,
    `- **${open ? 'באוויר' : 'נמשכה'}**: ${dur((s.endTs ?? Date.now()) - s.startTs)}`,
    `- **שער-ההתאמה**: אישורים ${s.approvals} · ביטולים ${s.cancellations} · redos ${s.redos} · ממוצע relevance ${avg}${s.noEvidence ? ` · ⚠ דוחות ללא-עדות-כלים: ${s.noEvidence}` : ''}`,
    `- **ביקורת-עמיתים**: confirm ${s.crossChecks.confirm} · dispute ${s.crossChecks.dispute} · skipped ${s.crossChecks.skipped}`,
    `- **צריכת-אמת**: ${usageLine}`,
    `- **יעילות-משמרת**: ${effLine}`,
    ``,
    `### לוח המשימות`,
    board,
    ``,
    `### ספר-השער (verdicts אחרונים)`,
    gate,
    ``,
    `### ביקורת-עמיתים (cross-check)`,
    cross,
    ``,
    `### צריכת-טוקנים לפי עובד`,
    usageByAgent || '- (אין מדידה במשמרת זו)',
    ``,
    `### פעילות עובדים`,
    agents || '- (אף עובד לא דיבר במשמרת זו)',
  ].join('\n');
}

function readMemory(): { shifts?: number; lessons?: string[]; economy?: Record<string, number> } {
  try {
    return JSON.parse(fs.readFileSync(MEMORY, 'utf8'));
  } catch {
    return {};
  }
}

function hostMemLast(): string {
  try {
    const lines = fs.readFileSync(HOST_MEM, 'utf8').trim().split('\n');
    const last = JSON.parse(lines[lines.length - 1]) as { avail_mb?: number; total_mb?: number; used_pct?: number };
    return `${last.avail_mb ?? '?'}MB פנויים מתוך ${last.total_mb ?? '?'}MB (${last.used_pct ?? '?'}% בשימוש)`;
  } catch {
    return 'אין מדידה';
  }
}

function atomicWrite(file: string, data: string) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, file);
}

function appendHistoryLine(line: object) {
  try {
    let lines: string[] = [];
    if (fs.existsSync(HISTORY_JSONL)) lines = fs.readFileSync(HISTORY_JSONL, 'utf8').split('\n').filter(Boolean);
    lines.push(JSON.stringify(line));
    if (lines.length > HISTORY_MAX_LINES) lines = lines.slice(-HISTORY_MAX_LINES);
    atomicWrite(HISTORY_JSONL, lines.join('\n') + '\n');
  } catch {
    // fail-soft
  }
}

function readHistoryLines(): Record<string, unknown>[] {
  try {
    return fs
      .readFileSync(HISTORY_JSONL, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null; // torn line — skipped, never fatal
        }
      })
      .filter((x): x is Record<string, unknown> => x !== null);
  } catch {
    return [];
  }
}

// ---- token-efficiency evaluator (owner directive, protocol 16, target 2) ----
// cost-per-task = verified token expenditure / completed work. HONESTY LAW:
// the strict fleet benchmark counts ONLY provider-reported tokens (the same
// rule the shift tables use); char-estimated shifts are shown but flagged
// with ~ and excluded from the benchmark — an estimate never becomes a fact.
type HistoryUsage = { calls?: number; prompt_tokens?: number; completion_tokens?: number; tokens_reported_by_provider?: boolean };

type EfficiencyRow = {
  goal: string;
  tokens: number | null; // verified (reported) total; null when the shift was estimate-only
  tokensAny: number; // reported or estimated — for display
  approvals: number;
  tasks: number;
  tasksDone: number;
  perApproval: number | null;
  reported: boolean;
};

function efficiencyOf(line: Record<string, unknown>): EfficiencyRow | null {
  const u = line.usage as HistoryUsage | undefined;
  const approvals = typeof line.approvals === 'number' ? (line.approvals as number) : 0;
  const tasks = Array.isArray(line.tasks) ? (line.tasks as unknown[]).length : 0;
  const tasksDone = Array.isArray(line.tasks)
    ? (line.tasks as { status?: string }[]).filter((t) => t && t.status === 'done').length
    : 0;
  if (!u) return null;
  const reported = u.tokens_reported_by_provider === true;
  const pt = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0;
  const ct = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;
  const total = pt + ct;
  if (!reported && total === 0) return null;
  return {
    goal: typeof line.goal === 'string' ? line.goal : '(יעד לא ידוע)',
    tokens: reported ? total : null,
    tokensAny: total,
    approvals,
    tasks,
    tasksDone,
    perApproval: reported && approvals > 0 ? Math.round(total / approvals) : null,
    reported,
  };
}

function fleetEfficiencyBenchmark(): string {
  const rows = readHistoryLines()
    .map(efficiencyOf)
    .filter((r): r is EfficiencyRow => r !== null);
  if (!rows.length) return '- (אין עדיין משמרות-סגורות עם מדידות מאומתות — המדד יופיע כשהן ייצברו)';
  const verified = rows.filter((r) => r.reported);
  const vTokens = verified.reduce((a, r) => a + (r.tokens ?? 0), 0);
  const vApprovals = verified.reduce((a, r) => a + r.approvals, 0);
  const vTasks = verified.reduce((a, r) => a + r.tasks, 0);
  const vDone = verified.reduce((a, r) => a + r.tasksDone, 0);
  const bench = vApprovals > 0 ? Math.round(vTokens / vApprovals) : null;
  const lines = [
    `- **מדד-היעילות (מאומת בלבד)**: ${bench !== null ? `${bench.toLocaleString('en-US')} tokens למשימה-מאושרת` : '— (אין אישורים במשמרות-המדודות)'} · ${vTokens.toLocaleString('en-US')} tokens על ${vApprovals} אישורים · משימות ${vTasks} (הושלמו ${vDone}) · משמרות-מדודות ${verified.length}/${rows.length}`,
    `- **עלות-משמרת**: ${verified.length ? `${Math.round(vTokens / verified.length).toLocaleString('en-US')} tokens למשמרת-שהושלמה` : '—'}`,
  ];
  const table = rows
    .slice(-5)
    .map(
      (r) =>
        `| ${r.goal.slice(0, 40)} | ${r.tokensAny.toLocaleString('en-US')}${r.reported ? '' : '~'} | ${r.approvals} | ${r.perApproval !== null ? r.perApproval.toLocaleString('en-US') : '—'} | ${r.tasksDone}/${r.tasks} |`,
    )
    .join('\n');
  lines.push('', `| משמרת | tokens | אישורים | tokens/אישור | הושלמו/משימות |`, `|---|---|---|---|---|`, table);
  lines.push('', '_~ = אומדן-תווים (הספק לא דיווח) — נכלל בתצוגה, נשלל מהמדד המאומת._');
  return lines.join('\n');
}

function readState(): { finalized: string[] } {
  try {
    const st = JSON.parse(fs.readFileSync(STATE_JSON, 'utf8')) as { finalized?: string[] };
    return { finalized: Array.isArray(st.finalized) ? st.finalized.slice(-100) : [] };
  } catch {
    return { finalized: [] };
  }
}

function writeState(st: { finalized: string[] }) {
  try {
    atomicWrite(STATE_JSON, JSON.stringify({ finalized: st.finalized.slice(-100) }));
  } catch {
    // fail-soft
  }
}

function compileMarkdown(open: ShiftStats | null, mem: ReturnType<typeof readMemory>): string {
  const economy = Object.entries(mem.economy ?? {})
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ');
  const lessons = (mem.lessons ?? []).slice(-4).map((l) => `- ${l}`).join('\n');
  const head = [
    `# 🗂️ יומן-משמרות — Shift History (LIVE)`,
    ``,
    `עודכן: ${new Date().toISOString()}`,
    ``,
    `**מקור**: יומן-אירועים append-only של המשרד (Domain/agents/office-events.jsonl, מגובה-גיט) — הכל נאסף מהיומן, כלום לא הומצא.`,
    ``,
    `---`,
    ``,
  ].join('\n');
  const openSection = open ? `${shiftSection(open, true)}\n\n---\n\n` : '_(המשרד עדיין לא פתח משמרת מאז האתחול)_\n\n';
  const sovereign = [
    `## מדדי-ריבון`,
    ``,
    `- **משמרות מצטברות**: ${mem.shifts ?? '?'} · לקחים שנצברו: ${(mem.lessons ?? []).length}`,
    `- **זיכרון-מארח**: ${hostMemLast()}`,
    `- **כלכלת-הצוות**: ${economy || 'אין נתונים'}`,
    ``,
    `### מדד-יעילות-הציי (cost-per-task על משמרות-סגורות)`,
    fleetEfficiencyBenchmark(),
    ``,
    `### לקחים אחרונים`,
    lessons || '- (אין)',
  ].join('\n');
  let md = `${head}${openSection}${sovereign}\n`;
  if (Buffer.byteLength(md) > MD_MAX_BYTES) md = `${md.slice(0, MD_MAX_BYTES)}\n…(קטוץ — חוק-התקרה ${MD_MAX_BYTES}B)\n`;
  return md;
}

function tick() {
  const entries = readJournalTail();
  const { open } = buildShifts(entries);
  const mem = readMemory();
  atomicWrite(LATEST_MD, compileMarkdown(open, mem));

  // finalize closed shifts not yet recorded (dedupe by goal id)
  const state = readState();
  const goalSets = entries.filter((e) => e.type === 'goal' && e.event === 'set');
  if (goalSets.length > 1) {
    for (let i = 0; i < goalSets.length - 1; i++) {
      const g = goalSets[i];
      if (!g.id || state.finalized.includes(g.id)) continue;
      const nextStart = goalSets[i + 1];
      const s = emptyStats(g, nextStart.ts);
      s.endTs = nextStart.ts;
      for (const e of entries) {
        if (e.ts < g.ts || e.ts >= nextStart.ts) continue;
        if (e.type === 'log') absorbLog(s, e);
        else if (e.type === 'task') absorbTask(s, e);
        else if (e.type === 'usage') absorbUsage(s, e);
      }
      const ut = usageTotals(s.usage);
      appendHistoryLine({
        at: new Date(s.endTs ?? Date.now()).toISOString(),
        goal_id: s.goalId,
        goal: s.goalText,
        origin: s.origin,
        duration_min: Math.round(((s.endTs ?? Date.now()) - s.startTs) / 60_000),
        tasks: s.tasks.map((t) => ({ title: t.title.slice(0, 100), status: t.status, assignee: t.assignee })),
        approvals: s.approvals,
        cancellations: s.cancellations,
        redos: s.redos,
        avg_relevance: s.gateScores.length
          ? Math.round((s.gateScores.reduce((a, b) => a + b, 0) / s.gateScores.length) * 100) / 100
          : null,
        no_evidence_flags: s.noEvidence,
        cross_checks: { confirm: s.crossChecks.confirm, dispute: s.crossChecks.dispute, skipped: s.crossChecks.skipped },
        usage: {
          calls: s.usage.calls,
          prompt_tokens: ut.pt,
          completion_tokens: ut.ct,
          tokens_reported_by_provider: ut.reported,
          tokens_total: ut.pt + ut.ct,
          tokens_per_approval: ut.reported && s.approvals > 0 ? Math.round((ut.pt + ut.ct) / s.approvals) : null,
        },
        tasks_total: s.tasks.length,
        tasks_done: s.tasks.filter((t) => t.status === 'done').length,
        speakers: [...s.perAgent.keys()],
      });
      state.finalized.push(g.id);
    }
    writeState(state);
  }
}

function main() {
  fs.mkdirSync(RECEIPTS, { recursive: true });
  const run = () => {
    try {
      tick();
    } catch (e) {
      console.error(`[shift-history] tick failed: ${(e as Error).message}`);
    }
  };
  run(); // first compile immediately — a receipt exists within the first second
  setInterval(run, TICK_MS);
  console.log(`[shift-history] transcriptor up — every ${TICK_MS / 1000}s → receipts/shift-history-latest.md`);
}

main();
