// sovereign/stack/policy/policy-gate.mjs — Layer 2 FLIGHT of the Ultimate Sovereign Stack.
// The PolicyAVS validator network, in the flesh: reads the LIVE capital books from
// Domain (public raw fetch, keyless), validates every recent intent/fill against
// policy.json, composes the STASIS brake, publishes verdicts.json, and turns every
// violation into a deduped claim + ONE issue (the refuse-to-sign + slashing analogue).
// Law: measurement duty -> exit 0 always. Publish = defer-not-fail.

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPolicy, validateIntent, validateFill, evaluateStasis, validateAggregate } from './policy-engine.mjs';

const HOME = process.cwd();
const DIR = `${HOME}/sovereign/stack/policy`;
const CLAIMS = `${HOME}/ops/claims`;
const OWNER = 'roshpinacare-sys';
const REPO = 'FleetHQ';
const TOKEN = process.env.GITHUB_TOKEN || process.env.SOVEREIGN_PAT;
const RUN_URL = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : 'local';
const BRANCH = process.env.SOVEREIGN_BRANCH || 'main';
const stamp = new Date().toISOString();
const policy = loadPolicy(`${DIR}/policy.json`);

function sig8(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }

async function raw(path) {
  const res = await fetch(`https://raw.githubusercontent.com/${OWNER}/Domain/${BRANCH}/${path}?t=${Date.now()}`, { headers: { 'User-Agent': 'sovereign-policy-gate' } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.text();
}

async function openDedupedIssue(title, body, refKind = null) {
  if (!TOKEN) { console.log(`(no token) would file issue: ${title}`); return; }
  try {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=open&per_page=100`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sovereign-policy-gate' } });
    if (!res.ok) { console.error(`issue search failed: ${res.status}`); return; }
    const existing = await res.json();
    if (existing.some(i => i.title === title)) return;
    // anti-storm refinement: an open issue already covering this ref+kind suppresses the duplicate
    if (refKind) {
      const [ref, kind] = refKind;
      const covered = existing.some(i => `${i.title}\n${i.body || ''}`.includes(`ref: \`${ref}\``) && `${i.title}\n${i.body || ''}`.includes(kind));
      if (covered) { console.log(`covered by open issue — suppressed: ${title}`); return; }
    }
    const cr = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'sovereign-policy-gate' },
      body: JSON.stringify({ title, body, labels: ['policy-gate', 'sovereign-stack'] })
    });
    console.log(`issue filed: ${cr.status} ${title}`);
  } catch (e) { console.error('issue filing failed (defer-not-fail):', e.message); }
}

// ---- read STASIS (fail-soft: absent file = brake not engaged, honestly labeled)
let stasisDoc = null, stasisErr = null;
try { stasisDoc = JSON.parse(await raw('agents/STASIS.json')); } catch (e) { stasisErr = e.message; }
const stasisActive = evaluateStasis(stasisDoc);
const stagedLanes = stasisDoc?.stagedLanes?.allow || [];
console.log(`STASIS: active=${stasisActive}${stasisErr ? ` (read failed: ${stasisErr} — treated as NOT engaged, recorded honestly)` : ''}`);

// ---- validate the xc intents book (last 24h window)
const dayAgo = Date.now() - 86400e3;
const xc = { verdicts: [], stats: null, err: null };
try {
  const doc = JSON.parse(await raw('dex/xc-intents.json'));
  const recent = (doc.intents || []).filter(i => i.openedAt ? Date.parse(i.openedAt) > dayAgo : true);
  for (const it of recent) {
    const v = validateIntent(it, policy, { stasisActive });
    xc.verdicts.push({ intentId: v.intentId, verdict: v.verdict, reasons: v.reasons, notionalUsd: v.notionalUsd, priced: v.priced, openedAt: it.openedAt || null });
  }
  xc.stats = { bookIntents: (doc.intents || []).length, validated24h: recent.length, protocol: doc.protocol };
} catch (e) { xc.err = e.message; }

