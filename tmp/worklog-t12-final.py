import io, os
PATH = '/home/z/my-project/worklog.md'
MARKER = 'Task ID: 12-office-3d-flagship-COMPLETE'
entry = """
---
Task ID: 12-office-3d-flagship-COMPLETE
Agent: main (T12 completion — everything verified side-by-side)

Work Log:
- PUBLISHED TO DOMAIN (commits 8176a0c3d0 + 9ff9fac5fe + ea6cb8831e, all readback MD5-verified):
  * office3d/ — self-contained 3D room (1.29MB JS gzip 365KB + CSS), stable asset names
    (index.js/index.css via rollupOptions — hash-mismatch bug found & fixed: first deploy 404'd
    assets because HTML referenced hashed names; rebuilt with fixed names).
  * models/humans/*.glb (3 files, byte-exact to FleetHQ).
  * index.html hero: 3D entry is the FIRST CTA ("🏛️ כניסו למשרד-התלת-ממדי החי ←") + clickable
    hero shot overlay; marker office3d-hero-v1; survived zai-sec's later dark-restyle (868659e4fa).
- LIVE-VERIFIED IN BROWSER (https://roshpinacare-sys.github.io/Domain/office3d/):
  * GLBs 200 at /Domain/models/humans/ (context-relative MODEL_BASE fix in Crew.tsx — first
    live load failed honestly via SceneErrorBoundary because /models/ resolved to site ROOT,
    not /Domain/; network-requests captured the 404s, fix pushed, re-verified 200s).
  * Room renders full crew at desks; TruthChip "נתונים אמיתיים · פורמן · דופק ALIVE ·
    2,925.6 SP" with honest stale-flag (amber when foreman state >30min); presets + focus work;
    landing CTA click navigates to the room.
- FLEETHQ SOURCE-OF-TRUTH (commits 56c8d71372 + 928519b2f6, readback MD5-verified): truth.ts +
  truth-bridge.ts + RoomRoot.tsx NEW; store/contract/Office3D/CameraDirector/ViewDeck/Crew
  upgraded. office-ci on 928519b2 = SUCCESS (build+types green). The 20:10 failure (bdf4d9eb)
  is a parallel agent's gov(T-57) commit — NOT my lane.
- SIDE-BY-SIDE HEALTH: lighthouse pages-build success 19:28Z; beacon-pulse success 19:26Z;
  saos-runtime in_progress at 20:17Z (prev success 19:55Z); rate-limit pristine.
- ANTI-FORGERY SPOT-CHECK (independent api.steemit.com, head 110,356,113): headcorner
  netSP=2,925.6 — EXACTLY what beacon publishes and the room displays; israelnews 94.0,
  wog 11.9 (honest floors). The room's numbers are chain truth.
- Sandbox hygiene: eslint ignores tmp//download//db/ (standalone build assets choked lint);
  lint clean; test server on 3999 killed.

Stage Summary:
- TRUE (all browser/chain-verified): the 3D office is now the LEADING surface — locally (port
  3000) and LIVE on the public site (Domain/office3d/), fed exclusively by measured, published
  sovereignty truth; the whole organism kept pulsing throughout (runtime, pulses, office-artery).
- OPEN for next agent: crew states show honest foreman errors (aluf/gal/erez "תקלה — ראה
  יומן") — the foreman's t1083 planning failure is REAL and predates T12 (engineer lane);
  office3d git-wall is empty when api.github.com anonymous rate-limits (fail-soft, honest);
  FleetHQ office-page could adopt RoomRoot+bridge to replace its PNG window (needs socket vs
  bridge merge decision).
"""
data = io.open(PATH, 'r', encoding='utf-8').read()
if MARKER in data:
    print('ALREADY-APPENDED — no-op')
else:
    with io.open(PATH, 'a', encoding='utf-8') as f:
        f.write(entry)
    back = io.open(PATH, 'r', encoding='utf-8').read()
    assert MARKER in back
    print('FINAL RECORD APPENDED + READBACK-VERIFIED, size:', os.path.getsize(PATH))
