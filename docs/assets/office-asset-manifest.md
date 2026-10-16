# Office asset manifest — מלאי-הנכסים של החדר התלת-מימדי

> Task 47 (Phase 2). The office is **fully self-contained**: every runtime
> asset ships inside this repository under `public/models/`. No essential
> content is fetched from a third-party URL at page load — the room renders
> with zero external network dependency (measured: the whole scene loads from
> the app origin only). All environment materials (wood, concrete, marble,
> fabric, carpet, brushed metal, skyline, screens, nameplates) are generated
> procedurally in `src/lib/hq/textures.ts` — no texture downloads at all.

## Characters — `public/models/humans/`

| File | Size | sha256 (16) | Rig | Clips embedded | Used for |
|---|---|---|---|---|---|
| `Xbot.glb` | 2.93 MB | `002f8d269de68e5d` | mixamorig (67 joints) | 7: `agree`, `headShake`, `idle`, `run`, `sad_pose`, `sneak_pose`, `walk` | **Animation source only** — never rendered |
| `Michelle.glb` | 3.28 MB | `7a87e15a99ccbc5e` | mixamorig (65 joints) | 2: `SambaDance`, `TPose` (neither used) | Female crew (tamar, shachar) |
| `readyplayer.me.glb` | 1.84 MB | `b69cec7a5cc7dc7e` | Wolf3D / mixamo-compatible (67 joints, no `mixamorig:` prefix) | **0 clips**; morph targets `mouthOpen`, `mouthSmile` | Male crew (aluf, gal, erez, yarden) |

### Verified facts (measured, not assumed — GLB JSON parsed + live probes)

- **Xbot.glb is the animation library.** Its `idle`/`walk`/`run`/`agree`/
  `headShake` clips are used for both rigs: directly for Michelle (same
  mixamorig rig) and via `SkeletonUtils.retargetClip` for the RPM avatar.
  `sad_pose`/`sneak_pose` are unused.
- **Michelle.glb has no usable motion clips** (Samba/TPose only); everything
  she plays is Xbot-sourced or procedural.
- **readyplayer.me.glb has no embedded animation at all.** A bare retarget
  target with photoreal head textures.
- **Node-name sanitization law (Task 47 root-cause):** GLTFLoader strips `:`
  from node names — Michelle's live bones are `mixamorigHips` (no colon)
  while Xbot clip tracks target `mixamorig:Hips`. Raw clips therefore bind to
  NOTHING on her (she stood in a frozen T-pose — measured via live bone
  quaternions ≈ identity and `PropertyBinding: No target node found`
  warnings). Every clip adapted for her passes through the
  `mixamorig:` → `mixamorig` rename in `Crew.tsx` (`dropMissingBones`).
- **Sitting/typing/breathing are procedural**, built by the rig-agnostic
  world-space pose solver (`src/lib/hq/pose.ts`) — no third-party sit/type
  clips are shipped, so no additional license obligations apply.

## Provenance & licensing (honest record)

- `Xbot.glb` and `Michelle.glb` are the standard example characters
  distributed with three.js / React-three-fiber ecosystems ("X Bot" and
  "Michelle" — Mixamo-exported GLB fixtures that ship inside the three.js
  example asset set). They entered this repository with the office's 3D
  layer (pre-Task-42) and are treated as build fixtures of the rendering
  stack they target. Mixamo's terms allow using rendered output in projects;
  **raw redistribution terms for Mixamo-sourced files are restricted** — the
  record here is explicit: these two files are legacy fixtures already in the
  repo; **no NEW Mixamo downloads were added** in Task 47 (the
  network-restricted sandbox cannot fetch them either — honestly documented
  instead of silently substituted).
- `readyplayer.me.glb` is a Ready Player Me avatar export (Wolf3D). RPM's
  terms permit using an exported avatar in applications; it is used here as
  the operator-facing body of four crew members.
- **Poly Haven / ambientCG evaluation (Task 47 Phase 2):** the CC0 libraries
  were assessed for office materials and furniture. The sandbox's network
  egress blocks polyhaven.com / ambientcg.com downloads, and every material
  the room actually needed (flooring, walls, wood, metal, marble, fabric,
  carpet, glass) already renders from deterministic procedural generators —
  adding third-party texture payloads would grow the bundle without a
  measured defect to fix. Decision: **no external assets adopted**; the
  procedural pipeline is the documented, repeatable asset pipeline. If a
  future task adopts CC0 assets, the required structure is
  `public/assets/office/{furniture,materials,environment}/` + one manifest
  row per asset (source URL, license, format, conversion step).

## Runtime rules

1. All character/motion content loads from this repo only. The office must
   render with external asset sites unreachable.
2. Animation-source and render-target models are separate files; a corrupted
   animation source must degrade to the procedural fallback
   (`idleProc`/`breathe`), never to a frozen T-pose.
3. Any new third-party asset must arrive with a manifest row here (source,
   license, local path, sha256, conversion) and must not be fetched at
   runtime from a third-party host.
