# FLEET WORLD INDICATORS (FWI) — 2026-10-12T12:28:17.765Z

Verdict: **DEGRADED** · GROW=5 HELD=2 DECLINE=2

| # | Indicator | Value | Break-even | Status | Evidence source |
|---|-----------|-------|------------|--------|-----------------|
| F1 | Population Health | 7/9 | ≥7/9 | HELD | `agents/{econ,curation,money-ledger,ventures,fills-ledger,bridge,dex,learning-ledger,recruitment}-book.json .at/.updated < 48h` |
| F2 | Safety & Public Order | denies=0 evals=PASS stasis=armed | evals PASS + stasis armed | GROW | `agents/command-guard.json .denies + agents/STASIS.json .active + evals/eval-results.json E7-E9` |
| F3 | Capability Exploration | 123/123 | 100% | GROW | `node --check over agents/*.cjs|*.mjs + scripts/*.mjs` |
| F4 | Governance Conformity | 70/78 CRs judged · registry 57 rows (53 LIVE) | 100% judged + ≥20 rows | DECLINE | `agents/change-requests/*.json verdict fields + role-registry.csv row count` |
| F5 | Public Expression | 45 posts · 291 samples | ≥20 posts | GROW | `agents/learning-ledger.json keys + samples[]` |
| F6 | Social Fabric & Diversity | tiers=4 lanes=24 ownedBooks=29 | ≥2 tiers · ≥5 lanes · ≥5 books | GROW | `role-registry.csv columns tier(7)/ci(3)/books(7) distinct counts` |
| F7 | Economic Vitality & Equity | headcorner: 28.261 STEEM liquid · 2925.633 SP · book 12.8h old | ledger fresh + executor-identified | GROW | `agents/money-ledger.json .book{executor,headSteemLiquid,headSteemStake} fresh <48h` |
| F8 | Constitutional Growth | law v1.0.6 · features 31/69 done · 1 commits/7d | law versioned + ≤2 open features + ≥20 commits/7d | DECLINE | `agents/sovereignty.md version + feature_list.json status counts + git rev-list 7d` |
| F9 | Sovereign Autonomy | verify ALL_PASS=0 · econ receipts=0 · anchors=0 → score 0 | ≥5 receipts / 7d | HELD | `git log --grep receipts (agent-verify/econ/anchor), last 7 days` |

> ANTI-GOODHART: every value above is COMPUTED from the named artifact in this commit — a claim without an artifact is not a value. Their 9 indicators scored a spectacle; ours score a sovereign estate (docs/FATE-DEFENSE.md).
