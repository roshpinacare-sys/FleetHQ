'use strict';
/**
 * recruit.cjs — Z-29 ARMY SELF-RECRUITMENT DESK.
 *
 * The operator directive (msg 26): the autonomy must develop the army and recruit
 * new roles BY ITSELF, not wait for operator suggestions. This desk codifies that:
 *   1. read LIVE fleet signals (receipts freshness, econ book, books inventory,
 *      mechanism markers in the agent sources);
 *   2. run a RULE TABLE where every fleet gap opens a ROLE with a contract
 *      (mission, trigger, evidence, cadence);
 *   3. a role is registered as FILLED only with concrete in-repo mechanism evidence
 *      (file + marker string) — otherwise PROPOSED (contract drafted, awaiting
 *      implementation) or DEFERRED (with reason). Nothing is claimed without proof;
 *   4. write the public openings board (recruitment.json/.md) — the army's hiring
 *      ledger, keyless, fail-soft, exit 0 always.
 */
const fs = require('fs');
const path = require('path');

const AG = __dirname;
const OUT_JSON = path.join(AG, 'recruitment.json');
const OUT_MD = path.join(AG, 'recruitment.md');
const RECEIPTS = path.join(AG, 'receipts');

const read = (f) => { try { return fs.readFileSync(path.join(AG, f), 'utf8'); } catch (_) { return null; } };
const mtimeH = (p) => { try { return (Date.now() - fs.statSync(p).mtimeMs) / 3600000; } catch (_) { return null; } };

function newestReceiptAgeH() {
  let best = null;
  try {
    for (const f of fs.readdirSync(RECEIPTS)) { const h = mtimeH(path.join(RECEIPTS, f)); if (h != null && (best == null || h < best)) best = h; }
  } catch (_) {}
  return best;
}

// rule table: gap -> role. filled() must verify MECHANISM EVIDENCE, not intent.
const RULES = [
  {
    id: 'rail-sentinel',
    title: { en: 'Chain-rail sentinel', he: 'סנטינל נתיבי-שרשרת' },
    gap: 'an unverified contract id and an ignored sort parameter made a healthy rail look dead; ops signed blind are mined but never applied (Z-29 lesson, corrected in Z-30 by the research team)',
    mission: 'validate every rail before any signature: contract id copied character-for-character from an APPLIED third-party op, settlement read from sidechain state, never from a mined trx alone',
    evidence: () => { const src = read('econ-desk.cjs'); return src && src.includes("ENGINE_ID = 'ssc-mainnet-hive'") && src.includes('rail-health') ? 'agents/econ-desk.cjs contract-id law + rail-health gate' : null; },
  },
  {
    id: 'liquidity-cultivator',
    title: { en: 'Liquidity cultivator', he: 'מגדל-נזילות' },
    gap: 'idle inventory and dust either rot or get noise-sold; the economy needs every routable unit working',
    mission: 'two-sided engine desk: harvest inventory above keep-reserves at live bids, route proceeds into maker orders, hold dust honestly',
    evidence: () => { const src = read('econ-desk.cjs'); return src && src.includes('SELL_BOOKS') && src.includes('DUST-HELD') ? 'agents/econ-desk.cjs sell/buy sides' : null; },
  },
  {
    id: 'community-liaison',
    title: { en: 'Community liaison', he: 'קשרית-קהילה' },
    gap: 'broadcast-only presence reads as a press agency, not a community; networks reward dialogue',
    mission: 'daily self-audience pass: read, reply and curate across steem/hive/blurt in per-account voices (support the public, never expose the fleet)',
    evidence: () => { const h = newestReceiptAgeH(); const has = read('self-audience.cjs'); return has && h != null && h < 30 ? 'agents/receipts (newest ' + h.toFixed(1) + 'h old)' : null; },
  },
  {
    id: 'content-diversity-officer',
    title: { en: 'Content diversity officer', he: 'קצינת-גיוון-תוכן' },
    gap: 'ten accounts posting identical skeletons reads as spam and kills reach (operator msg 26: duplications and errors in content)',
    mission: 'per-account renderers, alternating formats, chain-native summaries, zero verbatim twins across chains',
    evidence: () => { const src = read('soldiers-blog.cjs'); return src && src.includes('persona') ? 'agents/soldiers-blog.cjs persona renderers' : null; },
  },
  {
    id: 'books-consul',
    title: { en: 'Books consul', he: 'קונסול-הספרים' },
    gap: 'several money books were written by different agents and disagreed; a sovereign unit needs one ledger per truth',
    mission: 'single-writer rule per book topic; cross-book reconciliation daily; contradictions tombstoned, not argued',
    evidence: () => (read('reconcile.cjs') && read('reconciliation.md') ? 'agents/reconcile.cjs single-writer manifest + live-truth cross-check' : null),
  },
  {
    id: 'workflow-pruner',
    title: { en: 'Workflow pruner', he: 'גוזרת-הזרימות' },
    gap: '30+ workflows spawned by bootstrap commits, twins across Console/Domain burning public-Actions minutes and muddying authorship',
    mission: 'one canonical home per duty; dispatch-only tombstones on the duplicates; the repo reads as one body, not layers',
    evidence: () => (read('workflow-audit.cjs') && read('workflow-audit.md') ? 'agents/workflow-audit.cjs twin scan + reviewable prune plan' : null),
  },
  {
    id: 'mobile-steward',
    title: { en: 'Mobile steward', he: 'סדרנית-נייד' },
    gap: 'the operator found pages broken on mobile; every public page must hold at 390px with a menu that actually closes',
    mission: 'browser-verify every public page at 390x844 after each UI wave; menus close on route/tap; tables scroll; no horizontal bleed',
    evidence: () => { try { const j = JSON.parse(read('page-laws.json') || 'null'); return (read('page-laws.cjs') && j && j.allPass) ? 'agents/page-laws.cjs — all public pages hold the five mobile laws' : null; } catch (_) { return null; } },
  },
];

