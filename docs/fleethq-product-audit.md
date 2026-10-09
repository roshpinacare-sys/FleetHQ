# FleetHQ — Product Audit & UX Roast (Task 43)

**Date:** 2026-10-09 · **Auditor:** principal designer / staff engineer pass
**Scope:** the entire user-facing surface of the running FleetHQ repository at commit `84d6199` (branch `main`), inspected from source, wire protocol, and the live services (web :3000, foreman :3010 — both verified listening).
**Method:** read every UI component, the foreman service, the API routes, the CSS token layer, and the git history *before* forming any judgement. No finding below is speculation; each carries file references.

---

## 1. Verified product architecture

### 1.1 What FleetHQ actually is

A **single-page, Hebrew-first (RTL) live operations room** for an autonomous AI office. One route (`src/app/page.tsx` → `src/components/agent-hq/AgentHQ.tsx`, 851 lines) renders everything. There is no second page, no router navigation, no deep links.

Data truth chain (verified live):

| Layer | File | Reality |
|---|---|---|
| Foreman (crew service) | `mini-services/agent-hq/index.ts` (57 lines) | Real socket.io server on :3010. Instantiates `Office` from `./src/office` — **real LLM agents** working the real `Domain/` books. Public socket is **deliberately read-only** (no `goal:submit`, no `decision:answer` handlers — the security/autonomy law is written in the source). |
| Wire events | `src/components/agent-hq/types.ts` | `snapshot / agent / log / task / decision / report / feed / goal / books / status / git / bubble` — one truth stream. |
| UI socket | `AgentHQ.tsx` lines 271–373 | One socket to `/?XTransformPort=3010`, reconnection + self-heal via `fetch('/api/foreman/health')`. |
| 3D room bridge | `src/lib/hq/store.ts` (zustand) | The 3D room consumes the **same** socket events via `sync*` calls — no second socket, no local simulation. Clicks in the room drive the real panels through `bindUi`. |
| Health | `src/app/api/fleet-health/route.ts` → `StackHealth.tsx` | Polls every 30s; the endpoint re-verifies hash chains from disk on every call. Honest tones: green=measured ok, amber=absent/unreachable, red=broken. |
| Reception | `src/app/api/visitor-chat/route.ts` → `ReceptionChat.tsx` | Real LLM front desk, intentionally limited to public platform knowledge. |
| Demo mode | `AGENT_HQ_MODE=sim` | Clearly labeled everywhere (`demoCrew`, amber badge). Honesty mechanism is real. |

**Verdict on authenticity:** the backend is real, the wire is real, the health model is honest, and the sim/live distinction is enforced. This is *not* a demo pretending to be a product. The problem is entirely in the presentation layer (§3).

### 1.2 Surface inventory (all discovered screens/panels)

1. **Header** — crest SVG (breathing glow), animated aurora wordmark, connection chip, live/sim chip, goal progress ring chip, opsDone odometer, Jerusalem clock, language toggle.
2. **View switch** — `office` (3D WebGL room, default) / `network` (2D SVG atlas); plus "Amit · Reception" chat opener.
3. **3D office room** — `src/components/hq/*` (~2,400 lines: Architecture, Stations, Crew, Player, Atmosphere, MiniMap, Controls3D). WebGL-probed, falls back to the 2D SVG office (`Office.tsx`, 1,245 lines) when WebGL is unavailable.
4. **Network atlas** — `Network.tsx` (397 lines), districts/economy derived from real books.
5. **Flight HUD strip** — goal phase, progress bar, wall/reports/podium/opsDone counters (count-up + odometer), JourneyBar with a flying plane glyph and act numbering (I–IV).
6. **Autonomy line** — a banner declaring visitors have no control.
7. **Operations journal (feed)** — bounded 2-col scroll, newest-first.
8. **Side panel (400px) with 6 tabs** — monitor (agent log), wall (kanban), podium (decisions), library (reports), fleet (books), git (commit stream).
9. **Crew roster chips** — per-agent pill with state dot.
10. **StackHealth** — 15-cell grid of sovereign-stack health, the most honest component in the repo.
11. **Footer** — truth line + counters + LLM provider.
12. **Book preview modal** — hand-rolled fixed-position overlay.
13. **ReceptionChat drawer** — real LLM chat with stats disclosure.

