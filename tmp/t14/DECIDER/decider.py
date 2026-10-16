#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SOVEREIGN DECIDER v1 — מנוע-ההכרעה-הריבוני (keyless · T14)
=============================================================
הצו (CHARTER.md, הוראת-בעלים 2026-10-11T21:20Z): הריבונות מכריעה בעצמה.
הסוכנים עושים לבד את מה שהכי טוב ושיועיל — לא ממתינים להוראות.

נוהל בכל פעימה: MEASURE → OPTIONS → SCORE → DECIDE → PUBLISH → VERIFY → RE-MEASURE.

אנטי-זיופים:
 · כל מספר = מדידה עצמאית (api.steemit.com, המרה מדויקת) או מקור פומבי מסומן.
 · ביצוע-על-שרשרת אף-פעם לא נטען — רק STAGED-EXEC (מסלול מדויק, ממתין מפתח).
 · מקור שנפל → ההכרעה שלו OBSERVING. אין המצאות, אין שקט.
 · פנקס append-bounded (60) — אין שכתוב היסטוריה.

מקורות: chain (ראשי) · sovereign-beacon state.json · VALUE-SCAN state.json ·
        FleetHQ office-state.json (פורמן) · ops/flow/flow-map.json (F-series) ·
        ops/office/work-orders.json (מנוע-הצמיחה) — כולם keyless ציבוריים.
