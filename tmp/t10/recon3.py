#!/usr/bin/env python3
# T10 recon3: saos-runtime specifics - secrets, runs, tree, rail, state.
import json, hashlib, os, urllib.request, urllib.error

OUT = "/home/z/my-project/tmp/t10/recon"
API = "https://api.github.com"
USER = "roshpinacare-sys"
REPO = "saos-runtime"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")
res = {}

def gh(path, fn, accept=None):
    req = urllib.request.Request(API + "/" + path)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if accept:
        req.add_header("Accept", accept)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            with open(os.path.join(OUT, fn), "wb") as f:
                f.write(body)
            return {"status": r.status, "bytes": len(body),
                    "md5": hashlib.md5(body).hexdigest()[:8]}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "err": e.read().decode()[:100]}
    except Exception as e:
        return {"status": None, "err": str(e)[:100]}

res["meta"] = gh("repos/%s/%s" % (USER, REPO), "rt-meta.json")
res["secrets"] = gh("repos/%s/%s/actions/secrets" % (USER, REPO), "rt-secrets.json")
res["runs"] = gh("repos/%s/%s/actions/runs?per_page=12" % (USER, REPO), "rt-runs.json")
res["tree"] = gh("repos/%s/%s/git/trees/main?recursive=1" % (USER, REPO), "rt-tree.json")

try:
    tree = json.load(open(OUT + "/rt-tree.json"))
    paths = [t["path"] for t in tree.get("tree", [])]
    res["tree_paths"] = len(paths)
    hits = [p for p in paths if any(k in p.lower() for k in
            ("pat", "token", "secret", "vault", "passphrase", "gen-1", "cred", "wif"))]
    res["exposure_hits"] = hits
    rail = next((p for p in paths if "delegation-rail" in p), None)
    res["rail_path"] = rail
    wf = [p for p in paths if p.startswith(".github/workflows/")]
    res["workflows"] = wf
    state = [p for p in paths if p.startswith("state/")]
    res["state_files"] = state[:40]
    if rail:
        res["rail_fetch"] = gh("repos/%s/%s/contents/%s?ref=main" % (USER, REPO, rail),
                               "delegation-rail.mjs", accept="application/vnd.github.raw")
    for sp, fn in (("state/delegation-last.json", "delegation-last"),
                   ("state/ci-last-heartbeat.json", "heartbeat")):
        if sp in paths:
            res[fn + "_a"] = gh("repos/%s/%s/contents/%s?ref=main" % (USER, REPO, sp),
                                fn + ".a.json", accept="application/vnd.github.raw")
            res[fn + "_b"] = gh("repos/%s/%s/contents/%s?ref=main" % (USER, REPO, sp),
                                fn + ".b.json", accept="application/vnd.github.raw")
except Exception as e:
    res["tree_err"] = str(e)[:200]

with open(OUT + "/recon3.json", "w") as f:
    json.dump(res, f, indent=1)
print("recon3 written; tree=%s secrets=%s runs=%s rail=%s exposure=%d"
      % (res.get("tree", {}).get("status"), res.get("secrets", {}).get("status"),
         res.get("runs", {}).get("status"), res.get("rail_path"),
         len(res.get("exposure_hits", []))))
