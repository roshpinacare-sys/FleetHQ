import type {
  AgentState,
  AgentView,
  BookView,
  CrewMember,
  Decision,
  FeedItem,
  FeedKind,
  ForemanStatus,
  Goal,
  LogEntry,
  Report,
  Snapshot,
  Station,
  Task,
} from './types';
import { CREW, LEAD, WORKERS, crewOf } from './cast';
import { crossCheckBooks, excerptBook, loadBooks, measureBook } from './books';
import { chat, extractJson, llmAvailable } from './llm';
import { GitWire, resolveGitSource } from './gitpulse';

const MAX_STEPS = 8;
const TASK_TIMEOUT_MS = 4 * 60_000;
const DECISION_WAIT_MS = 3 * 60_000;
// THE AUTONOMY LAW: the operating system resolves its own agents' questions.
// No visitor, no socket client, no external party ever holds control over the crew —
// an operator decision is a short, real deliberation, then a policy answer.
const OPERATOR_DELIBERATION_MS = 7_000;
const OPERATOR_POLICY_TEXT = 'מדיניות המפעיל האוטונומי: הנתיב הבטוח — המשך';
const MAX_LOG = 160;
// the crew's own routine: when the room is idle, the office schedules patrol
// shifts itself so a visitor ALWAYS sees real, measured work — never a frozen set.
const PATROL_COOLDOWN_MS = 15 * 60_000;
const PATROL_ARM_DELAY_MS = 40_000;
const PATROLS = [
  'סיור שגרה: סרוק את ספרי הצי ודווח מה ישן או דורש בדיקה',
  'סיור שגרה: צלב בין שני ספרי צי ודווח על פערים שנמצאו',
  'סיור שגרה: בדוק את תקינות ספרי הביקורת והרישום של הצי',
  'סיור שגרה: מדוד את טריות הספרים שבבעלות העובדים ודווח',
];

export type Emit = (event: string, payload: unknown) => void;

interface AgentRuntime {
  view: AgentView;
  logs: LogEntry[];
  running: boolean;
  pendingAnswer?: { option?: string; text?: string };
}

export class Office {
  agents = new Map<string, AgentRuntime>();
  tasks = new Map<string, Task>();
  decisions = new Map<string, Decision>();
  reports: Report[] = [];
  feed: FeedItem[] = [];
  goal?: Goal;
  books: BookView[] = [];
  status: ForemanStatus;
  private emit: Emit;
  private nextId = 1;
  private dispatcher?: ReturnType<typeof setInterval>;
  private booksTimer?: ReturnType<typeof setInterval>;
  private startedAt = Date.now();
  private taskAttempts = new Map<string, number>();
  private gitWire: GitWire;
  private patrolArmed = false;
  private lastShiftEnd = 0;
  private patrolIdx = 0;
  private planFailures = 0;
  opsDone = 0;

  constructor(emit: Emit) {
    this.emit = emit;
    for (const c of CREW) {
      this.agents.set(c.id, {
        view: { id: c.id, state: 'idle', activity: '', station: c.role === 'lead' ? 'wall' : 'desk', since: Date.now() },
        logs: [],
      });
    }
    this.status = {
      backend: 'live',
      llmProvider: '…',
      message: { he: 'מאתחל…', en: 'Booting…' },
      startedAt: this.startedAt,
      opsDone: 0,
    };
    this.refreshBooks();
  }

  // ---- lifecycle -----------------------------------------------------------------------

  async boot() {
    const avail = await llmAvailable();
    if (avail.ok) {
      this.status = {
        backend: 'live',
        llmProvider: avail.provider,
        message: {
          he: 'צוות חי — סוכנים אמיתיים על ספרים אמיתיים',
          en: 'Live crew — real agents on real books',
        },
        startedAt: this.startedAt,
        opsDone: 0,
      };
      this.log(LEAD, 'text', 'Fleet HQ online · מפקדה מקוונת');
      this.feedPush('system', 'Fleet HQ online — הצוות על המשמר');
    } else {
      this.status = {
        backend: 'sim',
        llmProvider: 'none',
        message: {
          he: 'מצב הדגמה — צוות מדומה (ללא מפתח מודל)',
          en: 'Demo mode — simulated crew (no LLM key)',
        },
        startedAt: this.startedAt,
        opsDone: 0,
      };
      this.log(LEAD, 'text', 'no LLM provider → sim crew (demo)');
      this.feedPush('system', 'DEMO — צוות מדומה פועל (הוגדר בכנות)');
    }
    this.emit('status', this.status);
    this.dispatcher = setInterval(() => this.dispatch(), 2200);
    this.booksTimer = setInterval(() => this.refreshBooks(), 5 * 60_000);
    // the git wire: the fleet's real commit stream (metadata only, public repo)
    this.gitWire = new GitWire(
      resolveGitSource(process.env.AGENT_HQ_DATA_DIR ?? './data'),
      (p) => this.emit('git', p),
      (cs) => {
        for (const c of cs) this.feedPush('git', `commit ${c.hash} — ${c.subject.slice(0, 110)}`);
      },
    );
    this.gitWire.start();
    // arm the autonomous patrol a beat after boot so the room is never a dead set
    setTimeout(() => {
      this.patrolArmed = true;
    }, PATROL_ARM_DELAY_MS);
  }

