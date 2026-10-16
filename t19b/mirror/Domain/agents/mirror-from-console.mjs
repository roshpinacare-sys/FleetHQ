// MIRROR-FROM-CONSOLE — סוכן השיקוף של הבלוק האחד (r144-h)
//
// החוק החדש (BLOC.md): הקיפולים של האמת מחושבים פעם אחת — ב-Console
// (מרכז-אמת-המפעיל). הזרימות-התאומות שחישבו אותם פעמיים (agents-watch,
// money-watch, dex-watch, console-publish, truth-gate) הוסרו מכאן ב-
// r144-h; הפלטים שלהן מגיעים לכאן בשיקוף חסר-מפתחות מהמראה הציבורית
// החיה של Console — בדיוק דוקטרינת R63 (dex-mirror) בהפעלה שלישית.
//
// שני סוגי משטחים:
//   1. DATA (JSON, העתקה מילולית): registry/gh-snapshot (צי), money/
//      deposits/watch (ספרי-כסף), truth/latest+history+slo (פסקי-דין).
//      כל קובץ נבדק לפני כתיבה: JSON תקין + חותמת-זמן קריאה + גיל
//      < 48ש' כשחותמת קיימת. מקור מעופש/שבור לא נכתב — העותק נשמר,
//      הכישלון נרשם בכנות.
//   2. HTML (משטחי-תנועה): העתקה מותנית-כנות. הקנוני הוא של Console;
//      אנחנו כותבים אותו עם החלפת-כתובת (Console→Domain) רק כל עוד
//      העותק המקומי שלנו הוא בדיוק הקנוני-מוחלף-כתובת. ברגע של-Domain
//      דריכה-מקומית אמיתית (תוכן משלה, כמו ה-SLO החמישי ב-truth.html),
//      השיקוף נעצר לאותו קובץ ורושם DRIFT — לעולם לא דורך על תוכן.
//
// תזמון: שעתי ב-:15 (מפת-הדקות ב-Domain ללא חפיפה: moment :12/:42 ·
// dex-mirror :52 · agent-verify :55 דו-שעתי · weave-mirror :57).
// אפס-סודות: קריאה ציבורית בלבד + הטוקן של הריפו הזה.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const SRC = "https://roshpinacare-sys.github.io/Console";
const MAX_SOURCE_AGE_H = 48;

// DATA: העתקה מילולית (פלטי הזרימות שבעלותן ב-Console מעתה)
const DATA = [
  { path: "agents/registry.json", ts: (d) => d.generatedAt },
  { path: "agents/gh-snapshot.json", ts: (d) => d.generatedAt },
  { path: "dex/money.json", ts: (d) => d.publishedAt },
  { path: "dex/pnl-desk.json", ts: (d) => d.generatedAt },
  { path: "dex/deposits.json", ts: (d) => d.updatedAt || d.generatedAt || d.publishedAt },
  { path: "dex/watch.json", ts: (d) => d.publishedAt },
  { path: "truth/latest.json", ts: (d) => d.at },
  { path: "truth/history.json", ts: (d) => (Array.isArray(d.runs) && d.runs.length && d.runs[d.runs.length - 1].at) || null },
  { path: "truth/slo.json", ts: (d) => d.generatedAt },
  // r68: ספרי-מנועי-השרשרת (חוק r68 ב-BLOC — מחושבים ב-Console בלבד,
  // Domain משקף ומציג, לעולם לא מחשב מחדש)
  { path: "weave/census.json", ts: (d) => d.generatedAt },
  { path: "weave/vitals.json", ts: (d) => d.generatedAt },
  { path: "weave/agreement.json", ts: (d) => d.generatedAt },
];

// HTML: שטחי-התנועה הכפולים — הוסרו מהשיקוף ב-Task 14-b (2026-10-02):
// Domain הוא עתה החזית הציבורית הריבונית (SEO משלו, נייד משלו, דוחות משלו)
// ו-Console הוא מרכז-ההפעלה. כל שטח-HTML של Domain נערך בבית הזה בלבד —
// השיקוף השאיר את המנגנון (DRIFT → עצירה-כנה) כהגנה רדומה, אך אינו מעתיק
// עוד דפים. הפיצול מתועד ב-README.md (§ Domain × Console — פיצול התפקידים).
const HTML = [];

function swapToDomain(text) {
  return text
    .replaceAll("roshpinacare-sys.github.io/Console", "roshpinacare-sys.github.io/Domain")
    .replaceAll('href="/Console/', 'href="/Domain/');
}

const r2 = (v) => Math.round(v * 100) / 100;
const report = { format: "mirror-from-console-report-v1", generatedAt: new Date().toISOString(), source: SRC, data: {}, html: {}, summary: {} };
let dUpdated = 0, dKept = 0, dWarned = 0, hUpdated = 0, hKept = 0, hDrift = 0, hWarned = 0;
const lines = [];

