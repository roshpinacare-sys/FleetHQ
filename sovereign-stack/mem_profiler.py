#!/usr/bin/env python3
"""mem_profiler.py — Host memory law: measure → policy → protect (stdlib-only).

Task 31-b. Reads /proc/meminfo (the measured 2-CPU / ~4GB profile), writes
health/mem.json, and enforces the OOM-defense law: when MemAvailable drops
below 500 MB the compaction budget is FORCE-tightened
(health/compaction-policy.json) so content validation loops shrink their
context appetite instead of letting the kernel OOM-killer touch the
Next.js control plane.

Honesty: values are measured from the kernel, never estimated.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from memory_store import MemoryStore           # noqa: E402

ROOT = Path(__file__).resolve().parent
LOW_MEM_KB = 500 * 1024          # 500 MB directive threshold
BASE_BUDGET = 4000               # default compaction max_chars


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def parse_meminfo(text: str) -> dict:
    """Pure parser (testable): /proc/meminfo content → key kB map."""
    out = {}
    for ln in text.splitlines():
        parts = ln.split(":", 1)
        if len(parts) != 2:
            continue
        key = parts[0].strip()
        val = parts[1].strip().split()[0] if parts[1].strip() else None
        if val and (val.isdigit() or (val[0] == "-" and val[1:].isdigit())):
            out[key] = int(val)
    return out


def policy_for(avail_kb: int, total_kb: int,
               base: int = BASE_BUDGET) -> dict:
    """Deterministic compaction policy from measured memory.

    Law: slower/tighter host ⇒ tighter context. Scale budget linearly
    between 0.15× (near-OOM) and 1.0× (≥2GB available), clamped.
    """
    scale = max(0.15, min(1.0, (avail_kb / 1024) / 2000))
    max_chars = max(400, int(round(base * scale / 100.0)) * 100)
    low = avail_kb < LOW_MEM_KB
    return {"ts": _now(),
            "mem_available_mb": round(avail_kb / 1024, 1),
            "mem_total_mb": round(total_kb / 1024, 1),
            "low_mem": low,
            "max_chars": max_chars if (low or scale < 1.0) else base,
            "reason": ("low_mem_forced" if low else
                       "mem_scaled" if scale < 1.0 else "ok"),
            "law": "MemAvailable<500MB ⇒ forced tighter compaction (OOM defense)"}


def effective_budget(mem_json: dict | None, tps_json: dict | None,
                     base: int = BASE_BUDGET) -> int:
    """Compose the two budgets: memory policy ∩ tps policy = the tighter one."""
    budgets = [base]
    if mem_json and isinstance(mem_json.get("policy_max_chars"), int):
        budgets.append(mem_json["policy_max_chars"])
    if tps_json and isinstance(
            tps_json.get("recommended_compaction_max_chars"), int):
        budgets.append(tps_json["recommended_compaction_max_chars"])
    return min(budgets)


def _alert_low_mem(snap: dict, root: Path) -> str:
    rec_dir = root / "receipts"
    rec_dir.mkdir(parents=True, exist_ok=True)
    ts = _now().replace("-", "").replace(":", "")
    h8 = hashlib.sha256(json.dumps(snap, sort_keys=True).encode()).hexdigest()[:8]
    alert_id = f"{ts}-{h8}"
    marker = {"alert_id": alert_id, "ts": snap["ts"], "target": "host-memory",
              "verdict": "LOW-MEM", "detail": snap["detail"],
              "mem_available_mb": snap["mem_available_mb"]}
    _atomic_write(rec_dir / f"ALERT-{alert_id}.json",
                  json.dumps(marker, ensure_ascii=False, indent=1) + "\n")
    MemoryStore(str(rec_dir / "RECEIPTS.chain")).append(
        "ALERT", f"target=host-memory verdict=LOW-MEM file=ALERT-{alert_id}.json")
    return alert_id


def profile(root: Path = ROOT, base: int = BASE_BUDGET) -> dict:
    root = Path(root)
    raw = Path("/proc/meminfo").read_text(encoding="utf-8", errors="ignore")
    mi = parse_meminfo(raw)
    total_kb = mi.get("MemTotal", 0)
    avail_kb = mi.get("MemAvailable", mi.get("MemFree", 0))
    try:
        cpus = os.cpu_count() or 0
        load = Path("/proc/loadavg").read_text().split()[0]
    except Exception:
        cpus, load = 0, None

    pol = policy_for(avail_kb, total_kb, base)
    snap = {"ts": pol["ts"], "cpus": cpus, "loadavg": load,
            "mem_total_mb": pol["mem_total_mb"],
            "mem_available_mb": pol["mem_available_mb"],
            "state": "LOW-MEM" if pol["low_mem"] else "OK",
            "detail": f"available={pol['mem_available_mb']}MB "
                      f"threshold={LOW_MEM_KB // 1024}MB",
            "policy_max_chars": pol["max_chars"],
            "policy_reason": pol["reason"]}
    (root / "health").mkdir(parents=True, exist_ok=True)
    _atomic_write(root / "health" / "mem.json",
                  json.dumps(snap, ensure_ascii=False, indent=1) + "\n")
    _atomic_write(root / "health" / "compaction-policy.json",
                  json.dumps(pol, ensure_ascii=False, indent=1) + "\n")
    alert = None
    if pol["low_mem"]:
        alert = _alert_low_mem(snap, root)
    print(json.dumps({"ts": snap["ts"], "state": snap["state"],
                      "mem_available_mb": snap["mem_available_mb"],
                      "policy_max_chars": pol["max_chars"],
                      "new_alert": alert}, ensure_ascii=False))
    return snap


def main() -> int:
    ap = argparse.ArgumentParser(description="host memory profiler + OOM law")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SEC")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--base-budget", type=int, default=BASE_BUDGET)
    a = ap.parse_args()
    if not a.once and not a.loop:
        a.once = True
    rc = 0
    while True:
        snap = profile(Path(a.root), a.base_budget)
        rc = 1 if snap["state"] == "LOW-MEM" else 0
        if not a.loop:
            return rc
        try:
            time.sleep(a.loop)
        except KeyboardInterrupt:
            return rc


if __name__ == "__main__":
    sys.exit(main())
