#!/usr/bin/env python3
# T8-c: pull all evidence for delegation diagnosis + blurt lane. Auth on every call.
import json, os, subprocess

OUT = "/home/z/my-project/tmp/t8"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def pull_rt(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/roshpinacare-sys/saos-runtime/contents/%s" > %s/%s 2>/dev/null' % (path, OUT, fn))
    rc, o, e = sh(cmd)
    return os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1

def pull_steem(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github.raw" '
           '"https://api.github.com/repos/roshpinacare-sys/steem/contents/%s?ref=saos-cockpit" > %s/%s 2>/dev/null' % (path, OUT, fn))
    rc, o, e = sh(cmd)
    return os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1

def pull_url(url, fn):
    cmd = ('curl -sL -H "Authorization: Bearer $(source /home/z/my-project/ghenv.sh; echo $GH_TOKEN)" '
           '"%s" > %s/%s 2>/dev/null' % (url, OUT, fn))
    rc, o, e = sh(cmd)
    return os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1

targets = [
    # label, puller, remote path, local file
    ("revival-1355", pull_rt,  "learning/blurt/revival-20261011T135527Z.json", "revival-135527.json"),
    ("revival-1342", pull_rt,  "learning/blurt/revival-20261011T134213Z.json", "revival-134213.json"),
    ("blurt-nodes",  pull_rt,  "blurt-nodes.json",       "blurt-nodes.json"),
    ("connector",    pull_rt,  "scripts/blurt-connector.mjs", "blurt-connector.mjs"),
    ("evo-digest",   pull_rt,  "scripts/evolution-digest.mjs", "evolution-digest.mjs"),
    ("deleg-rail",   pull_steem, "mini-services/saos-engine/delegation-rail.mjs", "delegation-rail.mjs"),
    ("deleg-ledger", pull_steem, "mini-services/saos-engine/state/delegation-ledger.jsonl", "delegation-ledger.jsonl"),
    ("blurt-judge",  pull_steem, "mini-services/saos-engine/blurt-custody-judge.mjs", "blurt-custody-judge.mjs"),
    ("wf-runtime",   pull_rt,  ".github/workflows/sovereign-runtime.yml", "sovereign-runtime.yml"),
]
for label, fn0, path, fn in targets:
    n = fn0(path, fn)
    print("%-13s bytes=%s" % (label, n))

# heartbeat job logs (zip)
n = pull_url("https://api.github.com/repos/roshpinacare-sys/saos-runtime/actions/jobs/114487531046/logs", "hb-logs.zip")
print("hb-logs.zip    bytes=%s" % n)
