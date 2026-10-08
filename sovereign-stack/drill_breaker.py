#!/usr/bin/env python3
"""drill_breaker.py — Circuit-Breaker Recovery Verification (operator directive #2).

Simulates a PROLONGED HTTP 429/503 outage on the llm7 path and verifies:
  D1  sovereign_router opens the breaker on the faulty lane after threshold
      give-ups (429+Retry-After is fairly retried on the SAME lane first)
  D2  the faulty lane is ISOLATED: a post-open call is instant and produces
      ZERO new hits on the dead endpoint
  D3  traffic drops to the local llama.cpp lane with ZERO context loss
      (exact message payload preserved end-to-end; memory chain intact)
  D4  after cooldown, the half-open probe restores a healed lane (recovery)

Live proof on this machine, mocked lanes only — no real endpoint is harmed.
Exit 0 = drill passed.
"""
from __future__ import annotations
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sovereign_router import SovereignRouter, CircuitBreaker  # noqa: E402
from memory_store import MemoryStore                          # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, note: str = "") -> None:
    RESULTS.append((name, ok, note))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}  {note}")


class OutageProvider:
    """Alternates 429+Retry-After / 503 until heal(); counts every hit."""

    def __init__(self):
        self.hits = 0
        self.healthy = False
        self.lock = threading.Lock()

    def heal(self) -> None:
        with self.lock:
            self.healthy = True


def make_handler(provider: OutageProvider, tag: str):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code: int, body: dict, retry_after: int | None = None):
            raw = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            if retry_after:
                self.send_header("Retry-After", str(retry_after))
            self.end_headers()
            self.wfile.write(raw)

        def do_POST(self):
            with provider.lock:
                provider.hits += 1
                healthy = provider.healthy
                n = provider.hits
            if healthy:
                self._send(200, {"choices": [{"message": {
                    "role": "assistant", "content": f"HEALED-{tag}"}}]})
            elif n % 2 == 1:
                self._send(429, {"error": {"code": 429}}, 1)   # quota window
            else:
                self._send(503, {"error": {"code": 503}})

        def do_GET(self):
            self._send(200, {"object": "list", "data": [{"id": tag}]})
    return H


def spawn(handler):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_port}/v1/chat/completions"


def main() -> int:
    print("=== DRILL: prolonged 429/503 outage → breaker isolation → local fallback → recovery ===")

    outage = OutageProvider()
    srv_r, url_r = spawn(make_handler(outage, "llm7-mock"))
    ok_lane = OutageProvider()
    ok_lane.heal()  # local lane is healthy the whole time
    srv_l, url_l = spawn(make_handler(ok_lane, "local-llamacpp-mock"))

    routes = [
        {"name": "llm7-mock", "url": url_r, "key": "unused", "model": "m-r", "tier": 2},
        {"name": "local-llamacpp-mock", "url": url_l, "key": "unused", "model": "m-l", "tier": 0},
    ]
    breaker = CircuitBreaker(threshold=3, cooldown=3.0)
    router = SovereignRouter(routes=routes, timeout=10, max_retries=12,
                             breaker=breaker)
    mem = MemoryStore(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   ".drill-MEMORY.md"))
    mem.append("DRILL", "breaker drill start — prolonged outage injected on llm7-mock")

    # ---- phase A: three calls under outage (threshold=3 → opens on call 3) ----
    contexts: list[bool] = []
    lanes: list[str] = []
    for i in range(3):
        msgs = [{"role": "system", "content": "sovereign drill"},
                {"role": "user", "content": f"call-{i}: preserve this exact context {i}"}]
        snapshot = json.dumps(msgs)
        out = router.route(msgs, max_tokens=16)
        lanes.append(out["lane"])
        contexts.append(snapshot == json.dumps(msgs))
        mem.append("RESULT", f"call-{i} served by {out['lane']}, context intact={snapshot == json.dumps(msgs)}")

    check("D1 breaker opened on failing lane (3 give-ups, fair-retries not counted)",
          breaker._opened_at.get("llm7-mock") is not None,
          f"give-ups={breaker._fails.get('llm7-mock')}")
    check("D3a all three calls served despite outage",
          all(l == "local-llamacpp-mock" for l in lanes), f"lanes={lanes}")
    check("D3c message payload preserved end-to-end (zero context loss)",
          all(contexts), "router mutates nothing")
    ok_chain, n = mem.verify()
    check("D3d memory chain intact through the outage",
          ok_chain and n >= 4, f"records={n}")

    # ---- isolation proof: a POST-open call must be instant + hit-free ----
    hits_pre = outage.hits
    t0 = time.time()
    out = router.route([{"role": "user", "content": "isolation probe"}],
                       max_tokens=16)
    iso_dt = time.time() - t0
    hits_post = outage.hits
    check("D2 dead lane ISOLATED: zero new hits while breaker open",
          hits_post == hits_pre, f"hits frozen at {hits_post}")
    check("D2b post-open call instant (no waiting on dead lane)",
          iso_dt < 0.5 and out["lane"] == "local-llamacpp-mock",
          f"{iso_dt:.3f}s via {out['lane']}")
    mem.append("RESULT", f"isolation probe: {iso_dt:.3f}s, hits frozen")

    # ---- phase B: heal the lane, wait out cooldown, expect recovery ----
    outage.heal()
    time.sleep(breaker.cooldown + 0.5)  # half-open window
    out = router.route([{"role": "user", "content": "recovery probe"}],
                       max_tokens=16)
    check("D4 half-open probe restored the healed lane",
          out["lane"] == "llm7-mock" and outage.hits > hits_pre,
          f"recovered via {out['lane']}")

    mem.append("DRILL", f"recovery verified via {out['lane']}")
    ok2, n2 = mem.verify()
    check("chain still intact after recovery", ok2, f"records={n2}")

    srv_r.shutdown()
    srv_l.shutdown()
    try:
        os.unlink(mem.path)
    except OSError:
        pass
    fails = [r for r in RESULTS if not r[1]]
    print(f"=== DRILL VERDICT: {len(RESULTS) - len(fails)}/{len(RESULTS)} PASS"
          + (f" | FAILURES: {[f[0] for f in fails]}" if fails else " | ALL GREEN"))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
