'use strict';
/**
 * CAPITAL-GATE — שער-המחשבה-לפני-חתימה (owner directive 2026-10-04, IM trace 1a1…0451)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * הבעלים מדד חי ומצא: האוטונומיה רצה "בלי שכל ואינטילגנציה" — כולל האצלות-SP אוטומטיות
 * ל-hcsoldier1/2/3 (חשבונות שאין לאף-אחד את המפתחות שלהם — LOST-NO-CUSTODY, קבלה
 * מדודה 2026-10-04) ופלאפינג-האצלות באותו-יום מכמה-כותבים בלי תיאום.
 *
 * החוק החדש (מהיום): כל-חותם-על-השרשרת חייב לעבור שלושה-שערים לפני-חתימה:
 *   1. STASIS   — אם הבלם-החירום פעיל → יציאה-בריאה (no-op) עם שורת-קבלה קולחת.
 *   2. ROSTER   — כל-יעד-הון חייב להיות ברוסטר-הקנון (fleet-roster.json); יעד-אסור
 *                 או-לא-מוכר → REFUSED עם נימוק (קבלה-כנה, לעולם לא דילוג-שקט).
 *   3. JOURNAL  — כל-החלטת-הון נרשמת ל-receipts/capital-decisions.jsonl (מה/למה/כמה).
 *
 * ══ V-a — החוזה-האפיסטמי (SOVEREIGN COGNITIVE ACTIVATION, trace 1a1…0149) ══
 * R27 מדד: JSON-תקין-שקרי {"active":false} (או "active":"true" כמחרוזת) הרים-את-הבלם
 * גם-כאן. התיקון-המבני — אותו-חוזה בשני-הבתים:
 *   (1) אותנטיקה — STASIS חייב protocol='SAOS-FATE-DEFENSE-STASIS/1' + mode ∈ {full,staged}
 *       + since ISO; אחרת → fail-closed (unauthenticated → HALT).
 *   (2) סמכות-כיוונית — SHRINK תמיד מכני-מותר; EXPAND (active!==true / מסילה-פתוחה)
 *       חייב-כיסוי בשרשרת-הנחיות-הבעלים agents/receipts/owner-directives.jsonl
 *       (**tamper-EVIDENT, לא tamper-PROOF** — עריכה-שקטה נופלת; בנייה-מחדש = מדיניות-מוגנת-
 *       בשקיפות, לא קריפטו — מתויג-כך בכנות בכל-קבלה).
 *   (3) צרכן-מכני לשומרי-הלופ — agents/cognition/lane-guards.json (loopguard.cjs):
 *       שומר יכול רק לסגור; שדות-פתיחה = foreignFields אינרטיים; קובץ-לא-קריא = עצירה-לכל-המסילות.
 *   (4) זיכרון-החלטות — כל-הכרעת-שער כותבת קבלה-קוגניטיבית (idempotent per tool|lane|decision|
 *       minute; append-only). יומן-לא-כתיב ≠ וטו: 'journal-unwritable (decision still enforced)'
 *       + journalHealth().degraded.
 *
 * אפס-סודות: המודול קורא קבצי-מדיניות בלבד — לעולם לא נוגע במפתחות ולא מדפיס חומר-רגיש.
 * fail-closed: רוסטר-חסר = כל-היעדים נדחים (מעולם לא "תן-לכל-אחד").
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AG = __dirname;
const STASIS_FILE = path.join(AG, 'STASIS.json');
const ROSTER_FILE = path.join(AG, 'fleet-roster.json');
const JOURNAL = path.join(AG, 'receipts', 'capital-decisions.jsonl');
const CHAIN = require('./directivesChain.cjs');
const GUARDS = require('./loopguard.cjs');
const SELFMODEL = require('./selfmodel.cjs');

/* R29 (trace 1a1…fdc1): staged-allow now CONSUMES the self-model — same contract
 * as the steem home. Fail-closed edges: unreadable/invalid model (E3), stale model (E4),
 * open contradiction on the lane (E1), haltCoverage=ORGANISM_ONLY (E10 — a proven capital
 * path exists that the organism cannot stop; lanes stay closed until owner remediates).
 * Shrink/halt paths are NEVER blocked by the self-model. */
