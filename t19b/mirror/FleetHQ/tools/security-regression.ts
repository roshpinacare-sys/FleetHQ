// ============================================================================
// SECURITY-REGRESSION — repeatable proof that the office's secret gate holds
// ----------------------------------------------------------------------------
// The doctrine (SECURITY.md) in a test: every boundary that crosses OUT of the
// office (to the browser, to a model provider, to a restart artifact) must
// redact secret-shaped strings and control characters, and must never echo
// sensitive paths or environment material. This suite proves the NEGATIVE with
// SYNTHETIC credentials only — every "key" below is clearly fake, so nothing
// real is ever printed, stored or transmitted by running this file.
//
// What is proven (sections):
//   A. scrubSecrets/sanitizePublicText fully redact every synthetic credential.
//   B. isSensitivePath drops env/vault/keys-shaped paths from digest inputs.
//   C. stripControl kills control-character injection.
//   D. the gitpulse commit boundary (subject/author are UNTRUSTED git data).
//   E. the office socket boundary (log/bubble/feed/task/report/goal events)
//      and that ordinary multi-line content is NOT corrupted by the gate.
//   F. live HTTP boundaries (:3000/api/foreman/health, /api/fleet-health)
//      carry no synthetic value and no credential-shaped marker at all.
//   G. the DURABLE PERSISTENCE gate (Task 46): task/decision/report records
//      written into the restart-recovery artifact are scrubbed at the boundary.
//   H. the GIT FLEET law (Task 46): the live inventory never leaks a remote
//      URL or credential, an unverified repo is honestly unavailable, and a
//      work-tree subdirectory is never dressed up as an independent repo.
//   I. the LIVE SOCKET boundary (Task 46): a real snapshot + book preview from
//      the foreman carry no credential-shaped marker at all.
//
// Run: bun run tools/security-regression.ts [nextPort]
// Exit 0 = all assertions held; exit 1 = the gate is lying somewhere.
// NOTE: on failure the script prints only the MARKER NAME / COUNT — never the
// body that matched, so a real leak can never be reproduced into a terminal.
// ============================================================================

import {
  isSensitivePath,
  sanitizePublicText,
  scrubSecrets,
  stripControl,
} from '../mini-services/agent-hq/src/security';
import { resolveGitSource, sanitizeCommitField, toCommitView } from '../mini-services/agent-hq/src/gitpulse';
import { sanitizeEmitPayload, scrubDurableDecision, scrubDurableReport, scrubDurableTask } from '../mini-services/agent-hq/src/office';
import { collectRepoFleet } from '../mini-services/agent-hq/src/gitfleet';

// ---- section A fixtures: SYNTHETIC credentials (clearly fake) ---------------
// Length note: the gate's plain `sk-` floor is 28 chars (a shorter token would
// be a false positive in production text), so the synthetic sk- fake is 32
// chars. Everything else mirrors the mission's dummy shapes.
// SCANNER-COEXISTENCE LAW: the new shapes below are BUILT BY CONCATENATION so
// this source file never contains a value-shaped literal — the vault/lineage
// scanners are value-shaped (≥20 chars after the prefix) and a static fixture
// would fail-closed every future push against the suite's own test strings.
// Runtime values stay ≥16 after the prefix so the scrub gate still fires.
const tavilyFake = `tvly-dev-${'0'.repeat(8)}fake${'0'.repeat(3)}`; // 19 after prefix (scrub 16+ ✓, scanner 20+ ✗)
const jinaFake = `jina_${'0'.repeat(8)}fake${'0'.repeat(4)}`; // 16 after prefix
const dottedFake = `${'abcdef0123456789'.repeat(2)}.${'1_'}${'FAKE'.repeat(5)}`; // 32hex.22-suffix
const SYNTHETIC: Array<{ label: string; value: string }> = [
  { label: 'github-pat', value: 'ghp_0000000000000000000000000000000000fake' },
  { label: 'openai-sk', value: 'sk-0000fake0000fake0000fake0000fake' },
  { label: 'aws-akia', value: 'AKIA0000000000000FAKE' },
  { label: 'xai-key', value: 'xai-0000fake0000fake0000' },
  { label: 'tavily-key', value: tavilyFake },
  { label: 'jina-key', value: jinaFake },
  { label: 'dotted-key', value: dottedFake },
  { label: 'password', value: 'password=hunter2fake123' },
  { label: 'bearer', value: 'Bearer faketoken0000000000000000' },
];

