# Runbook: flush-stuck (unpushed commits are piling at origin)

Every unpushed commit is ephemeral: a wipe destroys it. The flush beat
(vault-home/flush.sh, fired by local-beats at :09/:24/:39/:54 UTC) drains all
three repos the moment a valid credential exists, and until then writes an
honest receipt of the gap. A stuck queue is measured, never hidden.

## Trigger

- Watchdog alarm "divergence/<repo>: push-queue stuck — ahead N > 10 for >1h"
  (persistence proven from the git history of receipts/push-queue.json).
- receipts/push-queue.json with credential "none-valid(http:NNN)" and growing
  ahead counts.
- `git rev-list --count origin/main..HEAD` > 0 in any estate repo for hours.

## First diagnostics

1. `cat /home/z/estate/FleetHQ/receipts/push-queue.json | jq .` — per-repo
   ahead/behind and the credential verdict.
2. Hunt status: `bash /home/z/estate/FleetHQ/vault-home/flush.sh` — one manual
   flight, safe (it validates before it pushes; output shows the verdict).
3. `grep -c flush /tmp/local-beats.log` and `grep flush /tmp/local-beats.log | tail`
   — is the beat firing at all? Four fires per hour are expected.
4. Credential sources the script checks, in order: GIT_PAT / GITHUB_PAT env,
   /home/z/estate/.env.local, /home/z/.secrets/keys (the token copies).
   Validation is GET api.github.com/user; anything but HTTP 200 is invalid.
5. `ls /home/z/my-project/upload/` — the owner-side copies. A pat.env that is
   redacted, or a token copy that answers 401, is the root cause.

## Decision tree

CONTAIN
- No valid credential anywhere: the queue receipt keeps measuring and the
  flush beat keeps publishing it. Nothing else to do — the gap is honest.
  Verify local durability instead: every local commit must exist in
  /home/z/estate repos (git log), and the boot script must know how to
  restore the estate after a wipe. That is the containment that matters.
- Beat not firing: local-beats down (see the silence runbook) or a scheduler
  from before the flush wiring (HEAD code wins — check
  mini-services/local-beats/index.ts contains the flush cadence).

REPAIR
- A fresh valid credential dropped anywhere in the hunt path drains the
  estate on the next slot with zero operator steps. After the first drain,
  confirm receipts/push-queue.json shows credential "valid" and ahead 0.
- Push failures WITH a valid credential (push-failed verdict): read the
  verdict row, run the estate discipline by hand in the failing repo
  (`git -c rebase.autoStash=true pull --rebase -X theirs origin main` then
  `git push origin main`), then let the beat resume.

VERIFY
- receipts/push-queue.json: credential valid, all repos ahead 0 (or the
  known remainder), receipt fresh (one slot old at most).
- The watchdog divergence voice goes quiet; the 1h-stuck alarm cannot fire
  on an empty queue.

## Escalation

- Open an issue in roshpinacare-sys/FleetHQ with title prefix
  "FLUSH-STUCK" when ahead > 10 persists past the watchdog's 1h proof, and
  attach receipts/push-queue.json.
- A queue that drains but immediately re-grows points at a producer
  committing faster than the credential allows — measure which repo grows
  and why before touching anything.

## Known past incidents

- 2026-10-12, wipe #3: every GitHub credential died with the box while local
  voices kept committing. The queue reached 77 unpushed commits across the
  three repos (FleetHQ 73, Domain 10, Console 3 by 22:43Z the same day); the
  only token copy on hand answered http:401 (revoked). The estate kept
  working pushless — veritas green, beats firing — because the gap was
  measured, not hidden.
- Same day: five flush fires within 9 seconds at the :24 slot — a bun --hot
  reload cascade re-firing a beat whose dedupe mark lived only in process
  memory. The dedupe key is now per slot, and the beat is wired at HEAD so a
  reboot carries it.
