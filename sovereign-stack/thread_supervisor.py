#!/usr/bin/env python3
"""thread_supervisor.py — cooperative micro-thread supervisor (stdlib-only).

Task 33-c. Native rebuild of the "Forever-Core / process-guard" pattern for
the sovereign stack. Two primitives, honest about CPython physics:

  guarded_call(fn, timeout_s=...)  bounds ANY single call in a daemon
      thread so a hung RPC or wedged compiler can never freeze the host
      loop. On timeout the call is ABANDONED (a running thread cannot be
      SIGKILLed from outside — documented, not hidden), an immutable
      GUARDRESET receipt is appended to RECEIPTS.chain, and the caller
      restores its operational baseline without human review.

  Heartbeat — workers beat between steps; a worker whose silence exceeds
      its stall window is flagged. Stalls are MEASURED, not guessed.
      Restart is the CALLER's loop responsibility (each --loop iteration
      is a fresh guarded_call = bounded fresh baseline, which is exactly
      the forever-daemon pattern without a second supervisor process).

Receipts: GUARDRESET-*.json (append-only) + RECEIPTS.chain hash-chain
entry via memory_store.MemoryStore — same immutability law as ALERTs.
"""
from __future__ import annotations
import hashlib
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from memory_store import MemoryStore


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _receipt(root: Path, kind: str, body: dict) -> str:
    """Immutable receipt file + chain append (mirrors health_monitor._alert)."""
    rec = Path(root)
    rec.mkdir(parents=True, exist_ok=True)
    ts = _now().replace("-", "").replace(":", "")
    h8 = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:8]
    rid = f"{ts}-{h8}"
    tmp = rec / f"{kind}-{rid}.json.tmp"
    tmp.write_text(json.dumps({"id": rid, "ts": _now(), **body},
                              ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")
    tmp.replace(rec / f"{kind}-{rid}.json")
    MemoryStore(str(rec / "RECEIPTS.chain")).append(
        kind, f"file={kind}-{rid}.json")
    return rid


def guarded_call(fn, *args, timeout_s: float = 600.0,
                 receipts_root: Path | None = None, **kwargs) -> dict:
    """Run fn(*args, **kwargs) bounded by timeout_s.

    Returns {'ok': True, 'value': ..., 'elapsed_s': ...} on success,
    {'ok': False, 'timed_out': True, ...} when abandoned. Exceptions
    PROPAGATE (measured failure, never swallowed).
    """
    box: dict = {}

    def run():
        try:
            box["value"] = fn(*args, **kwargs)
        except BaseException as e:                   # re-raised below
            box["err"] = e

    t0 = time.monotonic()
    th = threading.Thread(target=run, daemon=True, name="guarded_call")
    th.start()
    th.join(timeout_s)
    elapsed = round(time.monotonic() - t0, 3)
    if th.is_alive():
        rid = None
        if receipts_root is not None:
            rid = _receipt(Path(receipts_root), "GUARDRESET", {
                "event": "call_timeout_abandoned",
                "fn": getattr(fn, "__name__", "callable"),
                "timeout_s": timeout_s, "elapsed_s": elapsed})
        return {"ok": False, "timed_out": True, "elapsed_s": elapsed,
                "receipt_id": rid}
    if "err" in box:
        raise box["err"]
    return {"ok": True, "timed_out": False, "elapsed_s": elapsed,
            "value": box.get("value")}


class Heartbeat:
    """Named-beat watchdog: beat(name) refreshes; stalled() lists names
    whose silence exceeded their stall window."""

    def __init__(self, default_stall_s: float = 60.0):
        self.default_stall_s = default_stall_s
        self._lock = threading.Lock()
        self._beats: dict[str, float] = {}
        self._stall: dict[str, float] = {}

    def register(self, name: str, stall_s: float | None = None) -> None:
        with self._lock:
            self._beats[name] = time.monotonic()
            self._stall[name] = (stall_s if stall_s is not None
                                 else self.default_stall_s)

    def beat(self, name: str) -> None:
        with self._lock:
            self._beats[name] = time.monotonic()

    def stalled(self) -> list[str]:
        now = time.monotonic()
        with self._lock:
            return sorted(n for n, b in self._beats.items()
                          if now - b > self._stall.get(
                              n, self.default_stall_s))


if __name__ == "__main__":
    print(json.dumps(guarded_call(lambda: 42, timeout_s=5)))
    hb = Heartbeat(default_stall_s=0.2)
    hb.register("probe-loop")
    hb.beat("probe-loop")
    print(json.dumps({"stalled_after_beat": hb.stalled()}))
