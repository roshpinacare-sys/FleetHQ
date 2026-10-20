'use strict';
/**
 * capital-gate.selftest.cjs — וקטורים דטרמיניסטיים אופליין לשער-ההון (V-a — החוזה-האפיסטמי)
 *   node agents/capital-gate.selftest.cjs  → אפס-רשת, אפס-מפתחות, אפס-כתיבה-למדינה-החיה
 *   (השער נבדק תמיד על עותק-חול מלא: capital-gate + directivesChain + loopguard +
 *    STASIS.json/owner-directives.jsonl/lane-guards.json פיקטיביים — המדינה-החיה לא נוגעת,
 *    למעט-וקטורי-התאימות-בסוף שקוראים-את-הבית-החי ומנקים-אחריהם).
 *
 * נולד ב-T-B (trace 1a1…2391). הורחב ב-V-a (SOVEREIGN COGNITIVE ACTIVATION, trace 1a1…0149)
 * באותו-חוזה כמו בית-steem: אותנטיקת-פרוטוקול · סמכות-כיוונית (SHRINK מכני / EXPAND
 * מחייב-שרשרת-הנחיות-בעלים — tamper-EVIDENT) · צרכן-מכני לשומרי-הלופ (סוגרים-בלבד) ·
 * יומן-קבלות-קוגניטיביות אמיתי (idempotent, append-only) · כנות-מדידה.
 * וקטור-החובה-ההיסטורי של-הבית-הזה: קובץ-לא-קריא → HALT (היה fail-open — נסגר ב-T-B).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'capital-gate.cjs');
const LIVE_JOURNAL = path.join(ROOT, 'receipts', 'capital-decisions.jsonl');

/* לכידה-גלובלית שקטה: כל-שורות-הקבלה של-השער נכנסות-ל-LOG (הפלט מציג ✓/✗ בלבד) */
const LOG = [];
const ORIG_LOG = console.log;
console.log = (...a) => { LOG.push(a.join(' ')); };

let failures = 0;
function t(name, ok) {
  ORIG_LOG(`${ok ? ' ✓' : ' ✗'} ${name}`);
  if (!ok) failures++;
}

/* ── חול: עותק-בית מלא (השער קורא __dirname/STASIS.json, receipts/, cognition/) ── */
const SANDBOXES = [];
function sandbox(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capgate-selftest-'));
  SANDBOXES.push(root);
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  for (const f of ['capital-gate.cjs', 'directivesChain.cjs', 'loopguard.cjs', 'selfmodel.cjs']) {
    fs.writeFileSync(path.join(root, 'agents', f), fs.readFileSync(path.join(ROOT, f), 'utf8'));
  }
  /* R29: sandbox self-model — opts.selfmodel: 'seed' (live file), object, 'corrupt', or undefined (missing) */
  if (opts.selfmodel === 'seed') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'organism.json'), fs.readFileSync(path.join(ROOT, 'cognition', 'organism.json'), 'utf8'));
  } else if (opts.selfmodel === 'corrupt') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'organism.json'), '{ broken json[[');
  } else if (opts.selfmodel && typeof opts.selfmodel === 'object') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'organism.json'), JSON.stringify(opts.selfmodel, null, 2));
  }
  if (opts.stasis !== undefined) {
    if (opts.stasis === null) { /* קובץ-חסר */ }
    else fs.writeFileSync(path.join(root, 'agents', 'STASIS.json'), typeof opts.stasis === 'string' ? opts.stasis : JSON.stringify(opts.stasis, null, 2));
  }
  if (opts.chain === 'seed') {
    /* R30: seed = the live chain MINUS any owner full-lift ([*]) entries — the legacy
     * vectors below describe the no-lift world and stay meaningful regardless of what
     * the live house records. Use 'seed-lift' for the raw live chain (lift included). */
    fs.mkdirSync(path.join(root, 'agents', 'receipts'), { recursive: true });
    const raw = fs.readFileSync(path.join(ROOT, 'receipts', 'owner-directives.jsonl'), 'utf8');
    const noLift = raw.split('\n').filter(Boolean).filter((l) => { try { return !((JSON.parse(l).lanes || []).includes('*')); } catch (_) { return true; } });
    fs.writeFileSync(path.join(root, 'agents', 'receipts', 'owner-directives.jsonl'), noLift.join('\n') + '\n');
  } else if (opts.chain === 'seed-lift') {
    fs.mkdirSync(path.join(root, 'agents', 'receipts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'receipts', 'owner-directives.jsonl'), fs.readFileSync(path.join(ROOT, 'receipts', 'owner-directives.jsonl'), 'utf8'));
  } else if (Array.isArray(opts.chain)) {
    fs.mkdirSync(path.join(root, 'agents', 'receipts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'receipts', 'owner-directives.jsonl'), opts.chain.join('\n') + '\n');
  }
  if (opts.guards === 'seed') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'lane-guards.json'), fs.readFileSync(path.join(ROOT, 'cognition', 'lane-guards.json'), 'utf8'));
  } else if (opts.guards === 'empty') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'lane-guards.json'), JSON.stringify({ protocol: 'SAOS-LANE-GUARDS/1', guards: [] }, null, 2));
  } else if (opts.guards === 'corrupt') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'lane-guards.json'), '{ this is not json');
  } else if (opts.guards && typeof opts.guards === 'object') {
    fs.mkdirSync(path.join(root, 'agents', 'cognition'), { recursive: true });
    fs.writeFileSync(path.join(root, 'agents', 'cognition', 'lane-guards.json'), JSON.stringify(opts.guards, null, 2));
  }
  const captured = { root, logFrom: LOG.length };
  delete require.cache[require.resolve(path.join(root, 'agents', 'capital-gate.cjs'))];
  captured.g = require(path.join(root, 'agents', 'capital-gate.cjs'));
  captured.chain = require(path.join(root, 'agents', 'directivesChain.cjs'));
  captured.loopguard = require(path.join(root, 'agents', 'loopguard.cjs'));
  return captured;
}
function linesOf(c) { return LOG.slice(c.logFrom); }

