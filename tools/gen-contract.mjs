#!/usr/bin/env node
// gen-contract.mjs — מחולל-החוזה [T28=A4]. אפס-תלות, Node 20.
// חולץ את הבלוק בין CONTRACT-FACTS-BEGIN/END מ-src/lib/contract-facts.ts,
// מחשב sha256 (דטרמיניסטי — מיון-מפתחות יציב), ומפיק:
//   out/contract.json  — החוזה-המכונה (schema network.contract/1 + integrity.sha256)
//   out/CONTRACT.md    — החוזה-האנושי (עברית)
// --selftest: יצירה-כפולה → אותו-sha256 (דטרמיניזם) + אימות-מבנה; exit 0/1.
// החוק: החוזה-מיוצר-מהקוד, לא-נכתב-יד; כל-סטייה בין-החוזה-למצב-החי נתפסת-ב-CI.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = new URL('../src/lib/contract-facts.ts', import.meta.url);
const OUT = new URL('../out/', import.meta.url);

function extractFacts() {
  const src = readFileSync(SRC, 'utf8');
  const m = src.match(/\/\/ CONTRACT-FACTS-BEGIN\n([\s\S]*?)\n\/\/ CONTRACT-FACTS-END/);
  if (!m) throw new Error('CONTRACT-FACTS block not found in contract-facts.ts');
  // הבלוק הוא הצהרת-TS תקנית (export const CONTRACT_FACTS = {...} as const;) —
  // החולץ מפשיט אותה-ל-JSON-טהור (מקור-אמת-יחיד, פרסינג-כפול-אפס-שוני).
  const body = m[1].replace(/^\s*export\s+const\s+CONTRACT_FACTS\s*=/, '').replace(/\s*as\s+const\s*;?\s*$/, '');
  return JSON.parse(body);
}
// טביעת-אצבע יציבה: מיון-מפתחות רקורסיבי → JSON יציב → sha256
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]));
  }
  return v;
}
function build() {
  const facts = extractFacts();
  const canon = JSON.stringify(stable(facts), null, 1);
  const sha = createHash('sha256').update(canon).digest('hex');
  return { facts, contract: { schema: facts.schema, generatedFrom: facts.generatedFrom, owner: facts.owner, integrity: { sha256: sha, canon: 'stable-sorted-json' }, facts }, canon };
}
function md(contract) {
  const f = contract.facts;
  const L = [];
  L.push('# חוזה-הרשת (מיוצר — לא-נכתב-יד)', '');
  L.push(`· סכמה: \`${contract.schema}\` · מקור: \`${contract.generatedFrom}\` · sha256: \`${contract.integrity.sha256.slice(0, 16)}…\``, '');
  L.push('## מסילת-כתיבה');
  L.push(`- ${f.writeLane.optimistic}`);
  L.push(`- ${f.writeLane.antiForgery}`, '');
  L.push('## שער-ריבונות');
  L.push(`- ${f.sovereignGate.law}`);
  for (const p of f.sovereignGate.paths) L.push(`  - \`${p.repo}:${p.path}\`${p.prefix ? ' (קידומת)' : ''}`);
  L.push(`- ${f.sovereignGate.receiptSettle}`, '');
  L.push('## חוק-קבלות');
  L.push(`- מינימום ${f.receiptLaw.minChars} תווים; ${f.receiptLaw.rule}`, '');
  L.push('## רוטציה והסגר');
  L.push(`- ${f.rotationLaw.rule}`);
  L.push(`- ${f.corruptionQuarantine}`, '');
  L.push('## קאש ומדידה');
  L.push(`- ${f.readCache.law} (TTL ${f.readCache.ttlMs}ms)`);
  L.push(`- ${f.chainMeasure.law} (TTL ${f.chainMeasure.ttlMs}ms)`, '');
  L.push('## דמה, שער-כוונות, כלוב');
  L.push(`- דמה: ${f.simSubstrate.doubleLock}`);
  L.push(`- שער: ${f.intentGate.law}`);
  L.push(`- כלוב: ${f.gitCage.law}`, '');
  L.push('## חוק-מפתחות וריפו-פרטי');
  L.push(`- ${f.keyLaw.rule}`);
  L.push(`- ${f.repoLaw.privateIsMemoryOnly}`, '');
  L.push('## מפת-אימוצים');
  L.push(`- מינימום ${f.adoptionMap.minMechanisms} מנגנונים ב-\`${f.adoptionMap.registry}\`: ${f.adoptionMap.mechanisms.join(', ')}`, '');
  L.push('## קבצי-מצב מאומתים-ב-CI');
  for (const p of f.stateContract.validatedPaths) L.push(`- \`${p}\``);
  L.push('', `-${' '}${f.stateContract.rule}`);
  return L.join('\n');
}
// אימות-מבנה: כל-מפתחות-החוק-הקיימים-חייבים-להופיע
function validate(contract) {
  const need = ['schema', 'writeLane', 'sovereignGate', 'receiptLaw', 'rotationLaw', 'corruptionQuarantine', 'readCache', 'chainMeasure', 'simSubstrate', 'intentGate', 'gitCage', 'keyLaw', 'repoLaw', 'adoptionMap', 'stateContract'];
  const missing = need.filter((k) => !(k in contract.facts));
  if (missing.length) throw new Error('missing facts: ' + missing.join(','));
  if (contract.facts.adoptionMap.mechanisms.length < contract.facts.adoptionMap.minMechanisms) throw new Error('adoptionMap below minimum');
  if (contract.facts.receiptLaw.minChars < 8) throw new Error('receipt minChars below law');
  return true;
}
const once = build();
validate(once.contract);
mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('contract.json', OUT), JSON.stringify(once.contract, null, 2) + '\n');
writeFileSync(new URL('CONTRACT.md', OUT), md(once.contract) + '\n');
if (process.argv.includes('--selftest')) {
  const second = build();
  const same = second.contract.integrity.sha256 === once.contract.integrity.sha256;
  const jsonOk = (() => { try { JSON.parse(JSON.stringify(once.contract)); return true; } catch { return false; } })();
  console.log(`selftest: determinism=${same ? 'PASS' : 'FAIL'} json=${jsonOk ? 'PASS' : 'FAIL'} sha256=${once.contract.integrity.sha256.slice(0, 12)}…`);
  process.exit(same && jsonOk ? 0 : 1);
}
console.log(`contract generated: sha256=${once.contract.integrity.sha256.slice(0, 12)}… → out/contract.json + out/CONTRACT.md`);
