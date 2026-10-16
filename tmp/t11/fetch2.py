#!/usr/bin/env python3
"""Fetch archive-prep plan + zai-sec scope registration + Domain/FleetHQ tree summaries."""
import json, os, hashlib, urllib.request

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
OUT = "/home/z/my-project/tmp/t11"

def raw(repo, path, ref="main"):
    url = f"{API}/repos/roshpinacare-sys/{repo}/contents/{path}?ref={ref}"
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github.raw")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def save(name, data):
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(data)
    return hashlib.md5(data).hexdigest()

out = {}

# 1. the archive/mute decision plan
st, b = raw("Sandbox", "ops/plans/archive-prep-2026-10-11.md")
out["archive_plan_status"] = st
if st == 200:
    out["archive_plan_md5"] = save("archive-prep.md", b)
    out["archive_plan_bytes"] = len(b)

# 2. find the zai-sec scope registration file: fetch Sandbox tree, look for recent ops files
st, body = urllib.request.urlopen(urllib.request.Request(
    f"{API}/repos/roshpinacare-sys/Sandbox/git/trees/main?recursive=1",
    headers={"Authorization": "Bearer " + TOK})).read(), None
st, body = 200, body if body else urllib.request.urlopen(urllib.request.Request(
    f"{API}/repos/roshpinacare-sys/Sandbox/git/trees/main?recursive=1",
    headers={"Authorization": "Bearer " + TOK})).read()
tree = json.loads(body)
allp = [t["path"] for t in tree.get("tree", [])]
cand = [p for p in allp if "scope" in p.lower() or "1a12af86" in p.lower() or "un-silence" in p.lower() or "unsilence" in p.lower() or "directive" in p.lower()]
out["scope_candidates"] = cand[:30]

# 3. Domain tree: top-level dirs + html files (is the site stale?)
dt = json.load(open(os.path.join(OUT, "Domain-tree.json")))
out["domain_dirs"] = dt["dirs"][:80]
htmls = [p for p in dt["blobs"] if p.endswith((".html", ".htm"))]
out["domain_html_files"] = htmls[:60]
mds = [p for p in dt["blobs"] if p.endswith(".md")]
out["domain_md_count"] = len(mds)

# 4. FleetHQ tree: top-level structure
ft = json.load(open(os.path.join(OUT, "FleetHQ-tree.json")))
out["fleethq_dirs"] = ft["dirs"][:80]

save("fetch2.json", json.dumps(out, indent=1).encode())
print("WROTE fetch2.json")
print("scope candidates:", cand[:20])
