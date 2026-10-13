#!/usr/bin/env node
/**
 * laya-triage.cjs — advisory-only typed triage desk (Z-59, CR-0025).
 *
 * Wires the PROVEN laya serving surface (CR-0023: `laya.serve` HTTP, LAYA_MODELS=english,
 * 1312ms warm, Jev wire protocol) into the pulse as an ADVISORY input — it never casts,
 * gates, or flips dispositions. Its product is a book of typed decisions
 * (lane choice / urgency score / actionable noul) for the pulse's pending proposals.
 *
 * LAWS BOUND IN (measured, CR-0023):
 *   - SERVE-WINDOW LAW: the laya server is spawned per run and STOPPED at the end
 *     (RSS 2.08GB measured — never left resident in a 4GB sandbox).
 *   - ENGLISH-ONLY LAW: LAYA_MODELS=english always (multilingual checkpoint OOMs here).
 *   - UNCALIBRATED-CONFIDENCE LAW: laya's en checkpoint ships invalid temperatures
 *     (their own RuntimeWarning) — every row books confidence:"uncalibrated" and the
 *     book header repeats it; consumers must treat scores as ordering hints only.
 *   - ADVISORY-ONLY LAW: no file outside agents/laya-triage.* is written; no gate,
 *     proposal, or ledger mutation. Consumers (pulse/humans) decide.
 *
 * Env:
 *   LAYA_VENVPY  path to a python binary that has laya installed (e.g. /tmp/laya-venv/bin/python)
 *                — absent → honest row booked (this desk is a LOCAL-LANE serve-window desk;
 *                CI intentionally skips it: 2GB RAM + ~500MB checkpoint per run = off-budget).
 *   LAYA_TRIAGE_MAX  max proposals per window (default 8 — the RAM/time budget)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const AG = __dirname;
const log = (m) => console.log(`[laya-triage] ${m}`);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(AG, f), 'utf8')); } catch (_) { return null; } };
const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

const VENVPY = process.env.LAYA_VENVPY || '';
const MAX_ITEMS = Math.max(1, parseInt(process.env.LAYA_TRIAGE_MAX ?? '8', 10) || 8);
const PORT = parseInt(process.env.LAYA_TRIAGE_PORT ?? '3051', 10) || 3051;

function get(urlPath, body, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method: data ? 'POST' : 'GET', headers: data ? { 'content-type': 'application/json' } : {}, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout'))); req.on('error', () => resolve(null)); if (data) req.write(data); req.end();
  });
}

const QUESTIONS = {
  lane: {
    type: 'choice',
    instructions: 'Which fleet lane owns this item?',
    criteria: {
      market: 'DEX trades, bids, conversions, prices',
      runtime: 'agent runtime, shims, guards, serving, CRs',
      content: 'posts, curation, audience surfaces',
      treasury: 'fuel pacing, powerdown, balances, claims'
    }
  },
  urgency: { type: 'score', instructions: 'How urgent is acting on this item?', criteria: ['low', 'soon', 'blocking'] },
  actionable: { type: 'noul', instructions: 'Is this item actionable within one session today?' }
};

async function waitForHealth(deadlineMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    const h = await get('/health', null, 3000);
    if (h && h.status === 200) { try { return JSON.parse(h.body); } catch (_) { return null; } }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function main() {
  const rows = [];
  let serve = null;
  let serveReceipt = null;
  try {
    if (!VENVPY) {
      rows.push({ id: 'desk', status: 'SKIPPED-NO-VENV', detail: 'LAYA_VENVPY absent in this context — serve-window desk is local-lane only (CI off-budget by design: 2GB RAM + ~500MB checkpoint per run); advisory book honestly empty, nothing estimated' });
    } else if (!fs.existsSync(VENVPY)) {
      rows.push({ id: 'desk', status: 'SKIPPED-VENVPY-MISSING', detail: `LAYA_VENVPY=${VENVPY} does not exist on this host` });
    } else {
      // ---- serve-window opens
      serve = spawn(VENVPY, ['-m', 'laya.serve'], {
        env: { ...process.env, LAYA_HOST: '127.0.0.1', LAYA_PORT: String(PORT), LAYA_MODELS: 'english', LAYA_THREADS: '1', LAYA_PRELOAD: '1', HF_TELEMETRY_DISABLED: '1', DO_NOT_TRACK: '1', HF_HUB_DISABLE_TELEMETRY: '1' },
        stdio: ['ignore', 'ignore', 'pipe']
      });
      let serveErr = '';
      serve.stderr.on('data', (c) => (serveErr += String(c)));
      const health = await waitForHealth();
      if (!health) {
        rows.push({ id: 'desk', status: 'SKIPPED-SERVE-NO-HEALTH', detail: 'laya.serve did not become healthy within 120s', stderr_tail: serveErr.slice(-300) });
      } else {
        serveReceipt = { status: 'healthy', loaded: health.loaded, revision: health.revisions && health.revisions.english, device: health.device };
        // ---- items: pending proposals from the pulse book (read-only input)
        const pb = readJson('pulse-book.json');
        const props = (pb && Array.isArray(pb.proposals) ? pb.proposals : [])
          .filter((p) => p && p.id && p.action)
          .slice(0, MAX_ITEMS);
        for (const p of props) {
          const state = `${p.kind} | ${p.action} | source: ${p.source || 'unknown'} | receipt: ${String(p.receipt || '').slice(0, 40)}`;
          const t0 = Date.now();
          const r = await get('/v1/systemone', { state, questions: QUESTIONS, model: 'english' });
          const ms = Date.now() - t0;
          if (!r || r.status !== 200) {
            rows.push({ id: p.id, kind: p.kind, status: 'UPSTREAM-FAIL', latency_ms: ms, detail: r ? `http ${r.status}: ${r.body.slice(0, 120)}` : 'no response' });
            continue;
          }
          try {
            const j = JSON.parse(r.body);
            const a = j.answers || {};
            rows.push({
              id: p.id,
              kind: p.kind,
              status: 'TRIAGED',
              latency_ms: ms,
              lane: a.lane ? a.lane.choice : null,
              lane_confidence: a.lane ? a.lane.answer_confidence : null,
              urgency: a.urgency ? a.urgency.score : null,
              urgency_label: a.urgency && a.urgency.score != null ? (a.urgency.score < 0.5 ? 'low' : a.urgency.score < 1.5 ? 'soon' : 'blocking') : null,
              actionable_yes_prob: a.actionable ? a.actionable.noul : null,
              routing: j.routing ? j.routing.model : null,
              confidence: 'uncalibrated (en checkpoint ships invalid temperatures — laya RuntimeWarning, CR-0023)'
            });
          } catch (e) { rows.push({ id: p.id, kind: p.kind, status: 'PARSE-FAIL', detail: String(e).slice(0, 120) }); }
        }
        if (props.length === 0) rows.push({ id: 'desk', status: 'NO-CANDIDATE', detail: 'no pending proposals in pulse-book.json this window (honest empty)' });
      }
    }
  } finally {
    // ---- serve-window closes ALWAYS (SERVE-WINDOW LAW)
    if (serve) { try { serve.kill('SIGTERM'); } catch (_) {} }
  }

  const triaged = rows.filter((r) => r.status === 'TRIAGED');
  const book = {
    ok: true,
    at,
    agent: 'laya-triage v1.0.0 (Z-59, CR-0025 — advisory-only serve-window desk over the CR-0023 serving proof)',
    laws: ['SERVE-WINDOW (spawned per run, stopped in finally)', 'ENGLISH-ONLY (LAYA_MODELS=english — multilingual OOMs)', 'UNCALIBRATED-CONFIDENCE (en ckpt invalid temperatures — ordering hints only)', 'ADVISORY-ONLY (no gate/proposal/ledger mutation; this book is the only artifact)'],
    serve: serveReceipt || 'not opened this run (honest)',
    counts: { candidates: rows.filter((r) => r.id !== 'desk').length, triaged: triaged.length, skipped: rows.filter((r) => r.status.startsWith('SKIPPED') || r.status === 'NO-CANDIDATE' || r.status === 'UPSTREAM-FAIL' || r.status === 'PARSE-FAIL').length },
    rows,
    note: 'advisory input for the pulse/humans — lane ownership + urgency ordering; scores are NOT calibrated probabilities'
  };
  fs.writeFileSync(path.join(AG, 'laya-triage.json'), JSON.stringify(book, null, 2) + '\n');

  const md = [`# laya advisory triage — ${at}`, '',
    'ADVISORY-ONLY (CR-0025): typed lane/urgency hints for the pending pulse proposals. Confidence is UNCALIBRATED by the checkpoint own admission — ordering hints, never probabilities.', '',
    `serve: ${serveReceipt ? `healthy (loaded=${(serveReceipt.loaded || []).join(',')})` : 'not opened'}`, '',
    '| item | lane | urgency | actionable(p-yes) | latency |', '|---|---|---|---|---|'];
  for (const r of triaged) md.push(`| ${r.id} | ${r.lane} | ${r.urgency_label} (${r.urgency}) | ${r.actionable_yes_prob} | ${r.latency_ms}ms |`);
  for (const r of rows.filter((x) => x.status !== 'TRIAGED')) md.push(`| ${r.id} | ${r.status} | — | — | — |`);
  fs.writeFileSync(path.join(AG, 'laya-triage.md'), md.join('\n') + '\n');

  log(`${book.counts.triaged} triaged / ${book.counts.skipped} skipped of ${book.counts.candidates} candidates (advisory-only)`);
}

main().catch((e) => { log('fatal: ' + (e && e.message)); process.exit(1); });
