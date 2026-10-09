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
