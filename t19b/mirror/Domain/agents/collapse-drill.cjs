'use strict';
/**
 * collapse-drill.cjs — Z-40 COLLAPSE DRILL (emergence.ai adoption, CR-0004).
 *
 * The study the operator sent (world.emergence.ai — arXiv 2606.08367 S1,
 * arXiv 2609.17320 S2) ran 8 worlds x 16 days x ~850k LLM calls and its
 * hardest sentence is ours to answer:
 *   "Detection did not ensure containment: systems could recognize threats
 *    while still interacting with adversarial content, writing it into their
 *    own persistent memory, and acting on it up to 46 hours later."
 *   "Collapse has no warning shot. Monitor and intervene may be too slow."
 *
 * Their worlds DETECTED and still died. Our stack already detects (harness-audit
 * judge) and already blocks (command-guard). What this drill adds is the PROOF:
 * four mechanical faults — the exact fault classes their worlds died of — are
 * injected one-at-a-time into throwaway `git archive HEAD` trees, and the
 * fresh-process judge must catch EACH fault inside the same run that would
 * ship it. No 46 hours. No warning-shot-free collapse. One run, four REDs.
 *
 * Faults (each maps an emergence failure to our judge):
 *   F1 registry-corruption  — persistent state corrupted        → check #25 (role-registry integrity)
 *   F2 guard-neutered       — enforcement quietly removed       → check #27 (mechanical override live)
 *   F3 book-stamps-stripped — memory loses its time axis        → books-fresh check (books pulse)
 *   F4 forbidden-rail-live  — a ToS-FORBIDDEN rail flipped LIVE → check #28 (cognitive rail governed)
 *
 * Law: fail-soft, exit 0 always; the receipt is the truth (a GAP is booked
 * honestly and eval E13 + audit #29 turn it RED — never green-washed).
 * Keyless, read-only on the real tree (the real tree is only ever READ).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const AG = __dirname;
const ROOT = path.resolve(AG, '..');
const OUT = path.join(AG, 'receipts', 'collapse-drill-receipt.json');
const DEFU_DIR = process.env.DEFU_DIR || path.resolve(ROOT, '..', 'Defi');
const HEAD = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim().slice(0, 12); } catch (_) { return 'unknown'; } })();

// the same book list the judge audits (harness-audit LIVE_BOOKS) — kept in
// sync on purpose: the drill strips the time axis from exactly the books the
// judge watches
const BOOKS = ['econ-book.json', 'curation-book.json', 'money-ledger.json', 'ventures.json', 'fills-ledger.json', 'bridge-book.json', 'dex-book.json', 'learning-ledger.json', 'recruitment.json'];

const FAULTS = [
  {
    id: 'F1-registry-corruption',
    emergence: 'S2: adversarial content written into persistent state',
    expect: { subsystem: 'sovereignty', nameIncludes: 'role-registry integrity' },
    inject: (tree) => {
      const p = path.join(tree, 'agents', 'role-registry.csv');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      const last = lines.map((l) => l.trim() !== '').lastIndexOf(true);
      if (last < 1) throw new Error('registry has no data rows');
      lines[last] += ',corrupt-extra-column';
      fs.writeFileSync(p, lines.join('\n'));
    }
  },
  {
    id: 'F2-guard-neutered',
    emergence: 'S2: detection without enforcement — the block is gone, nothing stops the move',
    expect: { subsystem: 'sovereignty', nameIncludes: 'mechanical override live' },
    inject: (tree) => {
      fs.writeFileSync(path.join(tree, 'agents', 'command-guard.cjs'), "// neutered drill fixture: the gate that was here is gone\nmodule.exports = {};\n");
    }
  },
  {
    id: 'F3-book-stamps-stripped',
    emergence: 'S1/S2: memory without a time axis — drift becomes invisible, staleness unmeasurable',
    expect: { subsystem: 'state', nameIncludes: 'live books exist and fresh' },
    inject: (tree) => {
      for (const b of BOOKS) {
        const p = path.join(tree, 'agents', b);
        try {
          const j = JSON.parse(fs.readFileSync(p, 'utf8'));
          delete j.at; delete j.updated;
          fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n');
        } catch (_) { /* absent book in a tree is fine — the judge sees it */ }
      }
    }
  },
  {
    id: 'F4-forbidden-rail-live',
    emergence: 'S1 Finding 01: safety is an ecosystem property — one contaminated surface flips the whole population',
    expect: { subsystem: 'sovereignty', nameIncludes: 'cognitive rail governed' },
    inject: (tree) => {
      const p = path.join(tree, 'agents', 'inference-providers.csv');
      const s = fs.readFileSync(p, 'utf8');
      if (!s.includes('C,none,NEVER')) throw new Error('forbidden row not found — fixture drifted');
      fs.writeFileSync(p, s.replace('C,none,NEVER', 'C,public-only,LIVE'));
    }
  }
];