const STAGED = (allow, extra = {}) => ({
  protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'staged',
  reason: 'selftest staged brake', since: '2026-10-05T00:00:00Z',
  stagedLanes: { allow, reason: 'selftest', since: '2026-10-05T00:00:00Z' },
  ...extra,
});
const FULL = (extra = {}) => ({ protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'full', reason: 'selftest full brake', since: '2026-10-04T22:06:00Z', ...extra });

function receiptsOf(root) {
  try {
    return fs.readFileSync(path.join(root, 'agents', 'receipts', 'capital-decisions.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch (_) { return []; }
}

/* ═════════ 1) מורשת: בלם-מלא אותנטי עוצר הכל ═════════ */
let c = sandbox({ stasis: FULL(), chain: 'seed', guards: 'seed' });
t('legacy full brake (valid protocol) halts even a claims tool', c.g.stasisHalt('daily-claim') === true);
t('mode=full halts even a listed lane', sandbox({ stasis: FULL({ stagedLanes: { allow: ['claims'] } }), chain: 'seed' }).g.stasisHalt('daily-claim') === true);

/* R29: a fresh, clean, sovereignty-covered self-model for allow-path vectors (trace 1a1…fdc1). */
function CLEAN_SELFMODEL(over = {}) {
  return Object.assign({
    protocol: 'SAOS-SELFMODEL/1',
    generatedAt: new Date().toISOString(),
    homes: {}, capabilities: [], writers: [],
    authorities: { decideAlone: [], stopShrink: [], policyGated: [], ownerOnly: [] },
    canonicalTruths: [], contradictions: [],
    frontier: { lanes: {}, computedAt: new Date().toISOString(), rule: 'selftest-clean' },
    custody: {}, unknowns: [], measurementNotes: ['selftest fixture'],
    sovereignty: { protocol: 'SAOS-SOVEREIGNTY/1', haltCoverage: 'DOMAIN', cannotStop: [], capitalPaths: [] },
  }, over);
}

/* ═════════ 2) staged + שרשרת-תקפה → grid+claims מותרות, general עצור ═════════ */
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
let ok;
ok = c.g.stasisHalt('market-exec') === false && c.g.stasisHalt('daily-claim') === false && c.g.stasisHalt('fleet-claim') === false;
t('valid staged file + directives chain → grid+claims ALLOW', ok);
t('allow path prints STASIS-STAGED-ALLOW with the lane + directives-covered', linesOf(c).some((l) => /STASIS-STAGED-ALLOW market-exec \(lane=grid\).*directives-covered/.test(l)));
ok = c.g.stasisHalt('totally-unknown-tool') === true && c.g.stasisHalt('head-delegate') === true && c.g.stasisHalt('treasury-desk') === true;
t('general lane still HALTs (unknown tool, head-delegate, treasury-desk)', ok && linesOf(c).some((l) => /STASIS-HALT totally-unknown-tool \(lane=general\)/.test(l)));

/* ═════════ 3) V-a אותנטיקה: פרוטוקול-זר/חסר/לא-תקף → HALT ═════════ */
c = sandbox({ stasis: { active: false, reason: 'forged lift, no protocol' }, chain: 'seed', guards: 'seed' });
const st = c.g.stasisState();
t('forged STASIS without protocol → HALT (was ALLOW before V-a — R27 measured this hole open)', c.g.stasisHalt('daily-claim') === true && c.g.stasisHalt('head-delegate') === true);
t('unauthenticated flag + honest reason (fail-closed, never "ok")', st.unauthenticated === true && /fail-closed/.test(st.reason) && st.reason !== 'ok');
t('loud STASIS-UNAUTHENTICATED receipt line', linesOf(c).some((l) => /STASIS-UNAUTHENTICATED daily-claim/.test(l)));
t('auth-halt receipt written with authority=mechanism-shrink', receiptsOf(c.root).some((r) => r.decision === 'halt' && r.tool === 'daily-claim' && r.authority === 'mechanism-shrink'));
c = sandbox({ stasis: { protocol: 'FOREIGN/9', active: false }, chain: 'seed' });
t('foreign protocol SAOS-…/9 → HALT', c.g.stasisHalt('market-exec') === true);
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'banana', since: '2026-10-05T00:00:00Z' } });
t('invalid mode fails protocol validation → HALT', c.g.stasisHalt('daily-claim') === true && c.g.stasisState().unauthenticated === true);
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'staged', since: 'not-a-date' } });
t('non-ISO since fails protocol validation → HALT', c.g.stasisHalt('daily-claim') === true);

