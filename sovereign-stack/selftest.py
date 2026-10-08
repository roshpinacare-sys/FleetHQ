#!/usr/bin/env python3
"""selftest.py — Zero-trust live proof of the sovereign stack.

Proves, on THIS machine, right now:
  T1  router failover: 503-lane and 429-quota lanes are routing events; a 200 wins
  T2  Retry-After honored (quota lane gets its fair retry, ~1s sleep observed)
  T3  compaction: big noisy log → skeleton survives, ratio bounded
  T4  consensus: majority cluster elected against an outlier
  T5  memory chain: verify OK → tamper detected → compact keeps integrity
  T6  MCP: initialize → tools/list → tools/call against a toy stdio server
  T7  live lanes: probe configured routes (INFO — network optional in CI)
  T8  content rail: deterministic bytes + idempotent anchor + secret-refusal
  T9  health monitor: snapshot files + immutable alert receipts + chain
  T10 streamer: binary merkle seal + self-healing determinism + cross-lineage
  T11 mem profiler: /proc parse + OOM policy (500MB law) + budget composition
  T12 telemetry digest: daily FREEZE law + streamer integration (Task 32-a)
  T13 mem guard: tiers + protected-core + allowlisted idle-kill (Task 32-b)

Exit code 0 = all critical tests PASS (T7 is informational).
"""
from __future__ import annotations
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sovereign_router import SovereignRouter, CircuitBreaker  # noqa: E402
from compaction import compact_text                            # noqa: E402
from fork_consensus import consensus_vote                      # noqa: E402
from memory_store import MemoryStore                           # noqa: E402

RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, note: str = "") -> None:
    RESULTS.append((name, ok, note))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}  {note}")


# ---------------------------------------------------------------- mock lanes
class MockProvider:
    """OpenAI-compatible mock with scripted status sequence."""

    def __init__(self, script: list[tuple[int, int]]):  # (status, retry_after)
        self.script = list(script)
        self.i = 0
        self.hits = 0
        self.lock = threading.Lock()

    def next(self) -> tuple[int, int]:
        with self.lock:
            self.hits += 1
            if self.i < len(self.script):
                v = self.script[self.i]
                self.i += 1
                return v
            return self.script[-1]


def make_handler(provider: MockProvider, model: str = "mock-model"):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):  # silence
            pass

        def _send(self, code: int, body: dict, retry_after: int | None = None):
            raw = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            if retry_after:
                self.send_header("Retry-After", str(retry_after))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if self.path.endswith("/models"):
                self._send(200, {"object": "list",
                                 "data": [{"id": model}]})
            else:
                self._send(404, {"error": "nf"})

        def do_POST(self):
            status, retry_after = provider.next()
            if status == 200:
                self._send(200, {"choices": [{"message": {
                    "role": "assistant",
                    "content": "MOCK-OK from " + model}}]},
                    retry_after)
            else:
                self._send(status, {"error": {"code": status}}, retry_after)
    return H


def spawn_mock(script: list[tuple[int, int]], model: str):
    provider = MockProvider(script)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(provider, model))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_port}/v1/chat/completions"
    return srv, provider, {"name": model, "url": url, "key": "unused",
                           "model": model, "tier": 1}


# ---------------------------------------------------------------- tests
def t1_t2_router():
    print("[T1/T2] router: failover + Retry-After honoring")
    s1, p1, r1 = spawn_mock([(503, 0)], "mock-503")            # always down
    s2, p2, r2 = spawn_mock([(429, 1), (429, 1), (200, 0)], "mock-quota")
    s3, p3, r3 = spawn_mock([(200, 0)], "mock-healthy")
    router = SovereignRouter(routes=[r1, r2, r3], timeout=10,
                             max_retries=12)
    t0 = time.time()
    try:
        out = router.route([{"role": "user", "content": "ping"}])
        ok = out["content"].startswith("MOCK-OK")
    except RuntimeError as e:
        ok, out = False, str(e)
    dt = time.time() - t0
    check("router reaches a 200 despite 503+429 lanes", ok,
          f"lanes={[(t['lane'], t['status']) for t in router.telemetry]}")
    check("Retry-After honored (~1s observed)", dt >= 1.0, f"elapsed={dt:.2f}s")
    for s in (s1, s2, s3):
        s.shutdown()