const SELFMODEL_FILE = path.join(AG, 'cognition', 'organism.json');
const SELFMODEL_MAX_AGE_H = 26; /* beat is hourly — >26h means the cognition loop is dead */

/* R30 (owner full-lift, IM trace 1a1…9241, 2026-10-11): a verified directives-chain
 * entry staged-open lanes=["*"] newer than the last halt-all IS the owner's explicit word —
 * the lawful tamper-evident instrument this house records owner authority with. Facts vs
 * authority: contradictions stay open in the self-model (they are observations, not
 * permissions); the gate decision cites the lift. No valid lift on the chain → every block
 * below behaves exactly as before (fail-closed unchanged). Revocation = append halt-all. */
function ownerFullLift() {
  return { lifted: CHAIN.hasEntryForLanes(['*']) };
}

function selfModelGate(lane) {
  const loaded = SELFMODEL.load(SELFMODEL_FILE);
  if (!loaded.ok) return { allow: false, reason: 'self-model-unauthenticated', detail: (loaded.errors || []).join('; ').slice(0, 140) };
  const model = loaded.model;
  const gen = model.generatedAt ? Date.parse(model.generatedAt) : NaN;
  if (Number.isNaN(gen) || (Date.now() - gen) > SELFMODEL_MAX_AGE_H * 3600e3) {
    return { allow: false, reason: 'self-model-stale', detail: 'generatedAt=' + String(model.generatedAt) + ' max-age=' + SELFMODEL_MAX_AGE_H + 'h — the cognition loop must run before capital lanes open' };
  }
  const openOnLane = (model.contradictions || []).filter((c) => c && c.status === 'open' && (!Array.isArray(c.lanes) || c.lanes.length === 0 || c.lanes.map(String).map((x) => x.toLowerCase()).includes(String(lane).toLowerCase())));
  if (openOnLane.length) {
    if (ownerFullLift().lifted) {
      return { allow: true, reason: 'owner-full-lift-over-contradiction', detail: 'contradiction(s) ' + openOnLane.map((c) => c.id).join(',') + ' remain OPEN (observed fact, model untouched); owner full-lift staged-open ["*"] verified on directives chain (trace 1a1…9241) = recorded risk-acceptance; revocation = append halt-all' };
    }
    return { allow: false, reason: 'self-model-contradiction-open', detail: openOnLane.map((c) => c.id).join(',').slice(0, 120) };
  }
  const sov = model.sovereignty;
  if (sov && sov.haltCoverage === 'ORGANISM_ONLY') {
    /* capital lanes only: claims (posting-only harvesting) may open when contradiction-free;
     * grid/general (capital movement) stay closed until the owner remediates the uncovered surface. */
    const capitalLanes = (Array.isArray(sov.capitalLanes) && sov.capitalLanes.length ? sov.capitalLanes : ['grid', 'general']).map((x) => String(x).toLowerCase());
    if (capitalLanes.includes(String(lane).toLowerCase())) {
      if (ownerFullLift().lifted) {
        return { allow: true, reason: 'owner-full-lift-accepted-uncovered-surface', detail: 'haltCoverage stays ORGANISM_ONLY (honest — external actors remain outside stop-power); owner full-lift staged-open ["*"] verified on directives chain (trace 1a1…9241) = the R29 owner-only remediation delivered by word; revocation = append halt-all' };
      }
      return { allow: false, reason: 'sovereignty-uncovered', detail: 'haltCoverage=ORGANISM_ONLY — proven capital paths exist outside organism stop-power (R29); owner-only remediation' };
    }
  }
  return { allow: true, reason: 'self-model-fresh-clean-covered', detail: 'generatedAt=' + String(model.generatedAt) };
}

