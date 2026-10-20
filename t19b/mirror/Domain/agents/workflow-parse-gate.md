# Workflow Parse Gate — every lane must be able to run

_workflow-parse-gate v1.0.0 · 2026-10-04T16:18:14.763Z · dir .github/workflows_

**PARSE-GATE GREEN: 55 workflows scanned, mode full, 0 offenders**

- recruit.yml incident (Task 24): `${{ }}` inside flow mappings → GitHub startup-failure on every push, 0 jobs, cron never fired. Caught by the ONE-BLOC desk CI-health review; now mechanically gated here.

_Two-mode floor: full YAML parse (python3+PyYAML) where available, pure-JS idiom floor otherwise — evidence names the mode that held._
