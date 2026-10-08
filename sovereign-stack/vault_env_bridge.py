#!/usr/bin/env python3
"""vault_env_bridge.py — placeholders from env.example → runtime .env from the vault.

Law (operator directive #1): the bridge dynamically extracts placeholders from
sovereign-stack/env.example and populates them at runtime with verified secrets
from the fleet vault (office unseal outputs) — ABSOLUTE zero-plaintext exposure:
  * values are NEVER printed, logged, or committed (only 8-hex fingerprints)
  * .env is written chmod 0600 and must be gitignored or the bridge refuses
  * self-hosted service secrets (Langfuse/LiteLLM) are generated locally with
    secrets.token_urlsafe when the vault carries none — no operator dependency
  * free-lane keys fall back to their designed public value (unused)

Resolution order per key:  office envs (first-found wins) → alias map →
generated-local (local-only secrets) → designed default (free-lane) → FAIL.
"""
from __future__ import annotations
import argparse
import hashlib
import os
import re
import secrets as pysecrets
import stat
import subprocess
import sys
from pathlib import Path

STACK_DIR = Path(__file__).resolve().parent
FLEET_ROOT = STACK_DIR.parent  # FleetHQ root when deployed in-repo

PLACEHOLDER_VALUES = {"change-me", "change-me-strong", "unused",
                      "sk-sovereign-change-me", ""}

# local-only service secrets: safe to generate on this machine, no external owner
GENERATE_LOCAL = {"LF_PG_PASSWORD", "LF_NEXTAUTH_SECRET", "LF_SALT",
                  "LF_ENCRYPTION_KEY", "LITELLM_MASTER_KEY"}
# free-lane keys with a designed public value (verified live: api.llm7.io/v1)
DESIGNED_DEFAULT = {"LLM7_API_KEY": "unused"}

# documented aliases: sovereign-stack key → office vault key candidates
ALIASES: dict[str, list[str]] = {
    "LLM7_API_KEY": ["LLM7_API_KEY", "LLM7_KEY", "LLM7"],
    "LITELLM_MASTER_KEY": ["LITELLM_MASTER_KEY", "SOVEREIGN_GATEWAY_KEY"],
}

