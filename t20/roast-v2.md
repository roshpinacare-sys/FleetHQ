# Roast v2 — measured deep audit (T20-a, zai-code-t20a)

Snapshot window: 2026-10-12T22:29–22:52Z. All measurements are live fetches of the production
sites as an anonymous public visitor (curl, no auth), plus read-only GitHub API for repo
visibility. Domain was hot during the window (commits 961c3777 22:41, 6d474257 22:43,
1fbbe2fb 22:48) — numbers carry the snapshot timestamp. Nothing was modified in any repo.

---

## 0. Headline counts

| metric | count |
|---|---|
| Live public Pages sites (200) | 4 of 12 candidates (org root, Domain, Console, FleetHQ) |
| Public repos with NO Pages site (404) | 8 (GridWatch, Pulse, Autonomy, saos-runtime, steem, sovereign-beacon, sovereign-lighthouse, sovereign-runner-kit) |
| Sitemap-listed Domain pages that exist (200) | 71 / 71 |
| Broken links on live pages (404 or dead deep-link) | 4 (2 of them kill a feature or a front-door row) |
| Links to PRIVATE resources that 404 for the public | 2 hard (Sandbox raw key-proof, steem repo) |
| External receipt links bot-blocked (403, unverifiable) | 2 (etherscan ×1 on Domain/marketing, basescan+optimistic.etherscan on Console) |
| Voice violations counted (all classes, live copy) | 45 (11 first names + 17 המפעיל/הבעלים role-text + 13 promise words + 4 English internal-chatter blocks) |
| Superlatives (מהפכני/מדהים/בלתי-נתפס/עוצמתי) | 0 |
| Decorative double quotes around Hebrew | 0 |
| 100% promises | 0 |
| Colon-typography instances (Hebrew word: Hebrew word, visible text) | 187 across 20 pages (top: FleetHQ 37, versus 28, deposits 27, Console 23) |
| Stale feeds displayed as truth sources (>24h, own staleness law) | 3 (agent/state.json 21d, public/pulse.json 34h, mirror.json 26h) |

---

## 1. Link integrity — every finding has source page + href + measured status

### 1a. Hard 404s on live public pages
1. **Org front door** https://roshpinacare-sys.github.io/ — href
   `https://github.com/roshpinacare-sys/steem` → **404** (measured 2026-10-12T22:35Z).
   The steem repo flipped private; the front-door sites index still ships a row
   "steem — מבצעי שרשרת" to a door that 404s for every visitor. The same page states
   "קישור שמחזיר 404 למבקר אינו קישור" — the site violates its own law on its front door.
