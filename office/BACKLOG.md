# תיק-העבודות של המשרד (BACKLOG)

> מחזור-השיפור-העצמי · office/retro.mjs · SAOS-OFFICE-RETRO/1 · 2026-10-21 06:37 UTC · [owner-directive]

## סיכום נמדד

- **אוטובוס**: 12 green · 1 amber · 3 red · 1 grey (רישום: live-zip)
- **שערי-בעלים**: 8 WAITING-OWNER
- **מחקר**: לא-נמדד (כנה)
- **E1 spread-regime (built-in)**: SPREAD-REGIME: value=0bps · delta=-93.50 vs 93.5 · מקור-בן-6.7h · PASS (tightened) — הפיזור הצטמצם — נזילות-צד-הגריד משתפרת
- **צווי-עבודה (work-orders)**: 2 פתוחים · 0 נפתרו · P1 פתוחים: 2
- **רווחיות (profit-oracle)**: verdict=FLAT · delta=0% מול-המדידה-הקודמת · שווי-נקי=455.32 SBD-equiv · grid=EDGE-NEGATIVE-GRID-HOLD · at=2026-10-11 23:52 UTC
- **פריטים**: 16 (SAFE 1 · MACHINE-PREP 7 · OWNER-WORD 8)

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
| 1 | `research-feed-unavailable` | sandbox-research-findings | רכבת-המחקר לא-נמדדה: לא-נמצא קובץ-ממצאים מ-9 הימים האחרונים (2026-10-21, 2026-10-20, 20… | SAFE | 3 | 1 | — | `next-retro` |
| 2 | `bus-sandbox-probe-blurt` | bus-registry (A) | פיד אדום: sandbox-probe-blurt — לא-נמצא ב-2 תאריכים אחרונים (2026-10-21, 2026-10-20) | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 3 | `bus-sandbox-probe-hive` | bus-registry (A) | פיד אדום: sandbox-probe-hive — לא-נמצא ב-2 תאריכים אחרונים (2026-10-21, 2026-10-20) | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 4 | `bus-sandbox-research-findings` | bus-registry (A) | פיד אדום: sandbox-research-findings — לא-נמצא ב-9 תאריכים אחרונים (2026-10-21, 2026-10-… | MACHINE-PREP | 7 | 1 | — | `next-retro` |
| 5 | `gate-04-private-16-recovery-meta` | GATE-STATUS | private-16 vault-chain/recovery-meta.json | MACHINE-PREP | 8.5 | 2 | כן | `owner-after-prep` |
| 6 | `bus-sandbox-profit-oracle` | bus-registry (A) | פיד מיושן: sandbox-profit-oracle — מיושן: 223h מעל החוק (24h) | MACHINE-PREP | 4 | 1 | — | `next-retro` |
| 7 | `WO-Sandbox-reds` | work-orders.json (Sandbox raw) | רפא 3 ריצות-אדומות (48ש) ב-Sandbox | MACHINE-PREP | 7 | 2 | — | `owner-after-prep` |
| 8 | `WO-saos-runtime-reds` | work-orders.json (Sandbox raw) | רפא 3 ריצות-אדומות (48ש) ב-saos-runtime | MACHINE-PREP | 7 | 2 | — | `owner-after-prep` |
| 9 | `gate-02-actions-billing` | GATE-STATUS | חיוב-Actions | 🔒 OWNER-WORD | 9.5 | 1 | כן | `owner-only` |
| 10 | `gate-03-r11-rotation-9-soldiers` | GATE-STATUS | סבבת-מפתות R11 + 9-חיילים tx_missing_owner_auth (cashmachine, haran, israelnews… | 🔒 OWNER-WORD | 9 | 1 | כן | `owner-only` |
| 11 | `gate-05-stasis-convert` | GATE-STATUS | STASIS-lane convert | 🔒 OWNER-WORD | 8 | 1 | כן | `owner-only` |
| 12 | `gate-06-stasis-transfers` | GATE-STATUS | STASIS-lane transfers | 🔒 OWNER-WORD | 7.5 | 1 | כן | `owner-only` |
| 13 | `gate-07-stasis-votes` | GATE-STATUS | STASIS-lane votes | 🔒 OWNER-WORD | 7 | 1 | כן | `owner-only` |
| 14 | `gate-09-blurt-ignition` | GATE-STATUS | Blurt | 🔒 OWNER-WORD | 6 | 1 | כן | `owner-only` |
| 15 | `gate-10-private-4-vault-db` | GATE-STATUS | private-4 | 🔒 OWNER-WORD | 5.5 | 1 | כן | `owner-only` |
| 16 | `gate-11-saos-agents-distribution` | GATE-STATUS | saos-agents | 🔒 OWNER-WORD | 5 | 1 | כן | `owner-only` |

## הצעה ראשית של המחזור

- **קובץ**: [PROPOSALS/2026-10-21-research-feed-unavailable.md](PROPOSALS/2026-10-21-research-feed-unavailable.md) — עבור הפריט המדורג ראשון.

## גבולות (חוקי-המחזור)

- retro לא משדר, לא חותם, לא נוגע בכסף/מפתחות/STASIS
- תופעות-לוואי: קבצי-המסילה שלו בלבד (office/*)
- אפס-סודות בכל-פלט (סורק fail-closed לפני כתיבה)
- שמות-ריפואים-פרטיים ממוסכים private-NN (7-b) — כולל שערים
- שערי-בעלים מוזכרים לפי id/כותרת מוקטנת בלבד
- כנות: לא-ידוע נשאר לא-ידוע; פיד אדום מודפס אדום

---
*נוצר אוטומטית על-ידי המשרד · SAOS-OFFICE-RETRO/1 · אפס-סודות (סרוק fail-closed) · ISO 2026-10-21T06:37:27.909Z*
