/**
 * contract-facts.ts — מקור-אמת-יחיד לחוזה-הרשת [T28=A4]
 * ---------------------------------------------------------------------------
 * חוק (מהרוסט A4 — "חוזה-פרוטוקול מיוצר ונבדק"): החוזה לא נכתב-יד — הוא **מיוצר**
 * מהקבועים האמיתיים של הקוד. כלי gen-contract.mjs חולץ את הבלוק-בין-המפרידים
 * (JSON בלבד — ללא קוד) ומפיק contract.json עם sha256. CI ב-Autonomy
 * (contract-check.yml) מאמת כל-מחזור שהחוזה תקף ושהמצב-החי בגיט עומד בו.
 * שינוי-חוק = עריכה כאן בלבד → יצירה מחדש → הפרסום; כל-סטייה מזוהה-אוטומטית.
 */
// CONTRACT-FACTS-BEGIN
export const CONTRACT_FACTS = {
  "schema": "network.contract/1",
  "generatedFrom": "src/lib/contract-facts.ts",
  "owner": "roshpinacare-sys",
  "writeLane": {
    "optimistic": "כל-כתיבה נושאת baseSha שנקרא-טרי; התנגשות → 409 עם המצב-הטרי",
    "antiForgery": "אחרי-כל-כתיבה readback עם MD5 — אימות-עצמי או דיווח-כישלון-כנה",
    "readbackAfterWrite": true,
    "writeSeedsCache": true
  },
  "sovereignGate": {
    "law": "אין-כתיבה-אנונימית-לנתיבי-ריבונות; נדרש authority=sovereign + ownerVerified",
    "paths": [
      { "repo": "Autonomy", "path": "state/keys/", "prefix": true },
      { "repo": "Autonomy", "path": "state/app/engineering.json" }
    ],
    "receiptSettle": "יישוב authority=receipt מחייב receiptRef>=8 + ownerVerified"
  },
  "receiptLaw": {
    "minChars": 8,
    "terminalClasses": ["skipped", "escalated", "refused", "deferred"],
    "rule": "קבלה-טרמינלית על-סדר-פתוח = סדר-שחייב-היה-להיסגר (סגירה-מוכחת); קבלה-ממתינת-עבודה = נשארת-פתוחה-בכנות"
  },
  "rotationLaw": {
    "rule": "יומני-JSONL חסומים (appendJsonlBounded) — שורות-ישנות נשמטות; אין-גידול-ללא-גבול",
    "typicalBounds": { "state": 40, "journal": 200 }
  },
  "corruptionQuarantine": "JSON שאינו-תקני אינו-מושתק-בשקט — מדווח corrupt עם-הקשר, אין-אתחול-שקט",
  "readCache": {
    "kind": "SWR single-flight",
    "ttlMs": 30000,
    "law": "קריאות-תצוגה מקאש; כל-קריאה-שמזינה-כתיבה טרייה-תמיד (fresh) — baseSha/readback מדלגים-על-הקאש"
  },
  "chainMeasure": { "ttlMs": 60000, "law": "מדידת-שרשרת מקאש-עם-fetchedAt-אמת" },
  "simSubstrate": {
    "doubleLock": "SIM=1 בסביבה וגם x-sim:1 בבקשה — בלי-השניים 403 fail-closed",
    "realUntouched": true
  },
  "intentGate": {
    "law": "חוצת-מקור → 403; x-intent מול-כוונה-צפויה; דלי-אסימונים לכל (IP,מסילה)",
    "sameOriginRequired": true
  },
  "gitCage": {
    "law": "כל-תהליך-גיט-של-סוכן: protocol.allow=never + מלכודת-insteadOf + GIT_CEILING_DIRECTORIES + GIT_TERMINAL_PROMPT=0",
    "selftest": "tools/git-cage.mjs --selftest = 6 בדיקות"
  },
  "keyLaw": {
    "rule": "המערכת-אינה-דורשת-מפתח-שלא-במלאי בלי-לדווח-אדום-כנה; המלאי-הקנוני: Autonomy/state/keys/REGISTRY.json",
    "selfCheckBeforeDemand": true
  },
  "repoLaw": { "privateIsMemoryOnly": "ריפו-פרטי = זיכרון-בלבד; אפס-וורקפלו-פעיל (חוק-T23)" },
  "adoptionMap": {
    "minMechanisms": 12,
    "registry": "Autonomy/state/app/engineering.json — adopted",
    "mechanisms": ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "A11", "A12"]
  },
  "stateContract": {
    "validatedPaths": [
      "Autonomy:state/app/engineering.json",
      "Autonomy:state/app/decisions-cycle.json",
      "Autonomy:state/app/sessions.json",
      "Autonomy:state/keys/REGISTRY.json",
      "ops-intake:ops/QUEUE.json"
    ],
    "rule": "קבצים-אלה חייבים-להתקיים, להתפרס כ-JSON, ולעמוד-במפתחות-החוזה; סטייה = CI-אדום"
  }
} as const;
// CONTRACT-FACTS-END

export type ContractFacts = Record<string, unknown>;
