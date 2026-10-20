import io, os
PATH = '/home/z/my-project/worklog.md'
MARKER = 'Task ID: 12-office-3d-flagship'
entry = """
---
Task ID: 12-office-3d-flagship
Agent: main (T12, owner mandate: the 3D office must LEAD — live on the page, real data, everything else keeps running)

Work Log:
- RECON (md5-stamped): user's 3D office located in FleetHQ src/components/hq/* + src/lib/hq/*
  (Office3D/Room3D/Architecture/Stations/Crew/CameraDirector/Atmosphere/ViewDeck + contract/
  store/world/pose/textures/protocol, ~200KB R3F). Domain office went up WITHOUT it (zai-sec's
  data-hero at 19:30Z); models exist in FleetHQ public/models/humans (3 GLBs, sizes verified).
- LOCAL FLAGSHIP (sandbox port 3000): installed three@0.186.1 + @react-three/fiber@9.8.1 +
  @react-three/drei@10.7.9; ported full hq stack; GLBs copied byte-exact (3276888/2930032/1838884).
- TRUTH BRIDGE (anti-forgery law): NEW /api/office-state aggregates REAL public sources (keyless):
  FleetHQ office-state.json (foreman crew/tasks/feed — aluf: error at wall, REAL), Domain office/
  data.json (verdict ALIVE + artery checks), sovereign-beacon state.json (treasury 2925.6 SP,
  steemHead 110355031), FleetHQ commits ATOM feed (keyless — api.github.com 403 rate-limited;
  regex fixed for Grit::Commit/<sha>). 60s/180s memory cache, fail-soft, honest degradation.
  Client bridge (45s poll) feeds the store contract: syncSnapshot/syncGit/syncBubble/setTruth/
  syncConnected. ZERO simulation — if source fails the room says disconnected.
- IMPROVEMENTS (significant, measured): (1) reception preset re-shot — welcome screen now READS
  (old NE angle photographed the screen's back; new SE visitor angle shows LIVE · 109 tasks ·
  2,925.6 SP · 9/11 arteries · ALIVE); (2) TruthChip (source + age, stale>=30min flagged, no fake
  green); (3) cinematic idle drift after 25s (reduced-motion safe, any input stops it); (4)
  mobile-adaptive canvas (<=820px or <=4 cores: dpr .75-1.25, no shadows, no AA); (5) preset deck
  horizontal-scroll + hierarchy on mobile (nav above chip, RoomStatus desktop-only); (6) canvas
  height fix (h-[100dvh] definite chain — canvas was 150px default); (7) office theme vars
  (daylight law, warm amber accent, NO blue) + sl-dot/sl-chip + custom scrollbars.
- VERIFIED IN BROWSER (agent-browser): page renders full 3D room; presets 1..7 move camera;
  click-focus on Erez desk shows nameplate HUD; task wall shows REAL foreman task cards; git
  wall shows REAL atom commits; reception screen readable sovereign truth; TruthChip "נתונים
  אמיתיים · פורמן · דופק ALIVE · 2,925.6 SP · לפני 22 דק'"; mobile 390px clean; zero console
  errors; lint clean; dev.log only 200s.
- SCOPE SAFETY: no rewrite of zai-sec's Domain data-hero; Domain edit = NEW office3d/ folder +
  one hero entry block; FleetHQ push = additive new files + compatible upgrades (truth.ts is a
  hard dep of modified store.ts — pushed together so office-ci build stays green).

Stage Summary:
- TRUE (browser-verified): the 3D office is now the live flagship of the local page, fed by
  measured sovereignty truth only.
- NEXT (same session): register + push upgraded sources to FleetHQ; build standalone bundle →
  Domain office3d/ + hero entry; verify Pages deploy + pulses + chain spot-check.
"""
data = io.open(PATH, 'r', encoding='utf-8').read()
if MARKER in data:
    print('ALREADY-APPENDED (marker found) — no-op')
else:
    with io.open(PATH, 'a', encoding='utf-8') as f:
        f.write(entry)
    back = io.open(PATH, 'r', encoding='utf-8').read()
    assert MARKER in back and entry.strip()[:40] in back
    print('APPENDED + READBACK-VERIFIED, new size:', os.path.getsize(PATH))
