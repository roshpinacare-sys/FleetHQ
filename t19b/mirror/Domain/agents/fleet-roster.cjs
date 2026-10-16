'use strict';
/**
 * FLEET-ROSTER — כלי-הרוסטר-הקנון (owner directive 2026-10-04, trace 1a1…0451)
 * ═════════════════════════════════════════════════════════════════════════════════════
 * מצב: status (קריאה-חיה) | selftest (טהור, אופליין — 8 אסרטים)
 * ריצה: node agents/fleet-roster.cjs status|selftest
 *
 * חוק: הרוסטר הוא מקור-האמת היחיד ליעדי-הון. שינוי = פקודת-בעלים בלבד, מתועדת בהיסטוריה.
 */
const fs = require('fs');
const path = require('path');
const ROSTER_FILE = path.join(__dirname, 'fleet-roster.json');

function load() {
  const r = JSON.parse(fs.readFileSync(ROSTER_FILE, 'utf8'));
  if (r.protocol !== 'SAOS-FLEET-ROSTER/1') throw new Error('bad protocol');
  return r;
}

function selftest() {
  const t = (name, ok) => { console.log(` ${ok ? '✓' : '✗'} ${name}`); if (!ok) process.exitCode = 1; };
  const r = load();
  t('protocol SAOS-FLEET-ROSTER/1', r.protocol === 'SAOS-FLEET-ROSTER/1');
  t('head = headcorner', r.head === 'headcorner');
  t('fleet has 13 members (10 operators + hcsoldier4/5/6)', Array.isArray(r.steemFleet) && r.steemFleet.length === 13);
  t('no banned name inside the fleet', r.steemFleet.every((n) => !r.bannedCapital.some((b) => b.name === n)));
  t('ban list carries hcsoldier1/2/3 (LOST-NO-CUSTODY)', ['hcsoldier1', 'hcsoldier2', 'hcsoldier3'].every((n) => r.bannedCapital.some((b) => b.name === n && /LOST-NO-CUSTODY/.test(b.reason))));
  t('ban list carries ynet (retired)', r.bannedCapital.some((b) => b.name === 'ynet'));
  t('every ban carries a reason', r.bannedCapital.every((b) => typeof b.reason === 'string' && b.reason.length > 10));
  t('law statement present', typeof r.law === 'string' && r.law.length > 20);
  console.log(process.exitCode === 1 ? 'FLEET-ROSTER SELFTEST: FAIL' : 'FLEET-ROSTER SELFTEST: PASS');
}

function status() {
  const r = load();
  console.log(`fleet-roster: head=@${r.head} · fleet=${r.steemFleet.length} · banned=${r.bannedCapital.length} · asOf=${r.asOf}`);
  console.log('  fleet: ' + r.steemFleet.join(', '));
  for (const b of r.bannedCapital) console.log(`  banned: @${b.name} — ${b.reason.slice(0, 90)}…`);
}

const mode = process.argv[2] || 'status';
if (mode === 'selftest') selftest();
else if (mode === 'status') status();
else { console.log('usage: node agents/fleet-roster.cjs status|selftest'); process.exit(2); }