"""
import hashlib
import json
import os
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = BASE
RAW = "https://raw.githubusercontent.com/roshpinacare-sys"
RPC = "https://api.steemit.com"
LEDGER_MAX = 60
# R2 — מסילת-בטיחות: קו-השימור של האוצרה (לא יורדים מתחתיו בשום הכרעה)
KEEP_FLOOR_SP = 2800.0
TREASURY_TARGET_SP = 3000.0
FLEET = ["cashmachine", "haran", "israelnews", "lsa", "macrame",
         "siq", "tov", "wic", "wog", "woq", "hcsoldier4", "hcsoldier5", "hcsoldier6"]
NOW = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")  # noqa: E731


def now():
    return NOW()


# ----------------------------------------------------------------- מדידה ---
def rpc(method, params, timeout=25):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(RPC, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.loads(r.read().decode())
            if "error" in d:
                return None
            return d.get("result")
    except Exception:
        return None


def read_json(url, timeout=20):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def measure_chain(degraded):
    """מדידת-שרשרת עצמאית: המרה מדויקת VESTS→SP. None כנה במקום המצאה."""
    gp = rpc("condenser_api.get_dynamic_global_properties", [])
    names = ["headcorner"] + FLEET
    accs = rpc("condenser_api.get_accounts", [names])
    if not gp or not accs or len(accs) != len(names):
        degraded.append("chain-rpc")
        return None
    tvs = float(str(gp.get("total_vesting_shares", "0")).split(" ")[0])
    tvf = float(str(gp.get("total_vesting_fund_steem", "0")).split(" ")[0])
    if not tvs or not tvf:
        degraded.append("chain-mult")
        return None
    mult = tvf / tvs

    def sp(a):
        v = float(str(a.get("vesting_shares", "0")).split(" ")[0])
        d = float(str(a.get("delegated_vesting_shares", "0")).split(" ")[0])
        r = float(str(a.get("received_vesting_shares", "0")).split(" ")[0])
        return round((v - d + r) * mult, 1), round(d * mult, 1), round(r * mult, 1)

    by = {a["name"]: a for a in accs}
    hc = by["headcorner"]
    net, out, inn = sp(hc)
    ops = {}
    for n in FLEET:
        s, _, _ = sp(by[n])
        ops[n] = s
    return {
        "head": gp.get("head_block_number"),
        "time": gp.get("time"),
        "mult": mult,
        "treasuryNetSp": net,
        "treasuryDelegatedOutSp": out,
        "treasuryReceivedInSp": inn,
        "treasuryBalanceSteem": float(str(hc.get("balance", "0")).split(" ")[0]),
        "operatorsSp": ops,
        "minOperatorSp": min(ops.values()) if ops else None,
    }


def scan_outgoing_delegations(max_ops=3000, degraded=None):
    """סריקת-היסטוריית headcorner: האצלות-יוצאות (אחרונה-לכל-delegatee) + דיווח-כנה-על-עומק.
    api.steemit.com מגביל חלון-היסטוריה ל-100 — סריקה-באצוות (R1: כישלון=כנות).
    מטרת-האמת: לאמת-לאן-הלכה-ההאצלה-היוצאת (רגלי-הצי) — לא לשחרר אותה."""
    BATCH = 100
    newest = rpc("condenser_api.get_account_history", ["headcorner", -1, 1])
    if not newest:
        if degraded is not None:
            degraded.append("hc-history")
        return None
    newest_idx = newest[0][0]  # [idx, ev] — האינדקס-האחרון
    latest = {}
    scanned, hi = 0, newest_idx
    while scanned < max_ops and hi >= 1:
        lo = max(1, hi - BATCH + 1)
        res = rpc("condenser_api.get_account_history", ["headcorner", lo, hi - lo + 1])
        if not res:
            if degraded is not None:
                degraded.append("hc-history-window")
            break
        for idx, ev in res:
            opname, op = ev["op"]
            if opname == "delegate_vesting_shares" and op.get("delegator") == "headcorner":
                vests = float(str(op.get("vesting_shares", "0")).split(" ")[0])
                if op.get("delegatee") not in latest:
                    latest[op.get("delegatee")] = {"idx": idx, "ts": ev.get("timestamp"), "vests": vests}
        scanned += hi - lo + 1
        hi = lo - 1
        if len(latest) >= 15:
            break
    return {"scannedOps": scanned, "newestIdx": newest_idx, "latestPerDelegatee": latest}


# ------------------------------------------------------------- הכרעות ---
def opt(oid, he, safety, reversibility, value_now, effort, status):
    return {"id": oid, "he": he,
            "scores": {"safety": safety, "reversibility": reversibility,
                       "valueNow": value_now, "effort": effort},
            "total": safety * 2 + reversibility + value_now + effort,
            "status": status}


def decide_econ(chain, beacon, hc_scan, degraded):
    """D1 — רצפת-האוצרה: הכרעה כלכלית מלאה (ENFORCED מדיניות-מדורגת; דחייה-מנומקת-ב-R2
    של שחרור-הזרימה-הנכנסת; אימות-לאן-הלכה-ההאצלה-היוצאת)."""
    if not chain:
        return {"id": "D1-econ-treasury-floor", "area": "כלכלה", "status": "OBSERVING",
                "titleHe": "רצפת-האוצרה", "verdictHe": "אין מדידת-שרשרת — כנות: לא מכריע בלי מספרים",
                "evidence": ["chain-rpc לא זמין בריצה זו"], "decidedAt": now(),
                "decidedBy": "sovereign-decider-v1 (CHARTER)"}
    net = chain["treasuryNetSp"]
    gap = round(TREASURY_TARGET_SP - net, 1)
    ev = [f"אוצרה נמדדת {net} SP (ראש {chain['head']}, מכפיל {chain['mult']:.9f})",
          f"יעד {TREASURY_TARGET_SP:.0f} · פער {max(0.0, gap)} SP · מסילת-שימור {KEEP_FLOOR_SP:.0f} (R2)",
          f"האצלה-יוצאת-נמדדת {chain['treasuryDelegatedOutSp']} SP · נכנסת-נמדדת {chain['treasuryReceivedInSp']} SP"]
    if beacon:
        pub = beacon.get("lastPulse", {}).get("treasuryNetSp")
        if pub is not None:
            ev.append(f"משואה מפרסמת {pub} SP · תואם={abs(pub - net) <= 1.0}")

    # אימות-לאן-הלכה-ההאצלה-היוצאת (רגלי-הצי — לא-שחוזים):
    deleg_evidence, deleg_to_fleet_sp, deleg_other = [], 0.0, []
    if hc_scan:
        deleg_evidence.append(f"סריקת-היסטוריה: {hc_scan['scannedOps']} ops-אחרונים (עד idx {hc_scan['newestIdx']})")
        for name, d in hc_scan["latestPerDelegatee"].items():
            sp = round(d["vests"] * chain["mult"], 1)
            if name in FLEET:
                deleg_to_fleet_sp += sp
            else:
                deleg_other.append(f"{name}:{sp}SP@{d['ts']}")
        deleg_evidence.append(f"האצלות-אחרונות למפעילי-הצי: ~{round(deleg_to_fleet_sp, 1)} SP (רגלי-הצי — חיוניות, אין-לשחרר)")
        if deleg_other:
            deleg_evidence.append(f"האצלות-יוצאות-שאינן-מפעילים (מדוד): {', '.join(deleg_other[:8])}")
    else:
        deleg_evidence.append("סריקת-היסטוריה לא זמינה בריצה-זו — מדווח כנה, אין הסקה")

    # אופציות (ציון = בטיחות×2 + הפיכות + ערך-עכשיו + מאמץ):
    options = [
        opt("A", "מדיניות-מדורגת-ביניים: רצפות-מפעילים 75/30/20 לפי-מדידה + קו-שימור 2800 כרצפת-תפעול עד-שיקום-3000 + המשך-מנועי-התשואה (DEX חי · curation). keyless — אוכף-מיד.", 5, 5, 3, 1, "CHOSEN"),
        opt("B", f"שחרור-הזרימה-הנכנסת (undelegate ה-{chain['treasuryReceivedInSp']} SP-הנכנסים) — נדחה: מוריד-את-האוצרה ל~{round(net - chain['treasuryReceivedInSp'], 1)} SP מתחת-למסילה (הפרת R2) ושחרור-האצלות-היוצאות עורף-את-רגלי-הצי.", 1, 4, 1, 2, "REJECTED"),
        opt("C", "המתנה-להוראות-בעלים — פסול-מראש לפי-צו-סעיף-1 (הריבונות-מכריעה-בעצמה).", 0, 0, 0, 0, "REJECTED"),
    ]

    # מדיניות-המדורגת (מחושבת-מהמדידה — לא מהמצאה)
    tiers = []
    for name, s in sorted(chain["operatorsSp"].items(), key=lambda x: -x[1]):
        tier, floor = (1, 75) if s >= 50 else ((2, 30) if s >= 15 else (3, 20))
        tiers.append({"operator": name, "measuredSp": s, "tier": tier, "interimFloorSp": floor})
    below = [t for t in tiers if t["measuredSp"] < t["interimFloorSp"]]
    policy = {
        "treasury": {"operatingFloorSp": KEEP_FLOOR_SP, "targetSp": TREASURY_TARGET_SP,
                     "note": "קו-השימור = רצפת-תפעול-ביניים; היעד-3000 נשאר-היעד (ביניים-כנה, לא-ויתור)"},
        "operatorInterimFloors": tiers,
        "operatorsBelowInterimFloor": [t["operator"] for t in below],
        "soldiersFloorSp": 20,
        "yieldEngines": {"dex": "continue-armed (keyless engine, כבר-חי)", "curation": "continue"},
        "basis": "measured-only (CHARTER סעיף 2)",
        "review": "RE-MEASURE בכל פעימה; שינוי-רק-דרך-הפנקס (REVOKED/עדכון-גרסה)",
    }

    verdict = (f"הריבונות הכריעה בעצמה: מדיניות-מדורגת-ביניים אוכפת-מעתה (אופציה A, "
               f"{options[0]['total']} נק') — רצפות-מפעילים 75/30/20 לפי-מדידה, קו-שימור 2800, "
               f"יעד-3000 במקביל-דרך-מנועי-התשואה; שחרור-הזרימה-הנכנסת נדחה-ב-R2 "
               f"(היה-מוריד-למטה-מהמסילה); המתנה-לבעלים פסולה (צו-סעיף 1).")
    return {"id": "D1-econ-treasury-floor", "area": "כלכלה", "status": "ENFORCED",
            "priority": "P1", "titleHe": "רצפת-האוצרה — הכרעה-כלכלית-ריבונית",
            "verdictHe": verdict, "options": options, "chosen": ["A"],
            "evidence": ev + deleg_evidence, "policy": policy,
            "decidedAt": now(), "decidedBy": "sovereign-decider-v1 (CHARTER)"}


def decide_eng(foreman, work_orders, degraded):
    """D2 — סוכנים-בתקלה/משימות-חסומות: ניתוב-P0 עצמאי (ללא-המתנה)."""
    if not foreman:
        return {"id": "D2-eng-errors", "area": "הנדסה", "status": "OBSERVING",
                "titleHe": "תקלות-הצוות", "verdictHe": "מקור-הפורמן לא זמין — ממשיכים-למדוד, לא מכריעים-סתם",
                "evidence": ["office-state.json לא זמין"], "decidedAt": now(),
                "decidedBy": "sovereign-decider-v1 (CHARTER)"}
    errs = [a.get("id") for a in (foreman.get("agents") or []) if a.get("state") == "error"]
    blocked = [t.get("id") for t in (foreman.get("tasks") or []) if t.get("status") == "blocked"]
    if not errs and not blocked:
        return {"id": "D2-eng-errors", "area": "הנדסה", "status": "ENFORCED",
                "titleHe": "תקלות-הצוות", "verdictHe": "הצוות נמדד נקי (אפס-תקלות, אפס-חסימות) — הכרעת-המשך ללא-שינוי",
                "evidence": ["אפס סוכנים ב-state=error · אפס משימות blocked"],
                "decidedAt": now(), "decidedBy": "sovereign-decider-v1 (CHARTER)"}
    wo_ids = [w.get("id") for w in (work_orders or []) if isinstance(w, dict)][:8]
    ev = [f"סוכנים בתקלה (מדוד): {', '.join(errs) or '—'}",
          f"משימות חסומות (מדוד): {', '.join(map(str, blocked)) or '—'}"]
    if wo_ids:
        ev.append(f"עבודות-פתוחות ממנוע-הצמיחה (צריכה): {', '.join(map(str, wo_ids))}")
    return {"id": "D2-eng-errors", "area": "הנדסה", "status": "ENFORCED", "priority": "P0",
            "titleHe": "תקלות-הצוות — ניתוב-תיקון-ריבוני",
            "verdictHe": (f"הריבונות מדרגת P0 עצמאית: תיקון {len(errs)} סוכנים בתקלה ושחרור "
                          f"{len(blocked)} משימות חסומות — מנותב למסילות-ההנדסה ולמנוע-הצמיחה "
                          f"(work-orders) מיד, ללא-המתנה-להוראות (צו-סעיף 1)."),
            "evidence": ev, "routing": {"foreman": errs, "officeGrowthWorkOrders": wo_ids},
            "decidedAt": now(), "decidedBy": "sovereign-decider-v1 (CHARTER)"}


def decide_flow(flow, degraded):
    """D3 — יתומים/רוחות-רפאים: הכרעת-חיבור-עורקים."""
    if not flow:
        return {"id": "D3-flow-weave", "area": "רשת", "status": "OBSERVING",
                "titleHe": "מפת-הזרימה", "verdictHe": "מפת-הזרימה לא זמינה — ממשיכים-למדוד",
                "evidence": ["flow-map.json לא זמין"], "decidedAt": now(),
                "decidedBy": "sovereign-decider-v1 (CHARTER)"}
    orphans = len(flow.get("orphans") or [])
    ghosts = len(flow.get("ghosts") or [])
    if orphans + ghosts == 0:
        return {"id": "D3-flow-weave", "area": "רשת", "status": "ENFORCED",
                "titleHe": "מפת-הזרימה", "verdictHe": "הרשת נמדדה מחוברת (אפס-יתומים, אפס-רוחות) — המשך",
                "evidence": ["orphans=0 · ghosts=0"], "decidedAt": now(),
                "decidedBy": "sovereign-decider-v1 (CHARTER)"}
    return {"id": "D3-flow-weave", "area": "רשת", "status": "ENFORCED", "priority": "P2",
            "titleHe": "מפת-הזרימה — חיבור-עורקים",
            "verdictHe": (f"הריבונות מכריעה: חיבור {orphans} יתומים וטיפול ב-{ghosts} רוחות-רפאים "
                          f"במסילת-מחבר-העורקים — everything-uses-everything, ללא-המתנה."),
            "evidence": [f"orphans={orphans} · ghosts={ghosts} (flow-map.json, F-series — צריכה בלבד)"],
            "decidedAt": now(), "decidedBy": "sovereign-decider-v1 (CHARTER)"}


# ------------------------------------------------------------ פרסום ---
def main():
    degraded = []
    chain = measure_chain(degraded)
    beacon = read_json(f"{RAW}/sovereign-beacon/main/state.json")
    if not beacon:
        degraded.append("beacon")
    vs = read_json(f"{RAW}/Sandbox/main/ops/sovereign/VALUE-SCAN/state.json")
    if not vs:
        degraded.append("value-scan")
    foreman = read_json(f"{RAW}/FleetHQ/main/office/state/office-state.json")
    if not foreman:
        degraded.append("foreman")
    flow = read_json(f"{RAW}/Sandbox/main/ops/flow/flow-map.json")
    if not flow:
        degraded.append("flow-map")
    wos = read_json(f"{RAW}/Sandbox/main/ops/office/work-orders.json")
    if not isinstance(wos, list):
        wos = (wos or {}).get("orders") if isinstance(wos, dict) else None
        if not isinstance(wos, list):
            wos = None  # כנה: מנוע-הצמיחה עשוי לפרסם מבנה-אחר — לא מנחשים
    hc_scan = scan_outgoing_delegations(max_ops=3000, degraded=degraded)

    # ביקורת-אמת: מדוד מול מפורסם
    match = None
    if chain and beacon:
        pub = (beacon.get("lastPulse") or {}).get("treasuryNetSp")
        if isinstance(pub, (int, float)):
            match = abs(pub - chain["treasuryNetSp"]) <= 1.0

    decisions = [
        decide_econ(chain, beacon, hc_scan, degraded),
        decide_eng(foreman, wos, degraded),
        decide_flow(flow, degraded),
    ]

    state = {
        "schema": "roshpina.sovereign-decider/1",
        "generatedAt": now(),
        "publisher": "sovereign-decider.yml (GitHub Actions, keyless, T14)",
        "charter": "ops/sovereign/DECIDER/CHARTER.md",
        "charterMandateAt": "2026-10-11T21:20Z",
        "ownerMandateVerbatim": "זה צריך להיות מוכרע על ידי הריבונות ממש לא על ידי תמשיך מה שהכי טוב ושיועיל שיעשו לבד הם לא צריכים לחכות להוראות וודא את זה",
        "degraded": sorted(set(degraded)),
        "chainVerify": (None if not chain else {
            "head": chain["head"], "mult": chain["mult"],
            "treasuryNetSp": chain["treasuryNetSp"], "minOperatorSp": chain["minOperatorSp"],
            "beaconChainMatch": match,
        }),
        "decisions": decisions,
        "noAction": [],
        "law": "MEASURE→OPTIONS→SCORE→DECIDE→PUBLISH→VERIFY→RE-MEASURE · R1-R5 ב-CHARTER",
    }

    body = json.dumps(state, ensure_ascii=False, indent=1)
    path = os.path.join(OUT_DIR, "state.json")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body + "\n")

    # פנקס append-bounded
    lpath = os.path.join(OUT_DIR, "ledger.jsonl")
    lines = []
    if os.path.exists(lpath):
        with open(lpath, encoding="utf-8") as f:
            lines = [l for l in f.read().splitlines() if l.strip()]
    entry = json.dumps({
        "at": state["generatedAt"], "head": chain["head"] if chain else None,
        "treasuryNetSp": chain["treasuryNetSp"] if chain else None,
        "beaconChainMatch": match,
        "decided": [d["id"] + ":" + d["status"] for d in decisions],
        "degraded": state["degraded"],
    }, ensure_ascii=False)
    lines.append(entry)
    with open(lpath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines[-LEDGER_MAX:]) + "\n")

    print("md5", hashlib.md5(body.encode()).hexdigest()[:12])
    for d in decisions:
        print("DECIDED", d["id"], d["status"], "-", d["verdictHe"][:110])
    print("degraded", state["degraded"], "· chainMatch", match)


if __name__ == "__main__":
    main()
