#!/usr/bin/env python3
# T8-p: commit era-judging drip, dispatch dry, wait, report verdict.
import base64, hashlib, json, os, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
drip = T8 + "/vault-drip.mjs"

def sh(cmd):
    return subprocess.run(["bash", "-lc", cmd], capture_output=True, text=True)

def api(method, url, body=None):
    data = ("-d '%s'" % json.dumps(body)) if body is not None else ""
    r = sh('source /home/z/my-project/ghenv.sh && curl -s -X %s -H "Authorization: Bearer $GH_TOKEN" '
           '-H "Accept: application/vnd.github+json" "https://api.github.com/%s" %s' % (method, url, data))
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"_raw": r.stdout[:200]}

meta = api("GET", "repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs?ref=main")
res = api("PUT", "repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs", {
    "message": ("vault-drip v2: era iteration (GEN-2 then GEN-1-ERA-META, uniform flat shape) + "
                "fixed chainJudge (priv bytes direct - hex round-trip threw Uint8Array-expected) + "
                "wipe between eras [zai-agent trace t8-drip-v2]"),
    "content": base64.b64encode(open(drip, "rb").read()).decode(),
    "sha": meta["sha"], "branch": "main"})
csha = str(res.get("commit", {}).get("sha", "FAIL"))
print("commit:", csha[:12])
if "commit" not in res:
    print(res); sys.exit(1)

rb = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
        '-H "Accept: application/vnd.github.raw" '
        '"https://api.github.com/repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs?ref=main" > %s/.rb4' % T8)
h1 = hashlib.md5(open(T8 + "/.rb4", "rb").read()).hexdigest()
h2 = hashlib.md5(open(drip, "rb").read()).hexdigest()
print("readback", h1[:10], h2[:10], "MATCH" if h1 == h2 else "MISMATCH")

api("POST", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/dispatches",
    {"ref": "main", "inputs": {"mode": "dry"}})
time.sleep(10)
runs = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=1")
rid = runs["workflow_runs"][0]["id"]
print("run", rid)
for i in range(12):
    time.sleep(20)
    j = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/runs/%s/jobs" % rid)
    jobs = j.get("jobs", [])
    if jobs and jobs[0].get("status") == "completed":
        job = jobs[0]
        print("job", job["id"], job["conclusion"])
        for s in job.get("steps", []):
            print("  %-56s %s" % (s["name"], s["conclusion"]))
        break
    print("waiting...", i)
