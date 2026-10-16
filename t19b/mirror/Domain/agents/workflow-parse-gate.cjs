'use strict';
/**
 * workflow-parse-gate.cjs — Task 24 WORKFLOW-PARSE GATE (born from a real catch:
 * recruit.yml shipped with `${{ ... }}` inside flow mappings — GitHub rejected the
 * file at parse time, so EVERY push recorded a startup failure with 0 jobs and the
 * cron lane NEVER ran once. A dead lane wore a green-looking shape: our shape-scan
 * checked idioms, not parseability. The lesson, in the estate's own language:
 * a lane that cannot parse is a lane that cannot run — and nothing else caught it.
 *
 * What this gate does (two-mode parse, fail-soft, zero new deps):
 *   MODE full  — real YAML parse per file via python3+PyYAML (preinstalled on
 *                GitHub runners and in this sandbox; the strongest floor).
 *   MODE idiom — pure-JS fallback when no real parser exists: flags the exact
 *                broken class `${{ }}` inside a flow collection (`: {` ... `${{`
 *                on one line) — always a parse error, because the `}}` of the
 *                expression closes the flow map early.
 * A file passes only when its mode's floor passes. Evidence always names the
 * mode — an honest check says which floor held.
 *
 * Exports (white-box eval surface, E16):
 *   brokenIdiom(line)  → true/false (the pure predicate)
 *   scanDir(dir)       → { ok, scanned, mode, offenders:[{file,line,text}] }
 * CLI: `node agents/workflow-parse-gate.cjs [dir]` scans and writes
 *   agents/workflow-parse-gate.json + .md (MEASURABLE→DASHBOARD LAW), exit 0 always.
 */
const fs = require('fs');
const path = require('path');

const AG = __dirname;
const OUT_JSON = path.join(AG, 'workflow-parse-gate.json');
const OUT_MD = path.join(AG, 'workflow-parse-gate.md');

// The broken idiom, as a pure predicate: a flow collection opened on this line
// (`key: {`) AND a GitHub-Actions expression (`${{`) later on the SAME line.
// In YAML flow context the first `}}` closes the flow map — parse error, every time.
function brokenIdiom(line) {
  if (typeof line !== 'string') return false;
  if (line.trimStart().startsWith('#')) return false; // comments are inert
  const flowOpen = /(^|[\s\[])[:,]?\s*[A-Za-z0-9_.-]+:\s*\{/.test(line) || /:\s*\{/.test(line);
  return flowOpen && line.includes('${{');
}

let pyYaml = null; // memoized probe: null = unprobed, false = unavailable, string = command ok
function fullParseOk(file) {
  if (pyYaml === null) {
    try {
      const r = require('child_process').spawnSync('python3', ['-c', 'import yaml;yaml.safe_load("a: 1")'], { timeout: 30000, encoding: 'utf8' });
      pyYaml = r.status === 0;
    } catch (_) { pyYaml = false; }
  }
  if (pyYaml !== true) return null; // caller falls back to idiom mode
  const r = require('child_process').spawnSync('python3', ['-c', 'import yaml,sys\ntry:\n yaml.safe_load(open(sys.argv[1],encoding="utf-8"))\nexcept Exception as e:\n print("PARSE-FAIL",e); sys.exit(1)', file], { timeout: 30000, encoding: 'utf8' });
  return r.status === 0;
}

function scanDir(dir) {
  const offenders = [];
  let scanned = 0;
  let mode = 'full';
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')); } catch (_) { files = []; }
  for (const f of files) {
    const p = path.join(dir, f);
    let text = null;
    try { text = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
    scanned++;
    let parsed = fullParseOk(p);
    if (parsed === null) mode = 'idiom';
    const idiomHits = text.split('\n').map((line, i) => ({ line: i + 1, text: line.trim().slice(0, 120) })).filter((x) => brokenIdiom(x.text));
    for (const hit of idiomHits) offenders.push({ file: f, line: hit.line, text: hit.text, why: 'flow-collection contains ${{ }} — closes the flow map early (parse error)' });
    if (parsed === false && idiomHits.length === 0) offenders.push({ file: f, line: 0, text: '(full YAML parse failed — see python3 yaml output)', why: 'YAML parse error' });
  }
  return { ok: scanned > 0 && offenders.length === 0, scanned, mode, offenders };
}

module.exports = { brokenIdiom, scanDir };

if (require.main === module) {
  const ROOT = path.resolve(AG, '..');
  const dir = process.argv[2] || path.join(ROOT, '.github', 'workflows');
  const res = scanDir(dir);
  const at = new Date().toISOString();
  const book = { ok: true, at, agent: 'workflow-parse-gate v1.0.0 (Task 24: a lane that cannot parse is a lane that cannot run — recruit.yml startup-failure incident, never again)', dir: path.relative(ROOT, dir) || dir, ...res };
  try { fs.writeFileSync(OUT_JSON, JSON.stringify(book, null, 1) + '\n'); } catch (_) {}
  const md = ['# Workflow Parse Gate — every lane must be able to run', '', `_workflow-parse-gate v1.0.0 · ${at} · dir ${book.dir}_`, '', `**${res.ok ? `PARSE-GATE GREEN: ${res.scanned} workflows scanned, mode ${res.mode}, 0 offenders` : `PARSE-GATE RED: ${res.offenders.length} offenders across ${res.scanned} workflows`}**`, ''];
  for (const o of res.offenders) md.push(`- ✘ ${o.file}:${o.line} — ${o.why} — \`${o.text}\``);
  if (res.ok) md.push('- recruit.yml incident (Task 24): `${{ }}` inside flow mappings → GitHub startup-failure on every push, 0 jobs, cron never fired. Caught by the ONE-BLOC desk CI-health review; now mechanically gated here.');
  md.push('', '_Two-mode floor: full YAML parse (python3+PyYAML) where available, pure-JS idiom floor otherwise — evidence names the mode that held._');
  try { fs.writeFileSync(OUT_MD, md.join('\n') + '\n'); } catch (_) {}
  console.log(`workflow-parse-gate: ${res.ok ? 'GREEN' : 'RED'} · ${res.scanned} workflows · mode ${res.mode} · offenders ${res.offenders.length}`);
  process.exit(0);
}
