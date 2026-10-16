#!/usr/bin/env python3
# T8-ship2: commit body-bytes law (drip + connector), dispatch dry, report run.
import base64, hashlib, json, subprocess, sys, time

T8 = "/home/z/my-project/tmp/t8"
TRACE = "zai-agent trace t8-body-bytes"

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

def ship(path, local, message):
    b64 = base64.b64encode(open(local, "rb").read()).decode()
    meta = api("GET", "repos/roshpinacare-sys/saos-runtime/contents/%s?ref=main" % path)
    body = {"message": message, "content": b64, "branch": "main"}
    if "sha" in meta:
        body["sha"] = meta["sha"]
    res = api("PUT", "repos/roshpinacare-sys/saos-runtime/contents/%s" % path, body)
    c = res.get("commit", {}).get("sha", "FAIL")
    if c == "FAIL":
        print("SHIP-FAIL", path, str(res)[:200]); sys.exit(1)
    # independent readback
    rb = sh('source /home/z/my-project/ghenv.sh && curl -sL -H "Authorization: Bearer $GH_TOKEN" '
            '-H "Accept: application/vnd.github.raw" '
            '"https://api.github.com/repos/roshpinacare-sys/saos-runtime/contents/%s?ref=main" > %s/.rbx' % (path, T8))
    h1 = hashlib.md5(open(T8 + "/.rbx", "rb").read()).hexdigest()
    h2 = hashlib.md5(open(local, "rb").read()).hexdigest()
    print("shipped %-34s commit=%s readback=%s" % (path, c[:10], "MATCH" if h1 == h2 else "MISMATCH"))
    return c

c1 = ship("scripts/vault-drip.mjs", T8 + "/vault-drip.mjs",
          "vault-drip: judge by DECODED KEY BYTES - blurt authority strings carry broken "
          "base58 checksums (measured: live chk 04e2055c vs computed d4a396b2, bodies "
          "identical); display-string equality lied [%s]" % TRACE)
c2 = ship("scripts/blurt-connector.mjs", T8 + "/blurt-connector.mjs",
          "connector: key-fit on decoded key bodies (same broken-checksum law, "
          "measured 2026-10-11) [%s]" % TRACE)

d = api("POST", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/dispatches",
        {"ref": "main", "inputs": {"mode": "dry"}})
time.sleep(8)
runs = api("GET", "repos/roshpinacare-sys/saos-runtime/actions/workflows/blurt-revival.yml/runs?per_page=1")
for run in runs.get("workflow_runs", []):
    print("run", run["id"], run["status"], run["created_at"])
