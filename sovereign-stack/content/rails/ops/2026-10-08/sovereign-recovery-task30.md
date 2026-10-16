# sovereign-recovery-task30 — containment stub (re-sanitized post-wipe, 2026-10-16)

## Status: SANITIZED STUB — the original content is P1-contained

The original rail (sha256=6acff5f0ebee8a2f200bee41f268bf0de74bc9a5258f3f01e90ec0c5d1b865a3,
2994 bytes) was removed from public HEAD by P1-containment (commit 39f32a03):
it described recovery paths and pointer material that belong to owner-side
P0 (history rewrite + rotation per Sandbox ops/SOVEREIGN-RECOVERY-PLAN sec
2/12). It is NOT restored here — the containment law outranks the ledger's
preference for green lights.

## Why this stub exists (chain law)

The hash-chained manifest stages this rel (`ops/2026-10-08/sovereign-recovery-task30`).
Last-record-wins means the ledger needs A file at this rel whose sha256
matches the newest STAGE record. This stub is that honest record:

1. It never pretends to be the contained material.
2. It documents WHY the material is absent (P1 → owner-side P0).
3. It survives wipes because it is COMMITTED (the previous stub died
   untracked in the 2026-10-16 sandbox reset — durability lesson #4).

## Durability lesson (T32)

Untracked = ephemeral. Three wipes + one reset proved it: local-brain,
2.1GB GGUF weights, MANIFEST record 8, and the previous stub all died
untracked. The law now: every sovereign artifact is committed before the
session ends; the flush drain carries it to the canon.
