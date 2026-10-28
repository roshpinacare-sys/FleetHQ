#!/usr/bin/env python3
"""Verified runner-state probe: saos-runtime workflow runs + state files.
Writes everything to /tmp/probe_out.json, prints md5 + compact digest only."""
import json, os, urllib.request, hashlib, sys, base64

TOK = os.environ["GH_TOKEN"]
API = "https://api.github.com/repos/roshpinacare-sys/"

def gh(path, accept=None):
    req = urllib.request.Request(API + path)
    req.add_header("Authorization", "Bearer " + TOK)
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def gh2(path, accept=None):
    """double-fetch + md5 compare"""
    a = gh(path, accept)
    b = gh(path, accept)
    ma, mb = hashlib.md5(a).hexdigest(), hashlib.md5(b).hexdigest()
    return a, (ma == mb), ma

out = {}

# 1) workflow runs (double-fetch verified)
runs_raw, ok, md = gh2("saos-runtime/actions/runs?per_page=10")
out["runs_md5_verified"] = ok
if ok:
    d = json.loads(runs_raw)
    out["runs"] = [[r["id"], r["created_at"], r["name"], r["event"], r["status"], r["conclusion"]] for r in d.get("workflow_runs", [])]

# 2) state files from steem@saos-cockpit (raw double-fetch each)
STEEM_FILES = [
    "mini-services/saos-engine/state/delegation-last.json",
    "mini-services/saos-engine/state/army-custody.json",
    "mini-services/saos-engine/state/blurt-arm.json",
    "mini-services/saos-engine/state/blurt-probe-last.json",
]
out["steem_files"] = {}
for p in STEEM_FILES:
    try:
        raw, ok, md = gh2(f"steem/contents/{p}?ref=saos-cockpit", "application/vnd.github.raw")
        entry = {"md5_ok": ok, "md5": md, "size": len(raw)}
        if ok:
            try:
                entry["body"] = json.loads(raw)
            except Exception:
                entry["body_head"] = raw[:400].decode("utf-8", "replace")
        out["steem_files"][p] = entry
    except Exception as e:
        out["steem_files"][p] = {"error": str(e)[:120]}

body = json.dumps(out, indent=1)
with open("/tmp/probe_out.json", "w") as f:
    f.write(body)
print("WROTE /tmp/probe_out.json md5=", hashlib.md5(body.encode()).hexdigest(), "size=", len(body))
