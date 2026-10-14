#!/usr/bin/env node
/**
 * queue-close.mjs — סגירת-סדרי-עבודה מוכחת-קבלה ב-ops-intake. [T29]
 * ---------------------------------------------------------------------------
 * חוק (T27 — terminal-receipt): קבלת-דולג/הסלמה/skipped/escalated/refused על
 * סדר-פתוח = הסדר נפתר-מחוץ-למסילת-המבצע → closure-eligible. סדר כזה לא
 * מרחף-לנצח: נסגר כאן עם הקבלה-עצמה מוטמעת (receipt-backed), כתיבה-אופטימית
 * עם sha + readback-MD5. סדר בלי-קבלה-טרמינלית לא נוגעים בו (כנות).
 * פלט: JSON; exit 0 = כל-היעדים נסגרו-או-כבר-סגורים.
 * הרצה: node tools/queue-close.mjs [id1 id2 ...]
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const rawPat = (() => {
  try {
    const raw = readFileSync('/home/z/my-project/upload/pat.env', 'utf-8').trim();
    return raw.includes('=') ? raw.split('=').slice(1).join('=').trim() : raw;
  } catch {
    return '';
  }
})();
const TOKEN = process.env.GH_PAT || rawPat;
const ORG = 'roshpinacare-sys';
const API = 'https://api.github.com';
const md5 = (s) => createHash('md5').update(s, 'utf-8').digest('hex');
const NOW = new Date().toISOString();
const TERMINAL = /דולג|הסלמה|skipped|escalated|refused/i;

if (!TOKEN) {
  console.error(JSON.stringify({ ok: false, error: 'no-pat — כתיבה נופלת-סגור' }));
  process.exit(1);
}
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'queue-close/1 [T29]',
};

async function gh(method, path, payload) {
  const res = await fetch(`${API}${path}`, {
    method, headers: H, body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  let body = {};
  try { body = await res.json(); } catch { /* ריק-תקין */ }
  return { status: res.status, body };
}

async function getText(repo, path) {
  const r = await gh('GET', `/repos/${ORG}/${repo}/contents/${path}?ref=main`);
  if (r.status !== 200) return { status: r.status, text: null, sha: null };
  const text = Buffer.from(r.body.content ?? '', 'base64').toString('utf-8');
  return { status: 200, text, sha: r.body.sha };
}

const targets = process.argv.slice(2);

// 1. התור החי
const q = await getText('ops-intake', 'ops/QUEUE.json');
if (q.status !== 200 || !q.text) {
  console.error(JSON.stringify({ ok: false, error: `queue http-${q.status}` }));
  process.exit(1);
}
const queueDoc = JSON.parse(q.text);
const orders = Array.isArray(queueDoc.orders) ? queueDoc.orders : [];

// 2. הקבלות (מקור-האמת לסגירה)
const rc = await getText('ops-forge', 'ops/RECEIPTS.jsonl');
const receipts = [];
if (rc.status === 200 && rc.text) {
  for (const line of rc.text.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    try { receipts.push(JSON.parse(line)); } catch { /* שורה-שבורה */ }
  }
}
const lastReceiptByOrder = new Map();
for (const r of receipts) {
  if (r.orderId) lastReceiptByOrder.set(r.orderId, r); // האחרונה-מנצחת
}

// 3. סגירה-מוכחת-קבלה בלבד
const closed = [];
const skipped = [];
for (const id of targets) {
  const order = orders.find((o) => o.id === id);
  if (!order) { skipped.push({ id, why: 'לא-נמצא-בתור' }); continue; }
  if ((order.status ?? 'OPEN') !== 'OPEN') { skipped.push({ id, why: `כבר-${order.status}` }); continue; }
  const rec = lastReceiptByOrder.get(id);
  if (!rec || !TERMINAL.test(String(rec.result ?? ''))) {
    skipped.push({ id, why: 'אין-קבלה-טרמינלית — לא נוגעים (כנות)' });
    continue;
  }
  order.status = 'CLOSED';
  order.closedAt = NOW;
  order.closedBy = 'queue-close [T29]';
  order.closureReceipt = {
    law: 'terminal-receipt [T27]',
    at: rec.at ?? null,
    result: String(rec.result ?? '').slice(0, 200),
  };
  closed.push(id);
}

if (closed.length === 0) {
  console.log(JSON.stringify({ ok: true, closed, skipped, note: 'אין-מה-לסגור' }));
  process.exit(0);
}

// 4. כתיבה-אופטימית + readback-MD5
const nextText = JSON.stringify(queueDoc, null, 2) + '\n';
const put = await gh('PUT', `/repos/${ORG}/ops-intake/contents/ops/QUEUE.json`, {
  message: `queue-close: סגירה-מוכחת-קבלה של ${closed.join(', ')} (terminal-receipt) [T29]`,
  content: Buffer.from(nextText, 'utf-8').toString('base64'),
  sha: q.sha,
  branch: 'main',
});
if (put.status !== 200 && put.status !== 201) {
  console.error(JSON.stringify({ ok: false, error: `put http-${put.status}`, closed, skipped }));
  process.exit(1);
}
const rb = await getText('ops-intake', 'ops/QUEUE.json');
const readbackOk = rb.status === 200 && md5(rb.text ?? '') === md5(nextText);
const commit = String(put.body?.commit?.sha ?? '').slice(0, 9);
console.log(JSON.stringify({ ok: readbackOk, closed, skipped, commit, readback: readbackOk ? 'MATCH' : 'MISMATCH' }));
process.exit(readbackOk ? 0 : 1);
