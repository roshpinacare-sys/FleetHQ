#!/usr/bin/env python3
# T8-h: blurt-revival run 38145096696 — jobs, logs, why the receipt was 0 bytes.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def pull(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '"https://api.github.com/%s" > %s/%s 2>/dev/null' % (path, OUT, fn))
    sh(cmd)
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

n = pull("repos/roshpinacare-sys/saos-runtime/actions/runs/38145096696/jobs", "blurt-jobs.json")
print("blurt-jobs bytes:", n)
jobs = json.load(open(OUT + "/blurt-jobs.json"))
for job in jobs.get("jobs", []):
    print("job", job["id"], job["name"], "->", job["conclusion"])
    for s in job.get("steps", []):
        print("   %-46s %s" % (s["name"], s["conclusion"]))
    if job["conclusion"] in ("success", "failure"):
        pull("repos/roshpinacare-sys/saos-runtime/actions/jobs/%s/logs" % job["id"], "blurt-job.log")

logf = OUT + "/blurt-job.log"
if os.path.exists(logf):
    data = open(logf, "rb").read().decode("utf-8", "replace")
    keys = ("receipt", "REVIVAL", "chain", "CHAIN", "dry", "DRY", "key-fit", "byte-law", "connector", "wif", "error", "Error", "ERR ")
    seen = 0
    for ln in data.splitlines():
        if any(k in ln for k in keys) and seen < 80:
            print(">>", ln[:240])
            seen += 1