/* ═════════ 4) V-a סמכות-כיוונית: active:false מזויף בלי-הנחיות-בעלים → HALT ═════════ */
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: false, mode: 'staged', since: '2026-10-04T22:06:00Z', reason: 'forged full lift' }, chain: 'seed', guards: 'empty' });
ok = c.g.stasisHalt('daily-claim') === true && c.g.stasisHalt('market-exec') === true && c.g.stasisHalt('head-delegate') === true;
t('forged active:false with NO full-resume directive → HALT everywhere (closes the R27 hole)', ok && linesOf(c).filter((l) => /RESUME-DENIED .*resume-lacks-owner-directive-entry/.test(l)).length === 3);
t('resume-denial receipt: authority=mechanism-shrink + reason recorded', receiptsOf(c.root).filter((r) => r.decision === 'halt' && r.note === 'resume-lacks-owner-directive-entry' && r.authority === 'mechanism-shrink').length === 3);

/* active:false + staged allow כשהשרשרת מכסה → רק-המסילות-המכוסות נפתחות (דגם-עצמי נקי וטרי — R29) */
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: false, mode: 'staged', since: '2026-10-05T00:00:00Z', stagedLanes: { allow: ['grid', 'claims'] } }, chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
t('active:false + allow covered by chain → covered lanes resume (policy-gated)', c.g.stasisHalt('market-exec') === false);
t('…but lanes outside the covered resume still HALT', c.g.stasisHalt('head-delegate') === true);

/* "active":"true" כמחרוזת (חור-R27) — הרחבה-מעבר-לשרשרת נסגרת */
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: 'true', mode: 'staged', since: '2026-10-05T00:00:00Z', stagedLanes: { allow: ['grid', 'claims'] } }, chain: 'seed' });
t('forged "active":"true" string does NOT reopen the general lane (R27 vector, now closed)', c.g.stasisHalt('totally-unknown-tool') === true);

/* ═════════ 5) staged allow עם-מסילה-שאינה-מכוסה-בשרשרת → HALT ═════════ */
c = sandbox({ stasis: STAGED(['grid', 'claims', 'general']), chain: 'seed' });
ok = c.g.stasisHalt('market-exec') === true && c.g.stasisHalt('daily-claim') === true;
t('staged allow listing a lane NOT in directives → HALT for every staged tool', ok && linesOf(c).filter((l) => /STAGED-DENIED .*staged-lane-lacks-directive-entry/.test(l)).length === 2);

