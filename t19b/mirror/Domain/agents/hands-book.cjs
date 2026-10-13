'use strict';
/**
 * hands-book.cjs — Z-43 HANDS DESK (operator directive: "מה יש לנו בידיים" —
 * what do we hold in our hands; give the sovereignty more capabilities).
 *
 * Origin study: trycua/cua (Z-43-a research wave, CR-0006). cua's product is
 * "give agents computers" (agent ↔ computer loop, VM sandboxes, benchmarks).
 * We adopt their PATTERNS, not their runtime — this sandbox has no docker/
 * podman/qemu/gvisor/VMX (probed, on record) and their cloud fleet is a new
 * external account = tier C, operator-gated:
 *   P1 probe-before-trust  — cua's `sb.spacesd()` probes GetCapabilities and
 *      fails with SpacesdNotAvailable; nothing is trusted because a manifest
 *      mentions it. Ours: a hand is LIVE only with a fresh probe receipt.
 *   P2 permission-at-launch — standard/bounded/unrestricted blast-radius
 *      modes. Ours: policy locks (tier C) are decided by the sovereignty
 *      law, never by a probe result — a policy lock beats a green probe.
 *   P3 action ladder — element actions first, pixel last, GUI as last
 *      resort; every action carries a verdict. Ours: the browser hand books
 *      its own evidence (title + bytes), DOM/ref actions over pixels.
 *
 * The verdict enum is CLOSED (zero hopeful greens):
 *   LIVE         probed OK this run — evidence + probeAt on the row
 *   ABSENT       the surface does not exist in this context (honest CI answer)
 *   UNREACHABLE  the surface exists but the probe failed this run
 *   REF          not probed here — this desk CROSS-REFS the owning canon
 *                (one canon per question: inference rails live in rail-ledger)
 *   LOCKED-TIER-C the sovereignty law locks it (operator gate); not probed
 *
 * Fail-soft: exit 0 always; books stamped; nothing secret is ever printed.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const OUT_JSON = path.join(AG, 'hands-book.json');
const OUT_MD = path.join(AG, 'hands-book.md');
const SHOT = '/tmp/hands-browser-probe.png';

const VERDICTS = ['LIVE', 'ABSENT', 'UNREACHABLE', 'REF', 'LOCKED-TIER-C'];

// pure verdict derivation — white-box eval target (E18). Policy beats probe.
function deriveVerdict(probe, policy) {
  if (policy && policy.locked) return 'LOCKED-TIER-C';
  if (probe && probe.ref) return 'REF';
  if (!probe || probe.absent) return 'ABSENT';
  if (probe.ok) return 'LIVE';
  return 'UNREACHABLE';
}

const sh = (cmd, args, timeoutMs) => {
  try {
    const r = spawnSync(cmd, args, { timeout: timeoutMs || 30000, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } catch (e) { return { code: -1, out: '', err: String(e.message || e).slice(0, 90) }; }
};

const httpGet = (url, timeoutMs) => new Promise((resolve) => {
  try {
    const req = https.get(url, { timeout: timeoutMs || 15000 }, (res) => { res.resume(); resolve({ code: res.statusCode }); });
    req.on('timeout', () => { req.destroy(); resolve({ code: 0 }); });
    req.on('error', () => resolve({ code: 0 }));
  } catch (_) { resolve({ code: 0 }); }
});

(async () => {
  const at = new Date().toISOString();
  const hands = [];
  const book = (id, name, surface, probe, policy, evidence, extra) => {
    const verdict = deriveVerdict(probe, policy);
    hands.push({ id, name, surface, verdict, evidence: evidence || null, probeAt: at, ...(extra || {}) });
    return verdict;
  };

  // ---- H1 shell-exec (the base hand — every desk stands on it)
  const p1 = sh('bash', ['-lc', 'echo hands-probe-ok'], 15000);
  const v1 = book('H1', 'shell-exec', 'bash + node + bun process execution',
    { ok: p1.code === 0 && /hands-probe-ok/.test(p1.out) }, null,
    v1e(p1.code === 0 && /hands-probe-ok/.test(p1.out), `bash -lc echo → exit ${p1.code}, stdout matched`));
  function v1e(ok, s) { return ok ? s : `exit ${p1.code} ${p1.err.slice(0, 40)}`; }

  // ---- H2 git rail (authenticated push/fetch — creds live in remotes, never printed)
  const p2 = sh('git', ['-C', ROOT, 'ls-remote', 'origin', '-h', 'refs/heads/main'], 45000);
  const ok2 = p2.code === 0;
  book('H2', 'git-rail', 'authenticated git fetch/push over the embedded remote creds',
    { ok: ok2 }, null,
    ok2 ? `git ls-remote origin/main → exit 0 (auth rail serves, creds never printed)` : `git ls-remote → exit ${p2.code} ${p2.err.slice(0, 50)}`);

  // ---- H3 browser-GUI (computer use, cua action-ladder: DOM/title evidence, not pixels)
  const ab = sh('bash', ['-lc', 'command -v agent-browser'], 10000);
  if (!ab.out) {
    book('H3', 'browser-gui', 'agent-browser CLI computer-use (open/snapshot/screenshot)',
      { absent: true }, null,
      'agent-browser CLI absent in this context (honest CI answer — the hand exists as a pattern, not here)');
  } else {
    const open = sh('agent-browser', ['open', 'https://example.com'], 60000);
    const title = open.code === 0 ? sh('agent-browser', ['get', 'title'], 30000) : { out: '' };
    let shotBytes = 0;
    if (open.code === 0) { sh('agent-browser', ['screenshot', SHOT], 45000); try { shotBytes = fs.statSync(SHOT).size; } catch (_) { shotBytes = 0; } sh('agent-browser', ['close'], 30000); }
    const ok3 = open.code === 0 && /Example Domain/.test(title.out) && shotBytes > 0;
    book('H3', 'browser-gui', 'agent-browser CLI computer-use (open/snapshot/screenshot)',
      { ok: ok3 }, null,
      ok3 ? `agent-browser open example.com → title "Example Domain" · screenshot ${shotBytes} bytes · session closed` : `probe failed: open exit ${open.code} title="${(title.out || '').slice(0, 30)}" shot=${shotBytes}B (UNREACHABLE — booked, never hoped)`);
  }

  // ---- H4 keyless web (public HTTP(S) fetch — the read hand)
  const p4 = await httpGet('https://example.com', 15000);
  const ok4 = p4.code === 200;
  book('H4', 'web-keyless', 'keyless public HTTP(S) fetch (reads, public data only)',
    { ok: ok4 }, null,
    ok4 ? `GET https://example.com → HTTP 200 (keyless)` : `GET https://example.com → ${p4.code} (UNREACHABLE this run)`);

  // ---- H5 vm/container stack (the cua runtime class — probed ABSENT here, on record)
  const bins = ['docker', 'podman', 'qemu-system-x86_64', 'runsc'].filter((b) => sh('bash', ['-lc', `command -v ${b}`], 10000).out);
  let vmx = false;
  try { vmx = /vmx|svm/.test(fs.readFileSync('/proc/cpuinfo', 'utf8')); } catch (_) { vmx = false; }
  book('H5', 'vm-container-stack', 'docker/podman/qemu/gvisor/VMX — the VM-sandbox runtime class',
    { ok: false, absent: bins.length === 0 && !vmx ? true : false }, null,
    `docker/podman/qemu/runsc: ${bins.length ? 'present:' + bins.join(',') : 'all ABSENT'} · cpu vmx/svm: ${vmx ? 'yes' : 'no'} — cua's Lume/VM runtime class does not exist in this sandbox (measured 2026-10-03); we run their PATTERNS on our native surfaces instead`);

  // ---- H6 inference rails — CROSS-REF (one canon per question: cognitive-rail owns it)
  let rail = null;
  try { rail = JSON.parse(fs.readFileSync(path.join(AG, 'rail-ledger.json'), 'utf8')); } catch (_) { rail = null; }
  book('H6', 'inference-rails', 'LLM/VLM/TTS/ASR rails — owned canon: rail-ledger.json',
    { ref: true }, null,
    `cross-ref agents/rail-ledger.json (one canon per question — this desk does not duplicate the rail desk): ledger ${rail && rail.at ? `stamped ${rail.at.slice(0, 19)}Z` : 'MISSING — hands stay honest, rails judged by their own desk'}`);

  // ---- policy locks (cua P2: permission modes are decided at law, not by probes)
  const locked = [
    { id: 'LK1', name: 'cloud computer-use fleets (cua Fleet class)', reason: 'new external account + key = tier C, operator gate (sovereignty §3); the pattern is adopted, the vendor is not' },
    { id: 'LK2', name: 'new API keys / key rotation / fuel pacing', reason: 'tier C — operator-only, never self-served' },
    { id: 'LK3', name: 'cross-chain execution surfaces', reason: 'execution-surface law: real money movement stays inside Hive/hive-engine/Blurt; bridges are reads, never writes' }
  ];

  const counts = {
    live: hands.filter((h) => h.verdict === 'LIVE').length,
    absent: hands.filter((h) => h.verdict === 'ABSENT').length,
    unreachable: hands.filter((h) => h.verdict === 'UNREACHABLE').length,
    ref: hands.filter((h) => h.verdict === 'REF').length,
    locked: locked.length
  };
  const liveRows = hands.filter((h) => h.verdict === 'LIVE');
  const allLiveHaveEvidence = liveRows.every((h) => h.evidence && String(h.evidence).length > 3);
  const enumsOk = hands.every((h) => VERDICTS.includes(h.verdict));
  const ok = hands.length >= 5 && counts.live >= 2 && allLiveHaveEvidence && enumsOk;

  const out = {
    ok, at,
    agent: 'hands-book v1.0.0 (Z-43, CR-0006 — operator directive "מה יש לנו בידיים"; cua-pattern adoption)',
    origin: 'trycua/cua study (Z-43-a): "give agents computers" — we adopt probe-before-trust (SpacesdNotAvailable), permission-at-launch (policy locks beat probes), and the action ladder (DOM evidence over pixel guessing); we do NOT run their binaries — no docker/qemu/VMX here (H5, measured) and their cloud fleet is tier C',
    law: 'a capability claimed without a receipt is a story; ABSENT is an honest answer, not a failure; the verdict enum is closed (LIVE/ABSENT/UNREACHABLE/REF/LOCKED-TIER-C) — zero hopeful greens',
    hands, locked,
    refs: ['agents/rail-ledger.json (inference rails)', 'agents/canon-liveness.json (canon legs)', 'agents/harness-audit.json (judge #31 watches this book)'],
    counts, verdict: VERDICTS.join('/')
  };
  const verdictLine = ok
    ? `hands green: ${counts.live} LIVE (receipted) · ${counts.absent} ABSENT (honest) · ${counts.ref} cross-ref · ${counts.locked} tier-C locks — surfaces probed, never claimed`
    : `hands NOT green: ${counts.live} LIVE / ${hands.length} probed — the honest state is the book, never a hope`;
  out.verdict = verdictLine;
  try { fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 1) + '\n'); } catch (_) {}

  const md = [];
  md.push('# Hands Book — the sovereignty\'s execution surfaces, probed (Z-43)');
  md.push('');
  md.push(`_hands-book v1.0.0 · ${at} · cua-pattern adoption (probe-before-trust · permission-at-launch · action ladder)_`);
  md.push('');
  md.push(`**${verdictLine}**`);
  md.push('');
  md.push('| Hand | Surface | Verdict | Evidence |');
  md.push('|---|---|---|---|');
  for (const h of hands) md.push(`| ${h.id} ${h.name} | ${h.surface} | ${h.verdict} | ${(h.evidence || '—').slice(0, 140)} |`);
  md.push('');
  md.push('**Tier-C policy locks (decided by law, not probes):**');
  for (const l of locked) md.push(`- **${l.id} ${l.name}:** ${l.reason}`);
  md.push('');
  md.push('_cua (trycua/cua) lesson adopted: an agent\'s power is exactly its probed, receipted surfaces — everything else is theater._');
  try { fs.writeFileSync(OUT_MD, md.join('\n') + '\n'); } catch (_) {}

  console.log(`hands-book: ${counts.live} LIVE / ${counts.absent} ABSENT / ${counts.unreachable} UNREACHABLE / ${counts.ref} REF / ${counts.locked} LOCKED — ${ok ? 'green' : 'NOT green (booked honestly)'}`);
  process.exit(0);
})();

module.exports = { deriveVerdict, VERDICTS };
