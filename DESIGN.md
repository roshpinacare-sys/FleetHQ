# FleetHQ — Design System: "Daylight Slate"

The single source of truth for FleetHQ's interface. Decided after the evidence audit
(`docs/fleethq-product-audit.md`) and the reference study (Linear, GitHub, Factory, n8n
on styles.refero.design). **One coherent language: Factory-grade operations surfaces,
Linear restraint, GitHub's developer clarity for git evidence.**

> ## 0. שיא הקידמה — what "the peak of progress" means here (owner directive, Task 51)
>
> The owner asked: *what is the peak of progress, so we can understand what we represent?*
> Answer, written as four testable laws — the office represents a **sovereign autonomous
> AI operations room**, and the world's real peak-of-progress rooms (mission control,
> trading floors, modern research HQs) share four measurable traits:
>
> 1. **Daylight honesty (אור = כנות).** Nothing hides in shadow. A dark room hides
>    information; a bright one *is* the information. Measured law: the office scene
>    must render at **mean luminance ≥ 85/255** in every architectural viewpoint
>    (Task 51 baseline: 22–35 — a noir club, replaced). Night only exists outside
>    the windows, as a deliberate scene choice — never as a rendering default.
> 2. **Living presence (נוכחות חיה).** Humans, not mannequins: textured skin that
>    keeps its texture (tints ≤ 0.35, never flat overwrites), hair that is hair
>    (the Wolf3D_Headwear→skin regex bug — measured, fixed), per-agent phase,
>    breathing/typing/walking bound to measured truth.
> 3. **Real-time digital twin.** Every pixel bound to measured truth (freshness law,
>    Task 46) — animation ≠ activity; the room shows the foreman's real state.
> 4. **Precision instruments.** The chrome stays an instrument: light surfaces,
>    hairlines, one accent, one status legend. The *place* is daylight; the
>    *instruments* are calm. Light theme is the default; the night palette remains
>    available as `html.dark` (next-themes, user's choice).
>
> These four are measurable — the Task 51 probe (`.probe/hq-probe.mjs`) records
> luminance/material/animation numbers before and after every visual change.

The office scene (2D + 3D) is a *place*: bright, clear, alive. Everything outside the
scene is an *instrument*: flat, calm, precise.

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
`src/components/hq/tokens.ts` for typed access. **Light is the default
(Task 51, Daylight Slate); the previous night palette lives under `html.dark`
(next-themes class strategy, header toggle).** Every value below is the light
default — the `.dark` block mirrors it with the original night values.

| Role | Token | Value (light default) | Usage |
|---|---|---|---|
| Canvas | `--bg` | `#f3f1ec` | page background (warm paper) |
| Surface-1 | `--surface` | `#ffffff` | panels |
| Surface-2 | `--surface-2` | `#ebe8e1` | nested rows, inputs |
| Surface-3 | `--surface-3` | `#e2ded4` | hover fills |
| Hairline | `--line` | `rgba(28,24,18,.11)` | all borders |
| Ink | `--ink` | `#201d18` | primary text |
| Ink-2 | `--ink-2` | `#57534a` | secondary text |
| Ink-3 | `--ink-3` | `#8b867b` | meta, timestamps |
| **Accent** | `--accent` | `#c94fbe` | interactive/active only (brand continuity, desaturated magenta) |
| Accent-dim | `--accent-dim` | `rgba(201,79,190,.12)` | active tab/row fill |

### Semantic status law (the ONE legend)

Values are the light-default set (darkened for light-surface contrast); the
night set keeps the original brighter hues.

| Semantic | Token | Light value | Means (across agents, tasks, goals, feed, health) |
|---|---|---|---|
| working | `--st-working` | `#a8741c` | running / doing / thinking / reading / writing / checking — real work in flight |
| ok | `--st-ok` | `#14855c` | done / resolved / verified / live-healthy |
| attention | `--st-attention` | `#b58216` | review / degraded / stale / waiting-on-operator |
| danger | `--st-danger` | `#cc423e` | blocked / error / broken |
| neutral | `--st-neutral` | `#716d64` | idle / queued / cancelled / disconnected |
| info | `--st-info` | `#6f62ab` | planning / metadata-only events |

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

## §10 — Animation truth & freshness law (Task 46)

The state→motion contract (§9a) is necessary but not sufficient: a loop that
keeps playing on a frozen snapshot is a lie. Two laws now bind the room:

**Freshness overlay** — `agentVisualFresh(state, fresh)`: the scene computes
`fresh = connected && now − lastSignalAt < ROOM_STALE_MS (75s, same window as
the console's metric bar)`. When fresh is false: no work animation, no one-shot
gestures, and every nameplate reads "truth stale — unknown" in attention amber.
A disconnected office looks disconnected — never productive.

**Lifecycle & resources** — each figure ticks its own movement brain per frame
(`brain.update(dtNav, dtAnim)`): navigation advances with wall-clock time
(capped 1s — the 0.05s render clamp divided walking speed ~25× at a low frame
rate), cosmetics keep the stability clamp. Navigation laws: same-destination
re-syncs never re-arm a walk; wall-station targets sit outside the collision
shell; step = min(speed·dt, remaining distance) — exact arrival at any frame
rate; an agent that stops closing distance for 1.5s stops honestly (stuck law)
instead of pacing forever. On unmount: materials disposed, mixer uncacheRoot,
gesture timers guarded. A broken scene asset trips the scene error boundary →
an honest failure panel, never a silent black canvas; a failed retarget falls
back to a calm procedural idle (presence, never work).

**Durable execution** — task records persist to `Domain/agents/office-tasks.json`
(atomic, scrubbed); a restart reconciles interrupted work honestly (requeued
with a recovery note, bounded attempts, parked for reconciliation at two
interruptions) and a single-flight floor lock (liveness = the process, not the
paper) keeps exactly one foreman dispatching. Every takeover and recovery
decision lands in the journal.

## §11 — Task 47 laws: human motion, honest furniture, sovereign runtime

**Motion laws (Gate A)**
1. **No axis or unit assumptions.** A rig's bone-local frames and armature
   scale are DATA, not conventions. All procedural poses are solved in world
   space from measured rest directions (`src/lib/hq/pose.ts`); hips targets
   are expressed along the parent-rotated local up-axis with a world/local
   ratio. Never write Euler guesses onto mixamorig bones (measured
   scarecrow result).
2. **Clip adaptation law.** Every foreign clip passes a name fix
   (`mixamorig:` → `mixamorig` — GLTFLoader sanitizes colons) and, for the
   hips translation track only, an axis remap when the source and target
   armature conventions differ (Xbot Y-up cm ↔ Michelle Z-up cm).
3. **Clean-template law.** The GLTF cache is shared between mounts and
   `retargetClip` does not restore the poses it samples. Bind pose is
   captured once per cached scene and restored before every clone,
   measurement, and retarget. A poisoned template poisons every agent.
4. **Wall-clock convergence.** Cosmetics may keep the render clamp for
   mixer stability, but any state that must CONVERGE (action weights,
   sit/work amounts, camera transitions) uses wall-clock exponential decay —
   stable at any dt. Measured otherwise: 30-second crossfades at ~1 fps.
5. **No synchronized chorus.** Every looping action starts at a
   deterministic per-agent phase (FNV-1a of id). Identical clips at equal
   weights with equal phases are a defect.
6. **Additive overlays, not weight fights.** Typing and breathing are
   additive clips over the base pose; the sit pose never "half-unfolds"
   because typing started.

**Furniture & space laws (Gate B)**
7. **A board is furniture.** Wall-mounted information surfaces have body
   depth, touch the wall, carry a title and a physical affordance (tray,
   clips), and are lit by the room (lit material + gentle emissive), never
   `meshBasicMaterial` slabs floating off the wall.
8. **One source of spatial truth.** Positions of recurring objects come from
   `contract.ts` constants shared by drawing, colliders, signage and camera
   presets. A local copy that drifts (the west-drawn library) is a defect
   class.
9. **Instanced meshes need explicit bounds** (`frustumCulled=false` for
   world-spread instances) — the default bounds come from the base geometry
   and silently hide everything (measured: books never visible).
10. **Sky/exterior planes live outside the walls.** A backdrop placed inside
    the room becomes a blurry wall that blocks cameras (measured: podium
    view).

**Runtime laws (Gate D/E)**
11. **The UI is a client.** The executor is owned by a detached
    session-leader supervisor (`tools/runtime-supervisor.ts`, PPID→1),
    never by the web server. The health endpoint plants it once and then
    only reports. Process liveness beats paperwork (signal-0).
12. **Durable state travels in git.** The scrubbed task state is mirrored
    into `receipts/` (committed by the lineage guard) and restored on
    cold boot with a journal entry. A gitignored directory is not durable
    storage.
13. **The foreman runs without --hot.** Recovery is a supervisor restart,
    not a hot reload (Task 45 lesson, now enforced by the spawner).