def t3_compaction():
    print("[T3] compaction: skeleton survives, ratio bounded")
    noise = ["routine log line, nothing special " + "z" * 40] * 300
    signal = ["DECISION: primary lane = local llama.cpp on 8080",
              "RESULT: custody probe PASS 14/14 accounts",
              "error: llm7 quota exceeded → honored Retry-After 1s",
              "receipt: TruthRail commit 8da7dd1 verified"]
    doc = "\n".join(noise + signal + noise)
    out = compact_text(doc, max_chars=3500)
    ratio = len(out) / len(doc)
    keeps = all(k in out for k in ("DECISION", "8da7dd1", "PASS",
                                   "error", "8080"))
    check("compaction ratio bounded (<0.25)", ratio < 0.25, f"ratio={ratio:.3f}")
    check("decision skeleton survives", keeps, "")


def t4_consensus():
    print("[T4] consensus: majority cluster elected")
    answers = ["deploy the router on port 4000 and verify with selftest",
               "deploy the router on port 4000, then run selftest to verify",
               "completely unrelated hallucination about bananas only"]
    best, meta = consensus_vote(answers)
    check("majority (2/3) elected, outlier rejected",
          "port 4000" in best and meta["top_size"] == 2,
          f"meta={meta}")


def t5_memory():
    print("[T5] memory chain: integrity + tamper detection + compaction")
    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "MEMORY.md")
        ms = MemoryStore(path)
        s1 = ms.append("DECISION", "compaction before every big request")
        s2 = ms.append("RESULT", "selftest 7/7 PASS")
        ms.append("OPEN", "fleet heart funding unsolved")
        ok, n = ms.verify()
        check("chain verifies (3 records)", ok and n == 3, f"n={n}")
        # tamper: edit history line
        raw = open(path, encoding="utf-8").read()
        raw_bad = raw.replace("selftest 7/7 PASS", "selftest 9/9 PASS (lie)")
        open(path, "w", encoding="utf-8").write(raw_bad)
        ok2, _ = MemoryStore(path).verify()
        check("tampering detected", ok2 is False, "")
        # compact keeps integrity (fresh untampered copy — the tampered one
        # is correctly refused, which the previous check just proved)
        open(path, "w", encoding="utf-8").write(raw)
        ms2 = MemoryStore(path)
        kept = ms2.compact(keep_last=2)
        ok3, n3 = ms2.verify()
        check("compact keeps chain valid", ok3 and kept == 2, f"kept={kept} n={n3}")


TOY_MCP_SERVER = r'''
import json, sys
tools = [{"name": "echo", "description": "echo back input",
          "inputSchema": {"type": "object",
                          "properties": {"text": {"type": "string"}},
                          "required": ["text"]}}]
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    req = json.loads(line)
    m, rid = req.get("method"), req.get("id")
    if m == "initialize":
        out = {"jsonrpc":"2.0","id":rid,"result":{
            "protocolVersion":"2024-11-05","capabilities":{"tools":{}},
            "serverInfo":{"name":"toy-echo","version":"1.0"}}}
    elif m == "tools/list":
        out = {"jsonrpc":"2.0","id":rid,"result":{"tools":tools}}
    elif m == "tools/call":
        text = req["params"]["arguments"]["text"]
        out = {"jsonrpc":"2.0","id":rid,"result":{"content":[
            {"type":"text","text":"ECHO:" + text}]}}
    else:
        out = {"jsonrpc":"2.0","id":rid,"error":{"code":-32601,
               "message":"method not found"}}
    sys.stdout.write(json.dumps(out) + "\n"); sys.stdout.flush()
'''


def t6_mcp():
    print("[T6] MCP: initialize → tools/list → tools/call")
    from mcp_min import MCPClient
    with tempfile.TemporaryDirectory() as td:
        sp = os.path.join(td, "toy_server.py")
        open(sp, "w", encoding="utf-8").write(TOY_MCP_SERVER)
        cli = MCPClient([sys.executable, sp])
        try:
            info = cli.start()
            tools = cli.tools_list()
            out = cli.call("echo", {"text": "sovereign-alive"})
            ok = (info.get("serverInfo", {}).get("name") == "toy-echo"
                  and any(t["name"] == "echo" for t in tools)
                  and out == "ECHO:sovereign-alive")
            check("full MCP roundtrip", ok,
                  f"server={info.get('serverInfo',{}).get('name')} "
                  f"tools={[t['name'] for t in tools]}")
        except Exception as e:
            check("full MCP roundtrip", False, f"err={e}")
        finally:
            cli.close()


