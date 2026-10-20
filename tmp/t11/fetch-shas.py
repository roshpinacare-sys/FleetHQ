#!/usr/bin/env python3
"""Fetch tombstone shas + last commits for the 5 repos to revive."""
import json, os, urllib.request

TOK = open("/home/z/my-project/upload/pat.env", "rb").read().decode().replace("\r", "").strip()
TOK = "".join(TOK.split())
API = "https://api.github.com"
OUT = "/home/z/my-project/tmp/t11"
REPOS = ["Adsmarket", "saos-agents", "Saosmartwallet", "sovereign-lighthouse", "sovereign-beacon"]

def get(path):
    req = urllib.request.Request(API + path)
    req.add_header("Authorization", "Bearer " + TOK)
    req.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

res = {}
for repo in REPOS:
    st, meta = get(f"/repos/roshpinacare-sys/{repo}/contents/ARCHIVED-NOTICE.md?ref=main")
    entry = {"tombstone_status": st}
    if st == 200:
        entry["tombstone_sha"] = meta["sha"]
        entry["tombstone_bytes"] = meta["size"]
        entry["content"] = meta.get("content", "")
    st2, commits = get(f"/repos/roshpinacare-sys/{repo}/commits?per_page=3")
    if st2 == 200:
        entry["last_commits"] = [{"sha": c["sha"][:8], "when": c["commit"]["author"]["date"], "msg": c["commit"]["message"].split("\n")[0][:100]} for c in commits]
    res[repo] = entry

with open(os.path.join(OUT, "tomb-shas.json"), "w") as f:
    json.dump(res, f, indent=1)
for repo, e in res.items():
    print(repo, e["tombstone_status"], e.get("tombstone_bytes"), "| last:", e.get("last_commits", [{}])[0].get("when"), e.get("last_commits", [{}])[0].get("msg", "")[:60])
