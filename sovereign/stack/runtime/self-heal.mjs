// sovereign/stack/runtime/self-heal.mjs — Layer 3's aeon `skill-repair` organ.
// Reads scores.json + the claims registry; every persistent CRITICAL workflow
// becomes a DEDUPED skill-repair proposal issue with a machine-checkable
// diagnosis. Bounded by Layer 2: policy.json autonomy.autoApply is "disabled"
// in v1 — the harness CLASSIFIES and PROPOSES, it never rewrites other lanes'
// code (the armed rung is documented in the policy, it needs one verified
// flight cycle + operator awareness first).
// Runaway law: >10 open skill-repair issues => ONE runaway issue, 24h quiet.
// Law: measurement duty -> exit 0 always.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const HOME = process.cwd();
const DIR = `${HOME}/sovereign/stack/runtime`;
const CLAIMS = `${HOME}/ops/claims`;
const OWNER = 'roshpinacare-sys';
const REPO = 'FleetHQ';
const TOKEN = process.env.GITHUB_TOKEN || process.env.SOVEREIGN_PAT;
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local';
const stamp = new Date().toISOString();

function sig8(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

let policy = { autonomy: { autoApply: 'disabled' } };
try { policy = JSON.parse(readFileSync(`${HOME}/sovereign/stack/policy/policy.json`, 'utf8')); } catch {}

// ---- load scores + claims
if (!existsSync(`${DIR}/scores.json`)) { console.log('no scores.json yet — run-scores first; honest empty run'); process.exit(0); }
const scores = JSON.parse(readFileSync(`${DIR}/scores.json`, 'utf8'));
const criticals = (scores.workflows || []).filter(r => r.cls === 'critical' || r.cls === 'flaky');

const seen = new Set();
if (existsSync(CLAIMS)) for (const f of readdirSync(CLAIMS)) { try { const c = JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')); if (c.kind === 'skill-repair') seen.add(c.sig); } catch {} }

async function listOpenIssues(label) {
  if (!TOKEN) return [];
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=open&per_page=100`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sovereign-self-heal' } });
    if (!res.ok) return [];
    const all = await res.json();
    return label ? all.filter(i => (i.labels || []).some(l => l.name === label)) : all;
  } catch { return []; }
}
async function openDedupedIssue(title, body, labels) {
  if (!TOKEN) { console.log(`(no token) would file: ${title}`); return; }
  try {
    const existing = await listOpenIssues(labels[0]);
    if (existing.some(i => i.title === title)) return;
    const cr = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'sovereign-self-heal' },
      body: JSON.stringify({ title, body, labels })
    });
    console.log(`issue filed: ${cr.status} ${title}`);
  } catch (e) { console.error('issue filing failed (defer-not-fail):', e.message); }
}

// ---- diagnosis heuristics (deterministic, machine-checkable)
function diagnose(r) {
  const n = r.name.toLowerCase();
  if (/dex|sweep|beat-money|giants/.test(n)) return { family: 'capital-path', proposal: 'pull the latest policy-gate verdicts (sovereign/stack/policy/verdicts.json) + dex books; a capital-path failure is a Layer-2 matter first', policyRef: 'policy.json#capital' };
  if (/pulse|worldbeat|window|office|heartbeat|artery/.test(n)) return { family: 'office-window', proposal: 'verify office/data.json freshness + writers lock starvation (post-surgery law: one concurrency slot per cadence, defer-not-fail publish)', policyRef: 'policy.json#autonomy' };
  if (/scan|patrol|selfscan|triage|watchdog|silence/.test(n)) return { family: 'measurement', proposal: 'the immune system itself is red — treat as high priority; check secret-dependent steps (named terminal awaiting-credential is the honest terminal)', policyRef: 'GOVERNANCE/anti-storm-law.md' };
  if (/identity|guard/.test(n)) return { family: 'identity-law', proposal: 'check DECISIONS #10 enforcement output — forbidden author identities in pushed commits', policyRef: 'identity-patrol.mjs' };
  return { family: 'general', proposal: 'read the failing run log; classify per anti-storm law (secret-dependent → named terminal; structural → surgical patch; business-red → book + issue, exit 0)', policyRef: 'GOVERNANCE/anti-storm-law.md' };
}

// ---- runaway guard
const openRepairs = await listOpenIssues('skill-repair');
// anti-storm refinement: if ANY open issue already covers this workflow (triage,
// selfscan, or a prior repair proposal), the harness does NOT file a duplicate —
// the claim file still lands for the registry.
const allOpen = await listOpenIssues(null);
const covers = (repo, name) => allOpen.some(i => `${i.title}\n${i.body || ''}`.includes(`${repo}/${name}`) || `${i.title}\n${i.body || ''}`.includes(name));
if (openRepairs.length > 10) {
  await openDedupedIssue('skill-repair runaway: >10 open proposals — harness going quiet for 24h',
    `**Layer 3 runaway guard** (policy.json#escalation.selfHealRunaway).\n\nopen proposals: ${openRepairs.length}\n\nThe harness stops proposing until this issue is closed. Run: ${RUN_URL}`,
    ['skill-repair', 'runaway']);
  console.log(`runaway guard: ${openRepairs.length} open proposals — quiet mode`);
  process.exit(0);
}

// ---- proposal per critical (deduped by sig)
let proposals = 0;
for (const r of criticals) {
  const d = diagnose(r);
  const windowNote = r.window && typeof r.window === 'object' ? `window: ${r.window.runs} runs, successRate ${(r.window.successRate * 100).toFixed(0)}%` : (r.window || 'window: n/a');
  const sig = sig8(`skill-repair|${r.repo}|${r.name}|${r.lastConcl}`);
  const claim = { sig, kind: 'skill-repair', repo: r.repo, workflow: r.name, family: d.family, lastConcl: r.lastConcl, firstSeenAt: stamp, lastSeenAt: stamp, status: 'open', runUrl: RUN_URL };
  try { writeFileSync(`${CLAIMS}/claim-${sig}.json`, JSON.stringify(claim, null, 2) + '\n'); } catch {}
  if (seen.has(sig) || covers(r.repo, r.name)) { if (seen.has(sig)) continue; console.log(`covered by an open issue — claim-only: ${r.repo}/${r.name}`); continue; }
  await openDedupedIssue(
    `skill-repair [${d.family}]: ${r.repo}/${r.name} — ${r.lastConcl} (sig ${sig})`,
    `**Layer 3 self-heal proposal** (autoApply: \`${policy.autonomy?.autoApply}\` — proposals only, no code rewritten by the harness)\n\n`
    + `- diagnosis family: \`${d.family}\`\n- last conclusion: \`${r.lastConcl}\` at ${r.lastRun || '—'}\n- ${windowNote}\n`
    + `- bounded proposal: ${d.proposal}\n- governing rules: \`${d.policyRef}\`\n- run: ${RUN_URL}\n\n`
    + `Close with evidence per the anti-storm law; triage may quarantine if persistent + high-frequency.`);
  proposals++;
}

console.log(`self-heal: ${criticals.length} critical/flaky, ${proposals} new proposals (open=${openRepairs.length}), autoApply=${policy.autonomy?.autoApply}`);
process.exit(0);
