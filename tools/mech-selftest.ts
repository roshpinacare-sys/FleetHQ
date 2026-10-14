#!/usr/bin/env node
/**
 * mech-selftest.ts — בדיקה-עצמית של מנגנוני-המצב (A6/A9/A11/A4). [T26]
 * ---------------------------------------------------------------------------
 * מריץ את חוקי-השער-והדמה ישירות מול הספרייה — בתהליך-מבודד, אפס-רשת, אפס-נגיעה
 * בגיט-אמת. זהה-בחוקים ל-/api/engineering POST action=simselftest; קיים כ-CLI
 * כדי-שניתן-יהיה לאמת-מנגנון בלי-כניסת-בעלים (ה-API שומר על ההרשאה עבור הפנקס).
 * פלט: JSON; exit 0 = PASS.
 * הרצה: bun tools/mech-selftest.ts
 */
import {
  simReset, simStats, writeGitFile, readGitFile, readJsonState, gateVerdict, simPut,
} from '../src/lib/git-state';

interface Check { check: string; want: string; got: string; pass: boolean }
const checks: Check[] = [];
const push = (check: string, want: string, got: string, pass: boolean) => checks.push({ check, want, got, pass });

const REPO = 'Autonomy';

// 1. A9: כתיבה-מוגנת בלי-אימות-בעלים → חסומה
const blocked = await writeGitFile(REPO, 'state/keys/REGISTRY.json', '{"hacked":true}', { sim: true, message: 'attack' });
push('gate: כתיבה-מוגנת בלי-בעלים', 'blocked', blocked.ok ? 'ALLOWED' : (blocked.error ?? 'blocked'), !blocked.ok);

// 2. A9: כתיבה-מוגנת עם אימות-בעלים → עוברת + readback
const allowed = await writeGitFile(REPO, 'state/keys/REGISTRY.json', '{"schema":"sim.test/1"}', {
  sim: true, message: 'sovereign', gate: { authority: 'sovereign', ownerVerified: true },
});
push('gate: כתיבה-מוגנת עם-בעלים', 'ok+readback', allowed.ok ? `ok ${allowed.sha?.slice(0, 8)}` : (allowed.error ?? 'fail'), allowed.ok);

// 3. A9: יישוב-ריבוני עם קבלה-קצרה → חסום
const shortR = gateVerdict(REPO, 'state/keys/REGISTRY.json', { authority: 'receipt', receiptRef: 'short', ownerVerified: true });
push('gate: יישוב-קבלה-קצרה', 'blocked', shortR.ok ? 'ALLOWED' : 'blocked', !shortR.ok);

// 4. A9: יישוב-ריבוני עם קבלה-תקינה + בעלים → עובר
const goodR = gateVerdict(REPO, 'state/keys/REGISTRY.json', { authority: 'receipt', receiptRef: 'receipt-12345678', ownerVerified: true });
push('gate: יישוב-קבלה-תקינה', 'ok', goodR.ok ? 'ok' : (goodR.error ?? 'fail'), goodR.ok);

// 5. A6: מחזור בדמה — read-null → write → conflict → readback
simReset();
const r0 = await readGitFile(REPO, 'state/app/sim-cycle.json', 'main', true);
push('sim: קריאה-ראשונה', 'null', r0.ok && r0.text === null ? 'null' : 'unexpected', r0.ok && r0.text === null);
const w1 = await writeGitFile(REPO, 'state/app/sim-cycle.json', '{"n":1}', { sim: true, message: 'w1' });
const stale = await writeGitFile(REPO, 'state/app/sim-cycle.json', '{"n":2}', { sim: true, message: 'stale', baseSha: '0'.repeat(40) });
push('sim: התנגשות-baseSha-ישן', 'conflict', stale.ok ? 'WROTE' : stale.conflict ? 'conflict' : (stale.error ?? 'fail'), !stale.ok && !!stale.conflict);
const r1 = await readGitFile(REPO, 'state/app/sim-cycle.json', 'main', true);
push('sim: readback מדויק', '{"n":1}', r1.text ?? 'null', w1.ok && r1.text === '{"n":1}');

// 6. A11-דמה: JSON שבור → corrupt מדווח, לא מושתק
simPut('Autonomy/main/state/app/sim-broken.json', '{broken');
const broken = await readJsonState(REPO, 'state/app/sim-broken.json', 'main', true);
push('sim: הסגר-פגום', 'corrupt מדווח', broken.corrupt ? 'corrupt' : 'silent', broken.corrupt === true);

// 7. אימות-נגישה-אמת: קריאה-אמת בלי-sim עדיין עוברת-דרך-הרשת (לא נוגעים — רק קוראים)
const realRead = await readJsonState<Record<string, unknown>>(REPO, 'state/app/engineering.json');
push('אמת: קריאת-גיט אמיתית', 'ok', realRead.ok ? 'ok' : (realRead.error ?? 'fail'), realRead.ok);

const stats = simStats();
// אחרי simReset-האמצעי נותרו בדיוק שני-קבצי-סעיף-הדמה (cycle+broken) — חוק-הניקוי
push('sim: מאגר-נדיף', '2 קבצים (ניקוי-מדוד)', `${stats.files} קבצים / ${stats.ops} פעולות`, stats.files === 2);
simReset();

const pass = checks.every((c) => c.pass);
console.log(JSON.stringify({ tool: 'mech-selftest/1 [T26]', pass, checks }, null, 2));
process.exit(pass ? 0 : 1);