async function fetchSource(rel) {
  const r = await fetch(`${SRC}/${rel}?t=${Date.now()}`, { headers: { "User-Agent": "mirror-from-console" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ── DATA ──
for (const { path: rel, ts } of DATA) {
  try {
    const text = await fetchSource(rel);
    const doc = JSON.parse(text);
    const stamp = ts(doc);
    let ageNote = "no-timestamp (copied, unaged)";
    if (stamp) {
      const ageH = (Date.now() - Date.parse(stamp)) / 3.6e6;
      if (Number.isFinite(ageH) && ageH > MAX_SOURCE_AGE_H) {
        dWarned++;
        report.data[rel] = { status: "WARN", ageH: r2(ageH), note: `source ${r2(ageH)}h old (> ${MAX_SOURCE_AGE_H}h) - a dying pipeline is not mirrored, current copy kept` };
        lines.push(`WARN ${rel}: ${report.data[rel].note}`);
        continue;
      }
      ageNote = `${r2(ageH)}h old at source`;
    }
    const local = rel;
    let changed = true;
    if (existsSync(local)) {
      try {
        changed = JSON.stringify(JSON.parse(readFileSync(local, "utf8"))) !== JSON.stringify(doc);
      } catch { changed = true; }
    }
    if (changed) {
      // r68: ספרייה חדשה (כמו weave/) עשויה שלא להתקיים בבית — יוצרים
      // אותה לפני הכתיבה (נמדד: writeFileSync זרק ENOENT על weave/)
      const dir = local.includes("/") ? local.slice(0, local.lastIndexOf("/")) : ".";
      mkdirSync(dir, { recursive: true });
      writeFileSync(local, text.endsWith("\n") ? text : text + "\n");
      dUpdated++;
      report.data[rel] = { status: "MIRRORED", age: ageNote };
      lines.push(`MIRRORED ${rel}: ${ageNote}`);
    } else {
      dKept++;
      report.data[rel] = { status: "OK", age: ageNote };
      lines.push(`OK ${rel}: identical (${ageNote})`);
    }
  } catch (e) {
    dWarned++;
    report.data[rel] = { status: "WARN", note: `source unreadable (${String(e.message).slice(0, 60)}) - current copy kept` };
    lines.push(`WARN ${rel}: source unreadable (${String(e.message).slice(0, 60)})`);
  }
}

// ── HTML ──
for (const rel of HTML) {
  try {
    const canonical = await fetchSource(rel);
    const swapped = swapToDomain(canonical);
    const localPath = rel;
    if (!existsSync(localPath)) {
      writeFileSync(localPath, swapped);
      hUpdated++;
      report.html[rel] = { status: "MIRRORED", mode: "urlswap-copy", note: "no local copy - canonical adopted" };
      lines.push(`MIRRORED ${rel}: canonical adopted (urlswap)`);
      continue;
    }
    const mine = readFileSync(localPath, "utf8");
    if (mine === swapped) {
      hKept++;
      report.html[rel] = { status: "OK", mode: "urlswap-copy", note: "local copy is exactly the swapped canonical" };
      lines.push(`OK ${rel}: local == swapped canonical`);
    } else if (mine === canonical) {
      hKept++;
      report.html[rel] = { status: "OK", mode: "byte-copy", note: "local copy is byte-identical to the canonical" };
      lines.push(`OK ${rel}: local == canonical (byte)`);
    } else {
      hDrift++;
      report.html[rel] = { status: "DRIFT-RECORDED", mode: "skip", note: "Domain holds real local content - mirror stands down on this surface (v2 unification candidate)" };
      lines.push(`DRIFT ${rel}: Domain holds real local content - skipped, recorded`);
    }
  } catch (e) {
    hWarned++;
    report.html[rel] = { status: "WARN", note: `source unreadable (${String(e.message).slice(0, 60)})` };
    lines.push(`WARN ${rel}: source unreadable (${String(e.message).slice(0, 60)})`);
  }
}

report.summary = { data: { mirrored: dUpdated, kept: dKept, warned: dWarned }, html: { mirrored: hUpdated, kept: hKept, driftRecorded: hDrift, warned: hWarned } };
writeFileSync("mirror-report.json", JSON.stringify(report, null, 1) + "\n");

console.log(`[mirror-from-console] data u=${dUpdated} k=${dKept} w=${dWarned} · html u=${hUpdated} k=${hKept} drift=${hDrift} w=${hWarned} · src=${SRC}`);
for (const l of lines) console.log(`[mirror-from-console] ${l}`);
// יציאה ירוקה גם כשיש אזהרות: המכונה חיה, האמת נרשמה, הדוח פומבי.
