# SOVEREIGNTY.md — אמנת הריבונות של הצי

> **החוק:** הסנדבוקס הוא רק **תצוגה** (viewer). המשרד אינו חי בתוכו — הוא חי ב‑git.
> שני הריפואים הם הבית האמיתי:
> **`roshpinacare-sys/FleetHQ` = הקוד** (משרד הסוכנים, ה‑UI, הסקריפטים) ·
> **`roshpinacare-sys/Domain` = הספרים והזיכרון** (data books, דוחות, היסטוריה — נשמרים ע"י קומיטים).
> כל עוד שני הריפואים + הכספת קיימים, מותו של הסנדבוקס הוא אירוע תחזוקה זניח — לא מוות.

---

## 1. צ'קליסט ההישרדות (מה חייב להיות ב‑git כדי שהריבונות תעמוד)

| רכיב | מקום | תפקיד |
|---|---|---|
| קוד המשרד | `FleetHQ/mini-services/agent-hq/` (index.ts, src/, package.json, bun.lock) | המנהל — סוכני LLM על ספרים אמיתיים, socket.io על :3010 |
| צ'קליסט הרצה | `mini-services/agent-hq/run-office.sh` | bootstrap אידמפוטנטי: bun install + כספת/.env + שכפול Domain + exec |
| קונטיינר | `mini-services/agent-hq/Dockerfile` | הרצה בכל מכונה שמריצה Docker, בלי Bun מקומי |
| תמצית הרצה | `mini-services/agent-hq/README.md` | ה‑runbook המלא (עברית + אנגלית) |
| תבנית מפתחות | `.env.example` (מחויב בשורש הריפו) | רשימת כל המוחות בשרשרת — בלי סודות אמיתיים |
| הכספת החתומה | `FleetHQ/vault/keys.env.enc` + `vault/vault.sh` + `vault/README.md` | המפתחות האמיתיים, מוצפנים **בתוך** הריפו; פענוח עם `VAULT_PASSPHRASE` |
| הספרים והזיכרון | `roshpinacare-sys/Domain` (שכפול מקומי של הריפו הציבורי) | הדיסק הקבוע: books, דוחות מצב, היסטוריית אמת — נשמרים בקומיטים |
| דוקטרינת אבטחה | `mini-services/agent-hq/SECURITY.md` | חוקי הסוקט, המפתחות והחשיפה (ראו סעיף 4) |
| דוקטרינת ריבונות | קובץ זה (`SOVEREIGNTY.md`) | החוק + תרגיל התחייה |

**בדיקת ריבונות מהירה:** מחשב חדש + שני `git clone` + סיסמת הכספת ⇒ המשרד חי. אם זה לא נכון — משהו חי במקום שאינו git, וזה חוב לתקן.

## 2. תרגיל התחייה — "אם הסנדבוקס מת"

המשרד קם מחדש בכל מכונה (לפטופ, VPS, Docker) בפחות מ‑5 דקות:

1. **הקוד** — `git clone https://github.com/roshpinacare-sys/FleetHQ && cd FleetHQ/mini-services/agent-hq` (דורש Bun >= 1.2; אין? `curl -fsSL https://bun.sh/install | bash`).
2. **תלויות** — `bun install` (שניות בודדות; `run-office.sh` יעשה זאת בכל מקרה).
3. **המפתחות** — אחת משתיים:
   - הכספת: `VAULT_PASSPHRASE=... bash vault/vault.sh open` → מייצרת את קובצי ה‑`.env` במקום.
   - ידני: `cp .env.example .env && chmod 600 .env` ומלאו לפחות חלק מהמפתחות (`XAI_API_KEY`, `OPENROUTER_API_KEY`, `KILO_*`, `POLLINATIONS_*`…). שני מוחות keyless (Kilo, Pollinations) שומרים על המשרד חי גם בלי שום מפתח.
4. **הספרים** — `git clone https://github.com/roshpinacare-sys/Domain` (או `export AGENT_HQ_DATA_DIR` לשכפול Domain קיים). `run-office.sh` עושה זאת אוטומטית ונופל רך ל‑`demo-data` אם הרשת נכשלת.
5. **הצתה** — `./run-office.sh` (או `bun run index.ts`). המנהל עולה על socket.io פורט 3010, path `'/'`.
6. **אימות דופק** — פרוב קטן עם `socket.io-client` ל‑`http://localhost:3010` (path `/`), ממתינים לאירוע `snapshot` ומדפיסים `snapshot.status`: צפוי `backend: live` ו‑`llmProvider` כשרשרת מוחות, למשל `xai→openrouter→kilo→pollinations` (שכפול חסר מפתחות יחיה על `kilo→pollinations`).
7. **(אופציונלי) תצוגה** — הריצו את אפליקציית Next.js בשורש FleetHQ; היא רק צופה בסוקט של המשרד. בסנדבוקס המקורי התצוגה נכנסת דרך ה‑gateway בפורט :81 — שימו לב: ה‑QA עובר **רק** דרך ה‑gateway, לא ישירות לפורטים.
8. **המשכיות** — הספרים בשכפול Domain הם אותם ספרים מאותו קומיט: הצוות חוזר לעבוד על זיכרון שלם, לא מאפס.

הדרך הקצרה ביותר — שלבים 1+3+4+5 בשורה אחת:

```bash
git clone https://github.com/roshpinacare-sys/FleetHQ && cd FleetHQ/mini-services/agent-hq && VAULT_PASSPHRASE=... ./run-office.sh
```

(או ב‑Docker: `docker build -t agent-hq . && docker run -p 3010:3010 -e XAI_API_KEY=... -v /path/to/Domain:/data -e AGENT_HQ_DATA_DIR=/data agent-hq`.)

## 3. מה אסור לשכוח (החוקים הקטנים שמצילים את הגדולים)

- **מפתחות לעולם לא ב‑git.** רק `.env*` gitignored (`chmod 600`) או הכספת המוצפנת. קומיט של מפתח = אירוע דלף מיידי (סבב מפתחות + פוש היסטוריה נקייה).
- **אין לשנות את `path: '/'` של הסוקט** — ה‑gateway מנתב לפיו; שינוי = המשרד נעלם מהתצוגה.
- **הסנדבוקס אינו אחסון.** כל יצירה חשובה נחתמת בקומיט (FleetHQ לקוד, Domain לספרים). מה שלא נדחף — לא קיים.
- **כנות מעל הכול.** בלי מוח/רשת — המשרד מצהיר `sim`/`none` במפורש ולא מחזה חיים.

## 4. אבטחה — מצביעים

- **מפתחות מחוץ לגיט:** `.env` / `.env.local` gitignored (ראו `.gitignore` בשורש ובשירות), הרשאות `600`, והעותק הרשמי בכספת החתומה `vault/keys.env.enc` — מוצפן, נפתח רק עם `VAULT_PASSPHRASE` דרך `vault/vault.sh open` (החוזה המלא: `vault/README.md`).
- **סוקט ציבורי קריאה‑בלבד:** אין מטפלים ל‑`goal:submit` או `decision:answer` — זר עם socket client מקבל חלון, לא הגה. המפעיל האוטונומי מתזמן מטרות ופותר שאלות מבפנים לפי מדיניותו.
- **הדוקטרינה האבטחתית המלאה** (חוקי חשיפה, מודל איומים, כללי הסוקט והמפתחות): **`mini-services/agent-hq/SECURITY.md`** — זהו מסמך הדוקטרינה המחייב; קובץ זה מפנה אליו ואינו מחליף אותו.

## 5. השער הריבוני המקומי (:3011) — ריבונות בזמן ריצה

מעבר להישרדות בגיט, למשרד יש עכשיו **ריבונות תקשורת**: נקודת‑קצה מקומית
אחת בתאימות OpenAI — `mini-services/sovereign-gateway` על :3011 —

- **מוח #0 של כל הצרכנים** (הצוות, הקבלה, כלים חיצוניים): כולם פונים
  ל‑`http://127.0.0.1:3011/v1` עם כל מחרוזת כמפתח (zero-auth by design).
- **Failover מרכזי בזמן אמת:** 429/403/402/401/404/timeout/מוות‑רשתתי מעבירים
  את השיחה למוח הבא בשקט; מפת הקירור אחת לכל המשרד — מוח שנחסם לאחד נחסם לכולם.
- **משמעת רשת:** `AI_TIMEOUT` (deadline כולל, 60s) + `MAX_RETRIES` (8 ניסיונות).
- **סינון איכות בשער:** דליפות scratchpad של מודלי reasoning נדחות ככשל
  (עדיף כשל כן מאשר זבל למבקר), וכך גם שיטפון CJK — השרשרת ממשיכה ללכת.
- **duckai (הנדסה לאחור מקומית):** מקור הקוד של amirkabiri/duckai חולץ לגיט
  (`mini-services/duckai/`). על מכונה עם גישה ל‑DuckDuckGo: `PORT=3031 bun run start`
  ואז `DUCKAI_URL=http://127.0.0.1:3031/v1` מצית את ה‑slot — מוח חינמי ואנונימי
  לגמרי. מהסנדבוקס הזה DDG חסום רשתית (נמדד) — ה‑slot ממתין בכנות.
- **סופרוויזיה:** `/api/foreman/health` מקים את השער כילד של עץ שרת ה‑Next
  כשהוא נופל — אותה חסינות‑ריפר של הפורמן. כשהשער עצמו מוצה (502), הצרכנים
  מקררים אותו 15s והולכים ישירות לשרשרת — אין תלות מעגלית.
- **ה‑prompt הריבוני:** `mini-services/sovereign-gateway/SOVEREIGN-PROMPT.md`,
  מוגש חי ב‑`GET /v1/system-prompt` ומוטמע (סעיף ריבונות) ב‑prompt של הסוכנים.
- **זיכרון רפלקטיבי (כבר חי):** אחרי כל משמרת המשרד מזקק לקח אחד ל‑
  `office-memory.json` (dedup, ≤20) ושומר בקומיטים — הרצה הבאה קוראת לקחים,
  לא היסטוריה.

**חוק חדש:** אין לצרוך מוח חיצוני ישירות כשאפשר דרך השער — השער הוא נקודת
הבקרה היחידה ל‑rate limits, לקירור ולסינון של כל המשרד.

---

# English — the doctrine in one breath

The sandbox is only a viewer; the office's true home is git — **FleetHQ** holds the code (including `run-office.sh`, the `Dockerfile`, and the sealed vault), **Domain** holds the books and memory, persisted by commits. If the sandbox dies: clone both repos, open the vault (or copy `.env.example` → `.env`), run `./run-office.sh`, and verify via a socket.io `snapshot` probe on :3010 — under five minutes, on any machine. Keys never enter git (gitignored `.env` + encrypted `vault/keys.env.enc`), the public socket is read-only, and `mini-services/agent-hq/SECURITY.md` is the binding security doctrine.
