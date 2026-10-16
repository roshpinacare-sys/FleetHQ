#!/usr/bin/env python3
"""Fetch heartbeat job logs for saos-runtime run 38149801159 (15:05Z beat).
Writes to /tmp/hb15.log. Prints only: job id, log size, md5."""
import json, os, urllib.request, hashlib, base64

TOK = os.environ["GH_TOKEN"]
ORG = "roshpinacare-sys"
REPO = "saos-runtime"
RUN = 38149801159

def gh(path):
    req = urllib.request.Request("https://api.github.com" + path)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("User-Agent", "probe-script")
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

jobs = json.loads(gh(f"/repos/{ORG}/{REPO}/actions/runs/{RUN}/jobs"))
target = None
for j in jobs.get("jobs", []):
    if j.get("name") == "heartbeat":
        target = j
        break
if target is None:
    print("NO heartbeat job; jobs:", [j.get("name") for j in jobs.get("jobs", [])])
    raise SystemExit(1)
jid = target["id"]
try:
    log = gh(f"/repos/{ORG}/{REPO}/actions/jobs/{jid}/logs")
except Exception as e:
    print("LOG-FETCH-ERR", str(e)[:200], "job_id", jid)
    raise SystemExit(2)
with open("/tmp/hb15.log", "wb") as f:
    f.write(log)
print("job_id", jid, "log_bytes", len(log), "md5", hashlib.md5(log).hexdigest())
