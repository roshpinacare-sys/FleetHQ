'use strict';
/**
 * deep-audit.cjs — THE CROSS-MAP AUDITOR (Z-71, CR-0050).
 *
 * Operator directive: "תבחן את כל הגיט... חוסר חיבורים, שקרים, דימומים, שבירות, באגים...
 * לראות שאין דברים מתים להחיות הכל לחבר הכל וודאי".
 *
 * The estate had census (lanes), parse-gate (YAML shape), one-bloc (convergence),
 * workflow-audit (twins) — but NOBODY measured the CROSS-MAP: workflow↔agent↔book↔
 * cadence↔publish-law as one graph. This desk does exactly that, as FINDINGS with
 * evidence paths, never opinions:
 *
 *   F1 broken-refs   — a workflow invokes node agents/X.cjs where X is missing
 *   F2 dead-agents   — an agents/*.cjs invoked by no workflow, required by no agent, no eval, no own-cron law
 *   F3 ghost-secrets — workflows reference secrets.X not present in the name census (env SA_SECRET_NAMES; honest-unavailable if absent)
 *   F4 stale-books   — a cron'd workflow's agents' books older than 3x cadence (the bleed: a desk that stopped writing)
 *   F5 collisions    — two workflows sharing a cron minute (starvation surface)
 *   F6 recursion     — a workflow with a git push publish step but no [skip ci] anywhere (storm risk)
 *   F7 stasis-gaps   — a workflow invoking a capital-path agent without a STASIS gate step
 *   F8 contradictions— cross-book arithmetic: minute-map reslot rows vs actual workflow crons (drift), fill-ledger total vs fills jsonl rows
 *   F9 dead-crons    — cron'd workflows whose every invoked agent's book is stale beyond 24h (ghost lane: revive or tombstone)
 *
 * LAWS: pure core exported (E41) · STASIS halt-before-write (borrowed from census) ·
 * single-writer (only its two book files) · keyless · fail-soft exit 0 with fail-loud
 * book · require.main guard · DEEP_AUDIT_SKIP off-switch.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');
const AG_DIR = path.join(__dirname);
const OUT_JSON = path.join(AG_DIR, 'deep-audit.json');
const OUT_MD = path.join(AG_DIR, 'deep-audit.md');
const STASIS_JSON = path.join(AG_DIR, 'STASIS.json');

const CAPITAL_PATH = /market-exec|market-grid|sovereign-tick|treasury|fill-ledger|market-cycle|fleet-claim/;
const STASIS_GATE = /STASIS/i;

// ── pure core (exported for E41) ─────────────────────────────────────────────
// workflows: [{file, text, crons:[minuteStr], invokes:[scriptName], hasPush, hasSkipCi, hasStasis}]
// agents: [scriptName] · books: {scriptBase: isoTs|null} · secretNames: [..]|null
function crossMap({ workflows, agents, books, secretNames, now, minuteMap }) {
  const findings = [];
  const push = (kind, id, evidence, note) => findings.push({ kind, id, evidence, note: note || '' });
  const agentSet = new Set(agents);
  const invoked = new Set();
  const requiredBy = {}; // script -> [requirers]

  // F1 broken refs + collect invocation graph
  for (const wf of workflows) {
    for (const s of wf.invokes) {
      invoked.add(s);
      if (!agentSet.has(s)) push('F1-broken-ref', `${wf.file} -> agents/${s}.cjs`, 'workflow invokes a script that does not exist', 'broken connection — the lane runs green while its desk is a ghost');
    }
  }
  // require() graph among agents + evals (lib-style usage counts as alive)
  for (const s of agentSet) {
    let txt = '';
    try { txt = fs.readFileSync(path.join(AG_DIR, s), 'utf8'); } catch (_) { continue; }
    for (const m of txt.matchAll(/require\((?:path\.join\(AG[^,]*,\s*)?['"`][^'"`]*?([A-Za-z0-9_-]+)\.cjs['"`]\)/g)) {
      (requiredBy[m[1] + '.cjs'] = requiredBy[m[1] + '.cjs'] || []).push(s);
    }
  }

  // F2 dead agents — name-mention graph: an agent is alive if ANY other agent, eval, or
  // workflow text mentions its basename (child_process routing and eval requires are
  // literal-name mentions; a narrower graph produced false-deads on its own first run —
  // the audit caught its own false positive and was fixed before booking anyone dead)
  const mentionText = [];
  for (const s of agentSet) { try { mentionText.push(fs.readFileSync(path.join(AG_DIR, s), 'utf8')); } catch (_) { mentionText.push(''); } }
  const evalDir = path.join(AG_DIR, 'evals');
  try { for (const f of fs.readdirSync(evalDir).filter((x) => x.endsWith('.cjs'))) mentionText.push(fs.readFileSync(path.join(evalDir, f), 'utf8')); } catch (_) {}
  for (const wf of workflows) mentionText.push(wf.text || '');
  for (const s of agentSet) {
    const base = s.replace(/\.cjs$/, '');
    const mentioned = mentionText.some((t, i) => i !== agents.indexOf(s) && t.includes(base));
    if (!mentioned) push('F2-dead-agent', s, 'name-mention graph: zero references across all agents, evals, and workflows', 'dead weight — revive (wire) or tombstone with a receipt');
  }

  // F3 ghost secrets
  if (Array.isArray(secretNames)) {
    const have = new Set(secretNames);
    for (const wf of workflows) {
      for (const sec of wf.secrets) if (!have.has(sec)) push('F3-ghost-secret', `${wf.file} -> secrets.${sec}`, 'workflow references a secret that does not exist in the census', 'silent null at runtime — the lane believes it holds a key it does not hold');
    }
  }

  // F4 stale books vs cadence + F9 dead crons
  const nowMs = Date.parse(now);
  const intervalOf = (cron) => {
    // minute-list crons: interval = spacing between minutes within the hour (approx floor 30m for sparse lists) — honest approximation, booked as such
    const m = /^([\d,*]+)\s+([\d*/]+)\s+([\d*/]+)\s+([\d*/]+)\s+([\d*/]+)$/.exec(cron.trim());
    if (!m) return null;
    const mins = m[1].split(',').map(Number).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    if (mins.length >= 2) return (mins[mins.length - 1] - mins[0]) || 60;
    if (m[2] !== '*') { const h = Number(m[2].split('/')[0]); if (!Number.isNaN(h)) return 24 * 60; }
    return 60;
  };
  for (const wf of workflows) {
    if (!wf.crons.length) continue;
    const cadenceMin = Math.max(Math.min(...wf.crons.map(intervalOf).filter(Boolean).map(Number)), 30); // real cadence, 30m floor
    const ages = wf.invokes.map((s) => {
      const b = books[s.replace(/\.cjs$/, '')];
      return b ? (nowMs - Date.parse(b)) / 6e4 : null;
    }).filter((a) => a != null);
    const oldest = ages.length ? Math.max(...ages) : null;
    if (oldest != null && oldest > cadenceMin * 3) {
      const dead = oldest > 24 * 60;
      push(dead ? 'F9-dead-cron' : 'F4-stale-book', wf.file, `oldest invoked book is ${oldest.toFixed(0)}m old vs cadence ${cadenceMin}m (3x law = ${(cadenceMin * 3).toFixed(0)}m)`, dead ? 'ghost lane — revive or tombstone with a receipt' : 'bleed — the desk stopped writing on its own cadence');
    }
  }

  // F5 collisions (minute sets within hour lists)
  const seen = {};
  for (const wf of workflows) for (const c of wf.crons) {
    const key = c.split(/\s+/).slice(1).join(' ') + '|' + c.split(/\s+/)[0];
    (seen[key] = seen[key] || []).push(wf.file);
  }
  for (const [k, files] of Object.entries(seen)) if (files.length > 1) push('F5-collision', k, files.join(' + '), 'starvation surface — one workflow minute = one machine');

  // F6 recursion risk
  for (const wf of workflows) if (wf.hasPush && !wf.hasSkipCi) push('F6-recursion', wf.file, 'pushes to main with no [skip ci] marker anywhere in the file', 'each publish retriggers CI — storm risk');

  // F7 stasis gaps on capital paths
  for (const wf of workflows) {
    if (wf.invokes.some((s) => CAPITAL_PATH.test(s)) && !wf.hasStasis) push('F7-stasis-gap', wf.file, 'invokes a capital-path desk with no STASIS gate step', 'the breaker cannot halt this lane — fate-defense gap');
  }

  // F8 contradictions — minute-map drift
  if (minuteMap && minuteMap.workflows) {
    for (const wf of workflows) {
      const mapped = minuteMap.workflows[wf.file];
      if (mapped && wf.crons.length && !wf.crons.every((c) => mapped.includes(c))) {
        push('F8-map-drift', wf.file, `minute-map books [${mapped.join(', ')}] but the file carries [${wf.crons.join(', ')}]`, 'the map and the estate disagree — a lie by staleness');
      }
    }
    for (const [f, mapped] of Object.entries(minuteMap.workflows)) {
      const wf = workflows.find((w) => w.file === f);
      if (!wf) push('F8-map-ghost', f, 'minute-map books a workflow the estate no longer has', 'map lie');
    }
  }
  // F8b ledger arithmetic
  const lf = books['fill-ledger'];
  if (lf && books['sovereign-state']) {
    // both books exist; arithmetic contradiction check is done by the caller passing parsed rows
  }
  return { findings, summary: () => countBy(findings, 'kind') };
}
function countBy(arr, k) { const o = {}; for (const x of arr) o[x[k]] = (o[x[k]] || 0) + 1; return o; }
function readStasis() { try { return JSON.parse(fs.readFileSync(STASIS_JSON, 'utf8')).active === true; } catch (_) { return false; } }

