# Security Audit Report — CR-0007 guidance-mode wave (Z-47)

- **Mode:** guidance (read-only source inspection; zero target-code execution; zero live probing)
- **Scope:** fleet estate — 3 repo worktrees (Domain, Defi, steem) + local Next.js runtime
- **Date:** 2026-10-03 (Z-47 wave) · **Agent:** z47-audit · **Doctrine:** cloudflare/security-audit-skill @ c1c8a8c (vendored validators, unmodified)
- **Artifacts:** `coverage-ledger.json` (7 units — **PASS** by `validate-coverage-ledger.cjs`) · `findings.json` (7 records — **PASS** by `validate-findings.cjs`)

## Verdict summary

| # | Fingerprint | Verdict | Severity | One line |
|---|---|---|---|---|
| 1 | ci-pwn-request-or-secret-echo | **rejected** | — | Zero `pull_request_target`, zero secret echoes across 47 workflows; gitleaks live in all 3 repos |
| 2 | ci-unpinned-action-tag-refs | **confirmed** | low | 95 mutable tag refs (checkout/setup-node/upload-artifact @v4) across 41 Domain workflows; zero SHA pins |
| 3 | fleet-git-token-embedded-remote-urls-664 | **confirmed** | medium | Bearer tokens embedded in remote URLs (line 7 ×3 repos); `.git/config` mode 664, not 600 |
| 4 | gateway-xtransformport-unrestricted-pivot | **confirmed** | low | `XTransformPort=*` reverse-proxies to ANY localhost port; no allowlist (Caddyfile:2-13) |
| 5 | runtime-dev-mode-on-public-default-lane | **needs_validation** | — | Default public lane serves `next dev`; prod-build switch is a platform-owner decision |
| 6 | runtime-deps-no-advisory-crosscheck | **needs_validation** | — | Majors current (next ^16.1.1); no authoritative advisory-DB cross-check in this pass |
| 7 | skills-library-no-injection-boundary-rule | **confirmed** | low | 66 skills / 108 scripts loaded into agent context; no instruction-vs-data boundary rule in runtime conventions |

## Coverage

7/7 planned units dispositioned: 5 covered (receipted source checks), 2 blocked (exact missing facts named in NEEDS-VALIDATION.md). Additive runs: a later audit re-uses this ledger and targets gaps.

## Terminal state

All Phase-6 artifacts written; both validators pass. **run_status: complete.**

## Remediation posture (described, not applied — the audit does not modify targets)

1. **F3 (medium)** — credential helper or `insteadOf` env-injected token; `chmod 600` the three configs. Operator-level: remotes/credentials are tier C.
2. **F2 (low)** — one-pass SHA pin of used actions (dependabot or manual).
3. **F4 (low)** — replace wildcard port matcher with an enumerated allowlist of service ports.
4. **F7 (low)** — adopt the AI-AND-LLM core-discipline clause (one paragraph) into runtime conventions; follow-up CR.
