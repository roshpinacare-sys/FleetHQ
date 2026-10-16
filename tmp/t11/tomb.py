#!/usr/bin/env python3
"""Check ARCHIVED-NOTICE.md on the 7 tombstoned repos + fetch FleetHQ's."""
import json, os, hashlib, urllib.request

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
OUT = "/home/z/my-project/tmp/t11"
REPOS = ["SovereignConsole", "Adsmarket", "saos-agents", "FleetHQ", "Saosmartwallet", "sovereign-lighthouse", "sovereign-beacon", "sanbox", "saos-dex", "Zip", "saos-control-center"]

def raw_head(repo, path):
    url = f"{API}/repos/roshpinacare-sys/{repo}/contents/{path}?ref=main"
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github.raw")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""

res = {}
for repo in REPOS:
    st, b = raw_head(repo, "ARCHIVED-NOTICE.md")
    res[repo] = {"notice_status": st, "bytes": len(b)}
    if st == 200 and repo == "FleetHQ":
        with open(os.path.join(OUT, "FleetHQ-notice.md"), "wb") as f:
            f.write(b)
        res[repo]["md5"] = hashlib.md5(b).hexdigest()
# also grab saos-agents notice for comparison
st, b = raw_head("saos-agents", "ARCHIVED-NOTICE.md")
if st == 200:
    with open(os.path.join(OUT, "saos-agents-notice.md"), "wb") as f:
        f.write(b)
    res["saos-agents"]["md5"] = hashlib.md5(b).hexdigest()

with open(os.path.join(OUT, "tombstones.json"), "w") as f:
    json.dump(res, f, indent=1)
print(json.dumps(res, indent=1))