2. **Domain/marketing/** — href `../disclosure-policy.html` →
   https://roshpinacare-sys.github.io/Domain/disclosure-policy.html → **404**. The real page
   lives at /Domain/hub/disclosure-policy.html (200). Domain's own site-audit
   (agents/site-audit.json, generated 22:30Z, overall FAIL) independently flags the same 404 —
   the detector works, the fix has not landed.
3. **FleetHQ/** — href `https://roshpinacare-sys.github.io/Domain/office3d/v2/` → **404**.
   A highlighted link to a version of the flagship office that does not exist on Pages.

### 1b. Dead deep-links (redirect to a non-target)
4. **Domain/marketing/** — href `https://solscan.com/tx/2M1rkRggRcaePk6vMZpgSaM3WVWQU92RZAs1v7PtNeMLsxLmZoqBNCeEtuY7Rkj5aPbs4jS1g2wUQXCnoejUM2M9`
   → 302 → final URL `https://solscan.io/` (homepage, 200). The receipt link does not reach a
   transaction page. Measured with browser UA and plain fetch, twice.

### 1c. Bot-blocked (classified separately, not counted as 404)
5. Domain/marketing/ → etherscan.io/tx/0x102ec193… → 403 to automated fetch (anti-bot);
   browser reachability unproven from this environment. Console landing → basescan.org/tx/0x695e…
   and optimistic.etherscan.io/tx/0xdb4ff… → 403 likewise. steemscan + hive.ausbit anchors = 200.

### 1d. What is NOT broken (verified clean)
- All 71 pages listed by Domain/sitemap.html return 200 with real content.
- All inline data feeds of the Domain landing (status.json, dex/world.json, dex/office-feed.json,
  dex/grid.json, dex/deposits.json, Pulse mirror/lanes.json, agents/work-orders.json) = 200 and
  graceful failure paths in JS.
- weave/agreement.json, weave/census.json, weave/vitals.json = 200 (only the directory index
  /Domain/weave/ 404s, and no static href points at it).
- /Domain/office3d module graph complete: importmap maps `three` → vendored
  assets/three.module.min.js (200, 392,831 B); world/crew/director/data/live/ui/atmosphere/canon/engine
  all 200.
- Console internal links (about, hub, receipts, gate, truth, versus, wallet, dex feeds) = 200.
- roast.html is an intentional retirement page (noindex, refresh → truth.html) — not a stub failure.

---

## 2. Closed doors — private resources linked from the public surface

1. **Domain/verify/ — the flagship "אמת-בעצמך" feature is pointed at a private repo.**
   Page JS: `var RAW = 'https://raw.githubusercontent.com/roshpinacare-sys/Sandbox/main/';`
   then `jget(RAW + 'proof/out/KEY-PROOF-LATEST.json…')` with a 10-day date walk-back.
   Anonymous fetch of Sandbox raw = **404** (Sandbox is private). Every public visitor gets
   "no artifact in last 10 days" after 11 failed requests. The page whose entire purpose is
   "check the proof yourself" cannot load the proof for the public. The landing page meanwhile
   claims "בלי דלתות סגורות" — measured contradiction, strongest finding of this round.
2. **Org front door → steem repo → 404** (see 1a.1). Public visitors are shown an internal
   repo row whose door is closed.

Private-name exposure (measured, judgment note): Domain/status.json and GRID-STATUS.md publish
the complete internal inventory — all 21 private repo names (Adsmarket, anchor-baseline, Defi,
Project-files, roshpina, Sandbox, sandbox-private, saos-agents, saos-control-center, saos-dex,
saos-jummper, saos-sovereign-foundry, saos-sovereign-platform, Saosmartwallet, Sdk, steem,
TruthRail, Zip, SovereignConsole, negen, vault-home) with per-repo workflow/artery names.
Giant status surfaces publish service health, not a map of internal infrastructure names.

---

## 3. Org Pages estate

| site | status | note |
|---|---|---|
| roshpinacare-sys.github.io | 200 | flagship front door; content solid; 1 broken repo link (steem) |
| /Domain/ | 200 | largest surface, 71 pages + feeds alive |
| /Console/ | 200 | full app; anchors shown "חי עכשיו" are 6d (OPTIMISM 2026-10-06) and 13d (BASE 2026-09-29) old as displayed — no stale-age marker next to the live chip |
| /FleetHQ/ | 200 | serious leak class (see §4a); + 1 broken link (office3d/v2) |
| /GridWatch/, /Pulse/, /Autonomy/, /saos-runtime/, /steem/, /sovereign-beacon/, /sovereign-lighthouse/, /sovereign-runner-kit/ | 404 | Pages not enabled — the org advertises 9 public sites on the front door index, but only 3 sibling sites actually open |

---

## 4. Voice-law audit (live copy, visible text; counts per page; quotes ≤3 words context)

### 4a. Personal / internal references
- **Agent first names in public copy — FleetHQ only: 11 instances.**
  "בוצע שחר (Shachar) 2026-10-12 19:37 UTC" (×7), "בוצע גל (Gal) 2026-10-12 06:35 UTC" (×4).
  This is T14's finding still live: the podium publishes internal agent chatter verbatim, including:
  - English tool error: "How should I read a public page without the read_page tool? Please provide a URL"
  - internal question: "איזה דף ציבורי עליי לקרוא עבור המחקר?"
  - English task-log: "Research: market-grid public page summary", "Public page 'market-grid' (v1.3.0) read successful"
  - internal directive with feminine imperative: "השתמשי ב-read_page"
- **המפעיל (role-text, excluding the product name "שער המפעיל"): 10 instances.**
  deposits ×4 ("ההחזר רק דרך המפעיל", "מפתחות בצד המפעיל", "כתובות הצבא בצד המפעיל", "תלוי מפעיל"),
  versus ×1 ("שלושת התפקידים ביד אחת - המפעיל"), Console ×1 ("הכניסה המלאה של המפעיל"),
  FleetHQ ×4 ("מדיניות המפעיל האוטונומי" ×3 + one tool-error block). Product-name uses
  (sitemap ×1, net ×1, Console ×3) counted separately and acceptable as a name.
- **הבעלים: 4 instances.** versus ×1 ("עד שהבעלים תובע"), deposits ×2 ("עד שהבעלים תובע",
  "הבעלים חותם תביעה"), Console ×1 ("שהרשת לא הבעלים שלהן"). org/standard.html ×1 is
  self-referential rule text (the page itself defines the law) — not counted as violation.
- **Internal vocabulary on public status surface:** GRID-STATUS.md/status.json list 21 private
  repo codenames + "טוקן: GH_PAT" phrasing (see §2).

### 4b. AI marks
- Decorative double quotes "…": **0** in visible copy across all 20 audited pages.
- Superlatives (מהפכני, מדהים, בלתי-נתפס, עוצמתי, פורץ-דרך): **0**.
- English AI-isms (delve/seamless/robust/cutting-edge/unleash/game-changer): **0** in Hebrew copy.
- Colon-typography ("word: explanation" as a copy scaffold): **187 raw instances** across 20
  pages (FleetHQ 37, versus 28, deposits 27, Console 23, marketing 15, dev 12, landing 11,
  verify 10, standard 9, org-standard 9, giants 6, sitemap 3, others ≤2). Sampled classification:
  a large share is legitimate label:value (tables, chips, Q&A), but the recurring rhetorical
  pattern "התשובה הכנה:", "השורה התחתונה:", "המחזור המלא:" repeats as a stylistic crutch on
  versus/deposits/FleetHQ. Not a hard violation — a habit to prune.

### 4c. Promise-language without receipts
- **תמיד ×7:** marketing ×2 ("החתימה תמיד מחוץ למערכת", "מסומן תמיד לפאנל"), dev ×1
  ("תמיד קראו publishedAt"), versus ×1 ("הנמדד, תמיד"), deposits ×1 ("הוא תמיד הנמדד"),
  Console ×1 ("אספקה שווה לנעול, תמיד"), org front door ×1 ("במעקב מתמיד").
- **לעולם ×5:** net ×1 ("לעולם לא את הגושים"), versus ×1 ("מה שווה לא להעתיק לעולם"),
  verify ×1 ("לעולם לא ערכי-מפתח"), FleetHQ ×1 ("לעולם לא מסומן כתקין"), org-standard ×1 (rule text).
- **לנצח ×1:** deposits ("נתקעת לנצח כ\"מטופלת\"").
- **100% / אף פעם: 0.**
- Note: several of these are negative promises ("לעולם לא נמסור") where the site does carry the
  enforcement receipt — the fix list should keep promises that link their receipt and rewrite the rest.

---

## 5. Stale data displayed on truth surfaces (site's own law: >24h must be flagged)

| feed | consumed by | measured age at snapshot | verdict |
|---|---|---|---|
| agent/state.json | truth.html footer "מקורות אמת" | generatedAt 2026-09-21T20:30Z ≈ **21 days** | stale, unmarked |
| public/pulse.json | standard.html | generatedAt 2026-10-11T12:37Z ≈ **34h** | stale, unmarked |
| mirror.json | truth.html footer | generatedAt 2026-10-11T20:24Z ≈ **26h** | stale, unmarked |
| dex/world.json | landing/deposits | publishedAt 2026-10-12T05:52Z ≈ 17h | aging, inside law |
| dex/office-feed.json | landing | deposits.updatedAt 2026-10-11T23:49Z ≈ 23h | borderline |
| status.json / office-live.json / lanes.json / office feeds | landing/office3d | 22:19–22:30Z / 22:20Z / 22:30Z / 19:38Z | fresh |

---

## 6. Giant bar — measured practice vs our state

| giant practice | our measured state | gap severity |
|---|---|---|
| Status page with incident history | truth/slo.json carries events (BUDGET-BREACH…), reports.html shows a table whose 4 visible rows are all "משמרת-פרטית 🔒" (retracted to private) — a "published reports" page where every row is locked | P1 |
| Per-product changelog | none found on any live page; no changelog route in the 71-page sitemap; org-standard.html itself lists "יומן-גרסאות" as backlog | P1 |
| Visible version numbers | only a stray "v1.3.0" inside a FleetHQ feed line and dex/world.json internal `version: 13556`; no product ships a visible version | P2 |
| Claims linked to receipts | strong: anchors open in explorers, receipts/ index live, verify page exists — but the verify core feed 404s (§2.1) and 2 receipt deep-links are dead (§1a.4, §1c) | P0 (verify) |
| First-time orientation | org front door does this well (what/what-for/where to start); Domain landing jumps straight into internal nouns (עורקי הצי, פס-הגריד); market/ is English while the referrer is Hebrew | P2 |
| Consistent design language | at least 4 accent systems live (#0d9d6d, #10b981, #2dd4bf, #c2792e, #d4af37), 3 title conventions ("SAOS Network |", "SAOS ·", none), only 7 of 20 pages share assets/site.css, office3d uses a different font stack (Heebo/Rubik) | P1 |
| One nav model | <nav> present with links on 9 pages, absent on 11; no persistent cross-site nav between Domain/Console/FleetHQ | P1 |
| Language model | 18 Hebrew-RTL pages vs 2 English-LTR (wallet.html, market/) with no persistent language switcher on those pages (Console has "English") | P2 |

---

## 7. Product depth (30-second first-visitor trust)

- **office3d/** — the engine is real: importmap + vendored three.js, 8 local modules 200, data
  feeds 200 and fresh (office/data.json generatedAt 22:20Z; FleetHQ office-state capturedAt
  19:38Z). BUT the "live broadcast" layer cannot work on static hosting: `io('/?XTransformPort=3036')`
  has no server behind Pages and `/api/office/world` returns 404 — every public visitor waits 6s
  and then lands in the honest fallback "אין שידור זמין" → canonical world-state.json (200).
  Honest degradation, but a giant would either hide the dead path or ship the proxy.
- **market/** — functional hub (he.html/index-en/onepager-en/fact-sheet.md all 200), but the
  page is thin (1,303 visible chars, 32 Hebrew words) and lands a Hebrew visitor on an English
  page. One dead receipt deep-link (solscan) sits on its sibling marketing page.
- **pulse (public/pulse.json)** — 34h stale while standard.html presents it as measured state.
- **Console anchors** — "חי עכשיו" beside OPTIMISM anchor aged 6d and BASE 13d; no age chip there.

---

## 8. Fix list (owner lanes; T20-a did not modify any repo)

| # | fix | where | severity |
|---|---|---|---|
| 1 | Point verify/ RAW at a public mirror of the key-proof artifacts (or copy proof/out into Domain) — today the page's core is dead for the public | Domain verify/ + CI publisher | P0 |
| 2 | Remove or repoint the steem row on the org front-door sites index (repo flipped private) | roshpinacare-sys.github.io | P0 |
| 3 | Fix marketing/ disclosure-policy link → ../hub/disclosure-policy.html (site-audit already FAILs on it) | Domain marketing/ | P0 |
| 4 | Scrub FleetHQ podium: agent first names ×11, English tool-error and internal questions ×4 — render role labels, not names/chat | FleetHQ generator | P0 |
| 5 | Fix FleetHQ link to /Domain/office3d/v2/ → /Domain/office3d/ | FleetHQ | P1 |
| 6 | Stale-age markers (or refresh) for agent/state.json (21d), public/pulse.json (34h), mirror.json (26h) | Domain CI | P1 |
| 7 | Add stale-age chip next to Console anchors shown as "חי עכשיו" (6d/13d) | Console | P1 |
| 8 | Retire or proxy the dead broadcast path in office3d (socket + /api/office/world) — 6s dead window on every visit | Domain office3d | P1 |
| 9 | Replace solscan deep-link with a working explorer URL | Domain marketing/ | P1 |
| 10 | Promise-word pass (תמיד ×7, לעולם ×5, לנצח ×1): keep only promises that link their receipt | Domain/Console/FleetHQ copy owners | P2 |
| 11 | One accent system + one title convention + persistent cross-site nav | Domain+Console+FleetHQ owners | P1 |
| 12 | Decide the public status surface: service-level health instead of 21 private repo codenames | Domain status/GRID-STATUS owner | P2 |

— zai-code-t20a, 2026-10-12T22:55Z
