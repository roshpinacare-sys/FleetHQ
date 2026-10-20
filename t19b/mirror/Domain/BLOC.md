# BLOC — one bloc, two repos (r144-h)

**The law:** this is ONE bloc living in two public repos. Every capability lands in **exactly one** repo. Truth is computed once; the other face mirrors it. No manual copies, no twin recomputation.

## Roles

**Console = operator truth center.** Everything the machine must *measure and prove*: operator keys (`key-verify`), proof & ledger pipeline, sovereign anchor, the witness beacon (`console-publish`), the truth gate that grades the live site, the fleet census (`agents-watch` → `agents/registry.json` + `dex/world.json`), the money sentinel (`money-watch`), the treasury-door scan (`dex-watch`), the live SAOS fold (`saos-live.json`). 10 workflows.

**Domain = public face.** Everything the world must *read and find*: SEO surfaces, the hub content library, market/, research/, moment/, econ-desk, daily digests, and its own public-face self-verification (`agent-verify` measures the Domain site itself). Site-identity copy (canonical/og, nav) stays Domain's own. 32 workflows (measured 2026-10-01: 31 after the r144-h twin dedup, +1 `content-reviewer` in r144-i2).

## The 8 twin workflows — ownership (measured 2026-10-01, last-run evidence from the Actions API)

| workflow | owner | the other repo's disposition | measurement |
|---|---|---|---|
| console-publish | **Console** | Domain: **removed → mirrored** (weave-mirror :57 carried `status.json` already; now under one law) | both ran OK ≤1h before dedup |
| truth-gate | **Console** | Domain: **removed → mirrored** (`truth/latest.json`, `truth/history.json`, `truth/slo.json`) | both OK 21:23Z / 21:21Z |
| agents-watch | **Console** (writes `dex/world.json` + registry consumed by Console site AND the platform app) | Domain: **removed → mirrored** (`agents/registry.json`, `agents/gh-snapshot.json`) | both OK 20:50Z / 20:46Z |
| money-watch | **Console** (home platform reads `Console/dex/money.json`; its run also dispatches the Domain `dex-grid` backstop cross-repo) | Domain: **removed → mirrored** (`dex/money.json`) | both OK 21:17Z / 21:31Z |
| dex-watch | **Console** (home platform reads `Console/dex/watch.json` first) | Domain: **removed → mirrored** (`dex/deposits.json`, `dex/watch.json`) | both OK 21:37Z / 21:40Z |
| key-verify | **Console** (operator-key vault gate; dispatch-only) | Domain: **removed** — never succeeded there (0/8 runs), and a wrapper would check the *wrong repo's* vault | Console lastOK 2026-09-18, Domain never |
| gitleaks | **both, kept** — a per-repo push guard, not a duplicated computation; removing it would leave Domain pushes unscanned | kept | both OK on latest pushes |
| agent-verify | **both, kept** — each verifies a *different* live site (Console grades Console, Domain grades Domain) | kept | both OK 20:59Z / 21:04Z |

Deviation note (honest): the provisional r144-h assignment suggested agents-watch / money-watch / dex-watch belong to Domain. Verification of outputs/targets overruled it: all three are truth *computations* whose outputs both faces and the home platform consume; keeping them in Console makes the mirror one-directional (Console → Domain) with no stale operator views. Recorded here as the measured law.

## Mirrors (Domain ← Console, keyless public reads)

- **already existed:** `dex-mirror` (:52 — dex/grid, world, state, credits, portfolio) · `weave-mirror` (:57 — mirror.json, saos-live.json, status.json)
- **new in r144-h:** `mirror-from-console` (:15 + dispatch — agents/registry.json, agents/gh-snapshot.json, dex/money.json, dex/deposits.json, dex/watch.json, truth/latest.json, truth/history.json, truth/slo.json + HTML top-5: index.html, truth.html, gate.html, money.html, 404.html). HTML rule: a surface is copied (URL-swapped) **only while** Domain's copy is byte-exactly the swapped Console canonical; any real local content (e.g. Domain's fifth SLO in truth.html, market nav in index.html) ⇒ **DRIFT-RECORDED**, mirror stands down. Every run publishes `mirror-report.json`.
- `wallet.html` is out of scope (parallel workstream r144-g owns it in both repos).

