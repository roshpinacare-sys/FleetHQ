#!/usr/bin/env python3
"""health_monitor.py — Sovereign resource/status loop (stdlib-only).

Task 30-b: probes configured targets, writes the latest snapshot to
health/status.json (atomic) + appends health/history.jsonl (ts-ordered
union lane), and turns every anomaly (DOWN / slow / unexpected status)
into an IMMUTABLE alert marker in receipts/ (append-only file + hash
chain via memory_store.MemoryStore — never rewritten, only extended).

Task 33: alternate posting-account lane — the JSON-RPC witness array now
also parses the TRANSACTION STATE (nonce + balance) of accounts listed in
the secure credentials layer (env FLEET_WITNESS_ACCOUNTS, or
credentials/witness-accounts.json, 0600 + gitignored). Public addresses
ONLY: the loader accepts a strict whitelist of fields (label/address/via)
so a pasted private key is never read, let alone logged. Every probe's
latency + parsed state lands in history.jsonl for asset-routing fallback
loops — without altering linear repository lineage.

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
         "method": "POST", "chain": "eth",
         "body": {"jsonrpc": "2.0", "id": 1,
                   "method": "eth_blockNumber", "params": []},
         "expect_status": 200},
        {"name": "zero-rail-rpc", "url": "https://rpc.zero.tech",
         "method": "POST", "chain": "eth",
         "body": {"jsonrpc": "2.0", "id": 1,
                   "method": "eth_blockNumber", "params": []},
         "expect_status": 200}
    ],
}

ACCOUNT_FIELDS = ("label", "address", "via")   # strict whitelist —
# anything else in a credentials entry (e.g. a private key) is IGNORED,
# never read into memory, never logged.


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
    parse_mode = target.get("parse")
    t0 = time.monotonic()
    payload = None
    try:
        req = urllib.request.Request(
            url, data=data, method=method,
            headers={"User-Agent": "sovereign-health/1",
                     **({"Content-Type": "application/json"} if data
                        else {})})
        with urllib.request.urlopen(req, timeout=timeout_ms / 1000) as r:
            status = r.status
            if parse_mode:
                payload = r.read()
            err = None
    except urllib.error.HTTPError as e:
        status, err = e.code, f"HTTPError {e.code}"
    except Exception as e:
        status, err = None, f"{type(e).__name__}: {e}"
    latency_ms = int((time.monotonic() - t0) * 1000)
    expect = target.get("expect_status")

    # Task 33: JSON-RPC state parse — a 200 with an rpc-level error object
    # is measured as DOWN (honest), and result hex is decoded to int.
    result_hex = result_int = None
    if parse_mode == "jsonrpc":
        if status == 200:
            try:
                j = json.loads(payload or b"")
                if j.get("error"):
                    status = None
                    err = ("jsonrpc:" +
                           str(j["error"].get("message", j["error"])[:120]))
                else:
                    result_hex = j.get("result")
                    result_int = (int(result_hex, 16)
                                  if isinstance(result_hex, str) else None)
            except Exception as e:
                status, err = None, f"parse:{type(e).__name__}"
        else:
            err = err or "no-payload"

    if status is None:
        verdict, detail = "DOWN", err
    elif expect is not None and status != expect:
        verdict, detail = "UNEXPECTED", f"status={status} expect={expect}"
    elif latency_ms > target.get("warn_ms", 2000):
        verdict, detail = "DEGRADED", f"latency={latency_ms}ms"
    else:
        verdict, detail = "OK", f"status={status} latency={latency_ms}ms"
    out = {"name": target["name"], "url": url, "method": method,
           "status": status, "latency_ms": latency_ms,
           "verdict": verdict, "detail": detail}
    if parse_mode == "jsonrpc":
        out["result_hex"] = result_hex
        out["result_int"] = result_int
    return out


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


def load_witness_accounts(root: Path) -> tuple[list[dict], str]:
    """Secure credentials layer for alternate posting accounts.

    Resolution order: env FLEET_WITNESS_ACCOUNTS (JSON list) →
    credentials/witness-accounts.json (0600, gitignored). Entries are
    filtered through ACCOUNT_FIELDS (label/address/via) — a stray private
    key can never enter memory. Address must be a 20-byte 0x-hex string.
    Returns (accounts, source) — source is honest: env|file|absent|error.
    """
    root = Path(root)
    raw = os.environ.get("FLEET_WITNESS_ACCOUNTS")
    src = "env"
    if raw is None:
        f = root / "credentials" / "witness-accounts.json"
        if not f.is_file():
            return [], "absent"
        try:
            raw = f.read_text(encoding="utf-8")
        except Exception as e:
            return [], f"unreadable:{type(e).__name__}"
        src = "file"
    try:
        data = json.loads(raw)
    except Exception as e:
        return [], f"unparsable:{type(e).__name__}"
    if not isinstance(data, list):
        return [], "not_a_list"
    out: list[dict] = []
    for a in data:
        if not isinstance(a, dict):
            continue
        addr = a.get("address")
        if (not isinstance(addr, str) or not addr.startswith("0x")
                or len(addr) != 42
                or any(ch not in "0123456789abcdefABCDEF" for ch in addr[2:])):
            continue
        via = a.get("via")
        out.append({"label": str(a.get("label") or "acct"),
                    "address": addr.lower(),
                    "via": [str(v) for v in via] if isinstance(via, list)
                    else []})
    return out, src


def account_targets(accounts: list[dict], cfg_targets: list[dict]) -> list[dict]:
    """Nonce + balance probes per account per via-witness (Task 33).
    Deterministic ordering: label, then witness name, then nonce/balance."""
    rpcs = {t.get("name"): t for t in cfg_targets or []
            if t.get("method") == "POST" and isinstance(t.get("body"), dict)
            and t["body"].get("jsonrpc") == "2.0" and t.get("url")}
    out: list[dict] = []
    for a in sorted(accounts, key=lambda x: x["label"]):
        via = a["via"] or sorted(
            n for n, t in rpcs.items() if t.get("chain") == "eth")
        for name in via:
            t = rpcs.get(name)
            if not t:
                continue                       # honest: unknown witness → skip
            for meth, tag in (("eth_getTransactionCount", "nonce"),
                              ("eth_getBalance", "balance")):
                out.append({
                    "name": f"acct:{a['label']}:{tag}@{name}",
                    "url": t["url"], "method": "POST",
                    "body": {"jsonrpc": "2.0", "id": 1, "method": meth,
                             "params": [a["address"], "latest"]},
                    "expect_status": 200, "parse": "jsonrpc",
                    "warn_ms": 2000})
    return out


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
    accounts, acct_src = load_witness_accounts(root)
    cfg_targets = list(cfg.get("targets", []))
    targets = cfg_targets + account_targets(accounts, cfg_targets)
    results = [probe(t, timeout_ms) for t in targets]
    all_ok = all(r["verdict"] == "OK" for r in results)
    ts = _now()
    snap = {"ts": ts, "timeout_ms": timeout_ms, "all_ok": all_ok,
            "accounts": {"source": acct_src, "count": len(accounts)},
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
                      "accounts": {"source": acct_src,
                                   "count": len(accounts)},
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