def t8_content_rail():
    print("[T8] content rail: determinism + idempotent anchor + refusal")
    from content_rail import RefusedStage, compile_source, verify_rail
    spec = {"rail": "tech", "slug": "demo-rail", "title": "Demo Rail",
            "summary": "deterministic compile proof",
            "metadata": {"b": 2, "a": 1},
            "sections": [{"heading": "Core",
                          "body": "DECISION: keep the skeleton",
                          "bullets": ["result: PASS",
                                      "receipt: sha256 anchored"],
                          "table": {"headers": ["k", "v"],
                                    "rows": [["tps", 42]]}}]}
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        r1 = compile_source(spec, root)
        r2 = compile_source(spec, root)               # idempotent recompile
        md1 = Path(r1["md_path"]).read_bytes()
        check("deterministic bytes across compiles",
              md1 == Path(r2["md_path"]).read_bytes(), "")
        check("sha256 sidecar matches file",
              hashlib.sha256(md1).hexdigest() == r1["sha256"]
              and Path(Path(r1["md_path"]).parent /
                       (r1["slug"] + ".sha256")).read_text().strip()
              == r1["sha256"], "")
        check("manifest anchor idempotent (append once)",
              r1["manifest_appended"] and not r2["manifest_appended"], "")
        ok, det = verify_rail(root)
        check("MANIFEST chain + staged files verify",
              ok and det["files_checked"] == 1, f"det={det}")
        with tempfile.TemporaryDirectory() as td2:
            r3 = compile_source(spec, Path(td2))       # cross-root determinism
            check("byte-identical across roots",
                  Path(r3["md_path"]).read_bytes() == md1, "")
    bad = dict(spec)
    bad["summary"] = "leak attempt token: sk-abcdefghijklmnop1234567890"
    with tempfile.TemporaryDirectory() as td3:
        try:
            compile_source(bad, Path(td3))
            refused = False
        except RefusedStage:
            refused = True
        rejected = list((Path(td3) / "receipts").glob("REJECTED-*.json"))
        check("secret scan refuses staging + immutable rejection receipt",
              refused and len(rejected) == 1, "")


def t9_health():
    print("[T9] health monitor: snapshot + immutable alert chain")
    import health_monitor
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        srv = ThreadingHTTPServer(
            ("127.0.0.1", 0), make_handler(MockProvider([(200, 0)]), "m-h"))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        cfg = {"timeout_ms": 3000, "warn_ms": 2000, "targets": [
            {"name": "alive-mock",
             "url": f"http://127.0.0.1:{srv.server_port}/v1/models",
             "expect_status": 200},
            {"name": "dead-port", "url": "http://127.0.0.1:9/dead",
             "expect_status": 200}]}
        cfg_path = root / "targets.json"
        cfg_path.write_text(json.dumps(cfg), encoding="utf-8")
        snap = health_monitor.run_once(str(cfg_path), root)
        status_ok = (root / "health" / "status.json").is_file()
        hist = (root / "health" / "history.jsonl").read_text(
            encoding="utf-8").strip().splitlines()
        check("status.json + history.jsonl written",
              status_ok and len(hist) == 1, "")
        dead = next(r for r in snap["results"] if r["name"] == "dead-port")
        check("dead port measured as DOWN (not guessed)",
              dead["verdict"] == "DOWN", dead["detail"])
        alerts = list((root / "receipts").glob("ALERT-*.json"))
        ok_chain, n = MemoryStore(
            str(root / "receipts" / "RECEIPTS.chain")).verify()
        check("immutable alert receipt + receipt chain verifies",
              len(alerts) == 1 and ok_chain and n == 1,
              f"alerts={len(alerts)} chain_n={n}")
        srv.shutdown()