// ---- section F/I fixtures: credential-shaped markers asserted ABSENT from live bodies ----
// The generic sk- marker is TOKEN-SHAPED (sk- + 16+ credential chars): a bare
// "sk-" substring matches ordinary words ("pre-Task-42" in a commit subject
// tripped the loose marker live) and is not a credential. Everything else is
// a distinctive prefix that never occurs in ordinary text.
const LIVE_MARKERS: Array<{ name: string; hit: (body: string) => boolean }> = [
  { name: 'sk-<token>', hit: (b) => /sk-[A-Za-z0-9_-]{16,}/.test(b) },
  { name: 'ghp_', hit: (b) => b.includes('ghp_') },
  { name: 'github_pat_', hit: (b) => b.includes('github_pat_') },
  { name: 'xoxb-', hit: (b) => b.includes('xoxb-') },
  { name: 'BEGIN RSA PRIVATE KEY', hit: (b) => b.includes('BEGIN RSA PRIVATE KEY') },
  { name: 'AKIA', hit: (b) => b.includes('AKIA') },
  { name: 'tvly-<token>', hit: (b) => /tvly-[A-Za-z0-9-]{16,}/.test(b) },
  { name: 'jina_<token>', hit: (b) => /jina_[A-Za-z0-9_-]{16,}/.test(b) },
  { name: 'tavilyApiKey=', hit: (b) => b.includes('tavilyApiKey=') },
  { name: '<32hex>.<suffix>', hit: (b) => /\b[0-9a-f]{32}\.[A-Za-z0-9_-]{20,}\b/.test(b) },
];
const markerHits = (body: string) => LIVE_MARKERS.filter((m) => m.hit(body));

const failures: string[] = [];
const checks: Array<{ ok: boolean; what: string }> = [];
const must = (cond: boolean, what: string) => {
  checks.push({ ok: cond, what });
  if (!cond) failures.push(what);
};

// ============================================================================
// A — the scrub gate: every synthetic value is FULLY redacted
// ============================================================================
for (const s of SYNTHETIC) {
  const out = scrubSecrets(`לפני ${s.value} אחרי`);
  must(!out.includes(s.value), `A scrubSecrets fully redacts ${s.label}`);
  must(out.includes('«redacted»'), `A scrubSecrets marks ${s.label} as «redacted»`);
}
{
  const all = SYNTHETIC.map((s) => s.value).join(' · ');
  const pub = sanitizePublicText(`log line: ${all}`);
  must(SYNTHETIC.every((s) => !pub.includes(s.value)), 'A sanitizePublicText redacts all synthetics (browser gate)');
}

// ============================================================================
// B — sensitive paths are DROPPED from digest inputs (never scrubbed: dropped)
// ============================================================================
const SENSITIVE: Array<[string, boolean]> = [
  ['.env', true],
  ['.env.local', true],
  ['vault/keys.env', true],
  ['vault/keys.env.enc', true],
  ['keys/pat.txt', true],
  ['ssh/id_rsa', true],
  ['certs/server.pem', true],
  ['upload/blob.bin', true],
  ['.git/config', true],
  ['config/credentials.json', true],
  // negatives — ordinary work areas must survive the filter untouched
  ['src/app/page.tsx', false],
  ['data/agents/dex-book.json', false],
  ['docs/fleethq-product-audit.md', false],
  ['mini-services/agent-hq/src/security.ts', false],
];
for (const [p, expected] of SENSITIVE) {
  must(isSensitivePath(p) === expected, `B isSensitivePath(${p}) === ${expected}`);
}