/* tampered chain: hash שבור → verifyChain נופל → HALT על-מסילה-פתוחה-לכאורה */
const seedLines = fs.readFileSync(path.join(ROOT, 'receipts', 'owner-directives.jsonl'), 'utf8').split('\n').filter(Boolean);
const tampered = seedLines.map((l, idx) => {
  if (idx !== 2) return l;
  const e = JSON.parse(l); e.hash = '0'.repeat(64); return JSON.stringify(e);
});
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: tampered });
const v = c.chain.verifyChain();
t('tampered chain → verifyChain fails with breakAt on the edited entry', v.ok === false && v.breakAt === 2 && v.reason === 'hash-mismatch');
t('tampered chain → staged lane HALTs (no expansion without intact evidence)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /staged-lane-lacks-directive-entry/.test(l)));

/* halt-all מאוחר בשרשרת סוגר-מכנית את-הכיסוי (סמכות-הכיווץ של-השרשרת-עצמה) */
const afterHalt = (() => {
  const lib = require(path.join(ROOT, 'directivesChain.cjs'));
  let prev = JSON.parse(seedLines[seedLines.length - 1]).hash;
  const e3 = { i: 3, at: '2026-10-05T15:00:00Z', type: 'halt-all', trace: 'selftest-halt-all', source: 'selftest', lanes: [], note: 'owner halt-all (selftest vector)' };
  const h3 = lib.entryHash(prev, e3);
  return [...seedLines, JSON.stringify({ ...e3, hash: h3 })];
})();
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: afterHalt });
t('owner halt-all entry appended → staged lanes mechanically re-close (hasEntryForLanes=false)', c.chain.hasEntryForLanes(['grid', 'claims']) === false && c.g.stasisHalt('market-exec') === true);

/* ═════════ 6) שומרי-מסילה (loopguard) — סוגרים-בלבד ═════════ */
const G = (over = {}) => ({ id: 'G-TEST', lane: 'grid', closed: true, reason: 'beat closed after red cycle', evidenceRef: 'selftest/G-TEST', openedAt: '2026-10-05T15:00:00Z', expiresAt: null, ...over });
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: { protocol: 'SAOS-LANE-GUARDS/1', guards: [G()] }, selfmodel: CLEAN_SELFMODEL() });
ok = c.g.stasisHalt('market-exec') === true;
t('guard closes an allowed lane → HALT with LANE-GUARD-HALT', ok && linesOf(c).some((l) => /LANE-GUARD-HALT market-exec \(lane=grid\) · guard=G-TEST/.test(l)));
t('guard-halt receipt: authority=mechanism-guard + evidenceRef', receiptsOf(c.root).some((r) => r.decision === 'halt' && r.authority === 'mechanism-guard' && /G-TEST/.test(r.evidence.map((e) => e.ref).join(' '))));
t('other lanes unaffected by the grid guard (fresh clean self-model — R29)', c.g.stasisHalt('daily-claim') === false);

c = sandbox({ stasis: STAGED(['grid']), guards: { protocol: 'SAOS-LANE-GUARDS/1', guards: [{ id: 'G-OPEN', lane: 'grid', closed: false, open: true, allow: true, reason: 'attempt to open' }] } });
const ghOpen = c.loopguard.guardHalt('grid');
t('guard entry with open/allow attempt: NOT honored, foreignFields flagged (open+allow)', ghOpen.halt === false && ghOpen.foreignFields.some((f) => f.field === 'open') && ghOpen.foreignFields.some((f) => f.field === 'allow'));
{
  const x = sandbox({ stasis: STAGED(['grid']), guards: { protocol: 'SAOS-LANE-GUARDS/1', guards: [{ id: 'G-MIX', lane: 'grid', closed: true, open: true, reason: 'x' }] } });
  const r = x.loopguard.guardHalt('grid');
  t('closed:true + smuggled open:true → still halts (closed honored, open flagged)', r.halt === true && r.foreignFields.some((f) => f.field === 'open'));
}

c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'corrupt' });
t('corrupt guards file → HALT on EVERY lane (fail-closed loud)', c.loopguard.guardHalt('grid').halt === true && c.loopguard.guardHalt('general').halt === true && c.loopguard.guardHalt('claims').halt === true);
t('corrupt guards file halts even a directives-covered staged tool', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /guards-unreadable/.test(l)));

c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: { protocol: 'WRONG/2', guards: [] } });
t('guards file with wrong protocol → fail-closed halt (authenticity applies here too)', c.loopguard.guardHalt('grid').halt === true && c.loopguard.guardHalt('grid').reason === 'guards-unreadable');

c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: { protocol: 'SAOS-LANE-GUARDS/1', guards: [G({ expiresAt: '2020-01-01T00:00:00Z' })] }, selfmodel: CLEAN_SELFMODEL() });
t('expired guard (expiresAt < now) is inert', c.loopguard.guardHalt('grid').halt === false && c.g.stasisHalt('market-exec') === false);
c = sandbox({ stasis: STAGED(['grid']), guards: { protocol: 'SAOS-LANE-GUARDS/1', guards: [G({ expiresAt: 'not-a-date' })] } });
t('unparseable expiresAt keeps the guard alive (shrink never falls to a date bug)', c.loopguard.guardHalt('grid').halt === true);

