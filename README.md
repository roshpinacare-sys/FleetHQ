# Fleet HQ — a live operations room for real AI agents

[![SAOS office](https://roshpinacare-sys.github.io/Domain/badge/office.svg)](https://roshpinacare-sys.github.io/Domain/office3d/)
[![SAOS fleet](https://roshpinacare-sys.github.io/Domain/badge/fleet.svg)](https://roshpinacare-sys.github.io/Domain/status/)
[![steem-edge](https://roshpinacare-sys.github.io/Domain/badge/edge.svg)](https://roshpinacare-sys.github.io/Domain/money.html)


**מפקדת הצי** — a live office where a crew of AI agents plans, works and reports on **your real data books**, and you watch every step happen.

Not a wall of terminal text. Not a fake dashboard. A place.

---

<div align="center">

| | |
|---|---|
| 🧭 **The chief of staff** | The **autonomous operator** schedules goals. The lead agent reads them, splits them into real tasks with dependencies and pins them to the **Task Wall**. |
| 🛠 **The crew works** | Five worker agents walk to their desks and execute: they read your data books, measure values, cross-check books against each other — every tool call streams live on their **desk monitors**. |
| 🗣 **They talk** | Speech bubbles, messages to each other, honest activity lines under every nameplate. |
| 🙋 **They resolve themselves** | When a judgment call is needed, the agent walks to the **Decision Podium** — and the operator's own policy resolves it in seconds. The podium is a public transparency record, not a control surface. |
| 📚 **Work lands in the Library** | Real reports written by the agents — grounded only in data they actually read. |
| 📡 **The Git Wire** | The office wall displays the **real commit stream** of the books repo — actual timestamps and subjects, metadata only. |

**Fully autonomous.** The public office is a *window, not a steering wheel*: there is no goal console, no decision answering, no write path — nothing a visitor can steer. The operator schedules the work; the crew deliberates and resolves its own questions by policy.

### 🏛️ החדר התלת-ממדי — עכשיו הפנים המובילות של המשרד (Task 11-a)

החדר התלת-ממדי (`src/components/hq/`) מציג תמיד **מציאות נמדדת** — בשני מסלולים מפורסמים-בשלט בפינת-החדר:

- **חי** — המפעיל מריץ את המשרד מקומית: הסוקט (:3010) מזרים כל אירוע אמיתי של הפורמן אל החדר, בזמן אמת.
- **מראה — מציאות נמדדה מ-{savedAt}** — פריסה בלי פורמן (החלון הציבורי, הבייק): החדר ניזון מ**יומן-הפורמן האמיתי** (`receipts/office-state-mirror.json`) דרך `NEXT_PUBLIC_OFFICE_FEED` — היומן שהפורמן עצמו כותב, לא סימולציה. רענון כל שתי דקות.
- **הדגמה** — רק במצב סים מפורש, עם סימן-מים DEMO. אין מסלול שלישי: מה שלא נמדד — לא מוצג.

חידושי ה-11-a: **סיור-מצלמה קולנועי** (דולי חלק תחנות → פודיום → לוח → ספרייה, עם הקפה-סרק עדינה; כל קליק מחזיר שליטה), **תאורת שלושה-אורות** (key/fill/rim) + צללי-מגע רכים + מחזור-יום עדין, **טבעת-מצב** מתחת לכל איש-צוות (צבע-המצב החוקי), **HUD נתונים אמיתיים** (יעד פעיל · ספירת לוח · הכרעות), ומגבלות-ביצועים (dpr מהודק + איכות מסתגלת לניטור-fps). קישור-עומק: `?view=office`.

החלון הציבורי (zero-JS) מקבל את החדר דרך **בייק-3D**: `office-3d.yml` בונה את האפליקציה במצב-מראה, מריץ כרום חסר-ראש עם WebGL, ממתין לפריים האמיתי הראשון (RoomReadiness) ומצלם את פוזות הסיור — והפריימים, עם חותמות-הזמן האמיתיות שלהם, מוטמעים בחלון ב-[https://roshpinacare-sys.github.io/FleetHQ/](https://roshpinacare-sys.github.io/FleetHQ/). בייק שנכשל = קבלת-כשל כנה; החלון מציג "טרם אופה", לעולם לא פריימי-מקום.

</div>

---

### ♻️ מחזור-השיפור-העצמי של המשרד (Task 11-d)

The retro loop still runs on the host (the `local-beats` retro lane keeps `office/BACKLOG.md` / `RETRO-LATEST.md` / `PROPOSALS/` fresh), but its dedicated weekly GitHub Actions trigger was removed in the 2026-10-28 workflow consolidation (21 → 4) — re-adding a schedule is tracked backlog. חי: [retro/index.html](https://roshpinacare-sys.github.io/FleetHQ/retro/index.html).

---

## Why it's different

Most "agent dashboards" show a spinner and a status word. Fleet HQ shows **the work itself**:

- **Live monitors on every desk** stream each agent's real log: tool calls, measured values, cross-check results, errors.
- **A real task wall** (kanban: planned → in work → in review → done) driven by the lead's actual plan for your goal.
- **A decision podium** — agents surface judgment calls; the operator's policy resolves them and the reasoning is published right there.
- **A library** that accumulates the crew's real written reports.
- **The honesty law**: agents may only report what they actually read. Every number on screen comes from a real file in your data directory — never invented, never mocked. When something fails, it shows as a failure.

## The two modes

| Mode | What runs | What you need |
|---|---|---|
| **Demo** (`sim`) | A scripted, clearly-labeled simulated crew performing a full scenario on bundled synthetic books (`mini-services/agent-hq/demo-data/`). A `DEMO · SIMULATION` watermark is shown at all times. | Nothing. Zero keys, zero config. |
| **Live** (`live`) | Real LLM agents (chief of staff + 5 workers) with real tools operating on your real data books. | An LLM key (see below) + a directory of JSON "books". |

The UI always tells you which mode you are in. The demo exists so anyone can feel the product in 30 seconds — and so public checkouts never ship anyone's real data.

## Quick start

You need [Bun](https://bun.sh) (foreman) and Node 20+ (web).

```sh
# terminal 1 — the foreman (demo crew, no keys needed)
cd mini-services/agent-hq
bun install
bun run dev                     # listens on :3010

# terminal 2 — the office (Next.js app lives at the repo root, not in web/)
bun install
bun run dev                     # listens on :3002
```

Open **http://localhost:3002** — you'll see the office with the simulated crew. Watch the whole loop unfold on its own: plan → wall → desks → decisions → library. Click the receptionist at the front desk — he answers questions about the platform (and nothing else).

> Behind a reverse proxy? The web client connects to `/?XTransformPort=3010` on the same origin (path `/`). Keep that contract or adjust `AgentHQ.tsx`.

## Going live

1. **Books.** Point the foreman at a directory of JSON files (fleet state, ledgers, audits, registries — your domain's "books"). Either create `mini-services/agent-hq/data/` or export `AGENT_HQ_DATA_DIR=/path/to/your/books`.

   Book expectations are light: any JSON file with an optional date-ish field (`at`, `asOf`, `generatedAt`, …) gets a heartbeat; optional `ok` / `verdict` top-level fields are surfaced. See `mini-services/agent-hq/src/books.ts` for the built-in registry (edit `BOOK_DEFS` to match your domain).

2. **LLM — the sovereign brain chain.** The foreman walks this failover chain (`mini-services/agent-hq/src/llm.ts`), first live brain wins — **18 slots**: sovereign-gateway (`:3011`, brain #0) → xAI → OpenRouter (×3 keys) → NVIDIA NIM → NIM-2 → Groq → Cerebras → Mistral → Google → GitHub Models → Together → Cloudflare → Kilo → LLM7 → OpenAI-compat → Pollinations → OVH → bundled `z-ai-web-dev-sdk`. Per brain+model cooldown after a hard error (5 min; 429 → 45s, network → 15s), so one dead provider never slows the others. Keyless brains need NO signup. Measured caveat (P1 debt): `sovereign-gateway/` ships a second, drifting copy of this chain (no NVIDIA slots, adds `duckai`/`local-llm`), and the receptionist route mounts `z-ai-web-dev-sdk` directly rather than walking it — consolidation is tracked, not done.

   1. **Sovereign gateway** — `SOVEREIGN_GATEWAY_URL` (`:3011`, zero-auth local office endpoint)
   2. **xAI Grok** — `XAI_API_KEY` (+ optional `XAI_MODEL`, `XAI_BASE_URL`)
   3. **OpenRouter** — `OPENROUTER_API_KEY`, one key → a whole pool: `deepseek/deepseek-chat-v3.1` (credited) first, then 8 verified free models (`nemotron-3.5-lightning`, `ling-3.0-flash-sante`, `gemma-4-26b`, `inkling`, `north-mini-code`, `nemotron-3-super`, `nemotron-3-ultra`, `laguna-s`). Configure via `OPENROUTER_MODELS` (comma-separated). Reasoning tokens are excluded and any leaked scratchpad is stripped.
   4. **Kilo Code free auto-router** — NO KEY (`kilo-auto/free`)
   5. **LLM7.io** — mounted even with no key (the anonymous tier is measured live, 200); a free `LLM7_API_KEY` from token.llm7.io lifts the daily quota
   6. **Pollinations** — NO KEY (`openai-fast`)
   7. **Any OpenAI-compatible endpoint** — `OPENAI_API_KEY` (+ `OPENAI_BASE_URL`, `OPENAI_MODEL`)
   8. **`z-ai-web-dev-sdk`** if it is installed next to the foreman
   9. Nothing found → the office stays in the labeled demo mode. It never fakes "live".

   (The full slot list with every provider between Groq and OVH lives in `llm.ts` and `.env.example` — `.env.example` is the accurate copy.)

3. **The vault.** Keys live in gitignored env files — the template is committed:

```sh
cp .env.example .env.local               # web/reception vault
cp .env.example mini-services/agent-hq/.env   # foreman vault
# fill in what you have — even zero keys run the keyless brains
chmod 600 .env.local mini-services/agent-hq/.env  # never commit real keys
```

   `.env.example` documents every brain and the verified free-model list. The live status bar in the UI shows the chain as it is mounted (e.g. `xai→openrouter→kilo→pollinations`).

4. **Run.** Restart the foreman — the header badge flips to **Live crew · real model agents**. The autonomous operator schedules the patrol; the crew works the books and you watch it happen in real time.

```sh
# example
OPENAI_API_KEY=sk-... AGENT_HQ_DATA_DIR=$HOME/my-books bun run dev
```

## Architecture

```mermaid
flowchart LR
    subgraph web ["web (Next.js)"]
        OFFICE["Office floor (SVG)\ndesks · wall · podium · library\nreception desk"]
        PANELS["Monitor · Wall · Podium\nLibrary · Fleet registry · Git wire"]
        REP["Receptionist chat\n(sandboxed, platform-only)"]
    end
    subgraph foreman ["foreman (Bun + socket.io)"]
        LEAD["Chief of staff\nplans · reviews · rescues"]
        OP["Autonomous operator\nschedules goals · resolves\nagent questions by policy"]
        W1["Worker agents ×5\nreal LLM loop"]
        TOOLS["Real tools\nread_book · measure\ncross_check · write_report\nask_operator · message"]
        STATE["Office state\nagents · tasks · decisions\nreports · feed"]
        BOOKS["Book registry\nheartbeats · verdicts"]
        GIT["Git wire\nreal commit stream\n(metadata only)"]
    end
    DATA[("Your data books\nJSON files")]
    LLM["LLM provider\nz-ai SDK / OpenAI-compatible"]
    OFFICE <-->|"socket.io (read-only: snapshot + live events)"| STATE
    PANELS <--> STATE
    REP -->|"HTTP, whitelisted stats only"| LLM
    OP --> LEAD
    LEAD --> W1 --> TOOLS --> DATA
    W1 --> LLM
    LEAD --> LLM
    TOOLS --> BOOKS --> DATA
    GIT --> DATA
```

**Task matching (LLM fit reasons).** Every task lands with the *right* worker, and you can see why: the planning model assigns each task a one-line fit reason (`why`), shown on the wall card with an `LLM` badge. If the model is saturated, a deterministic specialty scorer takes over (`FIT` badge) — it scores each worker's specialty vocabulary and owned books against the task text, and the office keeps running an honest, measured routine instead of freezing. The autonomous operator even uses the model to *pick which routine patrol is most valuable right now* from the real freshness table (rotation is the fallback).

**The agent loop.** Every step is a real model call returning strict JSON: `{say?, thought?, tool?, args?, done?, result?}`. The foreman executes the tool *for real*, appends the result to the agent's transcript, and loops until the agent is done (max steps + timeout enforced). Workers may `ask_operator` — the office deliberates ~7 seconds and resolves the question **by policy** (safe default, recorded transparently at the podium). The lead reviews finished tasks (approve / redo once), rescues blocked work by reassigning it, and writes the final operation summary into the library.

## Wire surface (socket.io, path `/`)

Client → server (read-only): `snapshot:request`, `book:preview {id}`, `books:refresh`. **There are no control events** — goals are scheduled by the operator, decisions resolve by policy; unknown events are simply never handled.
Server → client: `snapshot`, then granular `agent` / `log` / `task` / `decision` / `report` / `feed` / `goal` / `books` / `status` / `bubble` / `git` upserts.

## The receptionist (public chat, sandboxed by construction)

The front desk of the office has a person — **עמית / Amit**, the office representative. Click him and a conversation opens. (Measured note: the 3D figure and UI are Amit; the answering persona on the server side currently introduces itself as **נועה** — a naming mismatch tracked for unification.) His constraints are structural, not prompt-hopeful:

- The API route (`src/app/api/visitor-chat/route.ts`) persists conversation state to a local SQLite database via Prisma (`visitorSession`, `visitorMsg`, `clerkFact`, `visitorRequest`). It touches no socket and never exposes office state — but it is **not** stateless, and it does call out to two public GitHub raw URLs (5s timeout) for office context.
- Visitor messages are treated as **untrusted data** (injection-hardened system prompt, `trim()` + 2,000-char cap; full control-character stripping lives in the foreman's socket layer, not this route — tracked gap).
- Rate limited per-IP by an in-process token bucket (`src/lib/intent-gate.ts`: burst 20, refill 30 msgs/min) plus a cross-site `sec-fetch-site` gate. **Not yet implemented** (tracked debt): retries, a circuit breaker, and distributed rate-limit state. He cannot claim to control anything — because he cannot.

## Safety & privacy

- **Keys stay in your environment.** None are read from files, logged, or shipped. See `.env.example`.
- **The public repo contains only synthetic demo data.** Your `data/` directory is yours; keep it out of git (`.gitignore` already does).
- **Agents are read-mostly by design.** The built-in tools read books, measure, cross-check, and write reports — and every report persists durably via `office.ts#persistDurable` (the "opt-in persistence" note was stale). There is no shell and no filesystem-write tool; there are **two measured network tools** — `web_search` (Tavily) and `read_page` (Jina, with an SSRF guard). Extend carefully.
- **No public control surfaces.** The UI, the socket protocol and the HTTP API expose nothing that changes office state. See [SECURITY.md](SECURITY.md) for the full record.

## Cast

| Agent | Role | Owns |
|---|---|---|
| **אלוף / Aluf** | Chief of staff | planning, review, rescue |
| **גל / Gal** | Market operator | exchange & fills books |
| **ארז / Erez** | Internal auditor | audits & capability matrix |
| **תמר / Tamar** | Fleet economist | economics & sovereignty books |
| **שחר / Shachar** | Intelligence officer | indicators, census, learning |
| **ירדן / Yarden** | Infrastructure engineer | registry, schedulers, coord bus |

Each crew member has a distinct silhouette (cap, beanie, bun, hood, headphones) and color — the same desk always belongs to the same operator, and every nameplate carries the agent's live activity line.

## License

MIT — see [LICENSE](LICENSE).
