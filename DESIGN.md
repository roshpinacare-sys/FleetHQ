# FleetHQ — Design System: "Ops Slate"

The single source of truth for FleetHQ's interface. Decided after the evidence audit
(`docs/fleethq-product-audit.md`) and the reference study (Linear, GitHub, Factory, n8n
on styles.refero.design). **One coherent language: Factory-grade operations surfaces,
Linear restraint, GitHub's developer clarity for git evidence.**

The office scene (2D + 3D) keeps its own theatrical atmosphere — it is a *place*.
Everything outside the scene is an *instrument*: flat, calm, precise.

---

## 1. Principles

1. **Information is the decoration.** If an effect carries no state, it ships nowhere.
2. **Calm by default, unmistakable on intervention.** Green-tinted quiet; red only for
   real failure; amber for degradation; never neon.
3. **One status legend.** The same semantic colors mean the same thing everywhere.
4. **Zero ≠ unknown.** Before the first snapshot, instruments read `—` (unknown), not 0.
5. **RTL is load-bearing.** Logical properties only (`ms/me/ps/pe/inset-inline-*`).
6. **Honesty is a feature.** Sim mode is labeled; unavailable ≠ absent ≠ empty; the
   public socket stays read-only — no invented controls.

## 2. Color tokens

Defined in `src/app/globals.css` as CSS custom properties; mirrored in
`src/components/hq/tokens.ts` for typed access.

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--bg` | `#0b0b0e` | page background |
| Surface-1 | `--surface` | `#131318` | panels |
| Surface-2 | `--surface-2` | `#1a1a21` | nested rows, inputs |
| Hairline | `--line` | `rgba(255,255,255,.08)` | all borders |
| Ink | `--ink` | `#e6e6ea` | primary text |
| Ink-2 | `--ink-2` | `#a1a1ab` | secondary text |
| Ink-3 | `--ink-3` | `#6b6b76` | meta, timestamps |
| **Accent** | `--accent` | `#e05fd0` | interactive/active only (brand continuity, desaturated magenta) |
| Accent-dim | `--accent-dim` | `rgba(224,95,208,.14)` | active tab/row fill |

### Semantic status law (the ONE legend)

| Semantic | Token | Value | Means (across agents, tasks, goals, feed, health) |
|---|---|---|---|
| working | `--st-working` | `#d9a441` | running / doing / thinking / reading / writing / checking — real work in flight |
| ok | `--st-ok` | `#46c98a` | done / resolved / verified / live-healthy |
| attention | `--st-attention` | `#e0b34d` | review / degraded / stale / waiting-on-operator |
| danger | `--st-danger` | `#e5615e` | blocked / error / broken |
| neutral | `--st-neutral` | `#8a8a95` | idle / queued / cancelled / disconnected |
| info | `--st-info` | `#9a8ec8` | planning / metadata-only events |

Agent-state → semantic mapping (written once in `tokens.ts`):
`thinking/reading/checking/writing → working` · `idle → neutral` · `walking → neutral` ·
`waiting_user/blocked → danger` · `done → ok` · `error → danger`.
Task-status: `todo → neutral` · `doing → working` · `review → attention` ·
`done → ok` · `blocked → danger` · `cancelled → neutral`.
Goal-status: `planning → info` · `active → working` · `review → attention` ·
`done → ok` · `failed → danger`.

**Forbidden anywhere in the console:** blue/indigo, gold glow, neon shadows, animated
gradients, particles, film grain, aurora text, glitch flickers, odometers, count-up
tickers, flying mascots.

## 3. Typography

- **Heebo** — everything (Hebrew-first, loaded in `layout.tsx`). Weights: 400/500/600/700.
  No `font-black`, no uppercase tracking wider than `0.08em`, no display faces.
- **JetBrains Mono** — hashes, timestamps, numeric readouts, log lines (`font-mono`).
- Scale: page title 18/700 · section title 15/600 · body 14/400 · data 13/400 ·
  meta 12/400 · micro-label 11/600 (`+0.06em`).
- Line heights: 1.5 body, 1.3 headings.

## 4. Space, radius, elevation

- Spacing on the 4px grid; panel padding 16px; section gap 24px.
- Radius: `--r-panel: 12px` (panels) · `--r-row: 8px` (rows/inputs/chips) · full (pills only).
- Elevation: **borders, not shadows.** One shadow allowed: `0 1px 2px rgba(0,0,0,.4)` on
  floating layers (dialogs). No glow, ever.
- Scroll areas: `max-h` + `overflow-y-auto` + `.sl-scroll` thin neutral scrollbar.

## 5. Components (law)

- **Panel** `.sl-panel`: surface-1, 1px hairline, r-12. Optional `.sl-panel-head`
  (title + meta + actions, 12px padding, hairline bottom).
- **Chip** `.sl-chip`: pill, surface-2, hairline, 12px text. Status chips add a 6px
  semantic dot. Never animated.
