#!/usr/bin/env python3
# T8-b v2: discover true repo paths + pull delegation run jobs. Auth header on every call.
import json, os, subprocess, re

OUT = "/home/z/my-project/tmp/t8"

def sh(cmd):
    r = subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr

def pull(path, fn):
    cmd = ('source /home/z/my-project/ghenv.sh && curl -s -H "Authorization: Bearer $GH_TOKEN" '
           '"https://api.github.com/%s" > %s/%s 2>/dev/null' % (path, OUT, fn))
    rc, out, err = sh(cmd)
    n = os.path.getsize(os.path.join(OUT, fn)) if os.path.exists(os.path.join(OUT, fn)) else -1
    return rc, n

for path, fn in [
    ("repos/roshpinacare-sys/steem/git/trees/saos-cockpit?recursive=1", "steem-tree.json"),
    ("repos/roshpinacare-sys/saos-runtime/git/trees/main?recursive=1", "rt-tree.json"),
    ("repos/roshpinacare-sys/saos-runtime/actions/runs/38145384211/jobs", "jobs.json"),
]:
    rc, n = pull(path, fn)
    print("%-12s rc=%s bytes=%s" % (fn, rc, n))
    try:
        d = json.load(open(OUT + "/" + fn))
    except Exception as e:
        print("   parse FAIL:", e, "| head:", open(OUT + "/" + fn).read()[:120])
        continue
    if fn == "jobs.json":
        for job in d.get("jobs", []):
            print("  job %s | %-22s | %s" % (job["id"], job["name"], job["conclusion"]))
            for s in job.get("steps", []):
                print("     %-42s %s" % (s["name"], s["conclusion"]))
    else:
        paths = [p["path"] for p in d.get("tree", [])]
        pat = r"(blurt|evolution|delegation|state/|ledger)" if "steem" in fn else r"(revival|receipt|blurt|evolution|digest)"
        for p in [p for p in paths if re.search(pat, p)][:70]:
            print("  PATH:", p)
        print("  (total paths:", len(paths), ")")
