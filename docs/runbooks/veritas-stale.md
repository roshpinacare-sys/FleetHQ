# Runbook: veritas-stale (the truth aggregate reads red)

veritas is the aggregate honesty verdict of the estate
(src/app/api/veritas.ts, served at :3002/api/veritas). Every source has a
freshness window (tightest 3h); anything older is named in staleSources.
A red veritas means some producer stopped producing — or produced and could
not publish.

## Trigger

- `curl -s :3002/api/veritas | jq .aggregate` with allFresh false.
- staleSources non-empty (the classic is "dex/money.json").
- Watchdog alarm on pages/money or the sandbox-ledger voice.

## First diagnostics

1. `curl -s :3002/api/veritas | jq '.aggregate'` — which sources, what ages.
2. Producer age at the source: `jq .producedAt /home/z/estate/Domain/dex/money.json`
   and the mirror chain state (`jq .at /home/z/estate/Console/dex/money.json`).
3. Beat evidence: `grep money-watch /tmp/local-beats.log | tail -5` — exit
   code plus the first 800 chars of producer output.
4. The classic silent killer: an "exit=0 out=... roster-unresolved" line.
   The beat ran, did nothing, and reported green. Check
   /home/z/estate/Console/agents/.roster-map.local.json exists (0600,
   gitignored by law — a wipe destroys it; boot-services stage4.5 rebuilds
   it) and FLEET_ROSTER_MAP resolves in /home/z/estate/.env.local.
5. Pages freshness (publish lag vs produce lag):
   `curl -s https://roshpinacare-sys.github.io/Domain/dex/money.json | jq .publishedAt`.

## Decision tree

CONTAIN
- Producer frozen, mirror fresh: the local mirror chain is the containment —
  veritas reads the freshest of Pages and the Console-local producer output
  (source is logged per file since 25-a). Identify which leg is stale before
  touching anything.
- Everything frozen since boot: suspect the roster map first (it is
  untracked BY LAW, so every wipe kills it), then the beat log.

REPAIR
- Roster unresolved: `bash /home/z/estate/FleetHQ/vault-home/boot-services.sh`
  (stage4.5 rebuilds the map from Console git history). Re-run the beat once
  by hand in beat env (cwd Console, `node agents/money-watch.mjs`) and read
  the dispatch line.
- Producer bug: fix at the producer, never by hand-editing the published
  book. Measured root causes from 2026-10-12 (the 253-minute money.json
  freeze): the zero-date sentinel "1969-12-31T23:59:59" published raw as a
  payout time, a permanently-failing redemption watch scoped as a hard
  failure, and the roster-unresolved flight kill above. All three were
  fixed in the producer; the receipt chain (money-watch → dex-mirror →
  veritas allFresh true) was proven end-to-end on-box, pushless.
- Import path errors (ERR_MODULE_NOT_FOUND in the beat log) are producer
  bugs too — a beat that crashes every flight is a frozen producer wearing
  an exit code.

VERIFY
- `curl -s :3002/api/veritas | jq .aggregate.allFresh` is true and
  staleSources empty, without restarting veritas (latest-producer-wins).
- The producer's own receipt (dex/money.json fuel.ok, dispatch.ok) reads
  honest values, not invented ones.

## Escalation

- Open an issue in roshpinacare-sys/FleetHQ with title prefix
  "VERITAS-STALE" when a source stays stale past twice its window, and
  attach receipts/silence-ledger.json plus the beat-log tail for that beat.
- Never falsify a timestamp to green a verdict. A red truth is recoverable;
  an invented green is not.

## Known past incidents

- 2026-10-12: money.json frozen 253 minutes against a 240-minute limit
  (measured at 21:01Z). Three root causes, all producer-side (sentinel date,
  watch scoping, roster-unresolved), zero infrastructure causes. veritas was
  right the whole time; the beats were the lie.
- Same day: the office mirror froze in demo-mode because the foreman booted
  without AGENT_HQ_FLEET_DIR (the wiring lived in the boot script, not in
  the service). Wiring belongs at HEAD, in git — that law produced
  boot-services.sh as a committed file.
