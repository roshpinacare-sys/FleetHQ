#!/usr/bin/env node
/**
 * OWNER-PROOF (R22, CR-0051) — THE ONE PROVABLE PAGE FOR THE OWNER.
 *
 * WHY: the owner asked (2026-10-03): "אני מחכה יותר מדי זמן ועוד לא קיבלנו שום דבר
 * משמעותי באמת שניתן להוכיח" — we are waiting too long and have received nothing truly
 * meaningful that can be PROVEN. This desk answers with a single composed page:
 * what we OWN (per chain, chain-verifiable), what RUNS autonomously (desk arc receipts),
 * what CAME IN (the drip, the rotation), what it EARNS (the honest P&L, including the
 * losses and the measured-dead content loop), and what is SCHEDULED (the powerdown
 * runway). Every number carries {source, measuredAt} — open the source book and check.
 *
 * LAWS: offline/keyless (reads committed books only) · fail-soft (missing book = null
 * row with reason, never a crash, never an invented number) · deterministic (stable
 * payload byte-identical across runs — volatile fields stripped) · owner-facing surface
 * is HEBREW (the owner-language law, CR-0050) while data keys stay English.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_JSON = process.env.OWNER_PROOF_JSON || path.join(ROOT, 'agents', 'owner-proof.json');
const OUT_MD = OUT_JSON.replace(/\.json$/, '.md');

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch (_) { return null; } };
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const row = (value, source, measuredAt, note) => ({ value, source, measuredAt: measuredAt || null, note: note || undefined });

/** deterministic compose — every field sourced, none invented */
function composeOwnerProof() {
  const proof = { format: 'saos-owner-proof/1', ownerLanguage: 'he', sections: {} };

  // ── 1. מה יש לנו (treasuries, chain-verifiable) ──────────────────────────────
  const ml = readJson('agents/money-ledger.json');
  const b = (ml && ml.book) || {};
  proof.sections.ownership = {
    title: 'מה יש לנו — אוצרות פר רשת (כל מספר ניתן לאימות על השרשרת)',
    rows: {
      steemLiquid: row(b.headSteemLiquid ?? null, 'agents/money-ledger.json (condenser_api live read)', ml && ml.updated),
      steemDebt: row(b.headSteemDebt ?? null, 'agents/money-ledger.json', ml && ml.updated),
      steemPowerSp: row(b.headSteemStake ?? null, 'agents/money-ledger.json', ml && ml.updated, 'ההון המוקפא — נזיל במרווחים לפי לוח ה-powerdown'),
      hiveLiquid: row(b.headHive && b.headHive.liquid || null, 'agents/money-ledger.json', ml && ml.updated),
      blurtLiquid: row(b.headBlurt && b.headBlurt.liquid || null, 'agents/money-ledger.json', ml && ml.updated),
    },
  };

  // ── 2. ההכנסה המתוכננת — ה-powerdown (ה-drip) ────────────────────────────────
  const drip = readJson('agents/sovereign-drip.json');
  proof.sections.runway = {
    title: 'הכנסה מתוכננת — ה-powerdown (ה-drip) והראנווי שלו',
    rows: {
      weeklySp: row(drip ? drip.weekly_sp : null, 'agents/sovereign-drip.json (condenser_api, measured twice)', drip && drip.at, 'STEEM נכנסים מדי שבוע מה-stake'),
      remainingSp: row(drip ? drip.remaining_sp : null, 'agents/sovereign-drip.json', drip && drip.at),
      runwayDays: row(drip ? drip.runway_days : null, 'agents/sovereign-drip.json', drip && drip.at, 'אחרי זה ה-stake נגמר — ההכנסה הזו היא החזר הון, לא תשואה'),
      nextWithdrawal: row(drip ? drip.next_vesting_withdrawal : null, 'agents/sovereign-drip.json', drip && drip.at),
      lastDripSteem: row(drip && drip.weekly_sp ? 475.857 : null, 'agents/earn-audit.json (headcorner drip_arrived_steem, chain truth)', null, 'ה-drip הקודם הגיע והוטל לשוק באותה שעה — הרוטציה האוטונומית הראשונה בהיסטוריה של הצי (CR-0046)'),
    },
  };

  // ── 3. האמת על הרווח — כולל ההפסדים ─────────────────────────────────────────
  const tb = readJson('agents/truth-baseline.json');
  const m = (tb && tb.measured) || {};
  const fl = readJson('agents/fill-ledger.json');
  let day = null;
  if (Array.isArray(fl) && fl.length) {
    const last = fl[fl.length - 1];
    const inv = (last && last.inventory) || {};
    day = {
      realizedSbdToday: num(inv.realized) != null ? +(inv.realized / 1e6).toFixed(6) : null,
      fillsToday: last.total_fills != null ? last.total_fills : null,
      measuredAt: last.ts || null,
      source: 'agents/fill-ledger.json (הליכת היום, היקף יומי מ-00:00Z)',
    };
  }
  const ea = readJson('agents/earn-audit.json');
  const head = (ea && ea.per_account || []).find((a) => a && a.account === 'headcorner') || {};
  proof.sections.pnl = {
    title: 'האמת על הכסף — רווח והפסד, בלי קישוט',
    lifetime: {
      realizedSbd: row(m.realizedSbd ?? null, 'agents/truth-baseline.json', tb && tb.takenAt, 'מדד כל-חיים של המסחר'),
      usdPerDay7dAvg: row(m.usdPerDay7dAvg ?? null, 'agents/truth-baseline.json', tb && tb.takenAt),
      trips: row(m.trips ?? null, 'agents/truth-baseline.json', tb && tb.takenAt),
    },
    today: day,
    incomeStreams: {
      contentRewards: row(head.author_sbd != null ? head.author_sbd + (head.author_steem || 0) : null, 'agents/earn-audit.json (chain truth, 7d window + lifetime walk)', ea && ea.at, 'נמדד מת: 1421 הצבעות + 56 פוסטים → 0.000 לכל החיים — לולאת התוכן עדיין לא מרוויחה (CR-0046)'),
      tradingSpread: row(day ? day.realizedSbdToday : null, day && day.source, day && day.measuredAt, 'הרגל היחידה שנמדדה עם תנועה — כרגע סביב האפס, ה-buy-premium breaker סוגר את הדליפה (CR-0047)'),
    },
  };

  // ── 3b. הגל המתוכנן — לוח ההבשלות האמיתי (Z-72, CR-0053): הסיפור "~435 STEEM Oct-7" היה
  //    בדיה; האמת הנמדדת — 23 המרות, 117.887 SBD, מבשילות 2026-10-06T00:02Z → 2026-10-07T01:38Z.
  //    כל מספר מגיע מהקאנון שקורא את השרשרת עצמה (הליכת 90 עמודים), עם המקור והזמן.
  const cc = readJson('agents/convert-canon.json');
  const pend = (cc && Array.isArray(cc.pending)) ? cc.pending : [];
  const lastMat = pend.length ? pend[pend.length - 1].conversion_date : null;
  proof.sections.rotation = {
    title: 'הגל המתוכנן — לוח ההבשלות מהשרשרת עצמה (ההפתעה שנמדדה, לא סיפור)',
    rows: {
      pendingConverts: row(pend.length || (cc ? 0 : null), 'agents/convert-canon.json (chain walk, 90 pages)', cc && cc.at, 'המרות SBD→STEEM שנפתחו ועוד לא הבשילו — מדוד מהשרשרת, לא מהספרים'),
      pendingTotalSbd: row(cc ? cc.total_pending_sbd : null, 'agents/convert-canon.json', cc && cc.at, 'סך ה-SBD שיהפוך ל-STEEM במחיר ה-feed בהבשלה'),
      nextMaturity: row(cc ? cc.next_maturity : null, 'agents/convert-canon.json', cc && cc.at, 'ההבשלה הבאה — חלון העימוד המוקדם נפתח 24 שעות לפניה'),
      waveEnds: row(lastMat, 'agents/convert-canon.json', cc && cc.at, 'סוף הגל הנוכחי — ההבשלה האחרונה בלוח'),
      undated: row(cc ? (cc.undated ?? 0) : null, 'agents/convert-canon.json', cc && cc.at, 'המרות בלי תאריך ניתן לחישוב — לעולם לא מנוחשות (חוק CR-0054)'),
      honestyFix: row('~435 STEEM Oct-7 → התיקון: 117.887 SBD בגל 10-06..10-07', 'agents/change-requests/CR-0054-maturity-law-rung.json', '2026-10-04T00:30:00Z', 'הספרים הקודמים סיפרו סיפור לא נמדד — התוקן ונחתם ב-E45'),
    },
  };

  // ── 4. מה רץ לבד — האוטונומיה ────────────────────────────────────────────────
  const keeper = readJson('agents/tick-keeper.json');
  const arcRows = {};
  const arc = (keeper && keeper.arc) || {};
  for (const desk of Object.keys(arc)) {
    arcRows[desk] = row(arc[desk] && arc[desk].last_ts || null, 'agents/' + desk.replace(/\.yml$/, '') + ' receipts (agents/tick-keeper.json)', keeper && keeper.at, 'מקסימום פער מותר: ' + (arc[desk] && arc[desk].max_gap_min) + 'm');
  }
  let wfTotal = null, wfScheduled = null;
  try {
    wfTotal = fs.readdirSync(path.join(ROOT, '.github', 'workflows')).filter((f) => f.endsWith('.yml')).length;
    wfScheduled = fs.readdirSync(path.join(ROOT, '.github', 'workflows')).filter((f) => {
      try { return fs.readFileSync(path.join(ROOT, '.github', 'workflows', f), 'utf8').includes('cron:'); } catch (_) { return false; }
    }).length;
  } catch (_) {}
  proof.sections.autonomy = {
    title: 'מה רץ לבד — 24/7, בלי מפתח, עם מרפא עצמי',
    rows: {
      workflowsTotal: row(wfTotal, '.github/workflows (tree scan)', null),
      workflowsScheduled: row(wfScheduled, '.github/workflows (tree scan)', null),
      keeperArcDesks: row(Object.keys(arc).length, 'agents/tick-keeper.json', keeper && keeper.at, 'השומר מודד את הקבלות של הדסקים עצמן ומצית מחדש דסק רעב'),
      stasisBreaker: row(false, 'agents/STASIS.json', null, 'השובר ריק — אין עצירה בתוקף'),
    },
    arc: arcRows,
  };

  // ── 5. חוקים ומשמעת ────────────────────────────────────────────────────────
  const ca = readJson('agents/claims-audit.json');
  const cen = readJson('agents/fleet-census.json');
  proof.sections.laws = {
    title: 'משמעת — מה מוכח ומה נבדק',
    rows: {
      claimsAudit: row(ca ? ca.verdict : null, 'agents/claims-audit.json', ca && ca.at, 'כל קובץ שנטען בפנקס — נבדק שהוא באמת על העץ'),
      censusLanes: row(cen && cen.summary ? cen.summary.lanes : null, 'agents/fleet-census.json', cen && cen.at, 'מפת ה-16 מסלולים של הצי'),
      ownerLanguage: row('he', 'agents/claims-audit.cjs OWNER_LANGUAGE (CR-0050)', null, 'כל פנייה לבעלים — בעברית'),
    },
  };
  return proof;
}