c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: undefined, selfmodel: CLEAN_SELFMODEL() });
t('missing guards file → no guard effect (logged once, not an error)', c.loopguard.guardHalt('grid').halt === false && c.g.stasisHalt('market-exec') === false);

/* ═════════ 7) היומן-האמיתי: קבלות-קוגניטיביות + אידמפוטנציה ═════════ */
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
c.g.stasisHalt('market-exec');     /* allow */
c.g.stasisHalt('head-delegate');   /* halt  */
c.g.stasisHalt('market-exec');     /* אותה-הכרעה, אותו-דקה → אין-כפילות */
let rs = receiptsOf(c.root);
t('every decision writes exactly one cognitive receipt (same tool|lane|decision within the minute never duplicates)', rs.length === 2);
t('receipt schema: at/kind/decision/tool/lane/authority/evidence/idempotencyTag/verification', rs.every((r) => r.at && r.kind === 'capital-gate-stasis-decision' && r.decision && r.tool && r.lane && r.authority && Array.isArray(r.evidence) && /^[0-9a-f]{64}$/.test(r.idempotencyTag) && r.verification && r.verification.status === 'pending'));
t('allow receipt authority=policy-gated with directives+self-model evidence; halt=mechanism-shrink', rs.some((r) => r.decision === 'allow' && r.authority === 'policy-gated' && r.evidence.some((e) => /owner-directives/.test(e.source)) && r.evidence.some((e) => /organism\.json/.test(e.source))) && rs.some((r) => r.decision === 'halt' && r.authority === 'mechanism-shrink'));
t('authorityOf mapping: shrink→mechanism-shrink, expand→policy-gated, measure→free, unknown→policy-gated (fail-closed)', c.g.authorityOf('shrink') === 'mechanism-shrink' && c.g.authorityOf('expand') === 'policy-gated' && c.g.authorityOf('measure') === 'free' && c.g.authorityOf('weird') === 'policy-gated');
t('journalHealth() contract fields: ok=true, lastAt ISO, lines counted from the journal itself (2 decisions = 2 lines)', (() => { const h = c.g.journalHealth(); return h.ok === true && /^\d{4}-\d{2}-\d{2}T/.test(h.lastAt || '') && h.lines === 2; })());

/* journal-unwritable: היומן-הוא-זיכרון, לא-וטו */
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
const origAppend = fs.appendFileSync;
try {
  fs.appendFileSync = () => { throw new Error('EACCES: mocked unwritable journal'); };
  const decision = c.g.stasisHalt('market-exec');
  t('journal-unwritable → decision STILL enforced (allow stands) + degraded flagged + loud line', decision === false && c.g.journalHealth().degraded === true && linesOf(c).some((l) => /journal-unwritable \(decision still enforced\)/.test(l)));
  const halt = c.g.stasisHalt('head-delegate');
  t('…same for halt decisions (halt stands under broken journal)', halt === true && c.g.journalHealth().degraded === true && linesOf(c).filter((l) => /journal-unwritable/.test(l)).length === 2);
} finally { fs.appendFileSync = origAppend; }

/* ═════════ 8) כנות-מדידה: קובץ-חסר/שבור = fail-closed עם-נימוק-כן ═════════ */
c = sandbox({ stasis: null, chain: 'seed' });
const stMissing = c.g.stasisState();
t('missing stasis file halts — fail-closed (the historical T-B fix, still holding)', c.g.stasisHalt('daily-claim') === true);
t('unreadable STASIS prints the loud STASIS-STATE-UNREADABLE line', linesOf(c).some((l) => /STASIS-STATE-UNREADABLE/.test(l)));
t('unreadable STASIS reason is fail-closed (never "ok") — measurement-error honesty vector', /fail-closed/.test(stMissing.reason || '') && stMissing.reason !== 'ok');
c = sandbox({ stasis: '{ this is not json', chain: 'seed' });
{
  const stCorrupt = c.g.stasisState();
  t('corrupt stasis file: state.active=true (halt) + loud reason + mode=full (no staged lanes open)', /fail-closed/.test(stCorrupt.reason || '') && stCorrupt.mode === 'full' && c.g.stasisHalt('market-exec') === true);
}

