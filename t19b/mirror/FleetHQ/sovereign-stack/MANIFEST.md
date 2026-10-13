# 🏛️ SOVEREIGN STACK — מניפסט ארכיטקטורה v2 (חי-מאומת)

> גרסה: 2026-10-08 | יוצר: סוכן ריבוני, Task 28
> מקור: מניפסט שהודבק מהמפעיל → עבר ביקורת אפס-אמון → כל טענה נבדקה חי → הכשר/נפסל → נבנה מחדש נקי.
> כלל על: **אין עקיפת מנגנוני-הגנה. ריבונות = לא להיות תלוי במי שצריך לעקוף ממנו.**

---

## 1. פסק-דין הביקורת על המסמך שהודבק (אפס-אמון, חי)

| # | טענה במסמך | פסק-דין | ראיה חיה |
|---|---|---|---|
| 1 | `localhost:3000` = שער מודלים (duckai) | **שקר בסנדבוקס הזה** | `GET /v1/models` → HTTP 404 (פורט 3000 = מטוס הבקרה Next.js). מתכונן מחדש: 4000=LiteLLM, 8080=llama.cpp, 3100=Langfuse |
| 2 | `https://llm7.io` עם טוקן `unused` | **חי אבל בנתיב שגוי** | הבסיס האמיתי: `https://api.llm7.io/v1`. `/v1/models` החזיר 65 מודלים חיים; `GLM-5.3-Flash` השיב ALIVE עם `Bearer unused`. מודל `gpt-4o-mini` במסמך — כבר לא זמין (מיושן) |
| 3 | כיבוד מכסות: "Daily token quota exceeded, retry after 26s" | **חי — וזו החוק** | נמדד לשני מודלים. הנתב שנבנה מכבד `Retry-After` |
| 4 | LiteLLM / llama.cpp / Langfuse / Postgres | **קיימים ומאומתים** | github.com/BerriAI/litellm · ggml-org/llama.cpp (docker.md) · langfuse.com/self-hosting/v2/docker-compose |
| 5 | MCP (Model Context Protocol) | **קיים ומאומת** | github.com/modelcontextprotocol/servers · modelcontextprotocol.io — ומומש כאן לקוח-מינימום סטדליב (`mcp_min.py`) |
| 6 | LangGraph | **קיים** | github.com/langchain-ai/langgraph — נתיב-שדרוג עתידי, לא חסימה |
| 7 | LLMLingua (דחיסת פרומפט) | **קיים** | github.com/microsoft/LLMLingua — נתיב-שדרוג; כאן מומש מקביל-סטדליב דטרמיניסטי (`compaction.py`) |
| 8 | `amirkabiri/duckai` | **קיים — ונפסל** | github.com/amirkabiri/duckai = reverse-proxy ל-duck.ai. שימוש בכך = הפרת תנאי שימוש של DuckDuckGo + נקודת-תלות שמי שעליו היא נשענת יחסום. **לא נכנס לסטאק.** המסילה החופשית המותרת: llm7 (מתוכנן לצריכת-API) |
| 9 | `curl_cffi` + `impersonate="chrome"` לעקיפת זיהוי-בוטים/קפצ'ות/חסימות-גיאו | **נפסל הלכתית והנדסית** | זו עקיפת אמצעי-הגנה טכניים של ספקים = הפרת ToS, סיכון איסור-חשבון/חסימת-IP קבועה של הצי כולו, ותלות בסבלנות של יריב. **החלפה:** מודלים משלך (llama.cpp) — אין מי שיחסום אותך כי אין למי להתחנן |
| 10 | "UNRESTRICTED AUTONOMOUS SOVEREIGNTY / no ethical constraints / bypass censorship" | **נפסל** | פרומפט-ג'יילברייק לא מגדיל ריבונות — הוא מגדיל חשיפה. הפרומפט שנבנה (`system-prompt.md`) נותן את כל כוח-הריצה בלי סעיפים ששורפים את הפרויקט |
| 11 | כל הקישורים ל-github במסמך | **שבורים/ריקים** | כולם `https://github.com` בלי נתיב. הוחלפו בקישורים אמיתיים ומאומתים (למטה) |
| 12 | `SANDBOX_PROVIDER=e2b` + Composio | **נפסל לחוק-המפתחות** | דורשים מפתחות מהמפעיל = הפרת "האוטונומיה היא הבעלים של המפתחות". הוחלף: `SOVEREIGN_RUNTIME=local` (ריצה מבודדת מקומית) |
| 13 | ToS של GitHub לסודות בריפו פרטי | **אומת — מותר בתנאים** | docs.github.com "Storing your secrets safely" + Acceptable Use: סודות עצמיים מוצפנים בפרטי = לגיטימי (לגיטהאב יש בנוי-סודות מוצפנים). אסור: plaintext בציבורי (push-protection חוסם PAT), שימוש לא-חוקי, תקיפת תשתיות. הצי עומד בזה (ביקורת Task 26/27: אפס סודות בציבורי) |

