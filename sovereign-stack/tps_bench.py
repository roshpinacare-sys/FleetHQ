#!/usr/bin/env python3
"""tps_bench.py — Honest Tier-0 token-speed probe (stdlib-only).

Task 30-d: measures real tokens/sec of the LOCAL inference endpoint
(llama.cpp, OpenAI-compatible, streaming) and maps the measured TPS to
a deterministic compaction budget so context windows scale down as the
host slows — tuning by measurement, not by hope.

Honesty law: if the local endpoint is not alive, this tool says so
(exit 4, LOCAL_ENDPOINT_UNREACHABLE) and writes
health/tps.json state=UNREACHABLE. It never fabricates a number.
"""
from __future__ import annotations
import argparse
import json
import statistics
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def endpoint_alive(endpoint: str, timeout: float = 3.0) -> bool:
    for path in ("/health", "/v1/models"):
        try:
            with urllib.request.urlopen(endpoint.rstrip("/") + path,
                                        timeout=timeout) as r:
                if r.status < 500:
                    return True
        except Exception:
            continue
    return False


def measure_once(endpoint: str, model: str, prompt: str,
                 max_tokens: int, timeout: float) -> dict:
    """One streaming run → tokens and generation seconds."""
    body = json.dumps({
        "model": model, "stream": True, "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        endpoint.rstrip("/") + "/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer unused"})
    tokens = 0
    t0 = time.monotonic()
    t_first = None
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        for raw in resp:
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                delta = (json.loads(payload)["choices"][0]["delta"]
                         .get("content") or "")
            except Exception:
                continue
            if delta:
                if t_first is None:
                    t_first = time.monotonic()
                tokens += 1
    t_end = time.monotonic()
    gen_s = (t_end - t_first) if t_first else 0.0
    return {"tokens": tokens, "gen_seconds": round(gen_s, 3),
            "tps": round(tokens / gen_s, 2) if gen_s > 0 else 0.0,
            "ttfb_seconds": round((t_first - t0) if t_first else 0.0, 3)}


# Measured-TPS → deterministic compaction budget (max_chars for
# compaction.compact_text): slower host ⇒ tighter context window.
def recommend_budget(tps: float) -> int:
    if tps >= 30: return 6000
    if tps >= 15: return 4000
    if tps >= 7:  return 2500
    if tps >= 3:  return 1500
    return 800


def main() -> int:
    ap = argparse.ArgumentParser(description="honest Tier-0 TPS probe")
    ap.add_argument("--endpoint", default="http://localhost:8080")
    ap.add_argument("--model", default="local-tier0")
    ap.add_argument("--tokens", type=int, default=128)
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--prompt", default="List five rules of a sovereign "
                                        "self-hosted agent stack, one line each.")
    ap.add_argument("--timeout", type=float, default=120.0)
    a = ap.parse_args()

    out_path = ROOT / "health" / "tps.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not endpoint_alive(a.endpoint):
        _atomic_write(out_path, json.dumps(
            {"ts": _now(), "endpoint": a.endpoint, "state": "UNREACHABLE",
             "note": "local inference host not alive — no number invented"},
            ensure_ascii=False) + "\n")
        print("LOCAL_ENDPOINT_UNREACHABLE "
              f"({a.endpoint}) — state written to {out_path}, exit 4")
        return 4

    runs = []
    for i in range(max(1, a.runs)):
        try:
            runs.append(measure_once(a.endpoint, a.model, a.prompt,
                                     a.tokens, a.timeout))
        except Exception as e:
            print(f"RUN-ERROR run={i + 1}: {type(e).__name__}: {e}")
    if not runs:
        _atomic_write(out_path, json.dumps(
            {"ts": _now(), "endpoint": a.endpoint, "state": "ERROR",
             "note": "endpoint alive but all runs failed"}, ensure_ascii=False)
            + "\n")
        return 5

    tps = statistics.median(r["tps"] for r in runs)
    budget = recommend_budget(tps)
    res = {"ts": _now(), "endpoint": a.endpoint, "model": a.model,
           "state": "MEASURED", "runs": runs,
           "tps_median": tps, "recommended_compaction_max_chars": budget,
           "law": "slower host ⇒ tighter context (deterministic table)"}
    _atomic_write(out_path, json.dumps(res, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({k: res[k] for k in
                      ("ts", "state", "tps_median",
                       "recommended_compaction_max_chars")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