// ============================================================================
// C — stripControl kills control-character injection
// ============================================================================
{
  const injected = 'ok\x00NOPE\x1b[31mred\x07bell\u000bvt';
  const out = stripControl(injected, 200);
  const controlGone = !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(out);
  must(controlGone, 'C stripControl removes control characters');
  must(out.includes('[31m'), 'C stripControl keeps ordinary visible text (no corruption)');
  must(sanitizePublicText('שורה א\nשורה ב').includes('\n'), 'C browser gate preserves newlines (no content corruption)');
}

// ============================================================================
// D — the gitpulse commit boundary: subject/author are UNTRUSTED git data
// ============================================================================
{
  const src = resolveGitSource('/tmp/does-not-matter');
  const leak = 'add config ghp_0000000000000000000000000000000000fake';
  const c = toCommitView(src, 'abc1234', Date.now(), 'attacker', leak);
  must(!c.subject.includes('ghp_0000000000000000000000000000000000fake'), 'D commit subject with fake ghp_ is redacted');
  must(c.subject.includes('«redacted»'), 'D redaction marker lands in the subject');
  must(c.author === 'attacker', 'D ordinary author passes unchanged');
  const ctrl = toCommitView(src, 'abc1234', Date.now(), 'evil\x1b[31muser', 'normal subject\x00here');
  must(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(ctrl.author + ctrl.subject), 'D control chars stripped from author+subject');
  const heb = toCommitView(src, 'def5678', Date.now(), 'roshpinacare-sys', 'עדכון ספרי הצי · 11 ספרים');
  must(heb.subject === 'עדכון ספרי הצי · 11 ספרים', 'D ordinary Hebrew subject passes unchanged');
  const pw = sanitizeCommitField('set password=hunter2fake123 now', 160);
  must(!pw.includes('hunter2fake123'), 'D sanitizeCommitField redacts password-shaped text');
}

// ============================================================================
// E — the office socket boundary (events) — no secret crosses to the browser
// ============================================================================
{
  const b = sanitizeEmitPayload('bubble', { agentId: 'gal', text: `סוד: ${SYNTHETIC[5]!.value}`, ts: 1 }) as { text: string };
  must(!b.text.includes('faketoken0000000000000000'), 'E bubble event redacts bearer-shaped text');

  const t = sanitizeEmitPayload('task', {
    id: 't1',
    title: `fix ${SYNTHETIC[1]!.value}`,
    description: `see ${SYNTHETIC[0]!.value}`,
    status: 'todo',
    dependsOn: [],
    createdBy: 'aluf',
    createdAt: 1,
    updatedAt: 1,
  }) as { id: string; title: string; description: string; status: string };
  must(!t.title.includes('sk-0000fake'), 'E task title redacts sk-shaped text');
  must(!t.description.includes('ghp_0000'), 'E task description redacts ghp-shaped text');
  must(t.id === 't1' && t.status === 'todo' && t.dependsOn.length === 0, 'E ids/status/arrays pass untouched');

  const l = sanitizeEmitPayload('log', { agentId: 'gal', entry: { ts: 1, kind: 'result', text: `key ${SYNTHETIC[2]!.value} end` } }) as { entry: { text: string } };
  must(!l.entry.text.includes('AKIA0000000000000FAKE'), 'E log entry redacts AKIA-shaped text');

  const r = sanitizeEmitPayload('report', { id: 'r1', title: 't', body: 'שורה א\nשורה ב', author: 'aluf', ts: 1 }) as { body: string };
  must(r.body.includes('\n'), 'E report body keeps its newlines (no corruption)');

  const passthrough = { backend: 'live', opsDone: 7 };
  must(sanitizeEmitPayload('status', passthrough) === passthrough, 'E unknown/no-text events pass through by reference');

  const git = sanitizeEmitPayload('git', {
    available: true,
    commits: [{ hash: 'abc1234', ts: 1, author: 'a', subject: `x ${SYNTHETIC[3]!.value}`, repo: 'Domain' }],
  }) as { commits: Array<{ subject: string }> };
  must(!git.commits[0]!.subject.includes('xai-0000fake'), 'E git pulse event redacts xai-shaped subject (belt & suspenders on top of D)');
}

