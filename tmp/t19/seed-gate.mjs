// seed-gate.mjs — עיגון-שער-הבעלים: הזרעת hash של המפתח המקורי (הסוד עצמו לא נשמר).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const PEPPER = 'owner-gate/2/keyfit';
const hash = (s) => createHash('sha256').update(`${PEPPER}:${s}`).digest('hex');

const file = readFileSync('/home/z/my-project/upload/headcorner.txt', 'utf-8');
const lines = file.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
const keyLine = lines.find((l) => l.length >= 51 && /^[1-9A-HJ-NP-Za-km-zP]+$/.test(l));
if (!keyLine) { console.log('NO-KEY-LINE'); process.exit(1); }
const stripped = keyLine.startsWith('P') && keyLine.length === 52 ? keyLine.slice(1) : keyLine;

// load DATABASE_URL from .env
for (const l of readFileSync('/home/z/my-project/.env', 'utf-8').split('\n')) {
  const m = /^DATABASE_URL=(.*)$/.exec(l.trim());
  if (m) process.env.DATABASE_URL ??= m[1].replace(/^["']|["']$/g, '');
}
const db = new PrismaClient();
const existing = await db.ownerGate.findFirst();
const canonical = hash(keyLine); // הצורה-כפי-שהיא-בקובץ (עם P)
if (existing) {
  await db.ownerGate.update({ where: { id: existing.id }, data: { secretHash: canonical } });
  console.log('REBOUND gate row ->', existing.id);
} else {
  const g = await db.ownerGate.create({ data: { secretHash: canonical } });
  console.log('SEEDED gate row ->', g.id);
}
console.log('canonical hash fingerprint:', canonical.slice(0, 12) + '…');
console.log('accepts: file-line (P-form) + stripped WIF + full-file paste');
await db.$disconnect();
