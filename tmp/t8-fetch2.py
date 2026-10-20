#!/usr/bin/env python3
# T8-d: pull signer.mjs, measure.mjs, blurt.mjs, full heartbeat line, workflow env; query live chain authority.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def pull_steem(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/roshpinacare-sys/steem/contents/%s?ref=saos-cockpit" > %s/%s 2>/dev/null' % (path, OUT, fn))
    sh(cmd)
    return os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1

for p, f in [
    ("mini-services/saos-engine/signer.mjs", "signer.mjs"),
    ("mini-services/saos-engine/measure.mjs", "measure.mjs"),
    ("mini-services/saos-engine/blurt.mjs", "blurt.mjs"),
    ("mini-services/saos-engine/ci-cycle.mjs", "ci-cycle.mjs"),
]:
    print("%-12s bytes=%s" % (f, pull_steem(p, f)))

# Full heartbeat line from job log
data = open(OUT + "/hb-logs.zip", "rb").read().decode("utf-8", "replace")
for ln in data.splitlines():
    if "CI-HEARTBEAT" in ln:
        ts, _, rest = ln.partition("CI-HEARTBEAT ")
        # find the step that echoed it: unmask impossible; print raw structure
        print("HB-LINE:", rest[:1200])
