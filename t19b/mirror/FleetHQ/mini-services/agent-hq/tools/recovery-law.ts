// ============================================================================
// RECOVERY-LAW — the durable-recovery reconciliation law, proven pure (Task 46)
// ----------------------------------------------------------------------------
// The kill-test in the live office proved the full chain (durable capture →
// supervisor resurrection → honest reconciliation → dead-peer takeover →
// re-dispatch). This probe proves the LAW ITSELF deterministically, without
// touching the live office: every interrupt/attempt combination reconciles
// exactly as documented in office.ts (reconcileRecoveredTask).
//
// Run: bun run mini-services/agent-hq/tools/recovery-law.ts
// Exit 0 = the law holds; exit 1 = a claim in the docs is a lie.
// ============================================================================

import { reconcileRecoveredTask } from '../src/office';
import type { Task } from '../src/types';

const failures: string[] = [];
const checks: Array<{ ok: boolean; what: string }> = [];
const must = (cond: boolean, what: string) => {
  checks.push({ ok: cond, what });
  if (!cond) failures.push(what);
};

const mk = (status: Task['status'], summary?: string): Task => ({
  id: 't1',
  title: 'probe task',
  status,
  dependsOn: [],
  assignee: 'gal',
  createdBy: 'aluf',
  createdAt: 1,
  updatedAt: 1,
  ...(summary ? { summary } : {}),
});

// doing + 0 interruptions → requeued with the recovery note
{
  const r = reconcileRecoveredTask(mk('doing'), 0);
  must(r.requeued && !r.parked, 'law doing+0 → requeued');
  must(r.task.status === 'todo', 'law doing+0 → status todo');
  must((r.task.summary ?? '').includes('[recovery:'), 'law doing+0 → explicit recovery note on the record');
}
// doing + 1 → still requeued (bounded second chance)
{
  const r = reconcileRecoveredTask(mk('doing'), 1);
  must(r.requeued && !r.parked, 'law doing+1 → requeued (second chance)');
  must(r.task.status === 'todo', 'law doing+1 → status todo');
}
// doing + 2 → PARKED for reconciliation — never a loop, never a fake done
{
  const r = reconcileRecoveredTask(mk('doing'), 2);
  must(r.parked && !r.requeued, 'law doing+2 → parked (bounded)');
  must(r.task.status === 'blocked', 'law doing+2 → status blocked (not done, not todo)');
  must((r.task.summary ?? '').includes('[recovery:'), 'law doing+2 → explicit parked note on the record');
}
// non-doing statuses restore as-is — a done task is NEVER re-marked, a review resumes
for (const s of ['todo', 'review', 'done', 'blocked', 'cancelled'] as const) {
  const r = reconcileRecoveredTask(mk(s, 'kept'), 3);
  must(!r.requeued && !r.parked, `law ${s} → restored as-is (no reconciliation)`);
  must(r.task.status === s, `law ${s} → status untouched`);
  must(r.task.summary === 'kept', `law ${s} → summary untouched`);
}

// compact PASS/FAIL table + honest exit
console.log(`recovery-law — ${checks.length} assertions`);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.what}`);
const passed = checks.filter((c) => c.ok).length;
console.log(
  failures.length === 0
    ? `RECOVERY-LAW: ALL GREEN (${passed}/${checks.length})`
    : `RECOVERY-LAW: ${failures.length} FAILURE(S) (${passed}/${checks.length})`,
);
process.exit(failures.length === 0 ? 0 : 1);
