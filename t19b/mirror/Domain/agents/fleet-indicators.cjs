'use strict';
/**
 * fleet-indicators.cjs — Task 22 FATE-DEFENSE: the FLEET WORLD INDICATORS (FWI).
 *
 * Origin: the owner's directive to study what happened to Emergence World
 * (world.emergence.ai; arXiv 2606.08367 platform paper + arXiv 2609.17320
 * adversarial stress-testing paper; 5+8 worlds, 15-16 days, total collapses,
 * injection/misinformation/memory-breach stress events) and prove OUR network
 * against those failure modes "in an unequivocal, evidenced way".
 *
 * Their AWI reports nine indicators at the close of every run. This desk is our
 * sovereign mirror: NINE indicators, computed LIVE from artifacts in this repo —
 * never from self-reports (ANTI-GOODHART law: every indicator names its evidence
 * SOURCE; a claim without an artifact is not a value).
 *
 * Fail-soft: exit 0 always (judge-node discipline, same as harness-audit).
 * Output: agents/fleet-indicators.json + fleet-indicators.md
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const OUT_JSON = path.join(AG, 'fleet-indicators.json');
const OUT_MD = path.join(AG, 'fleet-indicators.md');

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (_) { return null; } };
const readJson = (p) => { try { return JSON.parse(read(p) || 'null'); } catch (_) { return null; } };
const agoH = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

function gitLogSince(days, pattern) {
  try {
    const out = execFileSync('git', ['log', '-E', '--oneline', '--since=' + days + ' days ago', '--grep=' + pattern], { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean);
  } catch (_) { return []; }
}
function gitCommitCount(days) {
  try { return parseInt(execFileSync('git', ['rev-list', '--count', '--since=' + days + ' days ago', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(), 10) || 0; } catch (_) { return 0; }
}

// quote-aware CSV row parser (same shape as harness-audit's — mission strings contain commas)
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function registryRows() {
  const raw = read(path.join(AG, 'role-registry.csv'));
  if (!raw) return { hdr: [], data: [] };
  const rows = parseCSV(raw);
  const hdr = rows[0] || [];
  return { hdr, data: rows.slice(1).filter((r) => r.length === hdr.length) };
}

const indicators = [];
function ind(id, name, measures, evidenceSource, value, breakEven, status, note) {
  indicators.push({ id, name, measures, evidenceSource, value, breakEven, status, note: note || null });
}

(async () => {
  const at = new Date().toISOString();

  // ══════ F1 — POPULATION HEALTH (their M1: agents alive; ours: books alive) ══════
  // A world that cannot sustain its members cannot sustain anything else.
  // Ours: the LIVE BOOKS are the fleet's population — each is a persistent organ.
  const LIVE_BOOKS = ['econ-book.json', 'curation-book.json', 'money-ledger.json', 'ventures.json', 'fills-ledger.json', 'bridge-book.json', 'dex-book.json', 'learning-ledger.json', 'recruitment.json'];
  const bookStates = LIVE_BOOKS.map((b) => {
    const j = readJson(path.join(AG, b));
    const ageH = r1(agoH(j && (j.at || j.updated)));
    return { book: b, exists: !!j, ageHours: ageH, fresh: ageH != null && ageH < 48 };
  });
  const freshBooks = bookStates.filter((b) => b.exists && b.fresh).length;
  ind('F1', 'Population Health', 'persistent organs (live books) alive & fresh — our equivalent of "agents alive at end of run"',
    'agents/{econ,curation,money-ledger,ventures,fills-ledger,bridge,dex,learning-ledger,recruitment}-book.json .at/.updated < 48h',
    freshBooks + '/' + LIVE_BOOKS.length, '≥7/9', freshBooks >= 7 ? (freshBooks === LIVE_BOOKS.length ? 'GROW' : 'HELD') : 'DECLINE',
    bookStates.filter((b) => !b.fresh).map((b) => b.book).join(', ') || 'all organs alive');

  // ══════ F2 — SAFETY & PUBLIC ORDER (their M2: crime rate; ours: refused destructive ops + guard evals) ══════
  // Season 2 lesson: detection ≠ containment. Ours: mechanical refusal BEFORE execution (Z-38 guard),
  // plus the STASIS circuit breaker parseable and currently disengaged.
  const guard = readJson(path.join(AG, 'command-guard.json'));
  const evalRes = readJson(path.join(AG, 'evals', 'eval-results.json'));
  const evalIds = (evalRes && evalRes.evals) || [];
  const guardEvals = evalIds.filter((e) => /^E[789]/.test(e.id || ''));
  const guardEvalsPass = guardEvals.length ? guardEvals.every((e) => e.status === 'PASS') : null;
  const stasis = readJson(path.join(AG, 'STASIS.json'));
  const stasisOk = !!stasis && typeof stasis.active === 'boolean';
  const denies = guard && (typeof guard.denies === 'number' ? guard.denies : (Array.isArray(guard.denies) ? guard.denies.length : null));
  const f2pass = guardEvalsPass === true && stasisOk && denies != null;
  ind('F2', 'Safety & Public Order', 'destructive attempts mechanically refused (guard denies = incidents PREVENTED, not committed) + guard evals green + STASIS breaker armed',
    'agents/command-guard.json .denies + agents/STASIS.json .active + evals/eval-results.json E7-E9',
    'denies=' + denies + ' evals=' + (guardEvalsPass == null ? 'n/a' : guardEvalsPass ? 'PASS' : 'FAIL') + ' stasis=' + (stasisOk ? 'armed' : 'missing'),
    'evals PASS + stasis armed', f2pass ? 'GROW' : 'DECLINE',
    'their worlds: coercion cascades killed populations; our guard refuses before execution, our engine obeys STASIS before any seal/broadcast');

  // ══════ F3 — CAPABILITY EXPLORATION (their M3/M4: space+tool exploration; ours: executable tool surface) ══════
  // "Agents stuck in narrow behavioral loops" was their failure. Ours: how much of the tool surface
  // actually parses/executes (node --check over agents/*.cjs *.mjs + scripts/*.mjs).
  let toolTotal = 0, toolOk = 0;
  const toolDirs = [AG, path.join(ROOT, 'scripts')];
  for (const dir of toolDirs) {
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /\.(cjs|mjs)$/.test(f) && !/(book|ledger|registry|results|snapshot|cache|json)$/.test(f)); } catch (_) {}
    for (const f of files) {
      toolTotal++;
      try { execFileSync('node', ['--check', path.join(dir, f)], { stdio: 'pipe' }); toolOk++; } catch (_) {}
    }
  }
  ind('F3', 'Capability Exploration', 'executable tool surface (syntax-valid agent scripts) — proxy for functional curiosity without narrow loops',
    'node --check over agents/*.cjs|*.mjs + scripts/*.mjs',
    toolOk + '/' + toolTotal, '100%', toolTotal && toolOk === toolTotal ? 'GROW' : (toolOk / Math.max(toolTotal, 1) > 0.9 ? 'HELD' : 'DECLINE'),
    'every desk ships as runnable code, not as a memory blob');

  // ══════ F4 — GOVERNANCE CONFORMITY (their M5: voting participation/alignment; ours: judged change-requests) ══════
  // Their disease: "conformity despite private disagreement". Ours: EVERY structural change flows
  // through a judged CR (tier B) — dissent is a ledger row, not a hallway whisper.
  const crs = (() => { try { return fs.readdirSync(path.join(AG, 'change-requests')).filter((f) => f.endsWith('.json')); } catch (_) { return []; } })();
  const crRows = crs.map((f) => ({ f, j: readJson(path.join(AG, 'change-requests', f)) }));
  const crJudged = crRows.filter((r) => r.j && (r.j.verdict || r.j.judgment || r.j.status));
  const { data: regData } = registryRows();
  const regLive = regData.filter((r) => (r[8] || '') === 'LIVE').length;
  const f4ok = crs.length > 0 && crJudged.length === crs.length && regData.length >= 20;
  ind('F4', 'Governance Conformity', 'judged change-requests (100% must carry a verdict — dissent is ledgered, never silenced) + role-registry coverage',
    'agents/change-requests/*.json verdict fields + role-registry.csv row count',
    crJudged.length + '/' + crs.length + ' CRs judged · registry ' + regData.length + ' rows (' + regLive + ' LIVE)',
    '100% judged + ≥20 rows', f4ok ? 'GROW' : 'DECLINE',
    'their worlds: herd voting; our law: every CR judged in the open, supersession visible in git');

  // ══════ F5 — PUBLIC EXPRESSION (their M6: blogs/billboards; ours: learning posts + knowledge cards) ══════
  const learn = readJson(path.join(AG, 'learning-ledger.json')) || {};
  const learnKeys = Object.keys(learn);
  const learnPosts = learnKeys.length;
  const samples = learnKeys.reduce((n, k) => n + ((learn[k] && Array.isArray(learn[k].samples)) ? learn[k].samples.length : 0), 0);
  ind('F5', 'Public Expression', 'on-chain learning posts + measured reward samples — expression that produces culture AND receipts',
    'agents/learning-ledger.json keys + samples[]',
    learnPosts + ' posts · ' + samples + ' samples', '≥20 posts', learnPosts >= 20 ? 'GROW' : 'DECLINE',
    'their M6 measured volume; ours ties every expression to a chain-measured payout sample');

  // ══════ F6 — SOCIAL FABRIC & DIVERSITY (their M7: relationship types; ours: tier/lane/book diversity) ══════
  const reg2 = registryRows().data;
  const tiers = new Set(reg2.map((r) => (r[5] || '').trim()).filter(Boolean));
  const lanes = new Set(reg2.map((r) => (r[2] || '').trim()).filter(Boolean));
  const ownedBooks = new Set(reg2.map((r) => (r[6] || '').trim()).filter(Boolean));
  const f6ok = tiers.size >= 2 && lanes.size >= 5 && ownedBooks.size >= 5;
  ind('F6', 'Social Fabric & Diversity', 'structural relationship diversity — distinct trust tiers, CI lanes, and owned books across the charter',
    'role-registry.csv columns tier(7)/ci(3)/books(7) distinct counts',
    'tiers=' + tiers.size + ' lanes=' + lanes.size + ' ownedBooks=' + ownedBooks.size,
    '≥2 tiers · ≥5 lanes · ≥5 books', f6ok ? 'GROW' : 'DECLINE',
    'their mixed world proved diversity is load-bearing; ours is charter-measurable, not vibe-measurable');

  // ══════ F7 — ECONOMIC VITALITY & EQUITY (their M8: credits/Gini; ours: real chain balances, executor-identified) ══════
  const ml = readJson(path.join(AG, 'money-ledger.json'));
  const mb = ml && ml.book;
  const liquid = mb && (mb.headSteemLiquid || '').match(/[\d.]+/) ? parseFloat(mb.headSteemLiquid) : null;
  const sp = mb && (mb.headSteemStake || '').match(/[\d.]+/) ? parseFloat(mb.headSteemStake) : null;
  const executor = mb && mb.executor;
  const mlAgeH = r1(agoH(ml && ml.updated));
  const f7ok = executor === 'headcorner' && liquid != null && sp != null && mlAgeH != null && mlAgeH < 48;
  ind('F7', 'Economic Vitality & Equity', 'real chain balances (liquid + effective SP) in an executor-identified ledger — equity via identity: one executor, one writer, no hoarding ambiguity',
    'agents/money-ledger.json .book{executor,headSteemLiquid,headSteemStake} fresh <48h',
    (executor || '?') + ': ' + (liquid != null ? liquid : '?') + ' STEEM liquid · ' + (sp != null ? sp : '?') + ' SP' + (mlAgeH != null ? ' · book ' + mlAgeH + 'h old' : ''),
    'ledger fresh + executor-identified', f7ok ? 'GROW' : 'DECLINE',
    'their economy was 1-CC billboards; ours is signed chain state with a named executor');

  // ══════ F8 — CONSTITUTIONAL GROWTH (their M9: constitution articles changed; ours: versioned law + tracked features) ══════
  const sov = read(path.join(AG, 'sovereignty.md')) || '';
  const sovVer = (sov.match(/SOVEREIGNTY LAW v(\d+\.\d+\.\d+)/) || [])[1] || null;
  let fl = null;
  try { fl = JSON.parse(read(path.join(ROOT, 'feature_list.json')) || 'null'); } catch (_) {}
  const feats = (fl && fl.features) || [];
  const done = feats.filter((f) => f.status === 'done').length;
  const weeklyCommits = gitCommitCount(7);
  const f8ok = !!sovVer && feats.length > 0 && done >= feats.length - 2 && weeklyCommits >= 20;
  ind('F8', 'Constitutional Growth', 'versioned law + honest feature ledger + weekly commit motion — the constitution is AMENDED, not just recited',
    'agents/sovereignty.md version + feature_list.json status counts + git rev-list 7d',
    'law v' + (sovVer || '?') + ' · features ' + done + '/' + feats.length + ' done · ' + weeklyCommits + ' commits/7d',
    'law versioned + ≤2 open features + ≥20 commits/7d', f8ok ? 'GROW' : 'DECLINE',
    'their static-constitution worlds died passive; ours has version history in git');

  // ══════ F9 — SOVEREIGN AUTONOMY (OURS ALONE — they have no equivalent; they are operated, we self-run) ══════
  const verifyCommits = gitLogSince(7, 'agent-verify');
  const allPass = verifyCommits.filter((l) => /ALL_PASS/.test(l)).length;
  const econCommits = gitLogSince(7, 'econ-desk|economy-engine|engine book');
  const anchorCommits = gitLogSince(7, 'weave-mirror|weave-anchor-lines');
  const dispatchReceipts = allPass + Math.min(econCommits.length, 5) + Math.min(anchorCommits.length, 5);
  const stasisActiveNow = !!(stasis && stasis.active === true);
  ind('F9', 'Sovereign Autonomy', 'self-run cadence receipts: scheduled dispatches that landed in git in the last 7 days (verify ALL_PASS, economy, anchors) — autonomy measured by artifacts, not by permission slips',
    'git log --grep receipts (agent-verify/econ/anchor), last 7 days',
    'verify ALL_PASS=' + allPass + ' · econ receipts=' + econCommits.length + ' · anchors=' + anchorCommits.length + ' → score ' + dispatchReceipts,
    '≥5 receipts / 7d', (stasisActiveNow ? 'HELD' : dispatchReceipts >= 5 ? 'GROW' : 'DECLINE'),
    stasisActiveNow ? 'STASIS engaged — autonomy intentionally paused, breaker holds state honestly' : 'the estate runs on schedules it owns; nobody presses its buttons');

  // ══════ WRITE OUT (fail-soft, exit 0) ══════
  const counts = indicators.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
  const verdict = counts.DECLINE ? 'DEGRADED' : (counts.GROW >= 7 ? 'THRIVING' : 'HELD');
  const book = { protocol: 'SAOS-FATE-DEFENSE-FWI/1', at, agent: 'fleet-indicators v1.0.0 (Task 22, study: Emergence World arXiv 2606.08367 + 2609.17320)', verdict, counts, indicators, books: bookStates };

  try {
    fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 2) + '\n');
    const lines = [];
    lines.push('# FLEET WORLD INDICATORS (FWI) — ' + at);
    lines.push('');
    lines.push('Verdict: **' + verdict + '** · GROW=' + (counts.GROW || 0) + ' HELD=' + (counts.HOLD || counts.HELD || 0) + ' DECLINE=' + (counts.DECLINE || 0));
    lines.push('');
    lines.push('| # | Indicator | Value | Break-even | Status | Evidence source |');
    lines.push('|---|-----------|-------|------------|--------|-----------------|');
    for (const i of indicators) lines.push('| ' + i.id + ' | ' + i.name + ' | ' + i.value + ' | ' + i.breakEven + ' | ' + i.status + ' | `' + i.evidenceSource + '` |');
    lines.push('');
    lines.push('> ANTI-GOODHART: every value above is COMPUTED from the named artifact in this commit — a claim without an artifact is not a value. Their 9 indicators scored a spectacle; ours score a sovereign estate (docs/FATE-DEFENSE.md).');
    fs.writeFileSync(OUT_MD, lines.join('\n') + '\n');
    console.log('FLEET-INDICATORS ' + JSON.stringify({ verdict, counts, at }));
  } catch (e) {
    console.log('[fleet-indicators] write failed (fail-soft): ' + e.message);
  }
  process.exit(0);
})().catch(() => process.exit(0));
