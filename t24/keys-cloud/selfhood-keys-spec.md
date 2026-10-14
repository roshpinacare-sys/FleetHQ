# selfhood-keys-spec.md — אינטגרציית-מפתחות במחזור-ה-selfhood (T24)

## מטרה
הרשת-מודעת-למלאי-המפתחות-שלה בכל-מחזור (20 דק'): מה-קיים, מה-מסופק, מה-חסר-לבעלים —
ואכיפת-חוק-הדרישה: רכיב-שדורש-מפתח-שלא-במלאי = דיווח-אדום בכנות.

## שינוי-מדויק (Autonomy)
1. **קובץ-חדש:** `tools/keys-awareness.mjs` (zero-dep Node 20, בדיוק-כמו-שאר-האיברים):
   - קורא `state/keys/REGISTRY.json` (המלאי).
   - עבור כל-דרישה ב-`demands[]` מודד:
     * `SATISFIED-CLOUD` → עדות = ריצה-ירוקה אחרונה של הוורקפלו-התובע (API runs).
     * `MISSING-OWNER` → אימות-שלילה: בדיקת-שמות-סודות בריפו-הרלוונטי (names-only!).
     * `DEGRADED`/`BLOCKED` → דיווח-כן עם ה-`how`.
   - מפרסם `state/selfhood/keys.json`:
     ```json
     { "schema": "selfhood.keys/1", "measuredAt": "...", "demandsChecked": 11,
       "satisfied": 6, "unsatisfied": [{"id":"D6","needs":"groq-gemini-key"}],
       "ownerGaps": ["..."], "lawViolations": [] }
     ```
   - `lawViolations`: כל-וורקפלו-פעיל שנכשל-על-חוסר-מפתח-שלא-רשום-במלאי (סריקת-שמות-בלבד).
2. **וורקפלו** `selfhood.yml`: שלב-אחד נוסף אחרי-ה-discovery:
   `node tools/keys-awareness.mjs` (continue-on-error: false; כשל-קריאה-חוזרת = ריצה-אדומה כנה).
3. **commit וקריאה-חוזרת** מול-בלוב-שא (החוק-הקיים של האיבר).

## אסור
- להעלות-ערכי-סודות, להדפיס-WIF/אסימונים, לכתוב-בתור-role owner, לגעת במסילות-אחרות
  (GridWatch/ops-intake/ops-forge — ראה חוקי-התיאום ב-worklog).

## הצלחה-נמדדת
- `state/selfhood/keys.json` קיים-וטרי; הלוח "מפתחות" באפליקציה מציג את הענן-כמקור
  (כשה-API-המקומי יראה `Autonomy/state/keys/REGISTRY.json` הוא יאמץ-אותו במקום-העותק-המקומי).