## Triple saos-state (open, operator gate)

`Console/saos-live.json` (cloud fold) · `sovereign/saos-live-state.json` (local) · `sovereign/saosnet-snapshot.json` (v0 archive) disagree on which treasury address is *the* authority (saos1CKtm… live fold vs saos14wWGY… genesis). Two different treasuries = potentially two different authorities — **UNRESOLVED by design**, operator-gated. Facts: `sovereign/bloc/saos-state-map.json` in the platform repo.

## Public-content watchdog (r144-i2)

`content-reviewer` (daily 05:07 UTC + dispatch, **Domain**) — duplication + staleness watchdog on the community accounts' public comments/posts. Pulls the last 24h public items via the keyless Steem API, runs the same cross-account duplication math as the home curation daemon's dedupe layer (normalized token-overlap, near-duplicate threshold 0.6), writes `content-review/report-YYYY-MM-DD.json`, and opens an issue `content-review: duplication X%` when duplication > 30%. Not a twin: the home daemon (port 3040) keeps the per-account voice profiles + the pre-cast dedupe memory and gates casting; this flow only *measures the public result* once a day and escalates. Measured first run (local pre-flight, 2026-10-01): 24 public items in the window, 1 near-duplicate pair (0.4% of cross-account pairs, 8.3% of items touched), zero silent accounts — gate not tripped.

## Rule for every future capability

**New capability lands in exactly one repo.** Truth computation / keys / proof / ledger / anchor → Console. Audience-facing content / SEO / research / market → Domain. A Domain page that needs a truth number mirrors the file; it never recomputes it. If you find yourself editing the same capability in both repos, stop — one owner, one mirror line.

## r147-c — domain differentiation law (measured 2026-10-02)

The operator's standing complaint, measured live on 2026-10-02 (5-gram text Jaccard of the served pages, `agents/twin-audit.mjs` method): **12 Console↔Domain page pairs served IDENTICAL text (1.0)**, index 0.9956, wallet 0.994, truth 0.9588; inside Domain itself, `about/index.html` ≈ `market/index-en.html` at **0.981** (same title, same headings) and `onepager/index.html` ≈ `market/onepager-en.html` at **0.9575**. Distinct names, near-identical use — exactly what the operator called out.

**The r147-c rule: a shared page is allowed only if each side carries ONE distinct real function the other does not.** Registered in `agents/twin-registry.json`, measured daily by `twin-audit.yml` (06:19 UTC), issue-gated on unknown near-dup pairs or lost capability evidence:

| pair (baseline Jaccard) | side A distinct function | side B distinct function |
|---|---|---|
| Console/money.html ↔ Domain/money.html (1.0) | Console: operator ops center (BLOC r144-h law; Console-repo work, honest boundary) | **Domain: PUBLIC PULSE DESK** — the only side rendering `public/pulse.json` (measured truth / audience / scout books, each number with its own measuredAt; canonical feed: home `GET /api/public/pulse`, keyless; refreshed daily by `public-pulse.yml` 06:04 UTC) |
| Domain/about/index.html ↔ Domain/market/index-en.html (0.981) | **about = THE DESKS** — renders `about/team.json`: 11 independent desks, own briefs, chain-measured stake/voting-power, 48h external engagement (measured, not claimed) | **market/index-en = LIVE MARKET DESK** — renders the mirrored `dex/money.json` + `dex/watch.json` books with honest staleness stamps (both pages loaded zero JSON before 2026-10-02, measured) |
| Domain/market/onepager-en.html ↔ Domain/onepager/index.html (0.9575) | REGISTERED-PENDING — tracked daily in the registry, differentiated in a later wave | |

The scout-market digests (previously home-only) are now publicly served from this repo (`agents/scout-latest.json`, verbatim public copy of the home digest, public URLs only) and surfaced in the pulse desk. New capability landed in exactly one repo per the one-bloc law: the pulse books + desks + twin-audit here, the `/api/public/pulse` feed in the home repo (Zip).
