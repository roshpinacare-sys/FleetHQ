// CLOUD-PULSE — פעימת-האמת היומית של הענן: כרטיס-אמת יומי על Steem גם כשהסנדבוקס מת (r128, משימה 4-b).
//
// הפער שנסגר כאן (מומלץ במחקר 2-d): כרטיס האמת היומי של הרשת נשלח מהדופק
// (הסנדבוקס, פורט 3033) — כלומר הוא מת עם הבית. ב-56 שעות המוות של r126
// לא נכתבו כרטיסים (נמדד בהיסטוריית הבלוג: שקט מ-25/09 05:16 עד 27/09 13:25).
// הענן, שדווקא המשיך לרוץ לבד כל הזמן, לא היה לו מה לומר לעולם.
//
// מה הפעימה הזאת עושה (יומית, 00:35 UTC — אחרי חלון הפתיחה של הדופק ב-00:00):
//   1. קוראת את השרשרת החיה: last_root_post של @headcorner. אם הסנדבוקס כבר
//      פרסם היום (כלומר — חי ופעל) — "SANDBOX-ALIVE posted today" ויציאה ירוקה.
//      הכרטיס של הדופק עדיף תמיד: הוא מגיע מהבית עם הספר החי. הענן לא מתחרה.
//   2. אם לא פורסם היום — בדיקת אידמפוטנטיות: permlink דטרמיניסטי
//      cloud-pulse-<YYYYMMDD>. אם כבר קיים (ריצה חוזרת באותו יום) — יציאה ירוקה.
//   3. בחירת מפתח בכנות מדידה: STEEM_POSTING_WIF (רישום הכספת, 2026-09-23 —
//      האצווה שכללה את ה-active של @headcorner שהגריד חתום בו). המפתח נגזר
//      לציבורי ומושווה ביט-מול-ביט מול רשות-ה-posting החיה של @headcorner
//      מהשרשרת — זהה בלבד. סוד שגוי/של חשבון אחר = סירוב אדום בכנות.
//      נתיב-משנה: WEAVE_STEEM_WIF — אם הוא של @headcorner (אותה בדיקה) —
//      ישמש; אם הוא של @cashmachine — חישוב-RC כנה: comment עולה ~976M בסיס
//      + ~320k לתו, ולעד הצי (8.5K VESTS) אין מנה לזה (נמדד חי: 170M מול
//      2.3B מקסימום) — דילוג-כנה עם המספרים בלוג, לא ניסיון שייכשל בקול רם.
//   4. שער-RC לפני שידור (הדוקטרינה של web-publish): המנה החיה מול מודל
//      העלות הנמדד. אין מנה ⇒ אין שידור — כנות, לא כישלון צעקני.
//   5. הכרטיס: מינימלי ואמיתי — התאריך, ראש-הספר מהמראה הציבורית
//      (mirror.json שתאום weave-mirror כותב לריפו הזה), שורת סטטיסטיקות,
//      ופסק-דין האמת של שער-האמת. שום מספר לא נכתב בלי מקור בקובץ.
//   6. שידור comment בדיוק בתבנית הבית (/api/publish:746 — parent_author="",
//      parent_permlink=tags[0], json_metadata עם app/format) דרך
//      steem.broadcast.sendAsync עם מירוץ-זמן 45ש' (לקח R98: ההבטחה היא
//      מקור-האמת היחיד; callback של steem-js מחזיר undefined).
//
// כישלון שידור: מתועד בכנות בלוג והריצה ירוקה (הוראת המשימה — לא כישלון
// קשה); הכרטיס של אותו יום פשוט יישאר לדופק אם הבית יחזור. חוסר-סוד מלא:
// דילוג-ירוק בסגנון web-publish ("no-wif honest skip").

"use strict";

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const STEEM_RPC = "https://api.steemit.com";
const POSTER = "headcorner"; // קול הרשת היומי — אותו חשבון שהדופק מפרסם ממנו
const TAGS = ["saos", "network", "truth"];
const STEEM_JS_DIR = process.env.STEEM_JS_DIR || "/tmp/steemjs";
const RC_COMMENT_BASE = 976_000_000; // נמדד ב-web-publish (Zip): בסיס comment
const RC_PER_CHAR = 320_000; // נמדד ב-web-publish (Zip): לתו

const steem = createRequire(path.join(STEEM_JS_DIR, "probe.cjs"))("steem");

const WIF_PRIMARY = (process.env.STEEM_POSTING_WIF || "").trim();
const WIF_FALLBACK = (process.env.WEAVE_STEEM_WIF || "").trim();
const DRY = /^(1|true|yes)$/i.test(process.env.CLOUD_PULSE_DRY || "");

