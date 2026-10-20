#!/usr/bin/env python3
# T8-i5: pull blurt-ser.mjs and extract its chain id (the chain-proven one).
import os, subprocess

OUT = "/home/z/my-project/tmp/t8"
cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
       '-H "Accept: application/vnd.github.raw" '
       '"https://api.github.com/repos/roshpinacare-sys/steem/contents/mini-services/saos-engine/blurt-ser.mjs?ref=saos-cockpit" '
       '> %s/blurt-ser.mjs 2>/dev/null' % OUT)
subprocess.run(["bash", "-lc", cmd], capture_output=True)
p = OUT + "/blurt-ser.mjs"
n = os.path.getsize(p)
print("blurt-ser.mjs bytes:", n)
src = open(p, encoding="utf-8").read()
for i, ln in enumerate(src.splitlines(), 1):
    low = ln.lower()
    if any(k in low for k in ("chain", "hex", "id", "op", "serialize")) and (
            "chain" in low or "op" in low or "id" in low):
        if len(ln.strip()) and not ln.strip().startswith("*"):
            print("%4d| %s" % (i, ln.strip()[:190]))
