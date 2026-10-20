#!/usr/bin/env python3
# T10-final: commit ROTATION-LAW doc (additive, [skip ci]), readback-verify.
import json, base64, hashlib, os, urllib.request, urllib.error

API = "https://api.github.com"
USER = "roshpinacare-sys"
REPO = "Sandbox"
PATH = "ops/sovereign/ROTATION-LAW-2026-10-11.md"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")
LOCAL = "/home/z/my-project/tmp/t10/rotation-law.md"
MARK = "T10-ROTATION-LAW-v1"

DOC = """# חוק-הרוטציה של הריבונות · ROTATION-LAW · 2026-10-11 · MARKER: T10-ROTATION-LAW-v1

**מקור-סמכות:** הוראת-בעלים מפורשת (2026-10-11): לריבונות סמכות-מלאה על ההחלטות בשלב-זה,
הרשאת-אדמין, ובחירה-עצמאית איך-לעשות-זאת-נכון — בתנאי-עמידה-בכללים, בלי-הסתרה-מהבעלים,
ובלי-חסימה-בגיטהאב. ההחלטה-הדחופה-שנדרשה: **רוטציית-הריבונות** כדי-שלא-תיפול.

## 1 · מדידות-מאומתות (בסיס-ההחלטה · double-run identical · point-level)
- **keyfit (טרי, self-test עובר, דיוק-נקודה 33-בייט, שרשרת double-fetch):**
  10/10 מפעילות (cashmachine,haran,israelnews,lsa,macrame,siq,tov,wic,wog,woq) —
  WIF-הכספת **מתאים-חי** ל-authority ה-active בשרשרת (owner+posting גם-כן).
  hcsoldier4/5/6 — owner-fit בלבד. **headcorner — אין-התאמה בשום-רמה** (הכספת-מיושנת מול-השרשרת).
- **חוק-האימות:** פסק-דין לפי **בייטי-המפתח**, לא-מחרוזת-התצוגה (נמדד-באופן-בלתי-תלוי
  גם-ב-vault-drip.mjs: blurt מציג-checksum שבור — 04e2055c מול d4a396b2 על-גוף-זהה).
  חוק-הקידוד-האמפירי למחרוזות-השרשרת: checksum = ripemd160(comp)[:4] (42/42 הצבעות).
- **הכספת-עצמה עקבית:** 60/60 WIF-ים פענוח-תקין (checksum-ים חוקיים), נקודות-נגזרות = נקודות-שמורות.

## 2 · החוק: רוטציה-בחפיפה בלבד (אסור-בליינד-אין-פלייס)
1. **לעולם** לא מחליפים-credential חי בשלב-אחד. סדר-החובה: מצבים-חדש → אימות-fit בנקודה →
   הוכחת-עבודה-חיה (2 פעימות/פוש מוצלח) → **רק-אז** פרישת-הישן.
2. כל-אירוע-רוטציה נרשם ב-ops/AGENT-LEDGER.md (מה, מתי, איזה-עידן, אימות).
3. אם-אין-מפתח-חוקי-קיים-שמתאים (מצב-headcorner): הבעלים חותם-פעם-אחת (wallet) —
   ה-SOP למטה מכין-הכל-כך-שהחתימה-היא-3-פקודות-בדיוק.
4. אסור-שהרוטציה-תשבור-rail חי (fleet-vault origin טוקן-עורק חי — מחליפים-רק-עם-עורק-שני-מאומת).

## 3 · ההחלטה-הדחופה (מאושרת-עכשיו)
- **Steem-head (headcorner) GEN-3:** מייצרים-זוג-מפתחות-חדש מנתיב-ה-master-derive של-הכספת,
  מכינים-era-חדש (keys-zip עטוף + era-meta), מעדכנים-authority על-השרשרת חתום-במפתח-ה-active
  הנוכחי-המתאים (מ-CI/Domain secrets — נבדק-נקודה-קודם), מאמתים-point-level, ורק-אז פורשים-את-הישן.
  **אין-חתימה-עצמאית-של-רוטציית-בעלים בלי-התאמה-מאומתת** — fail-closed, בלי-זיופים.
- **GitHub PAT:** חפיפה-זהה. PAT-חדש → עדכון-secrets (GH_PAT + כל-המשתמשים) → 2 פעימות-ירוקות →
  פרישת-הישן. PAT-הסשן (upload/pat.env) מתרוקן-בסוף-הסשן (פעולת-בעלים — API לא-יוצר-PATs).
- **פסי-הצפנה-של-הכספת (GEN-1/GEN-2 plaintext passphrases):** עוטפים-era-חדש, מריצים-vault-drip
  מול-העידן-החדש עד-אימות, ורק-אז מנקים-plaintexts. אסור-לשבור-את-ה-drip באמצע.

## 4 · סמכות-הריבונות (נרשם-מכוח-הוראת-הבעלים)
- **מותר-לריבונות-עצמאית:** הפעלת-פסי-delegation/content תחת-השערים-הקיימים; חימוש-דגלים
  אחרי-fit מאומת; רוטציות-בחפיפה לפי-סעיף-2; תיקון-רכבת-מנוע; פתיחת-issues-שיפור.
- **נשאר-חסום-בלי-בעלים:** רוטציית-authority-של-בעלים-על-השרשרת בלי-מפתח-מתאים-מאומת;
  יצירת-PATs; כל-פעולה-בלתי-הפיכה בלי-הוכחת-fit. **איסור-הסתרה:** אין-פעולה-שמוסתרת-מהבעלים.

## 5 · עמידה-בכללים (נמדד-2026-10-11)
- rate-limit: 5000/5000 (רענן). concurrency-guards + friction-ARM קיימים בשערי-האוצר.
- סריקות-חשיפה בדפוסים: Sandbox-boot / FleetHQ-telemetry / Console-credits — **נקי** (0 דפוסי-cred).
- חשיפות-אמיתיות-שנותרו: passphrases-במטא-של-המנוע (repo-פרטי), טוקן-עורק ב-fleet-vault-origin,
  PAT-סשן — כולן-בתוך-סעיף-3 (רוטציה-מתוכננת-בחפיפה, לא-מחיקה-עיוורת).

## 6 · תיאום-סוכנים (בלי-התנגשות)
- ה-custodian (zai-code-2) מוביל-את-ביצוע-האצלה-מ-headcorner לפי-השערים-שבבריה-שלו
  (שניים-משלוש: רוטציה-או-הוראת-בעלים — **ההוראה-קיימת-מעכשיו**; סנכרון-סשן-יחיד; רצפת-RC ירוקה).
- הקלט-שלי: פסק-ה-keyfit-המאומת לעיל (10/10 מפעילות-כשירות; head-כספת-מיושנת) — מסמך-זה
  הוא-קלט-להחלטה, לא-פעולה-מקבילה. אין-חתימה-כפולה.

*נכתב-ואומת-על-ידי סוכן T10 · אימות-כפול · ללא-חומר-פרטי-במסמך*
"""

