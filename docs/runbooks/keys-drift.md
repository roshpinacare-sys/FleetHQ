# Runbook: keys-drift (the keyring and the chain disagree)

Keys are measured two ways: what the estate HOLDS (the vault copies) and
what is LIVE on chain (the census). Drift between the two is the alarm — a
held key that no longer matches the chain, a chain account with no held
key, or a credential that quietly died. Token revocation was once
discovered by accident; it must be discovered by measurement.

## Trigger

- keys-census receipt (Domain/agents/receipts/keys-census-*.json) with
  rpcErrors non-empty, live-on-chain counts collapsed against the previous
  receipt, or "NO OPERATIONAL KEYS" while the vault should be sealed-in.
- A credential verdict of http:401 (or any non-200) from the flush receipt
  or any push lane.
- FLEET_ROSTER_MAP unresolved anywhere — see the veritas-stale runbook.

## First diagnostics

1. Latest census: `ls -t /home/z/estate/Domain/agents/receipts/keys-census-*.json | head -1`
   then `jq '{at, candidates, liveOnChain, rpcErrors}' <file>`.
2. Chain probe by hand (one channel): `curl -s https://api.steemit.com -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","method":"condenser_api.get_accounts","params":[["acct-00-name-resolved-from-roster"]],"id":1}' | jq '.result[0] | {name, created}'`
   — resolve the name through the roster map; never paste a held name from
   memory into a shell line.
3. Held inventory: `ls /home/z/.secrets/keys/` — names and timestamps only.
   Fingerprint law: an upload copy is trusted only after
   `sha256sum <file>` matches the canon recorded in worklog.md (16-hex
   prefixes; contents never printed, never logged).
4. Token validity: `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: token $GIT_PAT" https://api.github.com/user`
   — expect 200; 401 means revoked. The token value itself is never echoed.

## Decision tree

CONTAIN
- A revoked token: stop using it everywhere (flush.sh validates before it
  pushes, so a dead token cannot half-drain). The queue keeps measuring.
  No rotation steps live in this runbook — rotation is an owner-side deed;
  the estate's duty is to detect and to keep draining the moment a valid
  credential appears.
- Census zeroed on one channel: harden before trusting — the 2026-10-12
  HIVE=0 drift was a single-shot API flake against one endpoint, printed as
  if measured. The census now carries per-channel endpoint fallback, retry
  rounds with backoff, and rpcErrors recorded IN the receipt; a zero must
  come with a recorded rpcError or it is not a zero.

REPAIR
- Census tool crashed (check the beat/Actions log for a ReferenceError or
  import failure): fix the tool, re-run, compare against the previous
  receipt's counts before writing conclusions.
- Vault copy missing after a wipe: restore from /home/z/my-project/upload
  (boot-services stage1 does this, fingerprint-checked). The vault itself
  unseals owner-side; the estate never needs key material to prove health.

VERIFY
- Two consecutive census receipts agree (same candidates, same live counts,
  empty rpcErrors).
- The flush receipt shows a valid credential where a token was just
  restored, and ahead counts drain to 0 within one slot.

## Escalation

- Open an issue in roshpinacare-sys/FleetHQ with title prefix "KEYS-DRIFT"
  and attach the census receipt ONLY (receipts are name-ref-keyed; if a
  receipt carries a raw account name, treat it as an exposure and scrub
  before attaching).
- Never attach, paste, or log key material, seed phrases, or token values —
  not even "just the first characters". Fingerprints and verdicts travel;
  secrets never do.

## Known past incidents

- 2026-10-12: the only GitHub token on the box was revoked (API 401,
  verified) and this was discovered by accident while debugging a push
  failure — no validity lane existed. The flush daemon now validates every
  flight before it pushes.
- Same day: census HIVE channel printed an empty live set from a single
  flaked API call (previous receipt had 11 live accounts on the same
  candidates). Hardened with fallback endpoints and retries; re-measured
  STEEM 14 / HIVE 11 live on chain, both endpoints healthy.