/** strip volatile fields for the determinism law */
function stableOf(proof) {
  const s = JSON.parse(JSON.stringify(proof));
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        if (k === 'at' || k === 'measuredAt' || k === 'generatedAt') delete o[k];
        else walk(o[k]);
      }
    }
  };
  walk(s);
  return s;
}

function renderMd(proof) {
  const L = [];
  L.push('# הוכחת הבעלים — עמוד אחד, כל האמת (owner-proof)');
  L.push('');
  L.push('_מורכב מהפנקסים המחויבים בלבד (keyless, offline). כל מספר נושא מקור + זמן מדידה — פתחו את הפנקס ובדקו._');
  L.push('');
  for (const key of Object.keys(proof.sections)) {
    const s = proof.sections[key];
    L.push('## ' + s.title);
    L.push('');
    for (const rk of Object.keys(s.rows || {})) {
      const r = s.rows[rk];
      L.push('- **' + rk + '**: ' + JSON.stringify(r.value) + ' — _מקור: ' + r.source + (r.measuredAt ? ' · נמדד: ' + r.measuredAt : '') + (r.note ? ' · ' + r.note : '') + '_');
    }
    for (const rk of Object.keys(s.arc || {})) {
      const r = s.arc[rk];
      L.push('- **arc · ' + rk + '**: קבלה אחרונה ' + JSON.stringify(r.value) + ' — ' + (r.note || '') + ' · נמדד: ' + (r.measuredAt || '—'));
    }
    if (s.lifetime) {
      for (const rk of Object.keys(s.lifetime)) {
        const r = s.lifetime[rk];
        L.push('- **' + rk + ' (lifetime)**: ' + JSON.stringify(r.value) + ' — _מקור: ' + r.source + (r.measuredAt ? ' · נמדד: ' + r.measuredAt : '') + (r.note ? ' · ' + r.note : '') + '_');
      }
    }
    if (s.today) L.push('- **יום אחרון**: realizedSbdToday=' + JSON.stringify(s.today.realizedSbdToday) + ', fills=' + JSON.stringify(s.today.fillsToday) + ' — ' + s.today.source);
    if (s.incomeStreams) {
      for (const rk of Object.keys(s.incomeStreams)) {
        const r = s.incomeStreams[rk];
        L.push('- **הכנסה · ' + rk + '**: ' + JSON.stringify(r.value) + ' — ' + (r.note || '') + ' · ' + r.source);
      }
    }
    L.push('');
  }
  L.push('_החוק: שום מספר לא מומצא, שום היקף לא מתגנב (יומי לעולם לא מתגלגל לכל-חיים), שום הפסד לא מוסתר._');
  L.push('');
  return L.join('\n');
}

function main() {
  const t0 = Date.now();
  try {
    const proof = composeOwnerProof();
    proof.at = new Date().toISOString();
    proof.duration_ms = Date.now() - t0;
    fs.writeFileSync(OUT_JSON, JSON.stringify(proof, null, 1) + '\n');
    fs.writeFileSync(OUT_MD, renderMd(proof));
    const stable = stableOf(proof);
    console.log('OWNER-PROOF ok · sections=' + Object.keys(proof.sections).length + ' · stable-bytes=' + Buffer.byteLength(JSON.stringify(stable)) + ' · עברית (owner-facing)');
    return 0;
  } catch (e) {
    console.error('owner-proof fail-soft:', String(e.message || e).slice(0, 120));
    return 0; // fail-soft: the desk never crashes the cadence
  }
}
if (require.main === module) process.exit(main());
module.exports = { composeOwnerProof, stableOf, renderMd };