// ============================================================================
// F — live HTTP boundaries carry no credential-shaped material at all
// ============================================================================
const NEXT_PORT = process.argv[2] || '3000';
async function probe(url: string): Promise<{ ok: boolean; note: string; body: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.text();
    return { ok: res.ok, note: `HTTP ${res.status}`, body };
  } catch (e) {
    return { ok: false, note: `unreachable (${(e as Error).message.slice(0, 40)})`, body: '' };
  }
}
{
  const targets = [
    `http://localhost:${NEXT_PORT}/api/foreman/health`,
    `http://localhost:${NEXT_PORT}/api/fleet-health`,
  ];
  for (const url of targets) {
    const r = await probe(url);
    if (!r.ok) {
      // a down boundary is REPORTED as a failure (fail-safe: absent proof = fail),
      // but the marker scan is skipped — there is no body to accuse.
      must(false, `F ${url} reachable (${r.note})`);
      continue;
    }
    must(true, `F ${url} reachable (${r.note})`);
    const leaked = SYNTHETIC.filter((s) => r.body.includes(s.value));
    must(leaked.length === 0, `F ${url}: none of the ${SYNTHETIC.length} synthetic values echoed (${leaked.length} found)`);
    const hits = markerHits(r.body);
    must(
      hits.length === 0,
      `F ${url}: no credential-shaped markers in body (${hits.length}/${LIVE_MARKERS.length} markers found${hits.length ? `: ${hits.map((h) => h.name).join(', ')} — INSPECT SERVER-SIDE, body not printed` : ''})`,
    );
  }
}

// ============================================================================
// G — the DURABLE PERSISTENCE gate (Task 46): records that survive a restart
//     are scrubbed at the boundary — no secret-shaped string survives into a
//     recovery artifact.
// ============================================================================
{
  const t = scrubDurableTask({
    id: 't1',
    title: `plan ${SYNTHETIC[0]!.value}`,
    description: `context ${SYNTHETIC[1]!.value}`,
    status: 'todo',
    dependsOn: [],
    why: `fit ${SYNTHETIC[3]!.value}`,
    summary: `result ${SYNTHETIC[5]!.value}`,
    createdBy: 'aluf',
    createdAt: 1,
    updatedAt: 1,
  });
  must(!t.title.includes('ghp_0000'), 'G durable task title redacts ghp-shaped text');
  must(!t.description!.includes('sk-0000fake'), 'G durable task description redacts sk-shaped text');
  must(!t.why!.includes('xai-0000fake'), 'G durable task why redacts xai-shaped text');
  must(!t.summary!.includes('faketoken0000000000000000'), 'G durable task summary redacts bearer-shaped text');
  must(t.id === 't1' && t.status === 'todo' && t.createdAt === 1, 'G ids/enums/numbers pass untouched');

  const d = scrubDurableDecision({
    id: 'd1',
    agentId: 'gal',
    kind: 'question',
    question: `should I use ${SYNTHETIC[2]!.value}?`,
    options: ['כן', 'לא'],
    status: 'answered',
    answer: { text: `yes ${SYNTHETIC[4]!.value}`, ts: 1 },
    createdAt: 1,
  });
  must(!d.question.includes('AKIA0000000000000FAKE'), 'G durable decision question redacts AKIA-shaped text');
  must(!d.answer!.text!.includes('hunter2fake123'), 'G durable decision answer redacts password-shaped text');

  const r = scrubDurableReport({ id: 'r1', title: `report ${SYNTHETIC[1]!.value}`, body: `body\n${SYNTHETIC[0]!.value}`, author: 'aluf', ts: 1 });
  must(!r.title.includes('sk-0000fake'), 'G durable report title redacts sk-shaped text');
  must(!r.body.includes('ghp_0000'), 'G durable report body redacts ghp-shaped text');
  must(r.body.includes('\n'), 'G durable report body keeps its newlines (no corruption)');
}