function selfModelReceiptEv(sm) {
  return [{ source: 'agents/cognition/organism.json', ref: sm.reason + ' · ' + sm.detail, at: new Date().toISOString() }];
}

/** מצב-הבלם — fail-closed מהודק (T-B 2026-10-05) + אותנטיקה (V-a 2026-10-05):
 * קריאה-כושלת = HALT עם שורה-קולחת; קובץ-קריא בלי-פרוטוקול-תקף (protocol/mode/since)
 * = unauthenticated HALT — JSON-תקין-שקרי כבר לא מרים-בלם (סגירת-חור-R27). */
function stasisState() {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(STASIS_FILE, 'utf8')); }
  catch (e) {
    console.log(`[CAPITAL-GATE] STASIS-STATE-UNREADABLE ${STASIS_FILE} — fail-closed HALT (${String((e && e.message) || e).slice(0, 80)})`);
    return { active: true, unreadable: true, mode: 'full', reason: 'stasis file unreadable — fail-closed halt', since: '?' };
  }
  if (!doc || typeof doc !== 'object' || doc.protocol !== 'SAOS-FATE-DEFENSE-STASIS/1') {
    console.log(`[CAPITAL-GATE] STASIS-UNAUTHENTICATED ${STASIS_FILE} — fail-closed HALT (lacks protocol)`);
    return { active: true, unreadable: false, unauthenticated: true, mode: 'full', reason: 'STASIS file lacks valid protocol — fail-closed halt', since: '?' };
  }
  if ((doc.mode !== 'full' && doc.mode !== 'staged') || typeof doc.since !== 'string' || Number.isNaN(Date.parse(doc.since))) {
    console.log(`[CAPITAL-GATE] STASIS-UNAUTHENTICATED ${STASIS_FILE} — fail-closed HALT (protocol validation failed)`);
    return { active: true, unreadable: false, unauthenticated: true, mode: 'full', reason: 'STASIS file fails protocol validation (mode must be full|staged; since must be ISO) — fail-closed halt', since: '?' };
  }
  return doc;
}

/**
 * מסילת-הכלי — laneOf(tool) (owner directive 2026-10-05, trace 1a1…2391 —
 * staged re-entry + calibration mandate). מיפוי-מפורש מהאודיט של R23/R24-a (כל-אתר-חתימה
 * נבדק-מול-האופ-שלו בקוד — לא לפי-שם-בלבד):
 *   'claims' — כלים שהאופ-שלהם claim_reward_balance (posting-only, אידמפוטנטי):
 *              daily-claim, fleet-claim.
 *   'grid'   — כלים שהאופ-שלהם limit_order_create/cancel על הספר-הפנימי:
 *              market-exec (סולם/ספר THE-REAL-GRID).
 *   'general'— כל-יתר: האצלות (head-delegate), העברות (treasury-desk, pegout-hand),
 *              יצירת-חשבונות (community-founder), הצבעות (blurt-curate, soldiers-curate,
 *              self-audience), HE-orders (econ-desk), וכל-כלי-לא-מוכר.
 * כלי-לא-מוכר → 'general' (fail-closed: אין-היכרות = אין-מסילה-פתוחה).
 */
const LANES = Object.freeze({
  claims: Object.freeze(['daily-claim', 'fleet-claim']),
  grid: Object.freeze(['market-exec']),
  /* R78 (2026-10-11, CR-0076): owner-directed capped lanes — see directives chain i=3 */
  powerup: Object.freeze(['transfer_to_vesting']),
  delegation: Object.freeze(['delegate_vesting_shares']),
  connect: Object.freeze(['account_update', 'comment']),
});

function laneOf(tool) {
  const t = String(tool || '').trim().toLowerCase();
  for (const lane of Object.keys(LANES)) {
    if (LANES[lane].includes(t)) return lane;
  }
  return 'general';
}

