#!/usr/bin/env python3
"""sovereign_router.py — Sovereign Inference Router (stdlib-only).

Law: rotation + jittered exponential backoff + Retry-After honoring +
per-provider circuit breaker. Secrets load from the autonomy's own vault,
never from the operator. Keys are read but NEVER logged (redacted by default).

Config resolution order (ownership law):
  1. SOVEREIGN_ROUTES_JSON      — inline JSON routes (highest)
  2. $SOVEREIGN_OFFICE_ENV      — office vault env file (KEY=VALUE), SOVEREIGN_ROUTES=<json>
     (default candidate: ../office/keys.env relative to this file, if present)
  3. Built-in defaults          — local LiteLLM (4000) → local llama.cpp (8080) → llm7 free lane
"""
from __future__ import annotations
import json
import os
import random
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

REDACT = "***"
MAX_RETRY_AFTER_SLEEP = 30.0
_DEFAULTS: List[Dict[str, Any]] = [
    {"name": "litellm-local", "url": "http://localhost:4000/v1/chat/completions",
     "key": "unused", "model": "local-primary", "tier": 0},
    {"name": "llamacpp-local", "url": "http://localhost:8080/v1/chat/completions",
     "key": "unused", "model": "local-default", "tier": 0},
    {"name": "llm7-free", "url": "https://api.llm7.io/v1/chat/completions",
     "key": "unused", "model": "GLM-5.3-Flash", "tier": 2},
]