def t10_streamer():
    print("[T10] content streamer: merkle seal + self-healing + cross-lineage")
    from content_streamer import merkle_root, stream
    d1 = hashlib.sha256(b"a").digest()
    d2 = hashlib.sha256(b"b").digest()
    check("merkle convention (parent=sha256(L||R), odd=dup)",
          merkle_root([d1, d2]) == hashlib.sha256(d1 + d2).hexdigest()
          and merkle_root([d1]) == d1.hex()
          and merkle_root([]) == "0" * 64, "")
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        sdir = root / "content" / "sources"
        sdir.mkdir(parents=True)
        for name, slug in (("a.json", "t10a"), ("b.json", "t10b")):
            spec = {"rail": "tech", "slug": slug, "title": slug.upper(),
                    "summary": "stream determinism",
                    "sections": [{"heading": "H", "body": "result: PASS"}]}
            (sdir / name).write_text(json.dumps(spec), encoding="utf-8")
        seal1 = stream(root, hq=None)
        seal2 = stream(root, hq=None)
        check("merkle root deterministic + non-trivial",
              seal2["rails_merkle_root"] == seal1["rails_merkle_root"]
              and seal1["rails_merkle_root"] != "0" * 64,
              seal1["rails_merkle_root"][:16])
        check("seal BROADCAST-READY + manifest chain ok",
              seal1["state"] == "BROADCAST-READY"
              and seal1["manifest_chain"]["ok"], "")
        check("re-stream idempotent (0 compiled, 2 unchanged)",
              seal2["counts"]["compiled_now"] == 0
              and seal2["counts"]["unchanged"] == 2, str(seal2["counts"]))
        check("missing cross-lineage recorded honestly (never faked)",
              seal1["cross_lineage"]["available"] is False, "")
        f = root / seal1["staged_files"][0]["path"]
        f.write_bytes(f.read_bytes() + b"\ntampered\n")
        seal3 = stream(root, hq=None)
        check("tampered deliverable self-heals on re-stream",
              seal3["rails_merkle_root"] == seal1["rails_merkle_root"]
              and seal3["state"] == "BROADCAST-READY", "")


def t11_mem():
    print("[T11] mem profiler: parse + OOM policy + budget composition")
    from mem_profiler import effective_budget, parse_meminfo, policy_for
    mi = parse_meminfo("MemTotal:        4138564 kB\n"
                       "MemAvailable:    2830896 kB\n"
                       "HugePages_Total:       0\n")
    check("meminfo parse (units + zero-values, noise-skip)",
          mi.get("MemTotal") == 4138564
          and mi.get("MemAvailable") == 2830896
          and mi.get("HugePages_Total") == 0, str(mi))
    low = policy_for(400_000, 4_138_564)
    okp = policy_for(2_830_896, 4_138_564)
    check("500MB law: low-mem forces tighter budget",
          low["low_mem"] and low["max_chars"] < 4000
          and low["reason"] == "low_mem_forced", f"budget={low['max_chars']}")
    check("healthy memory keeps base budget",
          not okp["low_mem"] and okp["max_chars"] == 4000,
          f"budget={okp['max_chars']}")
    check("effective budget = min(mem, tps, base)",
          effective_budget({"policy_max_chars": 1500},
                           {"recommended_compaction_max_chars": 2500})
          == 1500
          and effective_budget(None, None) == 4000, "")
    import mem_profiler
    with tempfile.TemporaryDirectory() as td:
        snap = mem_profiler.profile(Path(td))
        check("real /proc measurement written",
              (Path(td) / "health" / "mem.json").is_file()
              and snap["mem_total_mb"] > 0,
              f"{snap['mem_available_mb']}MB free of {snap['mem_total_mb']}MB")


