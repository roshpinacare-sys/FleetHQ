#!/usr/bin/env python3
"""memory_store.py — Hash-chained MEMORY.md manifest (stdlib-only).

The sovereign's self-reflective log: append-only, tamper-evident.
Each record:  | idx | iso-ts | prev_sha256 | sha256(body + prev) |
verify() walks the chain; any edit of history breaks it. This is the
agent's "state preservation" law — compressed findings survive sandbox resets.
"""
from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

_LINE = re.compile(r"^\| (\d+) \| ([^|]+) \| ([0-9a-f]{64}) \| ([0-9a-f]{64}) \|$")


class MemoryStore:
    def __init__(self, path: str = "MEMORY.md"):
        self.path = Path(path)
        self._idx = -1
        self._prev = "0" * 64
        if self.path.is_file():
            self._load()

    def _load(self) -> None:
        for ln in self.path.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = _LINE.match(ln)
            if m:
                self._idx = int(m.group(1))
                self._prev = m.group(4)

    def append(self, kind: str, body: str) -> str:
        """Append a record; returns its sha. Body stored raw below the chain line."""
        self._idx += 1
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload = f"{self._idx}|{ts}|{kind}|{body}"
        sha = hashlib.sha256((payload + self._prev).encode()).hexdigest()
        with self.path.open("a", encoding="utf-8") as f:
            if self._idx == 0:
                f.write("# MEMORY.md — sovereign manifest (hash-chained)\n\n")
            f.write(f"| {self._idx} | {ts} | {self._prev} | {sha} |\n")
            f.write(f":: {kind} :: {body}\n\n")
        self._prev = sha
        return sha

    def verify(self) -> Tuple[bool, int]:
        """Walk chain, recompute hashes, detect tampering. (ok, records).

        Self-consistency: every record's sha must equal H(payload + its stored
        prev_sha) — any body edit breaks it. Linkage: each record's prev_sha
        must equal the previous record's sha. The FIRST record is accepted
        without linkage (inherent to tail-compaction); a full un-compacted
        file must additionally anchor at idx=0 with prev=0^64.
        """
        expected_link: str | None = None  # sha of previous record, if any
        n = 0
        lines = (self.path.read_text(encoding="utf-8", errors="ignore")
                 .splitlines() if self.path.is_file() else [])
        for i, ln in enumerate(lines):
            m = _LINE.match(ln)
            if not m:
                continue
            idx, ts, prev_sha, sha = (int(m.group(1)), m.group(2),
                                      m.group(3), m.group(4))
            # reconstruct payload from the following :: line
            body_ln = None
            for j in range(i + 1, min(i + 3, len(lines))):
                if lines[j].startswith(":: "):
                    body_ln = lines[j]
                    break
            if body_ln is None:
                return False, n
            kind, _, body = body_ln[3:].partition(" :: ")
            payload = f"{idx}|{ts}|{kind}|{body}"
            calc = hashlib.sha256((payload + prev_sha).encode()).hexdigest()
            if calc != sha:
                return False, n
            if expected_link is not None:
                if prev_sha != expected_link:
                    return False, n
            elif idx == 0 and prev_sha != "0" * 64:
                return False, n  # full file must anchor at zero
            expected_link = sha
            n += 1
        return True, n

    def compact(self, keep_last: int = 50) -> int:
        """Lossy compaction law: keep the last `keep_last` records.
        Chain self-consistency survives (each record carries its own prev_sha
        and recomputable hash). Returns number of records kept."""
        ok, n = self.verify()
        if not ok:
            raise RuntimeError("refusing to compact a tampered chain")
        lines = self.path.read_text(encoding="utf-8", errors="ignore").splitlines()
        recs = [(i, m) for i, ln in enumerate(lines)
                if (m := _LINE.match(ln))]
        if len(recs) <= keep_last:
            return n
        cut = recs[-keep_last][0]
        last_m = recs[-1][1]
        self._idx = int(last_m.group(1))
        self._prev = last_m.group(4)
        header = "# MEMORY.md — sovereign manifest (hash-chained; compacted)\n\n"
        body = "\n".join(lines[cut:]) + "\n"
        tmp = self.path.with_suffix(".md.tmp")
        tmp.write_text(header + body, encoding="utf-8")
        tmp.replace(self.path)
        return keep_last


if __name__ == "__main__":
    ms = MemoryStore("/tmp/MEMORY-demo.md")
    ms.append("DECISION", "route llm7 free lane when local down")
    ms.append("RESULT", "selftest 7/7 PASS")
    ok, n = ms.verify()
    print(f"verify: ok={ok} records={n}")
