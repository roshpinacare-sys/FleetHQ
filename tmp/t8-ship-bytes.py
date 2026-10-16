#!/usr/bin/env python3
# T8-p: ship body-bytes law (drip + connector), dispatch dry, fetch verdict.
import base64, hashlib, json, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
FILES = [
    ("scripts/vault-drip.mjs", T8 + "/vault-drip.mjs",
     "vault-drip: key-fit judged on DECODED 33-byte key bodies - blurt authority "
     "strings carry broken base58 checksums (measured: live chk 04e2055c vs "
     "computed d4a396b2, bodies byte-identical); display-string equality lied "
     "[zai-agent trace t8-body-bytes]"),
    ("scripts/blurt-connector.mjs", T8 + "/blurt-connector.mjs",
     "blurt-connector: key-fit on decoded key bodies (same broken-checksum law, "
     "measured 2026-10-11) [zai-agent trace t8-body-bytes]"),
]

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

for path, local, msg in FILES:
    b64 = base64.b64encode(open(local, "rb").read()).decode()
    meta = api("GET", "repos/roshpinacare-sys/saos-runtime/contents/%s?ref=main" % path)
    body = {"message": msg, "content": b64, "branch": "main"}
    if "sha" in meta:
        body["sha"] = meta["sha"]
    res = api("PUT", "repos/roshpinacare-sys/saos-runtime/contents/%s" % path, body)
    csha = res.get("commit", {}).get("sha", "FAIL")
    print("commit %s -> %s" % (path.split("/")[-1], csha[:12]))
    rb = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
            '-H "Accept: application/vnd.github.raw" '
            '"https://api.github.com/repos/roshpinacare-sys/saos-runtime/contents/%s?ref=main" > %s/.rbx' % (path, T8))
    h1 = hashlib.md5(open(T8 + "/.rbx", "rb").read()).hexdigest()
    h2 = hashlib.md5(open(local, "rb").read()).hexdigest()
    print("  readback", h1[:10], h2[:10], "MATCH" if h1 == h2 else "MISMATCH")

d = api("POST", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/dispatches",
        {"ref": "main", "inputs": {"mode": "dry"}})
time.sleep(8)
runs = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=1")
for run in runs.get("workflow_runs", []):
    print("run", run["id"], run["status"], run["created_at"])
