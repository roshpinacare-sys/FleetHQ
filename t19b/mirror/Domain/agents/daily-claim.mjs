// daily-claim.mjs — Z-18e · דריסת-תשואה יומית (claim_reward_balance), posting-only
//
// דוקטרינת-הבית (זהה ל-daily-digest/cloud-pulse — אפס חריגות):
//   · מפתח חי בסביבת-ריצה בלבד — אף פעם לא בגיט/לוג/דיסק; בלעדיו fail-closed כן
//   · שער-חוזי-מפתח: ה-WIF חייב לגזור בדיוק את רשות-הפרסום החיה של החשבון
//   · אידמפוטנטי מטבעו: pending=0 ⇒ NOTHING-TO-CLAIM (exit 0, לא כישלון)
//   · שער-RC לפני שידור · מירוץ-45 שניות · קריאה-חוזרת עצמאית אחרי שידור
//   · אפס קומיטים לריפו — הסטטוס הכנה הוא התוצר
//
// CI: Domain/.github/workflows/daily-claim.yml — cron '37 2 * * *' (קיזוז מה-digest של 01:10)
// Secrets: STEEM_POSTING_WIF (ראשי) · WEAVE_STEEM_WIF (גיבוי) — שניהם קיימים ב-Domain

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const STEEM_RPC = "https://api.steemit.com";
const POSTER = process.env.STEEM_ACCOUNT || "headcorner";
const STEEM_JS_DIR = process.env.STEEM_JS_DIR || "/tmp/steemjs";
const OUT = process.env.OUT || "./daily-claim-status.json";
const steem = createRequire(path.join(STEEM_JS_DIR, "probe.cjs"))("steem");

const WIF_PRIMARY = (process.env.STEEM_POSTING_WIF || "").trim();
const WIF_FALLBACK = (process.env.WEAVE_STEEM_WIF || "").trim();
const WIF = WIF_PRIMARY || WIF_FALLBACK;
const DRY = /^(1|true|yes)$/i.test(process.env.DAILY_CLAIM_DRY || "");

const log = (m) => console.log(`[daily-claim] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function finish(verdict, extra = {}) {
  const body = {
    ok: verdict === "CLAIMED" || verdict === "NOTHING-TO-CLAIM",
    verdict, account: POSTER, at: new Date().toISOString(), ...extra,
  };
  try { writeFileSync(OUT, JSON.stringify(body, null, 2) + "\n"); } catch { /* artifact-only best effort */ }
  log(`${verdict} ${JSON.stringify(extra).slice(0, 240)}`);
  process.exit(0); // fail-soft: הסטטוס הכנה הוא התוצר; אדום-כנה עדיף על התחזות
}

async function liveAccount() {
  const res = await fetch(STEEM_RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "condenser_api.get_accounts", params: [[POSTER]], id: 1 }),
  });
  const j = await res.json();
  return j?.result?.[0] || null;
}

async function main() {
  log(`account=${POSTER} mode=${WIF ? "SIGN" : "NO-KEY"} (posting-only doctrine)`);
  if (!WIF) return finish("NO-KEY", { note: "honest gate: WIF missing; nothing signed" });

  const acct = await liveAccount();
  if (!acct) return finish("RPC-UNAVAILABLE", { note: "no account read; nothing signed" });

  // שער-חוזי-מפתח: bit-compare מול הרשות החיה
  const pub = steem.auth.wifToPublic(WIF);
  const live = acct.posting?.key_auths?.[0]?.[0];
  if (pub !== live) return finish("KEY-MISMATCH", { note: "derived posting key ≠ live authority; nothing broadcast" });
  log(`key gate ✓ (bit-compare vs live posting authority)`);

  // שער-RC
  try {
    const rc = await new Promise((res, rej) =>
      steem.api.call("condenser_api.get_rc_accounts", [[POSTER]], (e, r) => (e ? rej(e) : res(r))));
    const mana = rc?.[0]?.rc_manabar?.current_mana ?? 0;
    if (mana < 1e9) return finish("RC-LOW", { mana, note: "not enough RC to broadcast; waiting for recharge" });
    log(`RC gate ✓ (mana ${mana})`);
  } catch (e) { log(`RC read unavailable (${String(e).slice(0, 60)}) — continuing to pending check`); }

  // אידמפוטנטיות
  const pending = {
    reward_steem: parseFloat(acct.reward_steem_balance || "0"),
    reward_sbd: parseFloat(acct.reward_sbd_balance || "0"),
    reward_vests: parseFloat(acct.reward_vesting_balance || "0"),
  };
  if (!pending.reward_steem && !pending.reward_sbd && !pending.reward_vests)
    return finish("NOTHING-TO-CLAIM", { pending });

  if (DRY) return finish("DRY-READY", { pending, note: "honest dry run — gates passed, nothing broadcast" });

  // STASIS per-site gate (owner directive 2026-10-04): halt before the capital broadcast, fail-closed — claims are a capital lane
  try { if (createRequire(import.meta.url)("./capital-gate.cjs").stasisHalt("daily-claim")) return finish("STASIS-HALT", { note: "owner directive 2026-10-04 — capital lane halted before signing" }); } catch (e) { console.log(`[CAPITAL-GATE] daily-claim — gate module error, lane halts fail-closed: ${String(e?.message || e).slice(0, 80)}`); return finish("STASIS-HALT", { note: "capital-gate module error — fail-closed" }); }

  // שידור claim_reward_balance (רשות-posting מספיקה) עם מירוץ-45 שניות
  const op = ["claim_reward_balance", {
    account: POSTER,
    reward_steem: acct.reward_steem_balance,
    reward_sbd: acct.reward_sbd_balance,
    reward_vests: acct.reward_vesting_balance,
  }];
  let tx;
  try {
    tx = await Promise.race([
      steem.broadcast.sendAsync({ operations: [op], extensions: [] }, { posting: WIF }),
      sleep(45000).then(() => { throw new Error("broadcast-timeout-45s"); }),
    ]);
  } catch (e) {
    return finish("BROADCAST-ERROR", { message: String(e?.message || e).slice(0, 140) });
  }
  log(`broadcast ok: txid ${tx?.id || "?"}`);

  // קריאה-חוזרת עצמאית
  await sleep(4000);
  const after = await liveAccount();
  const cleared = after && !parseFloat(after.reward_steem_balance) && !parseFloat(after.reward_sbd_balance) && !parseFloat(after.reward_vesting_balance);
  finish(cleared ? "CLAIMED" : "CLAIM-UNVERIFIED", { txid: tx?.id, claimed: pending });
}

main().catch((e) => finish("ERROR", { message: String(e?.message || e).slice(0, 140) }));
