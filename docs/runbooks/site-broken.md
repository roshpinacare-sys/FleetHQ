# Runbook: site-broken (the live public site is failing its own audit)

The site audits itself on every push and on schedule (Domain site-link-audit,
agents/site-auditor.mjs). A FAIL receipt is the alarm. The site is the public
face — a broken link there is a broken claim everywhere.

## Trigger

- Watchdog alarm "pages/site-audit: LIVE SITE BROKEN (N findings)".
- https://roshpinacare-sys.github.io/Domain/agents/site-audit.json with
  summary.findings > 0.
- Actions workflow site-link-audit red in roshpinacare-sys/Domain.

## First diagnostics

1. `curl -s https://roshpinacare-sys.github.io/Domain/agents/site-audit.json | jq '{at, findings: .summary.findings, urls: [.findings[].url]}'`
   (field names per the receipt; read the whole file first if in doubt).
2. Re-measure each finding by hand: `curl -s -o /dev/null -w '%{http_code}' <url>` —
   the auditor has been right every time so far (double-confirmed 2026-10-12).
3. Identify the introducing commit: `git -C /home/z/estate/Domain log --oneline -10 -- index.html`
   and compare with the audit history in agents/site-audit.json.

## Decision tree

CONTAIN
- If the finding is a dead link on the front page, de-link or replace it in
  the local Domain tree FIRST (one commit, one motion — see the race law
  below), then let the audit cycle re-run.
- If the finding is a missing external resource (a repo that moved, a 403 on
  a scanner), fix the target or annotate the link honestly; never mute the
  auditor.

REPAIR
- Commit to Domain with the pull-rebase discipline:
  `git -c rebase.autoStash=true pull --rebase -X theirs origin main` before
  the commit; upstream wins by law.
- Race law (measured twice on 2026-10-12): a stale worktree commit
  (0a13b548) re-introduced three dead front-page links AFTER they were fixed
  (second regression of the same links). Edit, commit, and verify HEAD in one
  motion. After any commit, `git log -1 --stat` must show exactly what was
  intended.
- Local beats publish automatically; a red site stays red until the flush
  drains (see the flush-stuck runbook).

VERIFY
- Next audit flight: findings 0. The watchdog closes the alarm itself.
- Byte-law: before declaring corruption in any YAML/HTML, dump codepoints
  (`od -c`) — the operator console has fabricated "broken" bracket sequences
  in display more than once; the bytes were intact.

## Escalation

- Open an issue in roshpinacare-sys/Domain with title prefix
  "SITE-BROKEN" if the alarm persists across three audit cycles, and attach
  the site-audit.json receipt.
- If the audit itself stops running (receipt age grows past 24h), that is a
  silence alarm on the auditor voice, not a site alarm.

## Known past incidents

- 2026-10-12T20:55:54Z: FAIL with 3 findings (TruthRail repo 404,
  Sandbox research LEDGER.md 404, sovereign-lighthouse pages 404).
  Independently re-measured, all three real. Fixed, then re-broken by a
  racing stale commit at 21:09Z, then healed again by the twins' own cycle
  (FAIL at 21:29 to findings 0 at 22:01) with no operator in the loop.
