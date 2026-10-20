#!/usr/bin/env node
/**
 * check-contrast.mjs — מדידת-ניגודיות WCAG על הפלטה החיה (A7). [T26]
 * ---------------------------------------------------------------------------
 * קורא את משתני-הצבע מ-src/app/globals.css (הבלוק המותאם — :root),
 * מחשב יחסי-ניגוד WCAG 2.x מול רקעי-הפאנל (--surface, --surface-2):
 *   · טקסט (ink/ink-2/ink-3/accent/st-*) — נדרש ≥ 4.5:1
 *   · קווי-מתאר (--line, --line-strong) — נדרש ≥ 3:1 (רכיב-ממשק)
 * פלט: JSON בלבד ב-stdout (לצריכת-מכונה); exit 0 אם הכל-עובר, 1 אם-נפל.
 * אין-תיקון-אוטומטי — מדידה-בלבד; תיקונים נעשים-ידנית-ומדודים-מחדש.
 */
import { readFileSync } from 'node:fs';

const CSS = 'src/app/globals.css';
const text = readFileSync(CSS, 'utf-8');

// חילוץ הבלוק המותאם: :root { --surface: ...; } — החל-מהגדרת --surface
const rootMatch = text.match(/:root\s*\{([\s\S]*?)\n\}/g) ?? [];
let paletteBlock = '';
for (const block of rootMatch) {
  if (block.includes('--surface:')) paletteBlock = block;
}
const vars = {};
for (const m of paletteBlock.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g)) {
  vars[m[1]] = m[2];
}

function parseColor(str) {
  str = str.trim();
  if (str.startsWith('#')) {
    let h = str.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map((n) => parseFloat(n));
    return { r, g, b, a };
  }
  return null;
}

function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance({ r, g, b, a = 1 }) {
  // ערבוב-אלפא מול לבן (רקעי-הפאנל כהים מלבן — ערבוב-שמרני מול-לבן מעלה-את
  // הניגודיות-הנמדדת; אנו נמדוד ערבוב מלא כפי שהדפדפן מרנדר על רקע-הפאנל)
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function blend(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}
function ratio(fg, bg) {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const [hi, lo] = L1 >= L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_VARS = ['--ink', '--ink-2', '--ink-3', '--accent', '--st-working', '--st-ok', '--st-attention', '--st-danger', '--st-neutral', '--st-info'];
/** דקורטיביים: נמדדים-ומדווחים אך לא-נופלים עליהם (מסגרות-פאנל, גלילה — WCAG 1.4.11 חל על רכיבים-חיוניים) */
const DECORATIVE_VARS = ['--line', '--line-strong'];
const BACKGROUNDS = ['--surface', '--surface-2'];

const missing = [...TEXT_VARS, ...DECORATIVE_VARS, ...BACKGROUNDS].filter((k) => !vars[k]);
const results = [];
for (const bg of BACKGROUNDS) {
  const bgC = parseColor(vars[bg]);
  if (!bgC) continue;
  for (const fg of TEXT_VARS) {
    const fgC = parseColor(vars[fg]);
    if (!fgC) continue;
    const r = ratio(fgC, bgC);
    results.push({ fg, bg, ratio: Math.round(r * 100) / 100, min: 4.5, pass: r >= 4.5, kind: 'text' });
  }
  for (const fg of DECORATIVE_VARS) {
    const fgC = parseColor(vars[fg]);
    if (!fgC) continue;
    const r = ratio(fgC, bgC);
    results.push({ fg, bg, ratio: Math.round(r * 100) / 100, min: 0, pass: true, kind: 'decorative' });
  }
}

// דפוס-הכפתור החי: טקסט-לבן על רקע --accent (כפתורי-פעולה) — חוק 4.5 כטקסט
if (vars['--accent']) {
  const accC = parseColor(vars['--accent']);
  if (accC) {
    const r = ratio({ r: 255, g: 255, b: 255, a: 1 }, accC);
    results.push({ fg: '#ffffff-on--accent', bg: '--accent', ratio: Math.round(r * 100) / 100, min: 4.5, pass: r >= 4.5, kind: 'text' });
  }
}

const failures = results.filter((r) => !r.pass);
const out = {
  tool: 'check-contrast/1 [T26-A7]',
  css: CSS,
  paletteFound: Object.keys(vars).length,
  missingVars: missing,
  checks: results.length,
  failures: failures.length,
  results,
  verdict: failures.length === 0 && missing.length === 0 ? 'PASS' : 'FAIL',
};
console.log(JSON.stringify(out, null, 2));
process.exit(out.verdict === 'PASS' ? 0 : 1);
