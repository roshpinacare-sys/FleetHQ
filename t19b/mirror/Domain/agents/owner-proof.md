# הוכחת הבעלים — עמוד אחד, כל האמת (owner-proof)

_מורכב מהפנקסים המחויבים בלבד (keyless, offline). כל מספר נושא מקור + זמן מדידה — פתחו את הפנקס ובדקו._

## מה יש לנו — אוצרות פר רשת (כל מספר ניתן לאימות על השרשרת)

- **steemLiquid**: "23.366 STEEM" — _מקור: agents/money-ledger.json (condenser_api live read) · נמדד: 2026-10-03T22:45:42.803Z_
- **steemDebt**: "11.241 SBD" — _מקור: agents/money-ledger.json · נמדד: 2026-10-03T22:45:42.803Z_
- **steemPowerSp**: "3810.514 SP" — _מקור: agents/money-ledger.json · נמדד: 2026-10-03T22:45:42.803Z · ההון המוקפא — נזיל במרווחים לפי לוח ה-powerdown_
- **hiveLiquid**: "0.034 HIVE" — _מקור: agents/money-ledger.json · נמדד: 2026-10-03T22:45:42.803Z_
- **blurtLiquid**: "69.673 BLURT" — _מקור: agents/money-ledger.json · נמדד: 2026-10-03T22:45:42.803Z_

## הכנסה מתוכננת — ה-powerdown (ה-drip) והראנווי שלו

- **weeklySp**: 475.902463 — _מקור: agents/sovereign-drip.json (condenser_api, measured twice) · נמדד: 2026-10-04T11:08:46.764Z · STEEM נכנסים מדי שבוע מה-stake_
- **remainingSp**: 1903.609852 — _מקור: agents/sovereign-drip.json · נמדד: 2026-10-04T11:08:46.764Z_
- **runwayDays**: 28 — _מקור: agents/sovereign-drip.json · נמדד: 2026-10-04T11:08:46.764Z · אחרי זה ה-stake נגמר — ההכנסה הזו היא החזר הון, לא תשואה_
- **nextWithdrawal**: "2026-10-10T02:01:27" — _מקור: agents/sovereign-drip.json · נמדד: 2026-10-04T11:08:46.764Z_
- **lastDripSteem**: 475.857 — _מקור: agents/earn-audit.json (headcorner drip_arrived_steem, chain truth) · ה-drip הקודם הגיע והוטל לשוק באותה שעה — הרוטציה האוטונומית הראשונה בהיסטוריה של הצי (CR-0046)_

## האמת על הכסף — רווח והפסד, בלי קישוט

- **realizedSbd (lifetime)**: -1.118787 — _מקור: agents/truth-baseline.json · נמדד: 2026-10-02T00:05:00Z · מדד כל-חיים של המסחר_
- **usdPerDay7dAvg (lifetime)**: 0.00412 — _מקור: agents/truth-baseline.json · נמדד: 2026-10-02T00:05:00Z_
- **trips (lifetime)**: 65 — _מקור: agents/truth-baseline.json · נמדד: 2026-10-02T00:05:00Z_
- **יום אחרון**: realizedSbdToday=-0.388666, fills=156 — agents/fill-ledger.json (הליכת היום, היקף יומי מ-00:00Z)
- **הכנסה · contentRewards**: 0 — נמדד מת: 1421 הצבעות + 56 פוסטים → 0.000 לכל החיים — לולאת התוכן עדיין לא מרוויחה (CR-0046) · agents/earn-audit.json (chain truth, 7d window + lifetime walk)
- **הכנסה · tradingSpread**: -0.388666 — הרגל היחידה שנמדדה עם תנועה — כרגע סביב האפס, ה-buy-premium breaker סוגר את הדליפה (CR-0047) · agents/fill-ledger.json (הליכת היום, היקף יומי מ-00:00Z)

## הגל המתוכנן — לוח ההבשלות מהשרשרת עצמה (ההפתעה שנמדדה, לא סיפור)

