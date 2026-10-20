#!/usr/bin/env python3
# T9-c: (1) live beat 38149801159 job+log -> delegation verdict from the LOG
# (independent of state-push races); (2) newest blurt receipt verdict.
import hashlib, json, os, subprocess

OUT = "/home/z/my-project/tmp/t9"

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

def get(url, fn, raw=False):
    h = "-H 'Accept: application/vnd.github.raw'" if raw else ""
    sh('source /home/z/my-project/ghenv.sh && curl -sL %s -H "Authorization: Bearer $GH_TOKEN" '
       '"https://api.github.com/%s" > %s/%s 2>/dev/null' % (h, url, OUT, fn))
    p = os.path.join(OUT, fn)
    return os.path.getsize(p) if os.path.exists(p) else -1

# 1) live beat jobs (double fetch for consistency)
for i in (1, 2):
    get("repos/roshpinacare-sys/saos-runtime/actions/runs/38149801159/jobs", "beat-jobs.%d.json" % i)
h1 = hashlib.md5(open(OUT + "/beat-jobs.1.json", "rb").read()).hexdigest()
h2 = hashlib.md5(open(OUT + "/beat-jobs.2.json", "rb").read()).hexdigest()
print("beat-jobs self-consistency:", "MATCH" if h1 == h2 else "MISMATCH", h1[:10])
jobs = json.load(open(OUT + "/beat-jobs.1.json")).get("jobs", [])
for j in jobs:
    print("job %s | %-12s | %s" % (j["id"], j["status"], j["conclusion"]))
    for s in j.get("steps", []):
        if s["name"] in ("Commit state back (FF-only, no force, ever)", "Chain anchor probe (on-chain custody anchor must sit in HEAD lineage)", "Summary (verdicts only — this page is public)"):
            print("   %-52s %s" % (s["name"][:52], s["conclusion"]))

# fetch its log if completed
for j in jobs:
    if j["status"] == "completed":
        n = get("repos/roshpinacare-sys/saos-runtime/actions/jobs/%s/logs" % j["id"], "beat-log.txt")
        print("beat log bytes:", n)
        data = open(OUT + "/beat-log.txt", encoding="utf-8", errors="replace").read()
        for ln in data.splitlines():
            if "CI-HEARTBEAT" in ln:
                print("HB:", ln[:400])
                break
        for ln in data.splitlines():
            if "DELEG" in ln.upper() and "verdict" not in ln:
                pass
        break

# 2) newest blurt receipt: list learning/blurt, take latest
n = get("repos/roshpinacare-sys/saos-runtime/contents/learning/blurt?ref=main", "blurt-dir.json")
print("\nblurt-dir bytes:", n)
try:
    entries = json.load(open(OUT + "/blurt-dir.json"))
    receipts = sorted([e["name"] for e in entries if e["name"].startswith("revival-")])
    print("receipts:", receipts[-4:])
    latest = receipts[-1]
    n2 = get("repos/roshpinacare-sys/saos-runtime/contents/learning/blurt/%s?ref=main" % latest,
             "latest-receipt.json", raw=True)
    print("latest receipt %s bytes=%s" % (latest, n2))
    rc = json.load(open(OUT + "/latest-receipt.json"))
    print(json.dumps(rc, indent=1)[:900])
except Exception as e:
    print("receipt parse FAIL:", e)