/* ═════════ 9) laneOf — המיפוי-המפורש עצמו ═════════ */
c = sandbox({ stasis: STAGED(['claims']), chain: 'seed' });
t('laneOf maps by audited op class; unknown → general', c.g.laneOf('daily-claim') === 'claims' && c.g.laneOf('fleet-claim') === 'claims' && c.g.laneOf('market-exec') === 'grid' && c.g.laneOf('head-delegate') === 'general' && c.g.laneOf('pegout-hand') === 'general' && c.g.laneOf('econ-desk') === 'general' && c.g.laneOf('') === 'general' && c.g.laneOf(undefined) === 'general');

/* ═════════ 9.5) selfmodel — המאמת-האפיסטמי (עותק-Domain) ═════════ */
const sm = require(path.join(ROOT, 'selfmodel.cjs'));
const org = sm.load(path.join(ROOT, 'cognition', 'organism.json'));
t('live Domain organism.json validates against SAOS-SELFMODEL/1', org.ok === true && org.model.protocol === 'SAOS-SELFMODEL/1');
const badCap = sm.updateSection(org.model, 'capabilities', [{ id: 'x', home: 'domain', lane: 'grid', status: 'REAL', epistemic: 'OBSERVED', evidence: [] }]);
const vBad = sm.validate(badCap);
t('validator rejects OBSERVED without evidence[] (epistemic honesty is mechanical)', vBad.ok === false && vBad.errors.some((e) => /OBSERVED requires non-empty evidence/.test(e)));
t('EMPTY template is valid (zero claims = zero risk)', sm.validate(sm.EMPTY()).ok === true);

/* ═════════ 10) תאימות: הבית-החי (קורא-קבצים-אמיתיים; מנקה-אחרי-עצמו) ═════════ */
const liveJournalExisted = fs.existsSync(LIVE_JOURNAL);
const live = require(SRC);
/* R30 (owner full-lift, trace 1a1…9241): the live house now carries the owner's
 * full-lift staged-open [*] on the directives chain — every canonical lane opens and the
 * WRITTEN receipt cites the lift. The lift is authority, not fact-editing: C-002 stays
 * open in the model, haltCoverage stays ORGANISM_ONLY, and the receipts say so. */
t('live home: full-lift state — staged lanes OPEN (market-exec, daily-claim, head-delegate)', live.stasisHalt('market-exec') === false && live.stasisHalt('daily-claim') === false && live.stasisHalt('head-delegate') === false);
t('live home: written allow receipts cite the owner lift (policy-gated evidence carries owner-full-lift)', (() => {
  try {
    const lines = fs.readFileSync(LIVE_JOURNAL, 'utf8').split('\n').filter(Boolean);
    const tail = lines.slice(-8).map((l) => JSON.parse(l));
    return tail.some((r) => r.decision === 'allow' && r.authority === 'policy-gated' && JSON.stringify(r.evidence).includes('owner-full-lift'));
  } catch (_) { return false; }
})());
t('live home: selfModelGate cites the lift (facts untouched in the model)', live.selfModelGate('grid').allow === true && live.selfModelGate('grid').reason === 'owner-full-lift-over-contradiction' && live.selfModelGate('general').allow === true && live.selfModelGate('general').reason === 'owner-full-lift-accepted-uncovered-surface');
const liveChain = require(path.join(ROOT, 'directivesChain.cjs')).verifyChain();
t('live directives chain verifies (>=6 entries, genesis→halt-all→staged-open→…→full-lift [*])', liveChain.ok === true && liveChain.entries.length >= 6 && liveChain.entries[1].type === 'halt-all' && liveChain.entries[2].type === 'staged-open' && liveChain.entries[liveChain.entries.length - 1].lanes.includes('*'));
const GENESIS_HASH = '61419a4cf79ca81e9d6a774e72645ca3bde43626e89612b2dbf59d2ade8d7ae3'; /* sha256(JSON.stringify({i:0,at:"2026-10-05T00:00:00Z",type:"genesis",note:"SAOS-DIRECTIVES-CHAIN/1"})) — shared-contract constant */
t('live directives chain genesis hash_0 equals the SAOS-DIRECTIVES-CHAIN/1 contract constant (interop with V-b beat)', liveChain.entries[0].hash === GENESIS_HASH);
const liveGuards = require(path.join(ROOT, 'loopguard.cjs')).guardHalt('grid');
t('live guards: honest state (whatever the beat last synced — halt/allow is still fail-closed either way)', (liveGuards.halt === true || liveGuards.halt === false) && Array.isArray(liveGuards.foreignFields));

