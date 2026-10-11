// opens-closer.mjs — T-61: the self-healing dispatcher. Measures keyless freshness of the fleet's
// scheduler-driven states, revives what fell (same-repo workflow_dispatch via GITHUB_TOKEN),
// publishes an honest ledger. No secrets beyond GITHUB_TOKEN; cross-repo revival is recorded as
// an owner action (a repo-scoped token must never reach into sibling repos).
import { writeFileSync } from 'node:fs';

const ORG = 'roshpinacare-sys';
const RAW = `https://raw.githubusercontent.com/${ORG}/`;
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY || `${ORG}/FleetHQ`;
const TOKEN = process.env.GITHUB_TOKEN || '';
const NOW = new Date().toISOString();

const targets = [
  { key: 'office-state', url: RAW + 'FleetHQ/main/office/state/office-state.json', tsKey: 'capturedAt', slaMin: 180, selfHealWorkflow: 'office-heartbeat.yml', healNote: 'same-repo dispatch, GITHUB_TOKEN' },
  { key: 'beacon', url: RAW + 'sovereign-beacon/main/state.json', tsKey: 'at', slaMin: 100, selfHealWorkflow: null, healNote: 'cross-repo — requires owner-scoped credential (recorded as owner action N6, never faked)' },
  { key: 'lighthouse', url: RAW + 'sovereign-lighthouse/main/state.json', tsKey: 'at', slaMin: 80, selfHealWorkflow: null, healNote: 'cross-repo — requires owner-scoped credential (recorded as owner action N6, never faked)' },
  { key: 'domain-pulse', url: RAW + 'Domain/main/office/data.json', tsKey: 'generatedAt', slaMin: 180, selfHealWorkflow: null, healNote: 'cross-repo + writer is the sovereign runtime runner (office-pulse-bot), NOT a GitHub workflow — measured frozen since 19:36Z while runtime heartbeat stays green; recorded as owner action N7 (runtime lane owns the fix)' },
];

const ageMin = (ts) => { const t = Date.parse(ts); return isNaN(t) ? null : Math.max(0, Math.round((Date.now() - t) / 60000)); };

const checks = [];
for (const t of targets) {
  const c = { key: t.key, url: t.url, slaMin: t.slaMin, stateTs: null, ageMin: null, stale: null, dispatched: false, dispatchStatus: null, healNote: t.healNote };
  try {
    const r = await fetch(t.url, { headers: { 'User-Agent': 'saos-opens-closer' } });
    if (r.ok) {
      const j = await r.json();
      c.stateTs = j[t.tsKey] || j.capturedAt || j.generatedAt || null;
      c.ageMin = ageMin(c.stateTs);
      c.stale = c.ageMin === null ? null : c.ageMin > t.slaMin;
    } else c.dispatchStatus = `state fetch HTTP ${r.status}`;
  } catch (e) { c.dispatchStatus = 'state fetch ERR ' + String(e.message).slice(0, 60); }
  checks.push(c);
}

// prior ledger (from raw HEAD) — decides the no-noise commit policy
let prior = null;
try { const r = await fetch(RAW + 'FleetHQ/main/office/state/opens-closer.json', { headers: { 'User-Agent': 'saos-opens-closer' } }); if (r.ok) prior = await r.json(); } catch {}

// self-heal: same-repo dispatch only (GITHUB_TOKEN is repo-scoped by design — respect it)
for (const c of checks) {
  const t = targets.find(x => x.key === c.key);
  if (!c.stale || !t.selfHealWorkflow) continue;
  if (!TOKEN) { c.dispatchStatus = 'no GITHUB_TOKEN — not faked'; continue; }
  try {
    const r = await fetch(`${API}/repos/${REPO}/actions/workflows/${t.selfHealWorkflow}/dispatches`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' }, body: JSON.stringify({ ref: 'main' }),
    });
    c.dispatched = r.status === 204;
    c.dispatchStatus = r.status === 204 ? 'dispatched 204' : `HTTP ${r.status}`;
  } catch (e) { c.dispatchStatus = 'dispatch ERR ' + String(e.message).slice(0, 60); }
}

const staleOnes = checks.filter(c => c.stale === true);
const dispatchedOnes = checks.filter(c => c.dispatched);
const out = {
  schema: 'saos.opens-closer.v1',
  generatedAt: NOW,
  verdictHe: checks.length
    ? (staleOnes.length === 0
      ? `הכל טרי מעל SLA (${checks.map(c => c.key + ' ' + c.ageMin + 'דק').join(', ')})`
      : `${staleOnes.length} נפלו מעל SLA (${staleOnes.map(c => `${c.key} ${c.ageMin}דק>SLA${c.slaMin}`).join(', ')}) — הוערו: ${dispatchedOnes.map(c => c.key).join(',') || 'אין'}`)
    : 'no checks',
  metrics: { staleCount: staleOnes.length, dispatchedCount: dispatchedOnes.length },
  checks,
  ownerActions: staleOnes.filter(c => !targets.find(x => x.key === c.key).selfHealWorkflow).length
    ? ['N6 — הרשאת-בעלים להערת-נפלים חוצת-ריפואריים (beacon/lighthouse): PAT עם workflow-scope כסוד ב-FleetHQ, או הרצת ה-runtime כותבת-מצבות אלה (מסלול ה-runner, נמדד עצר 19:26Z)']
    : [],
};

// no-noise law: commit only when meaningful — dispatch happened, stale-count transition, or 4h freshness stamp
const meaningful =
  !prior ||
  dispatchedOnes.length > 0 ||
  (prior.metrics && prior.metrics.staleCount !== out.metrics.staleCount) ||
  (prior.generatedAt && (Date.now() - Date.parse(prior.generatedAt)) > 240 * 60000);
out.commitDecision = meaningful ? 'commit' : 'no-delta';

writeFileSync('office/state/opens-closer.json', JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ verdictHe: out.verdictHe, metrics: out.metrics, commitDecision: out.commitDecision }, null, 1));