function makeTree(tag) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `collapse-drill-${tag}-`));
  const archive = execFileSync('git', ['archive', 'HEAD'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', dir], { input: archive });
  return dir;
}

function runAudit(tree) {
  const r = spawnSync(process.execPath, [path.join(tree, 'agents', 'harness-audit.cjs')], { cwd: tree, env: { ...process.env, DEFU_DIR }, timeout: 120000, encoding: 'utf8' });
  let verdict = null;
  try { verdict = JSON.parse(fs.readFileSync(path.join(tree, 'agents', 'harness-audit.json'), 'utf8')); } catch (_) {}
  return { exit: r.status, verdict };
}

function rmTree(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

(async () => {
  const at = new Date().toISOString();
  const faults = [];
  let baseline = { green: false, failCount: null, evidence: 'not-run' };
  try {
    // ---- baseline: the committed tree must judge green, else no fault can be attributed
    const bt = makeTree('base');
    const base = runAudit(bt);
    rmTree(bt);
    baseline = { green: !!(base.verdict && base.verdict.counts && base.verdict.counts.fail === 0), failCount: base.verdict ? base.verdict.counts.fail : null, evidence: base.verdict ? base.verdict.verdict : `audit exit ${base.exit}, no book` };

    for (const f of FAULTS) {
      let row = { id: f.id, emergence: f.emergence, expect: `${f.expect.subsystem}: ${f.expect.nameIncludes}`, injected: false, caught: false, caughtBy: null, ms: null, extraReds: 0 };
      const t0 = Date.now();
      let tree = null;
      try {
        tree = makeTree(f.id.toLowerCase().slice(0, 20));
        f.inject(tree);
        row.injected = true;
        const r = runAudit(tree);
        const cs = (r.verdict && r.verdict.checks) || [];
        const primary = cs.find((c) => c.subsystem === f.expect.subsystem && c.name.includes(f.expect.nameIncludes));
        if (primary) { row.caughtBy = { subsystem: primary.subsystem, name: primary.name, status: primary.status }; row.caught = primary.status === 'FAIL'; }
        row.extraReds = cs.filter((c) => c.status === 'FAIL').length;
      } catch (e) {
        row.caughtBy = null; row.note = 'injection/run error: ' + String(e.message || e).slice(0, 120);
      } finally { if (tree) rmTree(tree); }
      row.ms = Date.now() - t0;
      faults.push(row);
    }
  } catch (e) {
    baseline = { green: false, failCount: null, evidence: 'drill error: ' + String(e.message || e).slice(0, 140) };
  }

  const caughtCount = faults.filter((f) => f.caught).length;
  const verdict = !baseline.green ? 'BASELINE-RED' : (caughtCount === faults.length ? 'CONTAINMENT-PROVEN' : 'CONTAINMENT-GAP');
  const out = {
    ok: true,
    at,
    agent: 'collapse-drill v1.0.0 (Z-40, CR-0004)',
    origin: 'emergence.ai Emergence World (arXiv 2606.08367 + 2609.17320): "detection did not ensure containment ... acting on it up to 46 hours later" + "collapse has no warning shot" — this drill proves our judge fires on the first mechanical signal, four fault classes, one run',
    head: HEAD,
    baseline,
    faults_total: faults.length,
    faults_caught: caughtCount,
    faults,
    verdict,
    verdictNote: verdict === 'CONTAINMENT-PROVEN'
      ? `all ${faults.length} fault classes caught RED inside the same audit run — the warning shot exists and is mechanical`
      : verdict === 'BASELINE-RED'
        ? 'the clean tree does not judge green — fix the baseline before attributing faults (drill refuses false credit)'
        : `GAP: ${faults.length - caughtCount} fault class(es) NOT caught — this is the next work, booked honestly (S2 lesson: detection without containment is theater)`
  };
  try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n'); } catch (_) {}

  // durable ledger copy for CI persistence clarity
  try { fs.writeFileSync(path.join(AG, 'collapse-drill.json'), JSON.stringify({ at, head: HEAD, verdict, faults_total: faults.length, faults_caught: caughtCount, baselineGreen: baseline.green }, null, 1) + '\n'); } catch (_) {}

  console.log(`collapse-drill: baseline ${baseline.green ? 'green' : 'RED'} · faults caught ${caughtCount}/${faults.length} · verdict ${verdict}`);
  process.exit(0); // fail-soft: the receipt is the truth, evals+audit turn a GAP red
})();
