#!/usr/bin/env node
/* SCHEDULER-HEAL (CR-0056, fleet Rung 27 — THE METRONOME AUDIT, bounded heal) —
 * reads agents/scheduler-audit.json sections.heal.candidates (STARVED ∧ keyless ∧
 * not-host ∧ not-keeper, cap 3, computed by the pure desk) and dispatches each via the
 * built-in GITHUB_TOKEN (workflow_dispatch on THIS repo, actions:write). The cadences
 * the platform stopped firing are re-fired by the fleet itself — with receipts.
 *
 * LAWS:
 *  · the LIST is the desk's, never this script's — the healer invents nothing.
 *  · bounded by the cap already encoded in the book (HEAL.cap = 3).
 *  · keyless (GITHUB_TOKEN); no owner secret is touched, no signing, no broadcasting.
 *  · STASIS-safe: the dispatched workflows are the fleet's own STASIS-braked desks;
 *    if the breaker is active they no-op by law (two independent gates, one law).
 *  · fail-soft per candidate; exit 0 always. Receipts printed, never secret material.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const BOOK = path.join(ROOT, 'agents', 'scheduler-audit.json');
const REPO = process.env.GITHUB_REPOSITORY || 'roshpinacare-sys/Domain';

function dispatch(token, file) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ ref: 'main' });
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${REPO}/actions/workflows/${file}/dispatches`,
      method: 'POST',
      headers: {
        Authorization: 'token ' + token,
        'User-Agent': 'saos-scheduler-heal',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 20000,
    }, (res) => {
      res.resume();
      resolve({ status: res.statusCode });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e).slice(0, 90) }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  if (process.env.SCHEDULER_HEAL_SKIP === '1') { console.log('SCHEDULER-HEAL SKIP (SCHEDULER_HEAL_SKIP=1)'); return; }
  let book = null;
  try { book = JSON.parse(fs.readFileSync(BOOK, 'utf8')); } catch (_) { book = null; }
  const candidates = book && book.sections && Array.isArray(book.sections.heal && book.sections.heal.candidates)
    ? book.sections.heal.candidates.filter((f) => typeof f === 'string' && /\.ya?ml$/.test(f))
    : [];
  if (candidates.length === 0) { console.log('SCHEDULER-HEAL nothing to heal (the book lists no candidates)'); return; }
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) { console.log('SCHEDULER-HEAL no GH_TOKEN — the heal stays booked, unfired (honest)'); return; }
  for (const file of candidates) {
    const r = await dispatch(token, file);
    if (r.status === 204) console.log(`SCHEDULER-HEAL dispatched ${file} (HTTP 204 — the pulse re-fired by the fleet)`);
    else console.log(`SCHEDULER-HEAL ${file} dispatch failed (HTTP ${r.status}${r.error ? ' ' + r.error : ''}) — the book already records the starvation honestly`);
  }
  console.log(`SCHEDULER-HEAL done · ${candidates.length} candidate(s), cap ${book.sections.heal.cap}`);
}

try { main().catch((e) => { console.log('SCHEDULER-HEAL ERROR (fail-soft): ' + String(e.message || e).slice(0, 120)); process.exitCode = 0; }); } catch (e) { console.log('SCHEDULER-HEAL ERROR (fail-soft): ' + String(e.message || e).slice(0, 120)); process.exitCode = 0; }
module.exports = {};
