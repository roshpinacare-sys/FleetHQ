# broadcast/ — the staged content rail

This directory is the boundary between **measured local truth** and any
**public rail** (Steem/Blurt or anything else).

## The law

1. `staging/` is a RUNTIME buffer written by
   `mini-services/agent-hq/tools/post-batcher.ts`. It is **gitignored** —
   it churns on every run and its packages are projections of the Domain
   books, which are already the source of truth.
2. Packages carry `kind: "ledger.post.draft"` — honest DRAFTS. They are
   **not** signed transactions: `signed: false`, `broadcast: false`.
3. `amounts: { "USDS": 0 }` always. Zero artificial metrics, zero simulated
   balances — every value traces to a measured book and the current Merkle
   lineage root from `receipts/books-lineage.json`.
4. A package is `BROADCAST-READY` only when its book was readable, the
   standard `sovereign-stack/compaction.py` succeeded, and the lineage root
   existed. Otherwise it is `HELD` with the reason. Never READY on partial
   evidence.
5. **Broadcasting is a separate, explicit step** — it requires:
   - a `dryrun-sign` gate (dry-run the exact transaction bytes first), and
   - explicit owner release.
   The batcher itself never touches keys and never opens a socket.

## Regenerate the buffer

```bash
bun mini-services/agent-hq/tools/post-batcher.ts
# → 11 packages + index.json in staging/ (bounded to the newest 30)
```
