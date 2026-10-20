#!/usr/bin/env python3
# T10 recon2: locate repos (user vs org), silent-fail-proof, file verdicts.
import json, hashlib, os, urllib.request, urllib.error

OUT = "/home/z/my-project/tmp/t10/recon"
API = "https://api.github.com"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")
login = json.load(open(OUT + "/user.1.json"))["login"]

res = {"login": login}

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
                    "md5": hashlib.md5(body).hexdigest()[:8],
                    "scopes": r.headers.get("X-OAuth-Scopes", "")}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "err": e.read().decode()[:120]}
    except Exception as e:
        return {"status": None, "err": str(e)[:120]}

res["user_repos"] = gh("users/%s/repos?per_page=100&sort=pushed" % login, "user-repos.json")
res["org_repos"] = gh("orgs/roshpinacare-sys/repos?per_page=100", "org-repos.json")

def summarize(fn):
    p = os.path.join(OUT, fn)
    if not os.path.exists(p):
        return "MISSING"
    try:
        d = json.load(open(p))
        if isinstance(d, list):
            return [{"n": x["name"], "def": x["default_branch"],
                     "vis": x["visibility"], "pushed": x["pushed_at"]} for x in d]
        return d
    except Exception as e:
        return "parse-fail: %s" % e

res["user_repos_body"] = summarize("user-repos.json")
res["org_repos_body"] = summarize("org-repos.json")

with open(os.path.join(OUT, "recon2.json"), "w") as f:
    json.dump(res, f, indent=1)
print("written recon2.json login=%s user_repos=%s org_repos=%s"
      % (login, res["user_repos"].get("status"), res["org_repos"].get("status")))