- **pendingConverts**: 25 — _מקור: agents/convert-canon.json (chain walk, 90 pages) · נמדד: 2026-10-04T11:08:46.812Z · המרות SBD→STEEM שנפתחו ועוד לא הבשילו — מדוד מהשרשרת, לא מהספרים_
- **pendingTotalSbd**: 131.856 — _מקור: agents/convert-canon.json · נמדד: 2026-10-04T11:08:46.812Z · סך ה-SBD שיהפוך ל-STEEM במחיר ה-feed בהבשלה_
- **nextMaturity**: "2026-10-06T00:02:12Z" — _מקור: agents/convert-canon.json · נמדד: 2026-10-04T11:08:46.812Z · ההבשלה הבאה — חלון העימוד המוקדם נפתח 24 שעות לפניה_
- **waveEnds**: "2026-10-07T17:06:39Z" — _מקור: agents/convert-canon.json · נמדד: 2026-10-04T11:08:46.812Z · סוף הגל הנוכחי — ההבשלה האחרונה בלוח_
- **undated**: 0 — _מקור: agents/convert-canon.json · נמדד: 2026-10-04T11:08:46.812Z · המרות בלי תאריך ניתן לחישוב — לעולם לא מנוחשות (חוק CR-0054)_
- **honestyFix**: "~435 STEEM Oct-7 → התיקון: 117.887 SBD בגל 10-06..10-07" — _מקור: agents/change-requests/CR-0054-maturity-law-rung.json · נמדד: 2026-10-04T00:30:00Z · הספרים הקודמים סיפרו סיפור לא נמדד — התוקן ונחתם ב-E45_

## מה רץ לבד — 24/7, בלי מפתח, עם מרפא עצמי

- **workflowsTotal**: 55 — _מקור: .github/workflows (tree scan)_
- **workflowsScheduled**: 49 — _מקור: .github/workflows (tree scan)_
- **keeperArcDesks**: 9 — _מקור: agents/tick-keeper.json · נמדד: 2026-10-04T00:29:41.896Z · השומר מודד את הקבלות של הדסקים עצמן ומצית מחדש דסק רעב_
- **stasisBreaker**: false — _מקור: agents/STASIS.json · השובר ריק — אין עצירה בתוקף_
- **arc · sovereign-tick-cron**: קבלה אחרונה "2026-10-03T22:43:14.918Z" — מקסימום פער מותר: 20m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · earn-audit-cron**: קבלה אחרונה "2026-10-04T00:06:57.929Z" — מקסימום פער מותר: 45m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · fill-ledger-cron**: קבלה אחרונה "2026-10-03T22:45:37.515Z" — מקסימום פער מותר: 45m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · market-grid-cron.yml**: קבלה אחרונה "2026-10-03T22:43:07.849Z" — מקסימום פער מותר: 45m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · fleet-census-cron.yml**: קבלה אחרונה "2026-10-04T00:24:54.329Z" — מקסימום פער מותר: 1560m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · twin-audit.yml**: קבלה אחרונה "2026-10-03T22:43:11.481Z" — מקסימום פער מותר: 1560m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · self-audience.yml**: קבלה אחרונה "2026-10-03T22:43:34.930Z" — מקסימום פער מותר: 1560m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · public-pulse.yml**: קבלה אחרונה "2026-10-04T00:24:53.436Z" — מקסימום פער מותר: 1560m · נמדד: 2026-10-04T00:29:41.896Z
- **arc · audience-analyst.yml**: קבלה אחרונה null — מקסימום פער מותר: 1560m · נמדד: 2026-10-04T00:29:41.896Z

## משמעת — מה מוכח ומה נבדק

- **claimsAudit**: "WARN" — _מקור: agents/claims-audit.json · נמדד: 2026-10-04T16:14:25.870Z · כל קובץ שנטען בפנקס — נבדק שהוא באמת על העץ_
- **censusLanes**: undefined — _מקור: agents/fleet-census.json · נמדד: 2026-10-04T16:14:24.930Z · מפת ה-16 מסלולים של הצי_
- **ownerLanguage**: "he" — _מקור: agents/claims-audit.cjs OWNER_LANGUAGE (CR-0050) · כל פנייה לבעלים — בעברית_

_החוק: שום מספר לא מומצא, שום היקף לא מתגנב (יומי לעולם לא מתגלגל לכל-חיים), שום הפסד לא מוסתר._
