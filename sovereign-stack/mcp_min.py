#!/usr/bin/env python3
"""mcp_min.py — Minimal Model Context Protocol stdio client (stdlib-only).

Speaks newline-delimited JSON-RPC 2.0 over stdio, per the MCP spec
(github.com/modelcontextprotocol · modelcontextprotocol.io):
  initialize → notifications/initialized → tools/list → tools/call

Use this to dynamically attach tool servers to the sovereign runtime —
capabilities are discovered at runtime, not hard-coded.
"""
from __future__ import annotations
import json
import subprocess
import threading
from typing import Any, Dict, List, Optional

PROTOCOL_VERSION = "2024-11-05"


class MCPError(RuntimeError):
    pass


class MCPClient:
    def __init__(self, command: List[str], name: str = "sovereign-client"):
        self.command = command
        self.name = name
        self.proc: Optional[subprocess.Popen] = None
        self._next_id = 0
        self._lock = threading.Lock()
        self.server_info: Dict[str, Any] = {}
        self.tools: List[Dict[str, Any]] = []

    # ---- transport ----
    def _send(self, obj: Dict[str, Any]) -> None:
        assert self.proc and self.proc.stdin
        data = json.dumps(obj, ensure_ascii=False) + "\n"
        self.proc.stdin.write(data)
        self.proc.stdin.flush()

    def _recv(self, want_id: int, timeout: float = 15.0) -> Dict[str, Any]:
        """Read lines until the response with `want_id` arrives (skip notifications)."""
        assert self.proc and self.proc.stdout
        import time
        deadline = time.time() + timeout
        while time.time() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            if msg.get("id") == want_id:
                return msg
            # notifications (e.g. tools/list_changed) are skipped
        raise MCPError(f"timeout waiting for response id={want_id}")

    def _rpc(self, method: str, params: Optional[Dict[str, Any]] = None,
             timeout: float = 15.0) -> Dict[str, Any]:
        with self._lock:
            self._next_id += 1
            rid = self._next_id
            req: Dict[str, Any] = {"jsonrpc": "2.0", "id": rid, "method": method}
            if params is not None:
                req["params"] = params
            self._send(req)
            resp = self._recv(rid, timeout)
        if "error" in resp:
            raise MCPError(f"{method} error: {resp['error']}")
        return resp.get("result", {})

    # ---- lifecycle ----
    def start(self) -> Dict[str, Any]:
        self.proc = subprocess.Popen(
            self.command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1)
        result = self._rpc("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": self.name, "version": "1.0"}},
            timeout=20.0)
        self.server_info = result.get("serverInfo", {})
        # initialized notification (no id → no response expected)
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return result

    def tools_list(self) -> List[Dict[str, Any]]:
        result = self._rpc("tools/list", {})
        self.tools = result.get("tools", [])
        return self.tools

    def call(self, tool: str, arguments: Optional[Dict[str, Any]] = None,
             timeout: float = 30.0) -> str:
        result = self._rpc("tools/call", {"name": tool,
                                          "arguments": arguments or {}},
                           timeout=timeout)
        content = result.get("content", [])
        parts = [c.get("text", "") for c in content if c.get("type") == "text"]
        return "\n".join(parts)

    def close(self) -> None:
        if self.proc:
            try:
                if self.proc.stdin:
                    self.proc.stdin.close()
                self.proc.terminate(timeout=3)
            except Exception:
                pass
            self.proc = None


if __name__ == "__main__":
    # Self-demo against a toy echo server (see selftest.py for the full proof)
    import sys
    print("mcp_min: importable client ready. Run selftest.py for the live proof.")
    sys.exit(0)