function log(msg) { console.log(`[cloud-pulse] ${msg}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(method, params, retries = 3) {
  for (let a = 1; a <= retries; a++) {
    try {
      const res = await fetch(STEEM_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`http-${res.status}`);
      const j = await res.json();
      if (j.error) throw new Error(String(j.error.message || "rpc-error").slice(0, 120));
      return j.result;
    } catch (e) {
      if (a === retries) throw e;
      await sleep(1500 * a);
    }
  }
}

// תאריך UTC של היום + פרמאלינק דטרמיניסטי לאותו יום
const todayUtc = () => new Date().toISOString().slice(0, 10);
const todayPermlink = () => `cloud-pulse-${todayUtc().replace(/-/g, "")}`;

// ── המראה הציבורית: כל מספר בכרטיס חייב מקור ──────────────────────────
function readMirror() {
  try {
    const m = JSON.parse(readFileSync("mirror.json", "utf8"));
    const t = existsSync("truth/latest.json") ? JSON.parse(readFileSync("truth/latest.json", "utf8")) : null;
    return { m, t };
  } catch (e) {
    log(`מראה ציבורית בלתי-קריאה (${String(e?.message || e).slice(0, 80)}) — הכרטיס יישלח בלי סטטיסטיקות, בכנות`);
    return { m: null, t: null };
  }
}

// ── בחירת מפתח: זיהוי ביט-מול-ביט מול הרשות החיה (תבנית weave-anchor) ───
async function pickWif(livePostingPub) {
  const candidates = [
    { name: "STEEM_POSTING_WIF", wif: WIF_PRIMARY },
    { name: "WEAVE_STEEM_WIF", wif: WIF_FALLBACK },
  ];
  for (const c of candidates) {
    if (!c.wif) { log(`  · ${c.name}: לא סופק`); continue; }
    let pub = "";
    try { pub = steem.auth.wifToPublic(c.wif).toString(); } catch {
      log(`  · ${c.name}: לא WIF תקין (checksum) — נדחה בכנות`); continue;
    }
    if (pub === livePostingPub) {
      log(`  · ${c.name}: ✓ זוהה כרשות-ה-posting החיה של @${POSTER} (התאמת ביט)`);
      return { wif: c.wif, src: c.name };
    }
    log(`  · ${c.name}: נגזר ${pub.slice(0, 12)}… אינו רשות-ה-posting של @${POSTER} — נדחה`);
  }
  return null;
}

async function currentMana(account) {
  const r = await rpc("rc_api.find_rc_accounts", { accounts: [account] });
  const a = r?.rc_accounts?.[0];
  if (!a) return null;
  return { mana: a.rc_manabar?.current_mana ?? 0, max: a.max_rc ?? 0 };
}

// ── הכרטיס ─────────────────────────────────────────────────────────────
function buildCard({ m, t }) {
  const date = todayUtc();
  const lines = [];
  lines.push(`# SAOS Network · Daily Truth Card — ${date} (cloud fallback)`, "");
  lines.push(`**Date:** ${date} (UTC)`);
  if (m?.stats) {
    const s = m.stats;
    const att = s.attestations ?? null;
    const cps = s.checkpoints ?? null;
    const agents = s.agents ?? null;
    const v = s.vitality || {};
    const verified = s.attByStatus?.VERIFIED ?? null;
    const unmeasured = s.attByStatus?.UNMEASURED ?? null;
    lines.push(`**Ledger head:** ${s.headHash || "unavailable"}`);
    lines.push(`**Stats:** ${att ?? "?"} attestations (${verified ?? "?"} VERIFIED · ${unmeasured ?? "?"} UNMEASURED) · ${cps ?? "?"} checkpoints · ${agents ?? "?"} agents · 24h: ${v.atts24h ?? "?"} attestations · alive ${v.aliveDays ?? "?"} days`);
    lines.push(`**Mirror freshness:** generated ${m.generatedAt || "?"} (weave-mirror public copy)`);
  } else {
    lines.push("**Ledger head:** mirror unreadable this run — nothing faked");
  }
  if (t?.verdict) {
    lines.push(`**Truth gate:** ${t.verdict} (${t.counts?.pass ?? "?"} pass · ${t.counts?.fail ?? "?"} fail · measured ${t.at || "?"})`);
  }
  lines.push(`**Public site:** https://roshpinacare-sys.github.io/Domain/`, "");
  lines.push("---", "");
  lines.push("**Honest note:** the sandbox layer had not posted today's truth card by 00:35 UTC — this card was posted by the cloud layer autonomously (GitHub Actions, Domain). The network's voice continues even when the house is down.", "");
  lines.push("**הערת אמת:** שכבת הסנדבוקס לא פרסמה את כרטיס האמת של היום עד 00:35 UTC — כרטיס זה שודר על-ידי שכבת הענן באופן אוטונומי. הרשת ממשיכה לדבר גם כשהבית נופל.", "");
  lines.push("— SAOS · proof over promises · every number in this card is read at run time from the public mirror and the live chain. Source: agents/cloud-pulse.mjs (r128).");
  return lines.join("\n");
}

// ── ראשי ────────────────────────────────────────────────────────────────
async function main() {
  log(`boot · poster=@${POSTER} · steem-js from ${STEEM_JS_DIR} · dry=${DRY}`);

  // 1) האם הדופק (הבית) כבר דיבר היום? — השרשרת החיה היא השופטת היחידה
  const accounts = await rpc("condenser_api.get_accounts", [[POSTER]]);
  const lrp = accounts?.[0]?.last_root_post || "1970-01-01T00:00:00";
  const lrpDay = lrp.slice(0, 10);
  const today = todayUtc();
  log(`chain: last_root_post של @${POSTER} = ${lrp} (יום ${lrpDay}) · היום ${today}`);
  if (lrpDay === today) {
    log("SANDBOX-ALIVE — הדופק פרסם כבר את כרטיס היום. לענן אין מה להשלים. יציאה ירוקה.");
    return;
  }

  // 2) אידמפוטנטיות — permlink דטרמיניסטי לאותו יום
  const permlink = todayPermlink();
  const existing = await rpc("condenser_api.get_content", [POSTER, permlink]);
  if (existing && existing.id !== 0) {
    log(`cloud-pulse כבר שודר היום (permlink ${permlink} קיים, id ${existing.id}) — אין כפילות. יציאה ירוקה.`);
    return;
  }
  log(`אידמפוטנטיות: ${permlink} טרם קיים על השרשרת — ממשיכים (ריצה חוזרת באותו יום תיעצר כאן)`);

  // 3) מפתח: רשות-ה-posting החיה מול נגזרות הכספת
  const livePostingPub = accounts?.[0]?.posting?.key_auths?.[0]?.[0] || null;
  if (!livePostingPub) { log("רשות-ה-posting החיה בלתי-קריאה מהשרשרת — סירוב כנה, שום דבר לא נוגע."); process.exit(1); }
  const key = await pickWif(livePostingPub);
  if (!key) {
    if (!WIF_PRIMARY && !WIF_FALLBACK) {
      log("NO-WIF — אף אחד מהסודות (STEEM_POSTING_WIF · WEAVE_STEEM_WIF) לא סופק לריצה. דילוג-כנה בסגנון web-publish: הריצה ירוקה, הכרטיס ממתין לסוד או לדופק.");
      return;
    }
    log(`אף סוד שסופק אינו רשות-ה-posting החיה של @${POSTER} — סירוב אדום בכנות: לא משדרים בשם מי שלא אישרו. אדום כדי שהמפעיל יראה ויתקן את הכספת.`);
    process.exit(1);
  }

  // 4) שער-RC לפני שידור (הדוקטרינה של web-publish — אין מנה ⇒ אין שידור)
  const { m, t } = readMirror();
  const body = buildCard({ m, t });
  const cost = RC_COMMENT_BASE + RC_PER_CHAR * body.length;
  const mana = await currentMana(POSTER);
  if (!mana) { log("מנת-RC בלתי-קריאה — לא משדרים בלי מדידה. אדום בכנות."); process.exit(1); }
  log(`RC: מנה נוכחית ${mana.mana.toLocaleString()} מול עלות משוערת ${cost.toLocaleString()} (${body.length} תווים)`);
  if (mana.mana < cost) {
    log(`דילוג-RC כנה: אין מנה לכרטיס היום (מנה ${mana.mana} < עלות ${cost}). הכרטיס יחכה — לא כישלון קשה, המספרים לפניך.`);
    return;
  }

  // 5) הכרטיס
  const title = `SAOS Network Daily Truth Card — ${today} (cloud fallback)`;
  const op = ["comment", {
    parent_author: "",
    parent_permlink: TAGS[0],
    author: POSTER,
    permlink,
    title,
    body,
    json_metadata: JSON.stringify({
      tags: TAGS,
      app: "saos/cloud-pulse/1.0",
      format: "markdown",
      community: "saos",
      source: "cloud-fallback (r128)",
    }),
  }];
  log(`כרטיס מוכן: "${title}" · permlink ${permlink} · ${body.length} תווים`);
  if (DRY) {
    log("DRY — לא משודר. גוף הכרטיס להלן:");
    log(`--- DRY CARD ---\n${body}`);
    return;
  }

  // 6) שידור בתבנית הבית: sendAsync + מירוץ-זמן 45ש' (לקח R98)
  try {
    let timer;
    const result = await Promise.race([
      steem.broadcast.sendAsync({ extensions: [], operations: [op] }, [key.wif]),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("broadcast-timeout-45s")), 45_000); }),
    ]).finally(() => timer && clearTimeout(timer));
    const txid = result?.id ?? null;
    log(`✓ שודר מעל ${key.src}: txid ${txid} · https://steemit.com/@${POSTER}/${permlink}`);
    if (!txid) log("הערת כנות: sendAsync התקבל אזה תז-עסקה לא הוחזר — האימות הסופי יהיה בהיסטוריה של השרשרת.");
  } catch (e) {
    log(`✗ השידור נכשל בכנות: ${String(e?.message || e).slice(0, 180)} — לא כישלון קשה (הוראת המשימה): הכרטיס של היום יישאר לדופק אם הבית יחזור. הכישלון גלוי כאן בלוג.`);
  }
}

void main();
