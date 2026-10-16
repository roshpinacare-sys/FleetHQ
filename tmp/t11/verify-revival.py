#!/usr/bin/env python3
"""Verify E-series revivals on 5 repos + check lighthouse/beacon pulse writers in Sandbox."""
import json, os, urllib.request

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
OUT = "/home/z/my-project/tmp/t11"
REPOS = ["Adsmarket", "saos-agents", "Saosmartwallet", "sovereign-lighthouse", "sovereign-beacon"]

def get(path, accept="application/vnd.github+json"):
    req = urllib.request.Request(API + path)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() or b"{}"

res = {}
for repo in REPOS:
    st_tomb, _ = get(f"/repos/roshpinacare-sys/{repo}/contents/ARCHIVED-NOTICE.md?ref=main")
    st_rev, rb = get(f"/repos/roshpinacare-sys/{repo}/contents/REVIVAL-2026-10-11.md?ref=main", "application/vnd.github.raw")
    st_meta, meta = get(f"/repos/roshpinacare-sys/{repo}")
    res[repo] = {
        "tombstone_gone": st_tomb == 404,
        "revival_present": st_rev == 200,
        "revival_bytes": len(rb) if st_rev == 200 else 0,
        "archived_flag": json.loads(meta).get("archived") if st_meta == 200 else None,
    }

# lighthouse pulse writer in Sandbox workflows?
st, body = get("/repos/roshpinacare-sys/Sandbox/git/trees/main?recursive=1")
tree = json.loads(body)
hits = [t["path"] for t in tree.get("tree", []) if "lighthouse" in t["path"].lower() or "beacon" in t["path"].lower()]
res["_sandbox_lighthouse_refs"] = hits[:25]

# recent Sandbox commits mentioning lighthouse sync
st, body = get("/repos/roshpinacare-sys/Sandbox/commits?per_page=40")
cs = json.loads(body)
res["_sandbox_lighthouse_commits"] = [
    {"sha": c["sha"][:7], "when": c["commit"]["author"]["date"], "msg": c["commit"]["message"].split("\n")[0][:90]}
    for c in cs if "lighthouse" in c["commit"]["message"].lower() or "beacon" in c["commit"]["message"].lower()
][:10]

with open(os.path.join(OUT, "revival-verify.json"), "w") as f:
    json.dump(res, f, indent=1)
print(json.dumps(res, indent=1))