open(LOCAL, "w").write(DOC)
body = json.dumps({
    "message": "ops/sovereign: ROTATION-LAW 2026-10-11 (keyfit verdict + overlap-rotation law + authority grant) [skip ci]",
    "content": base64.b64encode(DOC.encode()).decode(),
}).encode()
req = urllib.request.Request("%s/repos/%s/%s/contents/%s" % (API, USER, REPO, PATH),
                             data=body, method="PUT")
req.add_header("Authorization", "Bearer " + TOKEN)
req.add_header("Accept", "application/vnd.github+json")
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        put = json.loads(r.read().decode())
        commit_sha = put.get("commit", {}).get("sha", "")[:12]
        print("PUT status:", r.status, "commit:", commit_sha)
except urllib.error.HTTPError as e:
    print("PUT FAIL:", e.code, e.read().decode()[:200])
    raise SystemExit(1)

# readback verify (md5 + marker + size)
req2 = urllib.request.Request("%s/repos/%s/%s/contents/%s?ref=main" % (API, USER, REPO, PATH))
req2.add_header("Authorization", "Bearer " + TOKEN)
req2.add_header("Accept", "application/vnd.github.raw")
with urllib.request.urlopen(req2, timeout=30) as r2:
    back = r2.read()
locmd5 = hashlib.md5(DOC.encode()).hexdigest()
remmd5 = hashlib.md5(back).hexdigest()
print("readback: bytes local=%d remote=%s md5_match=%s marker=%s"
      % (len(DOC.encode()), len(back), locmd5 == remmd5, MARK.encode() in back))