/* ══ V-a: זיכרון-ההחלטות — קבלה-קוגניטיבית לכל-הכרעת-שער ══ */
let journalHealthState = { ok: true, lastError: null, lastWriteAt: null };

function journalHealth() {
  let lines = 0;
  try { lines = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean).length; } catch (_) { lines = 0; }
  return { ok: journalHealthState.ok, degraded: !journalHealthState.ok, lastAt: journalHealthState.lastWriteAt, lines, file: JOURNAL, lastError: journalHealthState.lastError, lastWriteAt: journalHealthState.lastWriteAt, receiptProtocol: 'SAOS-COGNITIVE-RECEIPT/1' };
}

function writeReceipt(tool, lane, decision, authority, evidence, reasonNote) {
  const minuteBucket = new Date().toISOString().slice(0, 16);
  const key = crypto.createHash('sha256').update([tool, lane, decision, minuteBucket].join('|'), 'utf8').digest('hex');
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    let raw = '';
    try { raw = fs.readFileSync(JOURNAL, 'utf8'); } catch (_) { /* קובץ-חסר = כתיבה-ראשונה */ }
    if (raw.indexOf(key) !== -1) return key; /* idempotency: אותו-כלי/מסילה/הכרעה באותו-דקה לעולם לא משוכפלת (append-only, לעולם לא לכתוב-מחדש) */
    const receipt = {
      at: new Date().toISOString(),
      kind: 'capital-gate-stasis-decision',
      decision,
      tool,
      lane,
      authority,
      evidence: (evidence || []).map((e) => ({ source: String(e.source || '').slice(0, 120), ref: String(e.ref || '').slice(0, 200), at: e.at || null })),
      preconditions: ['stasisState authenticated (SAOS-FATE-DEFENSE-STASIS/1)', 'laneOf(' + String(tool) + ')=' + lane],
      confidence: 1,
      expectedOutcome: decision === 'halt'
        ? 'tool exits as a healthy no-op before any key material is loaded'
        : 'tool proceeds under staged-lane authority; roster + journal gates still apply downstream',
      alternatives: [],
      idempotencyTag: key,
      abortConditions: [],
      postconditions: [],
      verification: { method: 'next gate invocation appends the paired receipt', status: 'pending', at: null, actual: null, deviation: null },
      note: String(reasonNote || '').slice(0, 200),
    };
    fs.appendFileSync(JOURNAL, JSON.stringify(receipt) + '\n');
    journalHealthState = { ok: true, lastError: null, lastWriteAt: receipt.at };
    return key;
  } catch (e) {
    journalHealthState = { ok: false, lastError: String((e && e.message) || e).slice(0, 120), lastWriteAt: journalHealthState.lastWriteAt };
    console.log('[CAPITAL-GATE] journal-unwritable (decision still enforced) · ' + journalHealthState.lastError);
    return null;
  }
}

/* סמכות-לפי-כיוון (V-a) — מטא-דאטה טהור: shrink=מנגנון-תמיד-מותר, expand=policy-gated, measure=חופשי. */
const AUTHORITY_OF = Object.freeze({ shrink: 'mechanism-shrink', expand: 'policy-gated', measure: 'free' });
function authorityOf(action) {
  return AUTHORITY_OF[String(action || '').trim().toLowerCase()] || 'policy-gated'; /* לא-מוכר = כמו-הרחבה (fail-closed) */
}

/** עזר: שרשרת-הנחיות-הבעלים מאומתת ומכסה-את-המסילות-המבוקשות? */
function directivesCover(neededLanes) {
  const v = CHAIN.verifyChain();
  if (!v.ok) return { covered: false, chainOk: false, breakAt: v.breakAt, reason: v.reason };
  return { covered: CHAIN.hasEntryForLanes(neededLanes), chainOk: true, breakAt: null, reason: null };
}

