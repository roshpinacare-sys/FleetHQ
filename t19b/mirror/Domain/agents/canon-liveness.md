# Canon Liveness — the one-bloc nerves (fresh-process desk, Z-42)

_canon-liveness v1.0.0 · 2026-10-12T12:28:24.911Z · CR-0005_

**verdict: CANON-DARK** — CANON-DARK: every cross-repo desk is an island — fix the legs before trusting any cross-repo number

| Leg | Probe | Verdict | Detail |
|---|---|---|---|
| L1 | sibling/CI checkout serves canon content | ABSENT | no readable KPI.json at /home/runner/work/Domain/Defi (DEFU_DIR=unset → ../Defi) |
| L2 | authenticated git rail (embedded remote creds, never printed) | RAIL-DOWN | Defi=unreachable(anonymous-https(no-prompt)) Domain@42ca2e4b6e4f(local-clone(origin)) steem=unreachable(anonymous-https(no-prompt)) |
| L3 | anonymous raw probe (the proven-dead fallback, kept as a standing fact-check) | DEAD-AS-EXPECTED-PRIVATE | anonymous GET fleet/KPI.json → HTTP 404 (private canon: 404 expected; 200 would mean the canon went public — book it, never assume it) |

_Root cause on record: the 23:44Z "ledger unreachable" honest null came from a tokenless raw fallback against a PRIVATE canon — dead by construction. One canon, named legs, zero hopeful greens._
