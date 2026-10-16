"""
swe-guard — command-guard-wrapped LocalEnvironment for the fleet agent runtime.

CR-0018 (tier B): completes the canon deployment condition for the mini-swe-agent
runtime ("bash exec only through command-guard, no HIVE/Blurt keys in its env, ever"
— PROBE-LANE.md, strix lesson). Rung 1 (CR-0016) proved the runtime with scoped
tasks + scrubbed env; this class adds the enforced gate IN the execution path.

Law (explainable, logged):
  1. Secret material is unreadable: fleet creds, tokens, private keys.
  2. Mutations are scoped to /tmp (the workspace task root); everything else
     is read-only territory.
  3. Named destructive patterns are refused outright (sudo, pipe-to-shell,
     root rm, mkfs/dd-to-device, fork bomb, chmod -R 777 /, power ops,
     git push from a runtime, kill -9 1).
  4. Every deny is a RECEIPT: JSONL line in /tmp/swe-guard-denies.jsonl with the
     rule name and the matched path, plus a denial the agent can see and adapt to
     (returncode 126). Deny is honest, silent failure is forbidden.
"""
import json
import os
import re
import time

from minisweagent.environments.local import LocalEnvironment

DENY_LOG = os.environ.get("SWE_GUARD_LOG", "/tmp/swe-guard-denies.jsonl")

SECRET_PATTERNS = (
    r"\.fleet/creds",
    r"/tmp/\.gt\b",
    r"\.git-credentials",
    r"id_rsa",
    r"\.pem\b",
    r"WEAVE_STEEM_WIF",
    r"STEEM_ACTIVE_WIF",
    r"HIVE[_A-Z]*KEY",
)

DENY_RULES = (
    ("sudo", r"\bsudo\b"),
    ("pipe-to-shell", r"\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b"),
    ("root-rm", r"rm\s+-[a-zA-Z]*[rf][a-zA-Z]*\s+/(\s|$)"),
    ("device-write", r"\bmkfs\b|\bdd\b[^|;&]*\bof=/dev/"),
    ("fork-bomb", r":\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;"),
    ("chmod-root", r"chmod\s+(-R\s+)?777\s+/(\s|$)"),
    ("power-op", r"\b(shutdown|reboot|halt|poweroff)\b"),
    ("git-push", r"\bgit\s+push\b"),
    ("kill-init", r"kill\s+-9\s+1\b"),
)

MUTATOR = re.compile(
    r"\b(rm|mv|cp|tee|chmod|chown|ln|mkdir|rmdir|touch|truncate|shred|sed)\b"
    r"|(^|\s)>>?"
    r"|\bsed\b[^|;&]*-i"
)
ABSPATH = re.compile(r"(?<![\w\-./])/(?:[\w.\-]+/?)*")
PARENT_ESCAPE = re.compile(r"\.\./")


class GuardedLocalEnvironment(LocalEnvironment):
    """LocalEnvironment with the fleet command-guard enforced before execution."""

    def _log_deny(self, rule: str, detail: str, command: str) -> None:
        rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "rule": rule, "detail": detail, "command": command[:500]}
        try:
            with open(DENY_LOG, "a") as fh:
                fh.write(json.dumps(rec) + "\n")
        except OSError:
            pass
        print(f"[swe-guard] DENY rule={rule} detail={detail}")

    def _guard(self, command: str) -> str | None:
        """Return a deny reason string, or None to allow."""
        for pat in SECRET_PATTERNS:
            if re.search(pat, command):
                return f"secret-material access matched /{pat}/"
        for name, pat in DENY_RULES:
            if re.search(pat, command):
                return f"destructive pattern '{name}'"
        if MUTATOR.search(command):
            if PARENT_ESCAPE.search(command):
                return "parent-path escape attempt"
            for m in ABSPATH.finditer(command):
                p = m.group(0)
                if not p.startswith("/tmp"):
                    return f"write/mutation outside /tmp scope (target {p})"
        return None

    def execute(self, action: dict, cwd: str = "", *, timeout: int | None = None) -> dict:
        command = action.get("command", "") or ""
        reason = self._guard(command)
        if reason is not None:
            self._log_deny(reason.split("'")[1] if "'" in reason else reason, reason, command)
            return {
                "output": (
                    f"COMMAND-GUARD DENY: {reason}\n"
                    "Policy: reads are free; mutations are scoped to /tmp; secrets are off-limits; "
                    "destructive patterns are refused. Adapt your approach within policy, or finish honestly."
                ),
                "returncode": 126,
                "exception_info": "",
            }
        return super().execute(action, cwd=cwd, timeout=timeout)