/**
 * true אם הבלם פעיל — הקורא חייב לצאת 0 (no-op בריא) מיד.
 *
 * סדר-ההכרעה (V-a — החוזה-האפיסטמי):
 *   (a) אותנטיקה: קובץ-לא-קריא/בלי-פרוטוקול-תקף → HALT (mechanism-shrink);
 *   (b) שומר-המסילה: guardHalt(lane).halt → HALT '[CAPITAL-GATE] LANE-GUARD-HALT' (mechanism-guard);
 *   (c) active!==true = טענת-הרחבה: מותרת רק עם-כיסוי-משורשר של-הבעלים — אחרת HALT
 *       'resume-lacks-owner-directive-entry' (סגירת-החור-של-"active":false מזויף);
 *   (d) staged allow: כל-מסילה-פתוחה-בקובץ חייבת-כיסוי — אחרת HALT 'staged-lane-lacks-directive-entry';
 *   (e) אחרת — ההתנהגות-הקיימת (STASIS-STAGED-ALLOW / STASIS-HALT).
 * אין-נפילה-פתוחה: קובץ-חסר/פגום/מזויף = עצירה (ראו stasisState).
 */
function stasisHalt(tool) {
  const s = stasisState();
  const lane = laneOf(tool);
  const reason = String(s.reason || 'unspecified');

  /* (a) אותנטיקה — קובץ שאי-אפשר לאמת = עצירה */
  if (s.unreadable || s.unauthenticated) {
    const tag = s.unauthenticated ? 'STASIS-UNAUTHENTICATED' : 'STASIS-STATE-UNREADABLE';
    console.log(`[CAPITAL-GATE] ${tag} ${tool} (lane=${lane}) · reason: ${reason.slice(0, 160)}`);
    writeReceipt(tool, lane, 'halt', 'mechanism-shrink', [
      { source: 'agents/STASIS.json', ref: tag.toLowerCase() + ': ' + reason.slice(0, 140), at: new Date().toISOString() },
    ], 'fail-closed: state file could not be authenticated');
    return true;
  }

  /* (b) שומר-המסילה — פסק-דין-מכני שיכול-רק-לסגור */
  const gh = GUARDS.guardHalt(lane);
  if (gh.halt) {
    const gid = gh.guard ? gh.guard.id : 'guards-unreadable';
    console.log(`[CAPITAL-GATE] LANE-GUARD-HALT ${tool} (lane=${lane}) · guard=${gid} · reason: ${String(gh.reason || 'unspecified').slice(0, 120)}`);
    writeReceipt(tool, lane, 'halt', 'mechanism-guard', [
      { source: 'agents/cognition/lane-guards.json', ref: 'guard ' + gid + (gh.guard && gh.guard.evidenceRef ? ' · ' + gh.guard.evidenceRef : ''), at: (gh.guard && gh.guard.openedAt) || new Date().toISOString() },
    ], String(gh.reason || 'lane-guard-close').slice(0, 180));
    return true;
  }

  const allow = Array.isArray(s.stagedLanes && s.stagedLanes.allow) ? s.stagedLanes.allow.map((x) => String(x).toLowerCase()) : [];

  /* (c) active!==true → סמכות-כיוונית: הרמת-בלם = הרחבה = חייבת-ראיה-משורשרת של-הבעלים */
  if (s.active !== true) {
    const needed = allow.length ? allow : ['*'];
    const cov = directivesCover(needed);
    if (!cov.covered) {
      console.log(`[CAPITAL-GATE] RESUME-DENIED ${tool} (lane=${lane}) · reason: resume-lacks-owner-directive-entry · needed=[${needed.join(',')}]${cov.chainOk ? '' : ' · chain ' + cov.reason}`);
      writeReceipt(tool, lane, 'halt', 'mechanism-shrink', [
        { source: 'agents/receipts/owner-directives.jsonl', ref: cov.chainOk ? ('chain verifies; no coverage for [' + needed.join(',') + ']') : ('chain tampered/unreadable: ' + cov.reason), at: new Date().toISOString() },
        { source: 'agents/STASIS.json', ref: 'active=false claim without owner-directives coverage', at: s.since },
      ], 'resume-lacks-owner-directive-entry');
      return true;
    }
    if (allow.length && !allow.includes(lane)) {
      console.log(`[CAPITAL-GATE] RESUME-DENIED ${tool} (lane=${lane}) · reason: lane-not-in-owner-directive-resume · resumed=[${allow.join(',')}]`);
      writeReceipt(tool, lane, 'halt', 'mechanism-shrink', [
        { source: 'agents/receipts/owner-directives.jsonl', ref: 'covers [' + allow.join(',') + '] only', at: new Date().toISOString() },
      ], 'lane-not-in-owner-directive-resume');
      return true;
    }
    /* R29: resume is EXPANSION too — it must consume the self-model exactly like staged-allow. */
    const smResume = selfModelGate(lane);
    if (!smResume.allow) {
      console.log(`[CAPITAL-GATE] RESUME-DENIED ${tool} (lane=${lane}) · reason: ${smResume.reason} · ${smResume.detail.slice(0, 140)}`);
      writeReceipt(tool, lane, 'halt', 'mechanism-shrink', selfModelReceiptEv(smResume), smResume.reason);
      return true;
    }
    console.log(`[CAPITAL-GATE] RESUME-ALLOWED-BY-DIRECTIVES ${tool} (lane=${lane}) · owner-directives cover [${needed.join(',')}] · self-model fresh+clean · tamper-EVIDENT (policy-gated, not crypto-proof)`);
    writeReceipt(tool, lane, 'allow', 'policy-gated', [
      { source: 'agents/receipts/owner-directives.jsonl', ref: 'owner-directives coverage for [' + needed.join(',') + ']', at: new Date().toISOString() },
      ...selfModelReceiptEv(smResume),
    ], 'resume covered by owner-directives chain + fresh clean self-model (tamper-evident, policy-gated)');
    return false;
  }

  /* (d) staged allow — המסילה-פתוחה-בקובץ חייבת-כיסוי-בשרשרת-הנחיות-הבעלים */
  if (s.mode === 'staged' && allow.includes(lane)) {
    const cov = directivesCover(allow);
    if (!cov.covered) {
      console.log(`[CAPITAL-GATE] STAGED-DENIED ${tool} (lane=${lane}) · reason: staged-lane-lacks-directive-entry · allow=[${allow.join(',')}]${cov.chainOk ? '' : ' · chain ' + cov.reason}`);
      writeReceipt(tool, lane, 'halt', 'mechanism-shrink', [
        { source: 'agents/receipts/owner-directives.jsonl', ref: cov.chainOk ? ('chain verifies; staged allow [' + allow.join(',') + '] not fully covered') : ('chain tampered/unreadable: ' + cov.reason), at: new Date().toISOString() },
        { source: 'agents/STASIS.json', ref: 'stagedLanes.allow=[' + allow.join(',') + ']', at: s.since },
      ], 'staged-lane-lacks-directive-entry');
      return true;
    }
    /* R29 — the self-model is consumed AT THE EDGE (E1/E3/E4/E10). */
    const sm = selfModelGate(lane);
    if (!sm.allow) {
      console.log(`[CAPITAL-GATE] STAGED-DENIED ${tool} (lane=${lane}) · reason: ${sm.reason} · ${sm.detail.slice(0, 160)}`);
      writeReceipt(tool, lane, 'halt', 'mechanism-shrink', selfModelReceiptEv(sm), sm.reason);
      return true;
    }
    console.log(`[CAPITAL-GATE] STASIS-STAGED-ALLOW ${tool} (lane=${lane}) · reason: ${reason.slice(0, 160)} · since ${s.since || '?'} · directives-covered · self-model fresh+clean`);
    writeReceipt(tool, lane, 'allow', 'policy-gated', [
      { source: 'agents/STASIS.json', ref: 'mode=staged, stagedLanes.allow=[' + allow.join(',') + ']', at: s.since },
      { source: 'agents/receipts/owner-directives.jsonl', ref: 'owner-directives coverage for [' + allow.join(',') + ']', at: new Date().toISOString() },
      ...selfModelReceiptEv(sm),
    ], 'staged allow covered by owner-directives chain + fresh clean self-model (tamper-evident, policy-gated)');
    return false;
  }

  /* (e) ההתנהגות-הקיימת: עצירה-כללית */
  console.log(`[CAPITAL-GATE] STASIS-HALT ${tool} (lane=${lane}) · reason: ${reason.slice(0, 160)} · since ${s.since || '?'}`);
  writeReceipt(tool, lane, 'halt', 'mechanism-shrink', [
    { source: 'agents/STASIS.json', ref: 'protocol valid · active=true · mode=' + s.mode, at: s.since },
  ], 'stasis-halt (lane not in staged allow, or mode=full)');
  return true;
}

