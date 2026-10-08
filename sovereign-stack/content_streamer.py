#!/usr/bin/env python3
"""content_streamer.py — High-velocity rail streamer + BROADCAST-READY seal.

Task 31-a. Iterates every verified data array in content/sources/, compiles
it through content_rail (deterministic bytes + secret scan + idempotent
hash-chain anchoring), computes a BINARY MERKLE ROOT over the staged
deliverables (stdlib hashlib, documented convention below), cross-verifies
the twin's global books-lineage root, and seals the whole state as
BROADCAST-READY in content/staging/.

Merkle convention (documented, deterministic):
  leaf_i = sha256(file bytes) for files sorted by path
  parent = sha256(left_digest || right_digest)  — raw 32-byte concat
  odd node at any level is duplicated with itself (Bitcoin-style)
  root = hex of the single remaining digest; empty set → 64×"0"

Budget composition law: effective compaction budget =
  min(base 4000, memory policy (mem_profiler), tps policy (tps_bench)).
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
import content_rail                            # noqa: E402
from content_rail import RefusedStage, compile_source, verify_rail  # noqa: E402
from mem_profiler import effective_budget       # noqa: E402
from memory_store import MemoryStore            # noqa: E402

ROOT = Path(__file__).resolve().parent
DEFAULT_HQ = "/home/z/fleet/repos/FleetHQ"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def merkle_root(digests: list[bytes]) -> str:
    if not digests:
        return "0" * 64
    level = list(digests)
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        level = [hashlib.sha256(level[i] + level[i + 1]).digest()
                 for i in range(0, len(level), 2)]
    return level[0].hex()


def cross_lineage(hq: Path | None) -> dict:
    """Verify the twin's global books-lineage root from ITS OWN leaf hashes.

    Rebuilds the tree from receipts/books-lineage.json files-map (sorted by
    path, sha256-hex leaves as raw bytes) and compares with the stored root.
    Convention match → REAL cross-verification. Mismatch → recorded honestly
    (conventions differ), never faked.
    """
    if not hq:
        return {"available": False, "reason": "no_hq_root_given"}
    lf = Path(hq) / "receipts" / "books-lineage.json"
    if not lf.is_file():
        return {"available": False, "reason": f"missing:{lf}"}
    try:
        lin = json.loads(lf.read_text(encoding="utf-8"))
    except Exception as e:
        return {"available": False, "reason": f"unparsable:{e}"}
    leaves = [bytes.fromhex(h) for _, h in
              sorted(lin.get("files", {}).items())]
    recomputed = merkle_root(leaves)
    their = lin.get("root")
    return {"available": True, "books": lin.get("books"),
            "at": lin.get("at"), "their_root": their,
            "recomputed_root": recomputed,
            "convention_match": bool(their and recomputed == their),
            "lineage_file_sha256": hashlib.sha256(
                lf.read_bytes()).hexdigest()}


def effective_compaction_budget(stack_root: Path, base: int = 4000) -> dict:
    mem = tps = None
    mj = stack_root / "health" / "mem.json"
    tj = stack_root / "health" / "tps.json"
    if mj.is_file():
        try:
            mem = json.loads(mj.read_text(encoding="utf-8"))
        except Exception:
            mem = None
    if tj.is_file():
        try:
            tps = json.loads(tj.read_text(encoding="utf-8"))
        except Exception:
            tps = None
    budget = effective_budget(mem, tps, base)
    return {"budget": budget,
            "sources": {"mem_reason": (mem or {}).get("policy_reason"),
                        "mem_avail_mb": (mem or {}).get("mem_available_mb"),
                        "tps_state": (tps or {}).get("state"),
                        "tps_budget": (tps or {}).get(
                            "recommended_compaction_max_chars")}}


def stream(stack_root: Path = ROOT, hq: Path | None = Path(DEFAULT_HQ),
           base_budget: int = 4000) -> dict:
    root = Path(stack_root)
    src_dir = root / "content" / "sources"
    src_dir.mkdir(parents=True, exist_ok=True)
    budget = effective_compaction_budget(root, base_budget)

    compiled, refused, unchanged = [], [], []
    for src in sorted(src_dir.glob("*.json")):
        try:
            spec = json.loads(src.read_text(encoding="utf-8"))
        except Exception as e:
            refused.append({"source": src.name, "why": f"unparsable:{e}"})
            continue
        try:
            res = compile_source(spec, root, compact=True,
                                 max_chars=budget["budget"])
            (compiled if res["manifest_appended"] else unchanged).append(res)
        except RefusedStage as e:
            refused.append({"source": src.name, "why": "secret_scan",
                            "findings": e.findings})
        except ValueError as e:
            refused.append({"source": src.name, "why": str(e)})

    # merkle over the staged deliverables (leaf = sha256 of file bytes,
    # files sorted by relative path)
    leaves: list[tuple[str, bytes]] = []
    staged = root / "content" / "rails"
    for f in sorted(staged.rglob("*.md")):
        rel = str(f.relative_to(root))
        leaves.append((rel, hashlib.sha256(f.read_bytes()).digest()))
    rails_root = merkle_root([d for _, d in leaves])

    ok, det = verify_rail(root)
    cross = cross_lineage(hq)

    seal = {
        "ts": _now(),
        "state": "BROADCAST-READY" if ok else "HALT-CHAIN-BROKEN",
        "rails_merkle_root": rails_root,
        "staged_files": [{"path": p, "sha256": d.hex()} for p, d in leaves],
        "manifest_chain": {"ok": ok, "records": det.get("records"),
                           "files_checked": det.get("files_checked"),
                           "bad": det.get("bad", [])},
        "compaction_budget": budget,
        "cross_lineage": cross,
        "counts": {"compiled_now": len(compiled), "unchanged": len(unchanged),
                   "refused": len(refused)},
        "refused": refused,
        "convention": "leaf=sha256(file-bytes), parent=sha256(L||R), "
                      "odd=duplicate, files sorted by path",
    }
    seal_dir = root / "content" / "staging"
    seal_dir.mkdir(parents=True, exist_ok=True)
    _atomic_write(seal_dir / "BROADCAST-READY.json",
                  json.dumps(seal, ensure_ascii=False, indent=1) + "\n")

    # anchor the seal itself in the manifest chain (idempotent by root)
    man = root / "content" / "MANIFEST.md"
    marker = f"broadcast root={rails_root}"
    if ok and not (man.is_file() and marker in man.read_text(
            encoding="utf-8", errors="ignore")):
        MemoryStore(str(man)).append(
            "BROADCAST", f"root={rails_root} files={len(leaves)} "
                         f"cross_books={cross.get('books')} "
                         f"cross_match={cross.get('convention_match')}")
    print(json.dumps({"state": seal["state"], "rails_root": rails_root[:16],
                      "files": len(leaves), "chain_ok": ok,
                      "cross_match": cross.get("convention_match"),
                      "budget": budget["budget"],
                      "counts": seal["counts"]}, ensure_ascii=False))
    return seal


def main() -> int:
    ap = argparse.ArgumentParser(description="rail streamer + broadcast seal")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--loop", type=int, metavar="SEC")
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("--hq", default=DEFAULT_HQ)
    ap.add_argument("--base-budget", type=int, default=4000)
    a = ap.parse_args()
    if not a.once and not a.loop:
        a.once = True
    rc = 0
    while True:
        seal = stream(Path(a.root), Path(a.hq) if a.hq else None,
                      a.base_budget)
        rc = 0 if seal["state"] == "BROADCAST-READY" else 1
        if not a.loop:
            return rc
        try:
            time.sleep(a.loop)
        except KeyboardInterrupt:
            return rc


if __name__ == "__main__":
    sys.exit(main())