// ---- validate the dex state tape (sweep/fill machine) — last 24h + aggregate ceilings
const st = { verdicts: [], err: null, aggregate: null };
try {
  const doc = JSON.parse(await raw('dex/state.json'));
  const tape = (doc.tape || []).filter(f => f.at ? f.at > dayAgo : true);
  const orders = (doc.orders || []).filter(o => o.at ? o.at > dayAgo : true);
  for (const f of tape) { const v = validateFill(f, policy, { stasisActive }); st.verdicts.push({ ...v, kind: 'fill' }); }
  for (const o of orders) { const v = validateFill(o, policy, { stasisActive }); st.verdicts.push({ ...v, kind: 'order' }); }
  const priced = tape.map(f => { const v = validateFill(f, policy); return { priced: v.priced, notionalUsd: v.notionalUsd, at: f.at }; });
  st.aggregate = validateAggregate(priced, policy);
} catch (e) { st.err = e.message; }

// ---- verdicts book
const counts = c => c.reduce((m, v) => { m[v.verdict] = (m[v.verdict] || 0) + 1; return m; }, {});
const verdicts = {
  protocol: 'SAOS-POLICY-GATE/1', generatedAt: stamp, runUrl: RUN_URL,
  stasis: { active: stasisActive, stagedLanes, readErr: stasisErr },
  xc, state: st,
  summary: { xc: counts(xc.verdicts), state: counts(st.verdicts) }
};
try { writeFileSync(`${DIR}/verdicts.json`, JSON.stringify(verdicts, null, 2) + '\n'); } catch (e) { console.error('write verdicts failed (defer-not-fail):', e.message); }

// ---- violations -> deduped claims + ONE issue
mkdirSync(CLAIMS, { recursive: true });
const seen = new Set();
for (const f of existsSync(CLAIMS) ? readdirSync(CLAIMS) : []) { try { seen.add(JSON.parse(readFileSync(`${CLAIMS}/${f}`, 'utf8')).sig); } catch {} }

function fileViolation(kind, ref, reasons, extra = {}) {
  const body = JSON.stringify({ kind, ref, reasons, ...extra });
  const sig = sig8(body);
  const claim = { sig, kind, ref, reasons, ...extra, firstSeenAt: stamp, lastSeenAt: stamp, status: 'open', runUrl: RUN_URL };
  try { writeFileSync(`${CLAIMS}/claim-${sig}.json`, JSON.stringify(claim, null, 2) + '\n'); } catch {}
  if (!seen.has(sig)) {
    openDedupedIssue(`policy violation: ${kind} ${ref} (sig ${sig})`,
      `**Layer 2 (PolicyAVS guardrail)**: the validator network REFUSES to sign.\n\n`
      + reasons.map(r => `- ${r}`).join('\n')
      + `\n\n- ref: \`${ref}\`\n- kind: \`${kind}\`\n- sig: \`${sig}\`\n- run: ${RUN_URL}\n`
      + `- law: this issue never re-opens for the same signature; persistent offenders are quarantined by claims-triage (the slashing analogue).`, [ref, kind]);
  }
}

if (stasisActive) fileViolation('stasis-brake-capital', 'STASIS.json', ['STASIS active — all capital verdicts ESCALATE (this issue fires once per engagement)'], { engagedAt: stamp });

for (const v of xc.verdicts) if (v.verdict !== 'PASS') fileViolation(v.verdict === 'ESCALATE' ? 'xc-escalate' : 'xc-reject', v.intentId || 'unknown-intent', v.reasons);
for (const v of st.verdicts) if (v.verdict !== 'PASS') fileViolation(v.verdict === 'ESCALATE' ? 'fill-escalate' : 'fill-reject', v.ref, v.reasons);
if (st.aggregate?.verdict === 'REJECT') fileViolation('aggregate-ceiling', 'dex/state.json tape 24h', st.aggregate.reasons, st.aggregate);

console.log(`policy-gate: xc ${JSON.stringify(counts(xc.verdicts))} state ${JSON.stringify(counts(st.verdicts))} aggregate=${st.aggregate?.verdict || 'n/a'} stasis=${stasisActive}`);
process.exit(0);