def _parse_env_file(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
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


def load_routes() -> List[Dict[str, Any]]:
    inline = os.environ.get("SOVEREIGN_ROUTES_JSON")
    if inline:
        routes = json.loads(inline)
        if isinstance(routes, dict):
            routes = routes.get("routes", [])
        return routes

    env_path = os.environ.get("SOVEREIGN_OFFICE_ENV")
    if not env_path:
        cand = Path(__file__).resolve().parent.parent / "office" / "keys.env"
        if cand.is_file():
            env_path = str(cand)
    if env_path:
        office = _parse_env_file(Path(env_path))
        raw = office.get("SOVEREIGN_ROUTES") or os.environ.get("SOVEREIGN_ROUTES")
        if raw:
            try:
                routes = json.loads(raw)
                if isinstance(routes, dict):
                    routes = routes.get("routes", [])
                if routes:
                    return routes
            except json.JSONDecodeError:
                pass
    return json.loads(json.dumps(_DEFAULTS))  # deep copy


class CircuitBreaker:
    """Per-provider breaker: N consecutive failures → open for cooldown."""

    def __init__(self, threshold: int = 3, cooldown: float = 20.0):
        self.threshold = threshold
        self.cooldown = cooldown
        self._fails: Dict[str, int] = {}
        self._opened_at: Dict[str, float] = {}
        self._lock = threading.Lock()

    def allow(self, name: str) -> bool:
        with self._lock:
            if name not in self._opened_at:
                return True
            if time.time() - self._opened_at[name] >= self.cooldown:
                del self._opened_at[name]  # half-open probe
                return True
            return False

    def record(self, name: str, ok: bool) -> None:
        with self._lock:
            if ok:
                self._fails.pop(name, None)
                self._opened_at.pop(name, None)
            else:
                n = self._fails.get(name, 0) + 1
                self._fails[name] = n
                if n >= self.threshold:
                    self._opened_at[name] = time.time()


class SovereignRouter:
    def __init__(self, routes: Optional[List[Dict[str, Any]]] = None,
                 timeout: float = 90.0, max_retries: int = 4,
                 breaker: Optional[CircuitBreaker] = None,
                 state_path: Optional[str] = None, log=None):
        self.routes = routes if routes is not None else load_routes()
        self.timeout = timeout
        self.max_retries = max_retries
        self.breaker = breaker or CircuitBreaker()
        self.state_path = state_path
        self.log = log or (lambda msg: None)
        self.telemetry: List[Dict[str, Any]] = []

    # ---- low-level ----
    def _post_chat(self, route: Dict[str, Any], payload: Dict[str, Any],
                   timeout: float) -> tuple[int, Dict[str, str], Dict[str, Any]]:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            route["url"], data=body, method="POST",
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {route.get('key', 'unused')}"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return resp.status, dict(resp.headers), data
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode("utf-8"))
            except Exception:
                err_body = {}
            return e.code, dict(e.headers or {}), err_body

    def _probe_models(self, route: Dict[str, Any]) -> bool:
        url = route["url"].split("/chat/completions")[0] + "/models"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {route.get('key', 'unused')}"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200
        except Exception:
            return False

    # ---- public ----
    def probe_all(self) -> Dict[str, bool]:
        return {r["name"]: self._probe_models(r) for r in self.routes}

    def route(self, messages: List[Dict[str, str]], model: Optional[str] = None,
              max_tokens: int = 1024, temperature: float = 0.7,
              ) -> Dict[str, Any]:
        """Execute with the resilience law. Raises RuntimeError when ALL lanes die."""
        payload: Dict[str, Any] = {"messages": messages, "max_tokens": max_tokens,
                                   "temperature": temperature}
        attempt = 0
        last_err = "no-lane-attempted"
        while attempt < self.max_retries:
            progressed = False
            for route in self.routes:
                name = route.get("name", route["url"])
                if not self.breaker.allow(name):
                    continue
                progressed = True
                attempt += 1
                use = dict(payload)
                use["model"] = model or route.get("model")
                t0 = time.time()
                try:
                    status, headers, data = self._post_chat(route, use, self.timeout)
                except Exception as e:  # network anomaly → routing event
                    status, headers, data = 0, {}, {"error": {"message": str(e)}}
                dt = round(time.time() - t0, 2)
                self.telemetry.append({"lane": name, "status": status, "s": dt})
                if status == 200 and data.get("choices"):
                    self.breaker.record(name, True)
                    self._save_state()
                    return {"content": data["choices"][0]["message"]["content"],
                            "lane": name, "model": use["model"], "latency_s": dt,
                            "attempts": attempt}
                # resilience law
                self.breaker.record(name, False)
                retry_after = headers.get("Retry-After") or headers.get("retry-after")
                if retry_after:
                    try:
                        sleep_s = min(float(retry_after), MAX_RETRY_AFTER_SLEEP)
                    except ValueError:
                        sleep_s = 0
                    if 0 < sleep_s <= 5.0:
                        self.log(f"[{name}] 429/quota → honoring Retry-After {sleep_s}s")
                        time.sleep(sleep_s)
                        attempt -= 1  # same provider gets its fair retry
                        continue
                last_err = f"{name}:{status}"
                self.log(f"[{name}] routing event (status={status}) → next lane")
            if not progressed:
                # all breakers open → wait for half-open window
                time.sleep(min(2.0 * attempt, 8.0))
            else:
                time.sleep(min(0.5 * (2 ** attempt), 4.0) * (0.5 + random.random()))
        self._save_state()
        raise RuntimeError(
            f"[CRITICAL] All routing lanes exhausted after {attempt} attempts. "
            f"Last lane error: {last_err}")

    def _save_state(self) -> None:
        if not self.state_path:
            return
        try:
            Path(self.state_path).write_text(json.dumps(
                {"ts": time.time(), "telemetry": self.telemetry[-50:]},
                ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError:
            pass


def compact_messages(messages: List[Dict[str, str]], max_chars: int = 12000
                     ) -> List[Dict[str, str]]:
    """Integrate compaction into routing: shrink oversized payloads pre-flight."""
    from compaction import compact_text  # sibling module
    out, changed = [], False
    for m in messages:
        c = m.get("content", "")
        if len(c) > max_chars:
            c2 = compact_text(c, max_chars=max_chars)
            changed = True
            out.append({**m, "content": c2})
        else:
            out.append(m)
    return out if changed else messages


if __name__ == "__main__":
    r = SovereignRouter()
    for name, alive in r.probe_all().items():
        print(f"probe {name}: {'ALIVE' if alive else 'down'}")
