#!/usr/bin/env node
/**
 * adsmarket-panel.cjs — R31 (WO-unwired-adsmarket-marketing, trace 1a1…6fd5).
 *
 * The owner's law: quality content must not stay buried ("מרוב-שכבות-יש-דברים-איכותיים").
 * Adsmarket holds the full EN-HE marketing value (fact-sheet 93KB txid-backed, deck,
 * pitch, press-kit, social 54KB, explainer, articles) — but the repo is PRIVATE, so
 * no public raw/Pages mirror is lawful. THIS panel publishes the MEASURED VIEW:
 * inventory metadata + canonical git pointers. Zero content duplication (one-room
 * law) — every byte of prose stays in the source repo; this book only proves it
 * exists, how big/fresh/backed it is, and where exactly to find it.
 *
 * Expects the private checkout at ADSMARKET_DIR (default: adsmarket-repo/).
 * Missing dir = honest UNREACHABLE receipt (never faked, exit 0 — amber gate).
 *
 * Output: marketing/adsmarket.json (served by Domain Pages, rendered by
 * marketing/adsmarket.html).
 */
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC = process.env.ADSMARKET_DIR || path.join(ROOT, 'adsmarket-repo');
const OUT = path.join(ROOT, 'marketing', 'adsmarket.json');

const KEY_ASSETS = [
  { name: 'fact-sheet (EN, txid-backed)', file: 'fact-sheet.md' },
  { name: 'fact-sheet (HE internal)', file: 'fact-sheet-internal-he.md' },
  { name: 'pitch deck (live html)', file: 'pitch-deck.html' },
  { name: 'product deck (live html)', file: 'deck/index.html' },
  { name: 'EN landing (live html)', file: 'index-en.html' },
  { name: 'EN explainer (live html)', file: 'content/explainer/en.html' },
  { name: 'press kit', file: 'press/press-kit.md' },
  { name: 'social pack', file: 'social.md' },
  { name: 'fleet comments kit', file: 'content/fleet/comments-kit.md' },
  { name: 'ads pack v2', file: 'content/ads/ads-pack-v2.md' },
  { name: 'identity API doc', file: 'content/api/identity-api.md' },
];

const sha16 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const rel = base ? `${base}/${e.name}` : e.name;
  return e.isDirectory() && !e.name.startsWith('.') ? walk(path.join(dir, e.name), rel) : [rel];
});
const countHex40 = (text) => (text.match(/\b[0-9a-f]{40}\b/g) || []).length;

function headSha() {
  try {
    const h = fs.readFileSync(path.join(SRC, '.git', 'HEAD'), 'utf8').trim();
    if (h.startsWith('ref: ')) {
      const ref = h.slice(5);
      try {
        return fs.readFileSync(path.join(SRC, '.git', ref), 'utf8').trim() || h;
      } catch {
        // packed refs fallback
        const packed = fs.readFileSync(path.join(SRC, '.git', 'packed-refs'), 'utf8');
        const line = packed.split('\n').find((l) => l.endsWith(' ' + ref));
        return line ? line.split(' ')[0].trim() : h;
      }
    }
    return h;
  } catch { return null; }
}

if (!fs.existsSync(SRC)) {
  const receipt = {
    schema: 'saos.adsmarket-panel/1',
    generatedAt: new Date().toISOString(),
    state: 'UNREACHABLE',
    reason: `private checkout ${process.env.ADSMARKET_DIR || 'adsmarket-repo/'} absent — checkout step failed (credential scope) — honest amber, never faked`,
    source: { repo: 'roshpinacare-sys/Adsmarket', visibility: 'private' },
    note: 'one-room law: when reachable, this book carries metadata + git pointers only',
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 1) + '\n');
  console.log(`ADSMARKET-PANEL: UNREACHABLE (${receipt.reason})`);
  process.exit(0);
}

const head = headSha();
const all = walk(SRC);
const assets = [];
for (const a of KEY_ASSETS) {
  const p = path.join(SRC, a.file);
  if (!fs.existsSync(p)) {
    assets.push({ name: a.name, file: a.file, state: 'MISSING' });
    continue;
  }
  const buf = fs.readFileSync(p);
  const text = buf.toString('utf8');
  assets.push({
    name: a.name,
    file: a.file,
    bytes: buf.length,
    sha16: sha16(buf),
    txidAnchors: countHex40(text),
    txidMentions: (text.match(/txid/gi) || []).length,
    pointer: `roshpinacare-sys/Adsmarket@${String(head).slice(0, 8)}:${a.file}`,
    state: 'MEASURED',
  });
}
const articles = all.filter((f) => /^content\/articles\/(en|he)\//.test(f) && f.endsWith('.md'));
const emailDrips = all.filter((f) => /^content\/email\//.test(f) && f.endsWith('.md'));

const measured = assets.filter((a) => a.state === 'MEASURED');
const book = {
  schema: 'saos.adsmarket-panel/1',
  generatedAt: new Date().toISOString(),
  state: measured.length ? 'MEASURED' : 'EMPTY',
  law: 'one-room: metadata + canonical git pointers only — zero content duplication; the prose lives in roshpinacare-sys/Adsmarket (private), this book proves its existence, freshness and txid backing',
  source: { repo: 'roshpinacare-sys/Adsmarket', ref: 'main', headSha: String(head).slice(0, 8), visibility: 'private' },
  assets,
  totals: {
    filesInRepo: all.length,
    measuredAssets: measured.length,
    missingAssets: assets.length - measured.length,
    bytesMeasured: measured.reduce((s, a) => s + (a.bytes || 0), 0),
    txidAnchorsTotal: measured.reduce((s, a) => s + (a.txidAnchors || 0), 0),
    articlesEnHe: articles.length,
    emailDrips: emailDrips.length,
  },
  panel: 'https://roshpinacare-sys.github.io/Domain/marketing/adsmarket.html',
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(book, null, 1) + '\n');
console.log(`ADSMARKET-PANEL: ${book.state} — ${book.totals.measuredAssets}/${book.totals.measuredAssets + book.totals.missingAssets} measured, ${book.totals.bytesMeasured} bytes, txid anchors ${book.totals.txidAnchorsTotal}, articles ${book.totals.articlesEnHe} @ ${book.source.headSha}`);
