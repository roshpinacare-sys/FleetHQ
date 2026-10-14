# חוק-עצירת-הדימום (FLOOD CURE) — T23 · 2026-10-13

## הבעיה שנמדדה
הבעלים קיבל **~168 אימיילי-כשל ב-24 שעות** ("חסימות כל-כמה-דקות"). פירוק מדוד:

| מקור | 24h | מנגנון |
|---|---|---|
| חומת-דקות (אפס-שלבים) | **75** | כל-push/לוח-זמנים בריפו-פרטי = ריצה-שמתה-מיידית → אימייל-כשל |
| הכרעות-אמת | **41** | guards תקינים + באגים אמיתיים (lighthouse ×27 — תוקן במסילה-אחרת) |
| כבר-נפתרו | 52 | תוקנו במסילות-מקבילות (lighthouse, forge) |

## החוק (מקויף מ-2026-10-13)
**ריפו-פרטי = זיכרון בלבד — אפס-וורקפלו-פעיל.** כל-איבר-חישוב חי בריפו-ציבורי
(דקות-ציבוריות אינסופיות): Autonomy · Domain · Pulse · GridWatch · ops-intake · ops-forge.
- החריגה-היחידה: `pages-build-deployment` ב-TruthRail (מערכת-Pages הפנימית).
- המוגנים (identity-guard וכו') נשארים **פעילים בכל-הריפו-הציבוריים** — שם-הם באמת-רצים.
- האכיפה נמדדת-אוטומטית בכל-מחזור: **Autonomy/state/selfhood/capabilities.json**
  → `compute.activePrivateWorkflows` (אמור-להיות-0; כל-שבירה מדווחת-בכנות).

## מה-הושבת (19 וורקפלו, קבלה-פר-פריט ב-RECEIPTS.jsonl)
Sandbox: identity-guard + 6 · saos-dex: identity-guard · steem: identity-guard + cloud-heart ·
Zip: secret-relay + web-probe · saos-jummper: hive-intel + truthrail-anchor ·
saos-agents: selftest-gate · saos-sovereign-platform: platform-selftest · Sdk: sdk-live ·
SovereignConsole: office-mirror · Project-files: archive-keeper

## שחזור (אם-הבעלים ממלא-דקות-פרטיות ורוצה-להחזיר)
```bash
# החזרת-וורקפלו בודד:
gh api -X PUT /repos/roshpinacare-sys/<REPO>/actions/workflows/<WF_ID>/enable
# רשימת-ה-ID המלאה: ops/flood-cure/RECEIPTS.jsonl (wfId)
# החזרה-מלאה-מהופכת: כל-הפריטים למעלה עם enable במקום disable.
```