def t12_telemetry():
    print("[T12] telemetry digest: daily freeze + streamer integration")
    from datetime import datetime, timezone
    from telemetry_digest import emit
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        h = root / "health"
        h.mkdir(parents=True)
        (h / "mem.json").write_text(json.dumps(
            {"ts": "T", "cpus": 2, "loadavg": "0.1", "mem_total_mb": 4041.6,
             "mem_available_mb": 2665.2, "state": "OK",
             "policy_max_chars": 4000, "policy_reason": "ok"}),
            encoding="utf-8")
        (h / "status.json").write_text(json.dumps(
            {"ts": "T", "all_ok": False, "results": [
                {"name": "b-witness", "verdict": "OK", "latency_ms": 64},
                {"name": "a-witness", "verdict": "DOWN", "latency_ms": 0}]}),
            encoding="utf-8")
        r1 = emit(root)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        spec = root / "content" / "sources" / f"fleet-telemetry-{today}.json"
        check("emit writes today's frozen spec",
              r1["emitted"] and spec.is_file(), r1.get("reason") or "")
        raw1 = spec.read_bytes()
        r2 = emit(root)
        check("FREEZE law: second emit same day never rewrites",
              r2["emitted"] is False and spec.read_bytes() == raw1
              and r2.get("reason") == "frozen", str(r2))
        check("MINIMAL law: no URLs inside the spec",
              b"url" not in raw1.lower(), "")
        from content_streamer import stream
        seal = stream(root, hq=None)
        check("streamer compiles digest into rails + seal",
              any("telemetry" in f["path"] for f in seal["staged_files"])
              and seal["state"] == "BROADCAST-READY", str(seal["counts"]))
    with tempfile.TemporaryDirectory() as td2:
        r3 = emit(Path(td2))
        empty = not any((Path(td2) / "content" / "sources").glob("*.json")) \
            if (Path(td2) / "content" / "sources").is_dir() else True
        check("missing health files → honest skip, no spec, no crash",
              r3["emitted"] is False and empty, r3.get("reason", ""))


def t13_guard():
    print("[T13] mem guard: tiers + protected core + allowlisted idle-kill")
    from mem_profiler import (classify, guard, parse_stat, read_procs,
                              soft_purge, tier_for)
    check("tier law: OK≥600MB / SOFT<600MB / HARD<400MB",
          tier_for(601 * 1024) == "OK" and tier_for(599 * 1024) == "SOFT"
          and tier_for(399 * 1024) == "HARD", "")
    st = parse_stat(Path("/proc/self/stat").read_text(encoding="utf-8"))
    check("parse_stat on live /proc/self",
          st["state"] in ("R", "S", "D", "Z", "T") and st["ticks"] >= 0
          and st["rss_pages"] > 0, f"state={st['state']}")
    both = {"pid": 1, "comm": "x",
            "cmdline": "sovereign-guard-test-child next-server"}
    only = {"pid": 2, "comm": "x",
            "cmdline": "python3 worker.py sovereign-guard-test-child"}
    neither = {"pid": 3, "comm": "x", "cmdline": "nano /tmp/a"}
    check("protected core ALWAYS beats the allowlist",
          classify(both, ["sovereign-guard-test-child"]) == "protected", "")
    check("allowlist-only match → killable",
          classify(only, ["sovereign-guard-test-child"]) == "killable", "")
    check("no match → other (never killable)",
          classify(neither, ["sovereign-guard-test-child"]) == "other", "")
    check("read_procs sees own pid",
          os.getpid() in {p["pid"] for p in read_procs()}, "")
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        h = root / "health"
        h.mkdir(parents=True)
        (h / "history.jsonl").write_text(
            "\n".join(json.dumps({"i": i}) for i in range(120)) + "\n",
            encoding="utf-8")
        stray = root / "stale.tmp"
        stray.write_text("x", encoding="utf-8")
        act = soft_purge(root)
        lines = (h / "history.jsonl").read_text(encoding="utf-8").splitlines()
        check("SOFT: purge trims history to 50 + removes tmp strays",
              len(lines) == 50 and act["trimmed_history"] == 70
              and act["removed_tmp"] == 1 and not stray.exists(), str(act))
        (root / "guard-allowlist.txt").write_text(
            "# test allowlist\nsovereign-guard-test-child\n",
            encoding="utf-8")
        child = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)",
             "sovereign-guard-test-child"])
        try:
            for _ in range(40):
                if Path(f"/proc/{child.pid}/stat").is_file():
                    break
                time.sleep(0.05)
            time.sleep(0.6)          # let the interpreter settle (startup CPU)
            res = guard(root, 300 * 1024, enforce=False, sample_s=0.3)
            drafts = list((root / "receipts").glob("GUARDDRAFT-*.json"))
            check("HARD dry-run: draft receipt, child untouched",
                  res["tier"] == "HARD" and drafts
                  and child.poll() is None,
                  f"cands={len(res['candidates'])}")
            res2 = guard(root, 300 * 1024, enforce=True, sample_s=0.3)
            child.wait(timeout=8)
            kills = list((root / "receipts").glob("GUARDKILL-*.json"))
            check("HARD enforce: allowlisted idle child SIGTERMed + receipt",
                  child.poll() is not None and kills, f"rc={child.poll()}")
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=5)
    with tempfile.TemporaryDirectory() as td3:
        res3 = guard(Path(td3), 300 * 1024, enforce=True, sample_s=0.1)
        check("shipped default (no allowlist) → zero candidates even in "
              "enforce", res3["candidates"] == []
              and not list((Path(td3) / "receipts").glob("GUARDKILL-*.json")),
              "")


