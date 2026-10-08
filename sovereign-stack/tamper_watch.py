#!/usr/bin/env python3
"""tamper_watch.py — Cryptographic history sanctity (operator directive #2).

Enforces the memory_store.py hash-chain law over the sovereign MEMORY.md:
  every workflow loop / cron tick → verify(); on ANY tamper detection:
    1. alert receipt written FIRST (evidence before action)
    2. workspace LOCKED (.LOCKDOWN sentinel, inside the protected stack dir)
    3. unpushed work quarantined to branch quarantine/<ts> (nothing is lost)
    4. execution files rebuilt from the immutable origin main HEAD
    5. re-verify from the rebuilt tree; lock cleared only on clean chain
       (fail-closed: if origin itself is broken, the lock stays and screams)

Modes:
  --once        single check (cron mode; exit 0 clean / 1 tamper+recovered / 2 locked)
  --loop N      daemon: check every N seconds (default 300)
  --demo        self-proving exercise on a throwaway git repo (no fleet touch)

Cron cadence (documented decision): */5 minutes + post-task hook in run.sh
+ boot-time check. Process manager for --loop: reaper-immune background child
(bash -c '... &') per Task 26 law, or a systemd timer on an owned server.

v2 fix (Task 29 lesson, earned the hard way): the repo/stack scope is threaded
through EVERY operation — a scope leak here once pointed the quarantine+reset
at the wrong repository. Scope discipline is now structural: --repo/--mem
propagate into _git(), alerts, lock, and receipts all live inside the
protected stack dir, and the current branch is detected, never assumed.
"""
from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

STACK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(STACK_DIR))
from memory_store import MemoryStore  # noqa: E402

REPO = STACK_DIR.parent  # FleetHQ root when deployed in-repo (default scope)


def _git(repo: Path, args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo)] + args,
                          capture_output=True, text=True)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chmod_600(p: Path) -> None:
    os.chmod(p, 0o600)


def current_branch(repo: Path) -> str:
    r = _git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])
    return r.stdout.strip() or "main"


def write_alert(stack_dir: Path, reason: str, evidence: dict) -> Path:
    alerts = stack_dir / ".tamper-alerts"
    alerts.mkdir(parents=True, exist_ok=True)
    p = alerts / f"alert-{int(time.time())}.json"
    p.write_text(json.dumps({"ts": _now(), "reason": reason,
                             "evidence": evidence}, ensure_ascii=False,
                            indent=1), encoding="utf-8")
    chmod_600(p)
    return p


def lockdown(stack_dir: Path, reason: str, evidence: dict) -> Path:
    p = stack_dir / ".LOCKDOWN"
    p.write_text(json.dumps({"ts": _now(), "reason": reason,
                             "evidence": evidence}, ensure_ascii=False,
                            indent=1), encoding="utf-8")
    chmod_600(p)
    return p


def quarantine_unpushed(repo: Path) -> str | None:
    """Commit all dirty state to quarantine/<ts>; return to the original branch."""
    st = _git(repo, ["status", "--porcelain"])
    if not st.stdout.strip():
        return None
    back_to = current_branch(repo)
    branch = f"quarantine/{int(time.time())}"
    _git(repo, ["checkout", "--detach"])
    _git(repo, ["checkout", "-b", branch])
    _git(repo, ["add", "-A"])
    _git(repo, ["-c", "user.name=sovereign-fleet", "-c",
                "user.email=fleet@sovereign.local", "commit", "-q",
                "-m", f"tamper_watch: quarantine unpushed work before rebuild ({_now()})"])
    _git(repo, ["checkout", back_to])
    return branch


def origin_head_ref(repo: Path) -> str:
    """The immutable law: origin's main. Falls back to the branch's upstream."""
    if _git(repo, ["show-ref", "--verify", "--quiet",
                   "refs/remotes/origin/main"]).returncode == 0:
        return "origin/main"
    r = _git(repo, ["rev-parse", "--abbrev-ref", "@{u}"])
    return r.stdout.strip() or "origin/main"


def rebuild_from_origin(repo: Path) -> tuple[bool, str]:
    r = _git(repo, ["fetch", "origin"])
    if r.returncode != 0:
        return False, f"fetch failed: {r.stderr.strip()[:200]}"
    ref = origin_head_ref(repo)
    reset = _git(repo, ["reset", "--hard", ref])
    if reset.returncode != 0:
        return False, f"reset failed: {reset.stderr.strip()[:200]}"
    return True, f"reset --hard {ref}"


