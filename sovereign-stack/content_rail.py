#!/usr/bin/env python3
"""content_rail.py — Deterministic content-rail compiler (stdlib-only).

Task 30-a of the sovereign stack: turns verified JSON data arrays into
dense, deterministic markdown deliverables, produces an LLM-consumption
twin via compaction.py, scans for secrets BEFORE staging, and anchors
every deliverable in a hash-chained MANIFEST (memory_store.py).

Lineage law (honest correction, mirrors FleetHQ e1f33fe): SHA-256
fingerprints only — NO GPG keys exist in the fleet, and minting one now
to imitate "a verified r5 credential" would be a lie. Fingerprint +
hash-chain = the signature.

Determinism: same source JSON + same options → byte-identical .md bytes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compaction import compact_text            # noqa: E402
from memory_store import MemoryStore           # noqa: E402

ROOT = Path(__file__).resolve().parent

# --------------------------------------------------------------- secret scan
# Conservative battery: only patterns that are secrets BY SHAPE, plus the
# fleet's own history (WIFs). Formatting templates / fixtures stay clean.
SECRET_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("private-key-pem", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("openai-style-key", re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b")),
    ("aws-access-key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github-pat", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{30,}\b")),
    ("bearer-token", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b")),
    ("evm-private-key", re.compile(r"\b0x[0-9a-fA-F]{64}\b")),
    ("steem-wif", re.compile(r"\b[KL5][1-9A-HJ-NP-Za-km-z]{50,51}\b")),
    ("generic-secret-assign",
     re.compile(r"(?i)\b(api[_-]?key|secret|passwd|password|token|wif)\b"
                r"\s*[:=]\s*['\"]?[A-Za-z0-9+/=_-]{16,}")),
]


def mask(s: str, keep: int = 4) -> str:
    s = s.strip()
    return (s[:keep] + "…[MASKED]") if len(s) > keep else "…[MASKED]"


def secret_scan(text: str) -> List[dict]:
    """Return masked findings. NEVER returns the secret itself."""
    out: List[dict] = []
    for name, rx in SECRET_PATTERNS:
        for i, line in enumerate(text.splitlines(), 1):
            m = rx.search(line)
            if m:
                out.append({"pattern": name, "line": i,
                            "preview": mask(m.group(0))})
    return out


# ------------------------------------------------------------------- render
def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s[:64] or "untitled"


def _cell(v) -> str:
    return str(v).replace("|", "\\|").replace("\n", " ")


def render_markdown(spec: dict) -> str:
    """Deterministic renderer: same spec → same bytes. No clock inside."""
    lines: List[str] = []
    lines.append(f"# {str(spec.get('title', 'Untitled')).strip()}")
    lines.append("")
    if spec.get("summary"):
        lines.append(str(spec["summary"]).strip())
        lines.append("")
    meta = spec.get("metadata") or {}
    if meta:
        lines.append("| field | value |")
        lines.append("|---|---|")
        for k in sorted(meta):                       # deterministic order
            lines.append(f"| {_cell(k)} | {_cell(meta[k])} |")
        lines.append("")
    for i, sec in enumerate(spec.get("sections") or [], 1):
        lines.append(f"## {i}. {str(sec.get('heading', f'Section {i}')).strip()}")
        lines.append("")
        if sec.get("body"):
            lines.append(str(sec["body"]).strip())
            lines.append("")
        bullets = sec.get("bullets") or []
        for b in bullets:
            lines.append(f"- {_cell(b)}")
        if bullets:
            lines.append("")
        tbl = sec.get("table")
        if tbl:
            headers = [_cell(h) for h in (tbl.get("headers") or [])]
            rows = [[_cell(c) for c in r] for r in (tbl.get("rows") or [])]
            lines.append("| " + " | ".join(headers) + " |")
            lines.append("|" + "|".join(["---"] * len(headers)) + "|")
            for r in rows:
                lines.append("| " + " | ".join(r) + " |")
            lines.append("")
    return "\n".join(lines).rstrip("\n") + "\n"


# ------------------------------------------------------------------ compile
class RefusedStage(Exception):
    def __init__(self, findings: List[dict]):
        self.findings = findings
        super().__init__(f"secret scan refused staging ({len(findings)} hits)")


def _atomic_write(path: Path, data: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(data, encoding="utf-8")
    tmp.replace(path)


def compile_source(spec: dict, root: Path = ROOT, compact: bool = True,
                   max_chars: int = 4000) -> dict:
    """Stage one deliverable. Raises RefusedStage on secret hits."""
    root = Path(root)
    title = str(spec.get("title", "")).strip()
    if not title:
        raise ValueError("source needs a title")
    if not (spec.get("sections") or spec.get("summary")):
        raise ValueError("source needs sections or summary")

    rail = slugify(str(spec.get("rail") or "general"))
    slug = slugify(str(spec.get("slug") or title))
    date = str(spec.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    md = render_markdown(spec)
    findings = secret_scan(md + "\n" + json.dumps(spec, ensure_ascii=False))
    if findings:
        rec_dir = root / "receipts"
        rec_dir.mkdir(parents=True, exist_ok=True)
        sha8 = hashlib.sha256(json.dumps(findings).encode()).hexdigest()[:8]
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        _atomic_write(rec_dir / f"REJECTED-{ts}-{sha8}.json",
                      json.dumps({"ts": ts, "source_title": title,
                                  "reason": "secret_scan", "findings": findings},
                                 ensure_ascii=False, indent=1) + "\n")
        raise RefusedStage(findings)

    out_dir = root / "content" / "rails" / rail / date
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / f"{slug}.md"
    _atomic_write(md_path, md)
    sha = hashlib.sha256(md.encode("utf-8")).hexdigest()
    _atomic_write(out_dir / f"{slug}.sha256", sha + "\n")

    tokens_path, ratio = None, 1.0
    if compact:
        tok = compact_text(md, max_chars=max_chars)
        tokens_path = out_dir / f"{slug}.tokens.md"
        _atomic_write(tokens_path, tok)
        ratio = len(tok) / max(1, len(md))

    # hash-chained manifest anchor (idempotent: same sha → no duplicate record)
    man = root / "content" / "MANIFEST.md"
    appended = False
    if man.is_file() and f"sha256={sha}" in man.read_text(encoding="utf-8",
                                                          errors="ignore"):
        pass                                    # already anchored
    else:
        MemoryStore(str(man)).append(
            "STAGE", f"rail={rail} date={date} slug={slug} "
                     f"sha256={sha} bytes={len(md.encode('utf-8'))}")
        appended = True

    return {"slug": slug, "rail": rail, "date": date,
            "md_path": str(md_path), "tokens_path": (str(tokens_path)
                                                     if tokens_path else None),
            "sha256": sha, "bytes": len(md.encode("utf-8")),
            "compaction_ratio": round(ratio, 4),
            "manifest_appended": appended}


def verify_rail(root: Path = ROOT) -> Tuple[bool, dict]:
    """Walk MANIFEST chain + re-hash every staged file it anchors."""
    root = Path(root)
    man = root / "content" / "MANIFEST.md"
    ok, n = MemoryStore(str(man)).verify()
    details = {"chain_ok": ok, "records": n, "files_checked": 0, "bad": []}
    if not man.is_file():
        return True, details
    for ln in man.read_text(encoding="utf-8", errors="ignore").splitlines():
        if not ln.startswith(":: STAGE :: "):
            continue
        body = ln[len(":: STAGE :: "):]
        kv = dict(p.split("=", 1) for p in body.split() if "=" in p)
        f = root / "content" / "rails" / kv.get("rail", "_") / \
            kv.get("date", "_") / f"{kv.get('slug', '_')}.md"
        if not f.is_file():
            details["bad"].append(f"missing:{f}")
            continue
        details["files_checked"] += 1
        if hashlib.sha256(f.read_bytes()).hexdigest() != kv.get("sha256"):
            details["bad"].append(f"tampered:{f}")
    details["ok"] = bool(ok) and not details["bad"]
    return details["ok"], details


# ---------------------------------------------------------------------- CLI
def main() -> int:
    ap = argparse.ArgumentParser(description="deterministic content-rail compiler")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("compile")
    c.add_argument("--source", required=True, help="JSON data-array file")
    c.add_argument("--root", default=str(ROOT))
    c.add_argument("--no-compact", action="store_true")
    v = sub.add_parser("verify")
    v.add_argument("--root", default=str(ROOT))
    a = ap.parse_args()

    if a.cmd == "verify":
        ok, det = verify_rail(Path(a.root))
        print(json.dumps(det, ensure_ascii=False, indent=1))
        return 0 if ok else 1

    try:
        spec = json.loads(Path(a.source).read_text(encoding="utf-8"))
    except Exception as e:
        print(f"CONFIG-ERROR: cannot read source: {e}")
        return 3
    try:
        res = compile_source(spec, Path(a.root), compact=not a.no_compact)
    except RefusedStage as e:
        print("REFUSED-STAGE (secret scan):")
        for f in e.findings:
            print(f"  {f['pattern']} line={f['line']} preview={f['preview']}")
        return 2
    except ValueError as e:
        print(f"CONFIG-ERROR: {e}")
        return 3
    print(json.dumps(res, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