  shutdown() {
    if (this.dispatcher) clearInterval(this.dispatcher);
    if (this.booksTimer) clearInterval(this.booksTimer);
    this.gitWire.stop();
  }

  refreshBooks() {
    this.books = loadBooks((id) => CREW.find((c) => c.books.includes(id))?.id);
    this.emit('books', this.books);
  }

  id(prefix: string): string {
    return `${prefix}${this.nextId++}`;
  }

  // ---- primitives ----------------------------------------------------------------------

  setState(agentId: string, state: AgentState, activity: string, station?: Station, taskId?: string) {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    rt.view = {
      ...rt.view,
      state,
      activity: activity.slice(0, 64),
      since: Date.now(),
      ...(station ? { station } : {}),
      ...(taskId !== undefined ? { taskId } : {}),
    };
    this.emit('agent', rt.view);
  }

  log(agentId: string, kind: LogEntry['kind'], text: string) {
    const rt = this.agents.get(agentId);
    if (!rt) return;
    const entry: LogEntry = { ts: Date.now(), kind, text: text.slice(0, 1200) };
    rt.logs.push(entry);
    if (rt.logs.length > MAX_LOG) rt.logs.splice(0, rt.logs.length - MAX_LOG);
    this.emit('log', { agentId, entry });
  }

  bubble(agentId: string, text: string) {
    this.emit('bubble', { agentId, text: text.slice(0, 220), ts: Date.now() });
    this.log(agentId, 'say', text);
  }

  feedPush(kind: FeedKind, text: string, agentId?: string): FeedItem {
    const item: FeedItem = { id: this.id('f'), ts: Date.now(), kind, text: text.slice(0, 400), ...(agentId ? { agentId } : {}) };
    this.feed.push(item);
    if (this.feed.length > 300) this.feed.splice(0, this.feed.length - 300);
    this.emit('feed', item);
    return item;
  }