def check_once(mem_path: Path, repo: Path) -> int:
    stack_dir = mem_path.parent  # scope law: artifacts live beside the guarded file
    ok, n = MemoryStore(str(mem_path)).verify()
    if ok:
        print(f"[tamper_watch] chain OK ({n} records) — no action")
        return 0

    alert = write_alert(stack_dir, "memory hash-chain verification FAILED",
                        {"path": str(mem_path), "records_before_fail": n})
    lock = lockdown(stack_dir,
                    "hash-chain tamper detected — workspace locked pending rebuild",
                    {"alert": alert.name})
    print(f"[tamper_watch] ALERT: {alert.name} | LOCKED: {lock.name} "
          f"| scope repo={repo} mem={mem_path.name}")

    branch = quarantine_unpushed(repo)
    if branch:
        print(f"[tamper_watch] unpushed work quarantined to branch: {branch}")
    rebuilt, detail = rebuild_from_origin(repo)
    if not rebuilt:
        print(f"[tamper_watch] CRITICAL: rebuild failed ({detail}) — LOCK REMAINS")
        return 2

    ok2, n2 = MemoryStore(str(mem_path)).verify()
    receipt = stack_dir / f".recovery-receipt-{int(time.time())}.json"
    receipt.write_text(json.dumps({
        "ts": _now(), "quarantine_branch": branch, "rebuild": detail,
        "reverify_ok": ok2, "reverify_records": n2},
        ensure_ascii=False, indent=1), encoding="utf-8")
    chmod_600(receipt)
    if ok2:
        lock.unlink(missing_ok=True)
        print(f"[tamper_watch] rebuilt from origin → chain clean ({n2} records); "
              f"lock CLEARED; receipt {receipt.name}")
        return 1
    print(f"[tamper_watch] CRITICAL: rebuilt chain STILL fails — origin suspect; "
          f"LOCK REMAINS; receipt {receipt.name}")
    return 2


def demo() -> int:
    """Full procedure, proven live on a throwaway repo (fleet untouched)."""
    import shutil
    import tempfile
    base = Path(tempfile.mkdtemp(prefix="tamper-demo-"))
    try:
        origin = base / "origin.git"
        work = base / "work"
        subprocess.run(["git", "init", "--bare", "-q", str(origin)], check=True)
        subprocess.run(["git", "init", "-q", "-b", "main", str(work)], check=True)
        (work / "MEMORY.md").write_text("", encoding="utf-8")
        for args in (["add", "-A"],
                     ["-c", "user.name=d", "-c", "user.email=d@d",
                      "commit", "-qm", "seed"],
                     ["remote", "add", "origin", str(origin)],
                     ["push", "-q", "origin", "HEAD:main"]):
            subprocess.run(["git", "-C", str(work)] + args, check=True,
                           capture_output=True)

        ms = MemoryStore(str(work / "MEMORY.md"))
        ms.append("DECISION", "demo record 1")
        ms.append("RESULT", "demo record 2")
        subprocess.run(["git", "-C", str(work), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(work), "-c", "user.name=d", "-c",
                        "user.email=d@d", "commit", "-qm", "chain v1"],
                       check=True, capture_output=True)
        subprocess.run(["git", "-C", str(work), "push", "-q", "origin",
                        "HEAD:main"], check=True, capture_output=True)

        # uncommitted work that must survive via quarantine
        (work / "unpushed-work.txt").write_text("precious draft", encoding="utf-8")
        # TAMPER the committed chain
        raw = (work / "MEMORY.md").read_text(encoding="utf-8")
        (work / "MEMORY.md").write_text(
            raw.replace("demo record 2", "demo record 2 FORGED"), encoding="utf-8")

        r = subprocess.run(
            [sys.executable, __file__, "--once",
             "--mem", str(work / "MEMORY.md"), "--repo", str(work)],
            capture_output=True, text=True)
        print(r.stdout.strip())
        ok_exit = r.returncode == 1

        # outcomes: forged content gone; unpushed work preserved in quarantine
        raw_after = (work / "MEMORY.md").read_text(encoding="utf-8")
        forged_gone = "FORGED" not in raw_after and "demo record 2" in raw_after
        qbr = subprocess.run(["git", "-C", str(work), "branch", "--list",
                              "quarantine/*"], capture_output=True, text=True)
        names = qbr.stdout.strip().replace("* ", "").split()
        qbranch = names[0] if names else None
        precious = False
        if qbranch:
            show = subprocess.run(["git", "-C", str(work), "show",
                                   f"{qbranch}:unpushed-work.txt"],
                                  capture_output=True, text=True)
            precious = "precious draft" in show.stdout
        artifacts = (list((work / ".tamper-alerts").glob("*")) +
                     list(work.glob(".recovery-receipt-*")))
        print(f"[demo] forged content removed by rebuild: {forged_gone}")
        print(f"[demo] unpushed work preserved in {qbranch}: {precious}")
        print(f"[demo] alert+receipt artifacts (scoped to work dir): {len(artifacts)}")
        # scope discipline proof: the real FleetHQ tree must be untouched
        fleet_dirty = subprocess.run(
            ["git", "-C", str(REPO), "status", "--porcelain",
             "--", str(REPO / "sovereign-stack" / ".LOCKDOWN")],
            capture_output=True, text=True).stdout.strip()
        print(f"[demo] fleet scope untouched by demo: {fleet_dirty == ''}")
        return 0 if (ok_exit and forged_gone and precious and fleet_dirty == "") else 1
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SECONDS")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--mem", default=str(STACK_DIR / "MEMORY.md"))
    ap.add_argument("--repo", default=str(REPO))
    a = ap.parse_args()
    if a.demo:
        sys.exit(demo())
    if a.loop:
        print(f"[tamper_watch] daemon: every {a.loop}s on {a.mem}")
        while True:
            check_once(Path(a.mem), Path(a.repo))
            time.sleep(a.loop)
    sys.exit(check_once(Path(a.mem), Path(a.repo)))