Dead weight found: `src/app/api/route.ts` returns `{message:"Hello, world!"}`; `src/components/fleet-world/*` (~2,690 lines WorldCanvas/FleetWorld/MiniMap) has **no importer outside its own folder** (only its types are used by `api/world`); the Anton display font is loaded in `layout.tsx` but used nowhere.

### 1.3 Constraints that shape the redesign

- RTL Hebrew is primary; `dir` and logical properties are load-bearing (Task 41's "interface works inverted" fix must not regress).
- The public socket is read-only by law — no operator controls may be invented in the UI.
- The office (2D+3D) is the product's distinctive feature and the owner explicitly values it; it must be preserved and stay wired to the one-truth bridge.
- `prefers-reduced-motion` handling exists and must keep working.
- The office scene components consume ~18 `hq-*` CSS utilities (verified by grep); the CSS refactor must keep them alive.

---

## 2. UX Roast — honest, severity-ranked

### CRITICAL

**C1. The console looks like an arcade, not an operations instrument.**
Evidence: `AgentHQ.tsx` — `DustField` (90-particle animated canvas), three drifting blur blobs + film grain (`globals.css` .hq-blob/.hq-grain), aurora animated wordmark (.hq-aurora, 7s infinite gradient pan), breathing crest (.hq-breath), glitch flicker on every fresh commit, odometer digit strips, rAF count-up numbers, a **flying airplane emoji** on the JourneyBar with "act I/II/III/IV" theatrics, neon fuchsia edge-lights on every panel (.hq-glass::before), glow shadows on every hover.
Impact: exactly the failure mode the product brief bans — decorative effects that make a serious autonomous system read as a toy; sustained GPU/CSS animation cost for zero information.
Remedy: strip every non-informational animation from the console shell; keep motion only where it communicates state (office scene, live dots).

**C2. Wrong default: the WebGL office is the first screen; operational truth is secondary.**
Evidence: `AgentHQ.tsx` — `view` defaults to `'office'`; the 480–600px room occupies the hero slot; all operational data lives in a 400px aside.
Impact: a first-time operator cannot answer "what is the system doing right now?" without interpreting a spatial scene; on weak GPUs the first impression is a loading spinner.
Remedy: make a conventional operations overview the default; keep Office/Network as dedicated, one-click views (brief §6H).

### HIGH

**H1. Operational data is squeezed into a peephole.**
Evidence: `panels.tsx` — WallPanel renders a 6-column kanban inside ~368px of content width (columns ≈55px, titles truncate to 2 words); every panel ends in `max-h-96` scroll pens; the feed gets a 2-column grid inside the same pen.
Impact: the most important operational object (the task lifecycle) is illegible; excessive scrolling to see six cards.
Remedy: promote tasks, agents, git, decisions, reports to full-width page sections; the aside becomes a focused agent inspector.

**H2. Three incompatible status vocabularies, no single legend.**
Evidence: `types.ts` STATE_COLORS (10 agent states), `panels.tsx` COL_TEXT/COL_DOT (6 task states with a *different* mapping: doing=fuchsia vs agent writing=violet), `AgentHQ.tsx` FeedBadge (10 kinds, glyph-only, third palette).
Impact: an operator cannot learn one legend; "fuchsia" means thinking, in-work, message, user, and "new commit" depending on where you look.
Remedy: one semantic status law in `tokens.ts`, used by agent/task/goal/feed/health surfaces alike.

**H3. Zero vs unknown vs connecting are conflated.**
Evidence: `AgentHQ.tsx` `EMPTY_SNAPSHOT` renders opsDone=0, books=0, commits=0, crew=0 before the first socket event; a dead socket shows the same zeros as an empty system.
Impact: "is it broken or just empty?" is unanswerable — trust damage in a system whose whole value is truthful status.
Remedy: explicit unknown-state ("—", skeleton, connecting state) until the first snapshot; disconnected banner distinct from empty.

### MEDIUM

**M1. Header and HUD duplicate each other** (goal ring chip + JourneyBar + HUD counters + autonomy banner ×3 with the podium's 🔒 banner and the footer truth line). Redundant pixels compete with real data.
**M2. Accessibility gaps.** `layout.tsx` sets `maximumScale: 1` (blocks pinch zoom — WCAG 1.4.4); book preview modal has no focus trap/Escape (hand-rolled div); FeedBadge glyphs are unlabelled for screen readers.
**M3. Performance debt.** backdrop-blur(14px) on every panel + particles + blobs + WebGL room all simultaneously; no virtualization anywhere, but feed/log are capped (160) so the real cost is the decorative layer (see C1).
**M4. Typography noise.** `font-black` everywhere, uppercase + 0.18–0.3em tracking on labels, decorative section numbering 01–04; hierarchy is shouted, not structured.
**M5. Dead code ships in the bundle's repo hygiene** — `fleet-world` components (2,690 lines) unreferenced; `api/route.ts` hello-world; Anton font loaded-unused.

### LOW

**L1.** Time-ago strings re-implemented in 3 files (`panels.tsx`, `GitWire.tsx`, `Office.tsx` variants).
**L2.** View/tab state is not URL-addressable (refresh loses context) — acceptable for a console, noted for the future.
**L3.** `KIND_STYLE` log glyphs are cryptic single chars; fine for operators, needs tooltips someday.

### What is genuinely good (preserve, do not regress)

- One-truth socket → UI → 3D bridge (no duplicate reality).
- The read-only public socket law, written in code, not just policy.
- StackHealth's "absent/unreachable ≠ broken" honesty and disk re-verification.
- Sim-mode labeling discipline.
- RTL correctness via logical properties; Hebrew/English parity.
- The office as a product idea — with the crew sitting at desks, real logs on their screens.

---

## 3. Redesign direction (decision)

**Chosen language: "Ops Slate" — Factory-grade operations surfaces with Linear restraint.** Dark neutral base (the room lives in dark), one quiet accent retained from the existing brand (magenta family, desaturated, used only for interactive/active states and the single live-accent), semantic status colors doing all the remaining work. No gradients, no glow, no aurora, no particles, no blur-glass in the console; the office scene keeps its own atmosphere (it *is* the scene).

Full token/component law: see `DESIGN.md` (repo root).

---

# Second-Pass Audit (Task 44) — 2026-10-09, commit `424db77`

Method: re-read every surface after Task 43's redesign, then traced the data
contracts end-to-end (foreman spawn path → socket → UI → 3D bridge → health
endpoint → git sources). Verified live: foreman/gateway up, 7/7 sentinels,
all three hash chains ok at inspection time. Findings are ranked by trust
impact; each carries evidence and the correction that shipped (or the reason
it was deferred).

## What the first pass missed

**T1. CRITICAL — the cold-boot resurrection path boots a stale office.**
`vault/boot-sovereign.sh:217` runs `bash foreman/run-office.sh` from the repo
root. The root `foreman/` is a **pre-Task-42 diverged fork** of the live
foreman (`mini-services/agent-hq/`): no NVIDIA NIM brain (`llm.ts` diff), no
`fronthouse.ts` (the reception worker), manual-only vault unseal. After a
sandbox wipe, the office would resurrect with the old brain chain and no
reception. The runtime supervisor (`api/foreman/health/route.ts`) spawns the
canonical path — the two paths had silently diverged.
*Shipped:* boot-sovereign repointed to `mini-services/agent-hq/run-office.sh`;
stale `foreman/` fork removed (~2.8k lines); `auto-unseal.sh` candidate list
and README/protocol comments updated.

**T2. CRITICAL — Network Atlas: a legacy island with fabricated instruments.**
`Network.tsx` (post-Task-43) still renders the old arcade language: 90-point
star field (banned: particles), `feGaussianBlur` glow filters (banned: neon),
radial fuchsia/violet gradients, `#d946ef`/`#7c3aed` palettes outside the
semantic legend. Worse, the "HQ economy" meters are **mathematically fake**:
`pct = opsDone / Math.max(24, opsDone)` — the expression is ≥1 for any value
≥24, so production/circulation/knowledge bars sit pinned at ~100% regardless
of real activity. A meter that cannot move is false operational confidence.
*Shipped:* Network.tsx rewritten as an Ops Slate instrument — semantic token
colors (live=`--st-ok`, open=`--st-attention`, sealed=`--st-neutral` dashed,
accent=`--accent`), no particles/glow/gradients, meters rendered **only**
where a real ratio exists (fresh books / total, territory opened); absolute
counters render as plain mono numbers; per-district click now drills to that
book in the fleet registry (previously every click landed on the same section).

**T3. HIGH — FleetHQ git learning permanently disabled by a dead path.**
The supervisor exports `AGENT_HQ_FLEET_DIR=/home/z/my-project/fleethq`
(`api/foreman/health/route.ts`) but no `fleethq/` directory exists — the repo
lives at `/home/z/my-project`. Because the env is *set*, the `?? fallback`
never fires, `collectGitLearning` fails on the missing dir, and the office
brain permanently loses the "FleetHQ · קוד המשרד" learning source (fail-soft
swallows it — visible nowhere).
*Shipped:* env corrected to the real checkout path; the learning wire now
reads both real repositories.

**T4. HIGH — the health endpoint's boot-watcher report was compiled out.**
`bootWatcherState()` used `JSON.parse(...) as typeof idx` where control-flow
narrowing had already reduced `idx` to `null` → every field typed `never`
(8 tsc errors masked by `typescript.ignoreBuildErrors: true`). Runtime
behavior survived only because casts are erased. The truth endpoint for the
seventh sentinel did not type-check.
*Shipped:* explicit state type alias; plus tsconfig excludes for out-of-app
trees and `ignoreBuildErrors` flipped to `false` so the app tree can no
longer compile with hidden errors.

**T5. HIGH — a whole stale application ships inside the tree.**
`web/` is a full second copy of the pre-Task-43 UI (14,255 lines: old
AgentHQ, old Office, old STATE_COLORS palette), with its own package.json,
untouched since `6b63870`. Nothing builds, serves, or references it (verified:
no script/config/Caddy references), yet it sits inside the root tsconfig
`include: **/*.ts` and the lint sweep — a standing trap for agents and a
false palette source.
*Shipped:* removed after trace; the root app is the one app.

**T6. MEDIUM — `fleet-world` dead feature confirmed end-to-end.**
Traced beyond Task 43's note: the only entry component (`FleetWorld.tsx`) is
imported by nothing; its only data source (`/api/world`, 1,013 lines) serves
only that component; lib types/positions/i18n have no other consumers. The
complete dead family is **4,160 lines** (components + lib + route), plus the
`.fw-scroll` CSS.
*Shipped:* removed with evidence; `hq-*` scene utilities untouched.

**T7. MEDIUM — console freshness is asserted, not shown.**
The socket chip proves transport liveness only: if the foreman wedges with the
socket open, every instrument keeps rendering its last snapshot as if current,
and there is no "last update" anywhere. GitPulse already carries `lastFetch`
but the UI ignored it; the commit strip showed the 40-commit wire cap as an
absolute count.
*Shipped:* the console tracks the last real event timestamp and surfaces
"עודכן לפני X" next to the connection state, turning attention-colored when
the stream goes quiet; git evidence shows its fetch age; the commit counter is
labeled as "last 40".

**T8. MEDIUM — leftover type debt in the 3D room (Task 42 legacy).**
`Player.tsx` camera orbit accessed `orbit.current.*` on a flat object (3
errors); `Stations.tsx` lerped a boolean ref and called a nonexistent
`setChatOpen` bridge method (podium ring animation + reception click were
half-wired); `Architecture.tsx` fed `number[]` to `boxGeometry` tuple args;
`contract.ts` typed `STATION_NAV` as coordinate tuples while holding scalars;
`textures.ts` rejected the documented optional `goal` field.
*Shipped:* all fixed at the contract level (no suppressions); reception click
from the 3D room verified against `store.setPanel('reception')` → `ui.openChat`.

**T9. LOW — console drift leftovers.** ReceptionChat still wore the old
fuchsia gradients/glow/zinc palette (it is a console surface, not the scene);
the 3D minimap wrapper used raw amber + heavy shadow; `api/route.ts` served a
hello-world; Heebo weight 800 was loaded with no console consumer; the
autonomy banner and odometers from the first audit stayed gone (no
regression). *Shipped:* all tokenized/removed.

## Deferred, with reasons

- **Production build cannot run in this environment.** The platform law
  reserves the sandbox for the auto dev server on :3000 and forbids
  `bun run build`; the dev server owns `.next/`, and Task 40 proved a build
  window can corrupt it (kill-test lesson). Strongest valid substitute
  executed: full `tsc --noEmit` over the app tree (clean after T4/T8), eslint
  clean, dev-compile + live runtime probes through the gateway. The
  `ignoreBuildErrors:false` flip means the next legitimate production build
  enforces the same gate automatically.
- **Task state persistence / crash recovery of mid-flight tasks** remains a
  foreman-architecture question (in-memory Office state, restart = re-plan).
  The honest UI already labels this (socket-down ≠ empty), and StackHealth
  distinguishes alive/stale/down. Real remediation (persisting task journals
  across restarts) needs a design decision in the foreman; out of scope for a
  safe incremental pass — documented as prerequisite work, not hidden.

## Validation record (Task 44)

- `bun run lint` — clean (exit 0).
- `bunx tsc --noEmit` — app tree clean (was 26 error lines in scope; 90
  including vendored trees now excluded by explicit tsconfig boundaries).
- Live socket smoke through the foreman: snapshot/agent/task/feed events
  observed; crew, books, git wire present (recorded in worklog).
- Runtime probes: `/api/foreman/health` 7/7 sentinels; `/api/fleet-health`
  all_ok with chains re-verified; gateway /health provider table live.
- Dead-code removals verified by pre/post grep: zero remaining imports.

---

## Task 45 — security boundary audit (45-c)

**תאריך:** 2026-10-09 · **תחום:** "שום סוד לא עובר דרך המשרד" — ביקורת נתיבי-חשיפה אמיתיים, תיקון בגבולות-הנתונים (לא מיסוך-קוסמטי), ורגרסיה-חוזרת עם קרדנשלים-סינתטיים.
**שיטה:** כל נתיב נבדק מהקוד בפועל (קריאה מלאה של gitpulse/gitlearn/office/llm/fronthouse/index + כל-ה-routes תחת `src/app/api/**` + פרובות-חי מול :3000). אין-כאן ממצא ספקולטיבי; לכל-פסק צרוף מקור.

### גבולות-האמון (trust boundaries)

```
דפדפן ⇄ Caddy :81 ⇄ Next :3000 (API + /v1-proxy + socket-bridge XTransformPort→3010)
        ⇄ פורמן :3010 (Office — המשרד) ⇄ שער-ריבונות :3011 ⇄ ספקי-LLM חיצוניים (~46 סלוטים)
גיט (Domain + FleetHQ — נתוני-עבודה ומטא-דאטה) · כספת (vault/*.enc + .env) · /tmp (דגל-קבלה)
```

### מחלקות-נתונים

| מחלקה | דוגמאות | חוק |
|---|---|---|
| חומר-ממשק ציבורי | אירועי-wire (log/bubble/feed/task/decision/report/goal/agent), snapshot, נושאי-קומיטים, מטא-דאטה של ספרים | חוצה לדפדפן — חייב שער (scrub+strip) בגבול |
| רנטיים-מוגבל | מפתחות-ספקים ב-env, כספת, תוכן-גלמי של קבצי-סודות, כתובות-origin עם טוקן מוטמע | לעולם לא יוצא לדפדפן/מודל/יומן בטקסט פתוח |
| חומר-משרד (לא-סוד אך לא-ציבור) | תוכן ספרי-Domain | למודל — דרך שער; לדפדפן — מטא-דאטה בלבד |

### נתיבי-חשיפה שנבדקו — פסקים

| # | נתיב | ממצא | פסק |
|---|---|---|---|
| 1 | נושאי/מחברי-קומיטים → ממשק-ציבורי (gitpulse.ts) | `fetchCommits` בנה CommitView מ-gitalog **גלמי** — בלי scrubSecrets/stripControl (בניגוד ל-gitlearn.ts:90). מחרוזת-דמוי-מפתח בהיסטוריית-הריפו הציבורי הייתה מגיעה לפיד ולסנאפשוט ללא-צנזורה | **תוקן בגבול** — `toCommitView`/`sanitizeCommitField` (gitpulse.ts:52-70): scrub+strip **לפני** שה-CommitView נוצר; כל-הצרכנים (pulse/snapshot/פיד) יורשים |
| 2 | גבול-ה-emit של המשרד → סוקט | bubble (office.ts:502) · log (476) · feed (507) · task (517) · decision (560) · report (591) · goal · activity · books.verdict — **גלמיים** אל הדפדפן; מקורות: פלט-מודל, הודעות-שגיאת-ספק, תוכן-ספרים | **תוקן בגבול** — `sanitizeEmitPayload` (office.ts:214-282) עוטף את `emit` בבנאי + `snapshot()` מסונן באותן-פונקציות (office.ts:685-711); `sanitizePublicText` (security.ts:50) — חוק-אחת במקום-אחד, בלי קריסת-רווחים שתשחית תוכן רגיל |
| 3 | יציאה לספקי-LLM (prompt) | תוצרי כלים `read_book/measure/cross_check` (תוכן-ספרים = נתון-חוץ לפי הדוקטרינה) נכנסו לקונטקסט המודל **ללא שער** (office.ts execTool) | **תוקן בגבול** — scrubSecrets על שלושת-התוצרים לפני ההיסטוריה/הלוג (office.ts:1160-1196). ה-digest של gitlearn כבר מנוקה-מקור (gitlearn.ts:90 + רשימת-היתר :51) |
| 4 | קבלה (visitor-chat) → ספקים | רק-ידע-ציבורי-קבוע (route.ts:39-68) + ספירות-מותרות-מספריות (411-433) + היסטוריית-מבקר מטוהרת; אין תוכן-ספרים/דיגסט-למידה בנתיב; שגיאות-גנריות (568-570) | **אומת בטוח** |
| 5 | routes תחת `src/app/api/**` | `/api/foreman/health` — בוליאנים+מחרוזות-קצרות בלבד; `/api/fleet-health` — קבצי-מצב-בריאות בלבד; אפס-הד-של process.env (env נקרא רק לשימוש-צד-שרת); שגיאות-גנריות | **אומת בטוח** |
| 6 | `git remote -v` / origin-URLs עם טוקן | אפס-קריאות `remote -v/get-url/ls-remote` בקוד-ריצה (rg: 0); lineage-guard רושם `origin` כ-**SHA-קצר** בלבד ומצהיר "never echoes URLs — the remote may embed creds" (lineage-guard.ts:83,449-452); fronthouse מוריד GITHUB_PAT מ-env של שכבת-הווב (fronthouse.ts:61) | **אומת בטוח** |
| 7 | יומן-המשרד (journal) + לקחים/יעדים | כבר מטוהרים-מקור (office.ts:365-368,436,480,530,642,875,892,1380) | **אומת בטוח** |

### מנגנון-הרגרסיה הסינתטי

**`tools/security-regression.ts`** (Bun, ללא-תלות, סגנון smoke-truth): שישה-סעיפים על 50 טענות —
(A) כל-קרדנשל-סינתטי (`ghp_0000…fake`, `sk-0000fake…` בן-32, `AKIA0000000000000FAKE`, `xai-0000fake…`, `password=hunter2fake123`, `Bearer faketoken…`) נמחק **מלואו** ב-scrubSecrets וב-sanitizePublicText ·
(B) `isSensitivePath` מפיל .env/vault/keys/pem/id_rsa/upload/.git ומשאיר נתיבי-עבודה רגילים ·
(C) stripControl הורג הזרקת-תווי-בקרה בלי לפגוע בטקסט נראה ·
(D) גבול-הקומיט של gitpulse — נושא עם מפתח-פיקטיבי יוצא «redacted», נושא עברי רגיל עובר שלם ·
(E) גבול-ה-emit של המשרד — bubble/task/log/report/git מנוקים, id/status/מערכים ושורות-חדשות נשארים תקינים (העדר-שחיתות) ·
(F) פרובות-חי מול `/api/foreman/health` ו-`/api/fleet-health`: אפס-הד של הסינתטיים ואפס-מופעים של הסמנים הגנריים (`sk-`, `ghp_`, `github_pat_`, `xoxb-`, `BEGIN RSA PRIVATE KEY`, `AKIA`). על-כישלון: שם-הסמן ומספר-בלבד — **גוף-התשובה אף-פעם לא נדפס**.
מדידה-חיה בשעת-הביקורת: **50/50 ירוק, exit 0** (רץ שוב אחרי-כל-שינוי — `bun run tools/security-regression.ts`).

### סיכונים-שיוריים (בכנות)

1. **`book:preview` (mini-services/agent-hq/index.ts:44-48)** — ה-handler שולח `excerptBook(id, 2400)` **גלמי** לכל-לקוח-סוקט דרך ack, מחוץ לגבול-ה-emit של Office. הקובץ מחוץ לתחום-הבעלות-של-45-c → **דווח למתאם**: תיקון-שורה-אחת (`scrubSecrets(ex)` ב-ack) או העברת-הקריאה דרך השער. זהו-הפער-היחיד-הידוע שנותר.
2. **כל-מה שכבר נשלח ללקוח נבדק-ב-devtools** — לכן-החוק-היא מזעור-צד-שרת: שום-סוד לא נשלח (מוכח-שלילית ב-F), ומה שנשלח הוא-ציבורי-מעצם-הגדרה.
3. **הספקים מקבלים תוכן-מנוקה-אך-לא-אנונימי** — תוכן-ספרים/נגזרות-משימות הוא-נתון-המשרד ונשלח לעשרות-מוחות-חיצוניים-מעצם-העיצוב; השער עוצר מחרוזות-דמוי-מפתח, לא-דלף-עסקי-כללי. שיורי-מעצב.
4. **scrubSecrets הוא דפוסי** — סוד-בצורה-חדשה (קידומת-פרטית) יעבור; הרובד-השני (הפלת-נתיבים-רגישים + רשימת-היתר) הוא-הגנה-ההדדית. רצפת `sk-` היא 28 תווים (מכוון — מניעת-הפעלות-שקר; תועד ב-script).
5. **גישה-פיזית/לסנדבוקס** — process.env, /tmp ו-dev.log נמצאים-בתוך-גבול-האמון; פשרת-הסנדבוקס = פשרה-מלאה (החוק-הקיים: הגיט הוא-הגוף, הסנדבוקס בן-תמותה).
6. **הפורמן-החי עדיין-על-הקוד-הקודם** — עד-הריסטארט-המתואם-של-המתאם; ה-emit-wrap/גבול-הקומיט נכנסים-לחיות-רק-אז (הוכחת-הקוד: רגרסיה-50/50 על-המודולים-עצמם).

## Task 45 — visual red-team & operational reality (before/after, measured)

**Before-state evidence (headless probe + screenshots through the gateway):** the
office canvas rendered nothing while the wire was healthy — the scene mounted
(445 meshes, camera sane) but the automatic loop drew 1 triangle/frame for
minutes on software GL (100 shader programs compiled async under 28 lights ×
post-processing). A first-visit operator on a weak GPU saw a **silent black
void with zero feedback**. The game layer (player avatar, WASD/sprint/first-
person, touch joystick + run button, click-to-walk floor, player-centric
minimap) sat on top of an operational room. Network Atlas rendered raw float
ages (`0.0076766666666667h`) on every district. `waiting_user`/`blocked`/`error`
shared one rose color — three meanings, one look.

**Shipped corrections (root causes, not patches):**

- **Game layer removed at the root.** `Player.tsx`, `Controls3D.tsx`
  (joystick+run), `MiniMap.tsx` deleted; `world.ts` lost the Player class and
  game input entirely. Replaced by `CameraDirector` (orbit/zoom presets,
  room-clamped, reduced-motion aware) + `ViewDeck` (7 keyboard-accessible
  presets bound to real zones, `aria-pressed`, 1–7/Esc, honest room status).
  Click-to-inspect and the panel bridge are intact (verified live: preset
  switch, Escape-return, camera math).
- **Honest room readiness** (`RoomReadiness` → store `roomReady`): the veil
  "החדר בהכנה…" is driven by the first genuinely composed frame (renderer
  draw-calls), killing the silent-black-void failure mode.
- **Graphics quality by restraint, not effects:** lighting 28→5 fixtures
  (emissive materials replace local point lights; one moon + one warm spot
  cast shadows), native MSAA replaced Bloom/Vignette/Grain/FXAA, dust/sparks/
  halo/shafts/hologram-rings removed, pulsing git-frame calmed, flame kept as
  the office's restrained symbol (no cast-shadow point light, no halo).
- **Visual state contract** (`world.ts → agentVisual`): one deterministic map
  from the foreman's states to pose/work-anim/gesture; work animation only for
  real working states; `waiting_user` re-toned to attention (amber) across
  scene + console (STATE_COLORS + AGENT_SEMANTIC) — waiting is not failure.
- **Network Atlas ages humanized** (`fmtAge`): minutes/hours/days in Hebrew/
  English instead of raw float hours, in labels, titles and aria-labels.
- **Git fleet inventory (45-b):** read-only per-repo truth (branch, head,
  ahead/behind, dirty, last-fetch, sanitized errors; sync-state law with
  explicit unknown) on the wire + in GitEvidencePanel; verified live
  (probe JSON in worklog; UI renders "שינויים מקומיים" honestly).
- **Security boundary hardening (45-c):** one emit-boundary law
  (`sanitizeEmitPayload` + `sanitizePublicText`), commit subjects/authors
  scrubbed at gitpulse, book:preview excerpt gated, read_book/measure/
  cross_check model-context scrubbed; 50/50 synthetic-credential regression
  suite green (tools/security-regression.ts); threat model documented below.
- **Live-foreman resurrection finding:** after many `bun --hot` reloads across
  edits, the long-lived foreman process stopped emitting (0 events in 70s
  while snapshots — sent outside the office emit path — still flowed). The
  supervisor chain re-spawned duplicates that lost the port race. Precise kill
  of all three `bun --hot index.ts` processes → clean single respawn →
  smoke-truth ALL GREEN (heartbeat included) + fleet on the wire. Lesson: the
  foreman should not be trusted across hot reloads; restart is the recovery.

**Validation record (Task 45):** `bunx tsc --noEmit` 0 errors · eslint clean ·
smoke-truth 11/11 green against the live foreman · security-regression 50/50 ·
gitfleet-probe truthful (dirty=churn, honest) · browser: ops/network/git/mobile
screenshots before+after with zero console errors; office verified rendering
with crew, nameplates, preset navigation and honest status (software-GL
compile-storm limits frame-rate in the probe environment — a documented
limitation, not a product defect; real-GPU rendering was verified in Task 43).

**Deferred, with reasons:** production build remains forbidden by the platform
(dev-only :3000 law; `ignoreBuildErrors:false` keeps the gate armed for the
first legitimate build). Task-state persistence across foreman restarts
remains prerequisite foreman-architecture work (unchanged from Task 44).
