#!/usr/bin/env python3
"""Fetch 15:05Z heartbeat job log, robustly.
1) GET jobs list -> /tmp/jobs15.json (md5 printed)
2) extract heartbeat job id from the FILE with json
3) GET logs with redirect-following via urllib (no auth on cross-host redirect)
4) write /tmp/hb15.log, print md5 + first/last bytes."""
import json, os, urllib.request, hashlib

TOK = os.environ["GH_TOKEN"]
ORG, REPO, RUN = "roshpinacare-sys", "saos-runtime", 38149801159
BASE = f"https://api.github.com/repos/{ORG}/{REPO}"

def gh(path, accept=None):
    req = urllib.request.Request(BASE + path)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("User-Agent", "hb-log-fetcher")
    if accept:
        req.add_header("Accept", accept)
    return req

# step 1
req = gh(f"/actions/runs/{RUN}/jobs")
with urllib.request.urlopen(req, timeout=60) as r:
    jobs_raw = r.read()
open("/tmp/jobs15.json", "wb").write(jobs_raw)
print("jobs.json bytes", len(jobs_raw), "md5", hashlib.md5(jobs_raw).hexdigest())

# step 2
jobs = json.loads(jobs_raw)
hb = None
ids = []
for j in jobs.get("jobs", []):
    ids.append([j.get("id"), j.get("name"), j.get("status"), j.get("conclusion")])
    if j.get("name") == "heartbeat":
        hb = j
print("jobs_table", json.dumps(ids))
if hb is None:
    raise SystemExit("no heartbeat job")

# step 3
jid = int(hb["id"])
log_url = f"https://api.github.com/repos/{ORG}/{REPO}/actions/jobs/{jid}/logs"
req = urllib.request.Request(log_url)
req.add_header("Authorization", "Bearer " + TOK)
req.add_header("User-Agent", "hb-log-fetcher")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirect)
try:
    with opener.open(req, timeout=60) as r:
        log = r.read()
except urllib.error.HTTPError as e:
    if e.code in (301, 302, 303, 307):
        newurl = e.headers["Location"]
        # second hop WITHOUT auth header
        req2 = urllib.request.Request(newurl)
        req2.add_header("User-Agent", "hb-log-fetcher")
        with urllib.request.urlopen(req2, timeout=120) as r:
            log = r.read()
    else:
        raise

open("/tmp/hb15.log", "wb").write(log)
print("log bytes", len(log), "md5", hashlib.md5(log).hexdigest())