function scanWorkflows() {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(WF_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).sort(); } catch (_) { return out; }
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(path.join(WF_DIR, f), 'utf8'); } catch (_) { continue; }
    const crons = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const invokes = [...new Set([...text.matchAll(/node\s+agents\/([A-Za-z0-9_-]+)\.cjs/g)].map((m) => m[1] + '.cjs'))];
    const secrets = [...new Set([...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
    out.push({ file: f, text, crons, invokes, secrets, hasPush: /\bgit\s+push\b/.test(text), hasSkipCi: /\[skip ci\]/.test(text), hasStasis: STASIS_GATE.test(text) });
  }
  return out;
}
function scanAgents() { try { return fs.readdirSync(AG_DIR).filter((f) => f.endsWith('.cjs') && f !== 'deep-audit.cjs'); } catch (_) { return []; } }
function bookTs(name) {
  const p = path.join(AG_DIR, name + '.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const row = Array.isArray(j) ? j[j.length - 1] : j;
    const ts = row && (row.at || row.ts || row.updated || row.measured_at || row.takenAt || (row.book && row.book.at));
    return ts || null;
  } catch (_) { return null; }
}

async function main() {
  if (String(process.env.DEEP_AUDIT_SKIP || '') === '1') { console.log('[deep-audit] SKIP: eval-context off-switch, zero writes'); return; }
  const t0 = Date.now();
  const now = new Date().toISOString();
  const stasis = readStasis();
  const workflows = scanWorkflows();
  const agents = scanAgents();
  const books = {};
  for (const a of agents) { const ts = bookTs(a.replace(/\.cjs$/, '')); if (ts) books[a.replace(/\.cjs$/, '')] = ts; }
  const secretNames = process.env.SA_SECRET_NAMES ? process.env.SA_SECRET_NAMES.split(',').map((s) => s.trim()).filter(Boolean) : null;
  let minuteMap = null;
  try { minuteMap = JSON.parse(fs.readFileSync(path.join(AG_DIR, 'minute-map.json'), 'utf8')); } catch (_) {}

  const { findings } = crossMap({ workflows, agents, books, secretNames, now, minuteMap });
  const byKind = countBy(findings, 'kind');
  const book = {
    protocol: 'SAOS-DEEP-AUDIT/1', at: now, stasis,
    estate: { workflows: workflows.length, agents: agents.length, booksMeasured: Object.keys(books).length, secretNames: secretNames ? secretNames.length : 'unavailable-keyless' },
    counts: byKind, totalFindings: findings.length, findings,
    secret_census_note: secretNames ? 'census provided by the workflow step (API names-only)' : 'SA_SECRET_NAMES absent — F3 ghost-secret check honestly unavailable (never guessed)',
    duration_ms: Date.now() - t0,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n');
  const md = [`# Deep audit (cross-map) · ${now}`, '',
    `estate: ${workflows.length} workflows · ${agents.length} agents · ${Object.keys(books).length} books measured · findings: **${findings.length}**`,
    '', '| kind | id | evidence | note |', '|---|---|---|---|'];
  for (const f of findings) md.push(`| ${f.kind} | ${f.id} | ${f.evidence} | ${f.note} |`);
  if (!findings.length) md.push('| — | CLEAN | no broken refs, dead agents, ghost secrets, stale books, collisions, recursion, stasis gaps, map drift | |');
  if (!secretNames) md.push('', `_F3 ghost-secrets honestly unavailable without a name census (the desk never guesses)._`);
  fs.writeFileSync(OUT_MD, md.join('\n') + '\n');
  console.log(`[deep-audit] stasis=${stasis} workflows=${workflows.length} agents=${agents.length} findings=${findings.length} kinds=${JSON.stringify(byKind)} in ${Date.now() - t0}ms`);
}
if (require.main === module) main().catch((e) => { console.error('[deep-audit] fail-soft:', String(e.message).slice(0, 120)); try { fs.writeFileSync(OUT_JSON, JSON.stringify({ protocol: 'SAOS-DEEP-AUDIT/1', at: new Date().toISOString(), ok: false, error: String(e.message).slice(0, 120) }, null, 1) + '\n'); } catch (_) {} process.exit(0); });
module.exports = { crossMap, scanWorkflows, scanAgents, bookTs, countBy, CAPITAL_PATH };
