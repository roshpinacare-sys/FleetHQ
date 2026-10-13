# Fleet HQ · agent-hq — משרד הסוכנים הריבוני

> **החוק הראשון:** הסנדבוקס הוא רק חלון תצוגה. הבית האמיתי של המשרד הוא git —
> הקוד ב‑`roshpinacare-sys/FleetHQ`, הספרים והזיכרון ב‑`roshpinacare-sys/Domain`.
> כל מה שצריך כדי להחיות את המשרד מחדש בכל מכונה: שני `git clone` + מפתחות + `./run-office.sh`.
> תרגיל התחייה המלא: [`SOVEREIGNTY.md`](../../SOVEREIGNTY.md) בשורש הריפו.

---

## 1. מה זה השירות הזה

`agent-hq` הוא **המנהל (foreman) של הצי** — משרד אוטונומי אמיתי, לא הדגמה:

- **סוכני LLM אמיתיים** עובדים במשמרות סיור אוטונומיות: מתכננים משימות, מבצעים, סוקרים זה את זה, ומדווחים לפיד.
- **ספרי נתונים אמיתיים** (ה‑books) נקראים ישירות משכפול של ריפו הנתונים הציבורי של הצי — `Domain` — ונשמרים בו ע"י קומיטים.
- **שרשרת מוחות (LLM) עם failover עמוק**: xAI → OpenRouter → Kilo (ללא מפתח) → LLM7 → OpenAI-compatible → Pollinations (ללא מפתח) → z-ai SDK. כל מוח נכשל? הבא בתור מיד, עם cooldown פר‑מוח של 5 דקות.
- **סוקט אחד ששייך את כל הממשק**: `socket.io` על פורט `AGENT_HQ_PORT` (ברירת מחדל **3010**), `path: '/'` — אין לשנות, ה‑gateway מנתב לפיו. הסוקט הציבורי הוא **קריאה‑בלבד** (אין `goal:submit`, אין `decision:answer` — ראו [`SECURITY.md`](./SECURITY.md)).
- ה‑UI (אפליקציית Next.js בשורש הריפו, בסנדבוקס דרך ה‑gateway בפורט :81) הוא **רק צופה** — הוא מקבל `snapshot` + זרם אירועים מהסוקט הזה.

## 2. דרישות מוקדמות

