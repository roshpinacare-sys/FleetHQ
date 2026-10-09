// ============================================================================
// SECURITY-REGRESSION — repeatable proof that the office's secret gate holds
// ----------------------------------------------------------------------------
// The doctrine (SECURITY.md) in a test: every boundary that crosses OUT of the
// office (to the browser, to a model provider) must redact secret-shaped
// strings and control characters, and must never echo sensitive paths or
// environment material. This suite proves the NEGATIVE with SYNTHETIC
// credentials only — every "key" below is clearly fake, so nothing real is
// ever printed, stored or transmitted by running this file.
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
import { sanitizeEmitPayload } from '../mini-services/agent-hq/src/office';

// ---- section A fixtures: SYNTHETIC credentials (clearly fake) ---------------
// Length note: the gate's plain `sk-` floor is 28 chars (a shorter token would
// be a false positive in production text), so the synthetic sk- fake is 32
// chars. Everything else mirrors the mission's dummy shapes.
const SYNTHETIC: Array<{ label: string; value: string }> = [
  { label: 'github-pat', value: 'ghp_0000000000000000000000000000000000fake' },
  { label: 'openai-sk', value: 'sk-0000fake0000fake0000fake0000fake' },
  { label: 'aws-akia', value: 'AKIA0000000000000FAKE' },
  { label: 'xai-key', value: 'xai-0000fake0000fake0000' },
  { label: 'password', value: 'password=hunter2fake123' },
  { label: 'bearer', value: 'Bearer faketoken0000000000000000' },
];

// ---- section F fixtures: generic markers asserted ABSENT from live bodies ---
const LIVE_MARKERS = [
  'sk-',
  'ghp_',
  'github_pat_',
  'xoxb-',
  'BEGIN RSA PRIVATE KEY',
  'AKIA',
];

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
    const markerHits = LIVE_MARKERS.filter((m) => r.body.includes(m));
    must(
      markerHits.length === 0,
      `F ${url}: no credential-shaped markers in body (${markerHits.length}/${LIVE_MARKERS.length} markers found${markerHits.length ? `: ${markerHits.join(', ')} — INSPECT SERVER-SIDE, body not printed` : ''})`,
    );
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
