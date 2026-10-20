#!/usr/bin/env python3
"""T11 recon: muted folders, office/domain state, latest runs. Channel-safe: all output to files."""
import json, os, time, hashlib, urllib.request

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
OUT = "/home/z/my-project/tmp/t11"
os.makedirs(OUT, exist_ok=True)

def call(path, expect=200):
    url = API + path
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            body = r.read()
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def save(name, data):
    p = os.path.join(OUT, name)
    with open(p, "wb") as f:
        f.write(data)
    return hashlib.md5(data).hexdigest()

summary = {}
REPOS = ["Domain", "FleetHQ", "Sandbox", "Console", "saos-runtime"]
MARKERS = ("muted", "mute", "archive", "dormant", "quarantine", "silenc", "silent", "parked", "attic", "legacy", "disabled", "frozen", "sealed-off")

for repo in REPOS:
    entry = {}
    # tree
    st, body = call(f"/repos/roshpinacare-sys/{repo}/git/trees/main?recursive=1")
    if st == 200:
        tree = json.loads(body)
        paths = [t["path"] for t in tree.get("tree", []) if t.get("type") == "tree"]
        blobs = [t["path"] for t in tree.get("tree", []) if t.get("type") == "blob"]
        save(f"{repo}-tree.json", json.dumps({"dirs": paths, "blobs": blobs}, indent=1).encode())
        entry["n_dirs"] = len(paths)
        entry["n_blobs"] = len(blobs)
        entry["truncated"] = tree.get("truncated", False)
        low = [p for p in (paths + blobs) if any(m in p.lower() for m in MARKERS)]
        entry["marker_paths"] = low[:60]
    else:
        entry["tree_status"] = st
    # commits
    st, body = call(f"/repos/roshpinacare-sys/{repo}/commits?per_page=20")
    if st == 200:
        cs = json.loads(body)
        entry["commits"] = [
            {"sha": c["sha"][:8], "when": c["commit"]["author"]["date"], "msg": c["commit"]["message"].split("\n")[0][:110]}
            for c in cs
        ]
    else:
        entry["commits_status"] = st
    summary[repo] = entry

# Pages config for Domain + FleetHQ (the online domain page question)
pages = {}
for repo in ["Domain", "FleetHQ", "Sandbox", "Console"]:
    st, body = call(f"/repos/roshpinacare-sys/{repo}/pages")
    if st == 200:
        p = json.loads(body)
        pages[repo] = {"status": p.get("status"), "cname": p.get("cname"), "html_url": p.get("html_url"), "build_type": p.get("build_type"), "source": p.get("source")}
    else:
        pages[repo] = {"status_code": st}
save("pages.json", json.dumps(pages, indent=1).encode())

# Latest workflow runs: Domain + saos-runtime (delegation verdict lives here)
runs = {}
for repo in ["Domain", "saos-runtime"]:
    st, body = call(f"/repos/roshpinacare-sys/{repo}/actions/runs?per_page=12")
    if st == 200:
        rs = json.loads(body)
        runs[repo] = [
            {"name": r.get("name"), "wf": r.get("path"), "status": r.get("status"), "concl": r.get("conclusion"), "created": r.get("created_at"), "id": r.get("id")}
            for r in rs.get("workflow_runs", [])
        ]
    else:
        runs[repo] = {"status_code": st}
save("runs.json", json.dumps(runs, indent=1).encode())

save("recon-summary.json", json.dumps(summary, indent=1).encode())
print("WROTE", sorted(os.listdir(OUT)))