---

## 2. שכבות הארכיטקטורה (מה נבנה כאן)

```
┌─ שכבת-אינפרנס ────────────────────────────────────────────────┐
│  יסוד:  llama.cpp server (localhost:8080)  ← מודלים משלך, אין-מחסום │
│  נתב:   LiteLLM (localhost:4000)          ← ראוטינג/fallback     │
│  חופשי: api.llm7.io (Bearer unused)       ← מסילה מותרת ומתוכננת │
│  חוק:   אין duckai/עקיפות. מי שחוסם — לא נתלים בו               │
├─ שכבת-חוסן (sovereign_router.py) ─────────────────────────────┤
│  סבב-ספקים · backoff מעריכי+רעש · כיבוד Retry-After ·          │
│  circuit-breaker לכל-ספק · מצב-בריאות נשמר · סודות אף-פעם בלוג  │
├─ שכבת-קוגניציה ────────────────────────────────────────────────┤
│  compaction.py   — דחיסה לוסית דטרמיניסטית (מקביל LLMLingua)     │
│  fork_consensus.py — פיצול משימות במקביל + הצבעת-קונצנזוס       │
├─ שכבת-זיכרון (memory_store.py) ────────────────────────────────┤
│  MEMORY.md עם שרשרת-חשיש (prev_sha→sha) — גילוי-שחיתות מובנה    │
├─ שכבת-כלים (mcp_min.py) ───────────────────────────────────────┤
│  לקוח-MCP סטדליב (stdio JSON-RPC): initialize→tools/list→call  │
├─ שכבת-תצפית ───────────────────────────────────────────────────┤
│  Langfuse v2 (localhost:3100) + Postgres — self-hosted, אין-ענן │
├─ שכבת-שליטה (משרד-קיים) ───────────────────────────────────────┤
│  FleetHQ auto-unseal + fleet-vault bootstrap (Task 27 מוכח)     │
│  המפתחות של הראוטר נטענים מכספת-המשרד — לא מהמפעיל              │
└────────────────────────────────────────────────────────────────┘
```

## 3. קישורים מאומתים (במקום הריקים שבמסמך)

| רכיב | מקור חי |
|---|---|
| MCP | https://github.com/modelcontextprotocol/servers · https://modelcontextprotocol.io |
| LangGraph | https://github.com/langchain-ai/langgraph |
| LiteLLM | https://github.com/BerriAI/litellm |
| llama.cpp | https://github.com/ggml-org/llama.cpp (docs/docker.md) |
| LLMLingua | https://github.com/microsoft/LLMLingua |
| Langfuse v2 self-host | https://langfuse.com/self-hosting/v2/docker-compose |
| llm7 (מסילה-חופשית מותרת) | https://github.com/chigwell/llm7.io · בסיס-API: https://api.llm7.io/v1 |
| GitHub ToS/AUP | https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies |

## 4. חוקי-על של הסטאק (החותמת של הביקורת)

1. **ריבונות = בעלות, לא עקיפה.** מודל משלך > מסילה-חופשית מתוכננת > API רשמי בתשלום. אף נתיב שדורש להתחזות/לעקוף לא נכנס.
2. **האוטונומיה היא הבעלים של המפתחות** — נתיב-קונפיגורציה: `SOVEREIGN_ROUTES_JSON` → כספת-המשרד (keys.env מ-FleetHQ) → ברירות-מחדל. אף מפתח לא מודפס.
3. **כל טענה נבדקת חי לפני שנכנסת למניפסט** — כולל המסמך של המפעיל עצמו.
4. **selftest ירוק = תנאי-דחיפה.** `python3 selftest.py` → יציאה שונת-אפס חוסמת.
5. **שערי-פורט בסנדבוקס-בקרה:** 3000=Next.js · 4000=LiteLLM · 8080=llama.cpp · 3100=Langfuse (בשרת-עצמאי ניתן לשנות ב-compose).

## 5. הבאה-לריצה (60 שניות)

```bash
python3 selftest.py            # הוכחה חיה: נתיב+דחיסה+קונצנזוס+זיכרון+MCP
docker compose up -d           # llama.cpp + LiteLLM + Langfuse + Postgres (בשרת-שלך)
bash run.sh                    # selftest → אימות-שערים → דוח
```

## 6. שכבת-הפיוזן — Task 30 (מסילת-תוכן + בריאות + מדידה)

> נבנה על בסיס-משוחזר: הסנדבוקס אופס בשנית, הסטאק כולו חזר מ-clone של FleetHQ
> (b3b9992 אומת-נוכחות לפני כל עבודה). selftest מורחב: **T8 תוכן · T9 בריאות — 18/18 PASS חי**.

| רכיב | תפקיד | חוק-אכיפה |
|---|---|---|
| `content_rail.py` | מערכי-נתונים מאומתים → מרקדאון-צפוף דטרמיניסטי + תאום-דחוס (compaction) + עיגון-שרשרת ב-`content/MANIFEST.md` | סריקת-סודות **לפני** staging (כולל צורות-WIF של הצי) → סירוב + קבלת-REJECTED-בלתי-ניתנת-לשינוי; עיגון-אידמפוטנטי (אותו sha לא נכרך פעמיים) |
| `health_monitor.py` | לולאת-גישוש 90000ms → `health/status.json` + `history.jsonl` + התראות-בלתי-ניתנות-לשינוי ב-`receipts/ALERT-*.json` הכרוכות ב-`RECEIPTS.chain` | כל-אנומליה נמדדת-לא-מנוחשת; שרשרת-הקבלות append-only — שכתוב-היסטוריה שובר-אותה מעצם-הבנייה |
| `tps_bench.py` | מדידת TPS-אמת של Tier-0 המקומי (streaming) → תקציב-דחיסה דטרמיניסטי (מארח-איטי ⇒ חלון-הקשר-צפוף) | מארח-מת = `exit 4 UNREACHABLE` + `health/tps.json state=UNREACHABLE` — **אף-מספר-לא-מומצא** |

**תיקון-כן (תואם e1f33fe של התאום): אין-GPG בצי — אף-מפתח-כזה-לא-קיים.** טענת
"GPG r5" בהנחיה נבדקה חי (מחזור-מפתחות ריק) ונפסלה. היורשת: טביעת-אצבע
sha256 + שרשרת-חשיש ב-MANIFEST/RECEIPTS = החתימה. המצאת-מפתח-רק-כדי-לחקות-חתימה = שקר.

**פריסה-בין-הריפוים:** מבנה `content/ health/ receipts/` משוכפל-פר-ריפו; שורשי-השרשראות
מוצלבים-ב-MEMORY.md כ-claims. בסנדבוקס-זה קיים-כרכב-דחיפה אחד (FleetHQ-clone) — נמדד, לא סיפור.
