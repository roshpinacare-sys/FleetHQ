#!/usr/bin/env python3
"""telemetry_digest.py — Daily FROZEN telemetry digest → content/sources.

Task 32-a. Answers operator question 1: YES — network/host performance
reports flow into the daily Markdown content queue, but ONLY under these
guardrail laws:

  FREEZE   — one spec per UTC day. The FIRST emit freezes it; later emits
             of the same day never rewrite it (idempotent by date key).
             Deterministic bytes for the whole UTC day.
  MEASURED — every value is read from health/*.json files written by the
             sentinels. Missing files → honest skip (no spec, no crash,
             no invented numbers).
  MINIMAL  — target URLs and internal paths are NEVER included; only
             names, verdicts, latencies, counts. The content_rail secret
             scan still runs as defense-in-depth before staging.
  BOUNDED  — history tail hard-capped (default 24 records) for verdict
             aggregation.

The spec lands in content/sources/fleet-telemetry-<YYYY-MM-DD>.json and the
content_streamer compiles it through the standard rail: deterministic md →
compaction twin → hash-chained MANIFEST anchor → binary Merkle seal.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _tail_jsonl(path: Path, cap: int) -> list[dict]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    out = []
    for ln in lines[-max(1, cap):]:
        try:
            out.append(json.loads(ln))
        except Exception:
            continue
    return out


def collect(root: Path, cap: int = 24) -> dict:
    """Read measured telemetry. Honest about what is missing."""
    root = Path(root)
    h = root / "health"
    mem = _read(h / "mem.json")
    status = _read(h / "status.json")
    tps = _read(h / "tps.json")
    hist = _tail_jsonl(h / "history.jsonl", cap)
    missing = [n for n, v in
               (("mem.json", mem), ("status.json", status)) if not v]
    return {"mem": mem, "status": status, "tps": tps,
            "history": hist, "missing": missing}


def build_spec(date: str, data: dict, cap: int = 24) -> dict:
    """Deterministic spec from measured data. No clock, no randomness."""
    mem, status, tps, hist = (data.get("mem") or {},
                              data.get("status") or {},
                              data.get("tps") or {},
                              data.get("history") or [])
    witnesses = sorted(
        ((r.get("name", "?"), r.get("verdict", "?"),
          r.get("latency_ms", -1)) for r in status.get("results", [])),
        key=lambda t: t[0])

    agg: dict[str, dict] = {}
    for rec in hist:
        for r in rec.get("results") or []:
            a = agg.setdefault(r.get("name", "?"), {"ok": 0, "n": 0})
            a["n"] += 1
            if r.get("verdict") == "OK":
                a["ok"] += 1
    tot_n = sum(a["n"] for a in agg.values())
    tot_ok = sum(a["ok"] for a in agg.values())
    ok_ratio = round(100.0 * tot_ok / tot_n, 1) if tot_n else None

    meta = {"digest_date": date, "cap_history": cap}
    for k in ("cpus", "loadavg", "mem_total_mb", "mem_available_mb",
              "state", "policy_max_chars", "policy_reason"):
        if k in mem:
            meta[f"mem_{k}"] = mem[k]
    meta["health_all_ok"] = status.get("all_ok")
    meta["health_targets"] = len(status.get("results", []))
    if tps:
        meta["tps_state"] = tps.get("state")
        if tps.get("recommended_compaction_max_chars") is not None:
            meta["tps_budget"] = tps.get("recommended_compaction_max_chars")

    host_bullets = [
        f"זיכרון-זמין: {mem.get('mem_available_mb', '?')}MB מתוך "
        f"{mem.get('mem_total_mb', '?')}MB (מצב {mem.get('state', '?')})",
        f"מעבדים: {mem.get('cpus', '?')} · loadavg {mem.get('loadavg', '?')}",
        f"מדיניות-דחיסה: {mem.get('policy_max_chars', '?')} chars "
        f"({mem.get('policy_reason', '?')})",
        f"בריאות-כללית: all_ok={status.get('all_ok')} על "
        f"{len(status.get('results', []))} יעדים",
    ]
    if tps:
        host_bullets.append(
            f"אינפרנס (TPS): מצב {tps.get('state', '?')}"
            + (f" · תקציב {tps['recommended_compaction_max_chars']} chars"
               if tps.get("recommended_compaction_max_chars") is not None
               else ""))

    hist_bullets = [f"רשומות-היסטוריה נדגמו: {len(hist)} (תקרה {cap})"]
    if ok_ratio is not None:
        hist_bullets.append(f"יחס-OK כללי בדגימה: {ok_ratio}%")
    for name in sorted(agg):
        a = agg[name]
        hist_bullets.append(f"{name}: OK {a['ok']}/{a['n']}")

    return {
        "rail": "telemetry",
        "slug": f"fleet-telemetry-{date}",
        "title": f"דיג'סט-טלמטריה יומי — {date}",
        "summary": ("סיכום מדוד של מארח-הצי ועדי-השרשרת, נאסף מקבצי-הבריאות "
                    "בהקפאה הראשונה של היום (UTC). אף-ערך-לא-מומצא; "
                    "מסמך-זה עובר סריקת-סודות ועיגון שרשרת ככל-תוצר."),
        "metadata": meta,
        "sections": [
            {"heading": "מארח-חי", "bullets": host_bullets},
            {"heading": "עדי-שרשרת ומסילות",
             "table": {"headers": ["עד", "פסק-דין", "חביון-ms"],
                       "rows": [[n, v, str(l)] for n, v, l in witnesses]}},
            {"heading": "אגרגציית-היסטוריה (זנב חסום)",
             "bullets": hist_bullets},
        ],
    }


def emit(root: Path, cap: int = 24) -> dict:
    """Write today's frozen spec (once per UTC day). Never fatal."""
    root = Path(root)
    date = _today()
    out_path = root / "content" / "sources" / f"fleet-telemetry-{date}.json"
    if out_path.is_file():
        return {"emitted": False, "reason": "frozen", "path": str(out_path),
                "date": date}
    try:
        data = collect(root, cap)
        if data["missing"]:
            return {"emitted": False,
                    "reason": f"missing:{','.join(data['missing'])}",
                    "date": date}
        spec = build_spec(date, data, cap)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + "\n",
                       encoding="utf-8")
        tmp.replace(out_path)
        return {"emitted": True, "path": str(out_path), "date": date}
    except Exception as e:                      # never break the streamer
        return {"emitted": False, "reason": f"error:{type(e).__name__}:{e}",
                "date": date}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="daily frozen telemetry digest → content queue")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SEC")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--cap", type=int, default=24,
                    help="history tail cap for aggregation")
    a = ap.parse_args()
    if not a.once and not a.loop:
        a.once = True
    while True:
        res = emit(Path(a.root), a.cap)
        print(json.dumps(res, ensure_ascii=False))
        if not a.loop:
            return 0
        try:
            time.sleep(a.loop)
        except KeyboardInterrupt:
            return 0


if __name__ == "__main__":
    sys.exit(main())