def t14_generation():
    print("[T12] generation lineage: genesis → frozen idempotency → "
          "linear extension → last-record-wins verify")
    from content_rail import verify_rail
    from content_streamer import stream
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        sdir = root / "content" / "sources"
        sdir.mkdir(parents=True)
        spec = {"rail": "tech", "slug": "gen-l", "title": "Gen Law",
                "summary": "linear lineage",
                "sections": [{"heading": "H", "body": "result: PASS"}]}
        (sdir / "a.json").write_text(json.dumps(spec), encoding="utf-8")
        GENESIS = "0" * 64
        seal1 = stream(root, hq=None)
        g1 = seal1["generation"]
        check("first generation is genesis-rooted",
              g1["parent_from"] == "genesis"
              and g1["parent_broadcast_root"] == GENESIS, "")
        md1 = (root / seal1["staged_files"][0]["path"]).read_text()
        check("asset header carries lineage metadata",
              "<!-- sovereign-rail" in md1
              and f"parent_broadcast_root: {GENESIS}" in md1
              and "source_sha256:" in md1, md1[:80])
        seal2 = stream(root, hq=None)
        g2 = seal2["generation"]
        check("re-stream freezes parent (zero churn)",
              g2["parent_from"] == "frozen"
              and g2["parent_broadcast_root"] == GENESIS
              and seal2["rails_merkle_root"] == seal1["rails_merkle_root"]
              and seal2["counts"]["compiled_now"] == 0, str(g2))
        spec["summary"] = "linear lineage EXTENDED"
        (sdir / "a.json").write_text(json.dumps(spec), encoding="utf-8")
        seal3 = stream(root, hq=None)
        g3 = seal3["generation"]
        check("source change extends lineage linearly",
              g3["parent_from"] == "advanced"
              and g3["parent_broadcast_root"] == seal2["rails_merkle_root"]
              and seal3["rails_merkle_root"] != seal2["rails_merkle_root"],
              f"parent={g3['parent_broadcast_root'][:16]}")
        md3 = (root / seal3["staged_files"][0]["path"]).read_text()
        check("new generation header anchors parent root",
              f"parent_broadcast_root: {seal2['rails_merkle_root']}" in md3, "")
        seal4 = stream(root, hq=None)
        check("post-advance re-stream frozen + byte-stable",
              seal4["generation"]["parent_from"] == "frozen"
              and seal4["rails_merkle_root"] == seal3["rails_merkle_root"]
              and seal4["counts"]["compiled_now"] == 0, "")
        ok, det = verify_rail(root)
        check("last-record-wins verify green on superseded lineage",
              ok and det["files_checked"] == 1 and det["superseded"] >= 1
              and not det["bad"], f"det={det}")


def t7_live():
    print("[T7] live lanes probe (informational)")
    r = SovereignRouter()
    alive = r.probe_all()
    local_any = any(alive.get(n) for n in ("litellm-local", "llamacpp-local"))
    free = alive.get("llm7-free", False)
    note = f"probes={alive} local_any={local_any} llm7={free}"
    print(f"  INFO  lanes: {note}")
    RESULTS.append(("T7-info", True, note))


if __name__ == "__main__":
    print("=== SOVEREIGN STACK SELFTEST (zero-trust, this machine, now) ===")
    t1_t2_router()
    t3_compaction()
    t4_consensus()
    t5_memory()
    t6_mcp()
    t7_live()
    t8_content_rail()
    t9_health()
    t10_streamer()
    t11_mem()
    t12_telemetry()
    t13_guard()
    t14_generation()
    fails = [r for r in RESULTS if not r[1] and r[0] != "T7-info"]
    print(f"=== VERDICT: {len(RESULTS) - len(fails) - 1}/{len(RESULTS) - 1} PASS"
          + (f" | FAILURES: {[f[0] for f in fails]}" if fails else " | ALL GREEN"))
    sys.exit(1 if fails else 0)