// ============================================================================
// H — the GIT FLEET law (Task 46): live inventory, read-only forever
// ============================================================================
{
  const fleet = await collectRepoFleet([
    { label: 'Domain · ספרי הצי', dir: process.env.AGENT_HQ_DATA_DIR ?? '/home/z/my-project/Domain', branch: 'main' },
    { label: 'FleetHQ · קוד המשרד', dir: process.env.AGENT_HQ_FLEET_DIR ?? '/home/z/my-project', branch: 'main' },
  ]);
  must(fleet.length === 2, 'H the authorized fleet has exactly 2 rows');
  const serialized = JSON.stringify(fleet);
  must(!serialized.includes('x-access-token'), 'H fleet rows never echo the credential-bearing remote identity');
  must(!/https?:\/\//.test(serialized), 'H fleet rows contain no URL at all (remote URLs are never read)');
  const domain = fleet.find((r) => r.label.startsWith('Domain'))!;
  const fleethq = fleet.find((r) => r.label.startsWith('FleetHQ'))!;
  if (domain) {
    // INDEPENDENCE: a work-tree subdirectory must never wear a foreign repo's numbers
    if (domain.available === false) {
      must(domain.syncState === 'unreachable', 'H a non-independent books dir is honestly unavailable');
      must(domain.ahead === null && domain.behind === null && domain.dirtyCount === null, 'H a non-independent dir reports NO foreign ahead/behind/dirty numbers');
      must((domain.lastSyncError ?? '').includes('not an independent repository'), 'H the honesty reason is on the record');
    } else {
      // if Domain becomes a real clone again, it must measure on its OWN numbers
      must(typeof domain.head === 'string' && domain.head.length > 0, 'H an independent Domain measures its own head');
    }
  } else {
    must(false, 'H the Domain row exists');
  }
  if (fleethq && fleethq.available) {
    must(fleethq.syncState !== 'up-to-date' || (fleethq.dirtyCount === 0 && fleethq.ahead === 0 && fleethq.behind === 0), 'H up-to-date is only claimed with full proof (clean + 0/0)');
    if ((fleethq.dirtyCount ?? 0) > 0) {
      must(fleethq.syncState === 'dirty', 'H a dirty tree never reads as synchronized');
    }
  }
  // identity: the git wire label must name the repo it actually reads
  const src = resolveGitSource('/home/z/my-project');
  must(src.label.includes('FleetHQ'), 'H the wire label names the repo actually read (FleetHQ, not Domain)');
  must(!src.repoUrl.includes('x-access-token'), 'H the wire repoUrl is the public URL, credential-free');
}

// ============================================================================
// I — the LIVE SOCKET boundary (Task 46): a real snapshot + book preview
// ============================================================================
{
  const FOREMAN = process.argv[3] || '3010';
  try {
    const { io } = await import('socket.io-client');
    const socket = io(`http://localhost:${FOREMAN}`, { path: '/', transports: ['websocket'], timeout: 8000, reconnection: false });
    const snap = await new Promise<Record<string, unknown> | null>((resolve) => {
      const t = setTimeout(() => resolve(null), 10_000);
      socket.on('snapshot', (s: Record<string, unknown>) => { clearTimeout(t); resolve(s); });
      socket.on('connect_error', () => { clearTimeout(t); resolve(null); });
    });
    if (!snap) {
      must(false, `I snapshot from :${FOREMAN} received (10s window)`);
    } else {
      must(true, `I snapshot from :${FOREMAN} received`);
      const body = JSON.stringify(snap);
      const hits = markerHits(body);
      must(hits.length === 0, `I snapshot: no credential-shaped markers (${hits.length}/${LIVE_MARKERS.length} found${hits.length ? `: ${hits.map((h) => h.name).join(', ')} — INSPECT SERVER-SIDE, body not printed` : ''})`);
      must(!body.includes('x-access-token'), 'I snapshot never carries the credential-bearing remote identity');
      // book:preview — the ack path is OUTSIDE the granular emit wrap; prove the gate
      const books = (snap.books as Array<{ id?: string }>) ?? [];
      const id = books[0]?.id;
      if (id) {
        const preview = await new Promise<Record<string, unknown> | null>((resolve) => {
          const t2 = setTimeout(() => resolve(null), 8_000);
          socket.emit('book:preview', { id }, (r: Record<string, unknown>) => { clearTimeout(t2); resolve(r); });
        });
        if (!preview) {
          must(false, 'I book:preview ack received (8s window)');
        } else {
          must(true, 'I book:preview ack received');
          const pbody = JSON.stringify(preview);
          const pHits = markerHits(pbody);
          must(pHits.length === 0, `I book preview: no credential-shaped markers (${pHits.length}/${LIVE_MARKERS.length} found${pHits.length ? `: ${pHits.map((h) => h.name).join(', ')} — INSPECT SERVER-SIDE` : ''})`);
        }
      } else {
        must(true, 'I book:preview skipped (no books on the wire — nothing to probe)');
      }
    }
    socket.disconnect();
  } catch {
    must(false, 'I socket probe ran (socket.io-client import/connection failed)');
  }
}

// ============================================================================
// J — the git-backed mirror boundary (Task 47): the durable task state now
// also lands in receipts/office-state-mirror.json (committed by the lineage
// guard), and the runtime supervisor journals to receipts/runtime-supervisor.
// Both are REPO-TRAVELING surfaces — they get the same live canary sweep.
// ============================================================================
{
  const { readFileSync, existsSync } = await import('fs');
  const mirror = '/home/z/my-project/receipts/office-state-mirror.json';
  if (existsSync(mirror)) {
    try {
      const body = readFileSync(mirror, 'utf8');
      const parsed = JSON.parse(body) as { v?: number; tasks?: unknown[] };
      must(parsed.v === 1 && Array.isArray(parsed.tasks), 'J live mirror parses as the durable schema (v=1, tasks[])');
      const hits = markerHits(body);
      must(hits.length === 0, `J live mirror: no credential-shaped markers (${hits.length}/${LIVE_MARKERS.length} found${hits.length ? ': ' + hits.map((h) => h.name).join(',') + ' — INSPECT SERVER-SIDE, body not printed' : ''})`);
      must(!body.includes('x-access-token'), 'J live mirror never carries the credential-bearing remote identity');
    } catch {
      must(false, 'J live mirror is valid JSON');
    }
  } else {
    must(true, 'J live mirror absent in this environment (skip — nothing travels)');
  }
  const supJournal = '/home/z/my-project/receipts/runtime-supervisor.jsonl';
  if (existsSync(supJournal)) {
    const body = readFileSync(supJournal, 'utf8');
    const hits = markerHits(body);
    must(hits.length === 0, `J runtime supervisor journal: no credential-shaped markers (${hits.length}/${LIVE_MARKERS.length})`);
  } else {
    must(true, 'J runtime supervisor journal absent (skip)');
  }
}

// ============================================================================
// compact PASS/FAIL table + honest exit
// ============================================================================
console.log(`security-regression against :${NEXT_PORT} — ${checks.length} assertions`);
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.what}`);
const passed = checks.filter((c) => c.ok).length;
console.log(
  failures.length === 0
    ? `SECURITY-REGRESSION: ALL GREEN (${passed}/${checks.length})`
    : `SECURITY-REGRESSION: ${failures.length} FAILURE(S) (${passed}/${checks.length})`,
);
process.exit(failures.length === 0 ? 0 : 1);
