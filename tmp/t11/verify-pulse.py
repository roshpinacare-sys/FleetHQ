#!/usr/bin/env python3
"""Wait for pulse runs, then verify state.json lastPulse landed on both repos."""
import json, os, time, urllib.request, urllib.error

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"

def call(path):
    req = urllib.request.Request(API + path)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {}

def raw(repo, path):
    req = urllib.request.Request(f"https://api.github.com/repos/roshpinacare-sys/{repo}/contents/{path}?ref=main")
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github.raw")
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""

res = {"checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
for repo, wf in [("sovereign-lighthouse", "lighthouse-pulse.yml"), ("sovereign-beacon", "beacon-pulse.yml")]:
    entry = {}
    for attempt in range(10):
        st, runs = call(f"/repos/roshpinacare-sys/{repo}/actions/workflows/{wf}/runs?per_page=3")
        rs = runs.get("workflow_runs", [])
        entry["runs"] = [{"status": r["status"], "concl": r["conclusion"], "created": r["created_at"], "id": r["id"]} for r in rs]
        if rs and rs[0]["status"] == "completed":
            break
        time.sleep(25)
    st, b = raw(repo, "state.json")
    if st == 200:
        s = json.loads(b)
        lp = s.get("lastPulse")
        entry["lastPulse"] = {k: lp.get(k) for k in ("at", "treasuryNetSp", "minOperatorSp", "degraded")} if lp else None
        entry["pulses_count"] = len(s.get("pulses", []))
    else:
        entry["state_status"] = st
    res[repo] = entry

with open("tmp/t11/pulse-verify.json", "w") as f:
    json.dump(res, f, indent=1)
print(json.dumps(res, indent=1))