| כלי | גרסה | הערה |
|---|---|---|
| [Bun](https://bun.sh) | **>= 1.2** | רנטיים + מנהל חבילות (`bun install`, `bun run index.ts`) |
| git | כל גרסה מודרנית | לשכפול FleetHQ ו‑Domain |
| (רשת) | — | קריאות LLM יוצאות ל‑HTTPS; בלי רשת — מצב `sim` עובד מקומית |

## 3. שכפול והרצה — ה‑Quickstart

```bash
git clone https://github.com/roshpinacare-sys/FleetHQ
cd FleetHQ/mini-services/agent-hq
bun install
```

הדרך הקצרה ביותר להרים הכול (תלויות + מפתחות + ספריית נתונים + תהליך):

```bash
./run-office.sh
```

הסקריפט אידמפוטנטי: אפשר להריץ שוב ושוב. הוא מרים `bun install`, פותח את הכספת אם `VAULT_PASSPHRASE` מוגדר, מעתיק `.env.example` ל‑`.env` אם חסר (עם אזהרה רועמת), ומביא את שכפול `Domain` אם אין — ראו פירוט בהמשך.

## 4. מפתחות — שני נתיבים

**מפתחות אף פעם, בשום תנאי, לא נכנסים ל‑git.** קובצי `.env*` מוגדרים ב‑`.gitignore`. יש שתי דרכים להביא אותם למכונה:

### נתיב א' — הכספת החתומה (הדרך הריבונית)

המפתחות נשמרים **מוצפנים בתוך הריפו עצמו** בקובץ `vault/keys.env.enc` (המוזכר בקומיט). כדי לפתוח:

```bash
VAULT_PASSPHRASE=... bash vault/vault.sh open
```

`vault/vault.sh` מפענח את הכספת ומפיק את קובצי ה‑`.env` במקומות הנכונים (`mini-services/agent-hq/.env` למנהל, `.env.local` בשורש לאפליקציית הווב). החוזה המלא של הכספת — שימוש, פורמט, סבב מפתחות — מתועד ב‑**`vault/README.md`** (נבנה במקביל; אם הקבצים עדיין לא קיימים בשכפול שלכם, התייחסו אליהם כחוזה הכספת והשתמשו בנתיב ב').

### נתיב ב' — ידני (`.env.example` → `.env`)

```bash
cp .env.example .env      # בשורש הריפו יש .env.example מחויב; אפשר גם cp ../../.env.example .env
chmod 600 .env            # מפתחות = סוד; הרשאות 600
```

ואז למלא לפחות חלק מהמפתחות: `XAI_API_KEY`, `OPENROUTER_API_KEY`, `KILO_API_KEY`, `LLM7_API_KEY`, `POLLINATIONS_TOKEN`, `OPENAI_API_KEY`/`OPENAI_BASE_URL`/`OPENAI_MODEL` וכו'.

**חשוב ומרגיע:** שני מוחות בשרשרת — **Kilo** ו‑**Pollinations** — עובדים **בלי מפתח בכלל**. משרד חדש עם `.env` ריק עדיין חי; כל מפתח נוסף רק מחזק ומעמיק את השרשרת. מה שבאמת חייב להיות מלא הוא ספריית הנתונים (סעיף 5).

## 5. ספריית הנתונים — `AGENT_HQ_DATA_DIR`

הספרים, זיכרון המשרד ופיד הגיט חיים בשכפול של ריפו הנתונים הציבורי של הצי:

```bash
git clone https://github.com/roshpinacare-sys/Domain
```

הצבעו עליו עם משתנה הסביבה:

```bash
export AGENT_HQ_DATA_DIR=/path/to/Domain
```

- הנתונים **נשמרים ע"י קומיטים** ל‑Domain — זה הדיסק הקבוע של המשרד.
- `run-office.sh` עושה את זה אוטומטית: אם `AGENT_HQ_DATA_DIR` לא הוגדר הוא מנסה `/home/z/my-project/Domain` (סנדבוקס), אחר כך `./Domain` ליד השירות, ואם אין — משכפל את Domain בעצמו. אם גם זה נכשל, הוא מריץ ב‑`demo-data/` עם אזהרה (fail-soft).
- בסנדבוקס המקורי `mini-services/agent-hq/data` הוא סימלינק לשכפול Domain — זו ברירת המחדל בקוד (`../data`), אבל על שכפול טרי של FleetHQ **חובה** להגדיר `AGENT_HQ_DATA_DIR` (או לתת ל‑`run-office.sh` לעשות זאת).
- הגדרת `AGENT_HQ_MODE=sim` מכריחה את `demo-data/` — צוות מדומה ומתויג במפורש, שימושי להדגמה אופליין.

## 6. הרצה

```bash
bun run index.ts        # socket.io על AGENT_HQ_PORT (ברירת מחדל 3010), path '/'
# או:
./run-office.sh         # bootstrap מלא + exec bun run index.ts
# פיתוח עם רילוד חם:
bun run dev             # = bun --hot index.ts
# Docker:
docker build -t fleet-hq-agent-hq . && docker run -p 3010:3010 --env-file .env fleet-hq-agent-hq
```

## 7. אימות — בדיקת דופק עם socket.io-client

```bash
bun add -d socket.io-client
```

```ts
// probe.ts — מצמידים לשורש השירות ומריצים: bun run probe.ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3010', { path: '/', transports: ['websocket'] });
const bail = setTimeout(() => {
  console.error('לא הגיע snapshot — האם המשרד רץ על :3010?');
  process.exit(1);
}, 10_000);

socket.on('snapshot', (s: { status: { backend: string; llmProvider: string } }) => {
  clearTimeout(bail);
  console.log('backend:', s.status.backend);       // צפוי: live (או sim בלי רשת)
  console.log('llmProvider:', s.status.llmProvider);
  socket.close();
  process.exit(0);
});
```

**פלט צפוי** — שרשרת המוחות כפי שהורכבה מהמפתחות שב‑env, מופרדות ב‑`→`:

- עם המפתחות הקנוניים (xAI + OpenRouter, וה‑keyless תמיד): `xai→openrouter→kilo→pollinations`
- שכפול טרי ללא שום מפתח: `kilo→pollinations`
- `backend: sim` + `llmProvider: none` = אין רשת/אין מוח — הצוות המדומה לוקח את המשמר (וזה נאמר בכנות ב‑UI).

## 8. משתני סביבה

| משתנה | ברירת מחדל | תיאור |
|---|---|---|
| `AGENT_HQ_PORT` | `3010` | פורט ה‑socket.io (ה‑path קבוע `/` — אין לשנות) |
| `AGENT_HQ_DATA_DIR` | `../data` (סימלינק ל‑Domain בסנדבוקס) | שורש שכפול `roshpinacare-sys/Domain` — הספרים + זיכרון המשרד |
| `AGENT_HQ_MODE` | — | `sim` = צוות הדגמה מתויג על `demo-data/` |
| `VAULT_PASSPHRASE` | — | סיסמת הפענוח של `vault/vault.sh open` (כספת `vault/keys.env.enc`) |
| `XAI_API_KEY` / `XAI_MODEL` / `XAI_BASE_URL` | — / `grok-4-fast-non-reasoning` / `https://api.x.ai/v1` | מוח 1 — xAI Grok |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODELS` | — / מאגר `:free` מאומת | מוח 2 — OpenRouter (מפתח אחד, בריכת מודלים) |
| `KILO_API_KEY` / `KILO_MODELS` | — / `kilo-auto/free` | מוח 3 — Kilo Gateway, **עובד גם ללא מפתח** |
| `LLM7_API_KEY` / `LLM7_MODELS` | — | מוח 4 — LLM7 (נטען רק עם טוקן; טוקן חינמי ב‑token.llm7.io) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | — | מוח 5 — כל נקודת קצה OpenAI-compatible |
| `POLLINATIONS_TOKEN` / `POLLINATIONS_MODELS` | — / `openai-fast` | מוח 6 — Pollinations, **עובד גם ללא מפתח** |
| (z-ai-web-dev-sdk) | מובנה | מוח סוגר — רץ בלי הגדרה בסביבות מובנות |

סדר השרשרת בקוד: `xai → openrouter → kilo → llm7 → openai → pollinations` ואחריהם z-ai SDK; כל כישלון קשה (401/402/403/429/timeout) מצנן את המוח+דגם הספציפי ל‑5 דקות ועובר הלאה.

## 9. בטיחות בקצרה

- מפתחות רק ב‑`.env*` (gitignored, `chmod 600`) או בכספת המוצפנת; לעולם לא בקוד או בלוגים.
- הסוקט הציבורי **קריאה‑בלבד** — אין handlers של קבלת החלטות; המפעיל האוטונומי מתזמן הכול מבפנים.
- הדוקטרינה האבטחתית המלאה: [`SECURITY.md`](./SECURITY.md). דוקטרינת הריבונות ותרגיל התחייה: [`SOVEREIGNTY.md`](../../SOVEREIGNTY.md).

---

# English summary

**agent-hq** is the foreman of the fleet: a sovereign autonomous AI office. Real LLM agents work real patrol shifts over real data books (a clone of `roshpinacare-sys/Domain`), stream their state over socket.io on port `AGENT_HQ_PORT` (default 3010, path `'/'`), and persist everything by committing back to the Domain repo.

Quickstart:

```bash
git clone https://github.com/roshpinacare-sys/FleetHQ && cd FleetHQ/mini-services/agent-hq
bun install
# keys — pick one:
VAULT_PASSPHRASE=... bash vault/vault.sh open     # (a) sealed vault (vault/keys.env.enc -> .env files)
cp .env.example .env && chmod 600 .env            # (b) manual; fill XAI_API_KEY / OPENROUTER_API_KEY / KILO_* / POLLINATIONS_* ...
git clone https://github.com/roshpinacare-sys/Domain   # data dir (or export AGENT_HQ_DATA_DIR to an existing clone)
./run-office.sh                                   # or: bun run index.ts
```

Verify with the socket.io probe in section 7 — expect `backend: live` and the brain chain in `snapshot.status.llmProvider` (e.g. `xai→openrouter→kilo→pollinations`; a keyless clone still lives on `kilo→pollinations`). `AGENT_HQ_MODE=sim` forces the clearly-labeled demo crew on `demo-data/`. Keys live only in gitignored `.env` files or in the sealed vault (`vault/keys.env.enc` + `vault/vault.sh open`, contract in `vault/README.md`) — never in git. The public socket is read-only by law; see `SECURITY.md`. Full resurrection drill: `SOVEREIGNTY.md` at the repo root.
