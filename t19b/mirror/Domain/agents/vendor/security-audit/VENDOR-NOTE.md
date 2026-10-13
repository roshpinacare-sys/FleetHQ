# Vendored: cloudflare/security-audit-skill (validators + schema)

- **Provenance:** https://github.com/cloudflare/security-audit-skill @ `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` (2026-09-14)
- **License:** MIT, Copyright (c) 2025-2026 Cloudflare, Inc. — full text in `LICENSE-CLOUDFLARE-MIT.txt`
- **Adopted via:** CR-0007 (tier B, Z-47 wave, operator approval "כן מאשר" 2026-10-03)
- **Files:** `report-schema.json` (canonical findings/coverage format) · `validate-findings.cjs` · `validate-coverage-ledger.cjs` (+ their self-tests, kept as regression receipts)
- **Verified read-only before vendoring (Z-45):** validators require only `fs`/`path`/`util`; zero network, zero child_process; both test suites fail=0 EXIT=0 on our node.
- **Modification policy:** NO edits to vendored logic. Fleet thresholds live in fleet code, never in this directory.