# key-sharing: OPENAI_API_KEY here is the LOCAL gateway credential — it must
# equal LITELLM_MASTER_KEY (one secret, one source), never an invented external key
SHARE: dict[str, str] = {"OPENAI_API_KEY": "LITELLM_MASTER_KEY"}


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    try:
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            out[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def office_sources() -> list[Path]:
    """Office env files in deterministic first-found-wins order."""
    order: list[Path] = []
    custom = os.environ.get("SOVEREIGN_OFFICE_ENV")
    if custom:
        order.append(Path(custom))
    order += [FLEET_ROOT / ".env.local", FLEET_ROOT / ".env",
              FLEET_ROOT / "mini-services" / "agent-hq" / ".env",
              FLEET_ROOT / "foreman" / ".env"]
    return order


def extract_placeholders(example_path: Path) -> dict[str, str]:
    envs = parse_env_file(example_path)
    return {k: v for k, v in envs.items() if v in PLACEHOLDER_VALUES}


def git_is_ignored(path: Path, repo: Path) -> bool:
    try:
        r = subprocess.run(["git", "-C", str(repo), "check-ignore", "-q",
                            str(path)], capture_output=True)
        return r.returncode == 0
    except OSError:
        return False


def git_root_for(target: Path) -> Path | None:
    """Nearest enclosing git repo of `target` — scope law for the ignore-guard."""
    for cand in [target, *target.parents]:
        if (cand / ".git").is_dir():
            return cand
    return None


def fp(value: str) -> str:
    """8-hex fingerprint of a secret value — safe to print, useless to attacker."""
    return hashlib.sha256(value.encode()).hexdigest()[:8]


def build(target_dir: Path, force: bool = False, dry_run: bool = False) -> int:
    example = STACK_DIR / "env.example"
    placeholders = extract_placeholders(example)
    if not placeholders:
        print("[bridge] FAIL: no placeholders found in env.example")
        return 1

    # merge office sources: FIRST file that defines a key wins
    merged: dict[str, str] = {}
    used_files: list[Path] = []
    for src in office_sources():
        if src.is_file():
            used_files.append(src)
            for k, v in parse_env_file(src).items():
                merged.setdefault(k, v)
    print(f"[bridge] office sources consulted: "
          f"{[str(s.relative_to(FLEET_ROOT)) if FLEET_ROOT in s.parents else str(s) for s in used_files] or 'NONE (keyless machine)'}")

    resolved: dict[str, tuple[str, str]] = {}  # key → (value, source)
    missing_critical: list[str] = []

    def resolve(key: str) -> None:
        # 1) direct or aliased office value
        val = merged.get(key)
        if val not in (None, "", "unused"):
            resolved[key] = (val, "office")
            return
        for alias in ALIASES.get(key, []):
            val = merged.get(alias)
            if val not in (None, "", "unused"):
                resolved[key] = (val, f"office:{alias}")
                return
        # 2) shared local secret (partner resolved first by env.example order)
        partner = SHARE.get(key)
        if partner and partner in resolved:
            resolved[key] = resolved[partner]
            return
        # 3) local-only service secret → generate (autonomy owns it)
        if key in GENERATE_LOCAL:
            resolved[key] = (pysecrets.token_urlsafe(32), "generated-local")
            return
        # 4) designed free-lane default
        if key in DESIGNED_DEFAULT:
            resolved[key] = (DESIGNED_DEFAULT[key], "designed-free-lane")

    for key in placeholders:
        resolve(key)
        if key not in resolved:
            missing_critical.append(key)

    if missing_critical:
        print(f"[bridge] FAIL: no vault/local source for {missing_critical} — refusing to invent provider keys")
        return 2

    out_path = target_dir / ".env"
    repo = git_root_for(target_dir)
    if repo is None:
        print(f"[bridge] FAIL: target {target_dir} is outside any git repo — "
              f"cannot prove the output is gitignored, refusing")
        return 4
    if not dry_run:
        if out_path.exists() and not force:
            print(f"[bridge] FAIL: {out_path} exists (use --force to rotate) — refusing silent overwrite")
            return 3
        if not git_is_ignored(out_path, repo):
            print(f"[bridge] FAIL: {out_path} is NOT gitignored in {repo} — plaintext exposure risk, refusing")
            return 4
        if out_path.exists():
            bak = out_path.with_name(f".env.bak-{int(pysecrets.randbelow(10**6)):06d}")
            os.replace(out_path, bak)
            os.chmod(bak, stat.S_IRUSR | stat.S_IWUSR)
            print(f"[bridge] previous .env rotated (kept local, fingerprint {fp(bak.read_text()[:64])})")
        lines = [f"{k}={resolved[k][0]}" for k in sorted(resolved)]
        out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        os.chmod(out_path, stat.S_IRUSR | stat.S_IWUSR)

    # ---- receipt (fingerprints only — zero plaintext) ----
    print("[bridge] receipt (source + fingerprint, never values):")
    for k in sorted(resolved):
        v, src = resolved[k]
        print(f"  {k:22s} <- {src:20s} sha256:{fp(v)}")

    # ---- self-verify ----
    if not dry_run:
        reloaded = parse_env_file(out_path)
        leftover = [k for k, v in reloaded.items()
                    if v in PLACEHOLDER_VALUES and k not in DESIGNED_DEFAULT]
        mode = stat.S_IMODE(out_path.stat().st_mode)
        ignored = git_is_ignored(out_path, repo)
        ok = (not leftover) and mode == 0o600 and ignored
        print(f"[bridge] self-verify: placeholders-left={leftover or 'NONE'} "
              f"perms={'0600 OK' if mode == 0o600 else hex(mode)} "
              f"gitignored={'YES' if ignored else 'NO'} → {'PASS' if ok else 'FAIL'}")
        return 0 if ok else 5
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=str(STACK_DIR))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    sys.exit(build(Path(a.target), force=a.force, dry_run=a.dry_run))
