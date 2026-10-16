# SAOS· Domain - the public home of THE WEAVE console

This repository serves the public console of the SAOS ecosystem at
https://roshpinacare-sys.github.io/Domain/ - one complete, comprehensive
console: a single-page app plus the sovereign wallet, the truth gate, the
receipt wall, the content hub and the nine system fronts. No build step,
no tracking, no external dependencies, no CDN assets. Everything it serves
lives in this repository.

## Lineage (honest history)

The operator opened this empty repository on 2026-09-20 and asked for a
clean, complete, professional home. The verified state was ported in full
from the Console repository at commit 8450edc (the R61 complete-map
regime, measured ALL-GREEN at port time): every page, every front, the
wallet, the hub, the receipts, the verification contract. The Console
repository remains untouched and live in parallel - which home becomes
canonical is the operator's recorded decision (agent/state.json, OL-12).

Nothing was invented in the move: the port is byte-faithful except for
the base-path migration (every link relative or rebased to this home's
URL), one typography fix (a stray emoji in the wallet page, against the
site's own language contract), the roast stub now redirecting directly to
the living truth gate, and the honest restart of the truth machines'
history (this home's streak begins here - no imported verdicts).

## Domain × Console — the split of roles (2026-10-02, Task 14-b)

Until 2026-10-02 the two homes served near-identical pages. Measured
decision (owner directive, "de-duplicate Console vs Domain"):

- **Domain = the public sovereign face**: SEO-bearing pages, the content
  hub, the research fronts (money / defi / deposits / versus / readiness /
  sovereign / acid), the audience and market materials, the daily
  STATE-REPORTs (`reports.html` is their index), and the mobile-first
  interface layer (`assets/site.css` + `assets/site.js` — one shared
  44px-touch menu discipline for every front).
- **Console = the operator's ops center**: the truth machines compute
  there once; Domain displays the outputs.
- **`mirror-from-console` reconfigured accordingly** (was the duplication
  engine): the HTML surfaces (index/truth/gate/money/404) were removed
  from the mirror — Domain now edits every one of its pages in its own
  home and the mirror no longer copies Console pages here. What keeps
  flowing is the **DATA whitelist only** (registry, gh-snapshot, dex
  books, truth outputs) — genuinely shared machine outputs, computed
  once in Console, never recomputed twice. The honest DRIFT guard stays
  dormant in `agents/mirror-from-console.mjs` as protection, not policy.
- The sibling counterpart lives on the Console side (canonical links →
  Domain on shared surfaces).

### Data files: one writer each, honest readers (dedup map, measured 2026-10-02)

No root JSON is a dead copy — each has one writer and live readers.
Nothing was deleted or renamed (every listed file is written hourly by a
running bot; breaking a writer mid-write is forbidden). The alleged
`mirror.json` vs `mirror-report.json` duplication is FALSE: different
schemas, different roles (book vs diagnostic).

| file | writer (workflow → script) | readers (measured greps) | verdict |
|---|---|---|---|
| `mirror.json` | `weave-mirror` :57 → `agents/weave-mirror.mjs` (keyless pull from the live Console home) | index, net, truth, wallet, acid + cloud-pulse / content-campaign / daily-digest | KEEP — the network-state book (attestations, checkpoints, anchor lines, market, brain) |
| `saos-live.json` | `weave-mirror` :57 (same pull) | index, gate, wallet | KEEP — the live SAOS book (stateRoot, ops, relay, verify) |
| `status.json` | `weave-mirror` :57 (joined the set in R75; regenerated on the Console home by its render agent) | index, gate, truth | KEEP — witness freshness status |
| `mirror-report.json` | `mirror-from-console` :15 → `agents/mirror-from-console.mjs` | no page readers — bot diagnostic receipt (public per-run report) | KEEP — diagnostic, not a book |
| `agents/registry.json`, `agents/gh-snapshot.json`, `dex/money.json`, `dex/deposits.json`, `dex/watch.json`, `truth/latest.json`, `truth/history.json`, `truth/slo.json` | `mirror-from-console` :15 (DATA whitelist) | index, truth, versus + money-watch / moment-watch / watch | KEEP — one-bloc law: computed once in Console, displayed here |

Consolidation rule recorded for the future: single source per fact +
thin generators (`render.mjs`) — a file a bot writes stays until its
writer is retired by name, in a dated commit.

### Correction to the section below (measured 2026-10-02)

`console-publish`, `truth-gate` and `dex-watch` no longer run in this
repository — they were removed with the twin flows in r144-h (the
one-bloc law, BLOC.md: truth is computed once, in Console). `status.json`
keeps arriving via `weave-mirror` (above). The bullet list below is kept
as lineage history; the live workflow list is `.github/workflows/`.

## What is live here (measured, zero secrets)

Four workflows run inside this repository on its own GITHUB_TOKEN:

- `console-publish` (hourly at :45) - render.mjs re-reads THE WEAVE's
  anchor line from a public Steem RPC node (custom_json `saos.weave.core.v1`,
  posting authority, keyless) and commits `status.json`. The public chain
  is the source of truth: no private repository is read, no credential
  exists, and the death of any other environment cannot take this console
  down.
- `truth-gate` (hourly at :07) - truth/truth-gate-ci.cjs measures the LIVE
  deployed site (site-up, zero broken links, witness freshness, live
  format, bridgehead sanity, complete map, SLO ledger) and commits the
  verdict. A red verdict is committed first, then fails the run in public.
- `agent-verify` (every 2h at :55) - the network verifies the agent
  against `agent/verify/assertions.json` and publishes
  `agent/verify/results.json`.
- `dex-watch` (every 20 min) - scans the public deposit addresses on
  TRON/ETH/SOL/BTC with public RPCs and maintains the open deposit book.

## The machine twin (OL-14 healing, 2026-09-20)

At 12:36Z on 2026-09-20 every private-repo Actions run across the
ecosystem began failing instantly (jobs rejected before any step runs,
no logs generated) — the measured pattern of the Free account's
private-repo Actions minutes being exhausted, while public repositories
kept running on free unlimited minutes (all public proof machines
stayed green through the same window). The sovereign producer machines
that live in the private Zip repository — weave-heart, weave-anchor-lines,
web-publish, weave-ecosystem — stopped, and with them the live books
(saos-live.json, mirror.json) froze at their 12:10Z state.

The twin in this repository is the healing: the same machines, running
the same unmodified scripts from the sovereign home, but hosted here
where Actions minutes are free and unlimited. Each twin workflow checks
out the private Zip repository via the `ZIP_PAT` secret (Actions vault
only — never in code, never in logs), runs the machine, and pushes its
commits back to Zip. The book is never forked: one sovereign home, one
source of truth, one chain.

- `weave-heart` (hourly at :13) — the sovereign heartbeat; refuses honestly
  (measured: even ledger verification needs the sealed network key) until
  WEAVE_SEAL_PASSPHRASE arrives, then full verify/takeover
- `weave-anchor-lines` (bi-hourly at :33) — both evidence lines
  (Steem/Hive anchor, zero-gas EVM anchor); refuses honestly until the
  passphrase arrives (measured: even --verify-only needs the seal), then
  network runs full with the fleet signing key or honest-dry without it
- `web-publish` (every 20 min at :03/:23/:43) — the sovereign storage
  network publisher (posts inbox packages to Steem); green no-op while
  the inbox is empty, honest no-wif skip once packages arrive
- `weave-ecosystem` (daily at 06:30) — the G6 ecosystem unification
  enforcement (full dup scan, committed beacon, honest red on violation);
  full capability, verified working end-to-end (dup=0.011 committed to
  Zip from this twin on 2026-09-21T00:00:42Z)
- `dex-beat` (bi-hourly at :53, r68) — the DEX engine heartbeat from the
  sovereign saos-dex home. Secretless for the operator: it needs only the
  vault PATs (ZIP_PAT for the chain home, WEAVE_OPS_PAT for the public
  publish). Shift-guarded: cloud-beat advances the chain unconditionally,
  so the twin first asks the network whether the original's last run
  succeeded within 3h — alive means verify-only, dead means takeover.
  Revived world.json end-to-end on 2026-09-21 (chain advanced and
  published to Console; this home's :52 dex-mirror carries it here)
- `dex-grid` (daily at 03:48, r68) — the outer grid (THE-REAL-GRID) from
  the sovereign saos-dex home. Refuses honestly until the manager operating-key is provisioned
  arrives (below): running keyless would publish a false DISARMED-NO-KEY
  verdict while the true state is armed (the key lives in the private
  saos-dex vault, which secrets never cross). Shift-guarded on schedule
  (23h window); a fuel-landing dispatch (money-watch) or a manual dispatch
  runs it immediately — the grid is atomically re-centering by design,
  so a double dispatch across two living homes is a harmless re-center
- `cloud-heart` (every 30 min at :17/:47, r71) — the SAOS-NET cloud
  heartbeat from the sovereign steem home: the machine that was the
  network's last living heart (its auto-saves, every ~90 min, were the
  only thing advancing the chain after 2026-09-06; the quota death at
  2026-09-20T12:36Z killed it too and the chain froze). Identical
  machine, zero operator secrets (keyless-safe by design — no fleet
  seal exists in the repo, so the takeover path runs in honest DRY,
  exactly as it ran green for 14 days); it needs only WEAVE_OPS_PAT for
  the checkout and push-back. Leader election is the machine's own —
  chain-attest or git freshness, whichever is fresh means SANDBOX-ALIVE
  (verify-only, touch nothing), both stale means TAKEOVER (one agent
  cycle, one saosnet beat, gitkeeper push). The :17/:47 offset against
  the original's :00/:30 means the two hearts never share a minute, and
  every takeover's own push refreshes the git signal so the next heart
  stands down — double-advance in one window is impossible by design.

The fuel-landing dispatch (money-watch) now targets both homes: the
sovereign original in saos-dex and this repository's dex-grid twin
(the twin carries the fuel while the private original is quota-dead;
the dispatch is recorded with both results in `dex/money.json`).

Cadences are deliberately offset from the original machines (Zip's
heart at :00, saos-dex's beat at :23 and grid at 03:17, steem's cloud
heart at :00/:30) so that if the operator restores billing and the
private machines revive, both homes interleave without ever colliding
on the same push. All state writes go through the canonical secret gate
and the chain-aware idempotency of the machine itself (an
already-anchored root is an ALREADY-ANCHORED honest skip, not an error;
the dex twins add the shift guard so the chain never advances twice in
the same window).

Quota sovereignty (r71, 2026-09-21): the measured private consumption
of the scheduled fleet was ~2,180+ Actions-minutes per month against
the Free account's 2,000 — exhaustion was structural, not incidental,
and reviving the private schedules on the returned minutes would burn
them again by month-end. The consolidation: the public twins are THE
machines (free, unlimited); the private originals in Zip, saos-dex and
steem were moved to dispatch-only (schedules removed, one honest
commit each — manual backup, one commit away from revival). The nine
quiet archive agents (claims-guard, baseline-integrity, controls-audit,
control-center-build, jumpper-tests, platform-selftest, wallet-verify,
sdk-verify, archive-keeper) keep their daily private cadences by
measurement: ~8 runs a day, comfortably inside the returned quota.
Net private consumption after the consolidation: the quiet agents
only — the quota can no longer be exhausted by design.

Secrets status (this repository's vault, Settings > Secrets and
variables > Actions) — the gated twins refuse honestly with a clear
message (the key-verify precedent) and say so in their logs:

1. `WEAVE_SEAL_PASSPHRASE` — **delivered and ADOPTED (r72,
   2026-09-21)**: the operator delivered a master passphrase (2026-09-21,
   08:28:30Z and a second value 12:30:42Z; secret names withheld by
   disclosure policy). Both were tested to exhaustion, every rung
   receipted: none is a private key or master password of any fleet
   account (12 derivations × 2 chains, 0 matches —
   receipt `receipts/key-check.json`, verdict `unidentified`), and
   neither opened the seal as delivered (BEAT-ERROR authentication).
   Per the operator's recorded intent ("from it one can get all the
   keys"), the second delivery was then ADOPTED as the seal
   passphrase by the `seal-adopt` machine (run 35602602107, commit
   ff3260a): the same keys (cloud `0xaB07…`, network `0xe376…` —
   unchanged, the live ledger's own signer) re-encrypted under the
   operator's own password, recovered from the sovereign lineage
   (the G3 gap is documented in TRUTH-AUDIT §16). Measured proof:
   the heart opened the seal and beat (LEDGER-VALID 295/295, att
   296, cp#289), the ZERO anchor landed on-chain (block 35247391,
   gas 0), and the book advanced 293 → 297. The twins read
   the seal passphrase (delivered value now
   feeds them all. The operator holds the passphrase by
   construction (they typed it); pasting the same value under
   `WEAVE_SEAL_PASSPHRASE` in the private Zip vault is the
   30-second operator step that re-arms that home's backup path.
2. `WEAVE_SIGNING_KEY` — the fleet witness signing key (held only
   in system secrets; account identity withheld by disclosure
   policy). Without it: no network broadcasts (honest dry), no SAOS
   live genesis placement (honest skip). The ZERO anchor line does
   NOT need it (zero-gas Z Chain).
3. `MANAGER_OPERATING_KEY` — the manager operating-key that arms the
   grid (r38). It already lives in the private saos-dex vault — but
   GitHub secrets never cross repositories, so the dex-grid twin needs
   its own copy. Without it the
   outer grid stays frozen (its state ages in honest red); with it, the
   grid trades again on public minutes. After delivering it, dispatch
   `dex-grid` once manually (Actions > dex-grid > Run workflow) or wait
   for the daily 03:48Z slot — and the first fuel-landing dispatch
   becomes live immediately.

The operator's alternatives are recorded honestly: restoring billing
revives the original private machines instantly (the secrets are already
in their vault), delivering the remaining secrets here completes the
twins' full capability for free, and doing both yields a redundant
two-home machine (shift-guarded: the living original always owns the
book).

## What is a frozen snapshot here (pending activation)

Some data planes on the old home are fed from the ecosystem's private
sovereign repositories: the heart's public mirror (`mirror.json`), the
live ledger book (`saos-live.json`) and the agents registry refresh. On
this home they are frozen at the port timestamp (their freshness
assertions stay suspended with the reason recorded). The DEX engine's
books (`dex/grid.json`, `dex/world.json`, `dex/state.json`,
`dex/credits.json`, `dex/portfolio.json`) are no longer frozen: R63 added
the `dex-mirror` machine (hourly :52, keyless public read) that
re-mirrors them from the live Console mirror into this repository, and
the three assertions that measure their freshness (A34, A36, A37) were
re-armed - truth-gate G11 (`mirror-freshness`) keeps the served book
honest in red. Since r68 the engine behind those books is itself alive
again: the `dex-beat` twin (above) advances the canonical chain on
public minutes and publishes to Console, which the :52 mirror carries
here — `dex/grid.json` remains the one frozen plane, honestly, until
the manager key arrives (its machine signs real external orders).

Activation (operator steps, in order):

1. Secrets: add AGENTS_WATCH_TOKEN (and, when needed, HEADCORNER) under
   Settings > Secrets and variables > Actions, then port agents-watch,
   money-watch and key-verify from the Console repository.
2. Data planes: decide whether the sovereign heart dual-publishes to both
   homes or this home replaces the old one (the publish targets are code
   on the sovereign side, documented as OL-12 in agent/state.json). The
   R63 mirror is a Domain-side pull of already-public data - it does not
   decide this; if the heart ever pushes here directly, the mirror
   becomes a silent no-op (identical files, no writes).
3. Canonical home: optionally attach a custom domain under
   Settings > Pages - the site is base-path agnostic (all links relative),
   so it serves at the domain root; update the sitemap and robots
   prefixes at that point.

## What it contains

- `index.html` - the console SPA (one complete map: live status, network,
  agents, exchange, knowledge and admin views, bilingual)
- `wallet.html` - the sovereign wallet (keys never leave the browser)
- `truth.html` - the truth gate (the public face of the CI truth machine)
- `receipts/` - the receipt wall (every receipt opens in a public
  explorer; historical receipts keep the URLs that were true when they
  were issued)
- `hub/` - the content hub (articles, explainers, guides, fact sheet)
- the nine system fronts, all real measured pages: `money.html` (the
  money path), `net.html` (the live network mirror), `acid.html` (the
  discovery engine), `gate.html` (the operator gate), `defi.html` (the
  DeFi innovation map), `deposits.html` (the liquidity door),
  `readiness.html` (the readiness exam), `sovereign.html` (the sovereign
  verdict), `versus.html` (the honest comparison)
- `acid-engine.js` - the discovery engine that powers acid.html
- `status.json` - the live network status, read back from the chain
- `render.mjs` - the keyless renderer (zero dependencies, plain fetch)
- `truth/` - the CI truth machine (hourly, measures the live site,
  commits its verdict; fresh honest history from this home's first run)
- `agent/` - the bridgehead: state, handoff protocol, requests ledger and
  the verification contract the network runs against the agent
- `assets/og-cover.png` - the social preview image

## How to verify

1. Read `status.json` and note the witness transaction id.
2. Open that transaction on any Steem explorer (link is on the page).
3. The custom_json payload carries the checkpoint root and the covered
   attestation range: the network's own testimony, signed by the posting
   authority of the witness account and validated by the chain itself at
   inclusion.
4. The commit that wrote the status file is one click away, timestamped.

A claim without a receipt is not a claim here.

## What never enters this repository

Keys, tokens, passphrases, wallet balances, treasury maps, internal
documents, or personal information. The renderer runs a secret gate on
every publish and refuses to commit anything matching key or token
patterns.

## Truth · 2026-10-02 · Task 15-a — the hub tree joined the shared layer

Measured facts from this wave (every number below was re-measured, not
estimated):

- **Shared mobile layer now governs 51 more pages**: all 42 live pages of
  `hub/`, the 4 `market/` pages, `receipts/` and the 4 marketing decks
  (`pitch/`, `pitch/en`, `deck/`, `onepager/`) each load
  `assets/site.css` + `assets/site.js` (depth-correct paths). Two pages
  were deliberately left out: `hub/explainer/index.html` and `roast.html`
  — both are 0-second meta-refresh redirectors with a canonical already
  pointing at their target; wiring them would be dead markup.
- **Canonicals**: 34 hub pages had a copy-paste canonical pointing at
  `hub/` (or `hub/api/`, `hub/ads/`) instead of themselves — all replaced
  with their own real Pages URL; 6 pages had none and got one; the 7
  article pages were already self-canonical. Every content page in
  `hub/ market/ pitch/ deck/ onepager/ receipts/` now carries exactly one
  canonical matching its sitemap entry (verified by scan).
- **OG/Twitter**: og:title / og:description derived ONLY from each page's
  own `<title>` and `<meta name="description">` (zero invented copy),
  plus og:url / og:site_name / og:type / og:locale (from the page's own
  `lang`) / twitter:card on every page that lacked them; 8 relative
  `og:image` references normalized to the absolute Pages URL (same file).
- **Sitemap**: 66 URLs before, 66 after — all 43 hub URLs and all market
  URLs were already listed; the `lastmod` of the 52 changed URLs was
  refreshed to 2026-10-02.
- **Design tokens via the shared layer** (`body.sop` scope): one zinc+gold
  token block (--sop-*), sticky-footer discipline (`min-height:100svh` +
  footer margin-top:auto), unified motion speed, line-height/balance
  rhythm, scroll-margin under sticky bars, overflow guards, print rules,
  44px touch discipline, safe-area insets. No indigo, no blue, no
  framework, zero JS dependencies — unchanged doctrine.
- **Bugs found by measurement and fixed in the layer**:
  (1) `receipts/` dragged 548px wide at 390px viewport (long receipt
  hashes set the table's min-content width) → cells now wrap
  (`overflow-wrap:anywhere`), page measures 390;
  (2) the two A4 one-pagers are fixed 210mm (~794px) print sheets → they
  now scale to the phone via layout-aware `zoom` (engines without
  `:has`/zoom keep the old behavior, pure enhancement);
  (3) the market pages hide their own link row at ≤900px but the shared
  burger appeared only ≤760px, leaving 761–900px viewport band navless —
  the burger now shows in exactly that band, and the panel open-state
  rules moved out of the ≤760px media (they can only trigger when a
  burger is visible, so verified root fronts are unaffected — re-verified).
- **site.js**: shared menu links are now depth-aware (hub/articles/en/*
  resolve back to the site root) and the enhancer also accepts
  `nav.nhead` (the market fixed bars); one "Content Hub" entry was added
  to the shared cross-site menu. `node --check` passes.
- **Browser verification (agent-browser)**: 60 pages swept at 390×844 —
  zero horizontal scroll anywhere (`scrollWidth == 390`), burger present
  on all 51 newly wired pages, menu opens with 8 depth-correct links at
  44px row height, closes on Escape / outside tap / link tap;
  12 pages re-swept at 1280×900 — burger hidden, rows intact, no
  overflow; root fronts (gate/net/money/truth/wallet/about/index)
  re-verified unchanged. VLM visual check of mobile menu / article /
  desktop hub: clean.
- **Completion pass (same wave, re-verified)**: `tabular-nums` now
  aligns digits in every `.sop` table cell (repo-wide scan: no `.sop`
  page sets `font-variant-numeric`, so zero conflict — confirmed live
  on `receipts/` cells); 4px spacing steps and a 6-step type scale ship
  as opt-in `--sop-s*`/`--sop-fs-*` tokens (hub pages own their h1/h2
  sizes — measured — so the scale changes nothing until a page adopts
  it); the `hub/explainer/index.html` redirector's canonical was made
  absolute (RFC 3986) still pointing at `explainer/en.html`. Re-swept
  9 hub/tree pages at 390×844 (scrollWidth 390, burger 44×44, menu
  open/8×44px links/close on Escape+outside-tap+link-tap) and 6 pages
  at 1280×900; root fronts re-measured clean at both sizes.
