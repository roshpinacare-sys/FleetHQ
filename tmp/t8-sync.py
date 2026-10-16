#!/usr/bin/env python3
# T8 sync: fetch all verdict-relevant raws, save to disk, print compact parse.
import json, os, subprocess, time

OUT = "/home/z/my-project/tmp/t8"
os.makedirs(OUT, exist_ok=True)

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def fetch_raw(repo, path, ref):
    return 'gh_raw %s "%s" %s' % (repo, path, ref)

def fetch_json(path):
    return 'gh_json "%s"' % path

items = [
    # (label, curl-in-ghenv, save-as)
    ("runs",       fetch_json("repos/roshpinacare-sys/saos-runtime/actions/runs?per_page=12"), "runs.json"),
    ("delegation", fetch_raw("steem", "mini-services/saos-engine/state/delegation-last.json", "saos-cockpit"), "delegation-last.json"),
    ("custody",    fetch_raw("steem", "mini-services/saos-engine/state/army-custody.json", "saos-cockpit"), "army-custody.json"),
    ("blurt-arm",  fetch_raw("steem", "mini-services/saos-engine/state/blurt-arm.json", "saos-cockpit"), "blurt-arm.json"),
    ("revival-rcpt", fetch_raw("saos-runtime", "receipts/revival-20261011T135527Z.json", "main"), "revival-rcpt.json"),
    ("blurt-lane", fetch_raw("steem", "mini-services/blurt-lane/blurt-connector.mjs", "saos-cockpit"), "blurt-connector.mjs"),
    ("digest-lane", fetch_raw("steem", "mini-services/evolution-lane/evolution-digest.mjs", "saos-cockpit"), "evolution-digest.mjs"),
]

for label, cmd, fn in items:
    rc, out, err = sh("source /home/z/my-project/ghenv.sh && " + cmd + " > %s/%s 2>%s/%s.err" % (OUT, fn, OUT, fn))
    size = os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1
    print("%-12s rc=%s bytes=%s" % (label, rc, size))

print("---")
# Compact parse of runs
try:
    runs = json.load(open(OUT + "/runs.json"))
    for r in runs.get("workflow_runs", [])[:10]:
        print("run %s | %-28s | %-9s | %-9s | started %s" % (r["id"], r["name"], r["status"], r["conclusion"], r["run_started_at"]))
except Exception as e:
    print("runs parse FAIL:", e)

print("---")
# Delegation verdict
try:
    d = json.load(open(OUT + "/delegation-last.json"))
    print("delegation-last keys:", sorted(d.keys()))
    for k in ("verdict","ts","at","date","runSp","ops","totalSp","budgetSp","reason","gate"):
        if k in d: print("  %s = %s" % (k, d[k]))
except Exception as e:
    print("delegation parse FAIL:", e)

print("---")
try:
    b = json.load(open(OUT + "/blurt-arm.json"))
    print("blurt-arm keys:", sorted(b.keys()))
    for k in ("mode","status","verdict","gates","issued","owner"):
        if k in b: print("  %s = %s" % (k, json.dumps(b[k])[:220]))
except Exception as e:
    print("blurt-arm parse FAIL:", e)