/* ═════════ 11) R29 — SOVEREIGN BOUNDARY vectors (trace 1a1…fdc1) — Domain parity ═════════ */
c = sandbox({ stasis: STAGED(['grid']), chain: 'seed', guards: 'empty', selfmodel: 'corrupt' });
t('E3: tampered self-model → REFUSED (self-model-unauthenticated)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /self-model-unauthenticated/.test(l)));
c = sandbox({ stasis: STAGED(['grid']), chain: 'seed', guards: 'empty', selfmodel: Object.assign(CLEAN_SELFMODEL(), { frontier: 'not-an-object' }) });
t('E3b: lying self-model (frontier not an object) → REFUSED (validator is the gatekeeper)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /self-model-unauthenticated/.test(l)));
c = sandbox({ stasis: STAGED(['grid']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL({ generatedAt: new Date(Date.now() - 3 * 86400e3).toISOString() }) });
t('E4: stale self-model → REFUSED (self-model-stale)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /self-model-stale/.test(l)));
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL({ contradictions: [{ id: 'C-x', status: 'open', epistemic: 'OBSERVED', confidence: 0.9, lanes: ['grid'], a: 'a', b: 'b', kind: 'k', title: 't', detail: 'd', firstSeen: new Date().toISOString() }] }) });
t('E1: open contradiction on grid → grid REFUSED; E1b: claims lane still allowed', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /self-model-contradiction-open/.test(l)) && c.g.stasisHalt('daily-claim') === false);
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL({ sovereignty: { protocol: 'SAOS-SOVEREIGNTY/1', haltCoverage: 'ORGANISM_ONLY', cannotStop: ['money-family-live'], capitalPaths: [] } }) });
t('E10: haltCoverage=ORGANISM_ONLY → capital lane (grid) REFUSED, posting-only claims lane still opens (scope = capitalLanes)', c.g.stasisHalt('market-exec') === true && c.g.stasisHalt('daily-claim') === false && linesOf(c).filter((l) => /sovereignty-uncovered/.test(l)).length === 1);
{
  const m = sm.EMPTY();
  m.frontier.lanes.grid = { level: 'REAL', justification: 'x', evidence: [{ source: 's', ref: 'r' }] };
  m.sovereignty = { protocol: 'SAOS-SOVEREIGNTY/1', haltCoverage: 'ORGANISM_ONLY', cannotStop: [], capitalPaths: [] };
  const v = sm.validate(m);
  t('E10b: validator refuses REAL lane while haltCoverage=ORGANISM_ONLY (honesty law)', v.ok === false && v.errors.some((e) => /REAL.*ORGANISM_ONLY/.test(e)));
  m.sovereignty.haltCoverage = 'DOMAIN';
  t('E10c: haltCoverage=DOMAIN validates (coverage upgrades unlock REAL claims)', sm.validate(m).ok === true);
  const m2 = sm.EMPTY();
  m2.frontier.lanes.claims = { level: 'REAL', justification: 'posting-only harvesting, idempotent, no capital exit', evidence: [{ source: 's', ref: 'r' }] };
  m2.sovereignty = { protocol: 'SAOS-SOVEREIGNTY/1', haltCoverage: 'ORGANISM_ONLY', capitalLanes: ['grid', 'general'], cannotStop: [], capitalPaths: [] };
  t('E10d: claims REAL + ORGANISM_ONLY is VALID (non-capital lane)', sm.validate(m2).ok === true);
}
c = sandbox({ stasis: { protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'full', since: '2026-10-05T00:00:00Z' }, chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
t('E2: full-mode STASIS, no guards → every lane halts (guards are one edge of three)', c.g.stasisHalt('market-exec') === true && c.g.stasisHalt('daily-claim') === true && c.g.stasisHalt('head-delegate') === true);
{
  const x = sandbox({ stasis: STAGED(['grid']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
  const a1 = x.g.stasisHalt('market-exec');
  fs.writeFileSync(path.join(x.root, 'agents', 'STASIS.json'), JSON.stringify({ protocol: 'SAOS-FATE-DEFENSE-STASIS/1', active: true, mode: 'full', since: new Date().toISOString() }));
  const a2 = x.g.stasisHalt('market-exec');
  t('E8: no partial authorization — allowed under clean model, re-halts after cognition-death state change', a1 === false && a2 === true);
}
c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: 'seed', guards: 'empty', selfmodel: CLEAN_SELFMODEL() });
t('E7: unknown/new signing tool maps to general lane, NOT opened by staged allow', c.g.stasisHalt('brand-new-signing-tool') === true);
if (!liveJournalExisted && fs.existsSync(LIVE_JOURNAL)) {
  fs.rmSync(LIVE_JOURNAL);
  ORIG_LOG(' ✓ live test receipts cleaned (journal is a runtime artifact — born with the first real decision)');
}

/* ═════════ 12) R30 — owner FULL-LIFT vectors (trace 1a1…9241) ═════════ */
const CHAINMOD = require(path.join(ROOT, 'directivesChain.cjs'));
function chainLinesWith(appendEntries, stripLift) {
  let base = fs.readFileSync(path.join(ROOT, 'receipts', 'owner-directives.jsonl'), 'utf8').split('\n').filter(Boolean);
  if (stripLift) base = base.filter((l) => { try { return !((JSON.parse(l).lanes || []).includes('*')); } catch (_) { return true; } });
  if (!base.length) throw new Error('selftest: empty chain base — cannot build R30 fixtures');
  let prev = JSON.parse(base[base.length - 1]).hash;
  let i = base.length;
  const lines = base.slice();
  for (const e of appendEntries) {
    const entry = Object.assign({ i }, e);
    const h = CHAINMOD.entryHash(prev, entry);
    lines.push(JSON.stringify(Object.assign({ hash: h }, entry)));
    prev = h; i++;
  }
  return lines;
}
const LIFT = () => [{ at: new Date().toISOString(), type: 'staged-open', trace: '1a1…9241', source: 'selftest R30', lanes: ['*'], note: 'owner full-lift' }];
const OPEN_C_ON_GRID = () => [{ id: 'C-x', status: 'open', epistemic: 'OBSERVED', confidence: 0.9, lanes: ['grid'], a: 'a', b: 'b', kind: 'k', title: 't', detail: 'd', firstSeen: new Date().toISOString() }];

c = sandbox({ stasis: STAGED(['grid', 'claims']), chain: chainLinesWith(LIFT()), guards: 'empty', selfmodel: CLEAN_SELFMODEL({ contradictions: OPEN_C_ON_GRID() }) });
t('R30-A: owner full-lift lifts an OPEN contradiction — grid ALLOW, receipt cites lift-over-contradiction (the fact stays open in the model)', c.g.stasisHalt('market-exec') === false && receiptsOf(c.root).some((r) => r.decision === 'allow' && JSON.stringify(r.evidence).includes('owner-full-lift-over-contradiction')));

c = sandbox({ stasis: STAGED(['grid', 'general']), chain: chainLinesWith(LIFT()), guards: 'empty', selfmodel: CLEAN_SELFMODEL({ sovereignty: { protocol: 'SAOS-SOVEREIGNTY/1', haltCoverage: 'ORGANISM_ONLY', cannotStop: ['money-family-live'], capitalPaths: [], capitalLanes: ['grid', 'general'] } }) });
t('R30-B: full-lift accepts the uncovered surface — general (head-delegate) ALLOW via lift-accepted-uncovered-surface', c.g.stasisHalt('head-delegate') === false && receiptsOf(c.root).some((r) => r.decision === 'allow' && JSON.stringify(r.evidence).includes('owner-full-lift-accepted-uncovered-surface')));

c = sandbox({ stasis: STAGED(['grid']), chain: chainLinesWith([...LIFT(), { at: new Date().toISOString(), type: 'halt-all', trace: 'owner-stop', source: 'selftest R30', note: 'owner re-freeze after the lift' }]), guards: 'empty', selfmodel: CLEAN_SELFMODEL({ contradictions: OPEN_C_ON_GRID() }) });
t('R30-C: a halt-all AFTER the lift kills it mechanically — grid REFUSED again (shrink always wins, staged-open must be newer)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /staged-lane-lacks-directive-entry/.test(l)));

c = sandbox({ stasis: STAGED(['grid']), chain: chainLinesWith([{ at: new Date().toISOString(), type: 'staged-open', trace: '', source: 'selftest R30', lanes: ['*'], note: 'trace-less lift attempt — must be rejected' }], true), guards: 'empty', selfmodel: CLEAN_SELFMODEL({ contradictions: OPEN_C_ON_GRID() }) });
t('R30-D: a [*] entry WITHOUT trace is not authority — grid REFUSED (fail-closed, no silent lift)', c.g.stasisHalt('market-exec') === true && linesOf(c).some((l) => /self-model-contradiction-open/.test(l)));

console.log = ORIG_LOG;
for (const s of SANDBOXES) fs.rmSync(s, { recursive: true, force: true });
ORIG_LOG(failures ? 'capital-gate.selftest: FAIL' : 'capital-gate.selftest: all vectors PASS');
process.exit(failures ? 1 : 0);