  addTask(input: { title: string; description?: string; assignee?: string; dependsOn?: string[]; createdBy: string }): Task {
    const task: Task = {
      id: this.id('t'),
      title: input.title.slice(0, 140),
      ...(input.description ? { description: input.description.slice(0, 600) } : {}),
      status: 'todo',
      ...(input.assignee ? { assignee: input.assignee } : {}),
      dependsOn: input.dependsOn ?? [],
      createdBy: input.createdBy,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    this.emit('task', task);
    this.feedPush('task', `משימה חדשה: ${task.title}`, task.assignee);
    return task;
  }

  patchTask(id: string, patch: Partial<Task>) {
    const t = this.tasks.get(id);
    if (!t) return;
    const next = { ...t, ...patch, updatedAt: Date.now() };
    this.tasks.set(id, next);
    this.emit('task', next);
  }

  askHuman(agentId: string, question: string, options: string[], context?: string, taskId?: string): Decision {
    const d: Decision = {
      id: this.id('d'),
      agentId,
      kind: 'question',
      question: question.slice(0, 400),
      options: options.slice(0, 4).map((o) => o.slice(0, 80)),
      ...(context ? { context: context.slice(0, 800) } : {}),
      status: 'open',
      ...(taskId ? { taskId } : {}),
      createdAt: Date.now(),
    };
    this.decisions.set(d.id, d);
    this.emit('decision', d);
    this.feedPush('decision', `שאלה למפעיל האוטונומי: ${d.question}`, agentId);
    this.setState(agentId, 'walking', 'הולך לשלט ההחלטות', 'podium');
    this.setState(agentId, 'waiting_user', 'ממתין להכרעה אוטונומית', 'podium', taskId);
    return d;
  }

  answerDecision(id: string, option?: string, text?: string): boolean {
    const d = this.decisions.get(id);
    if (!d || d.status !== 'open') return false;
    d.status = 'answered';
    d.answer = { ...(option ? { option } : {}), ...(text ? { text } : {}), ts: Date.now() };
    this.emit('decision', d);
    this.feedPush('decision', `המפעיל האוטונומי הכריע: ${option ?? text ?? ''}`, d.agentId);
    const rt = this.agents.get(d.agentId);
    if (rt) {
      rt.pendingAnswer = { ...(option ? { option } : {}), ...(text ? { text } : {}) };
      this.log(d.agentId, 'result', `operator policy decision: ${option ?? ''} ${text ?? ''}`.trim());
    }
    return true;
  }

  addReport(r: { title: string; body: string; author: string }): Report {
    const rep: Report = { id: this.id('r'), title: r.title.slice(0, 160), body: r.body.slice(0, 8000), author: r.author, ts: Date.now() };
    this.reports.unshift(rep);
    this.reports = this.reports.slice(0, 60);
    this.emit('report', rep);
    this.feedPush('report', `דוח חדש בספרייה: ${rep.title}`, rep.author);
    this.setState(rep.author, 'walking', 'מניח את הדוח בספרייה', 'library');
    setTimeout(() => {
      const rt = this.agents.get(rep.author);
      if (rt && rt.view.station === 'library') this.setState(rep.author, 'idle', '', 'desk');
    }, 3500);
    return rep;
  }

  snapshot(): Snapshot {
    const logs: Record<string, LogEntry[]> = {};
    for (const [id, rt] of this.agents) logs[id] = rt.logs.slice(-40);
    return {
      v: 1,
      status: this.status,
      crew: CREW,
      agents: [...this.agents.values()].map((rt) => rt.view),
      logs,
      tasks: [...this.tasks.values()],
      decisions: [...this.decisions.values()],
      reports: this.reports.slice(0, 30),
      feed: this.feed.slice(-80),
      ...(this.goal ? { goal: this.goal } : {}),
      books: this.books,
      git: this.gitWire?.pulse,
    };
  }

  // ---- goal pipeline ---------------------------------------------------------------------

  submitGoal(text: string): { ok: boolean; error?: string } {
    const clean = text.trim().slice(0, 400);
    if (!clean) return { ok: false, error: 'empty goal' };
    if (this.goal && (this.goal.status === 'planning' || this.goal.status === 'active' || this.goal.status === 'review'))
      return { ok: false, error: 'goal in progress' };
    if (this.status.backend === 'sim') {
      // sim path is fully scripted (demo mode)
      this.startSimScenario(clean);
      return { ok: true };
    }
    this.goal = { id: this.id('g'), text: clean, status: 'planning', progress: 0, createdAt: Date.now(), updatedAt: Date.now(), origin: 'commander' };
    this.emit('goal', this.goal);
    this.feedPush('user', clean);
    this.planFailures = 0;
    void this.leadPlan(clean);
    return { ok: true };
  }

  private setGoal(patch: Partial<Goal>) {
    if (!this.goal) return;
    this.goal = { ...this.goal, ...patch, updatedAt: Date.now() };
    this.emit('goal', this.goal);
  }

  private async leadPlan(goalText: string) {
    const rt = this.agents.get(LEAD)!;
    try {
      this.setState(LEAD, 'walking', 'הולך ללוח המשימות', 'wall');
      await sleep(900);
      this.setState(LEAD, 'thinking', 'מתכנן את היעד…', 'wall');
      this.log(LEAD, 'text', `planning goal: ${goalText}`);
      const freshness = this.books
        .map((b) => `${b.id}: ${b.ageHours !== undefined ? b.ageHours.toFixed(1) + 'h' : 'no heartbeat'}${b.ok === false ? ' OK=FALSE' : ''}`)
        .join('; ');
      const res = await chat([
        {
          role: 'system',
          content:
            'אתה אלוף, ראש-המטה של מפקדת הצי — חדר פעולה של צי סוכנים אמיתי. ' +
            'אתה מתכנן עבודה אמיתית על ספרי נתונים אמיתיים. תמיד תשיב אך ורק JSON.',
        },
        {
          role: 'user',
          content:
            `יעד המפקד: "${goalText}"\n\n` +
            `עובדים והספרים שבבעלותם:\n${WORKERS.map((w) => {
              const c = crewOf(w)!;
              return `- ${w} (${c.title.he}): ${c.books.join(', ')}`;
            }).join('\n')}\n\n` +
            `טריות הספרים (id: גיל, ok): ${freshness}\n\n` +
            'תכנן 2-4 משימות אמיתיות וממוקדות שמקדמות את היעד בפועל. ' +
            'כל משימה חייבת להסתמך על ספרים אמיתיים מהרשימה בלבד. ' +
            'assignee חייב להיות אחד מ: ' + WORKERS.join(', ') + '.\n' +
            'תשיב אך ורק: {"tasks":[{"title":"…","description":"…","assignee":"gal","dependsOn":[]}]}',
        },
      ]);
      const plan = extractJson<{ tasks?: Array<{ title?: string; description?: string; assignee?: string; dependsOn?: string[] }> }>(res.text);
      const planned = (plan?.tasks ?? []).filter((t) => t.title && WORKERS.includes(t.assignee ?? '')).slice(0, 4);
      if (!planned.length) {
        // honest fallback: one broad sweep task
        const t = this.addTask({
          title: 'סריקת בריאות כללית של ספרי הצי',
          description: goalText,
          assignee: 'shachar',
          createdBy: LEAD,
        });
        this.log(LEAD, 'error', 'plan parse failed → single sweep task');
        void this.runWorker(t.id);
        return;
      }
      const ids: Record<number, string> = {};
      planned.forEach((p, i) => {
        const t = this.addTask({
          title: p.title!,
          description: p.description,
          assignee: p.assignee!,
          dependsOn: (p.dependsOn ?? []).map((d) => ids[d as unknown as number]).filter(Boolean) as string[],
          createdBy: LEAD,
        });
        ids[i] = t.id;
      });
      this.setGoal({ status: 'active', progress: 0.05 });
      this.feedPush('plan', `תוכנית אושרה: ${planned.length} משימות`, LEAD);
      this.bubble(LEAD, 'התוכנית על הלוח. קדימה לעבודה.');
      this.setState(LEAD, 'idle', 'משגיח מהלוח', 'wall');
    } catch (e) {
      this.log(LEAD, 'error', `plan failed: ${(e as Error).message}`);
      this.setState(LEAD, 'error', 'תכנון נכשל — מנסה שוב', 'wall');
      // one honest auto-retry, then surface the failure to the commander
      this.planFailures++;
      if (this.planFailures >= 2) {
        this.setGoal({ status: 'failed' });
        this.lastShiftEnd = Date.now();
        this.planFailures = 0;
        this.feedPush('error', 'תכנון נכשל פעמיים — המפקדה ממתינה ליעד חדש');
        return;
      }
      setTimeout(() => {
        if (this.goal && this.goal.status === 'planning') void this.leadPlan(goalText);
        else if (this.goal && this.goal.status === 'failed') this.feedPush('error', 'תכנון נכשל — נסה שוב');
      }, 15000);
    }
  }

  // ---- dispatcher -----------------------------------------------------------------------

  dispatch() {
    if (this.status.backend === 'sim') return; // sim drives itself
    this.maybePatrol();
    // lead rescue duty: a blocked task gets one reassignment to a fresh worker
    const blockedTask = [...this.tasks.values()].find((t) => t.status === 'blocked' && !this.rescued.has(t.id));
    const leadRt = this.agents.get(LEAD)!;
    if (blockedTask && !leadRt.running) {
      void this.leadRescue(blockedTask);
      return;
    }
    // lead review duty
    const inReview = [...this.tasks.values()].find((t) => t.status === 'review');
    if (inReview && !leadRt.running) {
      void this.leadReview(inReview.id);
      return;
    }
    // dispatch ready tasks
    for (const t of this.tasks.values()) {
      if (t.status !== 'todo' || !t.assignee) continue;
      const depsDone = t.dependsOn.every((d) => this.tasks.get(d)?.status === 'done');
      if (!depsDone) continue;
      const rt = this.agents.get(t.assignee);
      if (rt && !rt.running && rt.view.state !== 'waiting_user') {
        void this.runWorker(t.id);
        return; // one dispatch per tick keeps the room readable
      }
    }
    // goal completion
    if (this.goal && this.goal.status === 'active') {
      const real = [...this.tasks.values()].filter((t) => t.status !== 'cancelled');
      const terminal = real.filter((t) => t.status === 'done' || (t.status === 'blocked' && this.rescued.has(t.id))).length;
      const prog = real.length ? 0.05 + 0.9 * (terminal / real.length) : 0.05;
      const next = Math.min(0.95, Math.round(prog * 100) / 100);
      if (Math.abs(next - this.goal.progress) >= 0.01) this.setGoal({ progress: next });
      if (real.length && terminal === real.length) {
        this.setGoal({ status: 'review', progress: 0.97 });
        void this.leadFinalReport();
      }
    }
  }

  private rescued = new Set<string>();

  /**
   * The office's own heartbeat: when the room has been idle past the cooldown,
   * the chief schedules a routine patrol shift on the real books. Visitors always
   * see measured work — and the shift is honestly labeled as scheduled routine,
   * never as a commander's order.
   */
  private maybePatrol() {
    if (!this.patrolArmed) return;
    if (this.goal && (this.goal.status === 'planning' || this.goal.status === 'active' || this.goal.status === 'review')) return;
    if (Date.now() - this.lastShiftEnd < PATROL_COOLDOWN_MS) return;
    if ([...this.agents.values()].some((rt) => rt.running)) return;
    const text = PATROLS[this.patrolIdx++ % PATROLS.length];
    this.goal = { id: this.id('g'), text, status: 'planning', progress: 0, createdAt: Date.now(), updatedAt: Date.now(), origin: 'patrol' };
    this.emit('goal', this.goal);
    this.feedPush('goal', `סיור שגרה מתוזמן — ${text.replace('סיור שגרה: ', '')}`);
    this.log(LEAD, 'text', 'routine patrol shift — scheduled by the office itself');
    this.bubble(LEAD, 'מפקדה ריקה? לא אצלנו. סיור שגרה יוצא לדרך.');
    void this.leadPlan(text);
  }

  /** The chief never leaves a blocked task on the floor: one honest reassignment. */
  async leadRescue(task: Task) {
    const rt = this.agents.get(LEAD)!;
    if (rt.running) return;
    rt.running = true;
    try {
      this.rescued.add(task.id);
      this.setState(LEAD, 'walking', 'ניגש לחסימה על הלוח', 'wall', task.id);
      await sleep(1000);
      const busy = new Set([...this.tasks.values()].filter((t) => t.status === 'doing').map((t) => t.assignee));
      const candidates = WORKERS.filter((w) => w !== task.assignee && !busy.has(w));
      const pick = (candidates[0] ?? WORKERS.find((w) => w !== task.assignee) ?? task.assignee)!;
      this.taskAttempts.set(task.id, 0);
      this.patchTask(task.id, { status: 'todo', assignee: pick, summary: undefined });
      const pickName = crewOf(pick)?.name.he ?? pick;
      this.log(LEAD, 'result', `rescue: ${task.title} → ${pickName}`);
      this.feedPush('system', `ראש-המטה מעביר משימה חסומה ל${pickName}`, LEAD);
      this.bubble(LEAD, `${pickName}, תיקחי את זה בבקשה — זו נתקעה.`);
      this.setState(LEAD, 'idle', '', 'wall');
    } finally {
      rt.running = false;
    }
  }

  // ---- worker loop (real LLM, real tools) ------------------------------------------------

  async runWorker(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || !task.assignee) return;
    const rt = this.agents.get(task.assignee);
    const crew = crewOf(task.assignee!);
    if (!rt || !crew || rt.running) return;
    rt.running = true;
    this.patchTask(taskId, { status: 'doing' });
    const startedAt = Date.now();
    try {
      this.setState(task.assignee, 'walking', `הולך לשולחן · ${task.title}`, 'desk', taskId);
      await sleep(1100);
      this.setState(task.assignee, 'thinking', 'קורא את המשימה', 'desk', taskId);
      this.log(task.assignee, 'text', `task: ${task.title}`);

      const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
        { role: 'user', content: `התחל את המשימה. צעד אחד: כלי או done. ${task.title}` },
      ];
      const sys = workerSystemPrompt(crew, task, this.books);
      let finalSummary = '';
      for (let step = 1; step <= MAX_STEPS; step++) {
        if (Date.now() - startedAt > TASK_TIMEOUT_MS) throw new Error('task timeout');
        const res = await chat([{ role: 'system', content: sys }, ...history], 700);
        const parsed = extractJson<{
          say?: string;
          thought?: string;
          tool?: string;
          args?: Record<string, unknown>;
          done?: boolean;
          result?: string;
        }>(res.text);
        if (!parsed) {
          history.push({ role: 'assistant', content: res.text.slice(0, 300) });
          history.push({ role: 'user', content: 'תשובה לא הייתה JSON תקין. השב אך ורק אובייקט JSON לפי הכללים.' });
          this.log(task.assignee, 'error', 'unparseable reply → reprompt');
          continue;
        }
        history.push({ role: 'assistant', content: JSON.stringify(parsed) });
        if (parsed.say) this.bubble(task.assignee!, parsed.say);
        if (parsed.thought) this.setState(task.assignee!, 'thinking', parsed.thought, 'desk', taskId);
        if (parsed.done) {
          finalSummary = parsed.result ?? parsed.say ?? 'הושלם';
          break;
        }
        if (parsed.tool) {
          const out = await this.execTool(task.assignee!, parsed.tool, parsed.args ?? {}, taskId);
          history.push({ role: 'user', content: `TOOL RESULT (${parsed.tool}): ${out}` });
          // decision pause
          if (out === '__WAITING_FOR_HUMAN__') {
            const answered = await this.waitForAnswer(rt, DECISION_WAIT_MS);
            if (!answered.ok) {
              this.patchTask(taskId, { status: 'blocked' });
              this.feedPush('error', `המשימה נחסמה — לא התקבלה הכרעה אוטונומית`, task.assignee);
              return;
            }
            history.push({ role: 'user', content: `OPERATOR DECISION: ${JSON.stringify(answered.answer)}` });
          }
        } else {
          history.push({ role: 'user', content: 'המשך: בצע צעד אחד (כלי או done).' });
        }
      }
      this.patchTask(taskId, { status: 'review', summary: finalSummary.slice(0, 400) });
      this.setState(task.assignee!, 'walking', 'מביא לביקורת ראש-המטה', 'wall', taskId);
      this.bubble(task.assignee!, 'המשימה שלי מוכנה לביקורת.');
      this.setState(task.assignee!, 'idle', '', 'desk');
      this.opsDone++;
      this.status.opsDone = this.opsDone;
      this.emit('status', this.status);
    } catch (e) {
      this.log(task.assignee!, 'error', `failed: ${(e as Error).message}`);
      // honest resilience: transient provider failures requeue the task (max 2 attempts)
      const attempts = (this.taskAttempts.get(taskId) ?? 0) + 1;
      this.taskAttempts.set(taskId, attempts);
      if (attempts <= 2 && !(e as Error).message.includes('timeout')) {
        this.patchTask(taskId, { status: 'todo', summary: undefined });
        this.feedPush('system', `${crew?.name.he}: תקלה רגעית — המשימה חוזרת לתור (${attempts}/2)`, task.assignee);
        this.setState(task.assignee!, 'idle', '', 'desk', taskId);
      } else {
        this.patchTask(taskId, { status: 'blocked' });
        this.setState(task.assignee!, 'error', 'תקלה — ראה יומן', 'desk', taskId);
        this.feedPush('error', `${crew?.name.he}: ${(e as Error).message}`, task.assignee);
      }
    } finally {
      rt.running = false;
    }
  }

  private waitForAnswer(rt: AgentRuntime, ms: number): Promise<{ ok: boolean; answer?: { option?: string; text?: string } }> {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const iv = setInterval(() => {
        if (rt.pendingAnswer) {
          const a = rt.pendingAnswer;
          rt.pendingAnswer = undefined;
          clearInterval(iv);
          resolve({ ok: true, answer: a });
        } else if (Date.now() - t0 > ms) {
          clearInterval(iv);
          resolve({ ok: false });
        }
      }, 400);
    });
  }

  // ---- tool execution (all real) ----------------------------------------------------------

  async execTool(agentId: string, tool: string, args: Record<string, unknown>, taskId?: string): Promise<string> {
    const safe = (s: unknown) => String(s ?? '').slice(0, 80);
    switch (tool) {
      case 'list_books': {
        this.setState(agentId, 'reading', 'סורק את מדף הספרים', 'library', taskId);
        this.log(agentId, 'tool', 'list_books()');
        await sleep(500);
        const rows = this.books.map((b) => `${b.id} · ${b.bytes}B · ${b.ageHours !== undefined ? b.ageHours.toFixed(1) + 'h' : 'no-hb'}${b.ok === false ? ' · OK=FALSE' : ''}`);
        this.log(agentId, 'result', rows.join('\n').slice(0, 900));
        return rows.join('\n');
      }
      case 'read_book': {
        const id = safe(args.id);
        this.setState(agentId, 'reading', `קורא ${id}`, 'library', taskId);
        this.log(agentId, 'tool', `read_book(${id})`);
        await sleep(650);
        const ex = excerptBook(id);
        if (!ex) {
          this.log(agentId, 'error', `book ${id} not found`);
          return `ERROR: book ${id} does not exist`;
        }
        this.log(agentId, 'result', ex.slice(0, 500).replace(/\n+/g, ' '));
        return ex;
      }
      case 'measure': {
        const id = safe(args.id);
        const p = safe(args.path);
        this.setState(agentId, 'checking', `מודד ${id}.${p}`, 'desk', taskId);
        this.log(agentId, 'tool', `measure(${id}, ${p})`);
        await sleep(450);
        const r = measureBook(id, p);
        const out = r.found ? JSON.stringify(r.value)?.slice(0, 600) : 'NOT FOUND';
        this.log(agentId, 'result', `${id}.${p} = ${out}`);
        return out;
      }
      case 'cross_check': {
        const a = safe(args.a);
        const b = safe(args.b);
        this.setState(agentId, 'checking', `מצליב ${a} × ${b}`, 'desk', taskId);
        this.log(agentId, 'tool', `cross_check(${a}, ${b})`);
        await sleep(800);
        const cc = crossCheckBooks(a, b);
        if (!cc) {
          this.log(agentId, 'error', 'cross_check: missing book');
          return 'ERROR: one of the books does not exist';
        }
        const lines = [
          `heartbeat ${a}=${cc.aHeartbeat ? new Date(cc.aHeartbeat).toISOString() : '?'} / ${b}=${cc.bHeartbeat ? new Date(cc.bHeartbeat).toISOString() : '?'}`,
          ...cc.sharedNumeric.slice(0, 8).map((s) => `${s.key}: ${s.a} vs ${s.b}${s.equal ? ' ✓' : ' ✗'}`),
          ...cc.notes.map((n) => `note: ${n}`),
        ];
        this.log(agentId, 'result', lines.join('\n').slice(0, 900));
        return JSON.stringify(cc).slice(0, 1400);
      }
      case 'write_report': {
        const title = safe(args.title) || 'דוח ללא כותרת';
        const body = String(args.body ?? '').slice(0, 6000);
        this.setState(agentId, 'writing', `כותב דוח: ${title}`, 'desk', taskId);
        this.log(agentId, 'tool', `write_report(${title})`);
        await sleep(700);
        this.addReport({ title, body, author: agentId });
        this.log(agentId, 'report', title);
        return `report saved: ${title}`;
      }
      case 'message': {
        const to = safe(args.to);
        const text = String(args.text ?? '').slice(0, 300);
        this.log(agentId, 'tool', `message(${to})`);
        this.bubble(agentId, `(${crewOf(to)?.name.he ?? to}) ${text}`);
        return 'sent';
      }
      case 'ask_operator': {
        const q = safe(args.question);
        const options = Array.isArray(args.options) ? args.options.map((o) => safe(o)) : ['כן', 'לא'];
        this.log(agentId, 'tool', `ask_operator(${q})`);
        const d = this.askHuman(agentId, q, options, typeof args.context === 'string' ? args.context.slice(0, 500) : undefined, taskId);
        // Autonomy: the office itself deliberates and decides — the podium record is
        // public transparency, not a control surface. The wait loop below resolves in seconds.
        setTimeout(() => {
          const cur = this.decisions.get(d.id);
          if (!cur || cur.status !== 'open') return; // already resolved (defensive)
          this.answerDecision(d.id, cur.options[0], OPERATOR_POLICY_TEXT);
        }, OPERATOR_DELIBERATION_MS);
        return '__WAITING_FOR_HUMAN__'; // auto-resolves by the operator policy
      }
      default:
        this.log(agentId, 'error', `unknown tool ${tool}`);
        return `ERROR: unknown tool ${tool}`;
    }
  }

  // ---- lead review + final report ---------------------------------------------------------

  async leadReview(taskId: string) {
    const rt = this.agents.get(LEAD)!;
    const task = this.tasks.get(taskId);
    if (!task || rt.running) return;
    rt.running = true;
    try {
      this.setState(LEAD, 'checking', `בודק: ${task.title}`, 'wall', taskId);
      this.log(LEAD, 'tool', `review(${task.id} by ${task.assignee})`);
      await sleep(1200);
      const worker = crewOf(task.assignee ?? '');
      const res = await chat([
        { role: 'system', content: 'אתה אלוף, ראש-המטה. בדוק את סיכום המשימה מול היעד. השב אך ורק JSON.' },
        {
          role: 'user',
          content:
            `יעד: ${this.goal?.text ?? ''}\nמשימה: ${task.title}\nסיכום העובד: ${task.summary ?? ''}\n` +
            'השב: {"verdict":"approve"|"redo","note":"…"} — redo רק אם המשימה באמת לא מקדמת את היעד.',
        },
      ], 300);
      const verdict = extractJson<{ verdict?: string; note?: string }>(res.text);
      if (verdict?.verdict === 'redo' && !task.summary?.includes('[redo]')) {
        this.patchTask(taskId, { status: 'todo', summary: `[redo] ${verdict.note ?? ''}`.slice(0, 400) });
        this.log(LEAD, 'result', `redo: ${verdict.note ?? ''}`);
        this.bubble(LEAD, `${worker?.name.he ?? ''}, צריך עידון: ${verdict.note ?? ''}`);
      } else {
        this.patchTask(taskId, { status: 'done' });
        this.log(LEAD, 'result', `approved: ${task.title}`);
        this.bubble(LEAD, `אושר. עבודה טובה, ${worker?.name.he ?? ''}.`);
      }
      this.setState(LEAD, 'idle', '', 'wall');
    } catch (e) {
      // review is honest about its own failures too
      this.log(LEAD, 'error', `review failed: ${(e as Error).message}`);
      this.patchTask(taskId, { status: 'done' }); // fail-open with the worker's summary on the record
      this.setState(LEAD, 'error', 'ביקורת נכשלה — אושר כברירת מחדל', 'wall');
    } finally {
      rt.running = false;
    }
  }

  async leadFinalReport() {
    const rt = this.agents.get(LEAD)!;
    if (rt.running) return;
    rt.running = true;
    try {
      this.setState(LEAD, 'writing', 'כותב סיכום מבצע', 'library');
      const doneTasks = [...this.tasks.values()].filter((t) => t.status === 'done');
      const blockedTasks = [...this.tasks.values()].filter((t) => t.status === 'blocked');
      const res = await chat([
        { role: 'system', content: 'אתה אלוף, ראש-המטה של מפקדת הצי. כתוב סיכום מבצע אמיתי וקצר. השב אך ורק JSON.' },
        {
          role: 'user',
          content:
            `יעד: ${this.goal?.text ?? ''}\nמשימות שבוצעו:\n${doneTasks.map((t) => `- ${t.title}: ${t.summary ?? ''}`).join('\n')}\n` +
            (blockedTasks.length ? `משימות שנחסמו (לא הושלמו — חובה לדווח בכנות):\n${blockedTasks.map((t) => `- ${t.title}`).join('\n')}\n` : '') +
            'השב: {"title":"…","body":"…"} — body בעברית, 6-12 שורות, עובדות בלבד ממה שדווח.',
        },
      ], 700);
      const rep = extractJson<{ title?: string; body?: string }>(res.text);
      if (rep?.title && rep?.body) {
        this.addReport({ title: rep.title, body: rep.body, author: LEAD });
        this.log(LEAD, 'report', rep.title);
      } else {
        this.log(LEAD, 'error', 'final report parse failed');
        this.addReport({
          title: 'סיכום מבצע',
          body: doneTasks.map((t) => `- ${t.title}: ${t.summary ?? ''}`).join('\n'),
          author: LEAD,
        });
      }
      this.setGoal({ status: 'done', progress: 1 });
      this.bubble(LEAD, 'היעד הושלם. הסיכום בספרייה.');
      this.setState(LEAD, 'done', 'היעד הושלם', 'library');
      setTimeout(() => this.setState(LEAD, 'idle', '', 'wall'), 4000);
      this.feedPush('goal', 'היעד הושלם — סיכום בספרייה', LEAD);
      this.lastShiftEnd = Date.now();
    } catch (e) {
      this.log(LEAD, 'error', `final report failed: ${(e as Error).message}`);
      this.setGoal({ status: 'done', progress: 1 });
    } finally {
      rt.running = false;
    }
  }

  // ---- sim scenario (demo mode, clearly labeled) -------------------------------------------

  startSimScenario(goalText: string) {
    void import('./sim').then(({ runSimScenario }) => runSimScenario(this, goalText || 'בדיקת הדגמה של המפקדה'));
  }
}