/** הרוסטר-הקנון; null = לא-זמין (השוער נכשל-סגור). */
function loadRoster() {
  try { return JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8')); } catch (_) { return null; }
}

/**
 * שוער-יעדים: מחזיר {allowed, refused, rosterLoaded}.
 * refused תמיד כולל נימוק מפורש — הסוכן חייב לדווח ולא להעלים.
 */
function guardTargets(tool, targets) {
  const list = (targets || []).map((t) => String(t || '').toLowerCase()).filter(Boolean);
  const out = { allowed: [], refused: [], rosterLoaded: false };
  const roster = loadRoster();
  if (!roster) {
    console.log(`[CAPITAL-GATE] REFUSED ${tool} → ALL targets · reason: canonical roster unavailable (fail-closed)`);
    out.refused = list.map((name) => ({ name, reason: 'roster-unavailable' }));
    return out;
  }
  out.rosterLoaded = true;
  const banned = new Map((roster.bannedCapital || []).map((b) => [String(b.name || '').toLowerCase(), b.reason || 'banned']));
  const fleet = new Set((roster.steemFleet || []).map((n) => String(n).toLowerCase()));
  for (const name of list) {
    if (banned.has(name)) out.refused.push({ name, reason: 'banned: ' + banned.get(name) });
    else if (fleet.has(name)) out.allowed.push(name);
    else out.refused.push({ name, reason: 'not-in-canonical-roster' });
  }
  for (const x of out.refused) console.log(`[CAPITAL-GATE] REFUSED ${tool} → @${x.name} · ${x.reason}`);
  return out;
}

/** יומן-ההחלטות — שורה-אחת לכל-הכרעת-הון (מה/למה/תוצאה). אפס-סודות.
 * (ממשק-היסטורי לקוראים-קיימים; הקבלות-הקוגניטיביות נכתבות דרך writeReceipt ב-stasisHalt.) */
function journal(tool, row) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.appendFileSync(JOURNAL, JSON.stringify({ at: new Date().toISOString(), tool, ...row }) + '\n');
    journalHealthState = { ok: true, lastError: null, lastWriteAt: new Date().toISOString() };
  } catch (e) {
    journalHealthState = { ok: false, lastError: String((e && e.message) || e).slice(0, 120), lastWriteAt: journalHealthState.lastWriteAt };
    console.log('[CAPITAL-GATE] journal-unwritable (decision still enforced) · ' + journalHealthState.lastError);
  }
}

module.exports = { stasisState, stasisHalt, laneOf, loadRoster, guardTargets, journal, journalHealth, authorityOf, selfModelGate, STASIS_FILE, ROSTER_FILE, JOURNAL, SELFMODEL_FILE, SELFMODEL_MAX_AGE_H };
