// WATCHDOG — כלב-השמירה של הענן: מזהה מוות-סנדבוקס ומזעיק את המפעיל (r128, משימה 4-b).
//
// הבעיה הנמדדת (r126, הנפילה החמישית המתועדת): הסנדבוקס מת ב-22/09 15:04
// והוחזר לחיים רק ב-27/09 13:25 — 56 שעות של שקט שאף אחד לא שמע. הענן
// (Domain Actions) המשיך לרוץ לבד כל הזמן, ולכן השקט לא נראה מבחוץ: קווי-העיגון
// עדיין ירוקים, ה-Pages עדיין חי. הפער בין "הענן חי" ל"הסנדבוקס מת" הוא
// בדיוק מה שהמפעיל לא יכול היה לדעת בלי להיכנס בעצמו.
//
// מה הכלב עושה: כל שעה (בקדנס :10, מוסט מכל שאר המכונות) הוא מודד את גיל
// אותות-החיים הטהורים של הסנדבוקס, ואם כולם ישנים מעבר ל-26 שעות — הוא פותח
// Issue בשם SANDBOX-DOWN. גיטהאב שולח מייל לבעל החשבון על Issue חדש: זו הערוצה
// הפיזית היחידה שיש לענן אל המפעיל. כשהסנדבוקס חוזר — ה-Issue נסגר אוטומטית
// עם הוכחה (אות טרי + חותמת-זמן). אפס קומיטים במסלוך התקין: מצב-הדגל חי
// ב-Issue בלבד.
//
// אותות-החיים — למה בדיוק אלה (נלמד מההיסטוריה החיה של 22-27/09):
//   · Defi (הריפו הפרטי של הקבלות) — הדיבונים של הסנדבוקס דוחפים אליו קבלות
//     כל כמה דקות כשהם חיים (money-mover reprice · keeper supervision · pulse
//     daily). ה-Actions של Defi עצמו מתים ממכסה מאז 20/09 ואף תאום-ענן לא כותב
//     אליו — כל קומיט שם הוא מהסנדבוקס בלבד. בחלון המוות הנ"ל: שקט מוחלט.
//   · Zip sovereign/state.json — חוק r126: כל סשן מפעיל מרענן את הקובץ.
//   · Zip sovereign/ (אות הקשר בלבד, לא פסק-דין!) — תאומי-הענן (weave-anchor[bot])
//     כותבים לשם כל שעתיים גם כשהסנדבוקס מת. מי שיסתכל עליו לבד יפספס
//     את המוות — וזה בדיוק מה שקרה ב-r126. הוא נמדד ומתועד לשקיפות בלבד.
//
// פסק-הדין: חי אם אות טהור אחד לפחות טרי (≤26ש'). אחרת — SANDBOX-DOWN.
// אם כל האותות בלתי-קריאים (טוקן תקול וכד') — הכלב עיוור, מסרב בכנות באדום,
// ולא נובח לשווא.
//
// דוקטרינת הכנות של הבית: כל גיל שנמדד מתועד בלוג; אף "חי" לא נטען בלי מדידה;
// ה-Issue נוצר פעם אחת (אם כבר פתוח — לא נפתח כפול); סגירה רק עם אות טרי.

"use strict";

const GH_API = "https://api.github.com";
const OWNER_REPO = process.env.GITHUB_REPOSITORY || "roshpinacare-sys/Domain";
const STALE_H = Number(process.env.WATCHDOG_STALE_H || "26");
const ISSUE_TITLE_PREFIX = "SANDBOX-DOWN";
const SIGNALS = {
  defi: { label: "Defi receipts (sandbox daemons)", repo: "roshpinacare-sys/Defi", path: "", pure: true },
  state: { label: "Zip sovereign/state.json (session law r126)", repo: "roshpinacare-sys/Zip", path: "sovereign/state.json", pure: true },
  weave: { label: "Zip sovereign/ (context only - cloud bots write here too)", repo: "roshpinacare-sys/Zip", path: "sovereign/", pure: false },
};

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || "").trim(); // Domain-scoped: issues+contents on this repo
const ZIP_PAT = (process.env.ZIP_PAT || "").trim(); // reads private repos; tried as issue-write fallback
const DRY = /^(1|true|yes)$/i.test(process.env.WATCHDOG_DRY || ""); // מצב-בדיקה: מודד הכל, לא נוגע בכלום

