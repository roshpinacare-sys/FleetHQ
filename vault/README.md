# הכספת החתומה של מפקדת הצי — Fleet HQ Sealed Vault

**החוק:** מפתחות לעולם לא נוסעים בגיט בטקסט פתוח. הארטיפקט היחיד שמועלה לגיט הוא
`keys.env.enc` — מוצפן AES-256 עם PBKDF2 (200 אלף איטרציות). הסיסמה קיימת אך ורק
אצל הבעלים (ואופציונלית ב-`vault/.passphrase` — gitignored, להפעלות שקטות).

## מה נמצא כאן

| קובץ | בגיט? | תפקיד |
|---|---|---|
| `keys.env` | ❌ gitignored (600) | המקור הפתוח — כל המפתחות של המשרד והפיתוח |
| `keys.env.enc` | ✅ כן | הכספת החתומה — הגרסה המוצפנת שנוסעת לגיט |
| `vault.sh` | ✅ כן | seal / open / deploy / status |
| `.passphrase` | ❌ gitignored | סיסמת הכספת (להפעלה אוטונומית מקומית) |

## פעולות

```bash
# חתימה: עדכנת מפתחות? אטום מחדש והעלה לגיט
VAULT_PASSPHRASE=... bash vault/vault.sh seal
git add vault/keys.env.enc && git commit -m "vault: re-seal keys" && git push

# פתיחה במכונה חדשה: מפענח ומפרוס אוטומטית לשני הצרכנים
VAULT_PASSPHRASE=... bash vault/vault.sh open
#   → .env.local (קבלת עמית ב-Next.js) + mini-services/agent-hq/.env (המשרד)
```

## שחזור המשרד מאפס (כל מכונה)

```bash
git clone https://github.com/roshpinacare-sys/FleetHQ && cd FleetHQ
VAULT_PASSPHRASE=... bash vault/vault.sh open
cd mini-services/agent-hq && bun install && ./run-office.sh
```

פרטי הריצה המלאים: `mini-services/agent-hq/README.md` · דוקטרינת אבטחה: `SECURITY.md`.

## Autonomous unseal (no owner action)

A fresh machine restores its own keys in one step — `bash vault/auto-unseal.sh`
(boot scripts already call it):

1. Passphrase source: `VAULT_PASSPHRASE` env, else the owner's token in
   `upload/pat.env` (persists on the box across resets; NEVER in git).
2. Pulls the freshest sealed vault from the private repo
   `roshpinacare-sys/fleet-vault` (this repo's `keys.env.enc` is the fallback).
3. `vault.sh open` → merge-deploy to `.env.local` + `mini-services/agent-hq/.env`
   (non-destructive: existing values are never stomped, empty vault slots
   never overwrite a live value).
4. Seeds the infrastructure-only `GITHUB_PAT` into the foreman env (git auth
   for the memory-sync pipeline; agents/model never see it).

Secret-halves map: KEYS (encrypted) live in git (public + private repo);
PASSPHRASE lives on the box (`upload/pat.env`, `upload/pat.rar`) and with the
owner's GitHub account. Neither half alone opens anything.

## ריבונות מורחבת (2026-10-08)

### Cloudflare — מוח חינמי + אחסון מחוץ לקופסה
- **Workers AI** (מאומת חי): מוח מס' 4 בשרשרת — `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
  + 3 מודלים נוספים, הקצאה חינמית יומית (~10k neurons). מופעל אוטומטית כש-
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` קיימים בכספת (אטומו ונפרסו).
- **R2 (S3)**: הפרטים אטומים ומוכנים; החשבון דורש הפעלה אחת של R2 בדשבורד.
  אז `bun vault/r2-backup.ts --mirror` מעלה עותק מוצפן של הכספת מחוץ לגיט.
  (בארגז הנוכחי נקודת ה-S3 חסומה ברשת — הסקריפט נכשל ביושר; ירוץ ממכונה רגילה.)

### דוקטרינת אריכות-ימים מעבר ל-$100
המשרד לא תלוי במפתח אחד: שרשרת 2026-10-08 =
`openrouter-1→2→3 (150 בקשות חינם/יום + קרדיט) → cloudflare-ai (חינם יומי) → kilo → llm7 → pollinations → ovh → z-ai`.
גם אם כל הקרדיטים והמכסות ייגמרו — kilo/llm7/pollinations/ovh ממשיכים להחזיק את
הקבלה והצוות. מפתח-הניהול של OpenRouter שמור ליצירת מפתחות-בת לפי הצורך.

### duckai (github.com/amirkabiri/duckai) — נבדק בכנות
שרת OpenAI-compatible מעל DuckDuckGo AI. עובד כמנגנון, אך duckduckgo.com
חסום ברשת הארגז (ConnectionRefused — נבדק). חיבור לעתיד בלי שינוי קוד: להריץ
duckai בכל מכונה שבה DDG פתוח ולהפנות את תא `OPENAI_BASE_URL` של המשרד אליו.
