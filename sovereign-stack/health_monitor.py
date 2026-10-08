#!/usr/bin/env python3
"""health_monitor.py — Sovereign resource/status loop (stdlib-only).

Task 30-b: probes configured targets, writes the latest snapshot to
health/status.json (atomic) + appends health/history.jsonl (ts-ordered
union lane), and turns every anomaly (DOWN / slow / unexpected status)
into an IMMUTABLE alert marker in receipts/ (append-only file + hash
chain via memory_store.MemoryStore — never rewritten, only extended).

Timeout law (directive): default network timeout 90000 ms — anomalies
are measured, never guessed.

Exit codes: 0 all OK · 1 anomalies present · 3 config error.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from memory_store import MemoryStore           # noqa: E402

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = {
    "timeout_ms": 90000,
    "warn_ms": 2000,
    "targets": [
        {"name": "llamacpp-local", "url": "http://localhost:8080/health",
         "expect_status": 200},
        {"name": "nextjs-control", "url": "http://localhost:3000/",
         "expect_status": 200},
        {"name": "llm7-free", "url": "https://api.llm7.io/v1/models",
         "expect_status": 200},
        {"name": "eth-mainnet-rpc", "url": "https://eth.drpc.org",
         "method": "POST",
         "body": {"jsonrpc": "2.0", "id": 1,
                   "method": "eth_blockNumber", "params": []},
         "expect_status": 200},
        {"name": "zero-rail-rpc", "url": "https://rpc.zero.tech",
         "method": "POST",
         "body": {"jsonrpc": "2.0", "id": 1,
                   "method": "eth_blockNumber", "params": []},
         "expect_status": 200}
    ],
}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def probe(target: dict, timeout_ms: int) -> dict:
    url = target["url"]
    body = target.get("body")
    method = target.get("method") or ("POST" if body else "GET")
    data = json.dumps(body).encode() if body else None
    t0 = time.monotonic()
    try:
        req = urllib.request.Request(
            url, data=data, method=method,
            headers={"User-Agent": "sovereign-health/1",
                     **({"Content-Type": "application/json"} if data
                        else {})})
        with urllib.request.urlopen(req, timeout=timeout_ms / 1000) as r:
            status = r.status
            err = None
    except urllib.error.HTTPError as e:
        status, err = e.code, f"HTTPError {e.code}"
    except Exception as e:
        status, err = None, f"{type(e).__name__}: {e}"
    latency_ms = int((time.monotonic() - t0) * 1000)
    expect = target.get("expect_status")

    if status is None:
        verdict, detail = "DOWN", err
    elif expect is not None and status != expect:
        verdict, detail = "UNEXPECTED", f"status={status} expect={expect}"
    elif latency_ms > target.get("warn_ms", 2000):
        verdict, detail = "DEGRADED", f"latency={latency_ms}ms"
    else:
        verdict, detail = "OK", f"status={status} latency={latency_ms}ms"
    return {"name": target["name"], "url": url, "method": method,
            "status": status, "latency_ms": latency_ms,
            "verdict": verdict, "detail": detail}


def _alert(snapshot: dict, res: dict, root: Path) -> str:
    rec_dir = root / "receipts"
    rec_dir.mkdir(parents=True, exist_ok=True)
    ts = _now().replace("-", "").replace(":", "")
    body = json.dumps({"target": res["name"], "verdict": res["verdict"]},
                      sort_keys=True) + snapshot["ts"]
    h8 = hashlib.sha256(body.encode()).hexdigest()[:8]
    alert_id = f"{ts}-{h8}"
    marker = {
        "alert_id": alert_id, "ts": snapshot["ts"],
        "target": res["name"], "url": res["url"],
        "verdict": res["verdict"], "detail": res["detail"],
        "snapshot_sha256": snapshot["sha256"],
    }
    _atomic_write(rec_dir / f"ALERT-{alert_id}.json",
                  json.dumps(marker, ensure_ascii=False, indent=1) + "\n")
    MemoryStore(str(rec_dir / "RECEIPTS.chain")).append(
        "ALERT", f"target={res['name']} verdict={res['verdict']} "
                 f"file=ALERT-{alert_id}.json")
    return alert_id


def run_once(config_path: Optional[str] = None, root: Path = ROOT) -> dict:
    root = Path(root)
    cfg_path = Path(config_path) if config_path else root / "health" / "targets.json"
    if cfg_path.is_file():
        try:
            cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"CONFIG-ERROR: {e}")
            sys.exit(3)
    else:
        cfg = DEFAULT_CONFIG
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        if not cfg_path.exists():
            _atomic_write(cfg_path,
                          json.dumps(cfg, ensure_ascii=False, indent=1) + "\n")

    timeout_ms = int(cfg.get("timeout_ms", 90000))
    results = [probe(t, timeout_ms) for t in cfg.get("targets", [])]
    all_ok = all(r["verdict"] == "OK" for r in results)
    ts = _now()
    snap = {"ts": ts, "timeout_ms": timeout_ms, "all_ok": all_ok,
            "results": results}
    # attach host-memory measurement if the profiler has measured it
    mem_file = root / "health" / "mem.json"
    if mem_file.is_file():
        try:
            mem = json.loads(mem_file.read_text(encoding="utf-8"))
            snap["mem"] = {"state": mem.get("state"),
                           "mem_available_mb": mem.get("mem_available_mb"),
                           "mem_total_mb": mem.get("mem_total_mb")}
            if mem.get("state") == "LOW-MEM":
                all_ok = False
                snap["all_ok"] = False
        except Exception:
            pass
    raw = json.dumps(snap, ensure_ascii=False, sort_keys=True)
    snap["sha256"] = hashlib.sha256(raw.encode()).hexdigest()

    hdir = root / "health"
    hdir.mkdir(parents=True, exist_ok=True)
    _atomic_write(hdir / "status.json",
                  json.dumps(snap, ensure_ascii=False, indent=1) + "\n")
    with (hdir / "history.jsonl").open("a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": ts, "sha256": snap["sha256"],
                            "all_ok": all_ok,
                            "results": results},
                           ensure_ascii=False) + "\n")

    alerts = []
    for r in results:
        if r["verdict"] != "OK":
            alerts.append(_alert(snap, r, root))

    print(json.dumps({"ts": ts, "all_ok": all_ok,
                      "verdicts": {r["name"]: r["verdict"] for r in results},
                      "new_alerts": alerts, "snapshot_sha256": snap["sha256"]},
                     ensure_ascii=False))
    return snap


def main() -> int:
    ap = argparse.ArgumentParser(description="sovereign health/status loop")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SEC",
                    help="run every SEC seconds until interrupted")
    ap.add_argument("--config", default=None)
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args()
    if not a.once and not a.loop:
        a.once = True

    rc = 0
    while True:
        snap = run_once(a.config, Path(a.root))
        rc = 0 if snap["all_ok"] else 1
        if not a.loop:
            return rc
        try:
            time.sleep(a.loop)
        except KeyboardInterrupt:
            return rc


if __name__ == "__main__":
    sys.exit(main())
