# Security Audit Anti-Patterns (adopted doctrine, attributed)

> Lifted verbatim-in-substance from cloudflare/security-audit-skill @ c1c8a8c (MIT, © 2025-2026 Cloudflare, Inc.), SKILL.md "Anti-patterns".
> Adopted via CR-0007 as judge-adjacent documentation — NOT as code. Our checks stay in `harness-audit.cjs`; this file is the doctrine mirror the judge culture reads from.

1. Checklist deviations presented as vulnerabilities.
2. Defense-in-depth advice with no reachable boundary violation.
3. Live or shared-environment testing where bounded local evidence is insufficient.
4. Guessing provider, proxy, browser, identity, or deployment behavior not present in source.
5. Treating intended same-principal authority or self-impact as a cross-boundary result.
6. Reporting a parser or runtime effect stronger than the observed effect.
7. Emitting prose-only hunter results that cannot be deduplicated or verified.
8. Re-reporting carried same-source prior confirmed records or using them as exemplars that anchor the hunt.
9. Assigning severity to `needs_validation` records.
10. Writing the report before independent verification or letting prose and JSON disagree.

## Fleet mapping (Z-47 receipts of the same laws already in force)

- #1–#2 ↔ verify-then-sign: a red row without a receipt is simulation.
- #3 ↔ execution-surface ironclad: Hive internal / hive-engine / Blurt only; no live probing.
- #6 ↔ honest booking: `booked as null, never estimated` (venture-desk 23:44Z precedent).
- #9 ↔ verdict taxonomy: EXP-UNRESOLVED carries no severity (BEE 1.853 precedent).
- #10 ↔ prose/JSON agreement: REPORT.md is derived from findings.json, never hand-written ahead of it.
