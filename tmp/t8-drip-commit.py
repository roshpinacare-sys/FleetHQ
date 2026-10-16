#!/usr/bin/env python3
# T8-n: commit chain-judging drip + dispatch dry + report.
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

b64 = base64.b64encode(open(drip, "rb").read()).decode()
meta = api("GET", "repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs?ref=main")
res = api("PUT", "repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs", {
    "message": ("vault-drip: CHAIN-JUDGED generation choice - blurt was never re-keyed to GEN-2 "
                "(R267: GEN-1 fits 4/4 live blurt authorities), so generation order alone lies; "
                "the drip now judges every candidate generation against the LIVE blurt posting "
                "authority (saboin, keyless) and emits only the fitting one; wipe before network "
                "judging [zai-agent trace t8-drip-judge]"),
    "content": b64, "sha": meta["sha"], "branch": "main"})
print("commit:", res.get("commit", {}).get("sha", "FAIL")[:12])
if "commit" not in res:
    print(res); sys.exit(1)

rb = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
        '-H "Accept: application/vnd.github.raw" '
        '"https://api.github.com/repos/roshpinacare-sys/saos-runtime/contents/scripts/vault-drip.mjs?ref=main" > %s/.rb3' % T8)
h1 = hashlib.md5(open(T8 + "/.rb3", "rb").read()).hexdigest()
h2 = hashlib.md5(open(drip, "rb").read()).hexdigest()
print("readback", h1[:10], h2[:10], "MATCH" if h1 == h2 else "MISMATCH")

d = api("POST", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/dispatches",
        {"ref": "main", "inputs": {"mode": "dry"}})
time.sleep(8)
runs = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=1")
for run in runs.get("workflow_runs", []):
    print("run", run["id"], run["status"], run["created_at"])
