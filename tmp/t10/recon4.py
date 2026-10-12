#!/usr/bin/env python3
# T10 recon4: sweep all repos of user for rail/state/exposure.
import json, hashlib, os, urllib.request, urllib.error

OUT = "/home/z/my-project/tmp/t10/recon"
API = "https://api.github.com"
USER = "roshpinacare-sys"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")

def gh(path, fn=None, accept=None):
    req = urllib.request.Request(API + "/" + path)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if accept:
        req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            if fn:
                with open(os.path.join(OUT, fn), "wb") as f:
                    f.write(body)
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return None, str(e).encode()

repos = json.load(open(OUT + "/user-repos.json"))
index = {}
for r in repos:
    rn, db = r["name"], r["default_branch"]
    st, body = gh("repos/%s/%s/git/trees/%s?recursive=1" % (USER, rn, db))
    if st != 200:
        index[rn] = {"tree_status": st}
        continue
    tree = json.loads(body)
    paths = [t["path"] for t in tree.get("tree", [])]
    index[rn] = {
        "default": db,
        "paths": len(paths),
        "rail": [p for p in paths if "delegation" in p.lower()],
        "state": [p for p in paths if p.startswith("state/") or "/state/" in p][:20],
        "heartbeat": [p for p in paths if "heartbeat" in p.lower() or "ledger" in p.lower()],
        "exposure": [p for p in paths if any(k in p.lower() for k in
                     ("vault", "passphrase", "wif", "gen-1", "pat", "token", "cred"))][:20],
        "workflows": [p for p in paths if p.startswith(".github/workflows/")],
    }
with open(OUT + "/allrepo-index.json", "w") as f:
    json.dump(index, f, indent=1)
for rn, d in index.items():
    if "paths" not in d:
        print("%-22s tree %s" % (rn, d.get("tree_status")))
        continue
    print("== %-22s paths=%d def=%s" % (rn, d["paths"], d["default"]))
    print("   rail:      %s" % (d["rail"] or "-"))
    print("   state:     %s" % (d["state"][:6] or "-"))
    print("   heartbeat: %s" % (d["heartbeat"][:6] or "-"))
    print("   exposure:  %s" % (d["exposure"][:6] or "-"))
    print("   workflows: %s" % (d["workflows"]))