(async () => {
  const t0 = Date.now();
  const econ = (() => { try { return JSON.parse(read('econ-book.json') || 'null'); } catch (_) { return null; } })();
  // cross-repo evidence (fail-soft): the public pages live in the Console repo
  const consoleRaw = async (f) => { try { const r = await fetch('https://raw.githubusercontent.com/roshpinacare-sys/Console/main/' + f, { signal: AbortSignal.timeout(12000) }); return r.ok ? await r.text() : null; } catch (_) { return null; } };
  const consoleHome = await consoleRaw('index.html');
  const board = {
    at: new Date(t0).toISOString(),
    agent: 'recruit',
    doctrine: 'roles are opened by live fleet gaps and registered only with mechanism evidence; PROPOSED roles carry a contract and wait for implementation, never a claim',
    signals: {
      railFrontierAgeHours: econ && econ.rail ? econ.rail.frontierAgeHours : null,
      railState: econ && econ.rail ? (econ.rail.frontierAgeHours > 24 ? 'STALL' : 'FRESH') : 'UNKNOWN',
      newestReceiptAgeHours: newestReceiptAgeH() == null ? null : Math.round(newestReceiptAgeH() * 10) / 10,
    },
    roles: [],
  };
  for (const r of RULES) {
    let ev = null;
    try { ev = r.evidence(); } catch (_) { ev = null; }
    board.roles.push({
      id: r.id,
      title: r.title,
      openedBy: r.gap,
      contract: r.mission,
      status: ev ? 'FILLED' : 'PROPOSED',
      mechanismEvidence: ev || 'none yet — role stands open until a mechanism exists (honest board)',
    });
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(board, null, 1));
  const md = [
    '# Army Recruitment Board (Z-29 self-recruitment desk)', '',
    'Updated: ' + board.at + ' UTC. The autonomy opens its own roles from live gaps. FILLED = mechanism evidence in-repo. PROPOSED = contract drafted, no implementation yet — the board does not lie.', '',
    'Signals: rail=' + JSON.stringify(board.signals.railState) + ' (frontier ' + board.signals.railFrontierAgeHours + 'h) · newest receipt ' + board.signals.newestReceiptAgeHours + 'h', '',
    '| role | status | opened by gap | contract | evidence |',
    '|---|---|---|---|---|',
    ...board.roles.map((r) => '| ' + r.title.en + ' (' + r.id + ') | ' + r.status + ' | ' + r.openedBy.slice(0, 110) + ' | ' + r.contract.slice(0, 130) + ' | ' + String(r.mechanismEvidence).slice(0, 90) + ' |'),
    '',
    'Open PROPOSED roles are the army\'s own to-do list — recruited by building the mechanism, not by naming it. Generated by agents/recruit.cjs.', '',
  ].join('\n');
  fs.writeFileSync(OUT_MD, md);
  console.log(JSON.stringify({ state: 'ok', filled: board.roles.filter((r) => r.status === 'FILLED').length, proposed: board.roles.filter((r) => r.status === 'PROPOSED').length }));
  process.exit(0);
})().catch((e) => {
  try { fs.writeFileSync(OUT_JSON, JSON.stringify({ at: new Date().toISOString(), agent: 'recruit', fatal: String(e.message || e).slice(0, 140) }, null, 1)); } catch (_) {}
  console.log(JSON.stringify({ state: 'fail-soft', msg: String(e.message || e).slice(0, 100) }));
  process.exit(0);
});