- **Button**: `.sl-btn` (surface-2, hairline, ink) · `.sl-btn-accent` (accent fill,
  #14060f ink) · `.sl-btn-ghost` (transparent). Min-height 40px (44 on touch targets),
  focus-visible: 2px accent ring, radius follows token.
- **Tabs/segments**: flat underline-style `.sl-seg` — active = ink text + 2px accent
  underline; inactive = ink-2. No pill glow.
- **Table/rows**: hairline-separated rows, hover `rgba(255,255,255,.03)`, 13px data,
  12px meta columns; mono for hashes/numbers.
- **Status dot** `.sl-dot`: 6–8px circle, semantic token, optional 1.5s opacity pulse
  *only* for live connection.
- **Dialog/drawer**: shadcn primitives (Dialog/Sheet) with token styles; Escape and
  focus trap are non-negotiable.
- **Empty/unknown/down states**: `.sl-empty` — ink-3 text + one honest sentence +
  the most useful next action. Unknown value renders `—`, never 0.
- **Alert strip** `.sl-alerts`: exists only when there is something needing attention
  (blocked tasks, open decisions, errors, disconnected). Calm page otherwise.

## 6. Motion law

- Console: transitions ≤160ms on color/border/opacity only. No entrance animations,
  no springs, no blur-fades.
- Allowed loops: connection pulse (2s), office scene life (its own law),
  `prefers-reduced-motion` honored globally (already enforced).

## 7. Layout law

- **Default view: Operations.** Command bar → alerts (conditional) → status strip →
  two-column main (tasks+activity | crew/decisions/reports) → git evidence → stack health.
- **Office** and **Network** are dedicated views in the same shell (one click, preserved
  bridge: 3D clicks drive real panels; WebGL falls back to the 2D office).
- Mobile: single column; kanban columns become horizontal scroll rows of full-width
  cards (never 55px peepholes).

## 8. Reference debts consciously accepted

- ~~Time-ago duplicated in 3 files~~ **resolved (Task 44):** one `timeAgo` helper
  in `panels.tsx`; GitWire, AgentHQ and the inspector all consume it.
- ~~`fleet-world/*` dead code~~ **resolved (Task 44):** the complete family
  (components + lib + `/api/world`, 4,160 lines) removed after import tracing;
  the stale `web/` app fork (14,255 lines) and the stale root `foreman/` fork
  (2.8k lines) removed with it. The root app is the one app.
- **Network Atlas is a console instrument (Task 44):** it renders with the same
  semantic tokens as every other surface; the only motion is the real
  connection pulse. Its spatial model (freshness orbits) is retained because
  it encodes measured book freshness, not spectacle.
- The office scene (2D + 3D) keeps its scene-space palette by design
  (`STATE_COLORS` / `TASK_COL` live in `types.ts` / `lib/hq/protocol.ts`);
  the *console* never imports them — colors come from `tokens.ts` semantics.

## 9. The office camera law (Task 45 — professional spatial interface)

The 3D office is navigated like an architectural-visualization instrument, not a
game. The player/avatar layer was removed at the root (no WASD, no sprint, no
first-person, no joystick, no click-to-walk, no player-centric minimap).

- **Camera presets** (`contract.ts → CAMERA_PRESETS`): Overview · Crew desks ·
  Task board · Git wall · Decisions podium · Library · Reception — each a
  deliberate interior composition of a zone that actually exists in the plan.
- **Direct manipulation**: drag = predictable orbit around the current look
  point (pitch clamped above the floor), wheel/pinch = distance within the
  preset's bounds; the camera never leaves the room (clamped to walls).
- **Click-to-inspect** is preserved: clicking an agent/station focuses the
  camera (room-center framing) and opens the real console panel via the
  established `setPanel` bridge. `Esc` returns to Overview.
- **Keyboard**: preset buttons are real focusable controls (`aria-pressed`),
  digits 1–7 select presets, `Esc` = overview. `prefers-reduced-motion`
  makes camera transitions instant.
- **Honest readiness**: `RoomReadiness` measures the first genuinely composed
  frame (renderer draw-calls) — until then the room shows "החדר בהכנה…" rather
  than a silent black canvas (weak/software GL can take a while to compile).

### 9a. Activity-to-visual contract (deterministic)

One function, `world.ts → agentVisual(AgentState)`, is the single mapping from
the foreman's real states to the scene's visuals — consumed by Crew, the desk
glow and the brain. No other component invents behavior:

| AgentState (wire)        | pose | work anim | gesture | nameplate tone       |
|--------------------------|------|-----------|---------|----------------------|
| reading/checking/writing/thinking | sit | yes | — | working (agent color) |
| idle                     | sit  | no        | —       | neutral              |
| walking                  | stand| no        | —       | neutral              |
| waiting_user             | sit  | no        | —       | attention (amber)    |
| blocked                  | sit  | no        | —       | danger (rose)        |
| done                     | sit  | no        | agree   | ok                   |
| error                    | sit  | no        | headShake | danger             |

Motion never implies productivity the wire does not report: a waiting agent is
visually calm, a blocked agent carries no work animation, and station changes
follow the foreman's `station` field. Decorative motion (dust, sparks, halo,
pulsing frames, rotating hologram rings, volumetric shafts, bloom/grain) was
removed; lighting was consolidated 28→5 fixtures (emissive materials replace
local point lights), native MSAA replaced the post-processing chain.
