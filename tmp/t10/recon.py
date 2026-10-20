#!/usr/bin/env python3
# T10 recon: GitHub side - identity, compliance, runtime repo, rail source,
# state files, secrets inventory, exposure scan. Double-fetch + md5 stamps.
# Results to files only. Never prints token values.
import json, hashlib, os, urllib.request, urllib.error

OUT = "/home/z/my-project/tmp/t10/recon"
os.makedirs(OUT, exist_ok=True)
API = "https://api.github.com"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")

def gh(path, fn, raw=False, accept=None):
    url = API + "/" + path
    req = urllib.request.Request(url)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if accept or raw:
        req.add_header("Accept", accept or "application/vnd.github.raw")
    st, body = None, None
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            st = r.status
            body = r.read()
            scopes = r.headers.get("X-OAuth-Scopes", "")
    except urllib.error.HTTPError as e:
        st = e.code
        body = e.read()
        scopes = ""
    except Exception as e:
        return {"path": path, "fn": fn, "error": str(e)[:100]}
    p = os.path.join(OUT, fn)
    with open(p, "wb") as f:
        f.write(body)
    return {"path": path, "fn": fn, "status": st, "bytes": len(body),
            "md5": hashlib.md5(body).hexdigest(), "scopes": scopes}

res = []
# identity + scopes (double)
res.append(gh("user", "user.1.json"))
res.append(gh("user", "user.2.json"))
res.append(gh("rate_limit", "rate_limit.json"))
res.append(gh("user/orgs", "orgs.json"))
orgs = json.load(open(os.path.join(OUT, "orgs.json")))
org = orgs[0]["login"] if isinstance(orgs, list) and orgs else None
res.append({"org_detected": org})
if org:
    res.append(gh("orgs/%s/repos?per_page=100" % org, "repos.json"))
    repos = json.load(open(os.path.join(OUT, "repos.json")))
    names = [(r["name"], r["default_branch"], r["visibility"], r["pushed_at"]) for r in repos]
    with open(os.path.join(OUT, "repo-index.json"), "w") as f:
        json.dump(names, f, indent=1)
    # runtime repo = the one with saos in name
    rt = next((r for r in repos if "runtime" in r["name"]), None)
    if rt:
        rn, db = rt["name"], rt["default_branch"]
        res.append(gh("repos/%s/%s" % (org, rn), "rt-meta.json"))
        res.append(gh("repos/%s/%s/actions/secrets" % (org, rn), "rt-secrets.json"))
        res.append(gh("repos/%s/%s/actions/runs?per_page=10" % (org, rn), "rt-runs.json"))
        res.append(gh("repos/%s/%s/git/trees/%s?recursive=1" % (org, rn, db), "rt-tree.json"))
        tree = json.load(open(os.path.join(OUT, "rt-tree.json")))
        paths = [t["path"] for t in tree.get("tree", [])]
        hits = [p for p in paths if any(k in p.lower() for k in
                ("pat", "token", "secret", "vault", "passphrase", "gen-1", "cred"))]
        with open(os.path.join(OUT, "exposure-names.json"), "w") as f:
            json.dump({"total_paths": len(paths), "hits": hits}, f, indent=1)
        # rail source candidates
        rail = next((p for p in paths if "delegation-rail" in p), None)
        res.append({"rail_path": rail})
        if rail:
            res.append(gh("repos/%s/%s/contents/%s?ref=%s" % (org, rn, rail, db),
                          "delegation-rail.mjs", raw=True))
        # state files (double fetch each)
        for sp, fn in (("state/delegation-last.json", "delegation-last"),
                       ("state/ci-last-heartbeat.json", "heartbeat")):
            res.append(gh("repos/%s/%s/contents/%s?ref=%s" % (org, rn, sp, db),
                          fn + ".a.json", raw=True))
            res.append(gh("repos/%s/%s/contents/%s?ref=%s" % (org, rn, sp, db),
                          fn + ".b.json", raw=True))

with open(os.path.join(OUT, "recon-summary.json"), "w") as f:
    json.dump(res, f, indent=1)
for r in res:
    if "error" in r:
        print("ERR  ", r["path"], r["error"])
    else:
        print("%-4s %-70s bytes=%-7s md5=%s" % (r.get("status"), r.get("path", "")[:70],
              r.get("bytes"), (r.get("md5") or "")[:8]))
