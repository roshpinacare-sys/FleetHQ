#!/usr/bin/env python3
"""mem_profiler.py — Host memory law: measure → policy → protect (stdlib-only).

Task 31-b. Reads /proc/meminfo (the measured 2-CPU / ~4GB profile), writes
health/mem.json, and enforces the OOM-defense law: when MemAvailable drops
below 500 MB the compaction budget is FORCE-tightened
(health/compaction-policy.json) so content validation loops shrink their
context appetite instead of letting the kernel OOM-killer touch the
Next.js control plane.

Task 32-b (operator question 2): graduated memory guard — NO blind
thread-killing. Defense in tiers, every action receipted:
  >= 600MB  OK       — nothing
  <  600MB  SOFT     — soft purge of REGENERABLE artifacts only
                       (history.jsonl trimmed to last 50 lines, stray
                       *.tmp removed) + GUARDPURGE receipt in RECEIPTS.chain
  <  400MB  HARD     — everything above + SIGTERM ONLY to processes that
                       match the EXPLICIT allowlist (guard-allowlist.txt)
                       AND are NOT protected-core AND are provably idle
                       (zero CPU-tick delta over the sample window).
                       Default is DRY-RUN (GUARDDRAFT receipt, no signal);
                       real signals only with --guard-enforce.

Honesty: values are measured from the kernel, never estimated.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from memory_store import MemoryStore           # noqa: E402

ROOT = Path(__file__).resolve().parent
LOW_MEM_KB = 500 * 1024          # 500 MB directive threshold
BASE_BUDGET = 4000               # default compaction max_chars

# --- Task 32-b graduated guard tiers -------------------------------------
SOFT_KB = 600 * 1024             # tier-1 boundary: soft purge
HARD_KB = 400 * 1024             # tier-2 boundary: allowlisted idle-kill

# Protected core: substring match against "comm cmdline" (lowercased).
# The control plane and the sentinels are NEVER killable, even if an
# operator allowlists them by mistake. Over-protection is the safe side.
PROTECTED_CORE = (
    "next dev", "next-server", "node_modules/next", "bun run dev",
    "key-absorb", "agent-hq", "caddy",
    "mem_profiler.py", "health_monitor.py", "content_streamer.py",
    "tamper_watch.py", "content_rail.py", "telemetry_digest.py",
    "selftest.py", "sovereign_router.py", "memory_store.py",
    "compaction.py", "fork_consensus.py", "mcp_min.py", "tps_bench.py",
    "vault_env_bridge.py", "drill_breaker.py", "fleet-vault", "fleethq",
    "/git", "git ", "postgres", "redis-server", "nginx",
)
PAGE_SIZE = os.sysconf("SC_PAGE_SIZE") if hasattr(os, "sysconf") else 4096


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


def tier_for(avail_kb: int) -> str:
    """Graduated guard tier (pure, testable)."""
    if avail_kb < HARD_KB:
        return "HARD"
    if avail_kb < SOFT_KB:
        return "SOFT"
    return "OK"


def parse_stat(raw: str) -> dict:
    """Pure /proc/<pid>/stat parser. comm may contain spaces/parens →
    split after the LAST ')'. Returns state, cpu ticks, rss pages."""
    comm = raw[raw.index("(") + 1: raw.rindex(")")]
    tail = raw[raw.rindex(")") + 1:].split()
    state = tail[0] if tail else "?"
    ticks = (int(tail[11]) + int(tail[12])) if len(tail) > 12 else 0
    rss_pages = int(tail[21]) if len(tail) > 21 else 0
    return {"comm": comm, "state": state, "ticks": ticks,
            "rss_pages": rss_pages}


def read_procs() -> list[dict]:
    """Snapshot of runnable processes (stdlib /proc walk)."""
    out: list[dict] = []
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            raw = (p / "stat").read_text(encoding="utf-8", errors="ignore")
            st = parse_stat(raw)
            try:
                cl = (p / "cmdline").read_bytes().decode(
                    "utf-8", "ignore").replace("\x00", " ").strip()
            except OSError:
                cl = ""
            out.append({"pid": int(p.name), "comm": st["comm"],
                        "cmdline": cl or f"[{st['comm']}]",
                        "state": st["state"], "ticks": st["ticks"],
                        "rss_kb": round(st["rss_pages"] * PAGE_SIZE / 1024)})
        except (OSError, ValueError, IndexError):
            continue                              # process vanished mid-read
    return out


def load_allowlist(path: Path) -> list[str]:
    """Explicit kill-allowlist. '#' comments ignored. Empty file ⇒
    NOTHING is ever killable (the shipped default)."""
    try:
        lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    return [ln.strip() for ln in lines
            if ln.strip() and not ln.strip().startswith("#")]


def classify(proc: dict, allowlist: list[str]) -> str:
    """protected (ALWAYS wins) | killable | other."""
    hay = f"{proc.get('comm', '')} {proc.get('cmdline', '')}".lower()
    for pat in PROTECTED_CORE:
        if pat.lower() in hay:
            return "protected"
    for pat in allowlist:
        if pat.lower() in hay:
            return "killable"
    return "other"


def idle_check(pid: int, sample_s: float = 1.0) -> tuple[bool, int, int]:
    """Provably idle = zero CPU-tick delta across the sample window."""
    def _ticks() -> int:
        raw = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8",
                                                  errors="ignore")
        return parse_stat(raw)["ticks"]
    t0 = _ticks()
    time.sleep(sample_s)
    t1 = _ticks()
    return (t1 - t0 == 0), t0, t1


def soft_purge(root: Path, keep_lines: int = 50) -> dict:
    """Tier-1 action: touch ONLY regenerable artifacts (bounded)."""
    root = Path(root)
    trimmed = tmps = 0
    hp = root / "health" / "history.jsonl"
    if hp.is_file():
        lines = hp.read_text(encoding="utf-8").splitlines()
        if len(lines) > keep_lines:
            _atomic_write(hp, "\n".join(lines[-keep_lines:]) + "\n")
            trimmed = len(lines) - keep_lines
    for f in root.rglob("*.tmp"):
        if ".git" in f.parts:
            continue
        try:
            f.unlink()
            tmps += 1
        except OSError:
            pass
    return {"trimmed_history": trimmed, "removed_tmp": tmps,
            "keep_lines": keep_lines}


def _ts_gap(ts: str) -> float:
    try:
        then = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(
            tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - then).total_seconds()
    except Exception:
        return float("inf")


def _receipt(root: Path, kind: str, payload: dict) -> str:
    rec_dir = root / "receipts"
    rec_dir.mkdir(parents=True, exist_ok=True)
    ts = _now().replace("-", "").replace(":", "")
    h8 = hashlib.sha256(json.dumps(payload, sort_keys=True).encode())\
        .hexdigest()[:8]
    rid = f"{ts}-{h8}"
    _atomic_write(rec_dir / f"{kind}-{rid}.json",
                  json.dumps({"receipt_id": rid, "ts": _now(), **payload},
                             ensure_ascii=False, indent=1) + "\n")
    MemoryStore(str(rec_dir / "RECEIPTS.chain")).append(
        kind, f"target=mem-guard tier={payload.get('tier')} "
              f"file={kind}-{rid}.json")
    return rid


def guard(root: Path, avail_kb: int, enforce: bool = False,
          sample_s: float = 1.0, cooldown_s: int = 300) -> dict:
    """Graduated memory guard. Every action receipted, never fatal.

    Receipt anti-spam: purge/draft receipts are written on tier entry or
    after cooldown expiry; REAL kills are ALWAYS receipted (each one is a
    real event, not noise).
    """
    root = Path(root)
    (root / "health").mkdir(parents=True, exist_ok=True)
    tier = tier_for(avail_kb)
    out: dict = {"tier": tier, "enforce": enforce, "actions": [],
                 "receipts": [], "candidates": []}
    stf = root / "health" / "guard-state.json"
    try:
        prev = json.loads(stf.read_text(encoding="utf-8"))
    except Exception:
        prev = {}
    fresh = (prev.get("tier") != tier
             or _ts_gap(prev.get("ts", "")) >= cooldown_s)

    if tier == "OK":
        _atomic_write(stf, json.dumps({"tier": tier, "ts": _now()},
                                      ensure_ascii=False, indent=1) + "\n")
        return out

    act = soft_purge(root)
    out["actions"].append({"soft_purge": act})
    if fresh:
        out["receipts"].append(_receipt(root, "GUARDPURGE", {"tier": tier,
                                                             **act}))

    if tier == "HARD":
        allow = load_allowlist(root / "guard-allowlist.txt")
        protected = {os.getpid(), os.getppid()}   # absolute self-exclusion
        for p in read_procs():
            if p["pid"] in protected:
                continue
            if classify(p, allow) != "killable":
                continue
            idle, t0, t1 = idle_check(p["pid"], sample_s)
            if not idle:
                # grace re-sample: a just-spawned process burns CPU during
                # interpreter startup; one extra window prevents a false
                # "busy" verdict on a cold candidate. A genuinely busy
                # process fails both windows → still not killable.
                time.sleep(0.5)
                idle, t0, t1 = idle_check(p["pid"], sample_s)
            out["candidates"].append(
                {"pid": p["pid"], "cmdline": p["cmdline"][:160],
                 "rss_kb": p["rss_kb"], "idle": idle,
                 "ticks_sample": [t0, t1]})
            if not idle:
                continue                          # busy → NOT killable
            if enforce:
                try:
                    os.kill(p["pid"], signal.SIGTERM)
                    sent = True
                except OSError:
                    sent = False
                # a real kill is ALWAYS receipted (never rate-limited)
                out["receipts"].append(_receipt(
                    root, "GUARDKILL",
                    {"tier": tier, "pid": p["pid"],
                     "cmdline": p["cmdline"][:160], "sigterm_sent": sent,
                     "ticks_sample": [t0, t1]}))
            elif fresh:
                out["receipts"].append(_receipt(
                    root, "GUARDDRAFT",
                    {"tier": tier, "pid": p["pid"],
                     "cmdline": p["cmdline"][:160], "would_kill": True,
                     "note": "dry-run default; --guard-enforce for real"}))

    _atomic_write(stf, json.dumps({"tier": tier, "ts": _now()},
                                  ensure_ascii=False, indent=1) + "\n")
    return out


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


def profile(root: Path = ROOT, base: int = BASE_BUDGET,
            guard_enabled: bool = False, enforce: bool = False,
            guard_sample: float = 1.0, guard_cooldown: int = 300) -> dict:
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
    guard_res = None
    if guard_enabled:
        try:
            guard_res = guard(root, avail_kb, enforce=enforce,
                              sample_s=guard_sample,
                              cooldown_s=guard_cooldown)
            snap["guard"] = {"tier": guard_res["tier"],
                             "enforce": enforce,
                             "receipts": len(guard_res["receipts"]),
                             "candidates": len(guard_res["candidates"])}
        except Exception as e:                    # guard must never crash the law
            snap["guard"] = {"tier": "ERROR", "error": f"{type(e).__name__}:{e}"}
    print(json.dumps({"ts": snap["ts"], "state": snap["state"],
                      "mem_available_mb": snap["mem_available_mb"],
                      "policy_max_chars": pol["max_chars"],
                      "new_alert": alert,
                      "guard": (snap.get("guard") or {}).get("tier")},
                     ensure_ascii=False))
    return snap


def main() -> int:
    ap = argparse.ArgumentParser(description="host memory profiler + OOM law")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SEC")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--base-budget", type=int, default=BASE_BUDGET)
    ap.add_argument("--guard", action="store_true",
                    help="enable the graduated memory guard (Task 32-b)")
    ap.add_argument("--guard-enforce", action="store_true",
                    help="HARD tier: actually SIGTERM allowlisted idle "
                         "processes (default is dry-run receipts only)")
    ap.add_argument("--guard-sample", type=float, default=1.0,
                    help="idle-proof sampling window seconds")
    ap.add_argument("--guard-cooldown", type=int, default=300,
                    help="receipt anti-spam cooldown seconds")
    a = ap.parse_args()
    if not a.once and not a.loop:
        a.once = True
    rc = 0
    while True:
        snap = profile(Path(a.root), a.base_budget, guard_enabled=a.guard,
                       enforce=a.guard_enforce, guard_sample=a.guard_sample,
                       guard_cooldown=a.guard_cooldown)
        rc = 1 if snap["state"] == "LOW-MEM" else 0
        if not a.loop:
            return rc
        try:
            time.sleep(a.loop)
        except KeyboardInterrupt:
            return rc


if __name__ == "__main__":
    sys.exit(main())
