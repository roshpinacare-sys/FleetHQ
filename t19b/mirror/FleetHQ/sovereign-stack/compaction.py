#!/usr/bin/env python3
"""compaction.py — Lossy deterministic context compaction (stdlib-only).

Parallel-spirit of Microsoft LLMLingua (github.com/microsoft/LLMLingua) but with
zero dependencies: score-and-keep line compaction that preserves the logical
skeleton of a work log — decisions, results, errors, numbers, receipts, code
signatures — and drops chatter, duplication and boilerplate.

Deterministic: same input → same output (testable). No LLM call needed.
Upgrade path: swap `compact_text` internals for LLMLingua when torch is available.
"""
from __future__ import annotations
import hashlib
import re
from typing import List

# Lines that carry the logical skeleton
_KEEP = re.compile(
    r"(decision|result|pass|fail|error|critical|ok\b|verdict|receipt|commit|"
    r"sha|hash|token|key\b|port|http|root-cause|fix|patch|todo|summary|"
    r"status|measured|verified|alert|warn|exit|rc=|→|->)", re.IGNORECASE)
_NUM = re.compile(r"\d")
_URL = re.compile(r"https?://")
_HEB = re.compile(r"[\u0590-\u05FF]")

_DROP = re.compile(
    r"^(ok|done|thanks|hi|hello|lol|\W+)$", re.IGNORECASE)

_CODE_FENCE = re.compile(r"^\s*```")


def _split_code_blocks(lines: List[str]):
    """Yield (is_code, chunk) preserving fences."""
    in_code = False
    buf: List[str] = []
    kind = False
    for ln in lines:
        if _CODE_FENCE.match(ln):
            buf.append(ln)
            if in_code:  # closing
                yield kind, buf
                buf, in_code, kind = [], False, False
            else:        # opening
                if buf:
                    yield False, buf
                    buf = []
                in_code, kind = True, True
        else:
            buf.append(ln)
    if buf:
        yield in_code, buf


def compact_text(text: str, max_chars: int = 4000,
                 keep_code_lines: int = 6) -> str:
    """Compact `text` to ≤ ~max_chars, preserving the decision skeleton."""
    if len(text) <= max_chars:
        return text
    lines = text.splitlines()
    kept: List[str] = []
    seen_hashes: set = set()
    budget = max_chars - 64  # room for header

    for is_code, chunk in _split_code_blocks(lines):
        if is_code:
            # keep fence + first/last lines of long code blocks (signature survives)
            fence_open, body, fence_close = chunk[0], chunk[1:-1], chunk[-1]
            kept.append(fence_open)
            if len(body) <= keep_code_lines:
                kept.extend(body)
            else:
                kept.extend(body[:keep_code_lines // 2])
                kept.append(f"    # … {len(body) - keep_code_lines} lines elided …")
                kept.extend(body[-(keep_code_lines // 2):])
            if fence_close.startswith("```"):
                kept.append(fence_close)
            continue
        for ln in chunk:
            s = ln.strip()
            if not s or _DROP.match(s):
                continue
            h = hashlib.sha1(s.encode()).hexdigest()
            if h in seen_hashes:      # collapse exact dup lines
                continue
            seen_hashes.add(h)
            score = bool(_KEEP.search(s)) + bool(_NUM.search(s)) + \
                bool(_URL.search(s)) + bool(_HEB.search(s)) * 0
            if score >= 2 or (score == 1 and len(s) < 240):
                if budget - len(ln) <= 0:
                    break
                kept.append(ln if len(ln) <= 400 else ln[:397] + "…")
                budget -= len(ln)
        if budget <= 0:
            break

    header = (f"[compacted {len(text)}→{sum(len(l)+1 for l in kept)} chars "
              f"ratio={sum(len(l)+1 for l in kept)/max(1,len(text)):.2f}]")
    out = "\n".join(kept)
    if len(out) > max_chars:
        out = out[:max_chars]
    return header + "\n" + out


def compaction_ratio(text: str, max_chars: int = 4000) -> float:
    if len(text) <= max_chars:
        return 1.0
    return len(compact_text(text, max_chars)) / len(text)


if __name__ == "__main__":
    demo = "\n".join(
        ["log line with nothing important " + "x" * 50] * 40 +
        ["DECISION: route via LiteLLM first, llama.cpp second",
         "RESULT: selftest PASS (7/7) in 4.2s",
         "error: lane llm7-free 429 → honored Retry-After 1.0s",
         "receipt: commit 8da7dd1 pushed to TruthRail"] * 3 +
        ["noise padding without meaning " + "y" * 60] * 40)
    out = compact_text(demo)
    print(out[:400])
    print("…", f"ratio={len(out)/len(demo):.2f}")
