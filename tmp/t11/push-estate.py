#!/usr/bin/env python3
"""Push ESTATE-TRUTH to Sandbox ops/sovereign/ (new file, create-only) + readback verify."""
import json, base64, hashlib, urllib.request, urllib.error, time

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
LOCAL = "tmp/t11/ESTATE-TRUTH-2026-10-11.md"
REPO_PATH = "ops/sovereign/ESTATE-TRUTH-2026-10-11.md"

content = open(LOCAL, "rb").read()
md5_local = hashlib.md5(content).hexdigest()

payload = {
    "message": "estate-truth T11: measured one-organism map + chain verdict (delegation waves real, floors still open) + lighthouse/beacon pulses live [skip ci]",
    "content": base64.b64encode(content).decode(),
    "branch": "main",
}
req = urllib.request.Request(f"{API}/repos/roshpinacare-sys/Sandbox/contents/{REPO_PATH}",
                             data=json.dumps(payload).encode(), method="PUT")
req.add_header("Authorization", "Bearer " + TOK)
req.add_header("Accept", "application/vnd.github+json")
try:
    with urllib.request.urlopen(req, timeout=45) as r:
        d = json.loads(r.read())
    print("PUT status:", 201, "commit:", d["commit"]["sha"][:10])
except urllib.error.HTTPError as e:
    print("PUT FAILED:", e.code, e.read()[:300])
    raise SystemExit(1)

# readback verify (double-fetch)
md5s = []
for i in range(2):
    time.sleep(2)
    r2 = urllib.request.Request(f"{API}/repos/roshpinacare-sys/Sandbox/contents/{REPO_PATH}?ref=main")
    r2.add_header("Authorization", "Bearer " + TOK)
    r2.add_header("Accept", "application/vnd.github.raw")
    with urllib.request.urlopen(r2, timeout=45) as rr:
        b = rr.read()
    md5s.append(hashlib.md5(b).hexdigest())
print("local md5 :", md5_local)
print("readback  :", md5s)
assert md5s[0] == md5s[1] == md5_local, "READBACK MISMATCH"
print("READBACK-MATCH")
