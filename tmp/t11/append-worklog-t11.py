#!/usr/bin/env python3
"""Idempotent append of Task 11 section to worklog.md with readback assert."""
import os

WL = "/home/z/my-project/worklog.md"
MARKER = "Task ID: 11-chain-truth-and-pulses"

section = """
---
Task ID: 11-chain-truth-and-pulses
Agent: main (T11, owner mandate: un-mute all folders, office+domain alive, no fakes, one organism)

Work Log:
- Recon (md5-stamped): 9 public repos + private steem mapped; found Task 9-c tombstones
  (16:23-24Z) on 5 repos; zai-sec-1a12af86 registered scope 19:05Z (office+living domain);
  stayed off its lane. No trampling.
- CHAIN VERDICT (independent, api.steemit.com + api.hive.blog, 19:1xZ):
  * Delegation waves REAL: 14:49:51Z 13 ops ~488.7 SP gross; 15:18:18Z 10 ops ~525.2 SP
    gross (the "525.20" T9 flagged as fake at 14:00Z landed AFTER its scan — no forgery);
    15:48/16:18 re-set waves. Engine self-report ALREADY-TODAY (18:46Z) consistent.
  * Floors still open (honest numbers): treasury 2925.6 netSP (<3000), ALL 10 operators
    <100 SP (wog 11.9 .. israelnews 94.0), soldiers 17.0 (<20), hcsoldier1/2/3 empty.
  * Economic gap: floors need ~429.5 SP; available above keep-2800 = 125.6 SP; options
    recorded (banned 244.2 SP inflow recovery ~57%, tiered floors, DEX micro-trading live:
    1,480 order ops + 25 fills today, Hive 13,036.5 liquid).
  * Verified true: cornerstone 102,433.3 HP; blurt 1/7 nodes (saboin) honest.
- Revival verified (anti-fake): zai-code-3/E-series revived 5 repos at 19:19:37..57Z;
  independent check 19:2xZ — tombstones gone, REVIVAL present, archived:false on all 5.
- PULSES WIRED (create-only, keyless, no secrets): lighthouse-pulse.yml (cron 13,43 * * *
  *) + beacon-pulse.yml (cron 27 * * * *) — fetch Sandbox ledger + runtime commits + Steem/
  Hive RPC, fail-soft honest degraded flag, bounded appends. Both dispatched, both SUCCESS
  (19:26:19Z / 19:26:24Z), lastPulse readback matches my chain numbers exactly
  (treasury 2925.6, minOp 11.9, degraded=false). Lighthouse/beacon no longer stale
  (were ~25h/37h silent).
- ESTATE-TRUTH doc pushed: Sandbox@main ops/sovereign/ESTATE-TRUTH-2026-10-11.md
  (commit 4b9b30c014, readback md5 x2 match) — one-organism map, chain verdict,
  agent-ownership contract (zai-sec: office+domain; E-series: revivals; T11: truth+pulses).

Stage Summary:
- TRUE (verified): 5 repos revived; lighthouse+beacon alive on 30/60-min pulses; delegation
  waves real (~1,014 SP gross); engine self-reports honest; cornerstone Hive claim exact.
- OPEN (owner-level): floors deficit ~304 SP after available budget — tiered floors vs
  top-up vs banned-inflow recovery; office+living-domain (zai-sec working); GEN-3 rotation
  per T10 law; PAT overlap rotation at session end.
- COORDINATION: next agent MUST read ops/sovereign/ESTATE-TRUTH-2026-10-11.md +
  zai-sec README before touching FleetHQ/Domain/lighthouse/beacon; pulses are append-only
  bounded (40) — do not rewrite state.json by hand.
"""

if os.path.exists(WL):
    body = open(WL, encoding="utf-8").read()
    assert MARKER not in body, "already appended"
else:
    body = ""
body = body.rstrip() + "\n" + section
open(WL, "w", encoding="utf-8").write(body)

check = open(WL, encoding="utf-8").read()
assert MARKER in check and check == body, "readback mismatch"
print("WORKLOG-APPENDED bytes:", len(body))