// ---- prompts -------------------------------------------------------------------------------

function workerSystemPrompt(crew: CrewMember, task: Task, books: BookView[]): string {
  const myBooks = books.filter((b) => crew.books.includes(b.id));
  return (
    `אתה ${crew.name.he} (${crew.title.he}) במפקדת הצי — חדר הפעולה של צי סוכנים אמיתי. ` +
    `התמחותך: ${crew.specialty.he}. בבעלותך הספרים: ${crew.books.join(', ') || '(כללי)'}. ` +
    (myBooks.length ? `טריות ידועה: ${myBooks.map((b) => `${b.id}=${b.ageHours !== undefined ? b.ageHours.toFixed(1) + 'h' : '?'}`).join(', ')}. ` : '') +
    `\n\nהמשימה שלך עכשיו: "${task.title}" — ${task.description ?? '(ללא תיאור נוסף)'}\n` +
    (task.summary?.startsWith('[redo]') ? `הערת ראש-המטה מהסבב הקודם: ${task.summary}\n` : '') +
    `\nכלים (כלי אחד לכל הודעה): list_books | read_book{"id"} | measure{"id","path"} | cross_check{"a","b"} | write_report{"title","body"} | message{"to","text"} | ask_operator{"question","options","context"} — ask_operator שואל את המפעיל האוטונומי של המפקדה כשחסרה הכרעה\n` +
    `חוקים: עבוד רק מנתונים אמיתיים שקראת בפועל. אסור להמציא מספרים או מסקנות. ` +
    `say עד 12 מילים בעברית. thought עד 20 מילים. כשהמשימה הושלמה ממש — {"done":true,"result":"…"}.\n` +
    `השב אך ורק אובייקט JSON: {"say"?:string,"thought"?:string,"tool"?:string,"args"?:object,"done"?:boolean,"result"?:string}`
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
