# תיק-העבודות של המשרד (BACKLOG)

> מחזור-השיפור-העצמי · office/retro.mjs · SAOS-OFFICE-RETRO/1 · 2026-10-18 23:30 UTC · [owner-directive]

## סיכום נמדד

- **אוטובוס**: 9 green · 1 amber · 5 red · 1 grey (רישום: fallback-embedded)
- **שערי-בעלים**: לא-ידוע (מקור-השערים פרטי/לא-נגיש — כנה)
- **מחקר**: לא-נמדד (כנה)
- **E1 spread-regime (built-in)**: SPREAD-REGIME: value=0bps · delta=-93.50 vs 93.5 · מקור-בן-5.3h · PASS (tightened) — הפיזור הצטמצם — נזילות-צד-הגריד משתפרת
- **צווי-עבודה (work-orders)**: לא-ידוע (כנה)
- **רווחיות (profit-oracle)**: לא-זמין — profit-oracle לא-נגיש (HTTP 404) — כנה, לא-מדומה (14b עשוי שלא להיות באוויר עדיין)
- **פריטים**: 7 (SAFE 1 · MACHINE-PREP 6 · OWNER-WORD 0)

## בוצע במחזור זה (SAFE built-ins בלבד — חוק)

| id | כותרת | מחלקת-סיכון |
|----|-------|-------------|
| `builtin-refresh-lane` | רענון קבצי-המסילה: BACKLOG + RETRO-LATEST + retro-state (SAFE: כתיבה למסילה-שלו בלבד) | SAFE |
| `builtin-verify-bus` | אימות-אוטובוס: מדידת כל-הפידים הרשומים + טבלת-בריאות מוטמעת (SAFE: קריאה-בלבד) | SAFE |
| `builtin-e1-spread-regime` | אימות-משטר-הפיזור (E1): grid.json חי מול חוק-93.5bps — פסק-כנה לתיק (SAFE: קריאה-בלבד) | SAFE |

> כל-שאר הפריטים אינם מבוצעים — SAFE מתורגש כ-`executableBy: next-retro` (הרפרטואר-הבטוח צומח built-in אחד לכל-מחזור); MACHINE-PREP מוכן לבעלים; OWNER-WORD לעולם לא מבוצע-מכונה.

## תור מדורג

| # | id | מקור | כותרת | מחלקת-סיכון | ערך | מאמץ | דבר-בעלים | executableBy |
|---|----|------|-------|-------------|-----|------|-----------|--------------|
| 1 | `research-feed-unavailable` | sandbox-research-findings | רכבת-המחקר לא-נמדדה: לא-נמצא קובץ-ממצאים מ-9 הימים האחרונים (2026-10-18, 2026-10-17, 20… | SAFE | 3 | 1 | — | `next-retro` |
| 2 | `bus-sandbox-flow-map` | bus-registry (A) | פיד אדום: sandbox-flow-map — HTTP 404 | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 3 | `bus-sandbox-lessons-ledger` | bus-registry (A) | פיד אדום: sandbox-lessons-ledger — HTTP 404 | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 4 | `bus-sandbox-probe-blurt` | bus-registry (A) | פיד אדום: sandbox-probe-blurt — לא-נמצא ב-2 תאריכים אחרונים (2026-10-18, 2026-10-17) | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 5 | `bus-sandbox-probe-hive` | bus-registry (A) | פיד אדום: sandbox-probe-hive — לא-נמצא ב-2 תאריכים אחרונים (2026-10-18, 2026-10-17) | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 6 | `bus-sandbox-research-findings` | bus-registry (A) | פיד אדום: sandbox-research-findings — לא-נמצא ב-9 תאריכים אחרונים (2026-10-18, 2026-10-… | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 7 | `bus-domain-office-feed` | bus-registry (A) | פיד מיושן: domain-office-feed — מיושן: 87h מעל החוק (24h) | MACHINE-PREP | 4 | 1 | — | `next-retro` |

## הצעה ראשית של המחזור

- **קובץ**: [PROPOSALS/2026-10-18-research-feed-unavailable.md](PROPOSALS/2026-10-18-research-feed-unavailable.md) — עבור הפריט המדורג ראשון.

## גבולות (חוקי-המחזור)

- retro לא משדר, לא חותם, לא נוגע בכסף/מפתחות/STASIS
- תופעות-לוואי: קבצי-המסילה שלו בלבד (office/*)
- אפס-סודות בכל-פלט (סורק fail-closed לפני כתיבה)
- שמות-ריפואים-פרטיים ממוסכים private-NN (7-b) — כולל שערים
- שערי-בעלים מוזכרים לפי id/כותרת מוקטנת בלבד
- כנות: לא-ידוע נשאר לא-ידוע; פיד אדום מודפס אדום

---
*נוצר אוטומטית על-ידי המשרד · SAOS-OFFICE-RETRO/1 · אפס-סודות (סרוק fail-closed) · ISO 2026-10-18T23:30:45.241Z*
