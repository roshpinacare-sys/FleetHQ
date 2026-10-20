#!/usr/bin/env python3
"""Push pulse workflows to lighthouse + beacon, dispatch them, verify."""
import json, os, hashlib, urllib.request, urllib.error, time

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"

def call(method, path, payload=None, expect=None):
    url = API + path
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

targets = [
    ("sovereign-lighthouse", ".github/workflows/lighthouse-pulse.yml", "tmp/t11/lighthouse-pulse.yml", "lighthouse-pulse.yml"),
    ("sovereign-beacon", ".github/workflows/beacon-pulse.yml", "tmp/t11/beacon-pulse.yml", "beacon-pulse.yml"),
]
res = {}
for repo, path, local, name in targets:
    content = open(local, "rb").read()
    # pre-push syntax gate on the exact bytes
    import subprocess
    p = subprocess.run(["python3", "-c", "import yaml,sys; yaml.safe_load(sys.stdin)"], input=content, capture_output=True)
    assert p.returncode == 0, ("yaml check failed", local, p.stderr[:200])
    payload = {
        "message": "sovereign pulse: self-contained keyless heartbeat (owner directive: alive, never stale) [T11]",
        "content": __import__("base64").b64encode(content).decode(),
        "branch": "main",
    }
    st, body = call("PUT", f"/repos/roshpinacare-sys/{repo}/contents/{path}", payload)
    ok = st in (200, 201)
    res[repo] = {"put_status": st, "bytes": len(content), "md5": hashlib.md5(content).hexdigest()}
    print("PUT", repo, path, st)
    if ok:
        # dispatch
        time.sleep(2)
        st2, _ = call("POST", f"/repos/roshpinacare-sys/{repo}/actions/workflows/{name}/dispatches", {"ref": "main"})
        res[repo]["dispatch_status"] = st2
        print("DISPATCH", repo, st2)

with open("tmp/t11/pulse-push.json", "w") as f:
    json.dump(res, f, indent=1)
print(json.dumps(res, indent=1))