const RUN_URL = process.env.GITHUB_SERVER_URL
  ? `${process.env.GITHUB_SERVER_URL}/${OWNER_REPO}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const NOW = Date.now();

function log(msg) { console.log(`[watchdog] ${msg}`); }
function ageH(iso) { return (NOW - Date.parse(iso)) / 3600000; }

async function gh(pathname, method, body, token, accept) {
  const url = `${GH_API}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: accept || "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "saos-watchdog/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ── מדידת אות: הקומיט האחרון שנוגע בנתיב, עם טיפול-כישלון כנה ──────────────
async function measure(signal) {
  let q = `repos/${signal.repo}/commits?per_page=1`;
  if (signal.path) q += `&path=${encodeURIComponent(signal.path)}`;
  const tryTokens = [ZIP_PAT, GITHUB_TOKEN].filter(Boolean);
  for (const token of tryTokens) {
    try {
      const res = await gh(q, "GET", null, token);
      if (!res.ok) {
        log(`  · ${signal.label}: read → HTTP ${res.status} (token ${token === ZIP_PAT ? "ZIP_PAT" : "GITHUB_TOKEN"})`);
        continue;
      }
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return { ok: true, iso: null, sha: null };
      const iso = list[0].commit?.committer?.date || list[0].commit?.author?.date || null;
      return { ok: true, iso, sha: (list[0].sha || "").slice(0, 10) };
    } catch (e) {
      log(`  · ${signal.label}: read threw ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  return { ok: false };
}

// ── Issue lifecycle (zero-commit design) ────────────────────────────────
function dryIssueBody(lastAliveIso, measures) {
  const since = lastAliveIso || "unmeasured";
  return [
    "## הסנדבוקס מת — הענן ממשיך לבד",
    "",
    `**אות-החיים הטהור האחרון של שכבת הסנדבוקס: ${since}** (מעל ${STALE_H} שעות של שקט).`,
    "",
    "מה זה אומר:",
    "- שכבת הסנדבוקס (הדיבונים: דופק · כספים · צייד · שומר · תלמיד · weblift) אינה פועלת — היא חיה רק בתוך סשן מפעיל חי.",
    "- שכבת הענן (GitHub Actions הציבוריים של Domain) ממשיכה לרוץ לבד: עוגנים שעתיים, קווי-עיגון, web-publish, ה-Pages — כלום לא אובד, כלום לא נעצר.",
    "- כרטיס האמת היומי על Steem מומשך על-ידי cloud-pulse (המנגנון שנולד באותו סבב, r128) — הרשת ממשיכה לדבר גם בלי הבית.",
    "",
    "**מה נדרש כדי להחזיר:** פרוטוקול ההחייאה המתועד (r116): פתיחת סשן מפעיל → fetch → reset --hard → bun install → db:push → שחזור-כספת → dev-revive → daemons-revive → sovereignty/sync.",
    "",
    "## The sandbox layer is down",
    "",
    `Last pure-sandbox signal: **${since}** (silence beyond ${STALE_H} hours). The cloud layer keeps running autonomously; nothing is lost. The revival protocol requires an operator session. This issue closes itself automatically the moment a fresh sandbox signal is measured.`,
    "",
    "---",
    "מדידות הסבב (הכלב מודד, לא מנחש):",
    ...Object.entries(measures).map(([k, m]) =>
      `- ${SIGNALS[k].label}: ${m.ok ? (m.iso ? `${m.iso} (גיל ${ageH(m.iso).toFixed(1)}ש')` : "אין קומיטים כלל") : "בלתי-קריא"}${SIGNALS[k].pure ? "" : " ← אות הקשר בלבד, לא פסק-דין (תאומי-הענן כותבים שם גם במוות)"}`),
    RUN_URL ? `- מדידה מלאה: ${RUN_URL}` : "",
  ].filter(Boolean).join("\n");
}

async function findOpenIssue(token) {
  const res = await gh(`repos/${OWNER_REPO}/issues?state=open&per_page=100`, "GET", null, token);
  if (!res.ok) throw new Error(`list-issues → ${res.status}`);
  const issues = (await res.json()).filter((i) => !i.pull_request);
  return issues.find((i) => String(i.title || "").startsWith(ISSUE_TITLE_PREFIX)) || null;
}

async function createIssue(token, lastAliveIso, measures) {
  const since = lastAliveIso || "unmeasured";
  const body = dryIssueBody(lastAliveIso, measures);
  const res = await gh(`repos/${OWNER_REPO}/issues`, "POST", {
    title: `SANDBOX-DOWN — הסנדבוקס מת (מאז ${since})`,
    body,
    labels: ["sandbox-down", "watchdog"],
  }, token);
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 160);
    throw new Error(`create-issue → ${res.status}: ${detail}`);
  }
  const issue = await res.json();
  return issue;
}

async function closeIssue(token, issue, freshest) {
  const comment = `הסנדבוקס חזר לחיים — אות טהור טרי: ${freshest.label} @ ${freshest.iso} (גיל ${ageH(freshest.iso).toFixed(1)}ש'). הכלב-שמירה סוגר את הדגל הזה אוטומטית. ${new Date().toISOString()}`;
  const c = await gh(`repos/${OWNER_REPO}/issues/${issue.number}/comments`, "POST", { body: comment }, token);
  log(`  · comment on #${issue.number}: HTTP ${c.status}`);
  const res = await gh(`repos/${OWNER_REPO}/issues/${issue.number}`, "PATCH", { state: "closed" }, token);
  if (!res.ok) throw new Error(`close-issue → ${res.status}`);
}

// ── Marker-file fallback (only when issue creation fails — still alerts via commit email) ──
async function markerPath() { return "SANDBOX-DOWN.md"; }

async function writeMarker(lastAliveIso) {
  const path = await markerPath();
  const content = [
    "# SANDBOX-DOWN (watchdog marker)",
    "",
    `אות-חיים טהור אחרון: ${lastAliveIso || "unmeasured"} · נכתב ${new Date().toISOString()}`,
    "",
    "זהו נתיב-הגיבוי בלבד: יצירת ה-Issue נכשלה (ראו לוג הריצה) ולכן הדגל מונח כאן",
    "כדי שדחיפת-הקומיט תזעיק את המפעיל במייל. הסרת הקובץ אוטומטית כשהסנדבוקס חוזר.",
    "", "",
  ].join("\n");
  const get = await gh(`repos/${OWNER_REPO}/contents/${path}`, "GET", null, GITHUB_TOKEN);
  if (get.ok) {
    const cur = await get.json();
    const curContent = Buffer.from(cur.content || "", "base64").toString("utf8");
    if (curContent === content) { log(`  · marker already current — no commit (zero-spam)`); return true; }
    const put = await gh(`repos/${OWNER_REPO}/contents/${path}`, "PUT", {
      message: `watchdog: SANDBOX-DOWN marker refresh (issue creation failed) · ${new Date().toISOString()}`,
      content: Buffer.from(content).toString("base64"),
      sha: cur.sha,
    }, GITHUB_TOKEN);
    log(`  · marker update: HTTP ${put.status}`);
    return put.ok;
  }
  const put = await gh(`repos/${OWNER_REPO}/contents/${path}`, "PUT", {
    message: `watchdog: SANDBOX-DOWN marker (issue creation failed) · ${new Date().toISOString()}`,
    content: Buffer.from(content).toString("base64"),
  }, GITHUB_TOKEN);
  log(`  · marker create: HTTP ${put.status}`);
  return put.ok;
}

async function removeMarker() {
  const path = await markerPath();
  const get = await gh(`repos/${OWNER_REPO}/contents/${path}`, "GET", null, GITHUB_TOKEN);
  if (!get.ok) { log("  · no marker file — clean"); return; }
  const cur = await get.json();
  const del = await gh(`repos/${OWNER_REPO}/contents/${path}`, "DELETE", {
    message: `watchdog: sandbox alive again — removing the SANDBOX-DOWN marker · ${new Date().toISOString()}`,
    sha: cur.sha,
  }, GITHUB_TOKEN);
  log(`  · marker delete: HTTP ${del.status}`);
}

// ── ראשי ────────────────────────────────────────────────────────────────
async function main() {
  log(`boot · repo=${OWNER_REPO} · stale-after=${STALE_H}h · run=${RUN_URL || "local"}`);

  const measures = {};
  for (const [k, s] of Object.entries(SIGNALS)) {
    measures[k] = await measure(s);
    const m = measures[k];
    log(`${s.pure ? "PURE " : "CTX  "} ${k}: ${m.ok ? (m.iso ? `sha ${m.sha} @ ${m.iso} (age ${ageH(m.iso).toFixed(1)}h)` : "no commits at all") : "UNREADABLE"}`);
  }

  const pure = Object.entries(SIGNALS).filter(([k, s]) => s.pure).map(([k]) => k);
  const readablePure = pure.filter((k) => measures[k].ok);
  if (readablePure.length === 0) {
    log("סירוב-כנה: כל אותות-החיים הטהורים בלתי-קריאים — הכלב עיוור ולא יפסוק. אדום בלי נביחה לשווא.");
    process.exit(1);
  }

  const fresh = readablePure
    .filter((k) => measures[k].iso && ageH(measures[k].iso) <= STALE_H)
    .map((k) => ({ key: k, iso: measures[k].iso, label: SIGNALS[k].label }))
    .sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso));
  const staleList = readablePure
    .filter((k) => !measures[k].iso || ageH(measures[k].iso) > STALE_H)
    .map((k) => ({ key: k, iso: measures[k].iso }));

  // פסק-הדין
  const alive = fresh.length > 0;
  const lastAliveIso = readablePure
    .map((k) => measures[k].iso)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;

  if (alive) {
    log(`VERDICT: SANDBOX-ALIVE — אות טהור טרי: ${fresh[0].label} @ ${fresh[0].iso} (age ${ageH(fresh[0].iso).toFixed(1)}h)`);
    if (DRY) {
      log("DRY: היו סוגרים דגל פתוח אם היה קיים (עם הוכחת-אות לעיל) ומסירים marker — לא נוגעים בכלום.");
      return;
    }
    // סגירת דגל אם קיים (+ הסרת marker אם נשאר)
    for (const token of [GITHUB_TOKEN, ZIP_PAT].filter(Boolean)) {
      try {
        const issue = await findOpenIssue(token);
        if (issue) {
          await closeIssue(token, issue, fresh[0]);
          log(`✓ closed issue #${issue.number} with revival proof`);
        } else {
          log("אין דגל פתוח — החיים שקטים כרגיל");
        }
        await removeMarker();
        return;
      } catch (e) {
        log(`  · token ${token === ZIP_PAT ? "ZIP_PAT" : "GITHUB_TOKEN"} failed: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    log("לא הצלחתי לבדוק/לסגור דגל (טוקנים) — הריצה אדומה בכנות כדי שזה ייראה");
    process.exit(1);
  }

  // SANDBOX-DOWN
  const staleDesc = staleList.map((s) => `${SIGNALS[s.key].label}: ${s.iso || "none"}`).join(" · ");
  log(`VERDICT: SANDBOX-DOWN — כל האותות הטהורים ישנים מעבר ל-${STALE_H}ש' (${staleDesc})`);
  if (measures.weave?.ok && measures.weave.iso && ageH(measures.weave.iso) <= STALE_H) {
    log(`  · הקשר: Zip sovereign/ עדיין טרי (${measures.weave.iso}) — אלו תאומי-הענן; הענן חי, הבית מת. זה בדיוק המצב שהכלב נועד לתפוס.`);
  }

  if (DRY) {
    log("DRY: היו פותחים Issue (כותרת וגוף מלא להלן) — לא נוגעים בכלום.");
    log(`--- DRY ISSUE TITLE ---\nSANDBOX-DOWN — הסנדבוקס מת (מאז ${lastAliveIso})`);
    log(`--- DRY ISSUE BODY ---\n${dryIssueBody(lastAliveIso, measures)}`);
    return;
  }

  let opened = null;
  for (const token of [GITHUB_TOKEN, ZIP_PAT].filter(Boolean)) {
    try {
      const existing = await findOpenIssue(token);
      if (existing) {
        log(`דגל #${existing.number} כבר פתוח (נפתח ${existing.created_at}) — לא מכפילים. המפעיל כבר הוזעק.`);
        return;
      }
      opened = await createIssue(token, lastAliveIso, measures);
      log(`✓ SANDBOX-DOWN issue opened: #${opened.number} — גיטהאב שולח מייל לבעל החשבון`);
      return;
    } catch (e) {
      log(`  · token ${token === ZIP_PAT ? "ZIP_PAT" : "GITHUB_TOKEN"} failed: ${String(e?.message || e).slice(0, 140)}`);
    }
  }

  // נתיב-הגיבוי: קובץ-דגל (הקומיט מזעיק במייל גם כך)
  log("יצירת Issue נכשלה בשני הטוקנים — נתיב-הגיבוי: קובץ-דגל SANDBOX-DOWN.md (התחייבות-הקומיט מזעיקה את המפעיל)");
  const ok = await writeMarker(lastAliveIso);
  if (!ok) {
    log("גם נתיב-הגיבוי נכשל — לכלב אין ערוץ אל המפעיל. אדום בכנות.");
    process.exit(1);
  }
  log("קובץ-הדגל הונח — ההתראה עברה דרך הקומיט. הריצה מסתיימת ירוקה: החיווי נמסר.");
}

void main();
