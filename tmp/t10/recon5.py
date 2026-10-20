#!/usr/bin/env python3
# T10 recon5: read parallel-agent state + key rails + exposures (raw).
import json, hashlib, os, urllib.request, urllib.error

OUT = "/home/z/my-project/tmp/t10/recon"
API = "https://api.github.com"
USER = "roshpinacare-sys"
TOKEN = open("/home/z/my-project/upload/pat.env").read().strip().replace("\r", "").replace("\n", "")

def raw(repo, path, fn, ref="main"):
    req = urllib.request.Request(
        "%s/repos/%s/%s/contents/%s?ref=%s" % (API, USER, repo, path, ref))
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Accept", "application/vnd.github.raw")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            with open(os.path.join(OUT, fn), "wb") as f:
                f.write(body)
            return {"status": r.status, "bytes": len(body),
                    "md5": hashlib.md5(body).hexdigest()[:8]}
    except urllib.error.HTTPError as e:
        return {"status": e.code}
    except Exception as e:
        return {"status": None, "err": str(e)[:80]}

res = {}
res["zai2_delegation"] = raw("Sandbox", "ops/agents/zai-code-2/delegation-armed-ready.md", "zai2-delegation.md")
res["gh_token_sh"] = raw("Sandbox", "boot/gh-token.sh", "gh-token.sh")
res["keeper_log"] = raw("Sandbox", "state/keeper.log", "keeper.log")
res["vault_drip"] = raw("saos-runtime", "scripts/vault-drip.mjs", "vault-drip.mjs")
res["treasury_arm"] = raw("Domain", ".github/workflows/treasury-arm.yml", "treasury-arm.yml")
res["steem_repair"] = raw("Domain", ".github/workflows/steem-posting-repair.yml", "steem-posting-repair.yml")
res["rt_secrets_body"] = json.load(open(OUT + "/rt-secrets.json"))
runs = json.load(open(OUT + "/rt-runs.json"))
res["rt_recent_runs"] = [
    {"name": r["name"], "event": r["event"], "status": r["status"],
     "conclusion": r["conclusion"], "created": r["created_at"]}
    for r in runs.get("workflow_runs", [])[:12]]
rl = json.load(open(OUT + "/rate_limit.json"))
res["rate_core"] = {k: rl["resources"]["core"][k] for k in ("limit", "used", "remaining", "reset")}
with open(OUT + "/recon5.json", "w") as f:
    json.dump(res, f, indent=1)
print(json.dumps({k: (v if not isinstance(v, dict) or "status" not in v else v.get("status"))
                  for k, v in res.items()
                  if k not in ("rt_secrets_body", "rt_recent_runs", "rate_core")}, indent=1))
print("rate:", res["rate_core"])
print("secrets:", res["rt_secrets_body"])
print("runs:")
for r in res["rt_recent_runs"]:
    print("  %-24s %-9s %-9s %-9s %s" % (r["name"][:24], r["event"], r["status"], r["conclusion"], r["created"]))
